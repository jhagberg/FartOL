#!/usr/bin/env node
// Authored for fartol. Not ported from upstream.
//
// Binary entrypoint — `fartol`. Parses argv, builds the Fastify server via
// buildServer(), and awaits app.listen({ host, port }). SIGINT closes the
// app cleanly and exits 0. Uncaught exceptions and unhandled promise
// rejections log to stderr and exit 1 (RESEARCH Pitfall 9).
//
// Plan 06 extension: the bin now owns the SI bridge lifecycle.
//   - On boot (unless --no-bridge), open the SerialTransport at --serial-path
//     (default /dev/ttyUSB0), construct a SiMainStation, and call
//     attachBridge(station, {...}). The bridge subscribes the 5-event listener
//     set; events flow into the events table via insertEvent.
//   - getActiveCompetitionId reads `app.activeCompetitionId` on every event
//     (no cached copy — operator toggles via /api/sessions/active-competition).
//   - On open failure / spontaneous close, retry on the 250ms/500ms/1s/2s/5s
//     backoff schedule (RESEARCH Pitfall 4 — serialport EBUSY). After 5
//     consecutive failures the bridge bails and the operator can re-trigger
//     via POST /api/sessions/reconnect-bridge (the bin exposes this via the
//     `app.reconnectBridge` decoration).
//   - The route exposing reconnect-bridge already returns 503 when
//     reconnectBridge is undefined — tests and --no-bridge boots stay clean.
//
// Pattern S-7: `parseArgs` + `main` are exported so unit tests can exercise
// them without booting the listener. The `isEntrypoint` guard at the bottom
// is the only place that calls main(); tests import parseArgs directly.
//
// Threat register T-WS-FAN-OUT: --bind-host defaults to 127.0.0.1. The argv
// parser refuses 0.0.0.0 unless --allow-lan is ALSO present.

import type { FastifyInstance } from 'fastify';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';

import { buildServer } from '../server.ts';
import { openDatabase } from '../db/index.ts';
import { ensureNodeId } from '../db/node-id.ts';
import type { DbHandle } from '../db/index.ts';
import { SerialTransport, SiMainStation } from '@fartol/sportident';
import { attachBridge } from '../si/bridge.ts';
import type { AttachedBridge } from '../si/bridge.ts';
import { config } from '../db/schema.ts';

export interface CliOpts {
  port: number;
  bindHost: string;
  dbPath: string;
  allowLan: boolean;
  noBridge: boolean;
  serialPath: string;
  competitionId: string | null;
}

const HELP = `fartol: FartOL edge bridge (Fastify HTTP/WS + SQLite event log + SI bridge).

Usage:
  fartol [options]

Options:
  --port <int>             HTTP port (default 3000)
  --bind-host <host>       Listen host (default 127.0.0.1). Use of 0.0.0.0
                           or any non-loopback address requires --allow-lan
                           as a guard against accidental LAN exposure.
  --db-path <path>         SQLite database path (default ./fartol.db).
  --serial-path <path>     SerialPort device path (default /dev/ttyUSB0).
                           Ignored when --no-bridge is set.
  --no-bridge              Skip SI bridge attach. Useful for offline tests,
                           UI dev, and CI where /dev/ttyUSB0 is unavailable.
  --competition-id <id>    Set the bridge's active competition at boot.
                           Equivalent to POST /api/sessions/active-competition
                           after listen. Overrides whatever the config table
                           had persisted from a prior run.
  --allow-lan              Permit non-loopback --bind-host values.
  --help, -h               Show this help.
`;

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost', '0']);

function isLoopback(host: string): boolean {
  if (LOOPBACK_HOSTS.has(host)) return host !== '0';
  if (host.startsWith('127.')) return true;
  return false;
}

export function parseArgs(argv: string[]): CliOpts {
  const opts: CliOpts = {
    port: 3000,
    bindHost: '127.0.0.1',
    dbPath: './fartol.db',
    allowLan: false,
    noBridge: false,
    serialPath: '/dev/ttyUSB0',
    competitionId: null,
  };

  const valueFor = (
    flag: string,
    raw: string,
    index: number
  ): { value: string; consumed: number } => {
    if (raw.startsWith(`${flag}=`)) {
      const value = raw.slice(flag.length + 1);
      if (value.length === 0) throw new Error(`${flag} requires a value`);
      return { value, consumed: 0 };
    }
    const next = argv[index + 1];
    if (next === undefined || next.startsWith('-')) throw new Error(`${flag} requires a value`);
    return { value: next, consumed: 1 };
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (a === '--port' || a.startsWith('--port=')) {
      const { value, consumed } = valueFor('--port', a, i);
      const parsed = Number.parseInt(value, 10);
      if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) {
        throw new Error(`--port must be an integer in 1..65535 (got: ${value})`);
      }
      opts.port = parsed;
      i += consumed;
    } else if (a === '--bind-host' || a.startsWith('--bind-host=')) {
      const { value, consumed } = valueFor('--bind-host', a, i);
      opts.bindHost = value;
      i += consumed;
    } else if (a === '--db-path' || a.startsWith('--db-path=')) {
      const { value, consumed } = valueFor('--db-path', a, i);
      opts.dbPath = value;
      i += consumed;
    } else if (a === '--serial-path' || a.startsWith('--serial-path=')) {
      const { value, consumed } = valueFor('--serial-path', a, i);
      opts.serialPath = value;
      i += consumed;
    } else if (a === '--no-bridge') {
      opts.noBridge = true;
    } else if (a === '--competition-id' || a.startsWith('--competition-id=')) {
      const { value, consumed } = valueFor('--competition-id', a, i);
      opts.competitionId = value;
      i += consumed;
    } else if (a === '--allow-lan') {
      opts.allowLan = true;
    } else if (a === '--help' || a === '-h') {
      process.stdout.write(HELP);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }

  if (!isLoopback(opts.bindHost) && !opts.allowLan) {
    throw new Error(
      `--bind-host '${opts.bindHost}' would expose the bridge to the LAN. ` +
        `Re-run with --allow-lan if that is intentional.`
    );
  }

  return opts;
}

/** Reconnect backoff schedule (RESEARCH Pitfall 4 — serialport EBUSY). */
const BACKOFF_MS = [250, 500, 1000, 2000, 5000] as const;

/** Lifecycle manager for the SI bridge. Owns the current SerialTransport +
 * SiMainStation + AttachedBridge. Reconnect runs the backoff chain; bail
 * after BACKOFF_MS.length consecutive failures (operator can re-arm via
 * POST /api/sessions/reconnect-bridge). */
class BridgeLifecycle {
  private transport: SerialTransport | null = null;
  private station: SiMainStation | null = null;
  private attached: AttachedBridge | null = null;
  private shutdownRequested = false;
  private attempt = 0;
  private readonly app: FastifyInstance;
  private readonly handle: DbHandle;
  private readonly nodeId: string;
  private readonly serialPath: string;

  constructor(app: FastifyInstance, handle: DbHandle, nodeId: string, serialPath: string) {
    this.app = app;
    this.handle = handle;
    this.nodeId = nodeId;
    this.serialPath = serialPath;
  }

  async start(): Promise<void> {
    this.shutdownRequested = false;
    await this.openAttempt();
  }

  private async openAttempt(): Promise<void> {
    if (this.shutdownRequested) return;
    try {
      const transport = new SerialTransport({ path: this.serialPath, baudRate: 38400 });
      const station = new SiMainStation(transport);
      const attached = attachBridge(station, {
        handle: this.handle,
        nodeId: this.nodeId,
        getActiveCompetitionId: () => this.app.activeCompetitionId,
        broadcast: (channel, envelope) => this.app.wsBroadcast(channel, envelope),
        // Plan 08: bridge marks the projection dirty after relevant events so
        // the WS results channel + REST GET /api/competitions/:id/results
        // re-derive within the debounce window. Skipped when no active
        // competition is set (B-2 contract).
        projectionStore: this.app.projectionStore,
      });
      // Wire reconnect on spontaneous close.
      station.on('connectionChanged', (state) => {
        if (state === 'closed' || state === 'error') {
          if (!this.shutdownRequested) this.scheduleReconnect();
        }
      });
      await transport.open();
      this.transport = transport;
      this.station = station;
      this.attached = attached;
      this.attempt = 0;
      // Drive the handshake — this also emits connectionChanged:open via the
      // station's readCards() path.
      await station.readCards();
    } catch (err) {
      this.app.log.warn({ err: errMsg(err) }, 'SI bridge open failed');
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.shutdownRequested) return;
    if (this.attempt >= BACKOFF_MS.length) {
      this.app.log.error(
        'SI bridge reconnect exhausted — operator can POST /api/sessions/reconnect-bridge'
      );
      return;
    }
    const delay = BACKOFF_MS[this.attempt]!;
    this.attempt++;
    this.app.log.info({ delay, attempt: this.attempt }, 'scheduling SI bridge reconnect');
    setTimeout(() => {
      // Tear down any half-attached state before retrying.
      void this.teardownCurrent().then(() => this.openAttempt());
    }, delay);
  }

  async reconnectNow(): Promise<void> {
    this.attempt = 0;
    await this.teardownCurrent();
    await this.openAttempt();
  }

  async stop(): Promise<void> {
    this.shutdownRequested = true;
    await this.teardownCurrent();
  }

  private async teardownCurrent(): Promise<void> {
    if (this.attached) {
      try {
        this.attached.detach();
      } catch {
        /* best-effort */
      }
      this.attached = null;
    }
    if (this.station) {
      try {
        await this.station.close();
      } catch {
        /* best-effort */
      }
      this.station = null;
    }
    this.transport = null;
  }
}

function errMsg(err: unknown): string {
  return err instanceof Error ? (err.stack ?? err.message) : String(err);
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const opts = parseArgs(argv);

  const dbPath = process.env['FARTOL_DB_PATH'] ?? opts.dbPath;
  const handle: DbHandle = openDatabase(dbPath);
  const nodeId = process.env['FARTOL_NODE_ID'] ?? ensureNodeId(handle);

  const app: FastifyInstance = await buildServer({
    logger: true,
    dbHandle: handle,
    nodeId,
  });

  // Optional CLI override for the active competition. Routes/sessions.ts
  // already restored from the config table during register, so we only
  // overwrite if the operator passed --competition-id.
  if (opts.competitionId !== null) {
    app.activeCompetitionId = opts.competitionId;
    // Persist so the next restart honours the override.
    handle.db
      .insert(config)
      .values({ key: 'active_competition_id', value: opts.competitionId })
      .onConflictDoUpdate({
        target: config.key,
        set: { value: opts.competitionId },
      })
      .run();
  }

  let lifecycle: BridgeLifecycle | null = null;
  if (!opts.noBridge) {
    lifecycle = new BridgeLifecycle(app, handle, nodeId, opts.serialPath);
    app.reconnectBridge = () => lifecycle!.reconnectNow();
    // Kick off the first open in the background — listen returns first so
    // /api/health responds even if /dev/ttyUSB0 takes time to enumerate.
    void lifecycle.start();
  }

  const shutdown = async (code: number): Promise<void> => {
    try {
      if (lifecycle) await lifecycle.stop();
    } catch {
      /* best-effort */
    }
    try {
      await app.close();
    } catch {
      /* best-effort */
    }
    try {
      handle.close();
    } catch {
      /* best-effort — db may already be closed */
    }
    process.exit(code);
  };

  process.on('SIGINT', () => {
    void shutdown(0);
  });

  process.on('uncaughtException', (err: Error) => {
    process.stderr.write(`uncaughtException: ${errMsg(err)}\n`);
    void shutdown(1);
  });

  process.on('unhandledRejection', (reason: unknown) => {
    process.stderr.write(`unhandledRejection: ${errMsg(reason)}\n`);
    void shutdown(1);
  });

  await app.listen({ port: opts.port, host: opts.bindHost });
}

const isEntrypoint = ((): boolean => {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
})();

if (isEntrypoint)
  main().catch((err: unknown) => {
    process.stderr.write(`fatal: ${errMsg(err)}\n`);
    process.exit(1);
  });

#!/usr/bin/env node
// Authored for fartol. Not ported from upstream.
//
// Binary entrypoint — `fartol`. Parses argv, builds the Fastify server via
// buildServer(), and awaits app.listen({ host, port }). SIGINT closes the
// app cleanly and exits 0. Uncaught exceptions and unhandled promise
// rejections log to stderr and exit 1 (RESEARCH Pitfall 9).
//
// Pattern S-7: `parseArgs` and `main` are exported so unit tests can
// exercise them without booting the listener. The `isEntrypoint` guard
// at the bottom is the only place that calls main(); tests import
// parseArgs directly.
//
// Threat register T-WS-FAN-OUT: --bind-host defaults to 127.0.0.1. The
// argv parser refuses to accept --bind-host 0.0.0.0 unless --allow-lan
// is ALSO present, so a stray `fartol --bind-host 0.0.0.0` cannot expose
// the bridge to the LAN by accident.

import type { FastifyInstance } from 'fastify';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';

import { buildServer } from '../server.ts';

export interface CliOpts {
  port: number;
  bindHost: string;
  dbPath: string;
  allowLan: boolean;
}

const HELP = `fartol: FartOL edge bridge (Fastify HTTP/WS + SQLite event log).

Usage:
  fartol [options]

Options:
  --port <int>             HTTP port (default 3000)
  --bind-host <host>       Listen host (default 127.0.0.1). Use of 0.0.0.0
                           or any non-loopback address requires --allow-lan
                           as a guard against accidental LAN exposure.
  --db-path <path>         SQLite database path (default ./fartol.db). The
                           DB itself lands in plan 02; this flag is parsed
                           now so the bin signature stays stable.
  --allow-lan              Permit non-loopback --bind-host values. Required
                           when --bind-host is 0.0.0.0 or any IP not in the
                           127.0.0.0/8 / ::1 / localhost set.
  --help, -h               Show this help.
`;

const LOOPBACK_HOSTS = new Set([
  '127.0.0.1',
  '::1',
  'localhost',
  '0', // ipv4 shorthand for 0.0.0.0 — also LAN-exposing
]);

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
    } else if (a === '--allow-lan') {
      opts.allowLan = true;
    } else if (a === '--help' || a === '-h') {
      process.stdout.write(HELP);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }

  // T-WS-FAN-OUT gate: non-loopback bind requires explicit --allow-lan.
  if (!isLoopback(opts.bindHost) && !opts.allowLan) {
    throw new Error(
      `--bind-host '${opts.bindHost}' would expose the bridge to the LAN. ` +
        `Re-run with --allow-lan if that is intentional.`
    );
  }

  return opts;
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const opts = parseArgs(argv);
  const app: FastifyInstance = await buildServer({ logger: true });

  const shutdown = async (code: number): Promise<void> => {
    try {
      await app.close();
    } catch {
      // best-effort
    }
    process.exit(code);
  };

  process.on('SIGINT', () => {
    void shutdown(0);
  });

  process.on('uncaughtException', (err: Error) => {
    process.stderr.write(`uncaughtException: ${err.stack ?? err.message}\n`);
    void shutdown(1);
  });

  process.on('unhandledRejection', (reason: unknown) => {
    const message = reason instanceof Error ? (reason.stack ?? reason.message) : String(reason);
    process.stderr.write(`unhandledRejection: ${message}\n`);
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
    const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
    process.stderr.write(`fatal: ${message}\n`);
    process.exit(1);
  });

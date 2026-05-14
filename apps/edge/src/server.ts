// Authored for fartol. Not ported from upstream.
//
// Fastify bootstrap for the FartOL edge bridge. Registers @fastify/cors,
// @fastify/sensible, the WS plugin (when a dbHandle is provided), the
// health route, and the dev routes (when both a dbHandle AND FARTOL_DEV=1
// are set — registration itself is a no-op in production builds).
// Installs a setNotFoundHandler that returns { error: 'Not found' } for
// any unrecognised path. Full SPA fallback (@fastify/static + 200.html)
// lands in plan 11 once apps/web/build/ exists at install time.
//
// Plan 03 extension: accepts opts.dbHandle + opts.nodeId so the factory
// can decorate the FastifyInstance for the WS plugin + dev routes.
// opts.printerSink defaults to createStdoutPrinterSink() when omitted
// (the walking-skeleton "thermal" path that writes JSON lines to stdout).
//
// Binds 127.0.0.1 only by default — the bin's argv parser owns the
// LAN-exposure gate (T-WS-FAN-OUT mitigation in the threat register).
// CORS allow-list mirrors the bind host: localhost loopback only in plan
// 01 (T-CORS mitigation); plan 03 keeps the same allow-list because the
// SvelteKit dev server runs on the same loopback origin (port 5173).
//
// Pattern S-7: this module exports `buildServer()` as a pure factory — it
// does NOT call .listen(). The bin (src/bin/fartol.ts) is the only place
// that opens a listening socket, which lets unit tests inject fastify via
// app.inject() without consuming a port.

import fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';

import { registerHealthRoute } from './routes/health.ts';
import registerDevRoutes from './routes/dev.ts';
import registerCompetitions from './routes/competitions.ts';
import registerClasses from './routes/classes.ts';
import registerCourses from './routes/courses.ts';
import registerCompetitors from './routes/competitors.ts';
import registerClubs from './routes/clubs.ts';
import registerImportRoutes from './routes/import.ts';
import registerCompetitionsFromWizard from './routes/competitionsFromWizard.ts';
import registerSessionsRoutes from './routes/sessions.ts';
import registerResultsRoute from './routes/results.ts';
import registerReadoutRoute from './routes/readout.ts';
import registerManualRoutes from './routes/manual.ts';
import registerPrintRoute from './routes/print.ts';
import wsPlugin from './ws/index.ts';
import type { DbHandle } from './db/index.ts';
import type { PrinterSink } from './print/sink.ts';
import { createStdoutPrinterSink } from './print/stdout-sink.ts';
import type { ChannelName } from '@fartol/shared-types';
import { nextLocalSeq as defaultNextLocalSeq } from './db/seq.ts';
import { createProjectionStore, type ProjectionStore } from './projection/store.ts';

/** Broadcast sink — PATTERNS S-2. Plan 04 wires this as an OPTIONAL spy that
 * lets tests record wsBroadcast invocations without standing up a real WS
 * client. When omitted (production / walking-skeleton), wsBroadcast falls
 * through to the @fastify/websocket plugin's fan-out registered by wsPlugin. */
export interface BroadcastSink {
  record: (
    channel: ChannelName,
    envelope: { type: string; payload: unknown; seq?: number }
  ) => void;
}

/** local_seq generator injection — PATTERNS S-2. Defaults to the real
 * nextLocalSeq trailing-edge SELECT. Plan 04 test 9 (transaction atomicity)
 * injects a throwing fn to verify the competitor + events insert rollback
 * is a single atomic unit. */
export type NextLocalSeqFn = (handle: DbHandle, nodeId: string) => number;

export interface BuildServerOpts {
  /** Pass `false` to silence the Fastify pino logger (tests). Defaults to true. */
  logger?: boolean;
  /** Opened SQLite handle (plan 02 openDatabase). When omitted, only the
   * legacy plan-01 routes are wired; the WS plugin + dev routes are
   * skipped. Tests that exercise WS / dev MUST pass a handle. */
  dbHandle?: DbHandle;
  /** Stable per-install node id (plan 02 ensureNodeId). Required when
   * dbHandle is set. */
  nodeId?: string;
  /** Printer sink injection (PATTERNS S-2). Defaults to the stdout sink
   * for walking-skeleton + tests; production swaps in the ESC/POS driver
   * (plan 15). */
  printerSink?: PrinterSink;
  /** Broadcast sink (PATTERNS S-2). When set, wsBroadcast ALSO calls
   * `record(channel, envelope)` after the real fan-out — tests use this to
   * assert which envelopes were emitted without standing up a WS client. */
  broadcastSink?: BroadcastSink;
  /** local_seq generator injection (PATTERNS S-2). Defaults to the real
   * trailing-edge SELECT (db/seq.ts). Plan 04 test 9 swaps in a throwing
   * fn to verify transactional atomicity. */
  nextLocalSeqFn?: NextLocalSeqFn;
  /** Plan 08 — projection-store debounce window. Tests inject 0 for
   * synchronous markDirty → recompute → broadcast assertions. */
  projectionDebounceMs?: number;
}

export async function buildServer(opts: BuildServerOpts = {}): Promise<FastifyInstance> {
  const app = fastify({
    logger: opts.logger ?? true,
  });

  await app.register(sensible);

  // Localhost-loopback-only CORS — Phase 1 plan 01 has no LAN clients.
  // Plan 03 keeps the same allow-list because the SvelteKit dev server
  // runs on the same loopback origin (port 5173).
  await app.register(cors, {
    origin: [/^http:\/\/127\.0\.0\.1(:\d+)?$/, /^http:\/\/localhost(:\d+)?$/],
  });

  // Decorate the FastifyInstance BEFORE wsPlugin / dev routes register.
  // Both rely on app.fartolDb / app.fartolNodeId being present and the
  // dev routes additionally rely on app.printerSink + app.wsBroadcast.
  if (opts.dbHandle) {
    if (!opts.nodeId) {
      throw new Error('buildServer: nodeId is required when dbHandle is provided');
    }
    app.decorate('fartolDb', opts.dbHandle);
    app.decorate('fartolNodeId', opts.nodeId);
    app.decorate('printerSink', opts.printerSink ?? createStdoutPrinterSink());
    app.decorate('fartolNextLocalSeq', opts.nextLocalSeqFn ?? defaultNextLocalSeq);

    await app.register(wsPlugin);

    // PATTERNS S-2 broadcast sink: wrap the decorated wsBroadcast so the
    // recording sink (when set) fires alongside the real fan-out. Tests
    // assert on the sink; production never sees the wrapper because
    // broadcastSink is undefined by default.
    if (opts.broadcastSink) {
      const realBroadcast = app.wsBroadcast.bind(app);
      const sink = opts.broadcastSink;
      const wrapped: typeof app.wsBroadcast = (channel, envelope) => {
        realBroadcast(channel, envelope);
        sink.record(channel, envelope);
      };
      // Re-decorate: Fastify forbids overwriting a decorator, so we mutate
      // the existing slot directly. `as unknown as ...` to satisfy TS.
      (app as unknown as { wsBroadcast: typeof wrapped }).wsBroadcast = wrapped;
    }

    // Plan 08: construct the projection store AFTER wsPlugin so the store
    // can route broadcasts through the (possibly sink-wrapped) wsBroadcast.
    // The store is the IO layer wrapping plan 07's pure reducer; it owns
    // the cache + debounced recompute and only re-reads SQLite on
    // markDirty. Dispose via Fastify's onClose so pending timers are
    // cleared when the app shuts down.
    const projectionStore = createProjectionStore({
      handle: opts.dbHandle,
      broadcast: (channel, envelope) => app.wsBroadcast(channel, envelope),
      ...(opts.projectionDebounceMs !== undefined ? { debounceMs: opts.projectionDebounceMs } : {}),
    });
    app.decorate('projectionStore', projectionStore);
    app.addHook('onClose', async () => {
      projectionStore.dispose();
    });

    await app.register(registerCompetitions);
    await app.register(registerClasses);
    await app.register(registerCourses);
    await app.register(registerCompetitors);
    await app.register(registerClubs);
    await app.register(registerImportRoutes);
    await app.register(registerCompetitionsFromWizard);
    // Sessions registers BEFORE dev routes so dev.ts can read
    // app.activeCompetitionId on first request (the route module itself
    // restores from the config table during register).
    await app.register(registerSessionsRoutes);
    await app.register(registerResultsRoute);
    await app.register(registerReadoutRoute);
    await app.register(registerManualRoutes);
    await app.register(registerPrintRoute);
    await app.register(registerDevRoutes);
  }

  await registerHealthRoute(app);

  app.setNotFoundHandler((_request, reply) => {
    void reply.code(404).send({ error: 'Not found' });
  });

  return app;
}

// Module augmentation for printerSink + fartolNextLocalSeq. wsPlugin already
// augments fartolDb / fartolNodeId / wsBroadcast.
declare module 'fastify' {
  interface FastifyInstance {
    printerSink: PrinterSink;
    /** PATTERNS S-2 — local_seq generator injection point. Routes that
     * insert into events read this instead of importing nextLocalSeq
     * directly so tests can swap in a throwing fn for atomicity coverage. */
    fartolNextLocalSeq: NextLocalSeqFn;
    /** Plan 08 — projection cache + debounced recompute + broadcast.
     * Bridge + dev simulate-read + walk-up POST all call markDirty after
     * mutations; hello handler reads `get/recomputeNow` for results_full. */
    projectionStore: ProjectionStore;
  }
}

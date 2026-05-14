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
import wsPlugin from './ws/index.ts';
import type { DbHandle } from './db/index.ts';
import type { PrinterSink } from './print/sink.ts';
import { createStdoutPrinterSink } from './print/stdout-sink.ts';

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

    await app.register(wsPlugin);
    await app.register(registerCompetitions);
    await app.register(registerClasses);
    await app.register(registerCourses);
    await app.register(registerDevRoutes);
  }

  await registerHealthRoute(app);

  app.setNotFoundHandler((_request, reply) => {
    void reply.code(404).send({ error: 'Not found' });
  });

  return app;
}

// Module augmentation for printerSink — wsPlugin already augments
// fartolDb / fartolNodeId / wsBroadcast.
declare module 'fastify' {
  interface FastifyInstance {
    printerSink: PrinterSink;
  }
}

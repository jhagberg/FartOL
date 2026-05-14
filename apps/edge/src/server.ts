// Authored for fartol. Not ported from upstream.
//
// Fastify bootstrap for the FartOL edge bridge. Registers @fastify/cors,
// @fastify/sensible, mounts the /api/health route, and installs a
// setNotFoundHandler that returns { error: 'Not found' } for any
// unrecognised path. Full SPA fallback (@fastify/static + 200.html) lands
// in plan 11 once apps/web/build/ exists at install time.
//
// Binds 127.0.0.1 only by default — the bin's argv parser owns the
// LAN-exposure gate (T-WS-FAN-OUT mitigation in the threat register).
// CORS allow-list mirrors the bind host: localhost loopback only in plan
// 01 (T-CORS mitigation).
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

export interface BuildServerOpts {
  /** Pass `false` to silence the Fastify pino logger (tests). Defaults to true. */
  logger?: boolean;
}

export async function buildServer(opts: BuildServerOpts = {}): Promise<FastifyInstance> {
  const app = fastify({
    logger: opts.logger ?? true,
  });

  await app.register(sensible);

  // Localhost-loopback-only CORS — Phase 1 plan 01 has no LAN clients.
  // Expanded in plan 03 when the bin gains --allow-lan and the WS plugin
  // wires up. See threat register T-CORS.
  await app.register(cors, {
    origin: [/^http:\/\/127\.0\.0\.1(:\d+)?$/, /^http:\/\/localhost(:\d+)?$/],
  });

  await registerHealthRoute(app);

  app.setNotFoundHandler((_request, reply) => {
    void reply.code(404).send({ error: 'Not found' });
  });

  return app;
}

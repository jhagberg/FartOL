// Authored for fartol. Not ported from upstream.
//
// Vite config for the SvelteKit SPA. Two responsibilities:
//   1. Dev-server proxy: /api/* → http://localhost:3000 (Fastify) and
//      /ws → ws://localhost:3000 (WebSocket upgrade). Locked by
//      .planning/phases/01-single-laptop-training-mvp/01-RESEARCH.md
//      Pitfall 2 — without these, the dev experience can't reach the
//      bridge.
//   2. Vitest config inlined (test block). RESEARCH §"validation
//      architecture" allows vitest config to live inside vite.config.ts;
//      vitest.config.ts re-exports this file so the planner's
//      file-presence intent is preserved.

import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});

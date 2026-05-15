// Authored for fartol. Not ported from upstream.
//
// tsup build config for @fartol/edge. Mirrors packages/sportident/tsup.config.ts
// with two entry-point changes: src/server.ts (the Fastify factory) and
// src/bin/fartol.ts (the binary). Locked by
// .planning/phases/01-single-laptop-training-mvp/01-PATTERNS.md
// §"apps/edge/tsup.config.ts" + §"apps/edge/package.json".
//
// outExtension is load-bearing: package.json `bin` resolves to
// ./dist/bin/fartol.cjs, which only exists when format===cjs emits .cjs.

import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts', 'src/bin/fartol.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node24',
  splitting: false,
  outDir: 'dist',
  outExtension({ format }) {
    return { js: format === 'esm' ? '.mjs' : '.cjs' };
  },
  esbuildOptions(options) {
    options.logOverride = {
      ...options.logOverride,
      'empty-import-meta': 'silent',
    };
  },
});

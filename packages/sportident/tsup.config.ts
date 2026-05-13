import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/bin/fartol-readout.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node22',
  splitting: false,
  outDir: 'dist',
  // outExtension (codex review #12): explicit .mjs/.cjs so package.json bin and
  // exports paths resolve to actual files on disk. Plan 05 may extend this with
  // shebang handling for the bin entry, but the extension contract is locked here.
  outExtension({ format }) {
    return { js: format === 'esm' ? '.mjs' : '.cjs' };
  },
});

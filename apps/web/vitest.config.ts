// Authored for fartola. Not ported from upstream.
//
// Thin re-export of vite.config.ts — the actual vitest configuration
// lives inside the unified vite config so dev + build + test share a
// single source of truth. This file exists to preserve the planner's
// intent that a vitest.config.ts entry is present in the package.

export { default } from './vite.config.ts';

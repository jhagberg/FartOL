// Authored for fartola. Not ported from upstream.
//
// SvelteKit config for @fartola/web. SPA mode via @sveltejs/adapter-static
// with fallback: '200.html' — the edge bridge (apps/edge) serves the
// built apps/web/build/ directory and falls back to 200.html on any
// non-API/non-WS path so SvelteKit's client-side router can take over.
//
// strict: false because dynamic-route data (e.g. competition/[id]) is
// loaded at runtime via REST; SvelteKit's prerender pass would otherwise
// warn on unprerendered dynamic routes. Locked by
// .planning/phases/01-single-laptop-training-mvp/01-RESEARCH.md
// §"svelte.config.js" + Pitfall 1.

import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({ fallback: '200.html', strict: false }),
    prerender: { entries: [] },
  },
};

export default config;

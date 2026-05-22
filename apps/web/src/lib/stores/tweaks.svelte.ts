// Authored for fartola. Not ported from upstream.
//
// Svelte-5 runes store for operator preferences. Owned by the Tweaks panel
// (locale / density / accent / contrast / font-pair) and persisted to
// localStorage under a versioned key so a future schema change can migrate
// without clobbering an in-flight competition.
//
// Why a `.svelte.ts` file: Svelte 5's `$state` rune is only valid inside
// `.svelte` and `.svelte.ts` modules because the compiler rewrites the
// declaration into a `$.state(...)` proxy. Plain `.ts` modules cannot use it.
//
// Locked by:
// - 01-UI-SPEC.md §"Tweaks panel" (LOCKED scope — 5 first-class operator
//   preferences + dev-only Simulate-read button)
// - 01-RESEARCH.md §Pitfall 10 (sync init, no flash of English)
// - 01-CONTEXT.md D-13 (Svelte 5 runes for shared state)
// - 01-11-PLAN.md task 1 (interface block)

const STORAGE_KEY = 'fartola.tweaks.v1';

// SSR/test guard. We deliberately don't import `$app/environment` here
// because SvelteKit reports `browser: false` inside vitest+jsdom even when
// `window`/`localStorage` are present, which would skip persistence and
// make the runes-store tests trivially pass. `typeof window` covers the
// SSR pass (no window in Node) and the browser/jsdom paths uniformly.
const isBrowser = typeof window !== 'undefined' && typeof localStorage !== 'undefined';

export type TweaksLocale = 'sv' | 'en';
export type TweaksDensity = 'low' | 'med' | 'high';
export type TweaksAccent = 'forest' | 'blue' | 'magenta' | 'charcoal';
export type TweaksFontPair = 'plex' | 'geist' | 'source' | 'atkinson';

export interface TweaksState {
  locale: TweaksLocale;
  density: TweaksDensity;
  accent: TweaksAccent;
  contrast_high: boolean;
  font_pair: TweaksFontPair;
}

/** Locked defaults per 01-UI-SPEC §"Tweaks panel" — sv / med / forest / off / plex. */
export function defaultTweaks(): TweaksState {
  return {
    locale: 'sv',
    density: 'med',
    accent: 'forest',
    contrast_high: false,
    font_pair: 'plex',
  };
}

/** Pure JSON guard — narrows an unknown payload back to TweaksState. Anything
 * that fails validation falls through to the default for that key so a
 * partial-write doesn't permanently brick the panel. */
function coerce(raw: unknown): TweaksState {
  const d = defaultTweaks();
  if (typeof raw !== 'object' || raw === null) return d;
  const r = raw as Partial<Record<keyof TweaksState, unknown>>;
  return {
    locale: r.locale === 'en' ? 'en' : 'sv',
    density: r.density === 'low' || r.density === 'high' ? (r.density as TweaksDensity) : 'med',
    accent:
      r.accent === 'blue' || r.accent === 'magenta' || r.accent === 'charcoal'
        ? (r.accent as TweaksAccent)
        : 'forest',
    contrast_high: r.contrast_high === true,
    font_pair:
      r.font_pair === 'geist' || r.font_pair === 'source' || r.font_pair === 'atkinson'
        ? (r.font_pair as TweaksFontPair)
        : 'plex',
  };
}

/** Load from localStorage or fall back to defaults. SSR-safe via `browser`. */
export function loadTweaks(): TweaksState {
  if (!isBrowser) return defaultTweaks();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultTweaks();
    return coerce(JSON.parse(raw));
  } catch {
    return defaultTweaks();
  }
}

/** Top-level $state proxy. Components import this directly and `bind:` to
 * its fields — Svelte 5 runes do the reactivity for us. */
export const tweaks = $state<TweaksState>(loadTweaks());

/** Persist the current snapshot. Callers invoke this after a mutation so
 * we don't pay a JSON.stringify on every keystroke during a slider drag. */
export function persistTweaks(): void {
  if (!isBrowser) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tweaks));
  } catch {
    // Quota errors are non-fatal — the panel still works for the session.
  }
}

/** Reset every key back to the locked default. Useful for tests and a
 * potential "Restore defaults" affordance in the panel. */
export function resetTweaks(): void {
  const d = defaultTweaks();
  tweaks.locale = d.locale;
  tweaks.density = d.density;
  tweaks.accent = d.accent;
  tweaks.contrast_high = d.contrast_high;
  tweaks.font_pair = d.font_pair;
  persistTweaks();
}

/** Apply the current preferences to a host element (usually
 * `document.documentElement`). Sets data-accent / data-density /
 * data-font-pair and toggles the `.contrast-high` class so tokens.css can
 * pick up the overrides via attribute selectors.
 *
 * Note: forest accent is the default — we still emit data-accent="forest"
 * rather than omitting the attribute so the value is observable in DevTools.
 */
export function applyTweaksToRoot(el: HTMLElement, state: TweaksState = tweaks): void {
  el.setAttribute('data-accent', state.accent);
  el.setAttribute('data-density', state.density);
  el.setAttribute('data-font-pair', state.font_pair);
  if (state.contrast_high) el.classList.add('contrast-high');
  else el.classList.remove('contrast-high');
}

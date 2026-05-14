// Authored for fartol. Not ported from upstream.
//
// i18next bootstrap. Initialized SYNCHRONOUSLY at module-import time with
// both locales bundled — this is the defense against the flash-of-English
// pitfall called out in 01-RESEARCH.md §Pitfall 10. The async-init path
// would let the first paint render English even though sv is the locked
// default for Phase 1.
//
// The catalog is a direct port of
// 01-SKETCHES/claude-design-bundle/project/i18n.js (~150 keys) plus the
// error-state phrases listed in 01-UI-SPEC.md §Copywriting.
//
// Interpolation: i18next's default `{{var}}` syntax. The sketch's i18n.js
// uses `{var}`; the port to JSON normalizes those occurrences (rcpt.top.title
// in both locales).
//
// Locked by:
// - 01-UI-SPEC.md §Copywriting (sv-first, ~150-key catalog)
// - 01-RESEARCH.md §Pitfall 10 (sync init)
// - 01-11-PLAN.md task 1

import i18next from 'i18next';
import sv from './sv.json' with { type: 'json' };
import en from './en.json' with { type: 'json' };
import { tweaks, persistTweaks, type TweaksLocale } from '../stores/tweaks.svelte.ts';

// Synchronous init — i18next.init returns a Promise but also populates the
// in-memory store immediately when given inline `resources`. The Promise is
// only relevant for backend loaders we don't use.
void i18next.init({
  lng: tweaks.locale,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  resources: {
    sv: { translation: sv },
    en: { translation: en },
  },
});

/** Translate. Thin wrapper so callers don't import i18next directly and so
 * the call sites stay short — `t('home.new')` instead of `i18next.t(...)`. */
export function t(key: string, vars?: Record<string, unknown>): string {
  // The cast is safe because i18next.t returns string when keys exist; on
  // missing keys it returns the key itself (we explicitly avoid the `null`
  // / object return shapes by not using `returnObjects`). Branching on
  // `vars` keeps `exactOptionalPropertyTypes` happy — the overload that
  // accepts a bare key forbids passing `undefined` as the options arg.
  if (vars === undefined) return i18next.t(key) as string;
  return i18next.t(key, vars) as string;
}

/** Switch active locale, mirror to the tweaks store, and persist. The store
 * mirror keeps localStorage in sync so a reload picks the right language on
 * the very next module-import run (before the panel mounts). */
export function setLocale(locale: TweaksLocale): void {
  void i18next.changeLanguage(locale);
  tweaks.locale = locale;
  persistTweaks();
}

/** Current resolved language. Used by reactive scopes that want to depend on
 * locale changes without binding directly to the i18next emitter. */
export function currentLocale(): TweaksLocale {
  return (i18next.language as TweaksLocale) || 'sv';
}

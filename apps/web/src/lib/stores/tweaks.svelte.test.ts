// Authored for fartol. Not ported from upstream.
//
// Unit tests for the operator-preferences runes store. Covers:
//   1. The locked default snapshot (sv / med / forest / off / plex).
//   2. Mutate + persistTweaks() round-trips JSON to localStorage.
//   3. loadTweaks() restores a persisted snapshot.
//   4. applyTweaksToRoot sets the right data-* attributes + the contrast
//      class on the supplied host element.
//
// We don't try to assert reactivity of the `$state` proxy here — Svelte's
// own runes runtime tests cover that; this file is a contract test for the
// storage + apply-to-root halves of the store.
//
// Locked by 01-11-PLAN.md task 1.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  defaultTweaks,
  loadTweaks,
  persistTweaks,
  resetTweaks,
  applyTweaksToRoot,
  tweaks,
} from './tweaks.svelte.ts';

beforeEach(() => {
  localStorage.clear();
  resetTweaks();
});

describe('@fartol/web tweaks runes store', () => {
  it('defaults match the locked UI-SPEC values', () => {
    const d = defaultTweaks();
    expect(d).toEqual({
      locale: 'sv',
      density: 'med',
      accent: 'forest',
      contrast_high: false,
      font_pair: 'plex',
    });
  });

  it('persistTweaks() writes JSON to localStorage', () => {
    tweaks.locale = 'en';
    tweaks.accent = 'blue';
    persistTweaks();
    const raw = localStorage.getItem('fartol.tweaks.v1');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.locale).toBe('en');
    expect(parsed.accent).toBe('blue');
  });

  it('loadTweaks() restores a persisted snapshot', () => {
    localStorage.setItem(
      'fartol.tweaks.v1',
      JSON.stringify({
        locale: 'en',
        density: 'high',
        accent: 'magenta',
        contrast_high: true,
        font_pair: 'atkinson',
      })
    );
    const restored = loadTweaks();
    expect(restored.locale).toBe('en');
    expect(restored.density).toBe('high');
    expect(restored.accent).toBe('magenta');
    expect(restored.contrast_high).toBe(true);
    expect(restored.font_pair).toBe('atkinson');
  });

  it('loadTweaks() falls back to defaults on garbage payload', () => {
    localStorage.setItem('fartol.tweaks.v1', '{not json');
    const restored = loadTweaks();
    expect(restored).toEqual(defaultTweaks());
  });

  it('applyTweaksToRoot sets data-* attributes and toggles contrast-high', () => {
    const el = document.createElement('html');
    applyTweaksToRoot(el, {
      locale: 'en',
      density: 'low',
      accent: 'charcoal',
      contrast_high: true,
      font_pair: 'geist',
    });
    expect(el.getAttribute('data-accent')).toBe('charcoal');
    expect(el.getAttribute('data-density')).toBe('low');
    expect(el.getAttribute('data-font-pair')).toBe('geist');
    expect(el.classList.contains('contrast-high')).toBe(true);

    applyTweaksToRoot(el, {
      ...defaultTweaks(),
      contrast_high: false,
    });
    expect(el.classList.contains('contrast-high')).toBe(false);
    expect(el.getAttribute('data-accent')).toBe('forest');
  });
});

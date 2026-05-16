// Authored for fartol. Not ported from upstream.
//
// Unit tests for the i18n bootstrap. Verifies:
// - The Swedish default resolves on first import (Pitfall 10: no flash of English).
// - setLocale flips the resolver and mirrors to the tweaks store + localStorage.
// - Every sv key has an en counterpart (catalog parity is the export-quality
//   guarantee Plan 11 promises plans 12-14).
//
// Locked by 01-11-PLAN.md task 1.

import { describe, it, expect, beforeEach } from 'vitest';
import sv from './sv.json' with { type: 'json' };
import en from './en.json' with { type: 'json' };

beforeEach(() => {
  localStorage.clear();
});

describe('@fartol/web i18n bootstrap', () => {
  it('renders the Swedish home.new label by default (Pitfall 10)', async () => {
    // Fresh import each test — vitest module isolation is per-file, so we
    // use `await import()` and trust the first call to hit the sync init.
    const mod = await import('./index.ts');
    expect(mod.t('home.new')).toBe('+ Ny tävling');
  });

  it('switches to English when setLocale("en") is called', async () => {
    const mod = await import('./index.ts');
    mod.setLocale('en');
    expect(mod.t('home.new')).toBe('+ New competition');
    expect(mod.currentLocale()).toBe('en');
  });

  it('persists the chosen locale to localStorage', async () => {
    const mod = await import('./index.ts');
    mod.setLocale('en');
    const raw = localStorage.getItem('fartol.tweaks.v1');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.locale).toBe('en');
  });

  it('has full sv ↔ en parity (every key in sv exists in en and vice versa)', () => {
    const svKeys = Object.keys(sv).sort();
    const enKeys = Object.keys(en).sort();
    expect(enKeys).toEqual(svKeys);
  });
});

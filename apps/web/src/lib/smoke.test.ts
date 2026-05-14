// Authored for fartol. Not ported from upstream.
//
// Placeholder vitest test so `pnpm test:quick` exits 0 across all three
// new packages. Real unit tests for the SvelteKit app land in plan 11
// alongside the full UI (component primitives, i18next bootstrap,
// ws-client wrapper). This file imports the shared types barrel to also
// smoke-test that the workspace dep resolves correctly from apps/web.

import { describe, it, expect } from 'vitest';
import { EVENT_SCHEMA_VERSION, readoutChannel } from '@fartol/shared-types';

describe('@fartol/web smoke', () => {
  it('imports the shared-types barrel', () => {
    expect(EVENT_SCHEMA_VERSION).toBe(1);
    expect(readoutChannel('abc')).toBe('readout:abc');
  });
});

// Authored for fartol. Not ported from upstream.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { formatGap } from './templates.ts';

test('formatGap uses printer-safe text for the leader row', () => {
  assert.equal(formatGap(0), 'Leder');
});

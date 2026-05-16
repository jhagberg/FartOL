// Authored for fartol. Not ported from upstream.
//
// Smoke test for the @fartol/shared-types barrel — asserts the runtime
// exports (EVENT_SCHEMA_VERSION, readoutChannel) resolve and the channel
// builder returns the expected template-literal shape. Type re-exports
// (NdjsonEvent etc.) are verified by `tsc --noEmit` at the package level.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { EVENT_SCHEMA_VERSION, readoutChannel, resultsChannel } from './index.ts';

describe('@fartol/shared-types', () => {
  test('EVENT_SCHEMA_VERSION is 1', () => {
    assert.equal(EVENT_SCHEMA_VERSION, 1);
  });

  test('readoutChannel builds readout:<id>', () => {
    assert.equal(readoutChannel('abc'), 'readout:abc');
  });

  test('resultsChannel builds results:<id>', () => {
    assert.equal(resultsChannel('abc'), 'results:abc');
  });
});

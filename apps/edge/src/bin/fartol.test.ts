// Authored for fartol. Not ported from upstream.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { resolvePrinterConfig } from './fartol.ts';

describe('resolvePrinterConfig', () => {
  test('defaults to the Star CUPS queue', () => {
    assert.deepEqual(resolvePrinterConfig({}), {
      kind: 'cups',
      queueName: 'TSP143--STR_T-001-',
    });
  });

  test('supports stdout sink for dev and CI', () => {
    assert.deepEqual(resolvePrinterConfig({ FARTOL_PRINTER: 'stdout' }), { kind: 'stdout' });
  });

  test('supports direct raw sink for compatible ESC/POS devices', () => {
    assert.deepEqual(
      resolvePrinterConfig({ FARTOL_PRINTER: 'direct', FARTOL_PRINTER_TYPE: 'epson' }),
      { kind: 'direct', printerType: 'epson' }
    );
  });

  test('supports overriding the CUPS queue name', () => {
    assert.deepEqual(resolvePrinterConfig({ FARTOL_PRINTER: 'cups', FARTOL_CUPS_QUEUE: 'Star' }), {
      kind: 'cups',
      queueName: 'Star',
    });
  });
});

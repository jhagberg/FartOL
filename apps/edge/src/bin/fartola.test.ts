// Authored for fartola. Not ported from upstream.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { parseArgs, resolvePrinterConfig } from './fartola.ts';

describe('resolvePrinterConfig', () => {
  test('defaults to the Star CUPS queue', () => {
    assert.deepEqual(resolvePrinterConfig({}), {
      kind: 'cups',
      queueName: 'TSP143--STR_T-001-',
    });
  });

  test('supports stdout sink for dev and CI', () => {
    assert.deepEqual(resolvePrinterConfig({ FARTOLA_PRINTER: 'stdout' }), { kind: 'stdout' });
  });

  test('supports direct raw sink for compatible ESC/POS devices', () => {
    assert.deepEqual(
      resolvePrinterConfig({ FARTOLA_PRINTER: 'direct', FARTOLA_PRINTER_TYPE: 'epson' }),
      { kind: 'direct', printerType: 'epson' }
    );
  });

  test('supports overriding the CUPS queue name', () => {
    assert.deepEqual(
      resolvePrinterConfig({ FARTOLA_PRINTER: 'cups', FARTOLA_CUPS_QUEUE: 'Star' }),
      {
        kind: 'cups',
        queueName: 'Star',
      }
    );
  });
});

describe('parseArgs', () => {
  // CI 2026-05-19 regression: `pnpm --filter X dev -- --port=3001` forwarded
  // the bare `--` separator into the script's argv on the runner's pnpm 9,
  // which made parseArgs throw "Unknown argument: --" before the bridge ever
  // bound a port → playwright webServer timed out.
  test('treats POSIX `--` end-of-options as a no-op', () => {
    const opts = parseArgs(['--', '--port=3001']);
    assert.equal(opts.port, 3001);
  });

  test('still rejects truly unknown flags', () => {
    assert.throws(() => parseArgs(['--bogus']), /Unknown argument: --bogus/);
  });
});

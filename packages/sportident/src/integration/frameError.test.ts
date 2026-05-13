// Replacement for the Wave 0 placeholder. Implements the structured
// FrameError callback assertion (codex review #1, HIGH) for Plan 02:
// feeding the synthetic crc-mismatch fixture into parseAll(input, {onFrameError})
// invokes the callback exactly once with error_code: 'crc_mismatch' AND yields
// zero messages. Plan 05 will extend this test with the NDJSON bridge.
// See packages/sportident/NOTICE.md for cumulative attribution.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAll, type FrameError } from '../siProtocol.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
// src/integration -> ../../tests/fixtures/synthetic
const fixturesDir = join(__dirname, '..', '..', 'tests', 'fixtures', 'synthetic');

const loadBytesHex = (path: string): number[] =>
  readFileSync(path, 'utf-8')
    .split('\n')
    .map((line) => line.replace(/#.*$/, '')) // strip line comments
    .join(' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((tok) => parseInt(tok, 16));

test('synthetic/crc-mismatch.bytes.hex -> onFrameError fires once with crc_mismatch', () => {
  const bytes = loadBytesHex(join(fixturesDir, 'crc-mismatch.bytes.hex'));
  // Sanity check that the fixture loaded as bytes (every value in 0..255).
  assert.ok(bytes.length > 0, 'fixture is non-empty');
  assert.ok(
    bytes.every((b) => Number.isInteger(b) && b >= 0 && b <= 255),
    'fixture parses to a byte array'
  );

  const errors: FrameError[] = [];
  const { messages, remainder } = parseAll(bytes, {
    onFrameError: (err) => errors.push(err),
  });

  assert.strictEqual(messages.length, 0);
  assert.strictEqual(errors.length, 1);
  assert.strictEqual(errors[0]!.error_code, 'crc_mismatch');
  // Bytes_consumed should equal the full bad-frame length (STX..ETX = 7 bytes
  // for SET_MS(0x4D) with one parameter).
  assert.strictEqual(errors[0]!.bytes_consumed, bytes.length);
  assert.deepStrictEqual(remainder, []);
});

test('synthetic/back-to-back-frames.bytes.hex -> 2 messages, 0 errors, empty remainder', () => {
  const bytes = loadBytesHex(join(fixturesDir, 'back-to-back-frames.bytes.hex'));
  const errors: FrameError[] = [];
  const { messages, remainder } = parseAll(bytes, {
    onFrameError: (err) => errors.push(err),
  });
  assert.strictEqual(messages.length, 2);
  assert.strictEqual(errors.length, 0);
  assert.deepStrictEqual(remainder, []);
});

test('synthetic/bad-stx.bytes.hex -> 1 message (garbage 0x42 silently dropped)', () => {
  const bytes = loadBytesHex(join(fixturesDir, 'bad-stx.bytes.hex'));
  const errors: FrameError[] = [];
  const { messages, remainder } = parseAll(bytes, {
    onFrameError: (err) => errors.push(err),
  });
  assert.strictEqual(messages.length, 1);
  // Silent skip: no onFrameError fires for stray garbage. (See plan: "ONLY when
  // the entire remainder is consumed without finding a valid STX".)
  assert.strictEqual(errors.length, 0);
  assert.deepStrictEqual(remainder, []);
});

test('synthetic/partial-then-complete.bytes.hex -> 1 message when both halves are passed together', () => {
  const bytes = loadBytesHex(join(fixturesDir, 'partial-then-complete.bytes.hex'));
  const errors: FrameError[] = [];
  const { messages, remainder } = parseAll(bytes, {
    onFrameError: (err) => errors.push(err),
  });
  assert.strictEqual(messages.length, 1);
  assert.strictEqual(errors.length, 0);
  assert.deepStrictEqual(remainder, []);
});

test('synthetic/truncated-frame.bytes.hex -> 0 messages, remainder = full input (no error)', () => {
  const bytes = loadBytesHex(join(fixturesDir, 'truncated-frame.bytes.hex'));
  const errors: FrameError[] = [];
  const { messages, remainder } = parseAll(bytes, {
    onFrameError: (err) => errors.push(err),
  });
  assert.strictEqual(messages.length, 0);
  assert.strictEqual(errors.length, 0);
  // Multiplexer can re-feed `remainder` once it has more bytes.
  assert.deepStrictEqual(remainder, bytes);
});

// TODO(plan-05): in plan 05 we wrap NdjsonEmitter around this callback so that
// frame_error emits both to stdout NDJSON and stderr diagnostics. The
// siProtocol contract is FINAL — plan 05 only adds the bridge.

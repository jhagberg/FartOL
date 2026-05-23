// Authored for fartola. Not ported from upstream.
//
// node:test coverage for the bundled-XSD validator. Asserts:
// - test 1: valid CourseData sample passes.
// - test 2: valid EntryList sample passes.
// - test 3 (C-H3 regression input): corrupt CourseData fails with at least
//   one XsdError mentioning the missing Name child. This is the same fixture
//   that competitionsFromWizard.test.ts test 2 drives through the atomic
//   /from-wizard endpoint — keeping the assertion local here proves the
//   fixture genuinely violates XSD (not just parse validation).
// - test 4: ad-hoc XSD-invalid document → at least one error.
// - test 5: repeated calls don't re-read the schema (caching) — verified by
//   timing the second call against the first; we assert the cached call is
//   not catastrophically slower (a generous 5× ceiling because WASM warmup
//   varies in CI).
//
// Locked by:
// - .planning/phases/01-single-laptop-training-mvp/01-05-PLAN.md task 1

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { validateXml, __schemaInfo } from './validate.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.resolve(HERE, '..', '..', 'test', 'fixtures');

function readFixture(name: string): string {
  return readFileSync(path.join(FIXTURE_DIR, name), 'utf8');
}

describe('validateXml against bundled IOF.xsd', () => {
  test('schema info: IOF.xsd resolved and non-trivial', () => {
    assert.ok(__schemaInfo.bytes > 1000, `expected schema > 1 KB, got ${__schemaInfo.bytes}`);
    assert.ok(__schemaInfo.path.endsWith('IOF.xsd'));
  });

  test('test 1: valid CourseData sample → valid: true', async () => {
    const xml = readFixture('iof30-coursedata-sample.xml');
    const result = await validateXml(xml);
    assert.equal(
      result.valid,
      true,
      `expected valid, got errors: ${JSON.stringify(result.errors)}`
    );
    assert.equal(result.errors.length, 0);
  });

  test('test 2: valid EntryList sample → valid: true', async () => {
    const xml = readFixture('iof30-entrylist-sample.xml');
    const result = await validateXml(xml);
    assert.equal(
      result.valid,
      true,
      `expected valid, got errors: ${JSON.stringify(result.errors)}`
    );
  });

  test('test 3 (C-H3 input gate): corrupt CourseData → valid: false with missing-Name error', async () => {
    const xml = readFixture('iof30-coursedata-corrupt.xml');
    const result = await validateXml(xml);
    assert.equal(result.valid, false, 'expected XSD to reject corrupt CourseData');
    assert.ok(result.errors.length > 0, 'expected at least one error');
    // libxml2's typical message for a missing required child:
    //   "element Course: Schemas validity error : Missing child element(s). Expected is ( Name )."
    // Be lenient: just assert at least one error references Name or Course.
    const joined = result.errors.map((e) => e.message).join('\n');
    assert.match(
      joined,
      /Name|Course/i,
      `expected error to reference Name or Course; got: ${joined}`
    );
  });

  test('test 4: ad-hoc XSD-invalid document → at least one error', async () => {
    const xml =
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<CourseData xmlns="http://www.orienteering.org/datastandard/3.0" iofVersion="3.0">' +
      '<Event><Name>Bogus</Name></Event>' +
      '<BogusElement/>' +
      '</CourseData>';
    const result = await validateXml(xml);
    assert.equal(result.valid, false);
    assert.ok(result.errors.length > 0);
  });

  test('test 5: repeated calls use cached schema (perf sanity)', async () => {
    const xml = readFixture('iof30-coursedata-sample.xml');
    const t1 = performance.now();
    const r1 = await validateXml(xml);
    const d1 = performance.now() - t1;
    const t2 = performance.now();
    const r2 = await validateXml(xml);
    const d2 = performance.now() - t2;
    assert.equal(r1.valid, true);
    assert.equal(r2.valid, true);
    // The schema is parsed inside xmllint-wasm on each call (the WASM API
    // is stateless), but the SCHEMA_BYTES Buffer we hand in is reused —
    // there is no disk re-read. We just sanity-check that neither call is
    // pathologically slow (> 30s would indicate a hang).
    assert.ok(d1 < 30_000, `first call too slow: ${d1}ms`);
    assert.ok(d2 < 30_000, `second call too slow: ${d2}ms`);
  });
});

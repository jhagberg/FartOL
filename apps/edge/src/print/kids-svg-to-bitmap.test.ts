// Authored for fartol. Not ported from upstream.
//
// node:test coverage for kids-svg-to-bitmap.ts. PATTERNS S-3 (lazy native
// require): the test file does NOT import sharp at the top level — it
// only calls generateKidsBitmap which triggers the lazy require. If
// libvips is missing from the dev box, sharp's require throws at first
// call and we mark the test as skipped rather than failing the whole
// suite (the kids template's runtime catch is the operator-facing
// safety net; this skip keeps the test honest about its dependency).
//
// Coverage:
//   1. generateKidsBitmap returns a PNG buffer > 100 bytes for a
//      deterministic input.
//   2. Two calls with same input produce byte-identical buffers
//      (skogis is deterministic + sharp is deterministic for fixed
//      input + libvips version).
//   3. descriptorToSvgString output contains `stroke="#000"` and is
//      well-formed XML at the top level.
//
// Locked by 01-15-PLAN.md task 2b.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  descriptorToSvgString,
  generateKidsBitmap,
  type KidsBitmapInput,
} from './kids-svg-to-bitmap.ts';
import { skogisFromInput } from '@fartol/shared-types';

const FIXTURE: KidsBitmapInput = {
  card_number: 7501853,
  name: 'Anna Andersson',
  club: 'OK Test',
  class_id: 'cls-fixed',
  status: 'OK',
  place: 1,
  control_count: 4,
  best_legs: 2,
  total_legs: 4,
  starters_in_class: 6,
};

/** Probe whether libvips (sharp's native dep) is available on this box.
 * If not, the tests below skip cleanly — the kids template's runtime
 * fallback covers the operator path. */
async function sharpAvailable(): Promise<boolean> {
  try {
    await generateKidsBitmap(FIXTURE);
    return true;
  } catch (err) {
    const msg = (err as Error).message ?? '';
    // Treat any libvips / linker error as "not available".
    if (msg.includes('libvips') || msg.includes('sharp') || msg.includes('Cannot find module')) {
      return false;
    }
    return true; // other errors propagate from the actual test
  }
}

describe('kids-svg-to-bitmap (PATTERNS S-3 lazy native)', () => {
  test('test 1: generateKidsBitmap returns a PNG buffer > 100 bytes', async (ctx) => {
    if (!(await sharpAvailable())) return ctx.skip('libvips not available on this host');
    const out = await generateKidsBitmap(FIXTURE);
    assert.ok(out.png.length > 100, `expected >100 byte PNG, got ${out.png.length}`);
    // PNG magic: 89 50 4E 47 0D 0A 1A 0A
    assert.equal(out.png[0], 0x89);
    assert.equal(out.png[1], 0x50);
    assert.equal(out.png[2], 0x4e);
    assert.equal(out.png[3], 0x47);
  });

  test('test 2: deterministic — two calls with same input produce byte-identical buffers', async (ctx) => {
    if (!(await sharpAvailable())) return ctx.skip('libvips not available on this host');
    const a = await generateKidsBitmap(FIXTURE);
    const b = await generateKidsBitmap(FIXTURE);
    assert.equal(a.png.length, b.png.length);
    assert.ok(a.png.equals(b.png), 'png buffers must be byte-identical');
  });

  test('test 3: descriptorToSvgString produces stroke="#000" + valid <svg> root', () => {
    const descriptor = skogisFromInput({
      cardNumber: FIXTURE.card_number,
      name: FIXTURE.name,
      club: FIXTURE.club,
      classId: FIXTURE.class_id,
      status: FIXTURE.status,
      place: FIXTURE.place,
      controlCount: FIXTURE.control_count,
      bestLegs: FIXTURE.best_legs,
      totalLegs: FIXTURE.total_legs,
      startersInClass: FIXTURE.starters_in_class,
    });
    const svg = descriptorToSvgString(descriptor);
    assert.ok(svg.startsWith('<svg '), 'must start with <svg>');
    assert.ok(svg.endsWith('</svg>'), 'must end with </svg>');
    assert.ok(svg.includes('stroke="#000"'), 'must contain stroke="#000"');
    assert.ok(svg.includes('xmlns="http://www.w3.org/2000/svg"'), 'must declare svg xmlns');
  });
});

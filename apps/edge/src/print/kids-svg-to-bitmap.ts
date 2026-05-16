// Authored for fartol. Not ported from upstream.
//
// Skogis SVG → PNG bitmap pipeline for the ESC/POS kids template. Pure
// pipeline: descriptor → minimal SVG string → sharp() → PNG buffer at
// ~272-384px wide (80mm thermal column at 8 dots/mm).
//
// PATTERNS S-3 (lazy native require): sharp is imported INSIDE
// generateKidsBitmap, NOT at module top level. Edge tests that don't
// print kids receipts can load every other module on systems missing
// libvips (sharp's native dep).
//
// Determinism contract: same input → same PNG buffer (skogis generator
// is deterministic + sharp's PNG encoder is stable for fixed input). The
// kids-svg-to-bitmap.test.ts covers this in plan 15 Task 2b.
//
// Locked by:
// - .planning/phases/01-single-laptop-training-mvp/01-15-PLAN.md task 2b
// - .planning/phases/01-single-laptop-training-mvp/01-RESEARCH.md §A3
//   (sharp / @resvg/resvg-js — sharp wins on Phase-1 supply-chain
//   simplicity since it's already a common Node native dep)

import { createRequire } from 'node:module';
import { skogisFromInput, type SkogisDescriptor } from '@fartol/shared-types';

export interface KidsBitmapInput {
  card_number: number;
  name: string;
  club: string | null;
  class_id: string;
  status: 'OK' | 'MP' | 'DNF' | 'PEND';
  place: number | null;
  control_count: number;
  best_legs: number;
  total_legs: number;
  starters_in_class: number;
}

export interface KidsBitmapOutput {
  /** PNG bytes — fed to printer.printImageBuffer(). */
  png: Buffer;
  width: number;
  height: number;
}

/** Build a minimal mono-printable SVG string from a SkogisDescriptor.
 * Exported for unit testing (Task 2b test 3 asserts the SVG contains
 * `stroke="#000"`). The SVG matches the Kids.svelte renderer's visual
 * surface in spirit — body + ears + eyes + accessory — but is a single
 * flat string rather than a Svelte template.
 *
 * SAFETY CONTRACT (PR #3 Gemini round-5): every attribute value in the
 * produced SVG is either a hardcoded literal (`"#fff"`, `"#000"`, `"none"`,
 * etc.) or a numeric expression derived from `SkogisDescriptor` enum-like
 * fields (`bodyShape`, `mouth`, `ears`, etc.). NO USER-CONTROLLED STRING
 * is interpolated into any attribute, so there is no XML-injection
 * surface. Future refactors that wire user-supplied data (competitor
 * name, club, etc.) into SVG attributes MUST add escaping (`&` → `&amp;`,
 * `"` → `&quot;`, `<` → `&lt;`) at the interpolation point. */
export function descriptorToSvgString(d: SkogisDescriptor): string {
  const W = 200;
  const H = 210;
  const cx = 100;
  const cy = d.bodyShape === 'tall' ? 118 : 120;
  const rx = d.bodyShape === 'tall' ? 56 : d.bodyShape === 'round' ? 70 : 66;
  const ry =
    d.bodyShape === 'tall' ? 70 : d.bodyShape === 'round' ? 60 : d.bodyShape === 'pear' ? 68 : 62;
  const eyeY = cy - 12;
  const eyeDX = d.bodyShape === 'tall' ? 16 : 20;

  const parts: string[] = [];
  // Body
  parts.push(
    `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#fff" stroke="#000" stroke-width="2.5"/>`
  );
  // Eyes
  parts.push(
    `<circle cx="${cx - eyeDX}" cy="${eyeY}" r="6" fill="#000"/>`,
    `<circle cx="${cx + eyeDX}" cy="${eyeY}" r="6" fill="#000"/>`
  );
  // Mouth
  if (d.mouth === 'smile' || d.mouth === 'tongue') {
    parts.push(
      `<path d="M ${cx - 10} ${eyeY + 18} Q ${cx} ${eyeY + 26} ${cx + 10} ${eyeY + 18}" stroke="#000" stroke-width="2" fill="none"/>`
    );
  } else if (d.mouth === 'o') {
    parts.push(`<circle cx="${cx}" cy="${eyeY + 22}" r="4" fill="#000"/>`);
  } else if (d.mouth === 'line') {
    parts.push(
      `<line x1="${cx - 6}" y1="${eyeY + 22}" x2="${cx + 6}" y2="${eyeY + 22}" stroke="#000" stroke-width="2"/>`
    );
  } else if (d.mouth === 'w') {
    parts.push(
      `<path d="M ${cx - 9} ${eyeY + 20} Q ${cx - 4} ${eyeY + 26} ${cx} ${eyeY + 22} Q ${cx + 4} ${eyeY + 26} ${cx + 9} ${eyeY + 20}" stroke="#000" stroke-width="2" fill="none"/>`
    );
  }
  // Ears
  if (d.ears === 'tuft' || d.ears === 'horns') {
    parts.push(
      `<polygon points="${cx - 22},${cy - ry + 6} ${cx - 8},${cy - ry - 18} ${cx - 4},${cy - ry + 2}" fill="#000"/>`,
      `<polygon points="${cx + 22},${cy - ry + 6} ${cx + 8},${cy - ry - 18} ${cx + 4},${cy - ry + 2}" fill="#000"/>`
    );
  } else if (d.ears === 'bunny') {
    parts.push(
      `<ellipse cx="${cx - 16}" cy="${cy - ry - 12}" rx="7" ry="20" fill="#fff" stroke="#000" stroke-width="2"/>`,
      `<ellipse cx="${cx + 16}" cy="${cy - ry - 12}" rx="7" ry="20" fill="#fff" stroke="#000" stroke-width="2"/>`
    );
  } else if (d.ears === 'antennae') {
    parts.push(
      `<circle cx="${cx - 18}" cy="${cy - ry - 22}" r="3" fill="#000"/>`,
      `<circle cx="${cx + 18}" cy="${cy - ry - 22}" r="3" fill="#000"/>`,
      `<line x1="${cx - 10}" y1="${cy - ry + 2}" x2="${cx - 18}" y2="${cy - ry - 22}" stroke="#000" stroke-width="2"/>`,
      `<line x1="${cx + 10}" y1="${cy - ry + 2}" x2="${cx + 18}" y2="${cy - ry - 22}" stroke="#000" stroke-width="2"/>`
    );
  }
  // Accessory
  if (d.accessory === 'crown') {
    parts.push(
      `<polygon points="${cx - 22},${cy - ry - 2} ${cx - 22},${cy - ry - 18} ${cx - 12},${cy - ry - 8} ${cx},${cy - ry - 22} ${cx + 12},${cy - ry - 8} ${cx + 22},${cy - ry - 18} ${cx + 22},${cy - ry - 2}" fill="#fff" stroke="#000" stroke-width="1.5"/>`
    );
  } else if (d.accessory === 'silver' || d.accessory === 'bronze') {
    parts.push(
      `<circle cx="${cx}" cy="${cy - ry - 12}" r="9" fill="#fff" stroke="#000" stroke-width="1.5"/>`
    );
  } else if (d.accessory === 'flag') {
    parts.push(
      `<line x1="${cx + rx + 6}" y1="${cy + 16}" x2="${cx + rx + 6}" y2="${cy - 18}" stroke="#000" stroke-width="2"/>`,
      `<polygon points="${cx + rx + 6},${cy - 18} ${cx + rx + 22},${cy - 12} ${cx + rx + 6},${cy - 6}" fill="#fff" stroke="#000" stroke-width="1.5"/>`
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" stroke="#000" stroke-width="1.5" fill="#fff">${parts.join('')}</svg>`;
}

/** Rasterise the Skogis descriptor to a PNG buffer for ESC/POS print.
 * Returns 384px wide (80mm thermal column at 8 dots/mm) — Star TSP143
 * and Epson TM-T20 both consume this resolution natively via
 * node-thermal-printer's printImageBuffer().
 *
 * @throws when sharp's native libvips isn't available — caller (kids.ts
 *   template) catches and falls back to a text placeholder so dev boxes
 *   without libvips still complete the print pipeline.
 */
export async function generateKidsBitmap(input: KidsBitmapInput): Promise<KidsBitmapOutput> {
  const descriptor = skogisFromInput({
    cardNumber: input.card_number,
    name: input.name,
    club: input.club,
    classId: input.class_id,
    status: input.status,
    place: input.place,
    controlCount: input.control_count,
    bestLegs: input.best_legs,
    totalLegs: input.total_legs,
    startersInClass: input.starters_in_class,
  });
  const svg = descriptorToSvgString(descriptor);

  // Lazy native require — keep sharp out of the module graph for tests
  // that don't actually rasterise. Wrap in try/catch (PR #3 Gemini round-5)
  // so a missing/broken libvips binding surfaces a readable error instead
  // of the native-loader stack trace; the operator can then fall back to a
  // non-kids receipt template.
  const require = createRequire(import.meta.url);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sharp: (input: Buffer | string) => any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sharp = require('sharp') as (input: Buffer | string) => any;
  } catch (err) {
    throw new Error(
      `sharp (libvips) is not available for kids-template rasterisation: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  const png: Buffer = await sharp(Buffer.from(svg))
    .resize({ width: 384, fit: 'inside' })
    .png({ palette: true })
    .toBuffer();

  return { png, width: 384, height: 384 };
}

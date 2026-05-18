// Authored for fartol. Not ported from upstream.
//
// "Skogis" — procedural collectible critter generator for the Kids receipt
// template. Same runner (cardNumber, name, club, class) ALWAYS yields the
// same critter; race result drives only the accessory + stat distribution.
//
// MOVED here in plan 15 Task 2a (from apps/web/src/lib/skogis/skogis.ts).
// The body is byte-for-byte identical to the plan-13 implementation so the
// determinism tests (apps/web/src/lib/skogis/skogis.test.ts) continue to
// pass without re-baselining. The apps/web file now re-exports from this
// module via the @fartol/shared-types barrel.
//
// Consumers:
//   - apps/web (UI mirror via Kids.svelte; imports through $lib/skogis/skogis.ts
//     which re-exports from this module).
//   - apps/edge (apps/edge/src/print/kids-svg-to-bitmap.ts — rasterises the
//     descriptor to a PNG for the ESC/POS kids template in plan 15 Task 2b).
//
// Ported from .planning/phases/01-single-laptop-training-mvp/01-SKETCHES/
// claude-design-bundle/project/screens-readout.jsx lines 432-520 + the
// SkogisFigure SVG renderer at lines 523-711. Adapted to vanilla TS — the
// `Kids.svelte` template consumes the descriptor + emits the SVG markup.
//
// Determinism contract (LOCKED — see apps/web/src/lib/skogis/skogis.test.ts):
//   - identity (palette, species, body shape, eyes, mouth, ears, pattern,
//     hasArms, blush, baseLevel) depends ONLY on (cardNumber, name, club,
//     classId).
//   - result-derived (accessory + stats + level bonus) depends on
//     (status, place, punches, startersInClass).
//
// Mono-printable invariant: every fill / stroke is either `#1a1a1a`
// (ink), `#fdfcf7` (receipt paper) or `#fff`. The palette colours
// captured below are kept ONLY for the descriptor name + a future
// non-print rendering surface; the rendered SVG paths use ink-only fills
// so the ESC/POS bitmap pass in plan 15 stays a clean two-tone raster.
//
// Hash function: FNV-1a 32-bit mixed with golden-ratio (0x9e3779b9) — a
// stable choice that survives JS engine optimisations (no Math.random).
// RNG: mulberry32 keyed off the FNV seed; both are deterministic across
// V8 + JSC so a CI run on macOS and Linux produces identical output.
//
// Locked by:
// - 01-13-PLAN.md task 1 + interfaces (input shape + descriptor shape)
// - 01-15-PLAN.md task 2a (move from apps/web to shared-types)
// - 01-UI-SPEC.md §"Receipt templates" — Kids = monochrome procedural
// - 01-SKETCHES/.../screens-readout.jsx lines 432-520 (verbatim port)

/** Input — the minimal slice of the readout state the Skogis generator
 * needs. `cardNumber` is a number (per UI-SPEC Visual Anchor — no thousand
 * separators); strings collapse to empty so a partial input still hashes. */
export interface SkogisInput {
  cardNumber: number;
  name: string;
  club: string | null;
  classId: string;
  /** PunchStatus — drives accessory choice. MP/DNF/DQ/MAX → bandage (the
   * runner attempted but didn't validate); DNS/CANCEL/PEND → flag (no
   * attempt yet, or absent). OK/place 1..3 use crown/silver/bronze. */
  status: 'OK' | 'MP' | 'DNF' | 'PEND' | 'DNS' | 'DQ' | 'CANCEL' | 'MAX';
  /** 1-based place in the class, or null if not yet ranked. */
  place: number | null;
  /** Number of CONTROL punches (excluding finish) — drives STIG stat. */
  controlCount: number;
  /** Count of legs where this runner had the fastest split — KART stat. */
  bestLegs: number;
  /** Total legs (max(1, punches.length)) — KART normalisation. */
  totalLegs: number;
  /** Number of starters in the class (defaults to 6 if unknown) — FART. */
  startersInClass: number;
}

/** Output descriptor consumed by Kids.svelte's SVG renderer. Pure data —
 * no DOM nodes, no Svelte-specific types — so this generator stays
 * unit-testable without jsdom and portable to the print pipeline. */
export interface SkogisDescriptor {
  palette: SkogisPalette;
  species: string;
  bodyShape: BodyShape;
  eyeStyle: EyeStyle;
  mouth: Mouth;
  ears: Ears;
  pattern: Pattern;
  hasArms: boolean;
  blush: boolean;
  accessory: Accessory;
  stats: SkogisStats;
  level: number;
}

/** Stats slot on the descriptor — extracted as a top-level type alias in
 * plan 15 Task 2a so apps/edge's PrintEnvelope can thread `skogisStats`
 * through the kids template without importing the full descriptor.
 * 1..5 each (capped in skogisFromInput). */
export interface SkogisStats {
  fart: number;
  stig: number;
  kart: number;
  tur: number;
}

export interface SkogisPalette {
  /** Palette name surfaced in the receipt title (e.g. "Skog" → "Skogis"). */
  name: string;
  /** Reserved for non-print rendering surfaces; ink uses #1a1a1a. */
  body: string;
  belly: string;
  accent: string;
}

type BodyShape = 'blob' | 'tall' | 'round' | 'pear';
type EyeStyle = 'round' | 'oval' | 'sleepy' | 'spark';
type Mouth = 'smile' | 'o' | 'line' | 'w' | 'tongue';
type Ears = 'tuft' | 'bunny' | 'antennae' | 'leaf' | 'horns';
type Pattern = 'plain' | 'spots' | 'stripes' | 'belly';
type Accessory = 'crown' | 'silver' | 'bronze' | 'bandage' | 'flag';

export const SKOGIS_PALETTES: readonly SkogisPalette[] = [
  { name: 'Skog', body: '#6FA45C', belly: '#cfe2b9', accent: '#3d6a2e' },
  { name: 'Stig', body: '#9C7A4F', belly: '#e7d6b8', accent: '#5e4724' },
  { name: 'Lingon', body: '#C7615A', belly: '#f3cdc4', accent: '#7a2f29' },
  { name: 'Bäck', body: '#5E8AB8', belly: '#cfdfee', accent: '#2f4f74' },
  { name: 'Skymn', body: '#7d6fa4', belly: '#d8d2e7', accent: '#3f3464' },
  { name: 'Sol', body: '#d3a851', belly: '#f1deaa', accent: '#7a5d1d' },
  { name: 'Mosse', body: '#5fa39c', belly: '#cfe6e2', accent: '#2c5e58' },
  { name: 'Sten', body: '#8b8b94', belly: '#dadae0', accent: '#3f3f47' },
];

export const SKOGIS_SPECIES: readonly string[] = [
  'Skogis',
  'Stigis',
  'Mossis',
  'Tallis',
  'Granis',
  'Stenis',
  'Bäckis',
  'Tussis',
  'Kompis',
  'Lingis',
];

// ---------------------------------------------------------------------------
// Hash + RNG (FNV-1a + mulberry32) — verbatim port from screens-readout.jsx.
// ---------------------------------------------------------------------------

/** FNV-1a 32-bit hash mixed with the golden-ratio constant after every
 * input. Stable across engines because every operator is a uint32 op. */
export function skogisHash(...parts: Array<string | number>): number {
  let h = 2166136261 >>> 0;
  for (const part of parts) {
    const s = String(part);
    for (let j = 0; j < s.length; j++) {
      h ^= s.charCodeAt(j);
      h = Math.imul(h, 16777619);
    }
    h ^= 0x9e3779b9;
  }
  return h >>> 0;
}

/** mulberry32 — single-state 32-bit PRNG returning floats in [0, 1). */
export function skogisRng(seed: number): () => number {
  let a = seed >>> 0;
  return (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)] as T;
}

function rngInt(rng: () => number, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

// ---------------------------------------------------------------------------
// Public: derive the full descriptor.
// ---------------------------------------------------------------------------

/** Deterministic from `(cardNumber, name, club, classId)` for identity
 * fields; `(status, place, controlCount, bestLegs, totalLegs,
 * startersInClass)` only drive `accessory`, `stats`, and `level`. */
export function skogisFromInput(input: SkogisInput): SkogisDescriptor {
  const seed = skogisHash(
    input.cardNumber || 0,
    input.name || '',
    input.club || '',
    input.classId || ''
  );
  const rng = skogisRng(seed);

  // Identity — order MUST match the JSX port; reordering shifts the
  // entire seed stream and breaks the determinism tests.
  const palette = pick(rng, SKOGIS_PALETTES);
  const species = pick(rng, SKOGIS_SPECIES);
  const bodyShape = pick<BodyShape>(rng, ['blob', 'tall', 'round', 'pear']);
  const eyeStyle = pick<EyeStyle>(rng, ['round', 'oval', 'sleepy', 'spark']);
  const mouth = pick<Mouth>(rng, ['smile', 'o', 'line', 'w', 'tongue']);
  const ears = pick<Ears>(rng, ['tuft', 'bunny', 'antennae', 'leaf', 'horns']);
  const pattern = pick<Pattern>(rng, ['plain', 'plain', 'spots', 'stripes', 'belly']);
  const hasArms = rng() > 0.4;
  const blush = rng() > 0.55;
  const baseLevel = ((input.cardNumber || 1) % 29) + 1;

  // Result-derived
  // Bandage = attempted but didn't validate (MP/DNF/DQ/MAX). Flag = no
  // attempt or absent (PEND/DNS/CANCEL). Medals win over everything for
  // top-3 finishers.
  const failedAttempt =
    input.status === 'MP' ||
    input.status === 'DNF' ||
    input.status === 'DQ' ||
    input.status === 'MAX';
  const accessory: Accessory =
    input.place === 1
      ? 'crown'
      : input.place === 2
        ? 'silver'
        : input.place === 3
          ? 'bronze'
          : failedAttempt
            ? 'bandage'
            : 'flag';

  const totalLegs = Math.max(1, input.totalLegs);
  const kart = Math.max(1, Math.min(5, Math.round((input.bestLegs / totalLegs) * 5) + 1));
  const starters = Math.max(1, input.startersInClass);
  const placeFor = input.place ?? starters;
  const fart = Math.max(1, Math.min(5, 6 - Math.round((placeFor / starters) * 5)));
  const stig = Math.max(1, Math.min(5, Math.round(input.controlCount / 3)));
  const tur = rngInt(rng, 1, 5);

  const levelBonus = input.place === 1 ? 5 : input.place === 2 ? 3 : input.place === 3 ? 2 : 0;
  const level = baseLevel + levelBonus;

  return {
    palette,
    species,
    bodyShape,
    eyeStyle,
    mouth,
    ears,
    pattern,
    hasArms,
    blush,
    accessory,
    stats: { fart, stig, kart, tur },
    level,
  };
}

// ---------------------------------------------------------------------------
// SVG geometry — exported so Kids.svelte can compose the figure and the
// generator stays test-able without jsdom. Mono-printable: every fill /
// stroke is `#1a1a1a` or `#fdfcf7` (paper) or `#fff` (eye highlight).
// ---------------------------------------------------------------------------

export const SKOGIS_INK = '#1a1a1a';
export const SKOGIS_PAPER = '#fdfcf7';

export interface SkogisGeometry {
  width: number;
  height: number;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  eyeY: number;
  eyeDX: number;
}

export function skogisGeometry(d: SkogisDescriptor): SkogisGeometry {
  const W = 200;
  const H = 210;
  const cx = 100;
  const cy = d.bodyShape === 'tall' ? 118 : 120;
  const rx = d.bodyShape === 'tall' ? 56 : d.bodyShape === 'round' ? 70 : 66;
  const ry =
    d.bodyShape === 'tall' ? 70 : d.bodyShape === 'round' ? 60 : d.bodyShape === 'pear' ? 68 : 62;
  const eyeY = cy - 12;
  const eyeDX = d.bodyShape === 'tall' ? 16 : 20;
  return { width: W, height: H, cx, cy, rx, ry, eyeY, eyeDX };
}

/** Display name surfaced in the kids receipt title — palette + last 2-3
 * chars of species ("Skog" + "is" = "Skogis"; "Lingon" + "is" = "Lingonis"). */
export function skogisDisplayName(d: SkogisDescriptor): string {
  const suffix = d.species.length > 6 ? d.species.slice(-3) : d.species.slice(-2);
  return `${d.palette.name}${suffix}`;
}

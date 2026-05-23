// Authored for fartola. Not ported from upstream.
//
// node:test coverage for halfDayClockToMs + diffMs. Covers the eight
// scenarios from plan 01-07 task 1 verify gate, including:
//   - simple AM/PM mapping (tests 1-3)
//   - same-half-day deltas (test 4)
//   - cross-half-day boundary deltas (test 5)
//   - midnight-wrap deltas (test 6)
//   - null pass-through (test 7)
//   - identity delta (test 8)
//
// Locked by:
// - .planning/phases/01-single-laptop-training-mvp/01-07-PLAN.md task 1
// - .planning/phases/01-single-laptop-training-mvp/01-REVIEWS.md §C-H2

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import type { HalfDayClock } from '@fartola/sportident';
import { halfDayClockToMs, diffMs } from './halfDayClockMath.ts';

/** Build a HalfDayClock from a "seconds since the day's midnight" scalar.
 * Wraps modulo 24h so the helper is safe for values >= 24h. */
function hd(totalSeconds: number): HalfDayClock {
  const wrapped = ((totalSeconds % (24 * 3600)) + 24 * 3600) % (24 * 3600);
  return {
    seconds_in_half_day: wrapped % (12 * 3600),
    half_day: wrapped < 12 * 3600 ? 0 : 1,
    weekday: null,
  };
}

describe('halfDayClockToMs', () => {
  test('test 1: midnight (00:00) → 0 ms', () => {
    assert.equal(halfDayClockToMs(hd(0)), 0);
  });

  test('test 2: noon (12:00) → 12 * 3600 * 1000', () => {
    assert.equal(halfDayClockToMs(hd(12 * 3600)), 12 * 3600 * 1000);
  });

  test('test 3: 00:30 → 30 * 60 * 1000', () => {
    assert.equal(halfDayClockToMs(hd(30 * 60)), 30 * 60 * 1000);
  });
});

describe('diffMs', () => {
  test('test 4: AM 10:00 → AM 10:30 = 30 min', () => {
    const start = hd(10 * 3600);
    const finish = hd(10 * 3600 + 30 * 60);
    assert.equal(diffMs(start, finish), 30 * 60 * 1000);
  });

  test('test 5: AM 11:50 → PM 12:10 = 20 min (across AM/PM boundary)', () => {
    const start = hd(11 * 3600 + 50 * 60);
    const finish = hd(12 * 3600 + 10 * 60);
    assert.equal(diffMs(start, finish), 20 * 60 * 1000);
  });

  test('test 6: PM 23:50 → AM 00:10 = 20 min (across midnight wrap)', () => {
    // start at 23:50 = PM, s_in_hd = 11h50m, half_day=1
    const start: HalfDayClock = {
      seconds_in_half_day: 11 * 3600 + 50 * 60,
      half_day: 1,
      weekday: null,
    };
    // finish at 00:10 next day = AM, s_in_hd = 10m, half_day=0
    const finish: HalfDayClock = {
      seconds_in_half_day: 10 * 60,
      half_day: 0,
      weekday: null,
    };
    assert.equal(diffMs(start, finish), 20 * 60 * 1000);
  });

  test('test 7: null pass-through in either position → null', () => {
    const c: HalfDayClock = { seconds_in_half_day: 0, half_day: 0, weekday: null };
    assert.equal(diffMs(null, c), null);
    assert.equal(diffMs(c, null), null);
    assert.equal(diffMs(null, null), null);
  });

  test('test 8: same clock → 0', () => {
    const c = hd(7 * 3600 + 15 * 60);
    assert.equal(diffMs(c, c), 0);
  });
});

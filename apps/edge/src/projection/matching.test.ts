// Authored for fartola. Not ported from upstream.
//
// node:test coverage for matchCardToCompetitor. The function is a one-line
// linear scan; tests document the three contract scenarios
// (empty/match/mismatch) the reducer relies on.
//
// Locked by:
// - .planning/phases/01-single-laptop-training-mvp/01-07-PLAN.md task 1
// - .planning/phases/01-single-laptop-training-mvp/01-CONTEXT.md D-11

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import type { Competitor } from '../db/types.ts';
import { buildCardIndex, matchCardToCompetitor } from './matching.ts';

function comp(overrides: Partial<Competitor>): Competitor {
  return {
    id: 'c-1',
    competitionId: 'comp-1',
    name: 'Anna',
    club: null,
    classId: 'cls-1',
    cardNumber: null,
    consentAtMs: null,
    consentStatus: 'explicit',
    scrubbedAtMs: null,
    ...overrides,
  } as Competitor;
}

describe('matchCardToCompetitor', () => {
  test('test 1: empty competitors → null', () => {
    assert.equal(matchCardToCompetitor(123, []), null);
  });

  test('test 2: cardNumber match → returns competitor; mismatch → null', () => {
    const competitors = [comp({ id: 'a', cardNumber: 100 }), comp({ id: 'b', cardNumber: 200 })];
    const match = matchCardToCompetitor(200, competitors);
    assert.ok(match);
    assert.equal(match.id, 'b');
    assert.equal(matchCardToCompetitor(999, competitors), null);
  });

  test('test 3: multiple competitors with overlapping classes — match by cardNumber only', () => {
    const competitors = [
      comp({ id: 'a', cardNumber: 500, classId: 'H21' }),
      comp({ id: 'b', cardNumber: 501, classId: 'H21' }),
      comp({ id: 'c', cardNumber: 502, classId: 'D21' }),
      // A competitor without a card — should NEVER match.
      comp({ id: 'd', cardNumber: null, classId: 'H21' }),
    ];
    const match = matchCardToCompetitor(501, competitors);
    assert.ok(match);
    assert.equal(match.id, 'b');
    assert.equal(match.classId, 'H21');
    // Sanity: cardNumber=null doesn't accidentally match a 0-search.
    assert.equal(matchCardToCompetitor(0, competitors), null);
  });
});

describe('buildCardIndex (plan 09)', () => {
  test('test 1: empty competitors → empty index', () => {
    const idx = buildCardIndex([]);
    assert.equal(idx.size, 0);
    assert.equal(idx.get(123), undefined);
  });

  test('test 2: cardNumber!==null competitors are indexed; null cardNumber is skipped', () => {
    const competitors = [
      comp({ id: 'a', cardNumber: 100 }),
      comp({ id: 'b', cardNumber: 200 }),
      comp({ id: 'c', cardNumber: null }),
    ];
    const idx = buildCardIndex(competitors);
    assert.equal(idx.size, 2);
    assert.equal(idx.get(100)?.id, 'a');
    assert.equal(idx.get(200)?.id, 'b');
    assert.equal(idx.get(999), undefined);
  });

  test('test 3: O(1) get matches matchCardToCompetitor result for the same input', () => {
    const competitors = [
      comp({ id: 'a', cardNumber: 500 }),
      comp({ id: 'b', cardNumber: 501 }),
      comp({ id: 'c', cardNumber: 502 }),
    ];
    const idx = buildCardIndex(competitors);
    // Equivalence: for every cardNumber in {500, 501, 502, 999} the two
    // lookup paths return the same competitor (or null).
    for (const cn of [500, 501, 502, 999]) {
      const fromIdx = idx.get(cn) ?? null;
      const fromScan = matchCardToCompetitor(cn, competitors);
      assert.equal(fromIdx?.id ?? null, fromScan?.id ?? null);
    }
  });
});

// Authored for fartol. Not ported from upstream.
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
import { matchCardToCompetitor } from './matching.ts';

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

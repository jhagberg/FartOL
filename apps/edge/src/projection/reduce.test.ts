// Authored for fartol. Not ported from upstream.
//
// node:test coverage for the pure reducer. The 13 LOCKED scenarios from
// plan 01-07 task 2 verify gate. Tests 11–13 are the explicit codex C-H2
// regression gates at the reducer layer (finish=null → DNF; elapsed from
// HalfDayClock pair; history preserves the clocks).
//
// Strategy: pure-function tests — no DB. Each test constructs Event rows
// inline matching the Drizzle InferSelectModel shape, calls reduce(), and
// asserts on the returned CompetitionState.
//
// Locked by:
// - .planning/phases/01-single-laptop-training-mvp/01-07-PLAN.md task 2
// - .planning/phases/01-single-laptop-training-mvp/01-REVIEWS.md §C-H2

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import type { HalfDayClock, NdjsonPunch } from '@fartol/sportident';
import type { Event, Competitor, Class } from '../db/types.ts';
import type { EventPayload } from '../db/schema.ts';
import { reduce, type CourseWithControlCodes } from './reduce.ts';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function hd(totalSeconds: number): HalfDayClock {
  const wrapped = ((totalSeconds % (24 * 3600)) + 24 * 3600) % (24 * 3600);
  return {
    seconds_in_half_day: wrapped % (12 * 3600),
    half_day: wrapped < 12 * 3600 ? 0 : 1,
    weekday: null,
  };
}

function p(code: number): NdjsonPunch {
  return { code, seconds_in_half_day: 0, half_day: 0, weekday: null };
}

let seqCounter = 0;

function evt(
  payload: EventPayload,
  overrides: Partial<{
    competitionId: string;
    eventTimeMs: number;
    localSeq: number;
    nodeId: string;
  }> = {}
): Event {
  seqCounter += 1;
  return {
    nodeId: overrides.nodeId ?? 'node-A',
    localSeq: overrides.localSeq ?? seqCounter,
    competitionId: overrides.competitionId ?? 'comp-1',
    eventType: payload.event_type,
    eventTimeMs: overrides.eventTimeMs ?? 1_700_000_000_000 + seqCounter,
    recordedAtMs: 1_700_000_000_000 + seqCounter,
    payload,
  } as Event;
}

function cardRead(
  cardNumber: number,
  punches: NdjsonPunch[],
  start: HalfDayClock | null,
  finish: HalfDayClock | null,
  overrides: Partial<{
    competitionId: string;
    eventTimeMs: number;
    localSeq: number;
  }> = {}
): Event {
  return evt(
    {
      event_type: 'card_read',
      card_number: cardNumber,
      card_type: 'SI10',
      start,
      finish,
      check: null,
      clear: null,
      punch_count: punches.length,
      punches,
      card_holder: null,
    },
    overrides
  );
}

function comp(overrides: Partial<Competitor>): Competitor {
  return {
    id: 'c-1',
    competitionId: 'comp-1',
    name: 'Anna',
    club: null,
    classId: 'cls-H21',
    cardNumber: null,
    consentAtMs: null,
    consentStatus: 'explicit',
    scrubbedAtMs: null,
    ...overrides,
  } as Competitor;
}

function cls(id: string, name = id): Class {
  return {
    id,
    competitionId: 'comp-1',
    name,
    shortName: null,
  } as Class;
}

function course(classId: string, controlCodes: readonly number[]): CourseWithControlCodes {
  return {
    id: `course-${classId}`,
    competitionId: 'comp-1',
    name: `Course ${classId}`,
    classId,
    lengthM: null,
    climbM: null,
    control_codes: controlCodes,
  } as CourseWithControlCodes;
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

describe('reduce — CompetitionState projection', () => {
  test('test 1: empty events + zero competitors → empty state', () => {
    const state = reduce({
      competition_id: 'comp-1',
      events: [],
      competitors: [],
      classes: [],
      courses: [],
    });
    assert.equal(state.competition_id, 'comp-1');
    assert.equal(state.competitors.size, 0);
    assert.equal(state.results_by_class.size, 0);
    assert.deepEqual(state.pending_unknown_cards, []);
    assert.equal(state.last_event_seq, 0);
  });

  test('test 2: single OK competitor — Anna SI10, 4-control course, full punches + finish', () => {
    seqCounter = 0;
    const events = [
      cardRead(7501853, [p(31), p(32), p(33), p(34)], hd(10 * 3600), hd(10 * 3600 + 600)),
    ];
    const state = reduce({
      competition_id: 'comp-1',
      events,
      competitors: [comp({ id: 'c-anna', name: 'Anna', cardNumber: 7501853 })],
      classes: [cls('cls-H21', 'H21')],
      courses: [course('cls-H21', [31, 32, 33, 34])],
    });
    const anna = state.competitors.get('c-anna');
    assert.ok(anna);
    assert.equal(anna.status, 'OK');
    assert.equal(anna.elapsed_time_ms, 600 * 1000);
    const h21Results = state.results_by_class.get('cls-H21');
    assert.ok(h21Results);
    assert.equal(h21Results.length, 1);
    assert.equal(h21Results[0]!.place, 1);
    assert.equal(h21Results[0]!.behind_leader_ms, 0);
  });

  test('test 3: walk-up flow — unknown card_number is queued; card_bound dismisses it', () => {
    seqCounter = 0;
    const events: Event[] = [
      cardRead(9_999_999, [], null, null),
      evt({
        event_type: 'card_bound',
        competitor_id: 'c-anna',
        card_number: 9_999_999,
        walkup: true,
        consent_at_ms: 1_700_000_000_500,
      }),
    ];
    // Snapshot after card_read but before card_bound — pending must contain 9999999.
    const afterRead = reduce({
      competition_id: 'comp-1',
      events: [events[0]!],
      competitors: [],
      classes: [],
      courses: [],
    });
    assert.deepEqual(afterRead.pending_unknown_cards, [9_999_999]);

    // Snapshot after BOTH events — pending must be empty.
    const afterBound = reduce({
      competition_id: 'comp-1',
      events,
      competitors: [],
      classes: [],
      courses: [],
    });
    assert.deepEqual(afterBound.pending_unknown_cards, []);
  });

  test('test 4: mixed status — 3 competitors in same class, OK / MP / DNF sort order', () => {
    seqCounter = 0;
    const competitors = [
      comp({ id: 'c-anna', name: 'Anna', cardNumber: 1 }),
      comp({ id: 'c-bo', name: 'Bo', cardNumber: 2 }),
      comp({ id: 'c-cia', name: 'Cia', cardNumber: 3 }),
    ];
    const events = [
      cardRead(1, [p(31), p(32), p(33), p(34)], hd(10 * 3600), hd(10 * 3600 + 600)), // Anna OK
      cardRead(2, [p(31), p(33), p(34)], hd(10 * 3600), hd(10 * 3600 + 700)), // Bo MP (missing 32)
      cardRead(3, [p(31), p(32)], hd(10 * 3600), null), // Cia DNF (no finish)
    ];
    const state = reduce({
      competition_id: 'comp-1',
      events,
      competitors,
      classes: [cls('cls-H21', 'H21')],
      courses: [course('cls-H21', [31, 32, 33, 34])],
    });
    const rows = state.results_by_class.get('cls-H21');
    assert.ok(rows);
    assert.equal(rows.length, 3);
    assert.equal(rows[0]!.status, 'OK');
    assert.equal(rows[0]!.name, 'Anna');
    assert.equal(rows[1]!.status, 'MP');
    assert.equal(rows[1]!.name, 'Bo');
    assert.equal(rows[2]!.status, 'DNF');
    assert.equal(rows[2]!.name, 'Cia');
  });

  test('test 5: manual_dnf overrides card_read OK', () => {
    seqCounter = 0;
    const events = [
      cardRead(1, [p(31), p(32), p(33), p(34)], hd(10 * 3600), hd(10 * 3600 + 600)),
      evt({ event_type: 'manual_dnf', competitor_id: 'c-anna', reason: 'pulled rib muscle' }),
    ];
    const state = reduce({
      competition_id: 'comp-1',
      events,
      competitors: [comp({ id: 'c-anna', cardNumber: 1 })],
      classes: [cls('cls-H21')],
      courses: [course('cls-H21', [31, 32, 33, 34])],
    });
    const anna = state.competitors.get('c-anna');
    assert.ok(anna);
    assert.equal(anna.status, 'DNF');
    assert.equal(anna.manual_dnf_reason, 'pulled rib muscle');
  });

  test('test 6: un_dnf reverts to the projected status', () => {
    seqCounter = 0;
    const events = [
      cardRead(1, [p(31), p(32), p(33), p(34)], hd(10 * 3600), hd(10 * 3600 + 600)),
      evt({ event_type: 'manual_dnf', competitor_id: 'c-anna', reason: 'oops' }),
      evt({ event_type: 'un_dnf', competitor_id: 'c-anna' }),
    ];
    const state = reduce({
      competition_id: 'comp-1',
      events,
      competitors: [comp({ id: 'c-anna', cardNumber: 1 })],
      classes: [cls('cls-H21')],
      courses: [course('cls-H21', [31, 32, 33, 34])],
    });
    const anna = state.competitors.get('c-anna');
    assert.ok(anna);
    assert.equal(anna.status, 'OK');
    assert.equal(anna.manual_dnf_reason, null);
    assert.equal(anna.elapsed_time_ms, 600 * 1000);
  });

  test('test 7: cross-competition isolation', () => {
    seqCounter = 0;
    const events = [
      cardRead(1, [p(31)], hd(10 * 3600), hd(10 * 3600 + 100), { competitionId: 'comp-1' }),
      cardRead(2, [p(31)], hd(10 * 3600), hd(10 * 3600 + 100), { competitionId: 'comp-2' }),
    ];
    const state = reduce({
      competition_id: 'comp-1',
      events,
      competitors: [
        comp({ id: 'c-anna', competitionId: 'comp-1', cardNumber: 1 }),
        comp({ id: 'c-bo', competitionId: 'comp-2', cardNumber: 2 }),
      ],
      classes: [cls('cls-H21')],
      courses: [course('cls-H21', [31])],
    });
    // c-bo is in comp-2 → filtered out of competitorsByCompetition.
    assert.equal(state.competitors.size, 1);
    assert.ok(state.competitors.get('c-anna'));
  });

  test('test 8: latest card_read wins (two reads for same competitor)', () => {
    seqCounter = 0;
    const events = [
      cardRead(1, [p(31), p(32)], hd(10 * 3600), hd(10 * 3600 + 500), { localSeq: 1 }),
      cardRead(1, [p(31), p(32), p(33), p(34)], hd(10 * 3600), hd(10 * 3600 + 800), {
        localSeq: 2,
      }),
    ];
    const state = reduce({
      competition_id: 'comp-1',
      events,
      competitors: [comp({ id: 'c-anna', cardNumber: 1 })],
      classes: [cls('cls-H21')],
      courses: [course('cls-H21', [31, 32, 33, 34])],
    });
    const anna = state.competitors.get('c-anna');
    assert.ok(anna);
    assert.equal(anna.status, 'OK'); // latest read was complete
    assert.equal(anna.elapsed_time_ms, 800 * 1000);
    assert.equal(anna.card_read_history.length, 2);
  });

  test('test 9: places skip null-elapsed (DNF/MP do not consume place numbers)', () => {
    seqCounter = 0;
    const competitors = [
      comp({ id: 'c-anna', name: 'Anna', cardNumber: 1 }),
      comp({ id: 'c-bo', name: 'Bo', cardNumber: 2 }),
      comp({ id: 'c-cia', name: 'Cia', cardNumber: 3 }),
    ];
    const events = [
      cardRead(1, [p(31), p(32), p(33), p(34)], hd(10 * 3600), hd(10 * 3600 + 500)), // Anna OK 500s
      cardRead(2, [p(31), p(32), p(33), p(34)], hd(10 * 3600), hd(10 * 3600 + 700)), // Bo OK 700s
      cardRead(3, [p(31), p(32)], hd(10 * 3600), null), // Cia DNF
    ];
    const state = reduce({
      competition_id: 'comp-1',
      events,
      competitors,
      classes: [cls('cls-H21')],
      courses: [course('cls-H21', [31, 32, 33, 34])],
    });
    const rows = state.results_by_class.get('cls-H21');
    assert.ok(rows);
    assert.equal(rows[0]!.place, 1);
    assert.equal(rows[1]!.place, 2);
    assert.equal(rows[2]!.place, null); // Cia DNF has no place
  });

  test('test 10: behind_leader — 3 OK competitors get 0 / +200s / +400s', () => {
    seqCounter = 0;
    const competitors = [
      comp({ id: 'c-anna', name: 'Anna', cardNumber: 1 }),
      comp({ id: 'c-bo', name: 'Bo', cardNumber: 2 }),
      comp({ id: 'c-cia', name: 'Cia', cardNumber: 3 }),
    ];
    const events = [
      cardRead(1, [p(31), p(32), p(33), p(34)], hd(10 * 3600), hd(10 * 3600 + 500)), // 500s
      cardRead(2, [p(31), p(32), p(33), p(34)], hd(10 * 3600), hd(10 * 3600 + 700)), // 700s
      cardRead(3, [p(31), p(32), p(33), p(34)], hd(10 * 3600), hd(10 * 3600 + 900)), // 900s
    ];
    const state = reduce({
      competition_id: 'comp-1',
      events,
      competitors,
      classes: [cls('cls-H21')],
      courses: [course('cls-H21', [31, 32, 33, 34])],
    });
    const rows = state.results_by_class.get('cls-H21');
    assert.ok(rows);
    assert.deepEqual(
      rows.map((r) => r.behind_leader_ms),
      [0, 200_000, 400_000]
    );
    assert.deepEqual(
      rows.map((r) => r.place),
      [1, 2, 3]
    );
  });

  test('test 11 (C-H2 explicit reducer gate): finish=null → DNF regardless of full punch sequence', () => {
    // The Anna competitor has all 4 control punches in order, but the
    // card_read's payload.finish is null (operator killed the read
    // before the finish stamp). The reducer MUST emit DNF, not OK —
    // proving it reads payload.finish, not punches[] for magic codes.
    seqCounter = 0;
    const events = [cardRead(1, [p(31), p(32), p(33), p(34)], hd(10 * 3600), null)];
    const state = reduce({
      competition_id: 'comp-1',
      events,
      competitors: [comp({ id: 'c-anna', cardNumber: 1 })],
      classes: [cls('cls-H21')],
      courses: [course('cls-H21', [31, 32, 33, 34])],
    });
    const anna = state.competitors.get('c-anna');
    assert.ok(anna);
    assert.equal(anna.status, 'DNF');
    assert.equal(anna.elapsed_time_ms, null);
    assert.equal(anna.latest_finish, null);
    assert.ok(anna.latest_start);
  });

  test('test 12 (C-H2 explicit reducer gate): elapsed computed from payload.start/finish pair', () => {
    seqCounter = 0;
    const events = [
      cardRead(1, [p(31), p(32), p(33), p(34)], hd(10 * 3600), hd(10 * 3600 + 15 * 60)),
    ];
    const state = reduce({
      competition_id: 'comp-1',
      events,
      competitors: [comp({ id: 'c-anna', cardNumber: 1 })],
      classes: [cls('cls-H21')],
      courses: [course('cls-H21', [31, 32, 33, 34])],
    });
    const anna = state.competitors.get('c-anna');
    assert.ok(anna);
    assert.equal(anna.elapsed_time_ms, 15 * 60 * 1000);
  });

  test('test 13 (C-H2 explicit gate): card_read_history preserves start/finish clocks per read', () => {
    seqCounter = 0;
    const events = [
      cardRead(1, [p(31)], hd(10 * 3600), hd(10 * 3600 + 100), { localSeq: 1 }),
      cardRead(1, [p(31), p(32), p(33), p(34)], hd(11 * 3600), hd(11 * 3600 + 200), {
        localSeq: 2,
      }),
    ];
    const state = reduce({
      competition_id: 'comp-1',
      events,
      competitors: [comp({ id: 'c-anna', cardNumber: 1 })],
      classes: [cls('cls-H21')],
      courses: [course('cls-H21', [31, 32, 33, 34])],
    });
    const anna = state.competitors.get('c-anna');
    assert.ok(anna);
    assert.equal(anna.card_read_history.length, 2);
    assert.notEqual(anna.card_read_history[0]!.finish, null);
    assert.notEqual(anna.card_read_history[1]!.finish, null);
    assert.deepEqual(anna.card_read_history[0]!.finish, hd(10 * 3600 + 100));
    assert.deepEqual(anna.card_read_history[1]!.finish, hd(11 * 3600 + 200));
    assert.deepEqual(anna.card_read_history[0]!.start, hd(10 * 3600));
    assert.deepEqual(anna.card_read_history[1]!.start, hd(11 * 3600));
  });
});

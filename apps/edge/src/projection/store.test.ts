// Authored for fartol. Not ported from upstream.
//
// node:test coverage for ProjectionStore (plan 08 task 1 + task 2).
//
// Task 1 test matrix:
//   1. recomputeNow on an unknown competition returns null + emits zero
//      broadcasts (silent fall-through; required by ws hello handler).
//   2. recomputeNow on a seeded competition caches + broadcasts one
//      results_update envelope per class.
//   3. markDirty with a short debounce coalesces multiple calls into one
//      recompute + one broadcast batch.
//   4. dispose() cancels pending recomputes; subsequent markDirty is a
//      no-op.
//
// Task 2 test matrix (B-2 regression gate):
//   5. When the bridge is replayed with getActiveCompetitionId === null,
//      store.markDirty is invoked zero times (paired assertion with
//      bridge.test.ts test 2).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as url from 'node:url';
import { EventEmitter } from 'node:events';

import { SiMainStation } from '@fartol/sportident';
import type { ISerialTransport } from '@fartol/sportident';

import { openDatabase } from '../db/index.ts';
import type { DbHandle } from '../db/index.ts';
import { classes, controls, courses, courseControls, competitors } from '../db/schema.ts';
import { createProjectionStore, type ProjectionStore } from './store.ts';
import type { ChannelName } from '@fartol/shared-types';
import { resultsChannel } from '@fartol/shared-types';
import { attachBridge } from '../si/bridge.ts';

interface BroadcastCall {
  channel: ChannelName;
  envelope: { type: string; payload: unknown; seq: number };
}

function seedCompetition(
  handle: DbHandle,
  competitionId: string
): { classId: string; courseId: string; competitorId: string } {
  handle.sqlite
    .prepare(
      `INSERT INTO competitions (id, name, date, receipt_template, auto_print, created_at_ms)
       VALUES (?, ?, ?, 'classic', 0, ?)`
    )
    .run(competitionId, `Comp ${competitionId}`, '2026-05-14', 1_000);
  const classId = `cls-${competitionId}`;
  handle.db.insert(classes).values({ id: classId, competitionId, name: 'H21' }).run();
  const controlId = `ctl-${competitionId}-31`;
  handle.db.insert(controls).values({ id: controlId, competitionId, code: 31 }).run();
  const courseId = `crs-${competitionId}`;
  handle.db
    .insert(courses)
    .values({ id: courseId, competitionId, name: 'Course A', classId, lengthM: 1000 })
    .run();
  handle.db
    .insert(courseControls)
    .values({ id: `cc-${competitionId}-1`, courseId, controlId, orderIdx: 0 })
    .run();
  const competitorId = `cmp-${competitionId}`;
  handle.db
    .insert(competitors)
    .values({
      id: competitorId,
      competitionId,
      name: 'Anna',
      club: 'Test',
      classId,
      cardNumber: 7501853,
      consentAtMs: 1_000,
      consentStatus: 'explicit',
      scrubbedAtMs: null,
    })
    .run();
  return { classId, courseId, competitorId };
}

describe('ProjectionStore — cache + debounced recompute + broadcast', () => {
  test('test 1: recomputeNow on unknown competition returns null + zero broadcasts', () => {
    const handle = openDatabase(':memory:');
    try {
      const broadcasts: BroadcastCall[] = [];
      const store = createProjectionStore({
        handle,
        broadcast: (channel, envelope) => {
          broadcasts.push({ channel, envelope });
        },
        debounceMs: 0,
      });
      const result = store.recomputeNow('does-not-exist');
      assert.equal(result, null);
      assert.equal(broadcasts.length, 0);
      assert.equal(store.get('does-not-exist'), null);
      store.dispose();
    } finally {
      handle.close();
    }
  });

  test('test 2: recomputeNow caches + emits one results_update per class', () => {
    const handle = openDatabase(':memory:');
    try {
      const competitionId = 'comp-2';
      const { classId } = seedCompetition(handle, competitionId);
      const broadcasts: BroadcastCall[] = [];
      const store = createProjectionStore({
        handle,
        broadcast: (channel, envelope) => {
          broadcasts.push({ channel, envelope });
        },
        debounceMs: 0,
      });
      const state = store.recomputeNow(competitionId);
      assert.ok(state, 'recomputeNow must return non-null for a seeded competition');
      // Cached.
      assert.equal(store.get(competitionId), state);
      // One results_update envelope per class (1 class seeded).
      assert.equal(broadcasts.length, 1);
      assert.equal(broadcasts[0]!.channel, resultsChannel(competitionId));
      assert.equal(broadcasts[0]!.envelope.type, 'results_update');
      const payload = broadcasts[0]!.envelope.payload as {
        class_id: string;
        class_name: string;
        rows: unknown[];
      };
      assert.equal(payload.class_id, classId);
      assert.equal(payload.class_name, 'H21');
      assert.ok(Array.isArray(payload.rows));
      store.dispose();
    } finally {
      handle.close();
    }
  });

  test('test 3: markDirty coalesces multiple calls inside the debounce window', async () => {
    const handle = openDatabase(':memory:');
    try {
      const competitionId = 'comp-3';
      seedCompetition(handle, competitionId);
      const broadcasts: BroadcastCall[] = [];
      const store = createProjectionStore({
        handle,
        broadcast: (channel, envelope) => {
          broadcasts.push({ channel, envelope });
        },
        debounceMs: 10,
      });
      store.markDirty(competitionId);
      store.markDirty(competitionId);
      store.markDirty(competitionId);
      // Before debounce fires.
      assert.equal(broadcasts.length, 0);
      await sleep(40);
      // After debounce: one recompute → one envelope per class.
      assert.equal(broadcasts.length, 1, 'three markDirty calls must coalesce to one recompute');
      store.dispose();
    } finally {
      handle.close();
    }
  });

  test('test 4: dispose() cancels pending markDirty; later markDirty is a no-op', async () => {
    const handle = openDatabase(':memory:');
    try {
      const competitionId = 'comp-4';
      seedCompetition(handle, competitionId);
      const broadcasts: BroadcastCall[] = [];
      const store = createProjectionStore({
        handle,
        broadcast: (channel, envelope) => {
          broadcasts.push({ channel, envelope });
        },
        debounceMs: 50,
      });
      store.markDirty(competitionId);
      store.dispose();
      await sleep(80);
      assert.equal(broadcasts.length, 0, 'dispose must cancel the pending timer');
      // Second markDirty after dispose is a no-op.
      store.markDirty(competitionId);
      await sleep(80);
      assert.equal(broadcasts.length, 0);
    } finally {
      handle.close();
    }
  });

  // ---------------------------------------------------------------------------
  // Task 2 — B-2 regression gate: an SI10 fixture replay through the bridge
  // with getActiveCompetitionId === null must produce ZERO markDirty calls
  // on the projection store. Paired with bridge.test.ts test 9.
  // ---------------------------------------------------------------------------

  const HERE = path.dirname(url.fileURLToPath(import.meta.url));
  const FIXTURE_DIR = path.resolve(
    HERE,
    '..',
    '..',
    '..',
    '..',
    'packages',
    'sportident',
    'tests',
    'fixtures',
    'jonas'
  );

  interface Step {
    dir: 'out' | 'in';
    bytes: number[];
  }
  function hexEncode(bytes: number[]): string {
    return bytes.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
  }
  function parseTranscript(raw: string): Step[] {
    const steps: Step[] = [];
    for (const lineRaw of raw.split('\n')) {
      const line = lineRaw.trim();
      if (line.length === 0 || line.startsWith('#')) continue;
      const m = /^(out|in)\s+([0-9A-Fa-f \t]+)$/.exec(line);
      if (!m) throw new Error(`bad transcript line: ${JSON.stringify(line)}`);
      const dir = m[1] as 'out' | 'in';
      const bytes = m[2]!
        .split(/\s+/)
        .filter((s) => s.length > 0)
        .map((s) => parseInt(s, 16));
      steps.push({ dir, bytes });
    }
    return steps;
  }
  class PlaybackTransport extends EventEmitter implements ISerialTransport {
    private cursor = 0;
    private err: string | null = null;
    private readonly steps: Step[];
    constructor(steps: Step[]) {
      super();
      this.steps = steps;
    }
    open(): Promise<void> {
      return Promise.resolve();
    }
    send(bytes: number[]): Promise<void> {
      if (this.err) return Promise.reject(new Error(this.err));
      if (bytes.length === 1 && bytes[0] === 0x06) {
        const step = this.steps[this.cursor];
        if (
          step === undefined ||
          step.dir !== 'out' ||
          step.bytes.length !== 1 ||
          step.bytes[0] !== 0x06
        ) {
          return Promise.resolve();
        }
      }
      const step = this.steps[this.cursor];
      if (!step || step.dir !== 'out') {
        this.err = `out mismatch at cursor=${this.cursor} (sent ${hexEncode(bytes)})`;
        return Promise.reject(new Error(this.err));
      }
      if (hexEncode(step.bytes) !== hexEncode(bytes)) {
        this.err = `out byte mismatch at step ${this.cursor}`;
        return Promise.reject(new Error(this.err));
      }
      this.cursor++;
      while (this.cursor < this.steps.length && this.steps[this.cursor]!.dir === 'in') {
        const chunk = this.steps[this.cursor]!.bytes;
        this.cursor++;
        setImmediate(() => this.emit('data', chunk));
      }
      return Promise.resolve();
    }
    close(): Promise<void> {
      setImmediate(() => this.emit('close'));
      return Promise.resolve();
    }
    pumpRemaining(perTickMs: number = 5): Promise<void> {
      return new Promise<void>((resolve) => {
        const tick = (): void => {
          const step = this.steps[this.cursor];
          if (!step || step.dir === 'out') return resolve();
          this.cursor++;
          setImmediate(() => this.emit('data', step.bytes));
          setTimeout(tick, perTickMs);
        };
        setTimeout(tick, perTickMs);
      });
    }
  }

  test('test 5 (B-2): store.markDirty is NOT invoked from the bridge when no active competition', async () => {
    const handle = openDatabase(':memory:');
    try {
      // Seed comp so the projection store could recompute in principle.
      handle.sqlite
        .prepare(
          `INSERT INTO competitions (id, name, date, receipt_template, auto_print, created_at_ms)
           VALUES ('comp-1', 'C', '2026-01-01', 'classic', 0, 0)`
        )
        .run();

      const realStore = createProjectionStore({
        handle,
        broadcast: () => {},
        debounceMs: 0,
      });
      let markDirtyCount = 0;
      const spyStore: ProjectionStore = {
        get: (id) => realStore.get(id),
        markDirty: (id) => {
          markDirtyCount++;
          realStore.markDirty(id);
        },
        recomputeNow: (id) => realStore.recomputeNow(id),
        dispose: () => realStore.dispose(),
      };

      const raw = fs.readFileSync(path.join(FIXTURE_DIR, 'si10-jonas-001.bytes.hex'), 'utf8');
      const steps = parseTranscript(raw);
      const transport = new PlaybackTransport(steps);
      const station = new SiMainStation(transport);
      const attached = attachBridge(station, {
        handle,
        nodeId: 'node-store-test',
        getActiveCompetitionId: () => null,
        broadcast: () => {},
        projectionStore: spyStore,
      });
      try {
        await transport.open();
        await station.readCards();
        await transport.pumpRemaining();
        await sleep(80);
        await station.close();
      } finally {
        attached.detach();
      }
      assert.equal(
        markDirtyCount,
        0,
        `bridge must not markDirty when no active competition; got ${markDirtyCount}`
      );
      spyStore.dispose();
    } finally {
      handle.close();
    }
  });
});

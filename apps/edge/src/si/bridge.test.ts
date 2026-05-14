// Authored for fartol. Not ported from upstream.
//
// node:test coverage for the SI bridge — the adapter between Phase 0's
// SiMainStation and Phase 1's SQLite event log + WS broadcast. All tests run
// offline via a PlaybackTransport that replays Phase 0's committed Jonas bench
// fixtures (packages/sportident/tests/fixtures/jonas/{si5,si9,si10,siac}-jonas-
// 001.bytes.hex). /dev/ttyUSB0 is never touched.
//
// Coverage matrix:
//   1.  bench replay through bridge: SI10 fixture produces ≥4 events
//       (connection_changed:open + card_inserted + card_read + close);
//       card_read.payload.punches.length > 0 (B-1 regression).
//   1b. C-H2 — payload.finish + payload.start non-null on SI10 replay;
//       card_holder is null or a snake_case object; punch_count matches
//       payload.punches.length OR the card's c.punchCount. THIS is the
//       explicit regression gate against future revert to the truncated
//       plan-03 shape.
//   2.  T-IDLE-CHANNEL-LEAK — no broadcast when getActiveCompetitionId()
//       returns null. Sink call count exactly zero across the SI10 replay.
//   3.  Broadcast fires when active competition is set — all envelopes carry
//       channel === readout:<active-competition-id>; no 'readout:__idle__'.
//   4.  Events persist with competition_id=null when no active competition.
//   5.  Events scoped to active competition when set.
//   6.  REQ-EVT-002 — UPDATE events row throws via the append-only trigger.
//   7.  detach() stops further inserts on a subsequent station emit.
//   8.  Sequential local_seq across two fixtures back-to-back.
//
// PATTERNS S-2: every test opens a fresh `:memory:` db; the broadcast spy is
// a plain array passed by closure. No globals.
//
// Locked by:
// - .planning/phases/01-single-laptop-training-mvp/01-06-PLAN.md task 2
// - .planning/phases/01-single-laptop-training-mvp/01-REVIEWS.md §C-H2

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as url from 'node:url';
import { EventEmitter } from 'node:events';

import { SiMainStation } from '@fartol/sportident';
import type { ISerialTransport } from '@fartol/sportident';
import { eq, isNull } from 'drizzle-orm';

import { openDatabase } from '../db/index.ts';
import type { DbHandle } from '../db/index.ts';
import { events } from '../db/schema.ts';
import { attachBridge } from './bridge.ts';
import type { ChannelName } from '@fartol/shared-types';
import type { ProjectionStore } from '../projection/store.ts';
import type { CompetitionState } from '../projection/types.ts';

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

interface BroadcastCall {
  channel: ChannelName;
  envelope: { type: string; payload: unknown; seq?: number };
}

interface ReplayCtx {
  handle: DbHandle;
  broadcasts: BroadcastCall[];
  /** Plan 08 spy — counts markDirty calls per replay. */
  markDirtyCalls: string[];
}

/** No-op projection store with a markDirty counter. Plan 08 wired the
 * bridge to call store.markDirty after card_inserted + card_read; the
 * other three events must NOT call markDirty. */
function makeSpyProjectionStore(markDirtyCalls: string[]): ProjectionStore {
  return {
    get: (): CompetitionState | null => null,
    markDirty: (id) => {
      markDirtyCalls.push(id);
    },
    recomputeNow: (): CompetitionState | null => null,
    dispose: () => {},
  };
}

async function bootCtx(): Promise<ReplayCtx> {
  const handle = openDatabase(':memory:');
  // Seed two competitions so events with competition_id pass the FK.
  handle.sqlite
    .prepare(
      `INSERT INTO competitions (id, name, date, receipt_template, auto_print, created_at_ms)
       VALUES ('comp-1', 'C1', '2026-01-01', 'classic', 0, 0),
              ('comp-2', 'C2', '2026-01-01', 'classic', 0, 0)`
    )
    .run();
  return { handle, broadcasts: [], markDirtyCalls: [] };
}

async function replayFixtureThroughBridge(
  ctx: ReplayCtx,
  slug: string,
  getActiveCompetitionId: () => string | null
): Promise<void> {
  const raw = fs.readFileSync(path.join(FIXTURE_DIR, `${slug}-jonas-001.bytes.hex`), 'utf8');
  const steps = parseTranscript(raw);
  const transport = new PlaybackTransport(steps);
  const station = new SiMainStation(transport);
  const attached = attachBridge(station, {
    handle: ctx.handle,
    nodeId: 'node-bridge',
    getActiveCompetitionId,
    broadcast: (channel, envelope) => {
      ctx.broadcasts.push({ channel, envelope });
    },
    projectionStore: makeSpyProjectionStore(ctx.markDirtyCalls),
  });
  try {
    await transport.open();
    await station.readCards();
    await transport.pumpRemaining();
    await new Promise((r) => setTimeout(r, 80));
    await station.close();
  } finally {
    attached.detach();
  }
}

describe('SI bridge — offline PlaybackTransport replay against Jonas fixtures', () => {
  test('test 1: SI10 replay through bridge produces ≥4 events; card_read.punches.length > 0', async () => {
    const ctx = await bootCtx();
    try {
      await replayFixtureThroughBridge(ctx, 'si10', () => null);
      const rows = ctx.handle.db
        .select()
        .from(events)
        .where(eq(events.nodeId, 'node-bridge'))
        .all();
      // SI10 fixture: opening (transport opening) + open + card_inserted +
      // card_read + closed. Possibly multiple opening states. Just ≥4.
      assert.ok(rows.length >= 4, `expected ≥4 events, got ${rows.length}`);

      const cardReadRow = rows.find((r) => r.eventType === 'card_read');
      assert.ok(cardReadRow, 'card_read row must exist');
      const payload = cardReadRow.payload as { event_type: string; punches: unknown[] };
      assert.equal(payload.event_type, 'card_read');
      assert.ok(Array.isArray(payload.punches));
      assert.ok(payload.punches.length > 0, 'SI10 fixture has 2 punches');
    } finally {
      ctx.handle.close();
    }
  });

  test('test 1b (C-H2 — finish + start + card_holder + punch_count populated on SI10 replay)', async () => {
    const ctx = await bootCtx();
    try {
      await replayFixtureThroughBridge(ctx, 'si10', () => null);
      const cardReadRow = ctx.handle.db
        .select()
        .from(events)
        .where(eq(events.eventType, 'card_read'))
        .get();
      assert.ok(cardReadRow);
      const payload = cardReadRow.payload as {
        event_type: string;
        start: unknown;
        finish: unknown;
        check: unknown;
        clear: unknown;
        punch_count: number;
        punches: unknown[];
        card_holder: unknown;
      };
      // C-H2 regression gate — these four assertions catch any future
      // revert to the truncated plan-03 payload shape.
      assert.notEqual(
        payload.finish,
        null,
        'payload.finish must be non-null (SI10 has finishTime)'
      );
      assert.notEqual(payload.start, null, 'payload.start must be non-null');
      // SI10 fixture: check is populated, clear is null. Don't pin clear's
      // value strictly — the gate is about the SHAPE being present.
      // card_holder must be either null OR a Record<string, unknown> — never
      // undefined, never camelCase.
      assert.ok(
        payload.card_holder === null || typeof payload.card_holder === 'object',
        'card_holder must be null or an object'
      );
      if (payload.card_holder !== null && payload.card_holder !== undefined) {
        // snake_case key contract: NO uppercase letters in any key.
        for (const key of Object.keys(payload.card_holder as Record<string, unknown>)) {
          assert.ok(!/[A-Z]/.test(key), `card_holder key '${key}' must be snake_case`);
        }
      }
      // punch_count must equal punches.length OR be a valid card-reported
      // count >= punches.length. The SI10 fixture's punch_count is 2.
      assert.ok(typeof payload.punch_count === 'number');
      assert.ok(payload.punch_count >= payload.punches.length);
    } finally {
      ctx.handle.close();
    }
  });

  test('test 2 (T-IDLE-CHANNEL-LEAK): no broadcast when activeCompetitionId is null', async () => {
    const ctx = await bootCtx();
    try {
      await replayFixtureThroughBridge(ctx, 'si10', () => null);
      assert.equal(
        ctx.broadcasts.length,
        0,
        `expected 0 broadcasts when no active competition; got ${ctx.broadcasts.length}`
      );
      // Sanity: NO envelope ever carries a 'readout:__idle__' channel.
      for (const call of ctx.broadcasts) {
        assert.notEqual(call.channel, 'readout:__idle__');
      }
    } finally {
      ctx.handle.close();
    }
  });

  test('test 3: broadcast fires on readout:<active-comp-id> when activeCompetitionId is set', async () => {
    const ctx = await bootCtx();
    try {
      await replayFixtureThroughBridge(ctx, 'si10', () => 'comp-1');
      assert.ok(ctx.broadcasts.length > 0, 'expected at least one broadcast');
      for (const call of ctx.broadcasts) {
        assert.equal(
          call.channel,
          'readout:comp-1',
          `every envelope must target readout:comp-1; got ${call.channel}`
        );
      }
      // No phantom idle channel.
      const idle = ctx.broadcasts.find((c) => c.channel === 'readout:__idle__');
      assert.equal(idle, undefined);
    } finally {
      ctx.handle.close();
    }
  });

  test('test 4: events persist with competition_id=null when no active competition', async () => {
    const ctx = await bootCtx();
    try {
      await replayFixtureThroughBridge(ctx, 'si10', () => null);
      const nullComp = ctx.handle.db
        .select()
        .from(events)
        .where(isNull(events.competitionId))
        .all();
      assert.ok(nullComp.length > 0, 'every event should have competition_id IS NULL');
      const nonNull = ctx.handle.db
        .select()
        .from(events)
        .where(eq(events.competitionId, 'comp-1'))
        .all();
      assert.equal(nonNull.length, 0);
    } finally {
      ctx.handle.close();
    }
  });

  test('test 5: events scoped to active competition when set', async () => {
    const ctx = await bootCtx();
    try {
      await replayFixtureThroughBridge(ctx, 'si10', () => 'comp-1');
      const scoped = ctx.handle.db
        .select()
        .from(events)
        .where(eq(events.competitionId, 'comp-1'))
        .all();
      assert.ok(scoped.length > 0);
      const idle = ctx.handle.db.select().from(events).where(isNull(events.competitionId)).all();
      assert.equal(idle.length, 0);
    } finally {
      ctx.handle.close();
    }
  });

  test('test 6 (REQ-EVT-002): UPDATE on the events row throws via the append-only trigger', async () => {
    const ctx = await bootCtx();
    try {
      await replayFixtureThroughBridge(ctx, 'si10', () => null);
      const row = ctx.handle.db.select().from(events).get();
      assert.ok(row);
      assert.throws(
        () =>
          ctx.handle.sqlite
            .prepare(`UPDATE events SET event_type = 'mutated' WHERE node_id = ? AND local_seq = ?`)
            .run(row.nodeId, row.localSeq),
        /append-only/i
      );
    } finally {
      ctx.handle.close();
    }
  });

  test('test 7: detach() stops further inserts', async () => {
    const ctx = await bootCtx();
    try {
      const raw = fs.readFileSync(path.join(FIXTURE_DIR, 'si10-jonas-001.bytes.hex'), 'utf8');
      const steps = parseTranscript(raw);
      const transport = new PlaybackTransport(steps);
      const station = new SiMainStation(transport);
      const attached = attachBridge(station, {
        handle: ctx.handle,
        nodeId: 'node-detach',
        getActiveCompetitionId: () => null,
        broadcast: () => {},
        projectionStore: makeSpyProjectionStore([]),
      });
      // Detach BEFORE driving any events — no events should land.
      attached.detach();
      await transport.open();
      await station.readCards();
      await transport.pumpRemaining();
      await new Promise((r) => setTimeout(r, 80));
      await station.close();
      const rows = ctx.handle.db
        .select()
        .from(events)
        .where(eq(events.nodeId, 'node-detach'))
        .all();
      assert.equal(rows.length, 0, 'detach before drive must keep events table empty');
    } finally {
      ctx.handle.close();
    }
  });

  test('test 8: sequential local_seq across two fixtures replayed back-to-back', async () => {
    const ctx = await bootCtx();
    try {
      await replayFixtureThroughBridge(ctx, 'si10', () => null);
      const after1 = ctx.handle.db
        .select()
        .from(events)
        .where(eq(events.nodeId, 'node-bridge'))
        .all();
      const max1 = after1.reduce((m, r) => Math.max(m, r.localSeq), 0);

      await replayFixtureThroughBridge(ctx, 'si5', () => null);
      const after2 = ctx.handle.db
        .select()
        .from(events)
        .where(eq(events.nodeId, 'node-bridge'))
        .all();
      const max2 = after2.reduce((m, r) => Math.max(m, r.localSeq), 0);
      assert.ok(max2 > max1, `second replay should advance max localSeq (${max1} → ${max2})`);

      // Verify contiguity: 1..max2 all present.
      const seqs = new Set(after2.map((r) => r.localSeq));
      for (let s = 1; s <= max2; s++) {
        assert.ok(seqs.has(s), `local_seq ${s} missing`);
      }
    } finally {
      ctx.handle.close();
    }
  });

  // ---------------------------------------------------------------------------
  // Plan 08 — markDirty B-2 regression gates.
  // ---------------------------------------------------------------------------

  test('test 9 (plan 08 B-2): markDirty NOT invoked when activeCompetitionId is null', async () => {
    const ctx = await bootCtx();
    try {
      await replayFixtureThroughBridge(ctx, 'si10', () => null);
      assert.equal(
        ctx.markDirtyCalls.length,
        0,
        `bridge must not markDirty when no active competition; got ${ctx.markDirtyCalls.length}`
      );
    } finally {
      ctx.handle.close();
    }
  });

  test('test 10 (plan 08): markDirty fires on card_inserted + card_read when active competition is set', async () => {
    const ctx = await bootCtx();
    try {
      await replayFixtureThroughBridge(ctx, 'si10', () => 'comp-1');
      // SI10 fixture replays at least one card_inserted + one card_read.
      // Each calls markDirty once.
      assert.ok(
        ctx.markDirtyCalls.length >= 2,
        `expected markDirty >= 2 (card_inserted + card_read); got ${ctx.markDirtyCalls.length}`
      );
      // Every call must target the active competition.
      for (const id of ctx.markDirtyCalls) {
        assert.equal(id, 'comp-1', `markDirty must target comp-1; got ${id}`);
      }
    } finally {
      ctx.handle.close();
    }
  });
});

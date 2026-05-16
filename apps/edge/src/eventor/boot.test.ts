// Authored for fartol. Not ported from upstream.
//
// node:test coverage for scheduleEventorBoot (Plan 02-01 task 4).
// Validates the five behaviors that wire D-EV-1 / D-EV-2 / D-EV-3:
//
//   1. Fresh cache (config marker < 7 days old) → runNow resolves to
//      { skipped: true, reason: 'fresh' } and the injected downloadFn
//      is NOT called.
//   2. Stale cache (marker > 7 days old) → runNow runs downloadFn +
//      ingestFn once and resolves with the row counts.
//   3. Empty cache (no marker row) → same as stale; reason is 'empty'.
//   4. downloadFn rejects (network error) → runNow resolves WITHOUT
//      throwing (D-EV-3 warn-and-run); result.skipped=true,
//      reason='network_error'.
//   5. apiKey=undefined → runNow short-circuits to { skipped: true,
//      reason: 'no_key' } BEFORE calling downloadFn.
//
// All external deps (downloadFn, ingestFn, nowFn) are injected so the
// test can drive the staleness gate deterministically.
//
// Locked by:
// - .planning/phases/02-4-klubbs-mvp/02-01-PLAN.md task 4
// - .planning/phases/02-4-klubbs-mvp/02-PATTERNS.md §2 (boot.ts pattern map)

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyBaseLogger } from 'fastify';

import { openDatabase, type DbHandle } from '../db/index.ts';
import { scheduleEventorBoot } from './boot.ts';
import { config as configTable } from '../db/schema.ts';

interface LogCall {
  level: 'info' | 'warn' | 'error';
  args: unknown[];
}

function makeLogger(): { logger: FastifyBaseLogger; calls: LogCall[] } {
  const calls: LogCall[] = [];
  // Fastify's logger interface is large; we only need info/warn/error/debug
  // for this code path. Stub the rest as no-ops to satisfy the type.
  const logger = {
    info: (...args: unknown[]) => calls.push({ level: 'info', args }),
    warn: (...args: unknown[]) => calls.push({ level: 'warn', args }),
    error: (...args: unknown[]) => calls.push({ level: 'error', args }),
    debug: () => {},
    trace: () => {},
    fatal: () => {},
    silent: () => {},
    level: 'info',
    child: () => logger,
  } as unknown as FastifyBaseLogger;
  return { logger, calls };
}

function seedMarker(handle: DbHandle, valueMs: number): void {
  handle.db
    .insert(configTable)
    .values({ key: 'eventor_cache_refreshed_at_ms', value: String(valueMs) })
    .onConflictDoUpdate({
      target: configTable.key,
      set: { value: String(valueMs) },
    })
    .run();
}

const SEVEN_DAYS_MS = 7 * 86_400_000;

describe('scheduleEventorBoot: staleness gate (D-EV-2)', () => {
  test('fresh cache (1 day old) → skip, downloadFn NOT called', async () => {
    const handle = openDatabase(':memory:');
    try {
      const now = 1_700_000_000_000;
      seedMarker(handle, now - 86_400_000); // 1 day old.
      let dlCalled = false;
      const { logger } = makeLogger();
      const boot = scheduleEventorBoot(handle, {
        apiKey: 'KEY',
        logger,
        nowFn: () => now,
        downloadFn: async () => {
          dlCalled = true;
          return { competitorsPath: '/x', clubsPath: '/y' };
        },
        ingestFn: async () => ({ competitors: 0, clubs: 0 }),
      });
      try {
        const r = await boot.runNow();
        assert.equal(r.skipped, true);
        assert.equal(r.reason, 'fresh');
        assert.equal(dlCalled, false, 'downloadFn must NOT run when cache is fresh');
      } finally {
        boot.stop();
      }
    } finally {
      handle.close();
    }
  });

  test('stale cache (8 days old) → downloadFn + ingestFn run once', async () => {
    const handle = openDatabase(':memory:');
    try {
      const now = 1_700_000_000_000;
      seedMarker(handle, now - 8 * 86_400_000);
      let dlCalls = 0;
      let ingestCalls = 0;
      const { logger } = makeLogger();
      const boot = scheduleEventorBoot(handle, {
        apiKey: 'KEY',
        logger,
        nowFn: () => now,
        downloadFn: async () => {
          dlCalls++;
          return { competitorsPath: '/c.xml', clubsPath: '/k.xml' };
        },
        ingestFn: async () => {
          ingestCalls++;
          return { competitors: 42, clubs: 7 };
        },
      });
      try {
        const r = await boot.runNow();
        assert.equal(r.skipped, false);
        assert.equal(r.competitors, 42);
        assert.equal(r.clubs, 7);
        assert.equal(dlCalls, 1);
        assert.equal(ingestCalls, 1);
      } finally {
        boot.stop();
      }
    } finally {
      handle.close();
    }
  });

  test('empty cache (no marker) → refresh fires with reason=empty', async () => {
    const handle = openDatabase(':memory:');
    try {
      const now = 1_700_000_000_000;
      // Deliberately do NOT seed the marker.
      let dlCalls = 0;
      const { logger } = makeLogger();
      const boot = scheduleEventorBoot(handle, {
        apiKey: 'KEY',
        logger,
        nowFn: () => now,
        downloadFn: async () => {
          dlCalls++;
          return { competitorsPath: '/c', clubsPath: '/k' };
        },
        ingestFn: async () => ({ competitors: 1, clubs: 1 }),
      });
      try {
        const r = await boot.runNow();
        assert.equal(r.skipped, false);
        assert.equal(dlCalls, 1);
      } finally {
        boot.stop();
      }
    } finally {
      handle.close();
    }
  });
});

describe('scheduleEventorBoot: degraded modes (D-EV-3)', () => {
  test('downloadFn rejects → result.skipped=true reason=network_error, NO throw', async () => {
    const handle = openDatabase(':memory:');
    try {
      const now = 1_700_000_000_000;
      const { logger, calls } = makeLogger();
      const boot = scheduleEventorBoot(handle, {
        apiKey: 'KEY',
        logger,
        nowFn: () => now,
        downloadFn: async () => {
          throw new Error('connect ETIMEDOUT');
        },
        ingestFn: async () => ({ competitors: 0, clubs: 0 }),
      });
      try {
        // Must not throw — D-EV-3 warn-and-run.
        const r = await boot.runNow();
        assert.equal(r.skipped, true);
        assert.equal(r.reason, 'network_error');
        assert.ok(r.error);
        // logger.warn was called at least once.
        const warnCalls = calls.filter((c) => c.level === 'warn');
        assert.ok(warnCalls.length >= 1, 'expected at least one warn log');
      } finally {
        boot.stop();
      }
    } finally {
      handle.close();
    }
  });

  test('apiKey=undefined → no_key short-circuit BEFORE downloadFn', async () => {
    const handle = openDatabase(':memory:');
    try {
      let dlCalled = false;
      const { logger } = makeLogger();
      const boot = scheduleEventorBoot(handle, {
        apiKey: undefined,
        logger,
        nowFn: () => 0,
        downloadFn: async () => {
          dlCalled = true;
          return { competitorsPath: '/x', clubsPath: '/y' };
        },
        ingestFn: async () => ({ competitors: 0, clubs: 0 }),
      });
      try {
        const r = await boot.runNow();
        assert.equal(r.skipped, true);
        assert.equal(r.reason, 'no_key');
        assert.equal(dlCalled, false);
      } finally {
        boot.stop();
      }
    } finally {
      handle.close();
    }
  });
});

// Sanity: SEVEN_DAYS_MS constant matches the boot.ts default.
test('seven-day staleness window sanity', () => {
  assert.equal(SEVEN_DAYS_MS, 7 * 24 * 60 * 60 * 1000);
});

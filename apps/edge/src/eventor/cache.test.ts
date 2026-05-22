// Authored for fartol. Not ported from upstream.
//
// node:test coverage for the Eventor cache + download pipeline
// (Plan 02-01 task 3). Validates:
//
//   - downloadEventorPayloads:
//     * succeeds with a mock fetch returning gzipped fixture bytes →
//       writes temp files containing the gunzipped XML.
//     * throws "missing api key" if apiKey is undefined BEFORE making
//       any HTTP call (D-EV-3 fail-fast).
//     * constructs the documented cachedcompetitors URL
//       `…/export/cachedcompetitors?includePreselectedClasses=false&zip=true&version=3.0`
//       (per the SOFT API guide) and sends `ApiKey: <key>` header.
//
//   - ingestEventorCache:
//     * inserts 3 fixture competitors + 3 fixture clubs into the schema
//       (migration 0002 applied) and writes the audit marker config row
//       eventor_cache_refreshed_at_ms = nowMs.
//     * second call with a 2-competitor fixture replaces the prior 3
//       rows (TRUNCATE+INSERT semantics — no merge artifacts).
//     * rolls back the snapshot on a parse error mid-stream — prior
//       cache + config marker stay intact.
//
// Locked by:
// - .planning/phases/02-4-klubbs-mvp/02-01-PLAN.md task 3
// - .planning/phases/02-4-klubbs-mvp/02-RESEARCH.md §Pattern 2 (the
//   ingestEventorCache template — Drizzle bulk insert in batches of
//   1000 inside one transaction; config marker upsert inside)

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { openDatabase, type DbHandle } from '../db/index.ts';
import { downloadEventorPayloads } from './download.ts';
import { ingestEventorCache } from './cache.ts';
import { eventorCompetitors, eventorClubs, config as configTable } from '../db/schema.ts';
import { eq } from 'drizzle-orm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIX_DIR = path.join(__dirname, '__fixtures__');
const COMPETITORS_XML = path.join(FIX_DIR, 'competitors-sample.xml');
const COMPETITORS_ZIP = path.join(FIX_DIR, 'competitors-sample.zip');
const CLUBS_XML = path.join(FIX_DIR, 'clubs-sample.xml');

interface FetchCall {
  url: string;
  init: RequestInit | undefined;
}

function makeMockFetch(competitorsBytes: Buffer, clubsBytes: Buffer) {
  const calls: FetchCall[] = [];
  const impl: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.toString();
    calls.push({ url, init });
    // Route by URL suffix.
    const bytes = url.includes('cachedcompetitors') ? competitorsBytes : clubsBytes;
    // Wrap in Uint8Array — Buffer extends Uint8Array but Response's BodyInit
    // type doesn't include Buffer directly.
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: { 'content-type': 'application/zip' },
    });
  };
  return { impl, calls };
}

describe('downloadEventorPayloads — URL + header + tempfile shape', () => {
  test('throws "missing api key" when apiKey is undefined; no fetch call', async () => {
    let called = false;
    const noOpFetch: typeof fetch = async () => {
      called = true;
      return new Response('', { status: 500 });
    };
    await assert.rejects(
      () =>
        downloadEventorPayloads({
          apiKey: undefined,
          fetchImpl: noOpFetch,
        }),
      /missing api key/i
    );
    assert.equal(called, false, 'fetch must NOT be called when apiKey missing');
  });

  test('constructs the documented cachedcompetitors URL and sends ApiKey header', async () => {
    const compGz = gzipSync(readFileSync(COMPETITORS_XML));
    const clubsGz = gzipSync(readFileSync(CLUBS_XML));
    const { impl, calls } = makeMockFetch(compGz, clubsGz);
    const tmp = mkdtempSync(path.join(tmpdir(), 'fartol-eventor-dl-'));
    try {
      const result = await downloadEventorPayloads({
        apiKey: 'TEST-KEY-1234',
        fetchImpl: impl,
        tmpDir: tmp,
      });
      assert.ok(result.competitorsPath);
      assert.ok(result.clubsPath);
      // Both calls expected.
      assert.equal(calls.length, 2);
      const compCall = calls.find((c) => c.url.includes('cachedcompetitors'));
      assert.ok(compCall);
      assert.equal(
        compCall.url,
        'https://eventor.orientering.se/api/export/cachedcompetitors?includePreselectedClasses=false&zip=true&version=3.0'
      );
      const headers = new Headers(compCall.init?.headers);
      assert.equal(headers.get('apikey'), 'TEST-KEY-1234');

      const clubsCall = calls.find((c) => c.url.includes('/export/clubs'));
      assert.ok(clubsCall);

      // Tempfile contents must be the un-gzipped XML.
      const compXml = readFileSync(result.competitorsPath, 'utf8');
      assert.match(compXml, /CompetitorList/);
      const clubsXml = readFileSync(result.clubsPath, 'utf8');
      assert.match(clubsXml, /OrganisationList|ClubList/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('extracts PKZIP archive (real Eventor zip=true format) to tempfile XML', async () => {
    // Eventor's /export/cachedcompetitors?zip=true returns a PKZIP archive
    // containing a single .xml entry (NOT a gzip stream — that misread cost
    // a debug cycle on 2026-05-17 with Z_DATA_ERROR "incorrect header check"
    // when the old createGunzip path met real Eventor bytes). competitors
    // path = PKZIP; clubs path = plain XML (no zip parameter in URL).
    const compZipBytes = readFileSync(COMPETITORS_ZIP);
    const clubsXmlBytes = readFileSync(CLUBS_XML);
    const { impl } = makeMockFetch(compZipBytes, clubsXmlBytes);
    const tmp = mkdtempSync(path.join(tmpdir(), 'fartol-eventor-pkzip-'));
    try {
      const result = await downloadEventorPayloads({
        apiKey: 'TEST-KEY-1234',
        fetchImpl: impl,
        tmpDir: tmp,
      });
      const compXml = readFileSync(result.competitorsPath, 'utf8');
      assert.match(compXml, /CompetitorList/, 'PKZIP-extracted XML should match fixture');
      const clubsXml = readFileSync(result.clubsPath, 'utf8');
      assert.match(
        clubsXml,
        /OrganisationList|ClubList/,
        'plain-XML clubs body should pass through'
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('rejects body with neither PKZIP / gzip / XML magic with a descriptive error', async () => {
    const junk = Buffer.from([0xff, 0xfe, 0xfd, 0xfc, 0xfb]);
    const { impl } = makeMockFetch(junk, junk);
    const tmp = mkdtempSync(path.join(tmpdir(), 'fartol-eventor-junk-'));
    try {
      await assert.rejects(
        () =>
          downloadEventorPayloads({
            apiKey: 'TEST-KEY-1234',
            fetchImpl: impl,
            tmpDir: tmp,
          }),
        /unknown format.*PKZIP.*gzip.*XML/i
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('ingestEventorCache — bulk-upsert + config marker + rollback', () => {
  function withDb(fn: (handle: DbHandle) => void | Promise<void>): Promise<void> {
    const handle = openDatabase(':memory:');
    return Promise.resolve(fn(handle)).finally(() => handle.close());
  }

  test('inserts 3 competitors + 3 clubs, writes config marker', async () => {
    await withDb(async (handle) => {
      const result = await ingestEventorCache(
        handle,
        COMPETITORS_XML,
        CLUBS_XML,
        1_700_000_000_000
      );
      assert.equal(result.competitors, 3);
      assert.equal(result.clubs, 3);

      const rows = handle.db.select().from(eventorCompetitors).all();
      assert.equal(rows.length, 3);
      const ids = rows.map((r) => r.personId).sort((a, b) => a - b);
      assert.deepEqual(ids, [1001, 1002, 1003]);

      const clubs = handle.db.select().from(eventorClubs).all();
      assert.equal(clubs.length, 3);
      const clubIds = clubs.map((c) => c.clubId).sort((a, b) => a - b);
      assert.deepEqual(clubIds, [8, 320, 637]);

      const marker = handle.db
        .select()
        .from(configTable)
        .where(eq(configTable.key, 'eventor_cache_refreshed_at_ms'))
        .get();
      assert.ok(marker);
      assert.equal(marker.value, '1700000000000');
    });
  });

  test('second call replaces prior snapshot (TRUNCATE+INSERT, no merge artifacts)', async () => {
    await withDb(async (handle) => {
      // First call — 3 competitors land.
      await ingestEventorCache(handle, COMPETITORS_XML, CLUBS_XML, 1);
      assert.equal(handle.db.select().from(eventorCompetitors).all().length, 3);

      // Second call with a smaller 2-record fixture (write to a tmpfile).
      const tmp = mkdtempSync(path.join(tmpdir(), 'fartol-eventor-snap-'));
      const smaller = path.join(tmp, 'smaller.xml');
      writeFileSync(
        smaller,
        `<?xml version="1.0" encoding="UTF-8"?>
<CompetitorList iofVersion="3.0" xmlns="http://www.orienteering.org/datastandard/3.0">
  <Competitor modifyTime="2024-12-12T09:46:45Z">
    <Person sex="M"><Id type="Sweden">2001</Id><Name><Family>A</Family><Given>X</Given></Name></Person>
  </Competitor>
  <Competitor modifyTime="2024-12-12T09:46:45Z">
    <Person sex="F"><Id type="Sweden">2002</Id><Name><Family>B</Family><Given>Y</Given></Name></Person>
  </Competitor>
</CompetitorList>`
      );
      try {
        const r = await ingestEventorCache(handle, smaller, CLUBS_XML, 2);
        assert.equal(r.competitors, 2);
        const rows = handle.db.select().from(eventorCompetitors).all();
        // Exactly 2, NOT 5 (TRUNCATE+INSERT semantics).
        assert.equal(rows.length, 2);
        const ids = rows.map((r) => r.personId).sort((a, b) => a - b);
        assert.deepEqual(ids, [2001, 2002]);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });
  });

  test('rolls back snapshot on parse error mid-stream — prior cache + marker survive', async () => {
    await withDb(async (handle) => {
      // Seed a known-good snapshot first.
      await ingestEventorCache(handle, COMPETITORS_XML, CLUBS_XML, 1_111_111);
      assert.equal(handle.db.select().from(eventorCompetitors).all().length, 3);

      // Construct an XML file that will trigger a parse error when streamed.
      // saxes will throw on malformed XML; here we use a tag-imbalance shape.
      const tmp = mkdtempSync(path.join(tmpdir(), 'fartol-eventor-bad-'));
      const bad = path.join(tmp, 'broken.xml');
      writeFileSync(
        bad,
        `<?xml version="1.0" encoding="UTF-8"?>
<CompetitorList>
  <Competitor>
    <Person><Id>1</Id></Person>
  </Competitor>
  <Competitor>
    <Person><Id>2</Id></PersonWRONG>
  </Competitor>
</CompetitorList>`
      );
      try {
        await assert.rejects(() => ingestEventorCache(handle, bad, CLUBS_XML, 9_999_999), /./);
        // Prior 3 competitors must still be present.
        const rows = handle.db.select().from(eventorCompetitors).all();
        assert.equal(rows.length, 3, 'rollback preserves prior snapshot');
        // Config marker must NOT have advanced.
        const marker = handle.db
          .select()
          .from(configTable)
          .where(eq(configTable.key, 'eventor_cache_refreshed_at_ms'))
          .get();
        assert.equal(marker?.value, '1111111', 'marker must NOT advance on failure');
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });
  });
});

// Smoke test: the fixture files exist on disk where the parser tests expect.
test('fixture files present', () => {
  assert.ok(existsSync(COMPETITORS_XML));
  assert.ok(existsSync(CLUBS_XML));
});

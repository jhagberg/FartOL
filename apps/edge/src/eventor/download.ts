// Authored for fartol. Not ported from upstream.
//
// Eventor download module (Plan 02-01 task 3). Pure HTTP + gunzip; no DB
// writes (cache.ts owns the SQLite side).
//
//   downloadEventorPayloads({ apiKey, fetchImpl?, tmpDir?, baseUrl? })
//     → { competitorsPath, clubsPath }
//
// Behavior:
//   1. Fail fast with "missing api key" when apiKey is undefined / empty
//      — NO fetch call. This is the D-EV-3 short-circuit; the boot
//      scheduler converts the throw into a logged warning so a missing
//      key never blocks bridge startup.
//   2. Construct the exact MeOS-mirroring URL for the cachedcompetitors
//      endpoint:
//         {baseUrl}export/cachedcompetitors?includePreselectedClasses=false&zip=true&version=3.0
//      (Landmine: MeOS source TabCompetition.cpp:3107-3108 uses this
//       suffix verbatim; any deviation breaks the same key compatibility.)
//   3. Construct the clubs endpoint:
//         {baseUrl}export/clubs?version=3.0
//   4. Both requests carry the `ApiKey: <opts.apiKey>` header.
//   5. Response bodies are gzipped; pipe through node:zlib's createGunzip
//      into tempfiles under opts.tmpDir (default os.tmpdir()). The
//      returned paths are absolute; the caller is responsible for
//      cleanup once ingestEventorCache has consumed them.
//
// Threat register entries this satisfies:
//   - T-02-06 (boot fetch hangs bridge): timeout via AbortController
//     fires after 60 s by default; caller may override via abortSignal.
//   - T-02-04 (refresh blocks startup): the boot.ts module wraps this
//     call in a fire-and-forget; this module merely surfaces errors as
//     thrown rejections.
//
// Locked by:
// - .planning/phases/02-4-klubbs-mvp/02-01-PLAN.md task 3
// - .planning/phases/02-4-klubbs-mvp/02-RESEARCH.md §Landmines
//   ("MeOS Eventor download uses eventorBase + iofExportVersion")
// - .planning/research/eventor-api-smoke.md §"Download pipeline"

import { createGunzip } from 'node:zlib';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

export interface EventorDownloadOpts {
  /** Eventor API key. When undefined or empty, download throws BEFORE issuing
   * any HTTP request (D-EV-3 fail-fast for the no-key boot path). */
  apiKey: string | undefined;
  /** Override the global fetch — used by tests to inject mock responses. */
  fetchImpl?: typeof fetch;
  /** Directory for the gunzipped XML tempfiles. Default os.tmpdir(). */
  tmpDir?: string;
  /** Base URL for the Eventor REST API (trailing slash required). Default:
   *  https://eventor.orientering.se/api/ . */
  baseUrl?: string;
  /** AbortSignal for caller-controlled cancellation. */
  abortSignal?: AbortSignal;
  /** Per-request timeout in ms before AbortController fires. Default 60 000. */
  timeoutMs?: number;
}

export interface EventorDownloadResult {
  competitorsPath: string;
  clubsPath: string;
}

const DEFAULT_BASE_URL = 'https://eventor.orientering.se/api/';
const DEFAULT_TIMEOUT_MS = 60_000;

/** Exact suffix MeOS hard-codes — see TabCompetition.cpp:3107-3108. */
const COMPETITORS_SUFFIX =
  'export/cachedcompetitors?includePreselectedClasses=false&zip=true&version=3.0';
const CLUBS_SUFFIX = 'export/clubs?version=3.0';

async function fetchAndUnzipTo(
  url: string,
  destPath: string,
  apiKey: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  abortSignal: AbortSignal | undefined
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // Compose external abort with internal timeout.
  if (abortSignal) {
    if (abortSignal.aborted) controller.abort();
    else abortSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  try {
    const res = await fetchImpl(url, {
      method: 'GET',
      headers: { ApiKey: apiKey },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`eventor fetch failed: ${res.status} ${res.statusText} (${url})`);
    }
    if (!res.body) {
      throw new Error(`eventor fetch returned empty body (${url})`);
    }
    // res.body is a Web ReadableStream — convert to a Node Readable for pipeline.
    const nodeStream = Readable.fromWeb(res.body as unknown as import('stream/web').ReadableStream);
    await pipeline(nodeStream, createGunzip(), createWriteStream(destPath));
  } finally {
    clearTimeout(timer);
  }
}

export async function downloadEventorPayloads(
  opts: EventorDownloadOpts
): Promise<EventorDownloadResult> {
  if (!opts.apiKey || opts.apiKey.length === 0) {
    // D-EV-3 fail-fast — boot.ts converts this into a logged skip rather
    // than blocking startup.
    throw new Error('missing api key');
  }
  const fetchImpl = opts.fetchImpl ?? fetch;
  const tmpDir = opts.tmpDir ?? os.tmpdir();
  const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // Per-call unique suffixes so concurrent refreshes (unlikely but possible
  // with the admin button) don't collide on shared tempfile names.
  const suffix = `${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  const competitorsPath = path.join(tmpDir, `eventor-competitors-${suffix}.xml`);
  const clubsPath = path.join(tmpDir, `eventor-clubs-${suffix}.xml`);

  await fetchAndUnzipTo(
    baseUrl + COMPETITORS_SUFFIX,
    competitorsPath,
    opts.apiKey,
    fetchImpl,
    timeoutMs,
    opts.abortSignal
  );
  await fetchAndUnzipTo(
    baseUrl + CLUBS_SUFFIX,
    clubsPath,
    opts.apiKey,
    fetchImpl,
    timeoutMs,
    opts.abortSignal
  );

  return { competitorsPath, clubsPath };
}

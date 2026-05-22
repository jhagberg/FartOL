// Authored for fartola. Not ported from upstream.
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
//   2. Construct the documented `cachedcompetitors` URL exactly as
//      specified by the SOFT API guide (.reference/Guide_Eventor_-_Hamta_
//      data_via_API.pdf) / https://eventor.orientering.se/api/documentation:
//         {baseUrl}export/cachedcompetitors?includePreselectedClasses=false&zip=true&version=3.0
//      (Landmine: this exact suffix string is load-bearing — Eventor
//       buckets cached responses per-URL, so deviation costs us shared
//       cache benefits with any other client at the same club using the
//       same API key.)
//   3. Construct the clubs endpoint:
//         {baseUrl}export/clubs?version=3.0
//   4. Both requests carry the `ApiKey: <opts.apiKey>` header.
//   5. Response bodies are PKZIP archives (Content-Type: application/zip,
//      magic 50 4b 03 04), NOT gzip streams — `zip=true` in the URL is the
//      Eventor-defined archive-container flag (per the SOFT API guide),
//      not an HTTP-level compression hint. The archive contains a single XML entry; yauzl streams the
//      entry to a tempfile under opts.tmpDir (default os.tmpdir()) without
//      buffering the full 90 MB uncompressed body. The returned paths are
//      absolute; the caller is responsible for cleanup once
//      ingestEventorCache has consumed them.
//
//      The clubs endpoint (zip=false) returns plain XML; the same fetch
//      path detects format via magic bytes and skips the unzip step.
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
// - .planning/research/eventor-api-smoke.md §"Download pipeline"

import { createGunzip } from 'node:zlib';
import { createReadStream, createWriteStream, promises as fsp } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { setTimeout as setTimer, clearTimeout as clearTimer } from 'node:timers';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import yauzl from 'yauzl';

export interface EventorDownloadOpts {
  /** Eventor API key. When undefined or empty, download throws BEFORE issuing
   * any HTTP request (D-EV-3 fail-fast for the no-key boot path). */
  apiKey: string | undefined;
  /** Override the global fetch — used by tests to inject mock responses. */
  fetchImpl?: typeof fetch;
  /** Directory for the decoded XML tempfiles (and the transient raw-body
   * tempfile that lands next to each XML during the sniff/decode step,
   * cleaned up on the same call). Default os.tmpdir(). */
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

/** Exact suffix the SOFT API documentation specifies for the
 * cachedcompetitors download. Load-bearing: Eventor caches per-URL, so
 * deviation costs us shared cache benefits with any other client at the
 * same club using the same API key. */
const COMPETITORS_SUFFIX =
  'export/cachedcompetitors?includePreselectedClasses=false&zip=true&version=3.0';
const CLUBS_SUFFIX = 'export/clubs?version=3.0';

/** Magic-byte sniff over the first 4 bytes. Determines how to decode the body
 *  written to a tempfile by `fetchToFile`. */
function sniffFormat(head: Buffer): 'zip' | 'gzip' | 'xml' | 'unknown' {
  if (
    head.length >= 4 &&
    head[0] === 0x50 &&
    head[1] === 0x4b &&
    head[2] === 0x03 &&
    head[3] === 0x04
  ) {
    return 'zip';
  }
  if (head.length >= 2 && head[0] === 0x1f && head[1] === 0x8b) {
    return 'gzip';
  }
  if (head.length >= 1 && head[0] === 0x3c) {
    return 'xml';
  }
  return 'unknown';
}

/** Stream the first .xml entry from a PKZIP archive at `zipPath` into `destPath`. */
function unzipFirstXmlEntry(zipPath: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) {
        reject(err ?? new Error('yauzl.open returned no zipfile'));
        return;
      }
      let extracted = false;
      zipfile.on('error', (e) => reject(e));
      zipfile.on('end', () => {
        if (!extracted) reject(new Error(`no .xml entry found in ${zipPath}`));
      });
      zipfile.on('entry', (entry: yauzl.Entry) => {
        // Skip directories and non-XML entries (the Eventor archive ships a
        // single competitors.xml today, but we defend against future siblings).
        // Reject traversal sequences and absolute paths even though the caller-
        // supplied destPath is what we actually write to — defense-in-depth so
        // a future refactor that derives the path from entry.fileName can't
        // silently escape the tmp dir. yauzl's docs recommend this guard.
        const name = entry.fileName;
        if (
          /\/$/.test(name) ||
          !/\.xml$/i.test(name) ||
          name.includes('..') ||
          name.startsWith('/') ||
          /^[A-Za-z]:[\\/]/.test(name)
        ) {
          zipfile.readEntry();
          return;
        }
        zipfile.openReadStream(entry, (rsErr, readStream) => {
          if (rsErr || !readStream) {
            reject(rsErr ?? new Error('openReadStream returned no stream'));
            return;
          }
          extracted = true;
          pipeline(readStream, createWriteStream(destPath))
            .then(() => {
              zipfile.close();
              resolve();
            })
            .catch(reject);
        });
      });
      zipfile.readEntry();
    });
  });
}

async function fetchAndUnzipTo(
  url: string,
  destPath: string,
  apiKey: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  abortSignal: AbortSignal | undefined
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimer(() => controller.abort(), timeoutMs);
  // Compose external abort with internal timeout.
  if (abortSignal) {
    if (abortSignal.aborted) controller.abort();
    else abortSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  // Raw body lands here first so we can sniff magic bytes and pick the right
  // decoder. yauzl needs random-access to a file, not a stream, so this
  // tempfile is unavoidable for the PKZIP path; gzip + plain-XML paths reuse
  // the same write to keep the code shape uniform.
  const rawPath = `${destPath}.raw`;
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
    await pipeline(nodeStream, createWriteStream(rawPath));

    const fh = await fsp.open(rawPath, 'r');
    let head: Buffer;
    try {
      const buf = Buffer.alloc(4);
      const { bytesRead } = await fh.read(buf, 0, 4, 0);
      head = buf.subarray(0, bytesRead);
    } finally {
      await fh.close();
    }
    const format = sniffFormat(head);

    if (format === 'zip') {
      await unzipFirstXmlEntry(rawPath, destPath);
    } else if (format === 'gzip') {
      // Stream from disk — the uncompressed Eventor XML can be ~86 MB, so
      // a `readFile` here would hold the entire raw body in memory.
      await pipeline(createReadStream(rawPath), createGunzip(), createWriteStream(destPath));
    } else if (format === 'xml') {
      await fsp.rename(rawPath, destPath);
    } else {
      const headHex = head.toString('hex');
      throw new Error(
        `eventor body has unknown format (head=${headHex}, url=${url}); expected PKZIP / gzip / XML`
      );
    }
  } finally {
    clearTimer(timer);
    await fsp.unlink(rawPath).catch(() => undefined);
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

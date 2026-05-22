// Authored for fartol. Not ported from upstream.
//
// Eventor per-event entries download — public REST endpoint documented
// by SOFT. Sources:
//
//   Primary:    "Guide Eventor — Hämta data via API" v2.1
//               (.reference/Guide_Eventor_-_Hamta_data_via_API.pdf)
//   Live docs:  https://eventor.orientering.se/api/documentation
//   XSD:        https://eventor.orientering.se/api/schema
//               (requires ApiKey header — fetch from the server,
//               not via the browser)
//
// URL composed:
//   {base}export/entries?eventId=N&version=3.0
//
// LOAD-BEARING: the `&version=3.0` flag tells Eventor to emit the
// payload in **IOF XML 3.0** format (root <EntryList> with <PersonEntry>
// children) instead of Eventor's internal <EntryList> with <Entry>
// children — verified against https://eventor.orientering.se/api/schema
// (which documents the internal shape). Our parseIofXml + IOF.xsd
// validation chain only handles the IOF shape, so DO NOT drop the
// version flag without also widening the parser.
//
// The caller is responsible for XSD validation + ingestion via the
// existing ingestEntryList path so we reuse all the consent / class-
// matching / club-upsert semantics that the manual-upload route uses.
//
// Network behaviour mirrors download.ts + events.ts.

import { setTimeout as setTimer, clearTimeout as clearTimer } from 'node:timers';

export interface DownloadEntriesOpts {
  apiKey: string | undefined;
  eventId: number;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  abortSignal?: AbortSignal;
  timeoutMs?: number;
}

const DEFAULT_BASE_URL = 'https://eventor.orientering.se/api/';
const DEFAULT_TIMEOUT_MS = 60_000;
const IOF_VERSION = '3.0';

export async function downloadEventorEntries(opts: DownloadEntriesOpts): Promise<string> {
  if (!opts.apiKey || opts.apiKey.length === 0) {
    throw new Error('missing api key');
  }
  if (!Number.isInteger(opts.eventId) || opts.eventId <= 0) {
    throw new Error('bad eventId');
  }
  const fetchImpl = opts.fetchImpl ?? fetch;
  const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const url = `${baseUrl}export/entries?eventId=${opts.eventId}&version=${IOF_VERSION}`;

  const controller = new AbortController();
  const timer = setTimer(() => controller.abort(), timeoutMs);
  if (opts.abortSignal) {
    if (opts.abortSignal.aborted) controller.abort();
    else opts.abortSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  try {
    const res = await fetchImpl(url, {
      method: 'GET',
      headers: { ApiKey: opts.apiKey },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`eventor entries fetch failed: ${res.status} ${res.statusText}`);
    }
    return await res.text();
  } finally {
    clearTimer(timer);
  }
}

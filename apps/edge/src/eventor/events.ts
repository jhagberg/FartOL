// Authored for fartola. Not ported from upstream.
//
// Eventor event-list query — public REST endpoint documented by Svenska
// Orienteringsförbundet (SOFT). Sources:
//
//   Primary:    "Guide Eventor — Hämta data via API" v2.1
//               (.reference/Guide_Eventor_-_Hamta_data_via_API.pdf,
//                2015-12-31) — example on page 3 uses literally
//               `events?fromDate=2014-04-01&toDate=2014-04-30`.
//   Live docs:  https://eventor.orientering.se/api/documentation
//   XSD:        https://eventor.orientering.se/api/schema
//               (requires ApiKey header — defines <EventList> →
//               <Event> → <EventId> + <Name> + <StartDate> →
//               <Date> + <Clock> which is what we parse here)
//
//   listEventorEvents({ apiKey, fromDate, toDate?, organisationIds?, fetchImpl?, timeoutMs? })
//     → EventorEvent[]
//
// URL composed:
//   {base}events?fromDate=YYYY-MM-DD[&toDate=YYYY-MM-DD][&organisationIds=637]&includeEntryBreaks=true
//
// We accept a toDate (the wizard pre-fills toDate=fromDate=competition.
// date, which is the common case — operator only needs events on the
// race day). Eventor's EventList response contains <Event> blocks with
// EventId + Name + StartDate>Date + StartDate>Clock (+ EntryBreak
// elements which we ignore here — relevant for entry deadlines, not
// relevant for a post-race startlist import).
//
// Note: this `events` endpoint returns Eventor's OWN XML schema, NOT
// IOF XML 3.0. There is no IOF equivalent for "list events by date
// range" — IOF only defines EventList in the context of a results or
// startlist payload. We hand-parse the few fields we need (regex pass
// in parseEventList below) instead of running the full XSD validator.
//
// Network behaviour mirrors download.ts:
//  - 60s AbortController timeout by default
//  - throws on non-2xx + on missing body
//  - missing/empty apiKey throws BEFORE issuing fetch (D-EV-3)
//
// The caller (the events route) catches and surfaces structured errors.

import { setTimeout as setTimer, clearTimeout as clearTimer } from 'node:timers';

export interface EventorEvent {
  eventId: number;
  name: string;
  /** ISO 8601 date (YYYY-MM-DD). Eventor returns this in <StartDate><Date>. */
  date: string;
  /** Local start clock (HH:MM:SS). Optional — multi-day events may omit. */
  clock: string | null;
}

export interface ListEventsOpts {
  apiKey: string | undefined;
  /** ISO date. Eventor includes events with StartDate.Date >= fromDate. */
  fromDate: string;
  /** ISO date. When set, only events with StartDate.Date <= toDate are returned. */
  toDate?: string;
  /** Filter by organising club. Default: STK (637). Pass empty string to omit. */
  organisationIds?: string;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  abortSignal?: AbortSignal;
  timeoutMs?: number;
}

const DEFAULT_BASE_URL = 'https://eventor.orientering.se/api/';
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_ORG = '637'; // StorTuna OK — Plan 02-CONTEXT.md

/** Extract one or more <tag>...</tag> blocks from an XML string. Returns
 * the inner text (no element nesting handling — Eventor's <Event> blocks
 * don't nest <Event> inside themselves, so a flat regex pass is safe). */
function extractBlocks(xml: string, tag: string): string[] {
  const blocks: string[] = [];
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    if (m[1] !== undefined) blocks.push(m[1]);
  }
  return blocks;
}

function extractFirst(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`));
  return m && m[1] !== undefined ? m[1].trim() : null;
}

function unescapeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

export function parseEventList(xml: string): EventorEvent[] {
  const events: EventorEvent[] = [];
  const blocks = extractBlocks(xml, 'Event');
  for (const block of blocks) {
    const idStr = extractFirst(block, 'EventId');
    const nameRaw = extractFirst(block, 'Name');
    if (idStr === null || nameRaw === null) continue;
    const id = Number.parseInt(idStr, 10);
    if (!Number.isFinite(id) || id <= 0) continue;
    const startDate = extractFirst(block, 'StartDate');
    if (startDate === null) continue;
    const date = extractFirst(startDate, 'Date');
    if (date === null || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const clock = extractFirst(startDate, 'Clock');
    events.push({
      eventId: id,
      name: unescapeXmlEntities(nameRaw.trim()),
      date,
      clock: clock !== null && /^\d{2}:\d{2}/.test(clock) ? clock : null,
    });
  }
  // Sort by date asc, then by name — predictable order for the UI list.
  events.sort((a, b) =>
    a.date === b.date ? a.name.localeCompare(b.name, 'sv') : a.date.localeCompare(b.date)
  );
  return events;
}

export async function listEventorEvents(opts: ListEventsOpts): Promise<EventorEvent[]> {
  if (!opts.apiKey || opts.apiKey.length === 0) {
    throw new Error('missing api key');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.fromDate)) {
    throw new Error('bad fromDate');
  }
  if (opts.toDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(opts.toDate)) {
    throw new Error('bad toDate');
  }
  const fetchImpl = opts.fetchImpl ?? fetch;
  const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const org = opts.organisationIds ?? DEFAULT_ORG;

  const qs = new URLSearchParams();
  qs.set('fromDate', opts.fromDate);
  if (opts.toDate !== undefined) qs.set('toDate', opts.toDate);
  if (org.length > 0) qs.set('organisationIds', org);
  qs.set('includeEntryBreaks', 'true');

  const url = `${baseUrl}events?${qs.toString()}`;

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
      throw new Error(`eventor events fetch failed: ${res.status} ${res.statusText}`);
    }
    const xml = await res.text();
    return parseEventList(xml);
  } finally {
    clearTimer(timer);
  }
}

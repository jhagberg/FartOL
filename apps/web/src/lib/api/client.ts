// Authored for fartol. Not ported from upstream.
//
// Typed REST client wrapper for the Phase 1 edge<->web contract. Functions
// are 1:1 with the Fastify route handlers in apps/edge/src/routes/*; the
// shapes come from @fartol/shared-types so a wire-side change forces a
// type error here before the form sees runtime garbage.
//
// JSON-only by default (`apiFetch`). The single multipart caller —
// `importCompetitionFile` — bypasses the helper and uses FormData so the
// browser sets the Content-Type boundary itself.
//
// Errors: any non-2xx response throws `ApiError` carrying the parsed JSON
// body when available. Callers can `instanceof ApiError` to distinguish
// from network failures (which surface as raw fetch errors).
//
// Locked by:
// - 01-11-PLAN.md task 2 (function inventory)
// - 01-PATTERNS.md §S-6 (snake_case at the I/O boundary)
// - Endpoint surface from apps/edge/src/routes/ (verified 2026-05-14)

import type {
  CompetitionDTO,
  CompetitionCreateInput,
  CompetitionPatchInput,
  CompetitorDTO,
  CompetitorCreateInput,
  ClassDTO,
  ClassCreateInput,
  CourseDTO,
  CourseCreateInput,
  ClubDTO,
  HealthDTO,
} from '@fartol/shared-types';

// ---------------------------------------------------------------------------
// Error surface
// ---------------------------------------------------------------------------

/** Thrown on any non-2xx response. `body` is the parsed JSON if the server
 * returned one; `text` is the raw response text as a fallback. Callers can
 * branch on `status` for 404 vs 422 vs 5xx without re-parsing. */
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  readonly text: string;
  constructor(status: number, message: string, body: unknown, text: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
    this.text = text;
  }
}

// ---------------------------------------------------------------------------
// Base helper
// ---------------------------------------------------------------------------

interface ApiFetchOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
}

/** Compose a URL with query string when params are supplied. */
function withQuery(path: string, query?: ApiFetchOptions['query']): string {
  if (!query) return path;
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined) continue;
    usp.set(k, String(v));
  }
  const qs = usp.toString();
  return qs ? `${path}?${qs}` : path;
}

/** JSON fetch wrapper. Throws ApiError on non-2xx, returns parsed JSON on 2xx,
 * returns `undefined as T` on 204 No Content. */
async function apiFetch<T>(path: string, opts: ApiFetchOptions = {}): Promise<T> {
  const url = withQuery(path, opts.query);
  const init: RequestInit = {
    method: opts.method ?? 'GET',
    headers: opts.body !== undefined ? { 'content-type': 'application/json' } : {},
    ...(opts.signal !== undefined ? { signal: opts.signal } : {}),
  };
  if (opts.body !== undefined) init.body = JSON.stringify(opts.body);

  const res = await fetch(url, init);
  const text = await res.text();
  let parsed: unknown;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = undefined;
    }
  }

  if (!res.ok) {
    const message =
      (parsed && typeof parsed === 'object' && 'error' in parsed
        ? String((parsed as { error: unknown }).error)
        : null) ?? `HTTP ${res.status} on ${opts.method ?? 'GET'} ${path}`;
    throw new ApiError(res.status, message, parsed, text);
  }
  return parsed as T;
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export function getHealth(): Promise<HealthDTO> {
  return apiFetch<HealthDTO>('/api/health');
}

// ---------------------------------------------------------------------------
// Competitions
// ---------------------------------------------------------------------------

export function listCompetitions(): Promise<{ competitions: CompetitionDTO[] }> {
  return apiFetch<{ competitions: CompetitionDTO[] }>('/api/competitions');
}

export function getCompetition(
  id: string
): Promise<{ competition: CompetitionDTO; classes: ClassDTO[]; courses: CourseDTO[] }> {
  return apiFetch(`/api/competitions/${encodeURIComponent(id)}`);
}

export function createCompetition(body: CompetitionCreateInput): Promise<CompetitionDTO> {
  return apiFetch<CompetitionDTO>('/api/competitions', { method: 'POST', body });
}

export function patchCompetition(id: string, body: CompetitionPatchInput): Promise<CompetitionDTO> {
  return apiFetch<CompetitionDTO>(`/api/competitions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body,
  });
}

/** Plan 12 three-click wizard end-point: name + date + classes + courses in one POST. */
export function createCompetitionFromWizard(body: {
  name: string;
  date: string;
  receipt_template?: string;
  auto_print?: boolean;
  classes?: ClassCreateInput[];
  courses?: CourseCreateInput[];
}): Promise<{ competition: CompetitionDTO; classes: ClassDTO[]; courses: CourseDTO[] }> {
  return apiFetch('/api/competitions/from-wizard', { method: 'POST', body });
}

// ---------------------------------------------------------------------------
// Classes + Courses (per-competition)
// ---------------------------------------------------------------------------

export function listClasses(competitionId: string): Promise<{ classes: ClassDTO[] }> {
  return apiFetch(`/api/competitions/${encodeURIComponent(competitionId)}/classes`);
}

export function createClass(competitionId: string, body: ClassCreateInput): Promise<ClassDTO> {
  return apiFetch<ClassDTO>(`/api/competitions/${encodeURIComponent(competitionId)}/classes`, {
    method: 'POST',
    body,
  });
}

export function listCourses(competitionId: string): Promise<{ courses: CourseDTO[] }> {
  return apiFetch(`/api/competitions/${encodeURIComponent(competitionId)}/courses`);
}

export function createCourse(competitionId: string, body: CourseCreateInput): Promise<CourseDTO> {
  return apiFetch<CourseDTO>(`/api/competitions/${encodeURIComponent(competitionId)}/courses`, {
    method: 'POST',
    body,
  });
}

// ---------------------------------------------------------------------------
// Competitors (walk-up D-04)
// ---------------------------------------------------------------------------

export function listCompetitors(competitionId: string): Promise<{ competitors: CompetitorDTO[] }> {
  return apiFetch(`/api/competitions/${encodeURIComponent(competitionId)}/competitors`);
}

export function getCompetitor(
  competitionId: string,
  competitorId: string
): Promise<{ competitor: CompetitorDTO }> {
  return apiFetch(
    `/api/competitions/${encodeURIComponent(competitionId)}/competitors/${encodeURIComponent(competitorId)}`
  );
}

/** Walk-up create + plan-10 replace-card share this entry point; the
 * `replace_card_for_competitor_id` field switches mode server-side. */
export function createCompetitor(body: CompetitorCreateInput): Promise<CompetitorDTO> {
  return apiFetch<CompetitorDTO>('/api/competitors', { method: 'POST', body });
}

// ---------------------------------------------------------------------------
// Manual DNF + un-DNF (plan 10)
// ---------------------------------------------------------------------------

export function manualDnf(
  competitionId: string,
  competitorId: string,
  reason: string
): Promise<{ local_seq: number }> {
  return apiFetch(
    `/api/competitions/${encodeURIComponent(competitionId)}/competitors/${encodeURIComponent(competitorId)}/manual-dnf`,
    { method: 'POST', body: { reason } }
  );
}

export function unDnf(competitionId: string, competitorId: string): Promise<{ local_seq: number }> {
  return apiFetch(
    `/api/competitions/${encodeURIComponent(competitionId)}/competitors/${encodeURIComponent(competitorId)}/un-dnf`,
    { method: 'POST', body: {} }
  );
}

// ---------------------------------------------------------------------------
// Import (multipart) — Course XML + IOF XML 3.0 entries
// ---------------------------------------------------------------------------

export async function importCompetitionFile(
  competitionId: string,
  file: File
): Promise<{ kind: 'CourseData' | 'EntryList'; [k: string]: unknown }> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`/api/competitions/${encodeURIComponent(competitionId)}/import`, {
    method: 'POST',
    body: form,
  });
  const text = await res.text();
  const parsed: unknown = text.length > 0 ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const message =
      parsed && typeof parsed === 'object' && 'error' in parsed
        ? String((parsed as { error: unknown }).error)
        : `HTTP ${res.status} on import`;
    throw new ApiError(res.status, message, parsed, text);
  }
  return parsed as { kind: 'CourseData' | 'EntryList'; [k: string]: unknown };
}

// ---------------------------------------------------------------------------
// Readout + Results (projection-store reads)
// ---------------------------------------------------------------------------

/** Readout view payload — strongly-typed once plan 13 lands; for now the
 * shape is unknown to keep this client free of plan-13 internals. */
export function getReadout(competitionId: string): Promise<unknown> {
  return apiFetch(`/api/competitions/${encodeURIComponent(competitionId)}/readout`);
}

export function getResults(competitionId: string): Promise<unknown> {
  return apiFetch(`/api/competitions/${encodeURIComponent(competitionId)}/results`);
}

// ---------------------------------------------------------------------------
// Clubs (walk-up autocomplete cache)
// ---------------------------------------------------------------------------

export function listClubs(prefix?: string, limit?: number): Promise<{ clubs: ClubDTO[] }> {
  return apiFetch('/api/clubs', {
    ...(prefix !== undefined
      ? { query: { prefix, ...(limit !== undefined ? { limit } : {}) } }
      : {}),
  });
}

// ---------------------------------------------------------------------------
// Sessions (active competition pointer + bridge reconnect)
// ---------------------------------------------------------------------------

export function getActiveCompetition(): Promise<{ competition_id: string | null }> {
  return apiFetch('/api/sessions/active-competition');
}

export function setActiveCompetition(competitionId: string): Promise<{ competition_id: string }> {
  return apiFetch('/api/sessions/active-competition', {
    method: 'POST',
    body: { competition_id: competitionId },
  });
}

export function clearActiveCompetition(): Promise<void> {
  return apiFetch('/api/sessions/active-competition', { method: 'DELETE' });
}

export function reconnectBridge(): Promise<{ status: string }> {
  return apiFetch('/api/sessions/reconnect-bridge', { method: 'POST' });
}

// ---------------------------------------------------------------------------
// Dev — Simulate read (gated by FARTOL_DEV=1 server-side)
// ---------------------------------------------------------------------------

export interface SimulateReadPayload {
  competition_id: string;
  card_number: number;
  card_type: string;
  punches: Array<{ control_code: number; time_ms: number | null }>;
}

export function devSimulateRead(payload: SimulateReadPayload): Promise<unknown> {
  return apiFetch('/api/__dev/simulate-read', { method: 'POST', body: payload });
}

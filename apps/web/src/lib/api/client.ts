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
  EventorLookupResult,
  EventorNameSuggestion,
  EventorStatusDTO,
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

// ---------------------------------------------------------------------------
// Wizard atomic create + XML ingest (C-H3 LOCKED — plan 12)
// ---------------------------------------------------------------------------
//
// The three-click wizard fires ONE POST to /api/competitions/from-wizard.
// Per Codex review C-H3: HTTP requests cannot share a SQL transaction, so
// the old two-call shape (createCompetition + importCompetitionFile) was
// eligible for partial commit — an XSD failure after the competition
// INSERT would leave an orphan row. The atomic endpoint wraps both
// operations in one SQLite transaction; on any failure NO orphan row
// persists. wizard.spec.ts test 2 is the e2e regression gate.

export interface CreateFromWizardInput {
  name: string;
  date: string;
  xml_file: { name: string; content_base64: string };
}

export interface CreateFromWizardOk {
  competition_id: string;
  kind: 'CourseData' | 'EntryList';
  classes_created?: number;
  controls_created?: number;
  courses_created?: number;
  competitors_created?: number;
  classes_missing?: string[];
  [extra: string]: unknown;
}

export interface CreateFromWizardErr {
  error: string;
  message?: string;
  errors?: Array<{ line?: number; column?: number; message: string }>;
  detail?: string;
}

/** Plan 12 wizard endpoint: ONE atomic POST that creates the competition
 * and ingests the XML in a single SQL transaction (C-H3). Returns a
 * tagged union so callers branch on `ok` without `instanceof ApiError`
 * (the regression gate cares about the body shape, not the exception). */
export async function createCompetitionFromWizard(
  input: CreateFromWizardInput
): Promise<
  { ok: true; data: CreateFromWizardOk } | { ok: false; status: number; data: CreateFromWizardErr }
> {
  const res = await fetch('/api/competitions/from-wizard', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text.length > 0 ? JSON.parse(text) : {};
  } catch {
    parsed = { error: 'parse_failed', detail: text };
  }
  if (res.status >= 200 && res.status < 300) {
    return { ok: true, data: parsed as CreateFromWizardOk };
  }
  return { ok: false, status: res.status, data: parsed as CreateFromWizardErr };
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

/** Edit name / club / class / card on an existing competitor row. Distinct
 * from `confirmConsent` (different PATCH path); operator-driven correction
 * surface. All fields optional; an empty body is a no-op 200. */
export interface CompetitorProfilePatch {
  name?: string;
  club?: string | null;
  class_id?: string;
  card_number?: number | null;
}

export function editCompetitorProfile(
  competitorId: string,
  body: CompetitorProfilePatch
): Promise<{ ok: true; competitor: CompetitorDTO }> {
  return apiFetch<{ ok: true; competitor: CompetitorDTO }>(
    `/api/competitors/${encodeURIComponent(competitorId)}/profile`,
    { method: 'PATCH', body }
  );
}

// ---------------------------------------------------------------------------
// Consent confirmation (C-M4) — PATCH /api/competitors/:id
// ---------------------------------------------------------------------------
//
// One-time consent confirmation flip for EntryList-imported competitors
// (consent_status='pending_first_read' → 'confirmed_on_read'). Returns a
// tagged union so the toast component can branch without `instanceof
// ApiError` — the surface is intentionally narrow (200 ok / non-2xx with
// JSON body).

export async function confirmConsent(
  competitorId: string
): Promise<
  | { ok: true; data: { ok: true; competitor_id: string } }
  | { ok: false; status: number; data: { error: string; message?: string; current?: string } }
> {
  const res = await fetch(`/api/competitors/${encodeURIComponent(competitorId)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      consent_status: 'confirmed_on_read',
      consent_at_ms: Date.now(),
    }),
  });
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text.length > 0 ? JSON.parse(text) : {};
  } catch {
    parsed = { error: 'parse_failed' };
  }
  if (res.status === 200) {
    return { ok: true, data: parsed as { ok: true; competitor_id: string } };
  }
  return {
    ok: false,
    status: res.status,
    data: parsed as { error: string; message?: string; current?: string },
  };
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
// Print (plan 15) — ESC/POS thermal print for the 6 receipt templates.
// ---------------------------------------------------------------------------

export type ReceiptTemplateId = 'classic' | 'standing' | 'detailed' | 'top4' | 'minimal' | 'kids';

/** POST /api/competitions/:id/print-receipt — queue an ESC/POS print job
 * (template defaults to competition.receipt_template when omitted). The
 * server resolves the projection / placeContext / skogisStats; the
 * client never carries any of that. Returns the queue position so the
 * UI can show a toast that distinguishes "printing" from "queued behind
 * N prints". */
export function printReceipt(
  competitionId: string,
  competitorId: string,
  template?: ReceiptTemplateId
): Promise<{ queued: boolean; queue_position: number }> {
  return apiFetch(`/api/competitions/${encodeURIComponent(competitionId)}/print-receipt`, {
    method: 'POST',
    body: {
      competitor_id: competitorId,
      ...(template !== undefined ? { template } : {}),
    },
  });
}

// ---------------------------------------------------------------------------
// Export (plan 16) — IOF XML 3.0 ResultList preview + download URL.
// ---------------------------------------------------------------------------
//
// The preview endpoint returns a JSON summary of the validation pass; the
// UI uses it to populate the green check / red error box on the export
// page. The download URL is the GET that the browser navigates to so the
// `Content-Disposition: attachment` header triggers a native file save.

export type ExportStatus = 'Final' | 'Provisional';

export interface ExportPreviewSummary {
  class_count: number;
  person_result_count: number;
  status: ExportStatus;
}

export interface ExportPreviewError {
  line?: number | null;
  column?: number | null;
  message: string;
}

export type ExportPreviewResult =
  | { valid: true; summary: ExportPreviewSummary }
  | { valid: false; errors: ExportPreviewError[] };

/** Preview the IOF XML 3.0 export for a competition. Returns valid=true
 * with summary counts on XSD pass, or valid=false with line-numbered
 * errors. The download CTA is gated on valid=true. */
export function exportPreview(
  competitionId: string,
  status: ExportStatus
): Promise<ExportPreviewResult> {
  return apiFetch<ExportPreviewResult>(
    `/api/competitions/${encodeURIComponent(competitionId)}/export/preview`,
    { query: { status } }
  );
}

/** Build the download URL for the IOF XML 3.0 export. The browser handles
 * the actual download via Content-Disposition: attachment; the UI just
 * navigates to this URL on the CTA click. */
export function exportDownloadUrl(competitionId: string, status: ExportStatus): string {
  return `/api/competitions/${encodeURIComponent(competitionId)}/export?format=iof30&status=${status}`;
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
// Eventor walk-up autocomplete (Phase 2.0 Plan 02-02).
// ---------------------------------------------------------------------------

/** GET /api/eventor/lookup?si_card=N — single-row cache lookup for the
 * bricka-scan pre-fill flow. Returns { hit: true, ... } | { hit: false }. */
export function lookupEventorBySiCard(siCard: number): Promise<EventorLookupResult> {
  return apiFetch<EventorLookupResult>('/api/eventor/lookup', {
    query: { si_card: siCard },
  });
}

/** GET /api/eventor/lookup?prefix=S&limit=K — name-prefix autocomplete
 * for the operator-types-name flow. Caller MUST enforce minLength 2 on
 * the prefix (the 252k-row scan blows the autocomplete UX otherwise);
 * the API tolerates shorter prefixes but UI patterns reject them. */
export function lookupEventorByPrefix(
  prefix: string,
  limit: number = 20
): Promise<{ suggestions: EventorNameSuggestion[] }> {
  return apiFetch<{ suggestions: EventorNameSuggestion[] }>('/api/eventor/lookup', {
    query: { prefix, limit },
  });
}

/** GET /api/eventor/status — current cache health for the TweaksPanel
 * indicator. fartol_dev is server-side-derived from process.env at
 * request time so the UI's admin-button gate is correct in production
 * builds (import.meta.env.DEV would be bundler-time and always false). */
export function getEventorStatus(): Promise<EventorStatusDTO> {
  return apiFetch<EventorStatusDTO>('/api/eventor/status');
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

export function getBridgeStatus(): Promise<{ state: 'opening' | 'open' | 'closed' | 'error' }> {
  return apiFetch('/api/bridge/status');
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

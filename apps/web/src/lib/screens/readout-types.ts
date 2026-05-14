// Authored for fartol. Not ported from upstream.
//
// Wire-side types + formatters for the readout view. Mirrors the
// `ReadoutResponse` shape from apps/edge/src/routes/readout.ts (plan 09)
// without importing edge code (the SPA stays free of server-side deps).
//
// The transform `toReceiptRead` adapts a HistoryRow into the
// ReceiptRead shape consumed by ReceiptMirror + LatestReadCard. Phase 1
// reality: many fields (place, elapsed, splits) are placeholders until
// the projection pipeline lights them up. We populate plausible defaults
// so the templates render without crashing.
//
// Locked by 01-13-PLAN.md task 2 + interfaces.

import type { ReceiptRead, ReceiptPunch } from '$lib/components/receipt-templates/types.ts';

export type ReadoutStatus = 'PEND' | 'OK' | 'MP' | 'DNF';

export interface ReadoutHistoryRow {
  event_time_ms: number;
  local_seq: number;
  card_number: number;
  card_type: string;
  competitor_id: string | null;
  competitor_name: string | null;
  status: ReadoutStatus;
  unmatched: boolean;
}

export interface ReadoutResponse {
  competition_id: string;
  active: boolean;
  current_read: ReadoutHistoryRow | null;
  history: ReadoutHistoryRow[];
  pending_unknown_cards: number[];
}

/** Unique key for a history row — used by Svelte's keyed each and by
 * the flashIn animation lookup. */
export function historyKey(row: ReadoutHistoryRow): string {
  return `${row.event_time_ms}-${row.local_seq}`;
}

/** Format `ms` (UTC epoch millis) as `HH:MM:SS` in the local timezone.
 * Used for the readTime column. */
export function formatTimeOfDay(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

/** Format an elapsed duration in milliseconds as `M:SS` or `H:MM:SS`. */
export function formatElapsed(ms: number | null): string {
  if (ms === null || ms < 0) return '—';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Build a ReceiptRead for the LatestReadCard + ReceiptMirror from a
 * history row + competition meta. Phase 1 stub: punches list comes back
 * empty for now because the projection pipeline doesn't surface per-
 * control splits to the readout endpoint yet; the templates render an
 * empty controls table without crashing. */
export function toReceiptRead(input: {
  row: ReadoutHistoryRow;
  className: string;
  classId: string;
  club: string | null;
  competitionName: string;
  competitionDate: string;
  punches?: ReceiptPunch[];
  elapsedMs?: number | null;
  place?: number | null;
}): ReceiptRead {
  const punches: ReceiptPunch[] = input.punches ?? [];
  return {
    cardNumber: input.row.card_number,
    name: input.row.competitor_name ?? 'Okänd',
    cls: input.className,
    classId: input.classId,
    club: input.club,
    startTime: '—',
    readTime: formatTimeOfDay(input.row.event_time_ms),
    elapsed: formatElapsed(input.elapsedMs ?? null),
    status: input.row.status,
    place: input.place ?? null,
    punches,
    progress: {
      place: input.place ?? null,
      finishedInClass: 1,
      startersInClass: 1,
      behind: null,
    },
    competitionName: input.competitionName,
    competitionDate: input.competitionDate,
  };
}

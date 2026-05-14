// Authored for fartol. Not ported from upstream.
//
// NDJSON event types re-exported from @fartol/sportident — intentional
// drift-prevention per
// .planning/phases/01-single-laptop-training-mvp/01-PATTERNS.md
// §"shared-types/src/events.ts". The Phase 0 NDJSON contract IS the
// contract that Phase 1's SQLite `events.payload` stores, so the type
// surface is shared rather than duplicated. Phase 1 may add Phase-1-only
// event types (e.g. `card_bound`, `manual_dnf`) alongside; the Phase 0
// types remain frozen and exported through this module.
//
// Snake_case at the I/O boundary (PATTERNS S-6) is already locked in the
// upstream Phase 0 types — no transform needed here.
//
// EVENT_SCHEMA_VERSION is a runtime const that downstream consumers pin
// against (e.g. WS hello message includes `event_schema_version`, refuses
// to subscribe if it disagrees). It's deliberately separate from
// `NdjsonBase.schema_version: 1` (the literal-type discriminator on every
// event) so non-event payloads can also pin to the same major version.

export type {
  NdjsonEvent,
  NdjsonBase,
  CardType,
  HalfDayClock,
  NdjsonPunch,
  ConnectionChangedEvent,
  CardInsertedEvent,
  CardReadEvent,
  CardRemovedEvent,
  FrameErrorEvent,
} from '@fartol/sportident';

/** Bumped when the NDJSON event shape changes incompatibly. Pinned at 1
 * for Phase 0 + Phase 1. */
export const EVENT_SCHEMA_VERSION = 1 as const;

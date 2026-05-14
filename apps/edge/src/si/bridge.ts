// Authored for fartol. Not ported from upstream.
//
// Wires Phase 0's SiMainStation events into the Phase 1 SQLite event log + WS
// broadcast. The bridge is a thin event-driven adapter: each station event
// passes through `insertEvent` (the single insertion path) and, when an
// active competition is set, fans out via `wsBroadcast` on the
// `readout:<competitionId>` channel.
//
// Codex review C-H2 (HIGH): card_read payload mirrors Phase 0's CardReadEvent
// shape exactly — top-level start/finish/check/clear HalfDayClock fields +
// card_holder + punch_count + punches[]. The helper
// `apps/edge/src/si/cardReadPayload.ts` builds the exact NdjsonEmitter shape;
// the EventPayload `card_read` arm imports CardReadEvent's component types
// (HalfDayClock + NdjsonPunch) from @fartol/sportident so any drift surfaces
// at TS-compile time (T-PAYLOAD-DRIFT mitigation).
//
// No-active-competition contract (T-IDLE-CHANNEL-LEAK mitigation): when
// `getActiveCompetitionId()` returns null, the event still persists with
// `competition_id=null` (forensic value preserved) BUT `wsBroadcast` is NOT
// called. No phantom 'readout:__idle__' channel is fabricated.
//
// Analog: `packages/sportident/src/bin/fartol-readout.ts` lines 187-254 — the
// same 5-event surface (cardInserted, cardRead, cardRemoved, frameError,
// connectionChanged) with NDJSON output swapped for SQLite + WS.
//
// Locked by:
// - .planning/phases/01-single-laptop-training-mvp/01-06-PLAN.md task 1
// - .planning/phases/01-single-laptop-training-mvp/01-RESEARCH.md §"Code
//   Examples — Wire SI events into the SQLite event log"
// - .planning/phases/01-single-laptop-training-mvp/01-PATTERNS.md
//   §"apps/edge/src/si/bridge.ts" + §S-2 sink injection + §S-3 lazy native
// - .planning/phases/01-single-laptop-training-mvp/01-REVIEWS.md §C-H2

import type { SiMainStation, BaseSiCard, FrameError, ConnectionState } from '@fartol/sportident';
import { readoutChannel } from '@fartol/shared-types';
import type { ChannelName } from '@fartol/shared-types';

import { cardTypeFromNumber } from './cardType.ts';
import { buildCardReadPayload } from './cardReadPayload.ts';
import { insertEvent } from './eventInserter.ts';
import type { DbHandle } from '../db/index.ts';

/** Hex-encode a byte buffer for `frame_error.raw`. Mirrors the convention
 * used by NdjsonEmitter (uppercase hex pairs joined by spaces). */
function toHexBytes(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

export interface BridgeOpts {
  /** Open SQLite handle from plan 02 (`openDatabase`). */
  handle: DbHandle;
  /** Stable per-install node id (plan 02 `ensureNodeId`). */
  nodeId: string;
  /** Returns the operator-selected active competition id, or null when no
   * competition is active (idle bridge). Read on every event — the bridge
   * holds no cached value of its own. */
  getActiveCompetitionId: () => string | null;
  /** WS fan-out hook. The bridge calls this only when
   * getActiveCompetitionId() !== null (T-IDLE-CHANNEL-LEAK mitigation). */
  broadcast: (
    channel: ChannelName,
    envelope: { type: string; payload: unknown; seq?: number }
  ) => void;
}

export interface AttachedBridge {
  /** Unsubscribe all 5 station listeners. Idempotent. */
  detach: () => void;
}

/**
 * Attach the 5-event station listener set to an opened SiMainStation. Returns
 * a handle whose `detach()` removes every listener so the caller can swap in
 * a fresh station after a reconnect.
 *
 * The implementation is intentionally side-effect free at module scope —
 * importing this file does NOT subscribe; attach must be called explicitly.
 */
export function attachBridge(station: SiMainStation, opts: BridgeOpts): AttachedBridge {
  function maybeBroadcast(type: string, payload: unknown, seq: number): void {
    const activeId = opts.getActiveCompetitionId();
    if (activeId === null) return; // T-IDLE-CHANNEL-LEAK: no phantom channel
    opts.broadcast(readoutChannel(activeId), { type, payload, seq });
  }

  const onCardInserted = (card: BaseSiCard): void => {
    const activeId = opts.getActiveCompetitionId();
    const payload = {
      event_type: 'card_inserted' as const,
      card_number: card.cardNumber,
      card_type: cardTypeFromNumber(card.cardNumber),
    };
    const r = insertEvent(opts.handle, opts.nodeId, 'card_inserted', Date.now(), payload, activeId);
    maybeBroadcast('card_inserted', payload, r.local_seq);
  };

  const onCardRead = (card: BaseSiCard): void => {
    // C-H2 LOCKED: full CardReadEvent shape via buildCardReadPayload — mirrors
    // NdjsonEmitter.card_read byte-for-byte. payload.start / .finish / .check /
    // .clear are top-level HalfDayClock fields; punches[] is sourced from
    // card.raceResult.punches (NdjsonEmitter line 253); card_holder is
    // competitor metadata (NOT punches).
    const payload = buildCardReadPayload(card);
    const activeId = opts.getActiveCompetitionId();
    const r = insertEvent(opts.handle, opts.nodeId, 'card_read', Date.now(), payload, activeId);
    maybeBroadcast('card_read', payload, r.local_seq);
  };

  const onCardRemoved = (cardNumber: number): void => {
    const activeId = opts.getActiveCompetitionId();
    const payload = {
      event_type: 'card_removed' as const,
      card_number: cardNumber,
    };
    const r = insertEvent(opts.handle, opts.nodeId, 'card_removed', Date.now(), payload, activeId);
    maybeBroadcast('card_removed', payload, r.local_seq);
  };

  const onFrameError = (err: FrameError): void => {
    const activeId = opts.getActiveCompetitionId();
    const payload = {
      event_type: 'frame_error' as const,
      // schema's frame_error arm is { reason, raw }. Phase 0's FrameError
      // carries error_code (the typed cause) + raw_bytes (the consumed
      // bytes); map to the schema's shape so the payload stays JSON-stable.
      reason: err.error_code,
      raw: toHexBytes(err.raw_bytes),
    };
    const r = insertEvent(opts.handle, opts.nodeId, 'frame_error', Date.now(), payload, activeId);
    maybeBroadcast('frame_error', payload, r.local_seq);
  };

  const onConnectionChanged = (state: ConnectionState): void => {
    // Phase 0's SiMainStation always emits `connectionChanged` with a single
    // `state` arg (see packages/sportident/src/SiStation/SiMainStation.ts
    // `_emitState`). The schema arm allows an optional `error` field for
    // Phase 1 surface evolution — for now the bridge never populates it.
    const activeId = opts.getActiveCompetitionId();
    const payload = {
      event_type: 'connection_changed' as const,
      state,
    };
    const r = insertEvent(
      opts.handle,
      opts.nodeId,
      'connection_changed',
      Date.now(),
      payload,
      activeId
    );
    maybeBroadcast('connection_changed', payload, r.local_seq);
  };

  station.on('cardInserted', onCardInserted);
  station.on('cardRead', onCardRead);
  station.on('cardRemoved', onCardRemoved);
  station.on('frameError', onFrameError);
  station.on('connectionChanged', onConnectionChanged);

  let detached = false;
  return {
    detach(): void {
      if (detached) return;
      detached = true;
      station.off('cardInserted', onCardInserted);
      station.off('cardRead', onCardRead);
      station.off('cardRemoved', onCardRemoved);
      station.off('frameError', onFrameError);
      station.off('connectionChanged', onConnectionChanged);
    },
  };
}

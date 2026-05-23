// Authored for fartola. Not ported from upstream.
//
// Pure channel-name parsing + validation for the WS plugin. Two channel
// kinds in Phase 1: `readout:<competitionId>` (raw event stream — receives
// every per-station event live + a hello-time replay of missed events) and
// `results:<competitionId>` (projection stream — receives `results_full`
// snapshots and `results_update` deltas; plan 08 fills in the emission).
//
// C-M1 (T-RESULTS-CHANNEL-LEAK): the channel-kind discriminator lets the
// hello handler branch per kind so raw event `replay` envelopes are
// EXCLUSIVE to `readout:` channels. Results clients never receive `replay`
// — plan 08 lifts the stub branch into a `results_full` emission. The
// branch lives in ws/index.ts; this module only ships the predicate.
//
// Locked by:
// - .planning/phases/01-single-laptop-training-mvp/01-03-PLAN.md task 1
// - .planning/phases/01-single-laptop-training-mvp/01-REVIEWS.md §C-M1

import type { ChannelName } from '@fartola/shared-types';

export type { ChannelName };
export type ChannelKind = 'readout' | 'results';

/** Type guard for ChannelName at the WS message boundary. Returns true
 * only when `s` is a string with one of the two locked prefixes. */
export function isValidChannel(s: unknown): s is ChannelName {
  return typeof s === 'string' && (s.startsWith('readout:') || s.startsWith('results:'));
}

/** Discriminator for per-channel-kind dispatch (C-M1). The hello handler
 * branches on this so raw event `replay` envelopes are emitted ONLY on
 * `readout:` channels. */
export function channelKind(channel: ChannelName): ChannelKind {
  return channel.startsWith('readout:') ? 'readout' : 'results';
}

/** Sanitise the client's `last_seen_seq` field. Negative values, NaN, and
 * non-integers all return false (T-EVENT-REPLAY mitigation — replay
 * iteration is skipped). */
export function isValidSeq(s: unknown): s is number {
  return typeof s === 'number' && Number.isInteger(s) && s >= 0;
}

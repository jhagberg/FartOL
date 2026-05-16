// Authored for fartol. Not ported from upstream.
//
// Module-scoped Svelte 5 runes store for the SI bridge connection state.
// ReadoutView writes to it on every `connection_changed` WS envelope;
// +layout.svelte reads it and passes the derived StationStatus down to
// AppShell so the sidebar StationCard + topbar WS pill mirror reality.
//
// Plan 13 left the AppShell `stationStatus` prop hardcoded 'offline'; this
// closes the gap.

export type BridgeWsState = 'closed' | 'opening' | 'open' | 'error';

let _state = $state<BridgeWsState>('closed');

export const bridgeStatus = {
  get value(): BridgeWsState {
    return _state;
  },
  set(next: BridgeWsState): void {
    _state = next;
  },
};

/** Map the wire-level bridge state to the StationStatus enum used by the
 * sidebar StationCard component. */
export function toStationStatus(s: BridgeWsState): 'online' | 'offline' | 'connecting' {
  if (s === 'open') return 'online';
  if (s === 'opening') return 'connecting';
  return 'offline';
}

/** Map the wire-level bridge state to the WsStatus enum used by the
 * topbar PulseDot. */
export function toWsStatus(s: BridgeWsState): 'open' | 'connecting' | 'closed' {
  if (s === 'open') return 'open';
  if (s === 'opening') return 'connecting';
  return 'closed';
}

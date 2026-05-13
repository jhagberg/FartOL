// Ported (simplified) from allestuetsmerweh/sportident.js — packages/sportident/src/SiStation/SiMainStation.ts
// Upstream: https://github.com/allestuetsmerweh/sportident.js (MIT License)
// Local modifications:
//   - Wires the simplified (Direct-only) SiTargetMultiplexer; no SET_MS-on-every-call.
//   - readCards() performs the upstream atomic handshake: SET_MS(0x4D) ->
//     GET_SYS_VAL(0,128) -> SET_SYS_VAL diff to switch the station into Readout
//     mode (mode=Readout, autoSend=false, handshake=true, beeps=true, flashes=true).
//   - Card-insert dispatch: subscribes to multiplexer 'message'; routes SI5_DET
//     and SI8_DET through BaseSiCard.detectFromMessage (Plan 03), emits
//     'cardInserted', awaits card.read() (which calls back into sendMessage for
//     GET_SI5 / GET_SI8 — WAKEUP prepended by the multiplexer automatically),
//     emits 'cardRead'. SI_REM emits 'cardRemoved'.
//   - Frame errors propagate through the multiplexer's 'frameError' event with
//     the typed FrameError payload unchanged.
//   - Dropped: TRANS_REC autosend listener (Phase 4), CoupledSiStation, the
//     storage-typed StationConfig wrappers (the byte-offset constants in
//     BaseSiStation.ts are sufficient for Phase 0 mode-switch).
// See packages/sportident/NOTICE.md for cumulative attribution.

import { proto } from '../constants.ts';
import type { FrameError, SiMessage } from '../siProtocol.ts';
import { BaseSiCard } from '../SiCard/BaseSiCard.ts';
import { EventEmitter } from '../utils/events.ts';
import type { ISerialTransport } from '../transport/ISerialTransport.ts';
import { BaseSiStation, STATION_CONFIG_OFFSETS, StationMode } from './BaseSiStation.ts';
import { SiTargetMultiplexer } from './SiTargetMultiplexer.ts';
import type { ConnectionState, ISiMainStation } from './ISiMainStation.ts';

// Side-effect imports: trigger registry population on BaseSiCard so
// detectFromMessage can dispatch SI5_DET / SI8_DET frames.
import '../SiCard/types/SiCard5.ts';
import '../SiCard/types/SiCard9.ts';
import '../SiCard/types/SiCard10.ts';
import '../SiCard/types/SIAC.ts';

export class SiMainStation extends EventEmitter implements ISiMainStation {
  private multiplexer: SiTargetMultiplexer;
  private station: BaseSiStation;
  private isClosed = false;

  constructor(transport: ISerialTransport) {
    super();
    this.multiplexer = new SiTargetMultiplexer(transport);
    this.station = new BaseSiStation({
      sendMessage: (msg, expected, timeout) => this.multiplexer.sendMessage(msg, expected, timeout),
    });
    this.multiplexer.on('message', (msg: SiMessage) => this._dispatchMessage(msg));
    this.multiplexer.on('frameError', (err: FrameError) => this.emit('frameError', err));
    this.multiplexer.on('close', () => {
      if (this.isClosed) return;
      this.isClosed = true;
      this._emitState('closed');
    });
  }

  /**
   * sendMessage passthrough (implements ISiStation) so callers / decoders that
   * hold an ISiStation reference can drive command-response without needing
   * the underlying multiplexer.
   */
  sendMessage(message: SiMessage, expectedResponses = 1, timeoutMs?: number): Promise<number[][]> {
    return this.multiplexer.sendMessage(message, expectedResponses, timeoutMs);
  }

  /**
   * Perform the BSM7/8 handshake and put the station into Readout mode.
   *
   * Step 1: SET_MS(0x4D) — claim Master mode. The multiplexer prepends WAKEUP
   * automatically (codex review #11).
   * Step 2: readInfo() — fetch 128-byte config blob via GET_SYS_VAL(0, 128).
   * Step 3: mutate the in-memory config: code=10, mode=Readout, autoSend=false,
   * handshake=true, beeps=true, flashes=true.
   * Step 4: writeDiff(old, new) — send SET_SYS_VAL for each contiguous dirty
   * range. The station echoes the first byte of each write.
   *
   * After this resolves, the station spontaneously emits SI5_DET / SI8_DET /
   * SI_REM frames; subscribers to 'cardInserted' / 'cardRead' / 'cardRemoved'
   * see them via the multiplexer's 'message' event path.
   */
  async readCards(): Promise<void> {
    this._emitState('opening');
    try {
      // Step 1: SET_MS(0x4D) — Master mode handshake.
      const setMsResponses = await this.multiplexer.sendMessage({
        command: proto.cmd.SET_MS,
        parameters: [proto.P_MS_DIRECT],
      });
      const setMsFrame = setMsResponses[0];
      if (!setMsFrame) throw new Error('SET_MS returned no response');
      // Upstream's SET_MS response carries the echoed master/slave byte at
      // params[2]. We just verify it isn't a NAK — the station replying at all
      // is enough.

      // Step 2: read 128-byte config blob.
      const oldConfig = await this.station.readInfo();
      // Step 3: build the new config (mutate copy in place).
      const newConfig = oldConfig.slice();
      // Defensive: pad short blobs (some fakes return fewer bytes) so the
      // offset-keyed writes don't index past the end.
      while (newConfig.length < 128) newConfig.push(0x00);
      newConfig[STATION_CONFIG_OFFSETS.CODE] = 10;
      newConfig[STATION_CONFIG_OFFSETS.MODE] = StationMode.Readout;
      newConfig[STATION_CONFIG_OFFSETS.AUTOSEND] = 0x00; // false
      newConfig[STATION_CONFIG_OFFSETS.HANDSHAKE] = 0x01; // true
      newConfig[STATION_CONFIG_OFFSETS.BEEPS] = 0x01; // true
      newConfig[STATION_CONFIG_OFFSETS.FLASHES] = 0x01; // true

      // Step 4: writeDiff — one SET_SYS_VAL per contiguous dirty range.
      // Pad oldConfig to match.
      const oldPadded = oldConfig.slice();
      while (oldPadded.length < newConfig.length) oldPadded.push(0x00);
      await this.station.writeDiff(oldPadded, newConfig);

      this._emitState('open');
    } catch (err) {
      this._emitState('error');
      throw err;
    }
  }

  async close(): Promise<void> {
    if (this.isClosed) return;
    this.isClosed = true;
    try {
      await this.multiplexer.close();
    } finally {
      this._emitState('closed');
    }
  }

  // --- Message dispatch ----------------------------------------------------

  private _dispatchMessage(message: SiMessage): void {
    if (message.mode !== undefined) return;
    // SI_REM: card removed.
    if (message.command === proto.cmd.SI_REM) {
      // params layout matches SI5_DET / SI8_DET — bytes 3..5 carry the card number.
      const card = BaseSiCard.detectFromMessage({
        // Repackage SI_REM as if it were the matching detection command so we
        // can reuse arr2cardNumber via detectFromMessage. Easier: build the
        // card-number inline.
        command: proto.cmd.SI_REM,
        parameters: message.parameters,
      });
      // detectFromMessage returns undefined for SI_REM (only SI5_DET/SI8_DET
      // route through it), so fall through to a direct cardNumber decode.
      void card;
      const params = message.parameters;
      if (params.length >= 6) {
        // Reuse same byte order as detectFromMessage: params[3..5] -> arr2cardNumber.
        const byte3 = params[3] as number;
        const byte4 = params[4] as number;
        const byte5 = params[5] as number;
        // Simple cardNumber rebuild (same as arr2cardNumber's basic path):
        let cardnum = (byte4 << 8) | byte5;
        if (byte3 !== 0 && byte3 > 4) cardnum |= byte3 << 16;
        else cardnum += byte3 * 100000;
        this.emit('cardRemoved', cardnum);
      }
      return;
    }
    // SI5_DET / SI8_DET: card inserted -> dispatch + read.
    if (message.command === proto.cmd.SI5_DET || message.command === proto.cmd.SI8_DET) {
      const card = BaseSiCard.detectFromMessage(message);
      if (!card) return;
      card.mainStation = {
        sendMessage: (msg, expected, timeout) =>
          this.multiplexer.sendMessage(msg, expected, timeout),
      };
      this.emit('cardInserted', card);
      // Drive the typeSpecificRead chain; emit cardRead on success.
      card
        .read()
        .then(() => this.emit('cardRead', card))
        .catch((err: Error) => {
          // Forward as a frameError so subscribers see the failure.
          const fe: FrameError = {
            error_code: 'crc_mismatch',
            raw_bytes: [],
            bytes_consumed: 0,
          };
          void fe;
          // Plan 05's NDJSON layer will translate read-failures into a typed
          // 'card_read_error' event; Phase 0 multiplexer just emits the underlying
          // Error so logs stay diagnostic.
          this.emit('error', err);
        });
      return;
    }
    // Other free-floating commands (autosend etc.) — Phase 4 territory.
  }

  private _emitState(state: ConnectionState): void {
    this.emit('connectionChanged', state);
  }
}

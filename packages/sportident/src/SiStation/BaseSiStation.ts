// Ported (simplified) from allestuetsmerweh/sportident.js — packages/sportident/src/SiStation/BaseSiStation.ts
// Upstream: https://github.com/allestuetsmerweh/sportident.js (MIT License)
// Local modifications:
//   - Stripped lodash; no enums.
//   - Trimmed to the Phase 0 surface: `readInfo()` (GET_SYS_VAL 0..128) + `writeDiff()`
//     (SET_SYS_VAL for each contiguous dirty byte-range). Storage-typed station-config
//     parsing is NOT ported — Phase 0 treats the 128-byte blob as a plain `number[]`
//     and mutates known offsets directly (RESEARCH §Handshake sequence step 4 lists
//     the fields we touch — code/mode/autoSend/handshake/beeps/flashes).
//   - Mode constants exported as a const literal (no enum — erasableSyntaxOnly).
// See packages/sportident/NOTICE.md for cumulative attribution.

import { proto } from '../constants.ts';
import type { SiMessage } from '../siProtocol.ts';
import type { ISiStation } from './ISiStation.ts';

/**
 * Station-config byte offsets exercised by readCards() (extracted from upstream
 * BaseSiStation locations). Upstream has many more — those are Phase 1+.
 */
export const STATION_CONFIG_OFFSETS = {
  CODE: 0x02, // station code (we set to 10)
  MODE: 0x71, // station mode (we set to Readout)
  AUTOSEND: 0x73, // autosend flag (we clear to false)
  HANDSHAKE: 0x74, // handshake-mode flag (we set to true)
  BEEPS: 0x75, // beep flag (we set to true)
  FLASHES: 0x76, // flash flag (we set to true)
} as const;

/** Station-mode byte values per upstream `BaseSiStation.Mode`. */
export const StationMode = {
  Readout: 0x05,
  Workstation: 0x12,
  Control: 0x02,
  Start: 0x03,
  Finish: 0x04,
} as const;

export class BaseSiStation {
  protected station: ISiStation;
  public configBytes: number[] = [];

  constructor(station: ISiStation) {
    this.station = station;
  }

  /**
   * Read the first 128 bytes of station config (GET_SYS_VAL offset=0,
   * length=128). Stores them in `this.configBytes`.
   */
  async readInfo(): Promise<number[]> {
    const responses = await this.station.sendMessage({
      command: proto.cmd.GET_SYS_VAL,
      parameters: [0x00, 0x80],
    });
    const frame = responses[0];
    if (!frame) throw new Error('GET_SYS_VAL returned no response');
    // Frame is [cmd, len, ...params]. Upstream's response carries the offset
    // (2 bytes) then the data. Skip the first 4 bytes (cmd, len, offset_hi,
    // offset_lo) to land on the 128-byte payload. We tolerate short responses.
    const headerLen = 4;
    this.configBytes = frame.slice(headerLen, headerLen + 128);
    return this.configBytes;
  }

  /**
   * Diff `oldConfig` vs `newConfig` byte-by-byte; send a SET_SYS_VAL for each
   * contiguous dirty range. Returns the number of writes performed.
   */
  async writeDiff(oldConfig: number[], newConfig: number[]): Promise<number> {
    if (oldConfig.length !== newConfig.length) {
      throw new Error(
        `writeDiff: length mismatch (old=${oldConfig.length}, new=${newConfig.length})`
      );
    }
    let writes = 0;
    let rangeStart = -1;
    const flushRange = async (rangeEnd: number): Promise<void> => {
      if (rangeStart < 0) return;
      const slice = newConfig.slice(rangeStart, rangeEnd + 1);
      const message: SiMessage = {
        command: proto.cmd.SET_SYS_VAL,
        parameters: [rangeStart & 0xff, ...slice],
      };
      await this.station.sendMessage(message);
      writes++;
      rangeStart = -1;
    };

    for (let i = 0; i < newConfig.length; i++) {
      if (oldConfig[i] !== newConfig[i]) {
        if (rangeStart < 0) rangeStart = i;
      } else if (rangeStart >= 0) {
        await flushRange(i - 1);
      }
    }
    if (rangeStart >= 0) await flushRange(newConfig.length - 1);
    return writes;
  }
}

#!/usr/bin/env node
// Authored for fartol. NOT ported from upstream — this is an operator-only
// helper to repair the 1-byte SN corruption introduced by the bug in Plan 00-04
// (whole-byte CODE write to offset 0x02, which is actually the third byte of
// the 4-byte big-endian serial number at offsets 0..3).
//
// Symptom on Jonas's bench BSM8 on 2026-05-13: reader reports serial number
// 593144 (0x000909F8) but the printed-on-case SN is 593656 (0x00090EF8). The
// 0x0E at byte 0x02 got overwritten with 0x0A (10) during the broken handshake.
//
// This script:
//   1. Opens /dev/ttyUSB0 at 38400 8-N-1, no flow control via `serialport@13`.
//   2. Sends WAKEUP + SET_MS(P_MS_DIRECT=0x4D) to claim Master mode.
//   3. Sends a single SET_SYS_VAL write: offset 0x02 = 0x0E. (This restores SN
//      byte 2; bytes 0x00/0x01/0x03 were never touched by the buggy handshake.)
//   4. Reads back GET_SYS_VAL[0..4] to verify byte 0x02 == 0x0E and prints the
//      reconstructed SN bytes.
//
// USAGE: node scripts/repair-station-sn.mjs [/dev/ttyUSB0]
//
// SAFETY: This script is a one-off operator helper. Once Jonas's reader has
// been verified to report SN 593656 again, this file can be deleted. Plan
// 00-06 SUMMARY will document the bug-and-fix narrative.

import { SerialPort } from 'serialport';
import { argv, exit } from 'node:process';

const DEFAULT_PATH = '/dev/ttyUSB0';
const BAUD = 38400;

// SI protocol constants (extended protocol, mirroring packages/sportident/src/constants.ts).
const STX = 0x02;
const ETX = 0x03;
const WAKEUP = 0xff;
const P_MS_DIRECT = 0x4d;
const CMD_SET_MS = 0xf0;
const CMD_SET_SYS_VAL = 0x82;
const CMD_GET_SYS_VAL = 0x83;

// --- CRC16-CCITT 0x8005 (verbatim port of CRC16 from siProtocol.ts) ---------
const CRC16 = (str) => {
  const CRC_POLYNOM = 0x8005;
  const CRC_BITF = 0x8000;
  if (str.length < 3) return [str[0] ?? 0x00, str[1] ?? 0x00];
  const s = str.length % 2 === 0 ? str.concat([0x00, 0x00]) : str.concat([0x00]);
  let crc = s[0] * 0x100 + s[1];
  for (let i = 2; i < s.length; i += 2) {
    let val = s[i] * 0x100 + s[i + 1];
    for (let j = 0; j < 16; j++) {
      if ((crc & CRC_BITF) !== 0) {
        crc = crc << 1;
        if ((val & CRC_BITF) !== 0) crc += 1;
        crc = crc ^ CRC_POLYNOM;
      } else {
        crc = crc << 1;
        if ((val & CRC_BITF) !== 0) crc += 1;
      }
      val = val << 1;
    }
    crc = crc & 0xffff;
  }
  return [crc >> 8, crc & 0xff]; // MSB-first
};

// Build an extended-protocol frame: [WAKEUP, STX, cmd, len, ...params, crc_hi, crc_lo, ETX].
const buildFrame = (command, parameters) => {
  const len = parameters.length;
  const body = [command, len, ...parameters];
  const [crcHi, crcLo] = CRC16(body);
  return [WAKEUP, STX, ...body, crcHi, crcLo, ETX];
};

const hex = (b) => `0x${b.toString(16).padStart(2, '0').toUpperCase()}`;
const hexAll = (arr) => arr.map(hex).join(' ');

// --- Promise wrappers around SerialPort write/read --------------------------
const writeAndDrain = (port, bytes) =>
  new Promise((resolve, reject) => {
    port.write(Buffer.from(bytes), (err) => {
      if (err) return reject(err);
      port.drain((drainErr) => (drainErr ? reject(drainErr) : resolve()));
    });
  });

// Wait until at least one byte ETX (0x03) lands in the accumulator, then return
// every accumulated byte up to and including that ETX. Times out after `ms`.
const readUntilEtx = (port, ms) =>
  new Promise((resolve, reject) => {
    const acc = [];
    const onData = (chunk) => {
      for (const b of chunk) {
        acc.push(b);
        if (b === ETX) {
          cleanup();
          return resolve(acc);
        }
      }
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out after ${ms} ms; bytes seen so far: ${hexAll(acc)}`));
    }, ms);
    const cleanup = () => {
      port.off('data', onData);
      clearTimeout(timer);
    };
    port.on('data', onData);
  });

// --- Main -------------------------------------------------------------------
const path = argv[2] ?? DEFAULT_PATH;
console.log(`[repair] opening ${path} @${BAUD}`);

const port = new SerialPort({
  path,
  baudRate: BAUD,
  dataBits: 8,
  stopBits: 1,
  parity: 'none',
  autoOpen: false,
});

await new Promise((resolve, reject) => port.open((err) => (err ? reject(err) : resolve())));

try {
  // Step 1: SET_MS(0x4D) — Master mode handshake.
  const setMsFrame = buildFrame(CMD_SET_MS, [P_MS_DIRECT]);
  console.log(`[repair] -> SET_MS: ${hexAll(setMsFrame)}`);
  await writeAndDrain(port, setMsFrame);
  const setMsReply = await readUntilEtx(port, 2000);
  console.log(`[repair] <- SET_MS reply: ${hexAll(setMsReply)}`);

  // Step 2: SET_SYS_VAL — write 1 byte at offset 0x02 = 0x0E.
  const setSysValFrame = buildFrame(CMD_SET_SYS_VAL, [0x02, 0x0e]);
  console.log(`[repair] -> SET_SYS_VAL(offset=0x02, byte=0x0E): ${hexAll(setSysValFrame)}`);
  await writeAndDrain(port, setSysValFrame);
  const setSysValReply = await readUntilEtx(port, 2000);
  console.log(`[repair] <- SET_SYS_VAL reply: ${hexAll(setSysValReply)}`);

  // Step 3: GET_SYS_VAL(0x00, 0x04) — read SN bytes back to verify.
  const getSysValFrame = buildFrame(CMD_GET_SYS_VAL, [0x00, 0x04]);
  console.log(`[repair] -> GET_SYS_VAL(offset=0x00, length=4): ${hexAll(getSysValFrame)}`);
  await writeAndDrain(port, getSysValFrame);
  const getSysValReply = await readUntilEtx(port, 2000);
  console.log(`[repair] <- GET_SYS_VAL reply: ${hexAll(getSysValReply)}`);

  // Parse the SN bytes out of the reply. Frame layout:
  //   [STX, cmd, len, off_hi, off_lo, b0, b1, b2, b3, crc_hi, crc_lo, ETX]
  // The reply doesn't include WAKEUP, but parsing tolerates a leading WAKEUP
  // just in case the station echoes one.
  let i = 0;
  while (i < getSysValReply.length && getSysValReply[i] === WAKEUP) i++;
  if (getSysValReply[i] !== STX) {
    throw new Error(
      `Expected STX at index ${i}, got ${hex(getSysValReply[i])} (full: ${hexAll(getSysValReply)})`
    );
  }
  // STX at i, cmd at i+1, len at i+2, params from i+3 ... params include 2-byte offset + 4 data bytes.
  const dataStart = i + 3 + 2; // skip STX, cmd, len, off_hi, off_lo
  const snBytes = getSysValReply.slice(dataStart, dataStart + 4);

  console.log(`[repair] SN bytes [0x00..0x03] = [${hexAll(snBytes)}]`);
  if (snBytes[2] === 0x0e) {
    const sn =
      ((snBytes[0] ?? 0) << 24) |
      ((snBytes[1] ?? 0) << 16) |
      ((snBytes[2] ?? 0) << 8) |
      (snBytes[3] ?? 0);
    // Use >>> 0 to coerce to unsigned for the printout.
    console.log(
      `[repair] Repair complete. Station SN = ${sn >>> 0} (0x${(sn >>> 0).toString(16).toUpperCase()})`
    );
    exit(0);
  } else {
    console.error(`[repair] FAILED: byte 0x02 is ${hex(snBytes[2])}, expected 0x0E.`);
    exit(2);
  }
} finally {
  await new Promise((resolve) => port.close(() => resolve()));
}

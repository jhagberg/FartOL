// Authored for fartola. Not ported from upstream.
//
// Production PrinterSink — wraps `node-thermal-printer` (an ESC/POS CLI for
// Star / Epson / Brother thermal printers) behind plan 03's PrinterSink
// interface. Lazy native require (PATTERNS S-3): the real package is only
// imported inside `buildPrinter` so unrelated tests (e.g. matching,
// projection) load without libusb / native prebuilds. Tests inject a fake
// printerFactory (PATTERNS S-2) and exercise the queue + error mapping
// without any native dependency.
//
// Pitfall 6 (RESEARCH): /dev/usb/lp* device path varies. probePath() scans
// /dev/usb/lp0..lp3 via fs.existsSync at PRINT TIME (not at construction)
// so a printer plugged in mid-event-loop still works.
//
// Single-flight FIFO queue (W-7 contract): print() returns a Promise that
// resolves only after the underlying execute() finishes. Concurrent callers
// serialize through the in-process queue. queueCap (default 50) protects
// against runaway-loop DoS (T-DOS-PRINT mitigation; matches plan 03's
// T-DOS-WS analog).
//
// Locked by:
// - .planning/phases/01-single-laptop-training-mvp/01-15-PLAN.md task 1
// - .planning/phases/01-single-laptop-training-mvp/01-PATTERNS.md §S-2
//   (sink injection) + §S-3 (lazy native require)
// - .planning/phases/01-single-laptop-training-mvp/01-RESEARCH.md
//   §"Pattern 6: ESC/POS thermal print via node-thermal-printer" +
//   §"Pitfall 6: USB device path varies"

import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';

import type { PrinterSink, PrintEnvelope, ReceiptData } from './sink.ts';
import { renderTemplate, type ThermalPrinterLike } from './templates.ts';

export type PrinterTypeId = 'star' | 'epson' | 'brother';

export interface DriverOpts {
  /** Default 'star' — Phase 1 bench unit is the Star TSP143. Operators can
   * override via FARTOLA_PRINTER_TYPE env var at the bin layer. */
  printerType?: PrinterTypeId;
  /** Override /dev/usb/lp* probing (tests). When undefined, probePath()
   * scans /dev/usb/lp{0..3} at print time. */
  devicePath?: string;
  /** Override the auto-probed paths. Tests use this to avoid depending on
   * whether the developer machine currently has a printer plugged in. */
  probePaths?: readonly string[];
  /** node-thermal-printer characterSet. Default PC852_LATIN2 (covers å/ä/ö
   * for Swedish names + clubs). */
  characterSet?: string;
  /** Single-flight queue cap. Default 50. The 51st print() rejects with
   * 'queue_full' so a runaway loop doesn't accumulate memory. */
  queueCap?: number;
  /** PATTERNS S-2 — tests pass a fake factory that returns an in-memory
   * fake. When undefined, buildPrinter() lazy-requires node-thermal-printer
   * and constructs the real driver. */
  printerFactory?: (opts: PrinterFactoryOpts) => ThermalPrinterLike;
}

export interface PrinterFactoryOpts {
  type: PrinterTypeId;
  /** node-thermal-printer local-port/file interface, e.g. `/dev/usb/lp0`. */
  interface: string;
  characterSet: string;
}

const DEFAULT_QUEUE_CAP = 50;
const DEFAULT_PROBE_PATHS = ['/dev/usb/lp0', '/dev/usb/lp1', '/dev/usb/lp2', '/dev/usb/lp3'];

/** Construct the production sink. Returned object also exposes `dispose()`
 * so the Fastify onClose hook can drain the queue. */
export function createNodeThermalPrinterSink(
  opts: DriverOpts = {}
): PrinterSink & { dispose: () => void } {
  const printerType: PrinterTypeId = opts.printerType ?? 'star';
  const characterSet = opts.characterSet ?? 'PC852_LATIN2';
  const queueCap = opts.queueCap ?? DEFAULT_QUEUE_CAP;

  const queue: Array<() => Promise<void>> = [];
  let processing = false;
  let disposed = false;

  /** Pitfall 6 — scan at print time, not construction. Returns the first
   * existing /dev/usb/lp{0..3} (or opts.devicePath if set). null when no
   * USB lp device is plugged in; print() then rejects with
   * 'printer_offline' so the REST handler maps to 503. */
  function probePath(): string | null {
    if (opts.devicePath !== undefined) return opts.devicePath;
    for (const p of opts.probePaths ?? DEFAULT_PROBE_PATHS) {
      if (existsSync(p)) return p;
    }
    return null;
  }

  /** Lazy native require (PATTERNS S-3): node-thermal-printer is only
   * loaded when an actual print is requested. When opts.printerFactory is
   * provided (tests), the real module is never loaded — so unit tests run
   * on systems without libusb / udev permissions. */
  function buildPrinter(): ThermalPrinterLike | null {
    const path = probePath();
    if (path === null && opts.printerFactory === undefined) return null;
    if (opts.printerFactory !== undefined) {
      return opts.printerFactory({
        type: printerType,
        interface: path ?? '/dev/null',
        characterSet,
      });
    }
    // Lazy: only require at print time.
    const require = createRequire(import.meta.url);
    const ntp = require('node-thermal-printer') as {
      printer: new (cfg: Record<string, unknown>) => ThermalPrinterLike;
      types: Record<string, string>;
    };
    const typeEnum =
      printerType === 'epson'
        ? ntp.types['EPSON']
        : printerType === 'brother'
          ? ntp.types['BROTHER']
          : ntp.types['STAR'];
    return new ntp.printer({
      type: typeEnum,
      interface: path,
      characterSet,
      removeSpecialCharacters: false,
      options: { timeout: 5000 },
    });
  }

  function pump(): void {
    if (processing || disposed) return;
    const job = queue.shift();
    if (job === undefined) return;
    processing = true;
    job().finally(() => {
      processing = false;
      if (!disposed && queue.length > 0) pump();
    });
  }

  return {
    async isPrinterConnected(): Promise<boolean> {
      const printer = buildPrinter();
      if (printer === null) return false;
      try {
        return await printer.isPrinterConnected();
      } catch {
        return false;
      }
    },

    print(envelope: PrintEnvelope): Promise<void> {
      if (disposed) return Promise.reject(new Error('disposed'));
      if (queue.length >= queueCap) return Promise.reject(new Error('queue_full'));
      return new Promise<void>((resolve, reject) => {
        queue.push(async () => {
          const printer = buildPrinter();
          if (printer === null) {
            reject(new Error('printer_offline'));
            return;
          }
          try {
            const connected = await printer.isPrinterConnected();
            if (!connected) {
              reject(new Error('printer_offline'));
              return;
            }
            printer.clear();
            // The route handler + auto-print bridge always pass a fully
            // populated ReceiptData; cast is safe at this single boundary.
            await renderTemplate(printer, envelope.template, envelope.data as ReceiptData);
            printer.cut();
            await printer.execute();
            resolve();
          } catch (err) {
            reject(err instanceof Error ? err : new Error(String(err)));
          }
        });
        pump();
      });
    },

    dispose(): void {
      disposed = true;
      queue.length = 0;
    },
  };
}

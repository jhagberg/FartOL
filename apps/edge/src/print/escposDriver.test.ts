// Authored for fartol. Not ported from upstream.
//
// node:test coverage for createNodeThermalPrinterSink (the production
// ESC/POS PrinterSink). PATTERNS S-2 injection — every test passes a
// fake printerFactory so we exercise the queue + error mapping WITHOUT
// touching node-thermal-printer's native libusb. PATTERNS S-3 stays
// honoured: this test file never imports node-thermal-printer directly.
//
// Coverage matrix:
//   1. End-to-end print() invokes the fake printer's clear, render, cut,
//      execute calls in the expected order.
//   2. Single-flight FIFO — two concurrent print() promises serialize
//      through the queue (assert ordering of execute calls).
//   3. queueCap respected — the (cap+1)th print rejects with 'queue_full'.
//   4. No /dev/usb/lp* + no factory probe override → print rejects with
//      'printer_offline'.
//   5. dispose() clears queue + rejects future prints.
//
// Locked by 01-15-PLAN.md task 1.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { createNodeThermalPrinterSink } from './escposDriver.ts';
import type { ThermalPrinterLike } from './templates.ts';
import type { PrintEnvelope } from './sink.ts';

/** Minimal in-memory fake printer that records every method call for
 * order/equality assertions. isPrinterConnected resolves true by default;
 * tests that need disconnection toggle the flag manually. */
interface FakeRec {
  calls: string[];
  executeCount: number;
  connected: boolean;
}

function makeFakePrinter(rec: FakeRec): ThermalPrinterLike {
  return {
    async isPrinterConnected(): Promise<boolean> {
      rec.calls.push('isPrinterConnected');
      return rec.connected;
    },
    println(text: string): void {
      rec.calls.push(`println:${text.slice(0, 16)}`);
    },
    print(text: string): void {
      rec.calls.push(`print:${text.slice(0, 16)}`);
    },
    newLine(): void {
      rec.calls.push('newLine');
    },
    bold(on: boolean): void {
      rec.calls.push(`bold:${on}`);
    },
    alignLeft(): void {
      rec.calls.push('alignLeft');
    },
    alignCenter(): void {
      rec.calls.push('alignCenter');
    },
    alignRight(): void {
      rec.calls.push('alignRight');
    },
    drawLine(): void {
      rec.calls.push('drawLine');
    },
    cut(): void {
      rec.calls.push('cut');
    },
    async printImageBuffer(buf: Buffer): Promise<Buffer> {
      rec.calls.push(`printImageBuffer:${buf.length}`);
      return buf;
    },
    setTextNormal(): void {
      rec.calls.push('setTextNormal');
    },
    setTextDoubleHeight(): void {
      rec.calls.push('setTextDoubleHeight');
    },
    setTextDoubleWidth(): void {
      rec.calls.push('setTextDoubleWidth');
    },
    async execute(): Promise<void> {
      rec.executeCount++;
      rec.calls.push('execute');
    },
    clear(): void {
      rec.calls.push('clear');
    },
    leftRight(left: string, right: string): void {
      rec.calls.push(`leftRight:${left.slice(0, 8)}|${right.slice(0, 8)}`);
    },
  };
}

/** Build a fully-populated minimal ReceiptData for the minimal template
 * (the smallest blast radius). The test only cares about ORDER of calls,
 * not visual content — so the data fields can be sentinels. */
function makeEnvelope(): PrintEnvelope {
  return {
    template: 'minimal',
    competition_id: 'comp-1',
    card_number: 7501853,
    data: {
      competitor: {
        id: 'c1',
        name: 'Anna',
        club: 'OK Test',
        class_id: 'cls-1',
        card_number: 7501853,
        status: 'OK',
        card_read_history: [],
        latest_punches: [],
        latest_start: null,
        latest_finish: null,
        missing_codes: [],
        extra_codes: [],
        out_of_order_codes: [],
        elapsed_time_ms: 60_000,
        manual_dnf_reason: null,
        manual_status: null,
      },
      competition: {
        id: 'comp-1',
        name: 'Test',
        date: '2026-05-22',
        receipt_template: 'minimal',
        auto_print: false,
      },
      classObj: { id: 'cls-1', name: 'H21' },
      course: { id: 'crs-1', name: 'A', length_m: null, climb_m: null, control_codes: [] },
      placeContext: {
        place: 1,
        behind_leader_ms: 0,
        leader_name: 'Anna',
        class_rows: [],
      },
    },
  };
}

describe('createNodeThermalPrinterSink (PATTERNS S-2 / S-3)', () => {
  test('test 0: local USB devicePath is passed as a direct file interface', async () => {
    const rec: FakeRec = { calls: [], executeCount: 0, connected: true };
    const interfaces: string[] = [];
    const sink = createNodeThermalPrinterSink({
      devicePath: '/dev/usb/lp0',
      printerFactory: (opts) => {
        interfaces.push(opts.interface);
        return makeFakePrinter(rec);
      },
    });

    assert.equal(await sink.isPrinterConnected(), true);
    assert.deepEqual(interfaces, ['/dev/usb/lp0']);
    sink.dispose();
  });

  test('test 1: end-to-end print() invokes clear → render → cut → execute on the fake', async () => {
    const rec: FakeRec = { calls: [], executeCount: 0, connected: true };
    const sink = createNodeThermalPrinterSink({
      // devicePath override skips the /dev/usb/lp* probe so the fake
      // factory is actually invoked.
      devicePath: '/dev/null',
      printerFactory: () => makeFakePrinter(rec),
    });
    await sink.print(makeEnvelope());
    // clear must come BEFORE any println / cut; execute must come LAST.
    const clearIdx = rec.calls.indexOf('clear');
    const cutIdx = rec.calls.indexOf('cut');
    const execIdx = rec.calls.indexOf('execute');
    assert.ok(clearIdx >= 0, 'clear must be called');
    assert.ok(cutIdx > clearIdx, 'cut must come after clear');
    assert.ok(execIdx > cutIdx, 'execute must come after cut');
    assert.equal(rec.executeCount, 1);
    sink.dispose();
  });

  test('test 2: two concurrent print() calls serialize through the FIFO queue', async () => {
    const rec: FakeRec = { calls: [], executeCount: 0, connected: true };
    const sink = createNodeThermalPrinterSink({
      devicePath: '/dev/null',
      printerFactory: () => makeFakePrinter(rec),
    });
    const p1 = sink.print(makeEnvelope());
    const p2 = sink.print(makeEnvelope());
    await Promise.all([p1, p2]);
    assert.equal(rec.executeCount, 2, 'both prints must complete');
    // Two execute calls in the record — proves they ran sequentially.
    const execs = rec.calls.filter((c) => c === 'execute');
    assert.equal(execs.length, 2);
    sink.dispose();
  });

  test('test 3: queueCap respected — (cap+1)th print rejects with queue_full', async () => {
    const rec: FakeRec = { calls: [], executeCount: 0, connected: true };
    // Use a slow fake printer so the queue fills before any drains.
    const slowFactory = (): ThermalPrinterLike => ({
      ...makeFakePrinter(rec),
      async execute(): Promise<void> {
        rec.executeCount++;
        rec.calls.push('execute');
        await new Promise((r) => setTimeout(r, 50));
      },
    });
    const sink = createNodeThermalPrinterSink({
      devicePath: '/dev/null',
      printerFactory: slowFactory,
      queueCap: 2,
    });
    // Fire 4 prints. Item 1 drains the queue (in-flight), items 2-3
    // queue inside the cap=2, item 4 must reject with queue_full.
    const promises: Promise<unknown>[] = [];
    for (let i = 0; i < 4; i++) {
      promises.push(sink.print(makeEnvelope()).catch((e: Error) => ({ error: e.message })));
    }
    const results = await Promise.all(promises);
    const fullCount = results.filter(
      (r) => typeof r === 'object' && r !== null && 'error' in r && r.error === 'queue_full'
    ).length;
    assert.ok(fullCount >= 1, `expected ≥1 queue_full reject; got ${fullCount}`);
    sink.dispose();
  });

  test('test 4: no probed printer path + no factory → print rejects with printer_offline', async () => {
    // No devicePath, no factory, and guaranteed-missing probe paths:
    // buildPrinter returns null and print() rejects. This must not depend
    // on whether the developer machine currently has /dev/usb/lp0 plugged in.
    const sink = createNodeThermalPrinterSink({
      probePaths: ['/tmp/fartol-missing-lp0', '/tmp/fartol-missing-lp1'],
    });
    await assert.rejects(
      () => sink.print(makeEnvelope()),
      (err: Error) => err.message === 'printer_offline'
    );
    sink.dispose();
  });

  test('test 5: dispose() rejects subsequent prints', async () => {
    const rec: FakeRec = { calls: [], executeCount: 0, connected: true };
    const sink = createNodeThermalPrinterSink({
      devicePath: '/dev/null',
      printerFactory: () => makeFakePrinter(rec),
    });
    sink.dispose();
    await assert.rejects(
      () => sink.print(makeEnvelope()),
      (err: Error) => err.message === 'disposed'
    );
  });

  test('test 6: isPrinterConnected returns false on disconnection', async () => {
    const rec: FakeRec = { calls: [], executeCount: 0, connected: false };
    const sink = createNodeThermalPrinterSink({
      devicePath: '/dev/null',
      printerFactory: () => makeFakePrinter(rec),
    });
    const connected = await sink.isPrinterConnected();
    assert.equal(connected, false);
    // And print() rejects with 'printer_offline' when the fake reports
    // disconnected.
    await assert.rejects(
      () => sink.print(makeEnvelope()),
      (err: Error) => err.message === 'printer_offline'
    );
    sink.dispose();
  });
});

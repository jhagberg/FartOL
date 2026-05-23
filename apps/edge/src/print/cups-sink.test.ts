// Authored for fartola. Not ported from upstream.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { createCupsPrinterSink, type CommandCall } from './cups-sink.ts';
import type { PrintEnvelope } from './sink.ts';

function makeEnvelope(): PrintEnvelope {
  return {
    template: 'classic',
    competition_id: 'comp-1',
    card_number: 7501853,
    data: {
      competitor: {
        id: 'c1',
        name: 'Anna Testlopare',
        club: 'fartOLa OK',
        class_id: 'cls-1',
        card_number: 7501853,
        status: 'OK',
        card_read_history: [],
        latest_punches: [
          { code: 31, seconds_in_half_day: 360, half_day: 0 },
          { code: 32, seconds_in_half_day: 735, half_day: 0 },
        ],
        latest_start: { seconds_in_half_day: 0, half_day: 0 },
        latest_finish: { seconds_in_half_day: 1325, half_day: 0 },
        missing_codes: [],
        extra_codes: [],
        out_of_order_codes: [],
        elapsed_time_ms: 1_325_000,
        manual_dnf_reason: null,
        manual_status: null,
      },
      competition: {
        id: 'comp-1',
        name: 'fartOLa Kvitto Test',
        date: '2026-05-14',
        receipt_template: 'classic',
        auto_print: false,
      },
      classObj: { id: 'cls-1', name: 'H21' },
      course: { id: 'crs-1', name: 'A', length_m: null, climb_m: null, control_codes: [31, 32] },
      placeContext: {
        place: 1,
        behind_leader_ms: 0,
        leader_name: 'Anna Testlopare',
        class_rows: [
          {
            competitor_id: 'c1',
            name: 'Anna Testlopare',
            club: 'fartOLa OK',
            class_id: 'cls-1',
            class_name: 'H21',
            card_number: 7501853,
            status: 'OK',
            elapsed_time_ms: 1_325_000,
            place: 1,
            behind_leader_ms: 0,
          },
        ],
      },
    },
  };
}

describe('createCupsPrinterSink', () => {
  test('renders a receipt template and submits it to lp', async () => {
    const calls: CommandCall[] = [];
    const sink = createCupsPrinterSink({
      queueName: 'TSP143--STR_T-001-',
      runCommand: async (call) => {
        calls.push(call);
        return { code: 0, stdout: 'request id is TSP143--STR_T-001--67', stderr: '' };
      },
    });

    await sink.print(makeEnvelope());

    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.command, 'lp');
    assert.deepEqual(calls[0]!.args, ['-d', 'TSP143--STR_T-001-', '-t', 'fartOLa-receipt', '-']);
    const input = calls[0]!.input ?? '';
    assert.match(input, /fartOLa Kvitto Test/);
    assert.match(input, /Bricka 7501853/);
    assert.match(input, /TOTAL/);
    assert.match(input, /Leder/);
  });

  test('checks queue availability with lpstat', async () => {
    const calls: CommandCall[] = [];
    const sink = createCupsPrinterSink({
      queueName: 'TSP143--STR_T-001-',
      runCommand: async (call) => {
        calls.push(call);
        return { code: 0, stdout: 'printer TSP143--STR_T-001- is idle. enabled', stderr: '' };
      },
    });

    assert.equal(await sink.isPrinterConnected(), true);
    assert.deepEqual(calls[0], { command: 'lpstat', args: ['-p', 'TSP143--STR_T-001-'] });
  });

  test('maps lp failures to print_failed', async () => {
    const sink = createCupsPrinterSink({
      runCommand: async () => ({ code: 1, stdout: '', stderr: 'lp: Unknown destination' }),
    });

    await assert.rejects(() => sink.print(makeEnvelope()), /print_failed: lp: Unknown destination/);
  });
});

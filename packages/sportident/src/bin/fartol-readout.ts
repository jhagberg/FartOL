#!/usr/bin/env node
// Authored for fartol. Not ported from upstream.
//
// Public entry point — `fartol-readout`. Opens a SerialTransport against the
// device path (`--device <path>`, env var `FARTOL_DEVICE`, default
// `/dev/ttyUSB0`), drives SiMainStation through the handshake, and pipes the
// 5 station events into NdjsonEmitter on stdout (NDJSON, schema_version=1)
// plus one-line human diagnostics on stderr (RESEARCH §"NDJSON Output Schema",
// §"Open Questions #4 Recommendation").
//
// Codex review #1: the `frameError` handler accepts the typed FrameError
// directly from siProtocol and forwards it to `emitter.frame_error`. No
// stdout-warning interception or string parsing anywhere in the call graph.
//
// Real-hardware execution happens here — Plan 06's smoke script spawns this
// bin against /dev/ttyUSB0. Tests use FakeSerialTransport at the SiMainStation
// layer (src/SiStation/SiMainStation.test.ts, src/integration/e2e.test.ts).
//
// See packages/sportident/NOTICE.md for cumulative attribution.

import { SerialTransport } from '../transport/SerialTransport.ts';
import { SiMainStation } from '../SiStation/SiMainStation.ts';
import { NdjsonEmitter, type CardType } from '../output/ndjson.ts';
import { emitDiagnostic } from '../output/diagnostics.ts';
import type { FrameError } from '../siProtocol.ts';
import type { BaseSiCard } from '../SiCard/BaseSiCard.ts';

// ---------------------------------------------------------------------------
// CLI arg parsing — minimal hand-rolled (no commander/yargs dep). Flags:
//   --device <path>          Serial device (overrides $FARTOL_DEVICE)
//   --once                   Read one card then exit
//   --include-raw-pages      Include raw_pages_b64 in card_read events
//   --record <path>          (Plan 06) record raw byte stream to file
//   --replay <path>          (Plan 06) replay byte stream from file
// ---------------------------------------------------------------------------

interface CliOpts {
  device: string;
  once: boolean;
  includeRawPages: boolean;
  record?: string;
  replay?: string;
}

const parseArgs = (argv: string[]): CliOpts => {
  const opts: CliOpts = {
    device: process.env.FARTOL_DEVICE ?? '/dev/ttyUSB0',
    once: false,
    includeRawPages: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--device') {
      const next = argv[++i];
      if (next === undefined) throw new Error('--device requires a value');
      opts.device = next;
    } else if (a === '--once') {
      opts.once = true;
    } else if (a === '--include-raw-pages') {
      opts.includeRawPages = true;
    } else if (a === '--record') {
      const next = argv[++i];
      if (next === undefined) throw new Error('--record requires a path');
      opts.record = next; // implemented in plan-06
    } else if (a === '--replay') {
      const next = argv[++i];
      if (next === undefined) throw new Error('--replay requires a path');
      opts.replay = next; // implemented in plan-06
    } else if (a === '--help' || a === '-h') {
      process.stdout.write(
        'fartol-readout: stream SportIdent card reads as NDJSON.\n' +
          'Usage: fartol-readout [--device /dev/ttyUSB0] [--once] [--include-raw-pages]\n'
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  return opts;
};

const TYPE_MAP: Record<string, CardType> = {
  SiCard5: 'SI5',
  SiCard8: 'SI8',
  SiCard9: 'SI9',
  SiCard10: 'SI10',
  SiCard11: 'SI11',
  SIAC: 'SIAC',
};

const formatCrcHex = (pair: [number, number] | undefined): string => {
  if (!pair) return '?';
  return (
    pair[0].toString(16).padStart(2, '0').toUpperCase() +
    pair[1].toString(16).padStart(2, '0').toUpperCase()
  );
};

const main = async (): Promise<void> => {
  const opts = parseArgs(process.argv.slice(2));
  const emitter = new NdjsonEmitter({
    device_path: opts.device,
    includeRawPages: opts.includeRawPages,
  });

  emitter.connection_changed({ state: 'opening' });
  const transport = new SerialTransport({ path: opts.device, baudRate: 38400 });
  const station = new SiMainStation(transport);

  // Wire all five events. CODEX REVIEW #1: the frameError handler receives
  // the typed FrameError directly — NO string parsing of warning lines.
  station.on('cardInserted', (card: BaseSiCard) => {
    const card_type = TYPE_MAP[card.constructor.name] ?? 'SI5';
    emitter.card_inserted({
      card_type,
      card_number: card.cardNumber,
      ...(card.cardSeriesByte !== undefined ? { card_series_byte: card.cardSeriesByte } : {}),
    });
  });
  station.on('cardRead', (card: BaseSiCard) => {
    emitter.card_read({ card });
    if (opts.once) {
      void station.close().then(() => process.exit(0));
    }
  });
  station.on('cardRemoved', (cardNumber: number) =>
    emitter.card_removed({ card_number: cardNumber })
  );
  station.on('frameError', (err: FrameError) => {
    emitter.frame_error(err);
    emitDiagnostic(
      `frame_error ${err.error_code}: expected ${formatCrcHex(err.expected_crc)}, got ${formatCrcHex(err.actual_crc)} (${err.bytes_consumed} bytes consumed)`
    );
  });
  station.on(
    'connectionChanged',
    (state: 'opening' | 'open' | 'closed' | 'error', err?: { message?: string }) => {
      emitter.connection_changed({
        state,
        ...(err?.message ? { error: err.message } : {}),
      });
    }
  );

  // SIGINT: close cleanly, exit 0.
  process.on('SIGINT', () => {
    void station.close().then(() => process.exit(0));
  });

  // Per RESEARCH §Landmines #12: ensure piped stdout writes don't drop on
  // SIGTERM. Best-effort; the type cast accounts for the internal _handle.
  try {
    (
      process.stdout as unknown as { _handle?: { setBlocking?: (b: boolean) => void } }
    )._handle?.setBlocking?.(true);
  } catch {
    // best-effort; ignore
  }

  await transport.open();
  await station.readCards();
  // Stay alive listening for cards until SIGINT or --once mode triggers exit
  // via cardRead handler.
};

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  // Emit a final stdout connection_changed/error + stderr diagnostic so both
  // pipelines see the fatal. Build the NdjsonEmitter on demand because the
  // failure may have happened before construction (e.g. invalid --device).
  try {
    const emitter = new NdjsonEmitter({
      device_path: process.env.FARTOL_DEVICE ?? '/dev/ttyUSB0',
    });
    emitter.connection_changed({ state: 'error', error: message });
  } catch {
    // ignore secondary failure
  }
  emitDiagnostic(`fatal: ${err instanceof Error ? (err.stack ?? message) : message}`);
  process.exit(1);
});

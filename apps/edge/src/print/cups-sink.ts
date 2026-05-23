// Authored for fartola. Not ported from upstream.
//
// CUPS PrinterSink for Star TSP100/TSP143 queues. The TSP100IIIU bench
// unit prints reliably through Star's CUPS raster driver, while direct
// /dev/usb/lp0 writes can complete without paper output. This sink keeps
// the existing receipt templates as the source of truth, renders them to
// receipt-width text, then submits the text to CUPS via `lp`.

import { spawn } from 'node:child_process';

import type { PrinterSink, PrintEnvelope, ReceiptData } from './sink.ts';
import { renderTemplate, type ThermalPrinterLike } from './templates.ts';

export interface CommandCall {
  command: string;
  args: string[];
  input?: string;
}

export interface CommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
}

export type RunCommand = (call: CommandCall) => Promise<CommandResult>;

export interface CreateCupsPrinterSinkOpts {
  /** CUPS destination name. Defaults to the queue Ubuntu created for the
   * Phase-1 Star TSP143 bench printer. */
  queueName?: string;
  /** Job title visible in `lpstat`. */
  title?: string;
  /** Approximate receipt text width. */
  lineWidth?: number;
  /** Test injection for lp/lpstat. */
  runCommand?: RunCommand;
}

const DEFAULT_QUEUE = 'TSP143--STR_T-001-';
const DEFAULT_TITLE = 'fartOLa-receipt';
const DEFAULT_WIDTH = 32;

class TextReceiptPrinter implements ThermalPrinterLike {
  private readonly width: number;
  private readonly lines: string[] = [];
  private currentLine = '';

  constructor(width: number) {
    this.width = width;
  }

  async isPrinterConnected(): Promise<boolean> {
    return true;
  }

  println(text = ''): void {
    this.currentLine += text;
    this.lines.push(this.currentLine);
    this.currentLine = '';
  }

  print(text: string): void {
    this.currentLine += text;
  }

  newLine(): void {
    this.println('');
  }

  bold(): void {}
  alignLeft(): void {}
  alignCenter(): void {}
  alignRight(): void {}
  setTextNormal(): void {}
  setTextDoubleHeight(): void {}
  setTextDoubleWidth(): void {}

  drawLine(character = '-'): void {
    this.println(character.repeat(this.width));
  }

  cut(): void {
    this.newLine();
    this.newLine();
  }

  async printImageBuffer(buffer: Buffer): Promise<Buffer> {
    this.println('[image]');
    return buffer;
  }

  async execute(): Promise<void> {}

  clear(): void {
    this.lines.length = 0;
    this.currentLine = '';
  }

  leftRight(left: string, right: string): void {
    const gap = Math.max(1, this.width - left.length - right.length);
    this.println(`${left}${' '.repeat(gap)}${right}`);
  }

  toText(): string {
    if (this.currentLine.length > 0) this.println('');
    return `${this.lines.join('\n')}\n\n\n`;
  }
}

function defaultRunCommand(call: CommandCall): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(call.command, call.args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      resolve({ code: null, stdout, stderr, error });
    });
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });

    child.stdin.end(call.input ?? '');
  });
}

function resultMessage(result: CommandResult): string {
  return (
    result.stderr.trim() ||
    result.stdout.trim() ||
    result.error?.message ||
    `command exited with code ${result.code ?? 'null'}`
  );
}

export function createCupsPrinterSink(opts: CreateCupsPrinterSinkOpts = {}): PrinterSink {
  const queueName = opts.queueName ?? DEFAULT_QUEUE;
  const title = opts.title ?? DEFAULT_TITLE;
  const width = opts.lineWidth ?? DEFAULT_WIDTH;
  const runCommand = opts.runCommand ?? defaultRunCommand;

  return {
    async isPrinterConnected(): Promise<boolean> {
      const result = await runCommand({ command: 'lpstat', args: ['-p', queueName] });
      if (result.code !== 0) return false;
      return !/\bdisabled\b/i.test(result.stdout);
    },

    async print(envelope: PrintEnvelope): Promise<void> {
      const textPrinter = new TextReceiptPrinter(width);
      await renderTemplate(textPrinter, envelope.template, envelope.data as ReceiptData);
      textPrinter.cut();
      const result = await runCommand({
        command: 'lp',
        args: ['-d', queueName, '-t', title, '-'],
        input: textPrinter.toText(),
      });
      if (result.code !== 0) {
        throw new Error(`print_failed: ${resultMessage(result)}`);
      }
    },
  };
}

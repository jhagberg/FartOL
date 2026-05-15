// Authored for fartol. Not ported from upstream.
// Shared transport-layer errors. Imported by SerialTransport.ts (post-close send rejection)
// AND by SiSendTask.ts (mid-flight abort) — defined here so neither file imports from the other.
// Codex review #5 (HIGH): created BEFORE any consumer so Task 1's tsc --noEmit passes
// regardless of Task 2's progress.

export class DeviceClosedError extends Error {
  constructor(reason?: string) {
    super(reason ?? 'Device closed');
    this.name = 'DeviceClosedError';
  }
}

export class SendTimeoutError extends Error {
  constructor(command: number, timeoutMs: number) {
    super(
      `Send timed out after ${timeoutMs}ms (command 0x${command.toString(16).padStart(2, '0').toUpperCase()})`
    );
    this.name = 'SendTimeoutError';
  }
}

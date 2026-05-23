<!--
  Authored for fartola. Not ported from upstream.

  ReceiptPaper — 300px-wide 80mm thermal-paper emulation. Holds whichever
  template the parent selects and wraps it in the diagonal-stripe scrim +
  torn-bottom clip-path that mirrors the printer mock in
  01-SKETCHES/.../screens-readout.jsx (lines 124-163).

  The wrap div carries the diagonal stripe background; the inner `.paper`
  carries the receipt-paper background (#fdfcf7) and the torn-edge
  clip-path so the receipt looks physically detached at the bottom.

  Mono-printable invariant: ALL colours inside the `.paper` are
  #1a1a1a (ink) on #fdfcf7 (paper) — see Kids template. Other templates
  may use grey tints (#444/#666/#888) for less-important type, which the
  ESC/POS bitmap pass in plan 15 dithers to ink-or-nothing. Nothing in
  this wrapper introduces accent / status colours.

  Locked by:
  - 01-13-PLAN.md task 1 (artifact: ReceiptPaper.svelte)
  - 01-UI-SPEC.md §"Receipt-specific typography"
  - 01-SKETCHES/.../screens-readout.jsx (visual reference)
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    children?: Snippet;
  }

  let { children }: Props = $props();
</script>

<div class="receipt-wrap">
  <div class="paper">
    {@render children?.()}
  </div>
</div>

<style>
  .receipt-wrap {
    background: repeating-linear-gradient(
      -45deg,
      var(--bg-sunken) 0 12px,
      var(--bg) 12px 24px
    );
    padding: 20px;
    display: flex;
    justify-content: center;
    border-radius: 0 0 var(--radius-lg) var(--radius-lg);
  }
  .paper {
    background: #fdfcf7;
    color: #1a1a1a;
    width: var(--receipt-w, 300px);
    padding: 18px 16px 28px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
    font-family: var(--font-mono);
    font-size: var(--fs-rcpt-body, 11.5px);
    line-height: 1.5;
    clip-path: polygon(
      0 0,
      100% 0,
      100% calc(100% - 6px),
      96% 100%,
      90% calc(100% - 4px),
      84% 100%,
      78% calc(100% - 4px),
      72% 100%,
      66% calc(100% - 4px),
      60% 100%,
      54% calc(100% - 4px),
      48% 100%,
      42% calc(100% - 4px),
      36% 100%,
      30% calc(100% - 4px),
      24% 100%,
      18% calc(100% - 4px),
      12% 100%,
      6% calc(100% - 4px),
      0 100%
    );
  }
  /* Shared receipt-internal primitives — children render naked HTML that
     matches the .rcpt-* class hooks from screens-readout.jsx, scoped to
     this component via :global so templates stay clean Svelte 5. */
  .paper :global(.rcpt-title) {
    font-weight: 700;
    text-align: center;
    letter-spacing: 0.1em;
    font-size: var(--fs-rcpt-title, 13px);
    padding-bottom: 10px;
    border-bottom: 1.5px dashed #333;
    margin-bottom: 10px;
  }
  .paper :global(.rcpt-row) {
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }
  .paper :global(.rcpt-row b) {
    font-weight: 700;
  }
  .paper :global(.rcpt-sep) {
    border-top: 1px dashed #888;
    margin: 10px 0;
  }
  .paper :global(.rcpt-sep-dot) {
    border-top: 1px dotted #888;
    margin: 10px 0;
  }
  .paper :global(.rcpt-total) {
    font-weight: 700;
    font-size: var(--fs-rcpt-total, 14px);
  }
  .paper :global(.rcpt-foot) {
    text-align: center;
    margin-top: 12px;
    font-size: var(--fs-rcpt-foot, 10.5px);
  }
  .paper :global(.splits-rcpt) {
    width: 100%;
    border-collapse: collapse;
  }
  .paper :global(.splits-rcpt td) {
    padding: 1px 0;
  }
  .paper :global(.splits-rcpt td:nth-child(1)) {
    width: 22px;
  }
  .paper :global(.splits-rcpt td:nth-child(2)) {
    width: 32px;
  }
  .paper :global(.splits-rcpt td:nth-child(3)) {
    text-align: right;
  }
  .paper :global(.splits-rcpt td:nth-child(4)) {
    text-align: right;
    width: 50px;
  }
</style>

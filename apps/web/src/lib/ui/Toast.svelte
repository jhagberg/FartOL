<!--
  Authored for fartola. Not ported from upstream.

  Single-instance toast. UI-SPEC §"Toasts" — auto-dismiss after 2s by
  default; the print-fail toast extends to 5s (longer dwell for an
  actionable error). Position locked to top-right of the viewport.

  This is the visual primitive only — plans 13/14 wire a tiny toasts
  store that maps to this component. The `tone` prop binds to a token
  pair so the operator sees green for success, red for failure.
-->
<script lang="ts">
  type Tone = 'info' | 'success' | 'error';

  interface Props {
    open: boolean;
    message: string;
    tone?: Tone;
    timeoutMs?: number;
    onClose?: () => void;
  }

  let { open, message, tone = 'info', timeoutMs = 2000, onClose }: Props = $props();

  // Re-arm the dismiss timer every time the open flag flips true. Using
  // $effect with an explicit dependency on `open` keeps the timer
  // single-instance — Svelte 5's `$effect` cleans up the prior timeout
  // before the next pass.
  $effect(() => {
    if (!open) return;
    const id = setTimeout(() => onClose?.(), timeoutMs);
    return () => clearTimeout(id);
  });
</script>

{#if open}
  <div class="toast tone-{tone}" role="status" aria-live="polite">
    {message}
  </div>
{/if}

<style>
  .toast {
    position: fixed;
    top: var(--space-lg);
    right: var(--space-lg);
    padding: 12px 20px;
    border-radius: var(--radius);
    font-size: var(--fs-label);
    box-shadow: var(--shadow-lg);
    z-index: 90;
    font-weight: 500;
  }
  .tone-info {
    background: var(--fg);
    color: var(--bg);
  }
  .tone-success {
    background: var(--ok);
    color: var(--accent-fg);
  }
  .tone-error {
    background: var(--dnf);
    color: var(--accent-fg);
  }
</style>

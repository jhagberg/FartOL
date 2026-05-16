<!--
  Authored for fartol. Not ported from upstream.

  Status pill rendering one of the four LOCKED Phase 1 outcomes
  (UI-SPEC §"Status colors"): OK, MP, DNF, PEND. Soft fill + same-hue
  foreground; the leading dot is `currentColor` so the high-contrast
  bright-sun mode picks up the bordered fallback per tokens.css.

  Props match the projection contract (events.ts ResultStatus): the
  caller passes the four-letter code; this component owns the label
  copy via t() and the color binding via class.
-->
<script lang="ts">
  type Status = 'OK' | 'MP' | 'DNF' | 'PEND';

  interface Props {
    status: Status;
    label?: string;
    small?: boolean;
  }

  let { status, label, small = false }: Props = $props();

  // Class is lower-case to match the sketch CSS hooks; that keeps the
  // contrast-high mode's `border: 1.5px solid currentColor;` overlay
  // simple to retain.
  const klass = $derived(`status ${status.toLowerCase()} ${small ? 'small' : ''}`);
</script>

<span class={klass}>{label ?? status}</span>

<style>
  .status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 999px;
    font-size: var(--fs-caption);
    font-weight: 600;
    font-family: var(--font-mono);
    letter-spacing: 0.02em;
  }
  .status::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
  }
  .status.ok {
    background: var(--ok-soft);
    color: var(--ok);
  }
  .status.mp {
    background: var(--mp-soft);
    color: oklch(0.45 0.12 70);
  }
  .status.dnf {
    background: var(--dnf-soft);
    color: var(--dnf);
  }
  .status.pend {
    background: var(--pend-soft);
    color: var(--fg-muted);
  }
  :global(.contrast-high) .status {
    border: 1.5px solid currentColor;
  }
  .status.small {
    padding: 2px 8px;
    font-size: 11px;
  }
</style>

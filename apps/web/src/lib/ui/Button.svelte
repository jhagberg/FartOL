<!--
  Authored for fartol. Not ported from upstream.

  Locked variants per 01-UI-SPEC.md §"Component Inventory" / §"Buttons":
  - primary | ghost | danger
  - size: sm | md (default) | lg
  - min-height pinned to var(--hit) (44px) — tap-target contract.

  No motion beyond the locked tap-press transform (translateY(1px)) the
  sketch uses. Disabled state mirrors the operator-shutdown affordance
  in the readout sidebar (UI-SPEC export row).
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';

  type Variant = 'primary' | 'ghost' | 'danger';
  type Size = 'sm' | 'md' | 'lg';

  interface Props extends HTMLButtonAttributes {
    variant?: Variant;
    size?: Size;
    children?: Snippet;
  }

  let {
    variant = 'primary',
    size = 'md',
    type = 'button',
    children,
    class: className = '',
    ...rest
  }: Props = $props();
</script>

<button
  {type}
  class="btn variant-{variant} size-{size} {className}"
  {...rest}
>
  {@render children?.()}
</button>

<style>
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-xs);
    padding: 0 var(--space-md);
    height: var(--hit);
    min-height: var(--hit);
    border-radius: var(--radius);
    border: 1px solid var(--border-strong);
    background: var(--bg-elev);
    color: var(--fg);
    font-size: var(--fs-label);
    font-weight: 500;
    white-space: nowrap;
    transition:
      transform 0.06s ease,
      background 0.12s,
      border 0.12s;
  }
  .btn:hover {
    background: var(--bg-sunken);
  }
  .btn:active {
    transform: translateY(1px);
  }
  .btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
  .variant-primary {
    background: var(--accent);
    color: var(--accent-fg);
    border-color: var(--accent);
  }
  .variant-primary:hover {
    background: var(--accent-strong);
  }
  .variant-ghost {
    border-color: transparent;
    background: transparent;
  }
  .variant-ghost:hover {
    background: var(--bg-sunken);
  }
  .variant-danger {
    color: var(--dnf);
    border-color: var(--dnf);
    background: var(--bg-elev);
  }
  .size-sm {
    height: 32px;
    min-height: 32px;
    padding: 0 10px;
    font-size: 13px;
  }
  .size-lg {
    height: 56px;
    min-height: 56px;
    padding: 0 var(--space-lg);
    font-size: var(--fs-body);
  }
</style>

<!--
  Authored for fartol. Not ported from upstream.

  Readout view PLACEHOLDER. The real implementation lands in plan 13
  (latest-read card + history list + receipt mirror + WS-subscribe).
  Plan 12 only needs `/competition/<id>/readout` to resolve so the
  wizard's `goto` target (after the atomic POST succeeds) lands on a
  real page during e2e.

  Renders the competition id from the URL so the wizard happy-path
  e2e can assert the navigation worked (the spec checks the URL
  pattern is a real UUID, not the `_new` literal sentinel).

  Locked by:
  - 01-12-PLAN.md task 2 (placeholder)
  - 01-13-PLAN.md (real readout component)
-->
<script lang="ts">
  import { page } from '$app/state';
  const id = $derived(page.params['id'] ?? '');
</script>

<section class="placeholder">
  <h1>Avläsning</h1>
  <p>Tävling: <code data-testid="readout-competition-id">{id}</code></p>
  <p class="muted">Avläsningsvyn landar i plan 13.</p>
</section>

<style>
  .placeholder {
    display: grid;
    gap: 12px;
  }
  .placeholder h1 {
    margin: 0;
  }
  .muted {
    color: var(--fg-muted);
  }
  code {
    font-family: var(--font-mono);
    background: var(--bg-sunken);
    padding: 2px 6px;
    border-radius: 4px;
  }
</style>

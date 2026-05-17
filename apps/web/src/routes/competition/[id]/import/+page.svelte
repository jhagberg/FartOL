<!--
  Authored for fartol. Not ported from upstream.

  /competition/:id/import — mounts ImportRunnersView, the "where do I
  add runners?" surface. The view itself owns Eventor search + upload-
  XML flows; this shell just forwards the competitionId.
-->
<script lang="ts">
  import { page } from '$app/state';
  import ImportRunnersView from '$lib/screens/ImportRunnersView.svelte';

  const competitionId = $derived(page.params['id'] ?? '');
</script>

{#if competitionId}
  <ImportRunnersView {competitionId} />
{:else}
  <p class="muted">Ingen tävling vald.</p>
{/if}

<style>
  .muted {
    color: var(--fg-muted);
  }
</style>

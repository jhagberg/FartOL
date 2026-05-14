<!--
  Authored for fartol. Not ported from upstream.

  Minimal layout wrapper for Phase 1 plan 01. The full AppShell (sidebar
  240px + topbar 56px + grid `240px 1fr` per UI-SPEC §"Layout shell")
  lands in plan 11 alongside i18next, design tokens, and the component
  inventory. This file deliberately renders only `{@render children()}`
  so subsequent plans can replace the shell without churn here.
-->
<script lang="ts">
  let { children } = $props();
</script>

{@render children()}

<!--
  Authored for fartol. Not ported from upstream.

  Root SvelteKit layout. Plan 11 lands the visual baseline:
    - imports the design tokens + font stack so every route sees the same
      CSS variable surface
    - bootstraps i18next synchronously (RESEARCH §Pitfall 10 — avoid the
      flash-of-English on first paint) by importing the i18n bootstrap
      module for its side effect
    - wraps the route slot in <AppShell> so the 240px sidebar + 56px topbar
      + content grid is the default visual chrome
    - mounts a TweaksPanel (toggled from the sidebar Inställningar item)
      so locale/density/accent/contrast/font-pair changes are operator-
      reachable from any route
    - reacts to tweaks-store mutations via $effect — applyTweaksToRoot
      writes data-accent / data-density / data-font-pair attributes on
      <html> so tokens.css attribute selectors pick the right overrides

  Plans 12-14 add real routing + WS-status wiring; for now the AppShell's
  WS PulseDot stays in its 'closed' default and the SI bridge card shows
  'offline' — the +page.svelte walking-skeleton view owns its own WS
  client because the walking-skeleton uses a synthetic competition_id.
-->
<script lang="ts">
  import '../lib/styles/fonts.css';
  import '../lib/tokens.css';
  // Side-effect import — runs i18next.init() at module-load before any child
  // component calls t(). Locked by RESEARCH §Pitfall 10.
  import '../lib/i18n/index.ts';
  import AppShell from '../lib/layout/AppShell.svelte';
  import TweaksPanel from '../lib/components/TweaksPanel.svelte';
  import { tweaks, applyTweaksToRoot } from '../lib/stores/tweaks.svelte.ts';
  import {
    bridgeStatus,
    toStationStatus,
    toWsStatus,
  } from '../lib/stores/bridgeStatus.svelte.ts';

  let { children } = $props();

  let tweaksOpen = $state(false);

  // Mirror the tweaks store onto <html> attributes whenever any preference
  // changes. The accessor patterns (`tweaks.accent` etc.) make Svelte 5's
  // signal tracker subscribe; the effect re-runs on any mutation.
  $effect(() => {
    if (typeof document === 'undefined') return;
    // Read every field so $effect tracks them all.
    void tweaks.accent;
    void tweaks.density;
    void tweaks.font_pair;
    void tweaks.contrast_high;
    applyTweaksToRoot(document.documentElement);
  });
</script>

<AppShell
  onOpenSettings={() => (tweaksOpen = true)}
  stationStatus={toStationStatus(bridgeStatus.value)}
  wsStatus={toWsStatus(bridgeStatus.value)}
>
  {@render children()}
</AppShell>

<TweaksPanel open={tweaksOpen} onClose={() => (tweaksOpen = false)} />

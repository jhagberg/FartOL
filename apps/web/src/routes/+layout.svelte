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
  import { page } from '$app/state';
  import { goto } from '$app/navigation';

  let { children } = $props();

  let tweaksOpen = $state(false);

  // Extract active competition id from the URL when we're inside
  // /competition/[id]/... The sidebar nav uses this to deep-link to the
  // readout / results / export views without an extra fetch. When the
  // user is on /, the active id is null and nav items for views that
  // require an id fall back to /.
  const activeCompId = $derived.by(() => {
    const m = page.url.pathname.match(/^\/competition\/([^/]+)/);
    return m?.[1] ?? null;
  });

  // Map URL → sidebar route prop so the active item highlights correctly.
  const navRoute = $derived.by(() => {
    const p = page.url.pathname;
    if (p === '/' || p === '') return 'home';
    if (p.endsWith('/readout')) return 'readout';
    if (p.endsWith('/import')) return 'import';
    if (p.endsWith('/results')) return 'results';
    if (p.endsWith('/export')) return 'export';
    return 'home';
  });

  function handleNavigate(route: string): void {
    if (route === 'home') {
      void goto('/');
      return;
    }
    if (activeCompId === null) {
      // No competition selected — fall back to the home picker.
      void goto('/');
      return;
    }
    if (route === 'readout') void goto(`/competition/${activeCompId}/readout`);
    else if (route === 'import') void goto(`/competition/${activeCompId}/import`);
    else if (route === 'results') void goto(`/competition/${activeCompId}/results`);
    else if (route === 'export') void goto(`/competition/${activeCompId}/export`);
  }

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
  onNavigate={handleNavigate}
  route={navRoute}
  stationStatus={toStationStatus(bridgeStatus.value)}
  wsStatus={toWsStatus(bridgeStatus.value)}
>
  {@render children()}
</AppShell>

<TweaksPanel open={tweaksOpen} onClose={() => (tweaksOpen = false)} />

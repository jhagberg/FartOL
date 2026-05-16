<!--
  Authored for fartol. Not ported from upstream.

  Two-column app shell. Locked dimensions:
    grid-template-columns: var(--sidebar-w) 1fr  (240px sidebar)
    topbar: var(--topbar-h)                       (56px topbar)
  per 01-UI-SPEC.md §"Layout shell" + sketches/app.jsx lines 100-145.

  This component is dumb — it composes Sidebar + TopBar + a `children`
  slot and forwards the props its layout neighbours need. The
  +layout.svelte owner wires the wsClient + tweaks + i18n, then passes
  state down (route, wsStatus, readoutBadge) so AppShell remains a
  pure structural component.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import Sidebar from './Sidebar.svelte';
  import TopBar from './TopBar.svelte';

  type WsStatus = 'open' | 'connecting' | 'closed';
  type StationStatus = 'online' | 'offline' | 'connecting';

  interface Props {
    route?: string;
    onNavigate?: (route: string) => void;
    onOpenSettings?: () => void;
    wsStatus?: WsStatus;
    stationStatus?: StationStatus;
    stationSerial?: string;
    readoutBadge?: number | null;
    crumb?: Snippet;
    children?: Snippet;
  }

  let {
    route = 'home',
    onNavigate,
    onOpenSettings,
    wsStatus = 'closed',
    stationStatus = 'offline',
    stationSerial = '—',
    readoutBadge = null,
    crumb,
    children,
  }: Props = $props();
</script>

<div class="app">
  <Sidebar
    {route}
    {onNavigate}
    {onOpenSettings}
    {stationStatus}
    {stationSerial}
    {readoutBadge}
  />
  <main class="main">
    <TopBar {crumb} {wsStatus} />
    <div class="content">
      {@render children?.()}
    </div>
  </main>
</div>

<style>
  .app {
    display: grid;
    grid-template-columns: var(--sidebar-w) 1fr;
    height: 100vh;
    width: 100vw;
    overflow: hidden;
  }
  .main {
    overflow: auto;
    display: flex;
    flex-direction: column;
  }
  .content {
    padding: var(--space-lg);
    flex: 1;
    overflow: auto;
  }
</style>

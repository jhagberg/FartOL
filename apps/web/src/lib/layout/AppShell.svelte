<!--
  Authored for fartol. Not ported from upstream.

  Two-column app shell. Locked dimensions:
    grid-template-columns: var(--sidebar-w) 1fr  (240px sidebar)
    topbar: var(--topbar-h)                       (56px topbar)
  per 01-UI-SPEC.md §"Layout shell" + sketches/app.jsx lines 100-145.

  Mobile (≤720px): sidebar collapses to off-canvas drawer triggered by
  a hamburger in TopBar. This restores Settings + TweaksPanel access on
  phones (without it, the entire /installningar route was unreachable +
  high-contrast bright-sun mode was a desktop-only toggle).

  AppShell owns drawer state because it sits between the route-level
  +layout.svelte (which owns Nav callbacks) and the structural Sidebar /
  TopBar children.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import Sidebar from './Sidebar.svelte';
  import TopBar from './TopBar.svelte';
  import Icon from '../ui/Icon.svelte';
  import { t } from '../i18n/index.ts';

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

  let drawerOpen = $state(false);

  function openDrawer(): void {
    drawerOpen = true;
  }
  function closeDrawer(): void {
    drawerOpen = false;
  }

  /** Wrap nav callbacks so a tap on a drawer item navigates AND closes
   * the drawer in one shot (the drawer is decoration, not a destination). */
  function handleNavigate(r: string): void {
    closeDrawer();
    onNavigate?.(r);
  }
  function handleOpenSettings(): void {
    closeDrawer();
    onOpenSettings?.();
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape' && drawerOpen) closeDrawer();
  }
</script>

<svelte:window on:keydown={onKey} />

<a href="#main" class="skip-link">{t('a11y.skipToContent')}</a>

<div class="app" class:drawer-open={drawerOpen}>
  <div class="sidebar-slot">
    <Sidebar
      {route}
      onNavigate={handleNavigate}
      onOpenSettings={handleOpenSettings}
      {stationStatus}
      {stationSerial}
      {readoutBadge}
    />
  </div>

  <!-- Mobile-only scrim. role=presentation so screen readers don't see it
       as content; the dialog semantics ride on the .sidebar-slot above
       (the Sidebar's <aside> already announces correctly). -->
  {#if drawerOpen}
    <div
      class="drawer-scrim"
      role="presentation"
      onclick={closeDrawer}
      data-testid="drawer-scrim"
    ></div>
    <button
      type="button"
      class="drawer-close"
      onclick={closeDrawer}
      aria-label={t('nav.close')}
      data-testid="drawer-close"
    >
      <Icon name="x" size={22} />
    </button>
  {/if}

  <main class="main" id="main">
    <TopBar {crumb} {wsStatus} onMenu={openDrawer} />
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
  .sidebar-slot {
    display: contents;
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

  /* Mobile drawer mode. Sidebar lifts out of the grid into a fixed off-
     canvas position so we can slide it in over the content. The TopBar
     hamburger is gated by the same breakpoint. */
  @media (max-width: 720px) {
    .app {
      grid-template-columns: 1fr;
    }
    .sidebar-slot {
      display: block;
      position: fixed;
      top: 0;
      left: 0;
      bottom: 0;
      width: min(280px, 80vw);
      z-index: 60;
      transform: translateX(-100%);
      transition: transform 220ms ease-out;
      background: var(--bg-elev);
      box-shadow: var(--shadow-lg);
    }
    .app.drawer-open .sidebar-slot {
      transform: translateX(0);
    }
    .drawer-scrim {
      position: fixed;
      inset: 0;
      background: rgba(20, 20, 30, 0.32);
      z-index: 55;
      backdrop-filter: blur(2px);
    }
    .drawer-close {
      position: fixed;
      top: 8px;
      left: calc(min(280px, 80vw) + 12px);
      z-index: 65;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      border: 0;
      background: var(--bg-elev);
      color: var(--fg);
      box-shadow: var(--shadow-md);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }
    .content {
      padding: var(--space-md);
    }
  }
</style>

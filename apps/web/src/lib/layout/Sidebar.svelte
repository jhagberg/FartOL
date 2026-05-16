<!--
  Authored for fartol. Not ported from upstream.

  Left sidebar — brand + nav + station card + version footer. Per
  01-UI-SPEC.md §"Layout shell" / sketches/app.jsx lines 102-141.

  The active route prop is opaque (string) so we don't bake the route
  list into layout. Plans 12-14 own the routes; this component just
  emits onNavigate(route) and renders an active indicator.
-->
<script lang="ts">
  import BrandMark from './BrandMark.svelte';
  import NavItem from './NavItem.svelte';
  import StationCard from './StationCard.svelte';
  import { t } from '../i18n/index.ts';

  type StationStatus = 'online' | 'offline' | 'connecting';

  interface Props {
    route?: string;
    onNavigate?: (route: string) => void;
    onOpenSettings?: () => void;
    stationStatus?: StationStatus;
    stationSerial?: string;
    readoutBadge?: number | null;
  }

  let {
    route = 'home',
    onNavigate,
    onOpenSettings,
    stationStatus = 'offline',
    stationSerial = '—',
    readoutBadge = null,
  }: Props = $props();
</script>

<aside class="sidebar">
  <div class="brand">
    <BrandMark size={30} />
    <span class="brand-name">{t('app.title')}</span>
  </div>

  <NavItem active={route === 'home'} onclick={() => onNavigate?.('home')}>
    {#snippet icon()}<span>◇</span>{/snippet}
    {t('nav.competitions')}
  </NavItem>

  <NavItem active={route === 'readout'} onclick={() => onNavigate?.('readout')}>
    {#snippet icon()}<span>●</span>{/snippet}
    {t('nav.readout')}
    {#snippet badge()}
      {#if readoutBadge != null}{readoutBadge}{/if}
    {/snippet}
  </NavItem>

  <NavItem active={route === 'results'} onclick={() => onNavigate?.('results')}>
    {#snippet icon()}<span>≣</span>{/snippet}
    {t('nav.results')}
  </NavItem>

  <NavItem active={route === 'export'} onclick={() => onNavigate?.('export')}>
    {#snippet icon()}<span>↗</span>{/snippet}
    {t('nav.export')}
    {#snippet badge()}IOF 3.0{/snippet}
  </NavItem>

  <NavItem active={route === 'hyrbrickor'} onclick={() => onNavigate?.('hyrbrickor')}>
    {#snippet icon()}<span>⚷</span>{/snippet}
    {t('nav.hyrbrickor')}
  </NavItem>

  <NavItem onclick={() => onOpenSettings?.()}>
    {#snippet icon()}<span>⚙</span>{/snippet}
    {t('nav.settings')}
  </NavItem>

  <div class="sidebar-footer">
    <StationCard status={stationStatus} serial={stationSerial} />
    <div class="version">v0.1.0-phase1 · localhost</div>
  </div>
</aside>

<style>
  .sidebar {
    background: var(--bg-elev);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    padding: var(--space-md) var(--space-sm);
    gap: var(--space-2xs);
  }
  .brand {
    padding: var(--space-xs) var(--space-sm) var(--space-lg);
    display: flex;
    align-items: center;
    gap: var(--space-xs);
  }
  .brand-name {
    font-size: var(--fs-heading);
    font-weight: 600;
    letter-spacing: -0.01em;
  }
  .sidebar-footer {
    margin-top: auto;
    padding: var(--space-xs) var(--space-sm);
    font-size: var(--fs-caption);
    color: var(--fg-faint);
    border-top: 1px solid var(--border);
  }
  .version {
    font-size: 11px;
    color: var(--fg-faint);
    font-family: var(--font-mono);
    padding-top: var(--space-xs);
  }
</style>

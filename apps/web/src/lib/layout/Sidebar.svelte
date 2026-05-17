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
  import Icon from '../ui/Icon.svelte';
  import { t } from '../i18n/index.ts';

  type StationStatus = 'online' | 'offline' | 'connecting';

  interface Props {
    route?: string;
    onNavigate?: (route: string) => void;
    onOpenSettings?: () => void;
    stationStatus?: StationStatus;
    stationSerial?: string;
    readoutBadge?: number | null;
    /** Competition-scoped items (Avläsning, Anmälda, Resultat, Export,
     * Hyrbrickor) are disabled when this is null. Without it, clicking
     * one silently routes to '/' which is a mystery dead-click — the
     * UX audit caught this on the new "Anmälda" item but the pattern
     * existed before. Now centrally gated. */
    activeCompId?: string | null;
  }

  let {
    route = 'home',
    onNavigate,
    onOpenSettings,
    stationStatus = 'offline',
    stationSerial = '—',
    readoutBadge = null,
    activeCompId = null,
  }: Props = $props();

  const compScopedDisabled = $derived(activeCompId === null);
</script>

<aside class="sidebar">
  <div class="brand">
    <BrandMark size={30} />
    <span class="brand-name">{t('app.title')}</span>
  </div>

  <NavItem active={route === 'home'} onclick={() => onNavigate?.('home')}>
    {#snippet icon()}<Icon name="home" />{/snippet}
    {t('nav.competitions')}
  </NavItem>

  <NavItem
    active={route === 'readout'}
    disabled={compScopedDisabled}
    onclick={() => onNavigate?.('readout')}
  >
    {#snippet icon()}<Icon name="radio" />{/snippet}
    {t('nav.readout')}
    {#snippet badge()}
      {#if readoutBadge != null}{readoutBadge}{/if}
    {/snippet}
  </NavItem>

  <NavItem
    active={route === 'runners'}
    disabled={compScopedDisabled}
    onclick={() => onNavigate?.('runners')}
  >
    {#snippet icon()}<Icon name="users" />{/snippet}
    {t('nav.runners')}
  </NavItem>

  <NavItem
    active={route === 'registration'}
    disabled={compScopedDisabled}
    onclick={() => onNavigate?.('registration')}
  >
    {#snippet icon()}<Icon name="user-plus" />{/snippet}
    {t('nav.registration')}
  </NavItem>

  <NavItem
    active={route === 'results'}
    disabled={compScopedDisabled}
    onclick={() => onNavigate?.('results')}
  >
    {#snippet icon()}<Icon name="list" />{/snippet}
    {t('nav.results')}
  </NavItem>

  <NavItem
    active={route === 'export'}
    disabled={compScopedDisabled}
    onclick={() => onNavigate?.('export')}
  >
    {#snippet icon()}<Icon name="arrow-up-right" />{/snippet}
    {t('nav.export')}
    {#snippet badge()}IOF 3.0{/snippet}
  </NavItem>

  <NavItem
    active={route === 'hyrbrickor'}
    disabled={compScopedDisabled}
    onclick={() => onNavigate?.('hyrbrickor')}
  >
    {#snippet icon()}<Icon name="key" />{/snippet}
    {t('nav.hyrbrickor')}
  </NavItem>

  <NavItem onclick={() => onOpenSettings?.()}>
    {#snippet icon()}<Icon name="settings" />{/snippet}
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

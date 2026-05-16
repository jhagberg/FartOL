<!--
  Authored for fartol. Not ported from upstream.

  Operator-facing Tweaks panel — 5 LOCKED controls (UI-SPEC §"Tweaks panel"):
    1. Locale     (sv / en)            — onChange via setLocale (i18n)
    2. Density    (low / med / high)
    3. Accent     (forest / blue / magenta / charcoal)
    4. Contrast   (normal / high)
    5. Font pair  (plex / geist / source / atkinson)

  Plus the dev-only Simulate-read button — visible only when
  `import.meta.env.DEV` or the page URL carries `?dev` / `?dev=1`. The
  panel is a Modal (UI-SPEC §"Tweaks panel" — operator opens it from the
  sidebar Inställningar item).

  Every mutation calls persistTweaks() so a reload restores the choice;
  applyTweaksToRoot() is invoked synchronously so the dom flips immediately
  without waiting on the parent layout's $effect re-run.

  Locked by:
  - .planning/phases/01-single-laptop-training-mvp/01-UI-SPEC.md §"Tweaks panel"
  - .planning/phases/01-single-laptop-training-mvp/01-11-PLAN.md task 2
-->
<script lang="ts">
  import Modal from '../ui/Modal.svelte';
  import Button from '../ui/Button.svelte';
  import Field from '../ui/Field.svelte';
  import Select from '../ui/Select.svelte';
  import {
    tweaks,
    persistTweaks,
    applyTweaksToRoot,
    type TweaksDensity,
    type TweaksAccent,
    type TweaksFontPair,
  } from '../stores/tweaks.svelte.ts';
  import { setLocale, t } from '../i18n/index.ts';
  import { devSimulateRead } from '../api/client.ts';
  import {
    getEventorStatus as getEventorStatusStore,
    refreshEventorStatus,
    triggerEventorRefresh,
  } from '../stores/eventorStatus.svelte.ts';

  interface Props {
    open: boolean;
    onClose?: () => void;
    /** Optional active competition id for the Simulate-read fixture. Falls
     * back to the walking-skeleton id when omitted so the dev button is
     * usable even before a competition exists. */
    competitionId?: string;
  }

  let { open, onClose, competitionId }: Props = $props();

  // Phase 2.0 Plan 02-02 — Eventor cache status row. Refresh once on
  // first mount, and again when the panel is reopened so the operator
  // always sees fresh data (the cache state can change between opens).
  const eventorState = $derived(getEventorStatusStore());
  let _refreshed = $state(false);
  $effect(() => {
    if (open && !_refreshed) {
      _refreshed = true;
      void refreshEventorStatus();
    }
  });

  /** Compose the Swedish status string for the current state. The
   * 'ready' branch interpolates ageDays via i18next. */
  function eventorLabel(): string {
    const s = eventorState;
    if (s.state === 'ready' && s.ageDays !== null) {
      return t('tweaks.eventor.ready', { days: s.ageDays });
    }
    if (s.state === 'stale' && s.ageDays !== null) {
      return t('tweaks.eventor.stale');
    }
    if (s.state === 'offline') return t('tweaks.eventor.offline');
    if (s.state === 'no_key') return t('tweaks.eventor.no_key');
    if (s.state === 'refreshing') return t('tweaks.eventor.refreshing');
    return t('tweaks.eventor.unknown');
  }

  function eventorDotClass(): string {
    const s = eventorState.state;
    if (s === 'ready') return 'dot dot-ok';
    if (s === 'stale' || s === 'refreshing') return 'dot dot-warn';
    if (s === 'offline' || s === 'no_key') return 'dot dot-err';
    return 'dot dot-muted';
  }

  async function onClickRefreshEventor(): Promise<void> {
    await triggerEventorRefresh();
  }

  // Dev-only gate. `import.meta.env.DEV` is statically dead-stripped in
  // production builds; the `?dev` query-string fallback gives Jonas an
  // escape hatch for poking at a deployed build without recompiling.
  const devGate = $derived.by(() => {
    if (import.meta.env.DEV) return true;
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return params.has('dev');
  });

  function flush(): void {
    if (typeof document !== 'undefined') applyTweaksToRoot(document.documentElement);
    persistTweaks();
  }

  function onLocaleChange(e: Event): void {
    const v = (e.currentTarget as HTMLInputElement).value;
    if (v === 'sv' || v === 'en') {
      setLocale(v);
      flush();
    }
  }

  function onDensityChange(d: TweaksDensity): void {
    tweaks.density = d;
    flush();
  }

  function onAccentChange(a: TweaksAccent): void {
    tweaks.accent = a;
    flush();
  }

  function onContrastChange(e: Event): void {
    tweaks.contrast_high = (e.currentTarget as HTMLInputElement).checked;
    flush();
  }

  function onFontChange(e: Event): void {
    const v = (e.currentTarget as HTMLSelectElement).value as TweaksFontPair;
    tweaks.font_pair = v;
    flush();
  }

  async function onSimulate(): Promise<void> {
    const cid = competitionId ?? 'walking-skeleton';
    try {
      await devSimulateRead({
        competition_id: cid,
        card_number: 7501853,
        card_type: 'SI10',
        punches: [
          { control_code: 31, time_ms: 1234500 },
          { control_code: 32, time_ms: 1234800 },
        ],
      });
    } catch {
      // Dev-only convenience — swallow; the operator sees the toast surface
      // from plan 13's status row when wired.
    }
  }

  const DENSITIES: TweaksDensity[] = ['low', 'med', 'high'];
  const ACCENTS: TweaksAccent[] = ['forest', 'blue', 'magenta', 'charcoal'];
  const FONT_PAIRS: TweaksFontPair[] = ['plex', 'geist', 'source', 'atkinson'];
</script>

<Modal {open} {onClose}>
  {#snippet head()}
    <strong>{t('tw.title')}</strong>
  {/snippet}
  {#snippet body()}
    <div class="grid">
      <!-- Locale -->
      <Field label={t('tw.locale')}>
        <div class="row">
          <label class="radio">
            <input
              type="radio"
              name="locale"
              value="sv"
              checked={tweaks.locale === 'sv'}
              onchange={onLocaleChange}
            />
            <span>Svenska</span>
          </label>
          <label class="radio">
            <input
              type="radio"
              name="locale"
              value="en"
              checked={tweaks.locale === 'en'}
              onchange={onLocaleChange}
            />
            <span>English</span>
          </label>
        </div>
      </Field>

      <!-- Density -->
      <Field label={t('tw.density')}>
        <div class="row" role="radiogroup">
          {#each DENSITIES as d (d)}
            <button
              type="button"
              class="seg"
              class:active={tweaks.density === d}
              onclick={() => onDensityChange(d)}
              aria-pressed={tweaks.density === d}
            >
              {t(`tw.density.${d}`)}
            </button>
          {/each}
        </div>
      </Field>

      <!-- Accent -->
      <Field label={t('tw.accent')}>
        <div class="swatches" role="radiogroup">
          {#each ACCENTS as a (a)}
            <button
              type="button"
              class="swatch sw-{a}"
              class:active={tweaks.accent === a}
              onclick={() => onAccentChange(a)}
              aria-label={t(`tw.accent.${a}`)}
              aria-pressed={tweaks.accent === a}
              title={t(`tw.accent.${a}`)}
            ></button>
          {/each}
        </div>
      </Field>

      <!-- Contrast -->
      <Field label={t('tw.contrast')}>
        <label class="toggle">
          <input
            type="checkbox"
            checked={tweaks.contrast_high}
            onchange={onContrastChange}
          />
          <span>{tweaks.contrast_high ? 'On' : 'Off'}</span>
        </label>
      </Field>

      <!-- Font pair -->
      <Field label={t('tw.font')}>
        <Select value={tweaks.font_pair} onchange={onFontChange}>
          {#each FONT_PAIRS as fp (fp)}
            <option value={fp}>{fp}</option>
          {/each}
        </Select>
      </Field>

      <!-- Phase 2.0 — Eventor cache status. Always rendered (D-EV-3). -->
      <Field label={t('tweaks.eventor.title')}>
        <div class="eventor-row" data-testid="eventor-status-row">
          <span class={eventorDotClass()} aria-hidden="true"></span>
          <span class="eventor-label" data-testid="eventor-status-label">
            {eventorLabel()}
          </span>
          {#if eventorState.fartol_dev}
            <Button
              variant="ghost"
              onclick={() => void onClickRefreshEventor()}
              data-testid="eventor-refresh-btn"
            >
              {t('tweaks.eventor.refreshButton')}
            </Button>
          {/if}
        </div>
      </Field>

      <!-- Dev-only Simulate read -->
      {#if devGate}
        <Field label={t('tw.sim')}>
          <Button
            variant="ghost"
            onclick={onSimulate}
            data-testid="simulate-read-btn"
          >
            {t('tw.sim.fire')}
          </Button>
        </Field>
      {/if}
    </div>
  {/snippet}
  {#snippet foot()}
    <Button variant="ghost" onclick={() => onClose?.()}>Stäng</Button>
  {/snippet}
</Modal>

<style>
  .grid {
    display: grid;
    gap: var(--space-md);
  }
  .row {
    display: flex;
    gap: var(--space-xs);
    flex-wrap: wrap;
  }
  .radio {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: var(--fs-label);
    min-height: var(--hit);
    padding: 0 var(--space-sm);
    cursor: pointer;
  }
  .radio input {
    accent-color: var(--accent);
  }
  .seg {
    flex: 1;
    min-height: var(--hit);
    padding: 0 var(--space-sm);
    border-radius: var(--radius);
    border: 1px solid var(--border-strong);
    background: var(--bg-elev);
    color: var(--fg);
    font-size: var(--fs-label);
    font-weight: 500;
  }
  .seg.active {
    background: var(--accent-soft);
    border-color: var(--accent);
    color: var(--accent-strong);
  }
  .swatches {
    display: flex;
    gap: var(--space-sm);
    flex-wrap: wrap;
  }
  .swatch {
    width: var(--hit);
    height: var(--hit);
    border-radius: var(--radius);
    border: 2px solid var(--border-strong);
    cursor: pointer;
  }
  .swatch.active {
    outline: 2px solid var(--fg);
    outline-offset: 2px;
  }
  .sw-forest {
    background: oklch(0.5 0.08 145);
  }
  .sw-blue {
    background: oklch(0.5 0.1 245);
  }
  .sw-magenta {
    background: oklch(0.5 0.13 330);
  }
  .sw-charcoal {
    background: oklch(0.3 0.01 240);
  }
  .toggle {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    min-height: var(--hit);
    font-size: var(--fs-label);
    cursor: pointer;
  }
  .toggle input {
    width: 18px;
    height: 18px;
    accent-color: var(--accent);
  }
  .eventor-row {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    flex-wrap: wrap;
  }
  .eventor-label {
    font-size: var(--fs-label);
    color: var(--fg);
    flex: 1;
    min-width: 0;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .dot-ok {
    background: oklch(0.6 0.13 145);
  }
  .dot-warn {
    background: oklch(0.7 0.15 80);
  }
  .dot-err {
    background: oklch(0.55 0.18 25);
  }
  .dot-muted {
    background: var(--border-strong);
  }
</style>

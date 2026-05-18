<!--
  Authored for fartol. Not ported from upstream.

  Sidebar race-phase control. Reads the active competition's
  race_started_at_ms (Phase 2.1 column added 2026-05-18) and renders one
  of two states:

    - Pre-race (race_started_at_ms === null):
        ▢ "Före tävling" gray pill
        ▢ "Starta tävling" primary CTA (with 2-step confirm; the flip is
          a one-shot per competition so we don't let it happen on a
          stray mis-tap)

    - Race in progress (race_started_at_ms set):
        ▢ "Tävling pågår sedan HH:MM" green pill (no CTA)

  Under the hood: `card_read` events landing BEFORE this timestamp stay
  PEND (the reducer treats them as identity-only scans — e.g. a SIAC
  still carrying punches from a different race scanned at the
  registration desk). Reads AT or AFTER score normally.

  Hidden entirely when no competition is active (no point dangling
  the CTA before the operator has chosen scope).
-->
<script lang="ts">
  import { activeCompetition } from '../stores/activeCompetition.svelte.ts';
  import { startRace } from '../api/client.ts';
  import { t } from '../i18n/index.ts';

  const active = $derived(activeCompetition.value);
  const isRaceStarted = $derived(
    active !== null && active.race_started_at_ms !== null
  );

  let confirming = $state(false);
  let busy = $state(false);
  let err: string | null = $state(null);

  function formatHHMM(ms: number): string {
    const d = new Date(ms);
    return `${d.getHours().toString().padStart(2, '0')}:${d
      .getMinutes()
      .toString()
      .padStart(2, '0')}`;
  }

  async function onConfirmStart(): Promise<void> {
    if (active === null) return;
    busy = true;
    err = null;
    try {
      await startRace(active.id);
      // Refresh the cached list so the pill flips immediately for every
      // consumer of activeCompetition (Sidebar pill, readout phase
      // indicator, results header).
      await activeCompetition.refreshList();
      confirming = false;
    } catch (e) {
      err = (e as Error).message;
    } finally {
      busy = false;
    }
  }
</script>

{#if active !== null}
  <div class="phase-wrap">
    {#if isRaceStarted && active.race_started_at_ms !== null}
      <div class="phase-pill running" data-testid="race-phase-pill">
        <span class="dot" aria-hidden="true"></span>
        <span class="text">
          {t('race.phase.running', { time: formatHHMM(active.race_started_at_ms) })}
        </span>
      </div>
    {:else if !confirming}
      <div class="phase-pill prerace" data-testid="race-phase-pill">
        <span class="dot" aria-hidden="true"></span>
        <span class="text">{t('race.phase.preRace')}</span>
      </div>
      <button
        type="button"
        class="start-btn"
        onclick={() => (confirming = true)}
        data-testid="start-race-btn"
      >
        {t('race.start.cta')}
      </button>
    {:else}
      <div class="confirm-card" role="dialog" aria-labelledby="race-confirm-title">
        <p id="race-confirm-title" class="confirm-title">
          {t('race.confirm.title')}
        </p>
        <p class="confirm-body">{t('race.confirm.body')}</p>
        <div class="confirm-actions">
          <button
            type="button"
            class="confirm-cancel"
            onclick={() => {
              confirming = false;
              err = null;
            }}
            disabled={busy}
            data-testid="start-race-cancel"
          >
            {t('race.confirm.cancel')}
          </button>
          <button
            type="button"
            class="confirm-go"
            onclick={() => void onConfirmStart()}
            disabled={busy}
            data-testid="start-race-confirm"
          >
            {busy ? t('race.confirm.starting') : t('race.confirm.go')}
          </button>
        </div>
        {#if err}
          <p class="confirm-err" role="alert">{err}</p>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .phase-wrap {
    padding: 0 var(--space-sm) var(--space-sm);
    display: grid;
    gap: var(--space-2xs);
  }
  .phase-pill {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.02em;
    line-height: 1;
  }
  .phase-pill .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: currentColor;
  }
  .phase-pill.prerace {
    background: var(--pend-soft);
    color: var(--fg-muted);
  }
  .phase-pill.running {
    background: var(--ok-soft);
    color: var(--ok);
  }
  .start-btn {
    width: 100%;
    min-height: 40px;
    padding: 0 var(--space-md);
    border: 1px solid var(--accent);
    border-radius: var(--radius);
    background: var(--accent);
    color: var(--accent-fg);
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }
  .start-btn:hover {
    background: var(--accent-strong);
  }
  .confirm-card {
    padding: var(--space-sm);
    border: 1px solid var(--accent);
    border-radius: var(--radius);
    background: var(--accent-soft);
    color: var(--fg);
    display: grid;
    gap: 6px;
  }
  .confirm-title {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--fg);
  }
  .confirm-body {
    margin: 0;
    font-size: 11px;
    color: var(--fg-muted);
    line-height: 1.4;
  }
  .confirm-actions {
    display: flex;
    gap: 6px;
  }
  .confirm-cancel,
  .confirm-go {
    flex: 1;
    min-height: 32px;
    padding: 0 8px;
    border-radius: var(--radius);
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }
  .confirm-cancel {
    background: transparent;
    border: 1px solid var(--border-strong);
    color: var(--fg);
  }
  .confirm-cancel:hover:not(:disabled) {
    background: var(--bg-sunken);
  }
  .confirm-go {
    background: var(--accent);
    border: 1px solid var(--accent);
    color: var(--accent-fg);
  }
  .confirm-go:hover:not(:disabled) {
    background: var(--accent-strong);
  }
  .confirm-cancel:disabled,
  .confirm-go:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
  .confirm-err {
    margin: 0;
    color: var(--dnf);
    font-size: 11px;
    word-break: break-word;
  }
</style>

<!--
  Authored for fartol. Not ported from upstream.

  WalkupModal — overlay-on-readout walk-up registration (C-M3 LOCKED).
  Mounted by ReadoutView when ?walkup=<cardNumber> is present in the
  URL. There is NO standalone /walkup route file.

  Form per UI-SPEC §"Walk-up modal":
   - Namn (required, min 2, autofocus)
   - Klubb (optional, ClubAutocomplete)
   - Klass (required, select from props.classes)
   - Bricka (pre-filled from props.cardNumber, editable, int ≥ 1)
   - Consent (checkbox, default checked — REQ-PRIV-001)

  On Spara: POST /api/competitors with consent: true AND
  consent_status='explicit' (matches plan 02 schema default). On 201 →
  goto(/competition/<id>/readout) which strips the ?walkup param so
  the overlay unmounts naturally. On 409 'card_taken' → banner with a
  "Korrigera bricka" affordance that re-submits with
  replace_card_for_competitor_id (plan 10 route).

  Avbryt / Esc → same goto, no POST. The Esc binding is owned by
  ReadoutView (plan 13) so we don't duplicate it here.

  Locked by:
  - 01-14-PLAN.md task 1
  - 01-UI-SPEC.md §"Walk-up modal" (LOCKED form contract)
  - 01-REVIEWS.md §C-M3 (overlay-on-readout, no /walkup route)
  - REQ-PRIV-001 (explicit consent literal)
-->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { createCompetitor } from '$lib/api/client.ts';
  import { t } from '$lib/i18n/index.ts';
  import Button from '$lib/ui/Button.svelte';
  import Field from '$lib/ui/Field.svelte';
  import Input from '$lib/ui/Input.svelte';
  import Select from '$lib/ui/Select.svelte';
  import ClubAutocomplete from '$lib/components/ClubAutocomplete.svelte';
  import { ApiError } from '$lib/api/client.ts';
  import type { ClassDTO } from '@fartol/shared-types';

  interface Props {
    cardNumber: number;
    competitionId: string;
    classes: ClassDTO[];
    /** Optional SI card firmware-side name hint. When non-null, pre-fills
     * the name field so the operator only confirms instead of re-typing.
     * Empty string is treated the same as null. */
    cardHolderHint?: string | null;
  }

  let { cardNumber, competitionId, classes, cardHolderHint = null }: Props = $props();

  // --- form state -----------------------------------------------------------
  // Pre-fill name from the SI card's card_holder field when the firmware
  // carried one (rental fleet cards usually didn't; personal cards often
  // did). Operator can still edit before submit.
  let name = $state(cardHolderHint && cardHolderHint.length > 0 ? cardHolderHint : '');
  let club = $state('');
  let classId = $state('');
  // The initial cardNumber prop is the URL's ?walkup=<n> coercion; we copy
  // it once into local state so the operator can edit (UI-SPEC §"Walk-up
  // modal" — Bricka editable to correct misread). Wrapped in a function-
  // form initializer so svelte-check doesn't flag the prop reference as
  // captured-at-init (warning state_referenced_locally).
  const initialCard: number | '' = cardNumber > 0 ? cardNumber : '';
  let cardNumberLocal = $state<number | ''>(initialCard);
  let consent = $state(true);

  // --- ui state -------------------------------------------------------------
  let saving = $state(false);
  /** Inline error for field validation. */
  let fieldError = $state<string | null>(null);
  /** Banner on 409 — captures the existing competitor so the operator can
   * trigger a replace-card flow on the SAME row. */
  let cardTakenExistingId = $state<string | null>(null);

  function close(): void {
    void goto(`/competition/${competitionId}/readout`);
  }

  function validate(): string | null {
    if (name.trim().length < 2) return t('walk.err.name');
    if (!classId) return t('walk.err.classRequired');
    if (typeof cardNumberLocal !== 'number' || cardNumberLocal < 1) {
      return t('walk.err.cardRequired');
    }
    if (!consent) return t('walk.err.consent');
    return null;
  }

  async function onSave(): Promise<void> {
    fieldError = null;
    cardTakenExistingId = null;
    const err = validate();
    if (err !== null) {
      fieldError = err;
      return;
    }

    saving = true;
    try {
      await createCompetitor({
        competition_id: competitionId,
        name: name.trim(),
        club: club.trim() === '' ? null : club.trim(),
        class_id: classId,
        card_number: cardNumberLocal as number,
        consent: true,
        consent_status: 'explicit',
      });
      // Success — back to readout, query param cleared.
      close();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const body = e.body as { error?: string; existing_competitor_id?: string } | undefined;
        if (body && body.error === 'card_taken' && typeof body.existing_competitor_id === 'string') {
          cardTakenExistingId = body.existing_competitor_id;
        } else {
          fieldError = t('err.network');
        }
      } else {
        fieldError = (e as Error).message ?? t('err.network');
      }
    } finally {
      saving = false;
    }
  }

  /** 409 replace-card path: re-issue the POST with
   * replace_card_for_competitor_id set. This corrects a misread where the
   * previous walk-up was for the SAME runner under a wrong card number. */
  async function onCorrectCard(): Promise<void> {
    if (cardTakenExistingId === null) return;
    fieldError = null;
    saving = true;
    try {
      await createCompetitor({
        competition_id: competitionId,
        club: null,
        card_number: cardNumberLocal as number,
        replace_card_for_competitor_id: cardTakenExistingId,
      });
      close();
    } catch (e) {
      fieldError = (e as Error).message ?? t('err.network');
    } finally {
      saving = false;
    }
  }
</script>

<div class="walkup-scrim" role="presentation" data-testid="walkup-overlay" onclick={close}>
  <div
    class="walkup-modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="walkup-title"
    data-testid="walkup-modal"
    onclick={(e) => e.stopPropagation()}
  >
    <header class="head">
      <h2 id="walkup-title">{t('walk.title')}</h2>
      <p class="desc">{t('walk.desc')}</p>
    </header>

    <form
      class="body"
      novalidate
      onsubmit={(e) => {
        e.preventDefault();
        void onSave();
      }}
    >
      <Field label={t('walk.name')} htmlFor="walkup-name">
        <Input
          id="walkup-name"
          data-testid="walkup-name"
          bind:value={name}
          placeholder={t('walk.name.ph')}
          minlength={2}
          required
          autofocus
        />
      </Field>

      <Field label={t('walk.club')} htmlFor="walkup-club">
        <ClubAutocomplete
          id="walkup-club"
          value={club}
          placeholder={t('walk.club.ph')}
          onValue={(v) => (club = v)}
        />
      </Field>

      <Field label={t('walk.class')} htmlFor="walkup-class">
        <Select id="walkup-class" data-testid="walkup-class" bind:value={classId} required>
          <option value="" disabled>{t('walk.classPlaceholder')}</option>
          {#each classes as cls (cls.id)}
            <option value={cls.id}>{cls.name}</option>
          {/each}
        </Select>
      </Field>

      <Field label={t('walk.card')} htmlFor="walkup-card">
        <Input
          id="walkup-card"
          data-testid="walkup-card"
          type="number"
          min={1}
          step={1}
          bind:value={cardNumberLocal}
          required
        />
      </Field>

      <label class="consent-row">
        <input
          type="checkbox"
          data-testid="walkup-consent"
          bind:checked={consent}
        />
        <span>{t('walk.consent')}</span>
      </label>

      {#if fieldError}
        <p class="err" data-testid="walkup-error">{fieldError}</p>
      {/if}

      {#if cardTakenExistingId}
        <p class="banner" data-testid="walkup-card-taken">
          {t('walk.err.cardTaken', { card: String(cardNumberLocal) })}
        </p>
      {/if}

      <footer class="foot">
        <Button
          variant="ghost"
          type="button"
          onclick={close}
          disabled={saving}
          data-testid="walkup-cancel"
        >
          {t('walk.cancel')}
        </Button>
        {#if cardTakenExistingId}
          <Button
            variant="danger"
            type="button"
            onclick={() => void onCorrectCard()}
            disabled={saving}
            data-testid="walkup-correct-card"
          >
            {t('walk.err.replaceCard')}
          </Button>
        {:else}
          <Button
            variant="primary"
            type="submit"
            disabled={saving}
            data-testid="walkup-save"
          >
            {t('walk.save')}
          </Button>
        {/if}
      </footer>
    </form>
  </div>
</div>

<style>
  .walkup-scrim {
    position: fixed;
    inset: 0;
    background: rgba(20, 20, 30, 0.32);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-lg);
    z-index: 50;
    backdrop-filter: blur(2px);
  }
  .walkup-modal {
    background: var(--bg-elev);
    border-radius: 14px;
    box-shadow: var(--shadow-lg);
    width: min(560px, 100%);
    max-height: calc(100vh - 48px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .head {
    padding: 18px 22px 8px;
    border-bottom: 1px solid var(--border);
  }
  .head h2 {
    margin: 0 0 4px;
    font-size: var(--fs-heading);
    font-weight: 600;
  }
  .desc {
    margin: 0;
    color: var(--fg-muted);
    font-size: 13px;
  }
  .body {
    padding: 18px 22px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    overflow: auto;
  }
  .consent-row {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    font-size: 13px;
    color: var(--fg-muted);
    line-height: 1.4;
    cursor: pointer;
  }
  .consent-row input[type='checkbox'] {
    margin-top: 3px;
    flex-shrink: 0;
  }
  .err {
    margin: 0;
    color: var(--dnf);
    font-size: 13px;
  }
  .banner {
    margin: 0;
    background: var(--dnf-soft);
    color: var(--dnf);
    padding: 10px 12px;
    border-radius: var(--radius);
    font-size: 13px;
  }
  .foot {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding-top: 6px;
  }
</style>

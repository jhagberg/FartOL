<!--
  Authored for fartol. Not ported from upstream.

  RegistrationView — the registration-desk operator surface
  (/competition/:id/registration). Mounts the same Plan-02 WalkupModal
  overlay on a clean registration-themed shell so one operator can run
  the kids-line registration without the results-display surface
  ReadoutView mixes in.

  Design (plan 02-02b):
   - cardSubscription with onUnknown=cardQueue.push routes every
     card_read to the FIFO queue (no projection lookup — every read is
     a registration candidate). When the modal is already open for an
     earlier card, the new card lands in the queue + the "N i kö"
     badge updates.
   - On WalkupModal close (Save success OR Avbryt), pop the next
     queued card and re-mount the modal for it. Empty queue → modal
     stays closed; empty state visible.
   - Dedupe-on-card_number: same SI bricka beeped twice (currently
     open OR already queued) surfaces a toast and is otherwise
     dropped. No crash, no double-enqueue.
   - Late finish punches during registration are queued like any
     unknown card — the operator sees "okänd bricka" in the modal
     and decides late-registrant vs. already-registered-finishing.

  Locked by:
  - 02-02b-PLAN.md task 3
  - .planning/phases/02-4-klubbs-mvp/02-CONTEXT.md lines 45-71
    (Registration-desk section + D-LIM-1)
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { t } from '$lib/i18n/index.ts';
  import { cardQueue, type QueuedCard } from '$lib/stores/cardQueue.svelte.ts';
  import { createCardSubscription } from '$lib/services/cardSubscription.ts';
  import WalkupModal from '$lib/screens/WalkupModal.svelte';
  import type { ClassDTO } from '@fartol/shared-types';

  interface Props {
    competitionId: string;
    classes: ClassDTO[];
  }

  let { competitionId, classes }: Props = $props();

  // --- state ----------------------------------------------------------------
  /** Card currently mounted in the WalkupModal. Distinct from
   * cardQueue.current because we lift it OUT of the queue when the
   * modal opens; the queue holds only PENDING cards (the "N i kö" badge
   * is keyed off cardQueue.count, not currentCard). */
  let currentCard: QueuedCard | null = $state(null);
  let toastMessage: string | null = $state(null);
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let subscription: ReturnType<typeof createCardSubscription> | null = null;

  // --- lifecycle ------------------------------------------------------------

  onMount(() => {
    // Carry-over from a prior mount — if the user navigated back and the
    // queue still has entries, open the modal immediately. Rare in
    // practice (we drain on unmount below) but harmless to handle.
    if (currentCard === null && cardQueue.count > 0) {
      currentCard = cardQueue.pop();
    }
    subscription = createCardSubscription({
      competitionId,
      // No classifyCard — every card_read on this screen enqueues
      // (registration desk: nobody is pre-registered, so every read
      // is a registration candidate). classification='unclassified'.
      onCardRead: (cardNumber, hint, _classification) => {
        handleIncomingCard(cardNumber, hint);
      },
    });
    subscription.connect();
  });

  onDestroy(() => {
    // Drain the queue on unmount so stale entries don't carry across
    // navigation to /readout (which has different semantics — it
    // doesn't enqueue at all). Defensive against tab close without
    // explicit pop().
    cardQueue.clear();
    if (subscription) subscription.disconnect();
    if (toastTimer) clearTimeout(toastTimer);
  });

  // --- card-arrival handling ------------------------------------------------

  function handleIncomingCard(cardNumber: number, hint: string | null): void {
    // Dedupe against the currently-open modal AND the queue. Same card
    // beeped twice while one of those holds it → toast + drop.
    if (currentCard !== null && currentCard.cardNumber === cardNumber) {
      toast(t('registration.dedupeToast', { card: cardNumber }));
      return;
    }
    if (!cardQueue.push(cardNumber, hint)) {
      // push() returns false when the queue already contains this card.
      toast(t('registration.dedupeToast', { card: cardNumber }));
      return;
    }
    // If no modal is currently open, open it immediately for the just-
    // pushed card. Otherwise leave it in the queue — the modal-close
    // handler below will advance to it.
    if (currentCard === null) {
      currentCard = cardQueue.pop();
    }
  }

  function onWalkupClose(): void {
    // Auto-advance: pop the next queued card (null if empty → modal
    // unmounts via {#if currentCard !== null}).
    currentCard = cardQueue.pop();
  }

  function toast(msg: string): void {
    toastMessage = msg;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastMessage = null;
    }, 3000);
  }
</script>

<div class="registration" data-testid="registration-view">
  <header class="reg-head">
    <h1>{t('registration.title')}</h1>
    <p class="welcome">{t('registration.welcome')}</p>
    {#if cardQueue.count > 0}
      <span class="badge" data-testid="reg-queue-badge">
        {t('registration.queuedBadge', { count: cardQueue.count })}
      </span>
    {/if}
  </header>

  {#if currentCard === null}
    <p class="empty" data-testid="reg-empty">{t('registration.empty')}</p>
  {/if}

  {#if currentCard !== null}
    <WalkupModal
      cardNumber={currentCard.cardNumber}
      {competitionId}
      {classes}
      cardHolderHint={currentCard.cardHolderHint}
      onClose={onWalkupClose}
    />
  {/if}

  {#if toastMessage !== null}
    <div class="toast" role="status" data-testid="reg-toast">{toastMessage}</div>
  {/if}
</div>

<style>
  .registration {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
    padding: var(--space-lg);
    min-height: 100%;
    position: relative;
  }
  .reg-head {
    display: flex;
    flex-direction: column;
    gap: 4px;
    align-items: flex-start;
  }
  .reg-head h1 {
    margin: 0;
    font-size: var(--fs-heading);
    font-weight: 600;
  }
  .reg-head .welcome {
    margin: 0;
    color: var(--fg-muted);
    font-size: 14px;
  }
  .reg-head .badge {
    align-self: flex-start;
    margin-top: 6px;
    background: var(--accent);
    color: #fff;
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 12px;
    font-family: var(--font-mono);
    font-feature-settings:
      'tnum' 1,
      'zero' 1;
  }
  .empty {
    margin: 0;
    padding: var(--space-xl) var(--space-lg);
    text-align: center;
    color: var(--fg-muted);
    background: var(--bg-elev);
    border: 1px dashed var(--border);
    border-radius: var(--radius-lg);
    font-size: 15px;
  }
  .toast {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--fg);
    color: var(--bg-elev);
    padding: 10px 18px;
    border-radius: var(--radius);
    font-size: 13px;
    box-shadow: var(--shadow-lg);
    z-index: 100;
  }
</style>

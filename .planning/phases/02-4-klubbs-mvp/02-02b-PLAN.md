---
phase: 02-4-klubbs-mvp
plan: 02b
type: execute
wave: 2
depends_on: [02-02]
files_modified:
  - apps/web/src/lib/stores/cardQueue.svelte.ts
  - apps/web/src/lib/stores/cardQueue.svelte.test.ts
  - apps/web/src/lib/services/cardSubscription.ts
  - apps/web/src/lib/screens/ReadoutView.svelte
  - apps/web/src/lib/screens/RegistrationView.svelte
  - apps/web/src/lib/i18n/sv.json
  - apps/web/src/lib/i18n/en.json
  - apps/web/src/routes/competition/[id]/registration/+page.svelte
  - apps/web/src/routes/competition/[id]/registration/+page.ts
  - tests/e2e/registration-queue.spec.ts
autonomous: true
tags: [registration-desk, walkup, queue, auto-advance, sveltekit, ergonomics, ui]
requirements:
  - REQ-UI-005
  - REQ-UI-006
  - REQ-UI-007
must_haves:
  truths:
    - "Opening /competition/:id/registration mounts WalkupModal in registration mode (label 'Registreringsdisk', 'N i kö' badge visible)"
    - 'Two card_inserted events arriving 100ms apart while modal is open result in queue size 1 + modal still open for card #1 (NOT silently dropped per ReadoutView.svelte:406-414 today)'
    - 'Pressing Spara on card #1 modal auto-opens modal for card #2 (FIFO pop)'
    - "Same card_number enqueued twice triggers toast 'Brickan finns redan i kön' and queue size stays 1"
    - 'ReadoutView behavior unchanged: unknown beeps still appear in recent-reads history (no enqueue); the shared cardSubscription service routes onUnknown to history on /readout and to cardQueue on /registration'
    - "Empty queue + modal closed → registration screen shows 'Inga brickor i kö' empty state; next card_inserted opens modal directly with badge=0"
  artifacts:
    - path: 'apps/web/src/lib/stores/cardQueue.svelte.ts'
      provides: 'Svelte 5 rune-based FIFO queue store with push(cardNumber, hint?), pop(), peek(), count derived; push() deduplicates by card_number returning false when already queued'
      min_lines: 60
    - path: 'apps/web/src/lib/services/cardSubscription.ts'
      provides: 'Shared WS card-event subscription factory: takes a competitionId + onUnknown callback + onKnown callback; returns {connect, disconnect}; consolidates the card_read dispatch that ReadoutView used to inline'
      min_lines: 80
    - path: 'apps/web/src/lib/screens/RegistrationView.svelte'
      provides: "Registration-desk screen: cardSubscription with onUnknown=cardQueue.push; renders WalkupModal whenever current card is set; shows 'N i kö' badge; auto-advances on modal close"
      min_lines: 80
    - path: 'apps/web/src/routes/competition/[id]/registration/+page.svelte'
      provides: 'Route shell that mounts RegistrationView with competitionId from $page.params'
      min_lines: 15
    - path: 'apps/web/src/routes/competition/[id]/registration/+page.ts'
      provides: 'Data loader (mirrors readout/+page.ts pattern; fetches competition + classes for WalkupModal)'
      min_lines: 15
    - path: 'tests/e2e/registration-queue.spec.ts'
      provides: 'Playwright e2e: 2-card queue + auto-advance flow + dedupe toast'
      min_lines: 100
  key_links:
    - from: 'apps/web/src/routes/competition/[id]/registration/+page.svelte'
      to: 'apps/web/src/lib/screens/RegistrationView.svelte'
      via: 'thin shell — passes competitionId prop only (mirrors readout/+page.svelte from Phase 1)'
      pattern: 'RegistrationView'
    - from: 'apps/web/src/lib/screens/RegistrationView.svelte'
      to: 'apps/web/src/lib/stores/cardQueue.svelte.ts'
      via: 'import + push(cardNumber, hint) on onUnknown callback; pop() on modal close'
      pattern: "cardQueue\\.(push|pop|peek|count)"
    - from: 'apps/web/src/lib/services/cardSubscription.ts'
      to: 'apps/web/src/lib/ws/client.ts WsClient'
      via: 'constructs WsClient + preSubscribe(readoutChannel(competitionId)) — same pattern as ReadoutView.connectWs lines 310-320'
      pattern: 'WsClient|preSubscribe'
    - from: 'apps/web/src/lib/screens/ReadoutView.svelte'
      to: 'apps/web/src/lib/services/cardSubscription.ts'
      via: "refactor: ReadoutView consumes cardSubscription with onUnknown=push-to-history (the existing silent-drop behavior at lines 406-414 stays but moves behind the service's onUnknown hook); WS dispatch and reconnect logic move into the service"
      pattern: 'cardSubscription|createCardSubscription'
---

<objective>
Wave 2 plan, parallel-safe with Plans 04 + 05. Delivers the **registration-desk
operator surface** for the 4-klubbs pre-race kids line. This is the
ergonomics-extension Jonas added late in 02-CONTEXT.md (commit 06a1d89):

1. **New route** `/competition/:id/registration` — mounts the same Plan-02
   WalkupModal overlay on a clean registration-themed shell (NOT on
   ReadoutView, which mixes results-display with registration). Avoids
   role-confusion when one operator runs registration and another watches
   results on the same bridge.
2. **Card-beep queue + auto-advance**. Today (Phase 1) a second `card_read`
   event arriving while WalkupModal is already open is silently dropped at
   ReadoutView.svelte:406-414 (the `walkupCard === null` guard). For the
   kids line, this plan introduces a `cardQueue` Svelte 5 rune store that
   buffers subsequent unknown card_reads in FIFO order. The registration
   shell shows a "N i kö" badge; on modal Save (success or cancel), the
   shell pops the next queued card and re-mounts WalkupModal for it. Empty
   queue → modal stays closed.
3. **Dedupe-on-card-number**. If the same SI bricka beeps twice while
   already in the queue (kid swipes twice nervously), the second push is
   dropped with a toast `Brickan finns redan i kön` (Phase 1 toast helper).
4. **Refactor ReadoutView WS subscription** out into a shared
   `cardSubscription` service so /registration and /readout consume the
   same WS plumbing without duplicating the connect/dispatch code. The
   service exposes `onUnknown(cardNumber, hint)` and `onKnown(cardNumber)`
   callbacks; /readout sets onUnknown = push-to-history (existing behavior),
   /registration sets onUnknown = cardQueue.push.
5. **Late-finish-punch handling**: if a finish punch arrives WHILE the
   registration screen is active (rare — there are no finishes before the
   race starts), the queue swallows it gracefully. The card is "unknown"
   from the registration shell's view (it doesn't match a registered
   competitor for the registration-desk pre-race window); the operator sees
   an "okänd bricka" entry in the modal and decides late-registrant vs.
   already-registered-finishing.
6. **No new REST routes; no schema changes.** This is a pure web-app
   ergonomics layer over the data flow Plan-02 already established.

Purpose:

- Honor the 4-klubbs throughput target: 3-5s per known kid (Eventor-prefill
  - pick Bana + Spara), 8-12s for unknown bricks. Without auto-advance, a
    line of 30 kids pools.
- Honor REQ-UI-005..007 (walk-up UI surface) — this plan is a UX extension
  of that, no new REQ-ID needed.
- Match Phase 1 PATTERNS S-8 (Swedish-first i18n) + WS subscription pattern
  from ReadoutView.svelte lines 310-320.

Output:

- 1 new store (cardQueue) + 1 new service (cardSubscription) + 1 new screen
  (RegistrationView) + 1 new route shell (registration/+page.svelte + .ts).
- ReadoutView refactor: WS connect/dispatch moves into cardSubscription;
  recent-reads history behavior preserved verbatim via the onUnknown hook.
- i18n keys for sv.json + en.json from day one.
- Playwright e2e covering the queue + auto-advance flow.
  </objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/phases/02-4-klubbs-mvp/02-CONTEXT.md
@.planning/phases/02-4-klubbs-mvp/02-RESEARCH.md
@.planning/phases/02-4-klubbs-mvp/02-PATTERNS.md
@.planning/phases/02-4-klubbs-mvp/02-02-PLAN.md
@apps/web/src/lib/screens/WalkupModal.svelte
@apps/web/src/lib/screens/ReadoutView.svelte
@apps/web/src/lib/ws/client.ts
@apps/web/src/lib/stores/bridgeStatus.svelte.ts
@apps/web/src/routes/competition/[id]/readout/+page.svelte
@apps/web/src/lib/i18n/sv.json
@apps/web/src/lib/i18n/en.json
@tests/e2e/walkup.spec.ts

<interfaces>
<!-- Key contracts the executor needs. Extracted verbatim from the codebase. -->
<!-- Executor should use these directly — no codebase exploration needed for these specifically. -->

From `apps/web/src/lib/ws/client.ts` (Phase 1 WS wrapper — locked by 01-03):

```typescript
export class WsClient {
  constructor(url: string, onMessage: (env: WsEnvelope) => void);
  preSubscribe(channel: ChannelName): void;
  connect(): void;
  close(): void;
}
```

Construct with `ws://${window.location.host}/ws` (or `wss://` under HTTPS).

From `@fartola/shared-types`:

- `readoutChannel(competitionId: string): ChannelName` — the channel
  card_read envelopes flow on. Use the same one for /registration.
- `WsEnvelope = { type: string; payload: unknown; seq?: number }` — card
  read envelopes arrive with `type: 'card_read'` and
  `payload: { card_number: number; card_type: string }`.
- Replay envelopes wrap: `{ type: 'replay', payload: { event_type: 'card_read', card_number, ... } }`.

From Plan 02-02 (WalkupModal extended):

- WalkupModal props: `{ cardNumber: number; competitionId: string; classes: ClassDTO[]; cardHolderHint?: string | null; eventorHint?: EventorLookupHit | null }`.
- On Save success or 409-replace, WalkupModal calls `goto(`/competition/<id>/readout`)` which closes the modal by stripping the ?walkup param. **For /registration, the close behavior MUST go through a parent callback prop instead so we can auto-advance**.

From `apps/web/src/lib/screens/ReadoutView.svelte` lines 406-414 — THE EXISTING SILENT-DROP SITE:

```typescript
// Unknown card → walk-up redirect after 600ms (UI-SPEC). Skip if a
// walk-up overlay is already open for some other card (subsequent-
// cards behavior: operator picks up from history when ready).
const isUnknown = top?.card_number === cardNumber && top.unmatched;
if (isUnknown && walkupCard === null) {
  if (walkupTimer) clearTimeout(walkupTimer);
  walkupTimer = setTimeout(() => {
    void goto(`/competition/${competitionId}/readout?walkup=${cardNumber}`);
  }, 600);
}
```

The `walkupCard === null` guard is the silent drop. Plan 2b replaces this
on the /registration page with `cardQueue.push(cardNumber, hint)`.

From `apps/web/src/lib/stores/bridgeStatus.svelte.ts` — the Svelte 5 rune
store template to mirror for cardQueue:

```typescript
let _state = $state<BridgeWsState>('closed');
export const bridgeStatus = {
  get value(): BridgeWsState {
    return _state;
  },
  set(next: BridgeWsState): void {
    _state = next;
  },
};
```

From `apps/web/src/routes/competition/[id]/readout/+page.svelte` — the
thin-shell route pattern to clone for /registration:

```svelte
<script lang="ts">
  import { page } from '$app/state';
  import ReadoutView from '$lib/screens/ReadoutView.svelte';
  const competitionId = $derived(page.params['id'] ?? '');
</script>
{#if competitionId}
  <ReadoutView {competitionId} />
{:else}
  <p class="muted">…</p>
{/if}
```

NEW interfaces this plan defines (downstream-consumable):

```typescript
// cardQueue.svelte.ts
export interface QueuedCard {
  cardNumber: number;
  cardHolderHint: string | null;
  enqueuedAtMs: number;
}
export const cardQueue: {
  readonly count: number;
  readonly current: QueuedCard | null; // peek without popping
  push(cardNumber: number, hint: string | null): boolean; // false if dedupe-dropped
  pop(): QueuedCard | null;
  clear(): void;
  contains(cardNumber: number): boolean;
};

// cardSubscription.ts
export interface CardSubscriptionOpts {
  competitionId: string;
  onUnknown: (cardNumber: number, cardHolderHint: string | null) => void;
  onKnown?: (cardNumber: number) => void;
  /** Optional bridge connection-state callback (reuses bridgeStatus.set). */
  onConnectionChange?: (state: 'closed' | 'opening' | 'open' | 'error') => void;
}
export function createCardSubscription(opts: CardSubscriptionOpts): {
  connect(): void;
  disconnect(): void;
};
```

i18n keys to add (Swedish first, English second):

- registration.title: "Registreringsdisk" / "Registration desk"
- registration.empty: "Inga brickor i kö — vänta på nästa beep" / "No cards queued — waiting for the next beep"
- registration.queuedBadge: "{{count}} i kö" / "{{count}} in queue"
- registration.dedupeToast: "Brickan finns redan i kön (#{{card}})" / "Card already queued (#{{card}})"
- registration.welcome: "Skanna SI-brickan eller skriv numret nedan" / "Scan the SI card or type the number below"
  </interfaces>
  </context>

<tasks>

<task type="auto">
  <name>Task 0: Read existing WalkupModal + ReadoutView silent-drop site + route pattern + confirm assumptions</name>
  <files>
    .planning/phases/02-4-klubbs-mvp/02-02b-PLAN.md
  </files>
  <read_first>
    apps/web/src/lib/screens/ReadoutView.svelte lines 380-450 (the onCardRead → triggerCardReadSideEffects silent-drop site CONTEXT.md cites at 406-414; this is the analog for the queue logic),
    apps/web/src/lib/screens/ReadoutView.svelte lines 280-340 (the connectWs / handleWs WS subscription pattern that cardSubscription.ts must extract verbatim),
    apps/web/src/lib/screens/WalkupModal.svelte (full file — Plan 02-02 extends this with eventorHint / hyrbricka / Bana label; Plan 2b ONLY re-mounts it in a new shell; do NOT relitigate its internals),
    apps/web/src/routes/competition/[id]/readout/+page.svelte (the thin-shell pattern to clone for /registration),
    apps/web/src/lib/stores/bridgeStatus.svelte.ts (the Svelte 5 rune store idiom),
    .planning/phases/02-4-klubbs-mvp/02-CONTEXT.md lines 45-71 (the Registration-desk section — the 5 acceptance points),
    .planning/phases/02-4-klubbs-mvp/02-02-PLAN.md frontmatter (Plan 2 is the dependency — WalkupModal must already accept eventorHint per Plan 2 by the time Plan 2b ships)
  </read_first>
  <action>
    Confirm three load-bearing assumptions:

    1. WalkupModal in Plan 02-02 still closes by calling `goto(`/competition/<id>/readout`)` at the end of its `close()` function (line 79-81 of the Phase 1 file). For /registration we CANNOT use that goto — we need a parent-driven close. Verify Plan 02-02 does NOT change this. If it did, adapt. If it didn't (expected), Plan 2b adds a new optional callback prop `onClose?: () => void` to WalkupModal in Task 4 — fallback to the existing goto when undefined (backward-compatible with /readout).

    2. ReadoutView.svelte's WS dispatch handles `card_read` envelopes via `onCardRead()` which calls `refetchReadout() + refetchCompetitors()` and THEN evaluates `top.unmatched` from the refetched history. The silent-drop at 406-414 keys off `walkupCard === null` (a URL-derived flag). Confirm that on /registration the equivalent "unknown card" detection must work WITHOUT relying on the readout API's history (which is correct for /readout but irrelevant on /registration — we want EVERY card_read to enqueue, not just ones the projection has classified as unmatched). For /registration, the rule is simpler: any `card_read` arriving while the modal is open → enqueue. cardSubscription's `onUnknown` for /registration thus fires for every card_read.

       Corollary: on /readout, the existing semantics stay: only `top.unmatched` cards trigger walkup redirect. The cardSubscription service exposes a richer hook — `onCardRead(cardNumber, isUnmatched)` — and /readout passes the isUnmatched-aware callback while /registration passes the unconditional enqueue callback. Adjust the CardSubscriptionOpts interface from the planning frontmatter accordingly: rename `onUnknown` to a unified `onCardRead(cardNumber, hint, classification)` where classification is `'known' | 'unknown' | 'unclassified'`. /registration uses classification=unclassified (always enqueue); /readout dispatches on 'unknown'.

       Document this interface refinement in a one-line code comment at the top of cardSubscription.ts (Task 2).

    3. Same-card dedupe must check BOTH the current open-modal card AND the queue. If card #88888 is currently showing in the open modal AND beeps again, that's also a dedupe-with-toast case — not a separate enqueue. The `cardQueue.contains(n)` API in Task 1 covers the queue; the registration view adds a sibling check `currentCardNumber === n` before calling push. Note this in the Task 4 wiring.

    No files written in this task. The action is "read, verify, take notes for downstream tasks." If any assumption fails, halt and surface to the orchestrator with the specific deviation before proceeding to Task 1.

  </action>
  <acceptance_criteria>
    Executor has confirmed (a) WalkupModal close path, (b) cardSubscription hook shape (onCardRead with classification), (c) dedupe scope including current-modal card. No code written; assumptions logged in execution notes or commit message of Task 1.
  </acceptance_criteria>
</task>

<task type="auto" tdd="true">
  <name>Task 1: cardQueue Svelte 5 rune store + unit tests (push/pop/dedupe/count)</name>
  <files>
    apps/web/src/lib/stores/cardQueue.svelte.ts,
    apps/web/src/lib/stores/cardQueue.svelte.test.ts
  </files>
  <read_first>
    apps/web/src/lib/stores/bridgeStatus.svelte.ts (rune store template — copy structure),
    apps/web/src/lib/stores/tweaks.svelte.ts (more complex rune store with multiple fields — reference for the QueuedCard array state),
    apps/web/src/lib/stores/tweaks.svelte.test.ts (vitest pattern for rune stores)
  </read_first>
  <behavior>
    - Test 1: fresh cardQueue → count === 0, current === null, pop() returns null.
    - Test 2: push(8535005, 'Jonas Hagberg') → returns true, count === 1, current === { cardNumber: 8535005, cardHolderHint: 'Jonas Hagberg', enqueuedAtMs: <number> }, contains(8535005) === true.
    - Test 3: push(8535005, null) again → returns false (dedupe), count still 1.
    - Test 4: push(99999, null) → returns true, count === 2; current is still the FIRST one (peek semantics).
    - Test 5: pop() → returns the first queued card; count === 1; current is now the second card.
    - Test 6: pop() twice more → returns the second card then null; count === 0.
    - Test 7: clear() with 3 items queued → count === 0, current === null.
    - Test 8: push(null-hint) and push(empty-string-hint) → both stored verbatim (caller controls hint; store doesn't normalize).
  </behavior>
  <action>
    Write `apps/web/src/lib/stores/cardQueue.svelte.ts` mirroring the bridgeStatus rune-store idiom:

      ```
      let _queue = $state<QueuedCard[]>([]);

      export const cardQueue = {
        get count(): number { return _queue.length; },
        get current(): QueuedCard | null { return _queue[0] ?? null; },
        push(cardNumber: number, hint: string | null): boolean {
          if (_queue.some((q) => q.cardNumber === cardNumber)) return false;
          _queue.push({ cardNumber, cardHolderHint: hint, enqueuedAtMs: Date.now() });
          return true;
        },
        pop(): QueuedCard | null {
          return _queue.shift() ?? null;
        },
        clear(): void {
          _queue.length = 0;
        },
        contains(cardNumber: number): boolean {
          return _queue.some((q) => q.cardNumber === cardNumber);
        },
      };
      ```

      Export the `QueuedCard` interface for consumers. JSDoc the module: "FIFO queue of pending card_read events for the registration desk. Dedupe-on-card_number returns false from push() rather than throwing — callers (RegistrationView) decide whether to toast. See .planning/phases/02-4-klubbs-mvp/02-CONTEXT.md lines 51-64 for the design rationale."

    Write `apps/web/src/lib/stores/cardQueue.svelte.test.ts` covering the 8 behaviors. Use vitest + the same pattern as `tweaks.svelte.test.ts`. Each test must call cardQueue.clear() in afterEach so state doesn't leak between tests (rune stores are module-scoped singletons in test runs).

    Keep this file pure (no fetch, no WS, no DOM). It MUST be importable from both browser and Node test environments without side effects.

  </action>
  <acceptance_criteria>
    cardQueue.svelte.ts compiles under `tsc --noEmit`; all 8 vitest cases pass (`pnpm --filter @fartola/web test --run --reporter=verbose cardQueue` exit 0). The QueuedCard interface is exported and imported by Task 2 + Task 4 without circular import warnings.
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: Extract cardSubscription shared service from ReadoutView WS code</name>
  <files>
    apps/web/src/lib/services/cardSubscription.ts,
    apps/web/src/lib/screens/ReadoutView.svelte
  </files>
  <read_first>
    apps/web/src/lib/screens/ReadoutView.svelte lines 280-450 (the connectWs + handleWs + handleLiveEvent + onCardRead + triggerCardReadSideEffects functions — extract WS wiring, leave history/UI logic in the screen),
    apps/web/src/lib/ws/client.ts (the WsClient interface — locked; do not modify),
    @fartola/shared-types (readoutChannel + WsEnvelope types — locked),
    apps/web/src/lib/stores/bridgeStatus.svelte.ts (bridgeStatus.set() — the connection_changed callback shape)
  </read_first>
  <action>
    Create `apps/web/src/lib/services/cardSubscription.ts` exporting `createCardSubscription(opts)`. The service encapsulates the WS connect, channel pre-subscribe, replay-envelope unwrap, and card_read dispatch — everything ReadoutView currently inlines in lines 310-380.

      Interface (refined from Task 0):
      ```
      export interface CardSubscriptionOpts {
        competitionId: string;
        /** Fires on every card_read envelope (live + replay-unwrapped). classification === 'unknown'
         *  when the caller's `isUnmatched` resolver says so; 'known' otherwise; 'unclassified' when
         *  the caller does not supply a resolver (registration desk uses this — every read enqueues). */
        onCardRead: (cardNumber: number, cardHolderHint: string | null, classification: 'known' | 'unknown' | 'unclassified') => void;
        /** Optional async resolver — given a cardNumber, returns whether this card is unmatched in the
         *  current projection. /readout supplies this so the existing silent-drop-when-modal-open
         *  semantics keep working. If omitted, classification is always 'unclassified'. */
        classifyCard?: (cardNumber: number) => Promise<{ isUnmatched: boolean; cardHolderHint: string | null }>;
        /** Connection-state callback. /readout wires to bridgeStatus.set; /registration may use it
         *  for a small status pill or ignore entirely. */
        onConnectionChange?: (state: 'closed' | 'opening' | 'open' | 'error') => void;
        /** Optional: extra envelope handler for non-card_read types (manual_dnf, card_bound, etc).
         *  /readout supplies one that refetches its REST projections; /registration usually ignores. */
        onOtherEnvelope?: (envelope: WsEnvelope) => void;
      }

      export function createCardSubscription(opts: CardSubscriptionOpts): { connect(): void; disconnect(): void };
      ```

      Implementation skeleton:
      - Construct WsClient with the same wsUrl derivation ReadoutView uses (lines 312-315).
      - preSubscribe(readoutChannel(competitionId)) before connect().
      - In the message handler, unwrap replay envelopes (same logic as ReadoutView lines 343-355).
      - On card_read: if `classifyCard` is provided, await it → call onCardRead with the resolved classification + hint. Else call onCardRead(cardNumber, null, 'unclassified').
      - On connection_changed: forward state to onConnectionChange if provided.
      - On all other envelope types: forward to onOtherEnvelope if provided.
      - disconnect() closes the underlying WsClient. Idempotent.

    Refactor `apps/web/src/lib/screens/ReadoutView.svelte`:
      - Remove the inline `connectWs()`, the inline `handleWs()` dispatch, and the inline replay-unwrap. Replace with a `createCardSubscription({ competitionId, onCardRead: triggerCardReadSideEffects, classifyCard: <wraps the existing history-top check>, onConnectionChange: bridgeStatus.set, onOtherEnvelope: <wraps the existing manual_dnf/card_bound/results_update refetch logic> })`.
      - Keep `onCardRead` semantics: only enter the walkup-redirect / consent-toast branches when classification === 'unknown'. The classifyCard callback resolves classification by calling `await refetchReadout()` (which sets `history`) then reading `history[0].unmatched`. The existing C-M4 consent toast logic stays in `triggerCardReadSideEffects` — it already checks `!top.unmatched` so it just keys off the post-refetch state.
      - Net result: ReadoutView behavior unchanged (verified by existing readout.spec.ts + walkup.spec.ts). The change is structural — WS plumbing moves out, screen logic stays.

    Add a one-line top-of-file comment to cardSubscription.ts: "Shared WS card-event subscription. Locked by 02-02b-PLAN.md task 2. Replaces inline WS code in ReadoutView (Phase 1) so /registration (Plan 2b) and /readout consume the same plumbing."

  </action>
  <verify>
    <automated>pnpm --filter @fartola/web test --run --reporter=verbose 2>&1 | tail -40 && pnpm exec playwright test tests/e2e/readout.spec.ts tests/e2e/walkup.spec.ts --reporter=line 2>&1 | tail -40</automated>
  </verify>
  <acceptance_criteria>
    cardSubscription.ts compiles; ReadoutView.svelte compiles after the refactor; ALL existing readout + walkup e2e tests still pass (this is a pure refactor — zero observable behavior change for /readout). No new unit tests in this task — coverage comes from the e2e tests that already exercise the WS dispatch.
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 3: RegistrationView screen — mounts WalkupModal + cardQueue + auto-advance + dedupe-toast</name>
  <files>
    apps/web/src/lib/screens/RegistrationView.svelte,
    apps/web/src/lib/i18n/sv.json,
    apps/web/src/lib/i18n/en.json,
    apps/web/src/lib/screens/WalkupModal.svelte
  </files>
  <read_first>
    apps/web/src/lib/screens/ReadoutView.svelte (the screen layout idiom — keep RegistrationView FAR simpler; we only need WalkupModal + the badge + a small empty state),
    apps/web/src/lib/screens/WalkupModal.svelte (the modal we re-mount per queued card — note its `close()` calls goto; we add an optional onClose callback prop in this task to support parent-driven close),
    apps/web/src/lib/screens/ReadoutView.svelte lines 570-577 (the `toast()` helper pattern — copy into RegistrationView for the dedupe toast)
  </read_first>
  <action>
    Add to WalkupModal.svelte (additive, backward-compatible):
      - New optional prop: `onClose?: (() => void) | null = null` (default null preserves Phase 1 behavior).
      - In the `close()` function: if `onClose !== null`, call `onClose()` INSTEAD of `goto(`/competition/<id>/readout`)`. Otherwise keep the existing goto verbatim. This lets /registration intercept modal close to drive auto-advance without breaking /readout.
      - In the success path of `onSave()` and `onCorrectCard()`, the existing `close()` call already triggers the new branch — no further change needed.

    Write `apps/web/src/lib/screens/RegistrationView.svelte`:
      - Props: `{ competitionId: string; classes: ClassDTO[] }` (classes loaded by +page.ts data loader; same shape WalkupModal expects).
      - Local state:
        - `let currentCard = $state<QueuedCard | null>(null);` — the card currently mounted in WalkupModal. Distinct from cardQueue.current because we lift it OUT of the queue when the modal opens (the modal is "consuming" it; the queue holds only pending cards).
        - `let toastMessage = $state<string | null>(null);` + `let toastTimer: ReturnType<typeof setTimeout> | null = null;` (same shape as ReadoutView lines 116-117).
        - `let subscription: ReturnType<typeof createCardSubscription> | null = null;`.
      - onMount:
        - subscription = createCardSubscription({ competitionId, onCardRead: handleIncomingCard, classifyCard: undefined /* always 'unclassified' for /registration */ }); subscription.connect();
        - If cardQueue is non-empty on mount (carry-over from prior navigation), open the modal: `if (currentCard === null && cardQueue.count > 0) currentCard = cardQueue.pop();`.
      - onDestroy: subscription?.disconnect(); cardQueue.clear() — IMPORTANT: clearing on unmount prevents stale carry-over to /readout. (Document the rationale in a one-line comment.)
      - handleIncomingCard(cardNumber, hint, _classification):
        - If currentCard?.cardNumber === cardNumber → show dedupe toast (`t('registration.dedupeToast', { card: cardNumber })`); return.
        - If !cardQueue.push(cardNumber, hint) → dedupe in queue → show dedupe toast; return.
        - If currentCard === null → pop the just-pushed card and open the modal: `currentCard = cardQueue.pop();`. Else leave it queued (modal already open).
      - onWalkupClose (passed to WalkupModal as onClose prop):
        - currentCard = cardQueue.pop(); // null if queue is empty → modal unmounts via {#if currentCard}
      - toast(msg): mirrors ReadoutView's helper verbatim (3000ms auto-dismiss).

      Template:
      ```
      <header class="reg-head">
        <h1>{t('registration.title')}</h1>
        <p class="welcome">{t('registration.welcome')}</p>
        {#if cardQueue.count > 0}
          <span class="badge" data-testid="reg-queue-badge">{t('registration.queuedBadge', { count: cardQueue.count })}</span>
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
      ```

      Style: registration-themed shell — use the same `.toast` + `.badge` CSS variables Phase 1 uses (`var(--accent)`, `var(--space-lg)`, etc.). Keep CSS under 60 lines; this is a thin shell.

    Add i18n keys to sv.json + en.json:
      - registration.title: "Registreringsdisk" / "Registration desk"
      - registration.empty: "Inga brickor i kö — vänta på nästa beep" / "No cards queued — waiting for the next beep"
      - registration.queuedBadge: "{{count}} i kö" / "{{count}} in queue"
      - registration.dedupeToast: "Brickan finns redan i kön (#{{card}})" / "Card already queued (#{{card}})"
      - registration.welcome: "Skanna SI-brickan eller skriv numret nedan" / "Scan the SI card or type the number below"

    DO NOT introduce a Svelte unit test for RegistrationView in this task — coverage comes from the e2e in Task 5. The wiring is simple enough that the e2e proves correctness end-to-end; a unit test for "modal opens when state is set" would be Svelte-implementation-testing.

  </action>
  <verify>
    <automated>pnpm --filter @fartola/web exec tsc --noEmit 2>&1 | tail -20 && pnpm --filter @fartola/web exec svelte-check --no-tsconfig --output human 2>&1 | tail -30</automated>
  </verify>
  <acceptance_criteria>
    RegistrationView.svelte + the WalkupModal onClose prop compile cleanly under both tsc --noEmit and svelte-check. New i18n keys present in sv.json AND en.json (verify with `node -e "['sv','en'].forEach(l=> { const j=require('./apps/web/src/lib/i18n/'+l+'.json'); console.log(l, j.registration?.title, j.registration?.dedupeToast)})"`). Existing WalkupModal tests still pass (Plan 02-02's tests + Phase 1 walkup.spec.ts).
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 4: Route shell — /competition/[id]/registration/+page.svelte + +page.ts</name>
  <files>
    apps/web/src/routes/competition/[id]/registration/+page.svelte,
    apps/web/src/routes/competition/[id]/registration/+page.ts
  </files>
  <read_first>
    apps/web/src/routes/competition/[id]/readout/+page.svelte (the thin-shell pattern — copy + swap ReadoutView for RegistrationView),
    apps/web/src/routes/competition/[id]/readout/+page.ts (if exists — the data loader pattern; if absent, RegistrationView+page.ts fetches /api/competitions/<id> client-side instead),
    apps/web/src/lib/api/client.ts (the getCompetition helper — returns { competition, classes, courses })
  </read_first>
  <action>
    Write `apps/web/src/routes/competition/[id]/registration/+page.ts`:
      - Export a `load` function (SvelteKit data-loader pattern). Use the universal `load` (not server-only): `export const load: PageLoad = async ({ params, fetch }) => { ... }`.
      - Fetch `/api/competitions/${params.id}` via the provided fetch (SSR-safe). Return `{ competitionId: params.id, classes: <from response> }`.
      - If readout/+page.ts does not exist (Phase 1 fetched competition INSIDE ReadoutView), mirror that pattern instead: do nothing in load (return params only), and have +page.svelte instantiate RegistrationView which fetches its own data. The simpler path is preferred — if Phase 1 chose the simpler path, mirror it.

    Write `apps/web/src/routes/competition/[id]/registration/+page.svelte`:
      ```svelte
      <!--
        Authored for fartola. Not ported from upstream.

        /competition/:id/registration — the registration-desk operator surface.
        Thin shell mounting RegistrationView. Mirrors the readout/+page.svelte
        pattern verbatim.

        Locked by:
        - 02-02b-PLAN.md task 4
        - .planning/phases/02-4-klubbs-mvp/02-CONTEXT.md lines 45-71 (Registration-desk section)
      -->
      <script lang="ts">
        import { page } from '$app/state';
        import RegistrationView from '$lib/screens/RegistrationView.svelte';
        import type { ClassDTO } from '@fartola/shared-types';

        // If +page.ts returns data, consume via $props(); otherwise derive from URL only.
        interface Props { data?: { competitionId: string; classes: ClassDTO[] } | undefined; }
        let { data }: Props = $props();
        const competitionId = $derived(data?.competitionId ?? page.params['id'] ?? '');
        const classes = $derived(data?.classes ?? []);
      </script>

      {#if competitionId}
        <RegistrationView {competitionId} {classes} />
      {:else}
        <p class="muted">…</p>
      {/if}

      <style>
        .muted { color: var(--fg-muted); }
      </style>
      ```

    Both files MUST live under `apps/web/src/routes/competition/[id]/registration/`. SvelteKit picks the route up automatically; no additional route registration is needed.

    Confirm via local dev server that `http://localhost:5173/competition/<any-id>/registration` renders RegistrationView with the empty state. (Manual confirmation in Task 5 e2e.)

  </action>
  <verify>
    <automated>pnpm --filter @fartola/web exec svelte-check --no-tsconfig --output human 2>&1 | tail -20 && find apps/web/src/routes/competition/'[id]'/registration/ -type f</automated>
  </verify>
  <acceptance_criteria>
    Both files exist under the correct route directory; svelte-check passes; the route directory layout matches Phase 1's `readout/` sibling (+page.svelte + optional +page.ts).
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 5: Playwright e2e — registration-queue.spec.ts</name>
  <files>
    tests/e2e/registration-queue.spec.ts
  </files>
  <read_first>
    tests/e2e/walkup.spec.ts (the bench-fixture seeding helper + WalkupModal selector strategy — copy the setup() function pattern verbatim),
    tests/e2e/readout.spec.ts (the simulate-read trigger pattern via /api/__dev/simulate-read — Plan 1.5 of Phase 1 e2e),
    .planning/phases/02-4-klubbs-mvp/02-RESEARCH.md (any e2e patterns the researcher pinned — esp. around WebSocket card_inserted simulation timing)
  </read_first>
  <action>
    Write `tests/e2e/registration-queue.spec.ts` covering 5 deterministic scenarios:

      ```typescript
      // Authored for fartola. Not ported from upstream.
      //
      // Registration-desk queue + auto-advance e2e (plan 02-02b).
      //
      //   1. **first card opens modal**: navigate to /competition/:id/registration;
      //      simulate-read card #9999991; assert WalkupModal mounts; assert queue
      //      badge is HIDDEN (queue empty — the card is the "current" one, not queued).
      //
      //   2. **second card while modal open → queue + badge**: with modal still open
      //      from #1, simulate-read card #9999992; assert WalkupModal STILL shows
      //      card #9999991 (NOT auto-advanced — we only auto-advance on close);
      //      assert badge reads "1 i kö".
      //
      //   3. **Save closes modal AND auto-opens for queued card**: fill name + class
      //      in the modal; click Spara; wait for the modal to re-render with
      //      cardNumber=9999992; assert badge is now HIDDEN (queue empty again).
      //
      //   4. **dedupe toast for repeated card**: with modal open for #9999992,
      //      simulate-read #9999992 again; assert dedupe toast visible matching
      //      t('registration.dedupeToast'); assert queue badge STILL hidden.
      //
      //   5. **late finish punch is queued like any unknown card**: with modal
      //      open for #9999992, simulate-read #1234567 (different card, no projection
      //      lookup needed for /registration); assert badge reads "1 i kö";
      //      click Spara on #9999992; assert modal re-opens for #1234567.
      //
      // Test isolation: serial mode (mirrors walkup.spec.ts pattern — the bridge's
      // tmp SQLite DB is shared across all e2e files).
      //
      // Locked by:
      // - 02-02b-PLAN.md task 5

      import { test, expect } from '@playwright/test';

      test.describe.configure({ mode: 'serial' });

      const BASE = 'http://localhost:5173';

      test('registration-desk queue + auto-advance + dedupe', async ({ page, request }) => {
        // 1) Create a competition + import the 4-klubbs courseData fixture
        //    (mirror walkup.spec.ts setup() but skip the EntryList — the
        //    registration desk's whole point is that nobody is pre-registered).
        const created = await request.post(`${BASE}/api/competitions`, {
          data: { name: `Registration E2E ${Date.now()}`, date: '2026-05-19' },
        });
        expect(created.status()).toBe(201);
        const comp = (await created.json()) as { id: string };
        const competitionId = comp.id;

        // Import courseData so WalkupModal has classes to pick from.
        // (Path mirrors walkup.spec.ts — adjust if Plan-02-02 added a different fixture path.)
        // ... import logic ...

        // Set active competition so the bridge routes card_reads here.
        await request.post(`${BASE}/api/sessions/active-competition`, {
          data: { competition_id: competitionId },
        });

        // 2) Navigate to /registration. Assert empty state.
        await page.goto(`${BASE}/competition/${competitionId}/registration`);
        await expect(page.getByTestId('reg-empty')).toBeVisible();

        // 3) Simulate first card_read → modal opens, no queue badge.
        await request.post(`${BASE}/api/__dev/simulate-read`, {
          data: { card_number: 9999991, card_type: 'SI10', competition_id: competitionId },
        });
        await expect(page.getByTestId('walkup-modal')).toBeVisible();
        await expect(page.getByTestId('walkup-card')).toHaveValue('9999991');
        await expect(page.getByTestId('reg-queue-badge')).toBeHidden();

        // 4) Simulate second card_read → modal STILL shows #1, badge shows "1 i kö".
        await request.post(`${BASE}/api/__dev/simulate-read`, {
          data: { card_number: 9999992, card_type: 'SI10', competition_id: competitionId },
        });
        // Modal must remain on the FIRST card (we only advance on close).
        await expect(page.getByTestId('walkup-card')).toHaveValue('9999991');
        await expect(page.getByTestId('reg-queue-badge')).toBeVisible();
        await expect(page.getByTestId('reg-queue-badge')).toContainText('1');

        // 5) Save card #1 → modal auto-advances to card #2; badge empties.
        await page.getByTestId('walkup-name').fill('Test Runner');
        // Select first class option (4-klubbs has Vit/Grön/Gul/Orange/Violett).
        await page.getByTestId('walkup-class').selectOption({ index: 1 });
        await page.getByTestId('walkup-save').click();
        await expect(page.getByTestId('walkup-card')).toHaveValue('9999992', { timeout: 3000 });
        await expect(page.getByTestId('reg-queue-badge')).toBeHidden();

        // 6) Dedupe toast on repeated card.
        await request.post(`${BASE}/api/__dev/simulate-read`, {
          data: { card_number: 9999992, card_type: 'SI10', competition_id: competitionId },
        });
        await expect(page.getByTestId('reg-toast')).toBeVisible();
        await expect(page.getByTestId('reg-toast')).toContainText('9999992');
        await expect(page.getByTestId('reg-queue-badge')).toBeHidden();

        // 7) Late finish punch (different card) → queued; Save → advances to it.
        await request.post(`${BASE}/api/__dev/simulate-read`, {
          data: { card_number: 1234567, card_type: 'SI10', competition_id: competitionId },
        });
        await expect(page.getByTestId('reg-queue-badge')).toContainText('1');

        await page.getByTestId('walkup-name').fill('Second Runner');
        await page.getByTestId('walkup-class').selectOption({ index: 1 });
        await page.getByTestId('walkup-save').click();
        await expect(page.getByTestId('walkup-card')).toHaveValue('1234567', { timeout: 3000 });
        await expect(page.getByTestId('reg-queue-badge')).toBeHidden();
      });
      ```

    Notes for the executor:
    - The exact `simulate-read` endpoint path may differ — verify by grepping `tests/e2e/readout.spec.ts` for `simulate-read` and matching. The path used above (`/api/__dev/simulate-read`) is the Phase 1 convention per CONTEXT.md.
    - The toast helper in RegistrationView fires under `data-testid="reg-toast"` — Task 3 ensures this exists.
    - If the test flakes on the auto-advance assertion (Playwright sees the OLD WalkupModal momentarily before re-render), bump the `timeout: 3000` on the toHaveValue assertion. Do NOT use `page.waitForTimeout` — that's flake-prone; rely on Playwright auto-waiting on the locator.

  </action>
  <verify>
    <automated>pnpm exec playwright test tests/e2e/registration-queue.spec.ts --reporter=line 2>&1 | tail -50</automated>
  </verify>
  <acceptance_criteria>
    registration-queue.spec.ts passes all assertions deterministically (no flakes on 3 consecutive runs: `for i in 1 2 3; do pnpm exec playwright test tests/e2e/registration-queue.spec.ts --reporter=line || exit 1; done`). The 7-step scenario inside the single test covers all 5 must-haves truths from the frontmatter.
  </acceptance_criteria>
</task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary                             | Description                                                                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| browser → /api/\_\_dev/simulate-read | Dev-only endpoint; FARTOLA_DEV-gated in production builds. Used here only by the e2e test, NOT by RegistrationView itself.                 |
| browser ↔ WS readoutChannel          | Same trust as Phase 1 — LAN-bound; WsClient is the locked client wrapper. /registration consumes the same channel /readout already trusts. |
| browser → /api/competitions/:id      | Read-only data fetch for classes; same trust as Phase 1's readout fetch.                                                                   |

## STRIDE Threat Register

| Threat ID | Category        | Component                                                                                                                     | Disposition | Mitigation Plan                                                                                                                                                                                                                                                                                              |
| --------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T-02B-01  | DoS             | Operator opens /registration twice in two tabs; both tabs consume from the same cardQueue → race conditions                   | accept      | cardQueue is module-scoped per-tab (Svelte rune stores are not cross-tab); each tab has its own queue. Documented in playbook (Plan 06): "Use ONE registration tab per bridge." If two tabs are open, both modals open independently — confusing but not data-corrupting.                                    |
| T-02B-02  | Info Disclosure | RegistrationView leaks card numbers + holder hints to anyone with /registration URL on LAN                                    | accept      | Same trust posture as /readout. Phase 1's `--bind-host` + CORS allow-list + LAN-only deployment apply unchanged. No NEW data exposure beyond what /readout already shows.                                                                                                                                    |
| T-02B-03  | Tampering       | Malicious LAN client POSTs /api/\_\_dev/simulate-read to inject synthetic card_reads into someone else's registration session | mitigate    | The /api/\_\_dev/simulate-read endpoint is FARTOLA_DEV-gated (Phase 1 lock). Plan 2b does not introduce a new attack surface — uses the existing endpoint only in the e2e test, not in production code paths.                                                                                                |
| T-02B-04  | Repudiation     | Operator marks a card as "saved" but the cardQueue entry was lost due to browser-tab crash                                    | accept      | The card_read event is still in the events table on the bridge (Phase 1 append-only). On tab reload, the queue is empty but the operator can navigate to /readout and pick up unknown cards from the history list — Phase 1 recovery path.                                                                   |
| T-02B-05  | DoS             | Adversary floods card_inserted events to balloon cardQueue → browser memory exhaustion                                        | accept      | LAN-only trust posture; bridge rate-limits card_read events at the hardware level (SI reader cadence ~1 read/sec). Even at 60s of unattended floods, queue grows by ~60 entries — well under any practical memory limit. Add a soft cap of 200 entries as a future hardening if real flood scenarios emerge. |
| T-02B-SC  | Tampering       | No new npm dependencies installed in this plan                                                                                | mitigate    | Plan 2b adds ZERO npm installs (cardQueue, cardSubscription, RegistrationView are all in-tree). Phase 2's only net-new package install (saxes for Plan 01) is unaffected by this plan.                                                                                                                       |

</threat_model>

<verification>
- `pnpm --filter @fartola/web test --run` exits 0 (cardQueue unit tests pass; existing tests untouched).
- `pnpm --filter @fartola/web exec svelte-check --no-tsconfig` exits 0 (RegistrationView + WalkupModal onClose prop + route shell all type-check).
- `pnpm exec playwright test tests/e2e/readout.spec.ts tests/e2e/walkup.spec.ts` exits 0 (ReadoutView refactor in Task 2 preserves Phase 1 behavior).
- `pnpm exec playwright test tests/e2e/registration-queue.spec.ts` exits 0 (the new 7-step scenario passes).
- Manual smoke: boot bridge with FARTOLA_DEV=1; navigate to /competition/<id>/registration; in another browser tab call `curl -X POST http://localhost:3000/api/__dev/simulate-read -d '{"card_number":11111,"card_type":"SI10","competition_id":"<id>"}'`; modal opens. Repeat with card_number 22222; badge appears showing "1 i kö". Save modal #1 → modal auto-opens for #22222. Empty queue → modal closes, empty state visible.
</verification>

<success_criteria>

- Operator at the registration desk handles a line of kids without losing card beeps to the silent-drop site (ReadoutView.svelte:406-414).
- Queue badge gives accurate live count of pending cards.
- Auto-advance on Save means no manual "pick next from history" step — the line flows.
- Same-card double-beep produces a non-blocking toast, never a crash or silent drop.
- /readout behavior unchanged: Phase 1's silent-drop semantics on the readout view stay (operator picks up subsequent unknown cards from history when ready).
- Late finish punches during the registration window are surfaced as "unknown bricka" entries in the modal, NOT swallowed silently.
  </success_criteria>

<output>
Create `.planning/phases/02-4-klubbs-mvp/02-02b-SUMMARY.md` when done.
</output>

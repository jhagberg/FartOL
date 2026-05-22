| Severity | Count |
| -------- | ----- |
| BLOCKER  | 0     |
| HIGH     | 3     |
| MEDIUM   | 2     |
| LOW      | 0     |
| NOTE     | 0     |

### F-001: LAN browser clients cannot open the live WebSocket

**Severity:** HIGH
**File:** apps/edge/src/ws/index.ts:74
**Issue:** The WebSocket origin allow-list only accepts loopback origins (`localhost`, `127.0.0.1`, `[::1]`) on ports 5173/4173/3000. The Phase 2.0 runbook tells the MeOS parallel laptop to open the FartOL UI at `http://<fartol-ip>:3000/...` after starting with `--bind-host 0.0.0.0 --allow-lan`; that browser sends `Origin: http://<fartol-ip>:3000` and `verifyClient` rejects it. The page can load over LAN, but readout/registration live updates will not connect on the real second laptop.
**Recommendation:** When LAN serving is explicitly enabled, allow the same-origin `Host` used for the request, or add an operator-configured allowed-origin list. Cover this with a WebSocket test using a non-loopback origin such as `http://192.168.1.20:3000`.

### F-002: Registration desk replays old readout card reads as new queue entries

**Severity:** HIGH
**File:** apps/web/src/lib/services/cardSubscription.ts:86
**Issue:** `createCardSubscription` unwraps `type: 'replay'` envelopes and dispatches the inner `card_read` exactly like a live read. `RegistrationView` subscribes without `classifyCard`, so every replayed historical readout event is enqueued/opened as a fresh registration candidate when the operator opens or refreshes `/registration`. The existing queue tests mount the page before the card read, so they do not catch stale server replay.
**Recommendation:** Add a live-only option for registration subscriptions, or ignore replayed `card_read` events unless the caller explicitly opts in. Add a regression test that seeds/sends a card read before navigating to `/competition/:id/registration` and asserts the registration desk still shows the empty state after connect.

### F-003: Registration-desk scans do not get Eventor or firmware prefill

**Severity:** HIGH
**File:** apps/web/src/lib/screens/RegistrationView.svelte:94
**Issue:** The readout walkup path looks up `lookupEventorBySiCard(card)` and passes `eventorHint` into `WalkupModal`, which then pre-fills name and klubb. The registration-desk path creates the same modal from a scanned card but passes only `cardHolderHint`, and its subscription does not provide `classifyCard`. `WalkupModal` only runs its own SI-card lookup from `onCardEdit()`, so an initial scanned card opens blank unless the operator edits the bricka field. This misses the 4-klubbs MVP fast-path for known kids at the dedicated registration desk.
**Recommendation:** In `RegistrationView`, perform the same guarded `lookupEventorBySiCard(currentCard.cardNumber)` flow used by `ReadoutView` and pass `eventorHint` to `WalkupModal`. Also preserve firmware `card_holder` object hints when no classifier is provided, or call the classifier there. Add an e2e test with Eventor fixture data proving a scanned known card pre-fills the modal on `/registration`.

### F-004: Eventor parser can corrupt Swedish names at chunk boundaries

**Severity:** MEDIUM
**File:** apps/edge/src/eventor/parser.ts:199
**Issue:** The parser comment says raw buffers are used so split UTF-8 sequences are not corrupted, but the loop calls `chunk.toString('utf8')` for each buffer before writing to `saxes`. If a multibyte character (`Å`, `Ä`, `Ö`, etc.) is split across two stream chunks, Node replaces the broken bytes with U+FFFD before `saxes` sees them. That can silently corrupt Eventor competitor or club names used for autocomplete and registration prefill.
**Recommendation:** Decode with `StringDecoder('utf8')`, `TextDecoder` with streaming enabled, or a read stream configured with `encoding: 'utf8'` so Node preserves split code points across chunks. Add a unit test that feeds a sample XML stream in tiny chunks splitting a Swedish multibyte character.

### F-005: MOP auto-merge can duplicate a MeOS-only competitor after card changes

**Severity:** MEDIUM
**File:** apps/edge/src/integrations/meos/mop.ts:260
**Issue:** D-MOP-3 auto-merge inserts every `meos_competitors` row whose current `card_number` is absent from FartOL competitors. The imported FartOL row records only `source = 'meos'`, not the MeOS competitor id it came from. If MeOS first sends an unknown competitor with card A and later sends a MOPDiff changing that same MeOS competitor to card B, the next auto-merge sees card B as absent and inserts a second FartOL competitor for the same person.
**Recommendation:** Persist the MeOS competitor id on imported rows, or maintain a merge mapping table, and upsert/update the existing `source = 'meos'` FartOL row when a known MeOS id changes card. Add a MOPDiff regression test covering A-to-B card correction after an initial auto-merge.

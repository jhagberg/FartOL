---
status: partial
phase: 01-single-laptop-training-mvp
source: [01-VERIFICATION.md]
started: 2026-05-15T08:34:08Z
updated: 2026-05-15T08:34:08Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. SC#3 — Read real SI cards via BSM7/8-USB on Linux laptop

expected: Insert SI5 / SI9 / SI10 / SIAC card into BSM7/8-USB; bridge ingests punches; live results view shows competitor advancing through course; final result computed with correct status (OK / DNF / MP).
result: [pending]

### 2. SC#5 — Print all 6 receipt templates to real thermal printer

expected: All six receipt variants (default, kids, debug, full, minimal, qr) render correctly on the bench thermal printer (Star TSP143 or equivalent ESC/POS unit). Bitmap kids template is legible. Auto-print fires within the configured window after card read.
result: [pending]

### 3. SC#7 — StorTuna OK Tuesday training rehearsal (20–40 starters)

expected: Full 2h training session runs end-to-end on one laptop with no crashes, no data loss, no orphan competitors. Live results stay live. At least one operator (Jonas) reports "I'd use this again."
result: [pending]

### 4. REQ-UI-001 — PWA installability on Chrome Android tablet

expected: Visit the edge node from a Chrome Android tablet on the local WiFi; "Install app" prompt appears; installed PWA opens standalone; works offline against the laptop.
result: [pending]

### 5. REQ-UI-007 — Bright-sun readability on 13" laptop

expected: Take the laptop outdoors in direct sunlight (or use a high-brightness simulation); all live result views remain readable; color tokens (text-primary on bg-surface) hit WCAG AA contrast for outdoor viewing.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps

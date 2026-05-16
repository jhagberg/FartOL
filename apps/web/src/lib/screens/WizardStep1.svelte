<!--
  Authored for fartol. Not ported from upstream.

  Wizard step 1 — name + date.

  Date uses native `<input type="date">` so mobile / tablet operators
  get the OS date picker (PR #3 round-4 Gemini feedback — REQ-UI-001
  cares about Chrome Android tablet ergonomics). The native input
  serializes its value as `YYYY-MM-DD` already, so the wire shape the
  receipt-mirror + competitionsFromWizard server-side Zod
  `/^\d{4}-\d{2}-\d{2}$/` rule expects is preserved without
  normalization.

  Earlier the plan locked a text+pattern input to avoid Chrome's
  calendar-icon styling "flicker" — that trade-off is overruled here
  because the mobile-tablet picker UX is the larger win.

  Server-side Zod stays authoritative on the format.

  Locked by:
  - 01-UI-SPEC.md §"Click 1, Click 2, Click 3" + §"Date inputs"
  - 01-12-PLAN.md task 2
-->
<script lang="ts">
  import { t } from '$lib/i18n/index.ts';

  interface Props {
    name: string;
    date: string;
    onnamechange: (v: string) => void;
    ondatechange: (v: string) => void;
  }

  let { name, date, onnamechange, ondatechange }: Props = $props();
</script>

<div class="step-grid">
  <p class="muted">{t('wiz.step1.desc')}</p>
  <div class="field">
    <label for="wiz-name">{t('wiz.name')}</label>
    <input
      id="wiz-name"
      class="input"
      type="text"
      value={name}
      oninput={(e) => onnamechange((e.currentTarget as HTMLInputElement).value)}
      data-testid="wiz-name"
      autofocus
    />
  </div>
  <div class="field">
    <label for="wiz-date">{t('wiz.date')}</label>
    <input
      id="wiz-date"
      class="input"
      type="date"
      value={date}
      oninput={(e) => ondatechange((e.currentTarget as HTMLInputElement).value)}
      data-testid="wiz-date"
    />
  </div>
</div>

<style>
  .step-grid {
    display: grid;
    gap: 16px;
  }
  .muted {
    margin: 0;
    color: var(--fg-muted);
  }
  .field {
    display: grid;
    gap: 6px;
  }
  label {
    font-size: 13px;
    color: var(--fg-muted);
    font-weight: 500;
  }
  .input {
    height: var(--hit);
    min-height: var(--hit);
    padding: 0 var(--space-sm);
    background: var(--bg-elev);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    font-size: var(--fs-body);
    width: 100%;
    color: var(--fg);
  }
  .input:focus {
    outline: 2px solid var(--accent);
    outline-offset: -1px;
    border-color: var(--accent);
  }
</style>

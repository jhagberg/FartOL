<!--
  Authored for fartol. Not ported from upstream.

  Wizard step 1 — name + date.

  ISO date input is `<input type="text" pattern="\d{4}-\d{2}-\d{2}">`
  per UI-SPEC §"Date inputs" (Visual Anchor). The native `<input
  type="date">` is intentionally NOT used — its UA chrome flickers on
  mount and the receipt/receipt-mirror render path expects raw
  YYYY-MM-DD strings, so a single text input avoids the
  string-vs-Date normalization round-trip.

  Pattern is hint-only — server-side Zod (`/^\d{4}-\d{2}-\d{2}$/` on
  competitionsFromWizard.ts) is authoritative.

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
      class="input mono"
      type="text"
      inputmode="numeric"
      pattern="\d{4}-\d{2}-\d{2}"
      placeholder="YYYY-MM-DD"
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
  .mono {
    font-family: var(--font-mono);
  }
</style>

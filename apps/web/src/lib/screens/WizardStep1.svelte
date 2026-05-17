<!--
  Authored for fartol. Not ported from upstream.

  Wizard step 1 — name + date (+ optional quickstart-import).

  Two paths into this step:
   - Manual: operator types Name + Date.
   - Quickstart (NEW 2026-05-17): operator drops the IOF XML 3.0
     CourseData file here. We parse the first ~4 KB to extract
     <Event><Name> and the root @createTime, pre-fill the form, AND
     hand the parsed File up to the wizard so Step 2's DropZone shows
     the same file as already-loaded (no double-upload).

  Date uses native `<input type="date">` so mobile / tablet operators
  get the OS date picker. Forced `lang="sv"` so display is always
  YYYY-MM-DD regardless of the OS or Chrome UI language — Jonas's
  laptop has LC_TIME=sv_SE but LANGUAGE=en_GB:en which Chrome reads
  instead, so without `lang="sv"` the input renders DD/MM/YYYY.
  Server-side Zod stays authoritative on the format.

  Locked by:
  - 01-UI-SPEC.md §"Click 1, Click 2, Click 3" + §"Date inputs"
  - 01-12-PLAN.md task 2
  - .planning/state/2026-05-17 Jonas wizard usability feedback
-->
<script lang="ts">
  import { t } from '$lib/i18n/index.ts';

  interface PreviewMeta {
    filename: string;
    kind: 'CourseData' | 'EntryList';
  }

  interface Props {
    name: string;
    date: string;
    /** Set when a file was imported via the quickstart pane. Used to
     * render a "Banfil importerad" badge here AND to short-circuit
     * Step 2's drop zone (the wizard owns the File). */
    preimportedFile: File | null;
    onnamechange: (v: string) => void;
    ondatechange: (v: string) => void;
    /** Quickstart callback. Fires once per successful import. The
     * wizard sets pendingFile + preview + name + date in one shot, so
     * Step 2 sees the file as already-loaded and the form fields show
     * the parsed values (operator can still edit them). */
    onquickstart: (file: File, parsedName: string, parsedDate: string, preview: PreviewMeta) => void;
    onquickstartclear: () => void;
  }

  let {
    name,
    date,
    preimportedFile,
    onnamechange,
    ondatechange,
    onquickstart,
    onquickstartclear,
  }: Props = $props();

  let quickstartError = $state<string | null>(null);
  let fileInput: HTMLInputElement | undefined = $state();

  /** Same 4 KB head sample Step 2 uses — enough to land the root
   * element + the small <Event> block at the top of an IOF document. */
  const HEAD_BYTES = 4096;

  /** Strip BOM / XML decl / comments / CDATA so the root-element +
   * Event/Name regexes don't trip on prose. Lifted verbatim from
   * WizardStep2.inspectFile so the two paths agree on parse semantics. */
  function stripPreamble(s: string): string {
    return s
      .replace(/^﻿/, '')
      .replace(/<\?xml[^?]*\?>/i, '')
      .replace(new RegExp('<!--[\\s\\S]*?(?:-->|$)', 'g'), '')
      .replace(new RegExp('<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>|$)', 'g'), '');
  }

  /** Pull name + date hints out of an IOF 3.0 head. Both are best-
   * effort; the operator can override either field afterwards.
   *
   *   Source 1: <Event><Name>…</Name></Event>
   *     - May be present in both CourseData and EntryList.
   *     - Condes convention: "<YYYY-MM-DD> <event title>".
   *       We split on the date prefix to populate date + name.
   *     - If no date prefix, use whole Name as name + fall back to (2).
   *   Source 2: root @createTime="YYYY-MM-DDThh:mm:ss"
   *     - Always present in well-formed IOF 3.0; fallback for date. */
  function extractHints(head: string): { name: string; date: string; kind: 'CourseData' | 'EntryList' } | null {
    const cleaned = stripPreamble(head);
    const root = cleaned.match(/<\s*(CourseData|EntryList)\b([^>]*)>/);
    if (!root) return null;
    const kind = root[1] as 'CourseData' | 'EntryList';
    const rootAttrs = root[2] ?? '';

    // <Event> block, then nearest <Name> inside it.
    const evMatch = cleaned.match(/<Event\b[^>]*>([\s\S]*?)<\/Event>/);
    let evName = '';
    if (evMatch && evMatch[1]) {
      const nameMatch = evMatch[1].match(/<Name\b[^>]*>([^<]+)<\/Name>/);
      if (nameMatch && nameMatch[1]) evName = nameMatch[1].trim();
    }

    let name = '';
    let date = '';
    if (evName) {
      const datePfx = evName.match(/^(\d{4}-\d{2}-\d{2})\s+(.+)$/);
      if (datePfx && datePfx[1] && datePfx[2]) {
        date = datePfx[1];
        name = datePfx[2].trim();
      } else {
        name = evName;
      }
    }
    if (!date) {
      const ctAttr = rootAttrs.match(/createTime="(\d{4}-\d{2}-\d{2})/);
      if (ctAttr && ctAttr[1]) date = ctAttr[1];
    }
    if (!name && !date) return null;
    return { name, date, kind };
  }

  async function handleQuickstartFile(file: File): Promise<void> {
    quickstartError = null;
    if (!file.name.toLowerCase().endsWith('.xml')) {
      quickstartError = t('wiz.step1.quickstart.error');
      return;
    }
    let head: string;
    try {
      head = await file.slice(0, HEAD_BYTES).text();
    } catch {
      quickstartError = t('wiz.step1.quickstart.error');
      return;
    }
    const hints = extractHints(head);
    if (!hints) {
      quickstartError = t('wiz.step1.quickstart.error');
      return;
    }
    onquickstart(file, hints.name, hints.date, { filename: file.name, kind: hints.kind });
  }

  function onFileInputChange(e: Event): void {
    const target = e.currentTarget as HTMLInputElement;
    const file = target.files && target.files[0];
    if (file) void handleQuickstartFile(file);
    // Reset so picking the SAME file again still fires change.
    target.value = '';
  }

  function openPicker(): void {
    fileInput?.click();
  }

  function clearImport(): void {
    quickstartError = null;
    onquickstartclear();
  }
</script>

<div class="step-grid">
  <!-- Quickstart panel — sits ABOVE the manual form so operators see
       the fastest path first. Manual entry stays available below for
       events without a course file (rare, but supported). -->
  <section
    class="quickstart"
    class:loaded={preimportedFile !== null}
    aria-labelledby="qs-title"
  >
    <h3 id="qs-title">{t('wiz.step1.quickstart')}</h3>
    {#if preimportedFile === null}
      <p class="muted small">{t('wiz.step1.quickstart.hint')}</p>
      <div class="qs-actions">
        <input
          bind:this={fileInput}
          type="file"
          accept=".xml,application/xml,text/xml"
          onchange={onFileInputChange}
          class="hidden-file-input"
          data-testid="wiz-step1-file"
        />
        <button
          type="button"
          class="btn primary"
          onclick={openPicker}
          data-testid="wiz-step1-quickstart-btn"
        >
          📁 {t('wiz.step1.quickstart.button')}
        </button>
      </div>
      {#if quickstartError}
        <p class="err small" role="alert" data-testid="wiz-step1-quickstart-error">{quickstartError}</p>
      {/if}
    {:else}
      <div class="loaded-row" data-testid="wiz-step1-quickstart-loaded">
        <span class="ok-icon" aria-hidden="true">✓</span>
        <div class="grow">
          <div class="loaded-msg">{t('wiz.step1.quickstart.loaded')}</div>
          <div class="mono small">{preimportedFile.name}</div>
        </div>
        <button
          type="button"
          class="btn ghost small-btn"
          onclick={clearImport}
          data-testid="wiz-step1-quickstart-clear"
        >
          {t('wiz.step1.quickstart.clear')}
        </button>
      </div>
    {/if}
  </section>

  <p class="muted divider-or">{t('wiz.step1.quickstart.skip')}</p>

  <div class="field">
    <label for="wiz-name">{t('wiz.name')}</label>
    <!-- svelte-ignore a11y_autofocus -->
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
    <!-- `lang="sv"` forces YYYY-MM-DD display + Swedish picker
         localisation regardless of Chrome UI language. Wire format is
         always ISO 8601 (the value attr serializes that way). -->
    <input
      id="wiz-date"
      class="input"
      type="date"
      lang="sv"
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
  .small {
    font-size: 12.5px;
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

  /* ---------- quickstart panel ---------- */
  .quickstart {
    background: var(--bg-sunken);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 14px 16px;
    display: grid;
    gap: 10px;
  }
  .quickstart.loaded {
    background: color-mix(in srgb, var(--ok) 8%, var(--bg-elev));
    border-color: color-mix(in srgb, var(--ok) 35%, var(--border));
  }
  .quickstart h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--fg);
  }
  .qs-actions {
    display: flex;
    gap: 10px;
    align-items: center;
  }
  .hidden-file-input {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  .btn {
    height: var(--hit);
    min-height: var(--hit);
    padding: 0 var(--space-md);
    border-radius: var(--radius);
    border: 1px solid var(--border-strong);
    background: var(--bg-elev);
    color: var(--fg);
    font-size: var(--fs-label);
    font-weight: 500;
    cursor: pointer;
  }
  .btn:hover {
    background: var(--bg-sunken);
  }
  .btn.primary {
    background: var(--accent);
    color: var(--accent-fg);
    border-color: var(--accent);
  }
  .btn.primary:hover {
    background: var(--accent-strong);
  }
  .btn.ghost {
    background: transparent;
    border-color: transparent;
  }
  .btn.ghost:hover {
    background: var(--bg-sunken);
  }
  .small-btn {
    height: auto;
    min-height: 0;
    padding: 4px 10px;
    font-size: 12.5px;
  }
  .err {
    color: var(--dnf);
    margin: 0;
  }
  .loaded-row {
    display: flex;
    gap: 12px;
    align-items: center;
  }
  .loaded-row .grow {
    flex: 1;
    display: grid;
    gap: 2px;
  }
  .loaded-row .loaded-msg {
    color: var(--ok);
    font-weight: 600;
    font-size: 13.5px;
  }
  .ok-icon {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--ok);
    color: var(--accent-fg);
    display: grid;
    place-items: center;
    font-weight: 700;
    flex-shrink: 0;
  }
  .mono {
    font-family: var(--font-mono);
    color: var(--fg-muted);
  }
  .divider-or {
    text-align: center;
    color: var(--fg-faint);
    font-size: 11.5px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 500;
    margin: 4px 0 -4px;
  }
</style>

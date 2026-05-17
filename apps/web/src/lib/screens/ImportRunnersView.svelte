<!--
  Authored for fartol. Not ported from upstream.

  ImportRunnersView — the "where do I add runners?" surface.

  Two paths into the same ingestEntryList pipeline:
   1. Direct from Eventor by date — operator picks the competition date,
      we list events from Eventor (filtered to STK org), operator picks
      the event, we POST /api/competitions/:id/eventor-import with that
      event ID. Server does the actual download + XSD + ingest in one
      atomic transaction (eventorImport route).
   2. Upload an IOF EntryList XML — fallback for offline / non-STK orgs
      / pre-downloaded files. POSTs multipart to the existing
      /api/competitions/:id/import endpoint.

  Both paths share the same success/error surface so the operator
  doesn't have to learn two flows.

  UI shape: date picker → event list → import. We skip the parallel
  Eventor club + class fetches because FartOL already pulls clubs as
  part of the cachedcompetitors boot job and classes come from the
  CourseData import (no separate Eventor fetch needed).
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n/index.ts';
  import {
    listEventorEvents,
    importEntriesFromEventor,
    importCompetitionFile,
    getCompetition,
    type EventorEventListItem,
    type EventorImportResult,
  } from '$lib/api/client.ts';
  import { ApiError } from '$lib/api/client.ts';
  import Button from '$lib/ui/Button.svelte';
  import Field from '$lib/ui/Field.svelte';
  import Input from '$lib/ui/Input.svelte';
  import Icon from '$lib/ui/Icon.svelte';

  interface Props {
    competitionId: string;
  }

  let { competitionId }: Props = $props();

  // --- Eventor path ---------------------------------------------------------
  /** ISO date the operator wants to search Eventor on. Defaults to the
   * competition's date when known; otherwise today. */
  let searchDate = $state('');
  let events = $state<EventorEventListItem[]>([]);
  let searching = $state(false);
  let searchError = $state<string | null>(null);
  /** True after a successful search; lets us render "no events" instead of
   * just showing an empty list (which the operator might mistake for
   * "didn't run yet"). */
  let searched = $state(false);
  /** EventId currently being imported — disables the row's button so a
   * double-tap can't double-POST. Null while no import is in flight. */
  let importingEventId = $state<number | null>(null);
  let importResult = $state<EventorImportResult | null>(null);
  let importError = $state<string | null>(null);

  // --- Upload-XML path ------------------------------------------------------
  let uploadInput: HTMLInputElement | undefined = $state();
  let uploading = $state(false);
  let uploadError = $state<string | null>(null);

  // --- Init: prefill the date from the competition record ------------------
  onMount(() => {
    void prefillDate();
  });
  async function prefillDate(): Promise<void> {
    try {
      const res = await getCompetition(competitionId);
      // getCompetition returns { competition: { date: 'YYYY-MM-DD', ... }, ... }
      const compDate = (res as unknown as { competition?: { date?: string } }).competition?.date;
      if (compDate && /^\d{4}-\d{2}-\d{2}$/.test(compDate)) {
        searchDate = compDate;
      } else {
        searchDate = isoToday();
      }
    } catch {
      searchDate = isoToday();
    }
  }
  function isoToday(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  async function search(): Promise<void> {
    searchError = null;
    importResult = null;
    importError = null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(searchDate)) {
      searchError = t('importRunners.errBadDate');
      return;
    }
    searching = true;
    try {
      const res = await listEventorEvents({
        fromDate: searchDate,
        toDate: searchDate,
      });
      events = res.events;
      searched = true;
    } catch (e) {
      if (e instanceof ApiError && e.status === 503) {
        searchError = t('importRunners.errNoKey');
      } else {
        searchError = (e as Error).message || t('importRunners.errSearchFailed');
      }
      events = [];
      searched = false;
    } finally {
      searching = false;
    }
  }

  async function importEvent(eventId: number): Promise<void> {
    importError = null;
    importResult = null;
    importingEventId = eventId;
    try {
      const res = await importEntriesFromEventor(competitionId, eventId);
      importResult = res;
    } catch (e) {
      if (e instanceof ApiError && e.status === 503) {
        importError = t('importRunners.errNoKey');
      } else if (e instanceof ApiError && e.status === 502) {
        importError = t('importRunners.errEventorDown');
      } else {
        importError = (e as Error).message || t('importRunners.errImportFailed');
      }
    } finally {
      importingEventId = null;
    }
  }

  // --- Upload path ----------------------------------------------------------
  function openUploadPicker(): void {
    uploadInput?.click();
  }
  async function onUploadChange(e: Event): Promise<void> {
    const target = e.currentTarget as HTMLInputElement;
    const file = target.files && target.files[0];
    target.value = '';
    if (!file) return;
    uploadError = null;
    importResult = null;
    importError = null;
    uploading = true;
    try {
      const res = await importCompetitionFile(competitionId, file);
      // importCompetitionFile returns a different shape than the eventor
      // route (it can dispatch CourseData OR EntryList) — cast to the
      // EntryList branch we expect here.
      const r = res as unknown as EventorImportResult;
      if (r && r.kind === 'EntryList') {
        importResult = r;
      } else {
        uploadError = t('importRunners.errWrongKind');
      }
    } catch (e) {
      uploadError = (e as Error).message || t('importRunners.errImportFailed');
    } finally {
      uploading = false;
    }
  }
</script>

<section class="import-runners" data-testid="import-runners-view">
  <header class="head">
    <h1 class="title">{t('importRunners.title')}</h1>
    <p class="muted">{t('importRunners.subtitle')}</p>
  </header>

  <!-- Eventor card ---------------------------------------------------- -->
  <section class="card">
    <header class="section-head">
      <span class="ico" aria-hidden="true"><Icon name="arrow-up-right" size={18} /></span>
      <h2>{t('importRunners.eventor.title')}</h2>
    </header>
    <p class="desc muted small">{t('importRunners.eventor.desc')}</p>

    <div class="search-row">
      <Field label={t('importRunners.eventor.dateLabel')} htmlFor="import-date">
        <Input
          id="import-date"
          data-testid="import-date"
          type="text"
          bind:value={searchDate}
          placeholder="ÅÅÅÅ-MM-DD"
          maxlength={10}
        />
      </Field>
      <Button
        variant="primary"
        onclick={() => void search()}
        disabled={searching}
        data-testid="import-search"
      >
        {searching ? t('importRunners.eventor.searching') : t('importRunners.eventor.search')}
      </Button>
    </div>

    {#if searchError}
      <p class="err" role="alert" data-testid="import-search-error">{searchError}</p>
    {/if}

    {#if searched && events.length === 0 && !searchError}
      <p class="muted small" data-testid="import-empty">
        {t('importRunners.eventor.noEvents', { date: searchDate })}
      </p>
    {/if}

    {#if events.length > 0}
      <ul class="event-list" data-testid="import-event-list">
        {#each events as ev (ev.eventId)}
          <li class="event-row" data-testid="import-event-row">
            <div class="event-meta">
              <span class="event-name">{ev.name}</span>
              <span class="muted small mono">
                {ev.date}{ev.clock ? ` · ${ev.clock.slice(0, 5)}` : ''} · ID {ev.eventId}
              </span>
            </div>
            <Button
              variant="primary"
              size="sm"
              onclick={() => void importEvent(ev.eventId)}
              disabled={importingEventId !== null}
              data-testid="import-event-btn"
            >
              {importingEventId === ev.eventId
                ? t('importRunners.importing')
                : t('importRunners.import')}
            </Button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <!-- Upload card ----------------------------------------------------- -->
  <section class="card">
    <header class="section-head">
      <span class="ico" aria-hidden="true"><Icon name="arrow-up-right" size={18} /></span>
      <h2>{t('importRunners.upload.title')}</h2>
    </header>
    <p class="desc muted small">{t('importRunners.upload.desc')}</p>

    <div class="upload-row">
      <input
        bind:this={uploadInput}
        type="file"
        accept=".xml,application/xml,text/xml"
        onchange={onUploadChange}
        class="hidden-file-input"
        tabindex={-1}
        aria-hidden="true"
        data-testid="import-upload-input"
      />
      <Button
        variant="ghost"
        onclick={openUploadPicker}
        disabled={uploading}
        data-testid="import-upload-btn"
      >
        {uploading ? t('importRunners.uploading') : t('importRunners.upload.button')}
      </Button>
    </div>

    {#if uploadError}
      <p class="err" role="alert" data-testid="import-upload-error">{uploadError}</p>
    {/if}
  </section>

  <!-- Result banner --------------------------------------------------- -->
  {#if importResult}
    <div class="result ok" role="status" data-testid="import-result">
      <strong>
        {t('importRunners.success', { count: importResult.competitors_created })}
      </strong>
      {#if importResult.auto_bound.length > 0}
        <p class="small">{t('importRunners.autoBound', { count: importResult.auto_bound.length })}</p>
      {/if}
      {#if importResult.classes_missing.length > 0}
        <p class="warn small" data-testid="import-classes-missing">
          {t('importRunners.classesMissing', { classes: importResult.classes_missing.join(', ') })}
        </p>
      {/if}
    </div>
  {/if}

  {#if importError}
    <p class="err" role="alert" data-testid="import-error">{importError}</p>
  {/if}
</section>

<style>
  .import-runners {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    padding: var(--space-md);
    max-width: 720px;
    min-width: 0;
  }
  .head {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .title {
    margin: 0;
    font-size: var(--fs-heading);
    font-weight: 600;
  }
  .muted {
    color: var(--fg-muted);
    margin: 0;
  }
  .small {
    font-size: 13px;
  }
  .mono {
    font-family: var(--font-mono);
    font-feature-settings:
      'tnum' 1,
      'zero' 1;
  }
  .err {
    margin: 0;
    color: var(--dnf);
    font-size: 13px;
  }
  .warn {
    margin: 4px 0 0;
    color: var(--mp);
  }
  .card {
    background: var(--bg-elev);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: var(--space-md);
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }
  .section-head {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
  }
  .section-head h2 {
    margin: 0;
    font-size: var(--fs-label);
    font-weight: 600;
  }
  .ico {
    color: var(--accent);
    display: inline-flex;
  }
  .desc {
    margin: 0;
    line-height: 1.4;
  }
  .search-row {
    display: flex;
    gap: var(--space-sm);
    align-items: flex-end;
    flex-wrap: wrap;
  }
  .search-row :global(.field) {
    flex: 1 1 200px;
  }
  .event-list {
    list-style: none;
    margin: 4px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }
  .event-row {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: 10px 12px;
    background: var(--bg-sunken);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .event-meta {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .event-name {
    font-weight: 600;
    color: var(--fg);
  }
  .upload-row {
    display: flex;
    gap: var(--space-sm);
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
  .result {
    margin: 0;
    padding: 12px 14px;
    background: var(--ok-soft);
    border: 1px solid var(--ok);
    border-radius: var(--radius);
    color: var(--ok);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .result.ok strong {
    font-weight: 600;
    color: var(--ok);
  }
  @media (max-width: 480px) {
    .import-runners {
      padding: var(--space-sm);
    }
    .search-row {
      flex-direction: column;
      align-items: stretch;
    }
  }
</style>

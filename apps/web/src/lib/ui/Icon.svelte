<!--
  Authored for fartol. Not ported from upstream.

  Tiny inline-SVG icon component. We deliberately avoid a runtime icon
  library here — the nav + status set is small (~10 glyphs) so inlining
  costs less than another dep, lets us style via CSS `currentColor`, and
  keeps the bundle untouched.

  Glyphs follow Lucide-style strokes (2px round caps/joins, 24×24 grid)
  for visual cohesion. When the set grows past ~15 icons, swap to
  lucide-svelte and delete this file.
-->
<script lang="ts">
  type IconName =
    | 'home'
    | 'radio'
    | 'list'
    | 'arrow-up-right'
    | 'download'
    | 'key'
    | 'settings'
    | 'check'
    | 'menu'
    | 'x';

  interface Props {
    name: IconName;
    size?: number;
    /** Decorative icons (paired with a text label) get aria-hidden;
     * standalone icons MUST set this false AND pass a labelledby. */
    decorative?: boolean;
    'aria-label'?: string;
  }

  let { name, size = 18, decorative = true, ...rest }: Props = $props();
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden={decorative ? 'true' : undefined}
  role={decorative ? 'presentation' : 'img'}
  {...rest}
>
  {#if name === 'home'}
    <!-- house -->
    <path d="M3 11.5 12 4l9 7.5" />
    <path d="M5 10v10h14V10" />
  {:else if name === 'radio'}
    <!-- radio waves — readout live feed -->
    <circle cx="12" cy="12" r="2" />
    <path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 7.76a6 6 0 0 0 0 8.49" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" />
  {:else if name === 'list'}
    <!-- ranked list — results -->
    <path d="M9 6h12M9 12h12M9 18h12" />
    <circle cx="4" cy="6" r="1.2" />
    <circle cx="4" cy="12" r="1.2" />
    <circle cx="4" cy="18" r="1.2" />
  {:else if name === 'arrow-up-right'}
    <!-- export -->
    <path d="M7 17 17 7" />
    <path d="M8 7h9v9" />
  {:else if name === 'download'}
    <!-- import / cloud-down — direction matches "pulling INTO fartol" -->
    <path d="M12 3v12" />
    <path d="m7 10 5 5 5-5" />
    <path d="M5 21h14" />
  {:else if name === 'key'}
    <!-- key — hyrbrickor -->
    <circle cx="8" cy="15" r="4" />
    <path d="m10.85 12.15 8.65-8.65" />
    <path d="m18 5 2 2M16 7l2 2" />
  {:else if name === 'settings'}
    <!-- gear -->
    <circle cx="12" cy="12" r="3" />
    <path
      d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
    />
  {:else if name === 'check'}
    <!-- step indicator done -->
    <path d="m5 12 5 5 9-11" />
  {:else if name === 'menu'}
    <!-- hamburger (mobile drawer trigger) -->
    <path d="M4 6h16M4 12h16M4 18h16" />
  {:else if name === 'x'}
    <!-- close (drawer dismiss) -->
    <path d="m6 6 12 12M18 6 6 18" />
  {/if}
</svg>

<!--
  Authored for fartola. Not ported from upstream.

  Orienteering control flag mark — half-white / half-orange diamond
  rotated 45°. LOCKED by 01-UI-SPEC.md §"Visual Anchors". Stroke colour
  is hard-coded (#1a1a1a) because the flag's visual identity is the
  flag, not our accent — it survives accent + contrast tweaks.

  Sourced verbatim from
  01-SKETCHES/claude-design-bundle/project/app.jsx lines 105-110.
-->
<script lang="ts">
  interface Props {
    size?: number;
  }

  let { size = 30 }: Props = $props();
</script>

<span class="brand-mark" aria-label="Orienteering control flag" style="width: {size}px; height: {size}px;">
  <svg viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
    <g transform="rotate(45 14 14)">
      <rect x="4" y="4" width="20" height="10" fill="#ffffff" stroke="#1a1a1a" stroke-width="1.4" />
      <rect x="4" y="14" width="20" height="10" fill="#F36F21" stroke="#1a1a1a" stroke-width="1.4" />
    </g>
  </svg>
</span>

<style>
  .brand-mark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .brand-mark svg {
    width: 100%;
    height: 100%;
    display: block;
  }
</style>

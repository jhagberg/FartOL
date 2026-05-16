<!--
  Authored for fartol. Not ported from upstream.

  Animated heartbeat dot. UI-SPEC §"Visual Anchors" calls for a 1.6s
  ease-in-out pulse on the readout topbar's WS-connection indicator and
  on the sidebar station-card. The three variants map to the locked
  status palette (green = online, amber = reconnecting, red = offline).
-->
<script lang="ts">
  type Variant = 'green' | 'amber' | 'red';

  interface Props {
    variant?: Variant;
    label?: string;
  }

  let { variant = 'green', label }: Props = $props();
</script>

<span class="pulse-dot variant-{variant}" aria-label={label ?? variant}></span>

<style>
  @keyframes pulseDot {
    0%,
    100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.5;
      transform: scale(0.85);
    }
  }
  .pulse-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    animation: pulseDot 1.6s ease-in-out infinite;
  }
  .variant-green {
    background: var(--ok);
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--ok) 18%, transparent);
  }
  .variant-amber {
    background: var(--mp);
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--mp) 18%, transparent);
  }
  .variant-red {
    background: var(--dnf);
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--dnf) 18%, transparent);
  }
</style>

<script lang="ts">
  /**
   * StopwatchHero — the 240 px gradient glassmorphism circle on /tracker.
   *
   * Two states:
   *   1. Idle (tracker.running === null): brand-gradient circle + large "Start"
   *      label. Tap → host opens ClientTicketPicker.
   *   2. Running: live HH:MM:SS read-out + ticket code below + amber pulse halo.
   *      Tap → host opens the stop-confirm modal (we delegate to tracker store).
   *
   * Pure presentation — the host page owns the picker + stop logic. This
   * component just emits two events via callbacks.
   */
  import { tracker, formatHMS } from "$stores/tracker.svelte";

  interface Props {
    onStartRequested?: () => void;
    onStopRequested?:  () => void;
  }
  const { onStartRequested, onStopRequested }: Props = $props();

  const isRunning = $derived(tracker.running !== null);
  const elapsedLabel = $derived(formatHMS(tracker.elapsed));

  // Subtitle line under the circle
  const subtitle = $derived(
    isRunning
      ? (tracker.running?.plane_issue_seq
          || tracker.running?.description?.slice(0, 38)
          || "tracking…")
      : "Tap to start tracking time"
  );

  // Accent colour for the running halo — client colour if known, else brand
  const accent = $derived(
    isRunning && tracker.running?.client_code
      ? `var(--client-${tracker.running.client_code}, var(--brand))`
      : "var(--brand)"
  );

  function handleTap() {
    if (isRunning) onStopRequested?.();
    else           onStartRequested?.();
  }
</script>

<button
  type="button"
  class="hero"
  class:hero--running={isRunning}
  style={`--hero-accent: ${accent};`}
  onclick={handleTap}
  aria-label={isRunning ? `Stop tracker · ${elapsedLabel}` : "Start tracker"}
>
  <span class="hero__halo" aria-hidden="true"></span>
  <span class="hero__gradient" aria-hidden="true"></span>
  <span class="hero__inner-glow" aria-hidden="true"></span>

  <span class="hero__core">
    {#if isRunning}
      <span class="hero__time" aria-live="polite">{elapsedLabel}</span>
      <span class="hero__hint">tap to stop</span>
    {:else}
      <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polygon points="5 3 19 12 5 21 5 3" fill="white"/>
      </svg>
      <span class="hero__label">Start</span>
    {/if}
  </span>
</button>

<p class="hero__subtitle">{subtitle}</p>

<style>
  .hero {
    /* Reset */
    appearance: none; border: 0; padding: 0;
    background: transparent; cursor: pointer;
    /* Layout */
    position: relative;
    width: 240px; height: 240px;
    margin: 0 auto;
    border-radius: 50%;
    isolation: isolate;
    transition: transform 200ms var(--tier-spring, cubic-bezier(.34,1.56,.64,1));
    -webkit-tap-highlight-color: transparent;
  }
  .hero:hover { transform: scale(1.02); }
  .hero:active { transform: scale(0.98); }
  .hero:focus-visible {
    outline: none;
    box-shadow: 0 0 0 6px rgba(86,188,236,0.30);
  }

  /* Gradient body — visionOS-grade material */
  .hero__gradient {
    position: absolute; inset: 0;
    border-radius: 50%;
    background:
      radial-gradient(circle at 30% 25%, rgba(255,255,255,0.55), transparent 55%),
      linear-gradient(135deg, #6BC8F2 0%, #56BCEC 40%, #4CC8D4 70%, #1F7AAB 100%);
    box-shadow:
      0 12px 32px -8px rgba(86,188,236,0.55),
      0 4px 12px rgba(11,16,32,0.18),
      inset 0 1px 1px rgba(255,255,255,0.55),
      inset 0 -2px 4px rgba(11,16,32,0.12);
    z-index: 1;
  }

  /* Subtle inner glow */
  .hero__inner-glow {
    position: absolute; inset: 4px;
    border-radius: 50%;
    background:
      radial-gradient(circle at 50% 100%, rgba(255,255,255,0.18), transparent 60%);
    z-index: 2;
    pointer-events: none;
  }

  /* Running-state halo — pulses with client colour */
  .hero__halo {
    position: absolute; inset: -10px;
    border-radius: 50%;
    background: var(--hero-accent, var(--brand));
    opacity: 0; filter: blur(16px);
    transition: opacity 240ms var(--ease);
    z-index: 0;
  }
  .hero--running .hero__halo {
    opacity: 0.45;
    animation: hero-pulse 2.4s ease-in-out infinite;
  }
  @keyframes hero-pulse {
    0%, 100% { transform: scale(1);   opacity: 0.40; }
    50%      { transform: scale(1.05); opacity: 0.62; }
  }

  .hero__core {
    position: absolute; inset: 0;
    z-index: 3;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    gap: 8px;
    color: white;
    text-shadow: 0 1px 2px rgba(0,0,0,0.20);
    font-family: var(--sa);
  }

  .hero__label {
    font: 700 22px/1 var(--hd, var(--sa));
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .hero__time {
    font: 700 36px/1 var(--mo);
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
  }
  .hero__hint {
    font: 600 11px/1.2 var(--sa);
    letter-spacing: 0.10em;
    text-transform: uppercase;
    opacity: 0.85;
  }

  .hero__subtitle {
    margin: 16px auto 0;
    max-width: 380px;
    text-align: center;
    font: 500 13.5px/1.4 var(--sa);
    color: var(--t2);
    transition: color 200ms;
  }

  /* Mobile parity — circle scales down on narrow viewports */
  @media (max-width: 480px) {
    .hero { width: 200px; height: 200px; }
    .hero__time { font-size: 30px; }
    .hero__label { font-size: 19px; }
  }

  @media (prefers-reduced-motion: reduce) {
    .hero__halo, .hero { animation: none; transition: none; }
  }
</style>

<script lang="ts">
  /**
   * StateLoading — illustrated loading state with animated orbital rings.
   */
  interface Props {
    label?: string;
  }
  let { label = "Loading…" }: Props = $props();
</script>

<div class="loading-state enter-up" aria-busy="true" aria-label={label}>
  <div class="loading-rings" aria-hidden="true">
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
      <!-- Outer ring — slow rotation -->
      <circle cx="32" cy="32" r="28" stroke="var(--b2)" stroke-width="1"/>
      <circle cx="32" cy="4" r="2.5" fill="var(--a)" class="dot-outer"/>

      <!-- Middle ring — medium rotation -->
      <circle cx="32" cy="32" r="19" stroke="var(--b2)" stroke-width="1" stroke-dasharray="2 5"/>
      <circle cx="32" cy="13" r="2" fill="var(--a2)" class="dot-mid"/>

      <!-- Inner core -->
      <circle cx="32" cy="32" r="4" fill="var(--a)" opacity="0.25" class="core-pulse"/>
      <circle cx="32" cy="32" r="2" fill="var(--a)" opacity="0.8" class="core-pulse"/>
    </svg>
  </div>
  <p class="loading-label caption">{label}</p>
</div>

<style>
  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    padding: 28px 20px;
  }

  .loading-rings {
    position: relative;
  }

  .dot-outer {
    transform-origin: 32px 32px;
    animation: orbit-slow 3s linear infinite;
  }
  .dot-mid {
    transform-origin: 32px 32px;
    animation: orbit-mid 2s linear infinite;
  }
  .core-pulse {
    animation: core 1.8s ease-in-out infinite;
  }

  .loading-label {
    margin: 0;
    color: var(--t3);
    letter-spacing: 0.12em;
  }

  @keyframes orbit-slow {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  @keyframes orbit-mid {
    from { transform: rotate(0deg); }
    to   { transform: rotate(-360deg); }
  }
  @keyframes core {
    0%, 100% { opacity: 0.25; }
    50%      { opacity: 0.65; }
  }

  @media (prefers-reduced-motion: reduce) {
    .dot-outer, .dot-mid, .core-pulse { animation: none; }
  }
</style>

<script lang="ts">
  /**
   * TrackerHomeWidget — compact tracker summary for the Command home page (U.4).
   *
   * Three rows:
   *   1. Now: if running, show the live ticket + elapsed; else CTA to start.
   *   2. Today: hours vs FTE-adjusted target with progress bar.
   *   3. Week: hours vs target with progress bar.
   *
   * Auto-subscribes to the tracker store on mount. No props — reads user +
   * tracker singletons directly.
   */
  import { onMount, onDestroy } from "svelte";
  import { user } from "$stores/user.svelte";
  import { tracker, formatHMS } from "$stores/tracker.svelte";
  import { GlassActionSecondary, GlassValueChip, GlassInlineLink } from "$lib/components/glass";

  let dispose: (() => void) | null = null;

  onMount(() => { dispose = tracker.subscribe(); });
  onDestroy(() => dispose?.());

  const dailyTargetHr = $derived(Number(tracker.capacity?.daily_target_hours ?? 8.4));
  const weeklyTargetHr = $derived(Number(tracker.capacity?.weekly_target_hours ?? 42));

  function pct(hours: number, targetHr: number): number {
    if (targetHr <= 0) return 0;
    return Math.min(120, (hours / targetHr) * 100);
  }

  const ticketLabel = $derived(
    tracker.running?.plane_issue_seq
      ?? tracker.running?.description?.slice(0, 40)
      ?? "untimed"
  );
  const accent = $derived(
    tracker.running?.client_code
      ? `var(--client-${tracker.running.client_code}, var(--brand))`
      : "var(--brand)"
  );
</script>

<section class="tw" aria-label="Time tracker">
  <header class="tw__head">
    <span class="tw__eyebrow">⧗ TIME TRACKER</span>
    <GlassInlineLink href="/tracker">open →</GlassInlineLink>
  </header>

  <!-- Row 1: Now -->
  <div class="tw__now">
    {#if tracker.running}
      <div class="tw__running" style={`--running-accent: ${accent};`}>
        <span class="tw__pulse" aria-hidden="true"></span>
        <div class="tw__running-body">
          <span class="tw__running-label">tracking now</span>
          <span class="tw__running-title">{ticketLabel}</span>
        </div>
        <span class="tw__elapsed">{formatHMS(tracker.elapsed)}</span>
      </div>
    {:else}
      <div class="tw__idle">
        <span class="tw__idle-dot" aria-hidden="true"></span>
        <span class="tw__idle-text">Not tracking. Start from any ticket via <code>Start tracker</code>.</span>
      </div>
    {/if}
  </div>

  <!-- Row 2: Today -->
  <div class="tw__cap">
    <div class="tw__cap-row">
      <span class="tw__cap-label">TODAY</span>
      <span class="tw__cap-val">{tracker.todayHours.toFixed(1)} / {dailyTargetHr.toFixed(1)} h</span>
    </div>
    <div class="tw__cap-bar"><div class="tw__cap-fill" style="width: {pct(tracker.todayHours, dailyTargetHr)}%; background: var(--brand);"></div></div>

    <div class="tw__cap-row" style="margin-top: 8px;">
      <span class="tw__cap-label">WEEK</span>
      <span class="tw__cap-val">{tracker.weekHours.toFixed(1)} / {weeklyTargetHr.toFixed(1)} h</span>
    </div>
    <div class="tw__cap-bar"><div class="tw__cap-fill" style="width: {pct(tracker.weekHours, weeklyTargetHr)}%; background: var(--a2);"></div></div>
  </div>

  <!-- Row 3: FTE chip -->
  <footer class="tw__foot">
    <GlassValueChip tone="info" size="sm" static>
      {#snippet children()}FTE {tracker.capacity?.fte_percent ?? 100}%{/snippet}
    </GlassValueChip>
    {#if user.can("tracker.view_team")}
      <GlassValueChip tone="neutral" size="sm" onclick={() => (window.location.href = "/tracker/team")}>
        {#snippet children()}team view{/snippet}
      </GlassValueChip>
    {/if}
  </footer>
</section>

<style>
  .tw {
    padding: 18px;
    border-radius: var(--r2);
    background: var(--glass-card);
    backdrop-filter: var(--blur-card);
    -webkit-backdrop-filter: var(--blur-card);
    border: 1px solid var(--line);
    box-shadow: var(--sh-card);
    display: flex;
    flex-direction: column;
    gap: 14px;
    font-family: var(--sa);
  }
  .tw__head { display: flex; align-items: center; justify-content: space-between; }
  .tw__eyebrow {
    font: 700 11px/1.3 var(--sa);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--brand-deep);
  }

  /* Running row */
  .tw__running {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 12px;
    align-items: center;
    padding: 10px 14px;
    border-radius: var(--r1);
    background: var(--brand-softer);
    border: 1px solid var(--brand-line);
  }
  .tw__pulse {
    width: 10px; height: 10px;
    border-radius: 50%;
    background: var(--running-accent, var(--brand));
    animation: tw-pulse 2s ease-in-out infinite;
  }
  @keyframes tw-pulse {
    0%, 100% { box-shadow: 0 0 0 0 var(--running-accent, var(--brand)); opacity: 1; }
    50% { box-shadow: 0 0 0 6px transparent; opacity: .5; }
  }
  .tw__running-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .tw__running-label { font: 700 10px/1 var(--sa); letter-spacing: 0.08em; color: var(--t3); text-transform: uppercase; }
  .tw__running-title { font: 600 13.5px/1.2 var(--sa); color: var(--tx); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tw__elapsed {
    font-family: var(--mo);
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    font-size: 15px;
    color: var(--brand-deep);
  }

  .tw__idle {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border-radius: var(--r1);
    background: var(--s1);
    border: 1px dashed var(--line-2);
    font-size: 12.5px;
    color: var(--t2);
  }
  .tw__idle code { font-family: var(--mo); background: var(--s2); padding: 1px 6px; border-radius: 4px; color: var(--tx); }
  .tw__idle-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--t4); }

  /* Capacity rows */
  .tw__cap-row { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  .tw__cap-label { font: 700 10.5px/1.3 var(--sa); letter-spacing: 0.10em; color: var(--t3); text-transform: uppercase; }
  .tw__cap-val {
    font: 700 13px/1 var(--mo);
    color: var(--tx);
    font-variant-numeric: tabular-nums;
  }
  .tw__cap-bar { margin-top: 4px; height: 6px; border-radius: 999px; background: var(--s2); overflow: hidden; }
  .tw__cap-fill { height: 100%; border-radius: 999px; transition: width 280ms var(--ease); }

  .tw__foot { display: flex; gap: 6px; flex-wrap: wrap; }
</style>

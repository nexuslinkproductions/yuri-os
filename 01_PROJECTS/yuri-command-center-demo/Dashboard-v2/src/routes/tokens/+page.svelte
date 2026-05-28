<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import GlassCard from "$components/GlassCard.svelte";
  import GlassStat from "$components/GlassStat.svelte";
  import LiveBadge from "$components/LiveBadge.svelte";

  type SourceStats = { tokens_in: number; tokens_out: number; cost_usd: number; calls: number };
  type PeriodStats = { tokens_in: number; tokens_out: number; cost_usd: number; calls: number; by_source: Record<string, SourceStats> };
  type DailyRow   = { date: string; tokens_in: number; tokens_out: number; cost_usd: number; calls: number };

  type Stats = {
    last_7d:  PeriodStats;
    last_30d: PeriodStats;
    all_time: PeriodStats;
    daily:    DailyRow[];
    fetched_at: string;
  };

  let stats   = $state<Stats | null>(null);
  let loading = $state(true);
  let error   = $state("");
  let live    = $state(false);
  let interval: ReturnType<typeof setInterval>;

  const SOURCE_LABELS: Record<string, string> = {
    fanny_text:   "Fanny · Text",
    fanny_vision: "Fanny · Vision",
    claudio:      "Claudio",
    exeo_main:    "EXEO · Main",
  };

  const SOURCE_COLORS: Record<string, string> = {
    fanny_text:   "var(--a, #06b6d4)",
    fanny_vision: "var(--a2, #8b5cf6)",
    claudio:      "var(--ye, #f59e0b)",
    exeo_main:    "var(--or, #f59e0b)",
  };

  async function load() {
    try {
      const r = await fetch("/api/functions/token-usage", { credentials: "include" });
      if (!r.ok) throw new Error(`${r.status}`);
      stats   = await r.json();
      error   = "";
      live    = true;
    } catch (e: any) {
      error = e.message || "Failed to load";
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    load();
    interval = setInterval(load, 15_000);
  });
  onDestroy(() => clearInterval(interval));

  function fmt(n: number) {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
    if (n >= 1_000)     return (n / 1_000).toFixed(1) + "k";
    return String(n);
  }

  function usd(n: number) {
    return "$" + n.toFixed(4);
  }

  // Chart helpers
  const BAR_H = 80;
  const barMax = $derived(
    stats?.daily?.length
      ? Math.max(...stats.daily.map(d => d.tokens_in + d.tokens_out), 1)
      : 1
  );

  function barH(tokens: number): number {
    return Math.round((tokens / barMax) * BAR_H);
  }

  function dayLabel(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString("de-CH", { weekday: "short", day: "numeric" });
  }

  let period = $state("7d");
  const active = $derived(
    period === "7d" ? stats?.last_7d : period === "30d" ? stats?.last_30d : stats?.all_time
  );
</script>

<svelte:head><title>Token Usage · EXEO</title></svelte:head>

<div class="page">
  <!-- Header -->
  <div class="page-header">
    <div class="title-row">
      <div class="claude-wrap" aria-label="Claude AI">
        <div class="claude-orb">
          <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M20 6C12.268 6 6 12.268 6 20s6.268 14 14 14 14-6.268 14-14S27.732 6 20 6z" fill="url(#g1)"/>
            <path d="M15 20c0-2.761 2.239-5 5-5s5 2.239 5 5-2.239 5-5 5-5-2.239-5-5z" fill="rgba(255,255,255,0.9)"/>
            <defs>
              <radialGradient id="g1" cx="35%" cy="30%" r="70%">
                <stop offset="0%" stop-color="#a78bfa"/>
                <stop offset="50%" stop-color="#818cf8"/>
                <stop offset="100%" stop-color="#06b6d4"/>
              </radialGradient>
            </defs>
          </svg>
          <div class="pulse-ring"></div>
          <div class="pulse-ring delay"></div>
        </div>
      </div>
      <div>
        <h1 class="page-title">Token Usage</h1>
        <p class="page-sub">Live consumption across all AI calls · refreshes every 15s</p>
      </div>
      <div class="badge-wrap">
        <LiveBadge active={live} />
      </div>
    </div>
  </div>

  {#if loading}
    <div class="loader-row">
      <div class="spinner"></div>
      <span>Loading usage data…</span>
    </div>
  {:else if error}
    <GlassCard>
      <p class="err-msg">Error: {error}</p>
    </GlassCard>
  {:else if stats}

    <!-- Period toggle -->
    <div class="period-tabs">
      {#each [["7d","Last 7 days"],["30d","Last 30 days"],["all","All time"]] as [k, label] (k)}
        <button class="ptab {period === k ? 'active' : ''}" onclick={() => { period = k; }}>{label}</button>
      {/each}
    </div>

    <!-- KPI row -->
    <div class="kpi-grid">
      <GlassStat
        label="Total tokens"
        value={fmt((active?.tokens_in ?? 0) + (active?.tokens_out ?? 0))}
        sub="{fmt(active?.tokens_in ?? 0)} in · {fmt(active?.tokens_out ?? 0)} out"
      />
      <GlassStat
        label="Total cost"
        value={usd(active?.cost_usd ?? 0)}
        sub="claude-sonnet-4-6 · $3/$15 per MTok"
      />
      <GlassStat
        label="API calls"
        value={String(active?.calls ?? 0)}
        sub="across all sources"
      />
      <GlassStat
        label="Avg tokens/call"
        value={active?.calls ? fmt(Math.round(((active.tokens_in + active.tokens_out) / active.calls))) : "–"}
        sub="in + out combined"
      />
    </div>

    <!-- Source breakdown -->
    <GlassCard>
      <h2 class="card-title">By source</h2>
      <div class="source-list">
        {#each Object.entries(active?.by_source ?? {}) as [src, s]}
          {@const total = s.tokens_in + s.tokens_out}
          {@const grandTotal = (active?.tokens_in ?? 0) + (active?.tokens_out ?? 0) || 1}
          {@const pct = Math.round((total / grandTotal) * 100)}
          {@const color = SOURCE_COLORS[src] ?? "var(--cyan)"}
          <div class="source-row">
            <div class="source-meta">
              <span class="source-dot" style="background:{color}"></span>
              <span class="source-name">{SOURCE_LABELS[src] ?? src}</span>
              <span class="source-calls">{s.calls} calls</span>
            </div>
            <div class="source-bar-wrap">
              <div class="source-bar" style="width:{pct}%;background:{color}"></div>
            </div>
            <div class="source-nums">
              <span>{fmt(s.tokens_in)}↑ {fmt(s.tokens_out)}↓</span>
              <span class="source-cost">{usd(s.cost_usd)}</span>
            </div>
          </div>
        {:else}
          <p class="empty">No usage recorded yet in this period.</p>
        {/each}
      </div>
    </GlassCard>

    <!-- Daily chart -->
    {#if stats.daily.length}
      <GlassCard>
        <h2 class="card-title">Daily token volume · last 14 days</h2>
        <div class="chart-scroll">
          <div class="chart">
            {#each stats.daily as day}
              {@const hIn  = barH(day.tokens_in)}
              {@const hOut = barH(day.tokens_out)}
              <div class="bar-col">
                <div class="bar-stack">
                  <div class="bar bar-out" style="height:{hOut}px" title="Out: {fmt(day.tokens_out)}"></div>
                  <div class="bar bar-in"  style="height:{hIn}px"  title="In: {fmt(day.tokens_in)}"></div>
                </div>
                <span class="bar-label">{dayLabel(day.date)}</span>
                <span class="bar-cost">{usd(day.cost_usd)}</span>
              </div>
            {/each}
          </div>
          <div class="legend">
            <span class="leg-item"><span class="leg-dot" style="background:var(--cyan)"></span>Input</span>
            <span class="leg-item"><span class="leg-dot" style="background:var(--violet)"></span>Output</span>
          </div>
        </div>
      </GlassCard>
    {/if}

    <!-- All-time summary footer -->
    <GlassCard>
      <div class="footer-row">
        <div class="footer-stat">
          <span class="footer-label">All-time tokens</span>
          <span class="footer-val">{fmt((stats.all_time.tokens_in + stats.all_time.tokens_out))}</span>
        </div>
        <div class="footer-stat">
          <span class="footer-label">All-time cost</span>
          <span class="footer-val">{usd(stats.all_time.cost_usd)}</span>
        </div>
        <div class="footer-stat">
          <span class="footer-label">Total calls</span>
          <span class="footer-val">{stats.all_time.calls}</span>
        </div>
        <span class="footer-ts">Updated {new Date(stats.fetched_at).toLocaleTimeString("de-CH")}</span>
      </div>
    </GlassCard>

  {/if}
</div>

<style>
  /* ── Layout ── */
  .page { display: flex; flex-direction: column; gap: 20px; }

  .page-header { margin-bottom: 4px; }
  .title-row { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
  .page-title { font-size: 1.75rem; font-weight: 700; margin: 0; letter-spacing: -0.02em; }
  .page-sub   { font-size: 0.85rem; color: var(--tx2); margin: 4px 0 0; }
  .badge-wrap { margin-left: auto; }

  /* ── Claude orb animation ── */
  .claude-wrap { position: relative; width: 56px; height: 56px; flex-shrink: 0; }

  .claude-orb {
    position: relative;
    width: 56px; height: 56px;
    animation: claude-bounce 1.8s cubic-bezier(0.36, 0.07, 0.19, 0.97) infinite;
  }
  .claude-orb svg { width: 56px; height: 56px; filter: drop-shadow(0 0 12px rgba(139,92,246,0.5)); }

  @keyframes claude-bounce {
    0%, 100% { transform: translateY(0)   scale(1);    }
    15%       { transform: translateY(-10px) scale(1.05); }
    30%       { transform: translateY(0)   scale(0.97); }
    45%       { transform: translateY(-5px) scale(1.02); }
    60%       { transform: translateY(0)   scale(1);    }
  }

  .pulse-ring {
    position: absolute; inset: 0;
    border-radius: 50%;
    border: 2px solid rgba(139,92,246,0.4);
    animation: pulse-expand 1.8s ease-out infinite;
  }
  .pulse-ring.delay { animation-delay: 0.6s; border-color: rgba(6,182,212,0.3); }

  @keyframes pulse-expand {
    0%   { transform: scale(1);    opacity: 0.8; }
    100% { transform: scale(1.9);  opacity: 0; }
  }

  /* ── Period tabs ── */
  .period-tabs { display: flex; gap: 8px; }
  .ptab {
    padding: 6px 16px; border-radius: 20px; border: 1px solid var(--s2);
    background: transparent; color: var(--tx2); font-size: 0.82rem; cursor: pointer;
    transition: all 0.15s;
  }
  .ptab:hover  { background: var(--s1); color: var(--tx); }
  .ptab.active { background: var(--s2); color: var(--tx); border-color: var(--cyan); }

  /* ── KPI grid ── */
  .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }

  /* ── Source list ── */
  .card-title { font-size: 0.9rem; font-weight: 600; color: var(--tx2); margin: 0 0 16px; text-transform: uppercase; letter-spacing: 0.06em; }
  .source-list { display: flex; flex-direction: column; gap: 14px; }

  .source-row { display: flex; flex-direction: column; gap: 5px; }
  .source-meta { display: flex; align-items: center; gap: 8px; font-size: 0.85rem; }
  .source-dot  { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .source-name { font-weight: 600; }
  .source-calls { color: var(--tx2); margin-left: auto; }

  .source-bar-wrap { height: 6px; background: var(--s1); border-radius: 3px; overflow: hidden; }
  .source-bar { height: 100%; border-radius: 3px; transition: width 0.4s ease; }

  .source-nums { display: flex; justify-content: space-between; font-size: 0.78rem; color: var(--tx2); }
  .source-cost { font-weight: 600; color: var(--tx); }

  .empty { color: var(--tx2); font-size: 0.85rem; font-style: italic; }

  /* ── Daily chart ── */
  .chart-scroll { overflow-x: auto; padding-bottom: 8px; }
  .chart {
    display: flex; align-items: flex-end; gap: 6px;
    padding: 8px 0 12px;
    min-width: 560px;
  }
  .bar-col {
    display: flex; flex-direction: column; align-items: center; gap: 4px;
    flex: 1; min-width: 32px;
  }
  .bar-stack { display: flex; flex-direction: column-reverse; align-items: center; gap: 1px; height: 80px; justify-content: flex-start; }
  .bar { width: 100%; max-width: 28px; border-radius: 3px 3px 0 0; transition: height 0.4s ease; min-height: 2px; }
  .bar-in  { background: var(--a); }
  .bar-out { background: var(--a2); }
  .bar-label { font-size: 0.7rem; color: var(--tx2); text-align: center; white-space: nowrap; }
  .bar-cost  { font-size: 0.65rem; color: var(--tx2); }

  .legend { display: flex; gap: 16px; margin-top: 8px; }
  .leg-item { display: flex; align-items: center; gap: 5px; font-size: 0.78rem; color: var(--tx2); }
  .leg-dot  { width: 10px; height: 10px; border-radius: 2px; }

  /* ── Footer ── */
  .footer-row { display: flex; align-items: center; gap: 28px; flex-wrap: wrap; }
  .footer-stat { display: flex; flex-direction: column; gap: 2px; }
  .footer-label { font-size: 0.75rem; color: var(--tx2); text-transform: uppercase; letter-spacing: 0.05em; }
  .footer-val   { font-size: 1.1rem; font-weight: 700; }
  .footer-ts    { margin-left: auto; font-size: 0.75rem; color: var(--tx2); }

  /* ── Loader / error ── */
  .loader-row { display: flex; align-items: center; gap: 12px; color: var(--tx2); padding: 40px 0; }
  .spinner {
    width: 20px; height: 20px; border-radius: 50%;
    border: 2px solid var(--s2); border-top-color: var(--a);
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .err-msg { color: var(--re); }
</style>

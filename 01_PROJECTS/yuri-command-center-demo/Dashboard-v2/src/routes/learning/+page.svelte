<script lang="ts">
  import { onMount } from "svelte";
  import { recentDecisions, hasClient, type Decision } from "$lib/db";
  import GlassCard from "$components/GlassCard.svelte";
  import GlassStat from "$components/GlassStat.svelte";
  import LiveBadge from "$components/LiveBadge.svelte";

  let decisions = $state<Decision[]>([]);
  let loading = $state(true);
  let windowDays = $state<30 | 60 | 90>(30);

  onMount(async () => {
    decisions = await recentDecisions(90, 1000);
    loading = false;
  });

  // window-filtered slice
  const inWindow = $derived((() => {
    const cutoff = Date.now() - windowDays * 86400_000;
    return decisions.filter(d => new Date(d.created_at).getTime() >= cutoff);
  })());

  // accuracy: % of recommendations CEO followed without modification
  const accuracyMetrics = $derived((() => {
    const reacted = inWindow.filter(d => d.chosen_action !== null);
    const followed = inWindow.filter(d => d.chosen_action === "followed").length;
    const modified = inWindow.filter(d => d.chosen_action === "modified").length;
    const rejected = inWindow.filter(d => d.chosen_action === "rejected").length;
    const pending  = inWindow.filter(d => d.chosen_action === null && d.outcome === null).length;
    const total    = inWindow.length;
    const followPct = reacted.length === 0 ? null : Math.round((followed / reacted.length) * 100);
    return { total, reacted: reacted.length, followed, modified, rejected, pending, followPct };
  })());

  // outcome breakdown (post-reconcile)
  const outcomeMetrics = $derived((() => {
    const won  = inWindow.filter(d => d.outcome === "won").length;
    const lost = inWindow.filter(d => d.outcome === "lost").length;
    const neutral = inWindow.filter(d => d.outcome === "neutral").length;
    const broken  = inWindow.filter(d => d.outcome === "broken").length;
    const classified = won + lost + neutral + broken;
    const winRate = classified === 0 ? null : Math.round((won / classified) * 100);
    return { won, lost, neutral, broken, classified, winRate };
  })());

  // confidence calibration: avg confidence_pre on won vs lost outcomes
  const calibration = $derived((() => {
    const wonRows = inWindow.filter(d => d.outcome === "won" && typeof d.confidence_pre === "number");
    const lostRows = inWindow.filter(d => d.outcome === "lost" && typeof d.confidence_pre === "number");
    const avg = (rows: Decision[]) => rows.length === 0 ? null : rows.reduce((s, r) => s + (r.confidence_pre || 0), 0) / rows.length;
    return { avgWonConf: avg(wonRows), avgLostConf: avg(lostRows), wonN: wonRows.length, lostN: lostRows.length };
  })());

  // weekly trend - bucketed by ISO week
  type WeekBucket = { weekKey: string; weekLabel: string; total: number; followed: number; reacted: number; followPct: number | null };
  const weeklyTrend = $derived((() => {
    const map = new Map<string, WeekBucket>();
    for (const d of inWindow) {
      const dt = new Date(d.created_at);
      // Monday of the ISO week
      const day = dt.getUTCDay() || 7;
      const monday = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate() - (day - 1)));
      const key = monday.toISOString().slice(0, 10);
      const label = `${String(monday.getUTCMonth() + 1).padStart(2, "0")}/${String(monday.getUTCDate()).padStart(2, "0")}`;
      const b = map.get(key) || { weekKey: key, weekLabel: label, total: 0, followed: 0, reacted: 0, followPct: null };
      b.total++;
      if (d.chosen_action !== null) b.reacted++;
      if (d.chosen_action === "followed") b.followed++;
      map.set(key, b);
    }
    const buckets = [...map.values()].sort((a, b) => a.weekKey.localeCompare(b.weekKey));
    for (const b of buckets) b.followPct = b.reacted === 0 ? null : Math.round((b.followed / b.reacted) * 100);
    return buckets;
  })());

  // by-agent breakdown
  type AgentBreakdown = { agent: string; total: number; followed: number; followPct: number | null; avgConf: number | null };
  const byAgent = $derived((() => {
    const map = new Map<string, { total: number; followed: number; reacted: number; confSum: number; confN: number }>();
    for (const d of inWindow) {
      const a = d.recommended_by || "unknown";
      const e = map.get(a) || { total: 0, followed: 0, reacted: 0, confSum: 0, confN: 0 };
      e.total++;
      if (d.chosen_action !== null) e.reacted++;
      if (d.chosen_action === "followed") e.followed++;
      if (typeof d.confidence_pre === "number") { e.confSum += d.confidence_pre; e.confN++; }
      map.set(a, e);
    }
    const out: AgentBreakdown[] = [...map.entries()].map(([agent, e]) => ({
      agent,
      total: e.total,
      followed: e.followed,
      followPct: e.reacted === 0 ? null : Math.round((e.followed / e.reacted) * 100),
      avgConf: e.confN === 0 ? null : Math.round((e.confSum / e.confN) * 100) / 100,
    }));
    out.sort((a, b) => b.total - a.total);
    return out;
  })());

  // recent feed - last 12 decisions, newest first
  const recent = $derived(inWindow.slice(0, 12));

  // sparkline path generation for follow-rate
  const sparklinePath = $derived((() => {
    const pts = weeklyTrend.filter(b => b.followPct !== null).map(b => b.followPct as number);
    if (pts.length === 0) return "";
    const W = 320, H = 80, P = 6;
    const max = 100, min = 0;
    return pts.map((v, i) => {
      const x = pts.length === 1 ? W / 2 : P + (i / (pts.length - 1)) * (W - 2 * P);
      const y = H - P - ((v - min) / (max - min)) * (H - 2 * P);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
  })());

  function ago(iso: string) {
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 60_000)    return "just now";
    if (ms < 3600_000)  return Math.floor(ms / 60_000) + "m ago";
    if (ms < 86400_000) return Math.floor(ms / 3600_000) + "h ago";
    return Math.floor(ms / 86400_000) + "d ago";
  }

  function chipClass(action: string | null) {
    if (action === "followed") return "chip ok";
    if (action === "modified") return "chip warn";
    if (action === "rejected") return "chip error";
    return "chip dim";
  }

  function outcomeChip(outcome: string | null) {
    if (outcome === "won")    return "chip ok";
    if (outcome === "lost")   return "chip error";
    if (outcome === "broken") return "chip error";
    if (outcome === "neutral")return "chip dim";
    return "chip dim";
  }
</script>

<header class="row between items-center wrap gap-4">
  <div class="stack gap-1">
    <span class="caption">10 · LEARNING</span>
    <h1 class="h1 font-display">Active learning loop</h1>
    <p class="body">NEX Brain decisions captured · CEO reactions · 7-day reconciled outcomes.</p>
  </div>
  <div class="row gap-2 items-center">
    <div class="window-toggle" role="tablist" aria-label="Time window">
      {#each [30, 60, 90] as d}
        <button
          type="button"
          role="tab"
          aria-selected={windowDays === d}
          class="window-btn {windowDays === d ? 'active' : ''}"
          onclick={() => (windowDays = d as 30 | 60 | 90)}
        >{d}d</button>
      {/each}
    </div>
    <LiveBadge />
  </div>
</header>

{#if !hasClient()}
  <GlassCard idx={0}>
    <p class="body">Supabase client not configured - learning data unavailable.</p>
  </GlassCard>
{:else if loading}
  <GlassCard idx={0}>
    <p class="body">Loading decisions ...</p>
  </GlassCard>
{:else if decisions.length === 0}
  <GlassCard idx={0}>
    <h2 class="h2 font-display">No decisions captured yet</h2>
    <p class="body">Phase 2 capture has not yet logged any agent recommendations. Once <code>sales-coach</code>, <code>ops-guardian</code>, and <code>commitment-keeper</code> start writing through <code>Scripts/lib/decisions-capture.js</code>, this tab will fill in.</p>
  </GlassCard>
{:else}
  <div class="stat-row">
    <GlassStat label="Decisions ({windowDays}d)" value={accuracyMetrics.total} />
    <GlassStat
      label="CEO follow rate"
      value={accuracyMetrics.followPct === null ? "-" : accuracyMetrics.followPct}
      unit={accuracyMetrics.followPct === null ? "" : "%"}
      tone={accuracyMetrics.followPct !== null && accuracyMetrics.followPct >= 70 ? "ok" : accuracyMetrics.followPct !== null && accuracyMetrics.followPct < 40 ? "warn" : "default"}
    />
    <GlassStat
      label="Win rate (reconciled)"
      value={outcomeMetrics.winRate === null ? "-" : outcomeMetrics.winRate}
      unit={outcomeMetrics.winRate === null ? "" : "%"}
      tone={outcomeMetrics.winRate !== null && outcomeMetrics.winRate >= 60 ? "ok" : outcomeMetrics.winRate !== null && outcomeMetrics.winRate < 30 ? "warn" : "default"}
    />
    <GlassStat
      label="Pending reaction"
      value={accuracyMetrics.pending}
    />
  </div>

  <div class="grid">
    <GlassCard idx={0} class="span-2">
      <header class="row between items-center">
        <div class="stack gap-0">
          <h2 class="h2 font-display">Follow-rate trend</h2>
          <span class="caption dim">% of CEO reactions that were "followed verbatim", week by week</span>
        </div>
        <span class="caption">{weeklyTrend.length} weeks</span>
      </header>
      {#if sparklinePath === ""}
        <p class="body">Not enough data yet for a trend line.</p>
      {:else}
        <div class="spark-wrap">
          <svg viewBox="0 0 320 80" class="spark" role="img" aria-label="follow-rate weekly trend">
            <path d="M 6 60 L 314 60" stroke="var(--b2)" stroke-dasharray="2,4" />
            <path d="M 6 40 L 314 40" stroke="var(--b1)" stroke-dasharray="2,4" />
            <path d="M 6 20 L 314 20" stroke="var(--b1)" stroke-dasharray="2,4" />
            <path d={sparklinePath} fill="none" stroke="var(--a)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <ul class="spark-legend">
            {#each weeklyTrend as b}
              <li><span class="caption dim">{b.weekLabel}</span><span class="font-mono">{b.followPct === null ? "-" : `${b.followPct}%`}</span></li>
            {/each}
          </ul>
        </div>
      {/if}
    </GlassCard>

    <GlassCard idx={1}>
      <header class="row between items-center">
        <h2 class="h2 font-display">Outcome mix</h2>
        <span class="caption">{outcomeMetrics.classified}</span>
      </header>
      <ul class="ilist">
        <li class="row between items-center"><span>Won</span><span class="chip ok">{outcomeMetrics.won}</span></li>
        <li class="row between items-center"><span>Lost</span><span class="chip error">{outcomeMetrics.lost}</span></li>
        <li class="row between items-center"><span>Neutral</span><span class="chip dim">{outcomeMetrics.neutral}</span></li>
        <li class="row between items-center"><span>Broken</span><span class="chip error">{outcomeMetrics.broken}</span></li>
      </ul>
      {#if calibration.avgWonConf !== null || calibration.avgLostConf !== null}
        <p class="caption dim calib-line">
          Confidence calibration:
          {calibration.avgWonConf === null ? "-" : `${(calibration.avgWonConf * 100).toFixed(0)}% pre on wins`}
          ·
          {calibration.avgLostConf === null ? "-" : `${(calibration.avgLostConf * 100).toFixed(0)}% pre on losses`}
        </p>
      {/if}
    </GlassCard>

    <GlassCard idx={2} class="span-2">
      <header class="row between items-center">
        <h2 class="h2 font-display">Per-agent performance</h2>
        <span class="caption">{byAgent.length} agents</span>
      </header>
      {#if byAgent.length === 0}
        <p class="body">No agent activity in window.</p>
      {:else}
        <table class="agent-table">
          <thead>
            <tr><th>Agent</th><th class="num">Total</th><th class="num">Followed</th><th class="num">Follow %</th><th class="num">Avg conf</th></tr>
          </thead>
          <tbody>
            {#each byAgent as a}
              <tr>
                <td class="font-mono">{a.agent}</td>
                <td class="num">{a.total}</td>
                <td class="num">{a.followed}</td>
                <td class="num">{a.followPct === null ? "-" : `${a.followPct}%`}</td>
                <td class="num">{a.avgConf === null ? "-" : a.avgConf.toFixed(2)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </GlassCard>

    <GlassCard idx={3} class="span-2">
      <header class="row between items-center">
        <h2 class="h2 font-display">Recent decisions</h2>
        <span class="caption">{recent.length}</span>
      </header>
      {#if recent.length === 0}
        <p class="body">No decisions in window.</p>
      {:else}
        <ul class="ilist event">
          {#each recent as d}
            <li class="dec-row">
              <header class="row between items-center wrap gap-2">
                <span class="caption">{ago(d.created_at)}</span>
                <span class="font-mono code">{d.recommended_by || "?"}</span>
                {#if d.client_code}<span class="font-mono dim">{d.client_code}</span>{/if}
                <span class={chipClass(d.chosen_action)}>{d.chosen_action || "pending"}</span>
                {#if d.outcome}<span class={outcomeChip(d.outcome)}>{d.outcome}</span>{/if}
                {#if typeof d.confidence_pre === "number"}<span class="caption dim">conf {(d.confidence_pre * 100).toFixed(0)}%</span>{/if}
              </header>
              <p class="dec-text">{d.recommendation || d.decision || "(no text)"}</p>
            </li>
          {/each}
        </ul>
      {/if}
    </GlassCard>
  </div>
{/if}

<style>
  .stat-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 16px;
    margin-bottom: 4px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 20px;
  }
  .grid :global(.span-2) {
    grid-column: span 2;
  }
  @media (max-width: 860px) {
    .grid {
      grid-template-columns: 1fr;
    }
    .grid :global(.span-2) {
      grid-column: auto;
    }
  }

  .window-toggle {
    display: inline-flex;
    gap: 2px;
    padding: 3px;
    border-radius: 999px;
    background: var(--s1);
    border: 1px solid var(--b1);
  }
  .window-btn {
    appearance: none;
    background: transparent;
    border: 0;
    color: var(--t3);
    font: inherit;
    padding: 4px 12px;
    border-radius: 999px;
    cursor: pointer;
    font-size: 12px;
    transition: background 0.18s ease, color 0.18s ease;
  }
  .window-btn.active {
    background: var(--a-12);
    color: var(--a);
  }
  .window-btn:hover:not(.active) {
    color: var(--tx);
  }

  .spark-wrap {
    display: grid;
    grid-template-columns: 1fr;
    gap: 12px;
  }
  .spark {
    width: 100%;
    height: auto;
    max-height: 120px;
  }
  .spark-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    list-style: none;
    padding: 0;
    margin: 0;
    font-size: 11px;
  }
  .spark-legend li {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 44px;
  }

  .agent-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  .agent-table th, .agent-table td {
    padding: 6px 8px;
    border-bottom: 1px solid var(--b1);
    text-align: left;
  }
  .agent-table th {
    font-weight: 600;
    color: var(--t3);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .agent-table .num { text-align: right; }

  .calib-line {
    margin-top: 10px;
  }

  .dec-row {
    padding: 8px 0;
    border-bottom: 1px solid var(--b1);
  }
  .dec-row:last-child { border-bottom: 0; }
  .dec-text {
    margin: 6px 0 0;
    font-size: 13px;
    color: var(--tx);
  }
</style>

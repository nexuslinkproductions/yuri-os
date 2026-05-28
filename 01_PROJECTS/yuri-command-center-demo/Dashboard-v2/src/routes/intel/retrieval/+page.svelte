<script lang="ts">
  import { onMount } from "svelte";
  import GlassCard from "$components/GlassCard.svelte";
  import GlassStat from "$components/GlassStat.svelte";
  import Sparkline from "$components/Sparkline.svelte";
  import StateLoading from "$components/StateLoading.svelte";

  // ─ Phase 1.7 ε1 retrieval-quality dashboard ─────────────────────
  // Backed by /api/functions/intel-retrieval-stats. KPI tiles,
  // volume sparkline, hot/cold corners, drift/coherence/memory side
  // panels.

  type Payload = {
    window: { days: number; since: string; generated_at: string };
    retrieval: {
      query_count: number;
      hit_rate: number | null;
      used_rate: number | null;
      latency: { p50: number | null; p95: number | null; max: number | null };
      volume_series: { day: string; count: number }[];
      callers: { caller: string; count: number }[];
      hot_corners: { source_ref: string; hits: number }[];
      cold: { total: number; by_type: Record<string, number>; sample: string[] };
      index: { total_embeddings: number; by_source_type: Record<string, number> };
    };
    drift: {
      total: number;
      by_trend: Record<string, number>;
      recent: { occurred_at: string; trend: string; distance: number; caller: string }[];
    };
    coherence: {
      pending: number; shipped: number; edited: number; killed: number;
      recent: { id: number; occurred_at: string; decision: string; anomaly_score: number; text_excerpt: string }[];
    };
    memory: {
      open_clusters: number; total_facts: number;
      clusters: {
        subject_type: string; subject_id: string; predicate: string; live_count: number;
        facts: { id: string; value: any; actor: string; confidence: number; source: string; source_ref: string; recorded_at: string }[];
      }[];
    };
    mcp_calls?: {
      total: number;
      by_tool: { tool: string; fires: number; ok: number; errors: number; avg_latency_ms: number | null }[];
    };
    decisions?: {
      weekly_rollup: { recommended_by: string; total: number; won: number; actioned: number; no_action: number; missed: number; cancelled: number; progressed: number; unknown: number; noise_rate: string; land_rate: string }[];
      today: {
        total: number;
        by_agent: { agent: string; count: number }[];
        recent: { id: string; agent: string; outcome: string | null; client_code: string | null; target: string | null; preview: string; at: string }[];
      };
      weekly_examples: { id: string; recommended_by: string; outcome: string; confidence_post: number; target_entity_id: string | null; client_code: string | null; recommendation: string; decided_at: string; rank_in_outcome: number }[];
    };
    commitments?: {
      due_today: { id: string; promise: string; due_at: string; actor: string }[];
      overdue: { id: string; promise: string; due_at: string; actor: string; days_overdue: number }[];
      due_today_count: number;
      overdue_count: number;
    };
    gaps?: {
      detected_this_week: number; resolved_this_week: number; surfaced_this_week: number;
      still_open: number; snoozed: number; stale_surfaced: number;
    };
    agent_health?: {
      total: number; fresh: number; stale: number; dead: number; unknown: number;
      agents: {
        name: string; status: string; health: 'fresh' | 'stale' | 'dead' | 'unknown';
        last_action: string; last_seen: string;
        minutes_since: number; expected_cadence_minutes: number;
      }[];
    };
    module_status?: {
      total: number; active: number; degraded: number; silent: number;
      not_initialized: number; unknown: number;
      last_refresh: string | null;
      modules: {
        name: string; display: string; category: string;
        status: 'active' | 'degraded' | 'silent' | 'not_initialized' | 'unknown';
        last_signal_at: string | null;
        data_points: any;
        notes: string;
        updated_at: string;
      }[];
    };
    canonical_store?: {
      total_active: number; distinct_subjects: number; distinct_predicates: number;
      freshness: { fresh: number; aging: number; stale: number; unknown: number };
      sources: { from_vault: number; from_chat: number; from_other: number };
      suspects: {
        open: number; new_this_week: number;
        recent: { id: number; subject_id: string; predicate: string; vault_value: any; canonical_value: any; detected_at: string }[];
      };
      top_predicates: { predicate: string; count: number }[];
      cold_facts: { id: string; subject_id: string; predicate: string; age_days: number }[];
    };
  };

  let data = $state<Payload | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let days = $state(7);

  async function load() {
    loading = true;
    error = null;
    try {
      const res = await fetch(`/api/functions/intel-retrieval-stats?days=${days}`, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
    } catch (e: any) {
      error = e.message || String(e);
    } finally {
      loading = false;
    }
  }

  onMount(load);

  function pct(v: number | null): string {
    return v == null ? "—" : `${(v * 100).toFixed(0)}%`;
  }
  function fmtTime(s: string): string {
    return new Date(s).toLocaleString("de-CH", { dateStyle: "short", timeStyle: "short" });
  }
  function trendBadgeColor(trend: string): string {
    if (trend === "stable")       return "var(--ok, #10b981)";
    if (trend === "drifting")     return "var(--warn, #f59e0b)";
    if (trend === "accelerating") return "var(--error, #ef4444)";
    if (trend === "recovering")   return "var(--info, #3b82f6)";
    return "var(--tx2, #6b7280)";
  }
</script>

<svelte:head>
  <title>Intel · Retrieval — NEX</title>
</svelte:head>

<section class="intel-retrieval">
  <header class="head">
    <h1>Retrieval Quality</h1>
    <div class="controls">
      <label>
        Window:
        <select bind:value={days} onchange={load}>
          <option value={1}>24 h</option>
          <option value={7}>7 d</option>
          <option value={14}>14 d</option>
          <option value={30}>30 d</option>
        </select>
      </label>
      <button class="refresh" onclick={load} disabled={loading}>↻ refresh</button>
    </div>
  </header>

  {#if loading && !data}
    <StateLoading label="Aggregating metrics…" />
  {:else if error}
    <GlassCard>
      <p class="err">Failed to load: {error}</p>
    </GlassCard>
  {:else if data}
    <!-- MODULE STATUS STRIP — Phase D ─────────────────────────────── -->
    {#if data.module_status && data.module_status.modules.length}
      <section class="module-strip" title="Module status — refreshed every 15 min">
        <header class="module-strip-head">
          <span class="module-strip-title">NEX modules</span>
          <span class="module-strip-summary">
            <span class="dot dot-active"></span>{data.module_status.active}
            <span class="dot dot-degraded"></span>{data.module_status.degraded}
            <span class="dot dot-silent"></span>{data.module_status.silent}
            {#if data.module_status.unknown > 0}<span class="dot dot-unknown"></span>{data.module_status.unknown}{/if}
          </span>
          {#if data.module_status.last_refresh}
            <span class="module-strip-stamp">refreshed {fmtTime(data.module_status.last_refresh)}</span>
          {/if}
        </header>
        <div class="module-row">
          {#each data.module_status.modules as m}
            <div
              class="module-pill module-pill--{m.status}"
              title={`${m.display}\nstatus: ${m.status}\nlast signal: ${m.last_signal_at ? fmtTime(m.last_signal_at) : '—'}\n${m.notes || ''}`}
            >
              <span class="dot dot-{m.status}"></span>
              <span class="module-name">{m.display}</span>
            </div>
          {/each}
        </div>
      </section>
    {/if}

    <!-- KPI ROW -->
    <div class="kpi-grid">
      <GlassStat label="Queries"    value={data.retrieval.query_count} sub={`last ${days} day${days === 1 ? "" : "s"}`} trend={data.retrieval.volume_series.map(v => v.count)} />
      <GlassStat label="Hit rate"   value={pct(data.retrieval.hit_rate)} sub="≥1 result" tone={data.retrieval.hit_rate != null && data.retrieval.hit_rate < 0.7 ? "warn" : "ok"} />
      <GlassStat label="Used rate"  value={pct(data.retrieval.used_rate)} sub="feedback marked helpful" />
      <GlassStat label="p50 latency" value={data.retrieval.latency.p50 ?? "—"} unit="ms" />
      <GlassStat label="p95 latency" value={data.retrieval.latency.p95 ?? "—"} unit="ms" tone={data.retrieval.latency.p95 && data.retrieval.latency.p95 > 1000 ? "warn" : "default"} />
      <GlassStat label="Indexed"    value={data.retrieval.index.total_embeddings} sub="chunks" />
      <GlassStat label="Drift evts" value={data.drift.total} sub={`stable ${data.drift.by_trend.stable || 0} · drifting ${data.drift.by_trend.drifting || 0}`} tone={(data.drift.by_trend.accelerating || 0) > 0 ? "error" : "default"} />
      <GlassStat label="Coherence holds" value={data.coherence.pending + data.coherence.shipped + data.coherence.edited + data.coherence.killed} sub={`${data.coherence.pending} pending`} tone={data.coherence.pending > 0 ? "warn" : "default"} />
      <GlassStat label="Memory conflicts" value={data.memory.open_clusters} sub={`${data.memory.total_facts} facts`} tone={data.memory.open_clusters > 0 ? "warn" : "ok"} />
      {#if data.agent_health}
        <GlassStat
          label="Agents alive"
          value={`${data.agent_health.fresh}/${data.agent_health.total}`}
          sub={`${data.agent_health.dead} dead · ${data.agent_health.stale} stale`}
          tone={data.agent_health.dead > 0 ? "error" : (data.agent_health.stale > 2 ? "warn" : "ok")}
        />
      {/if}
      {#if data.canonical_store}
        <GlassStat
          label="Canonical facts"
          value={data.canonical_store.total_active}
          sub={`${data.canonical_store.distinct_subjects} subjects · ${data.canonical_store.distinct_predicates} predicates`}
          tone={data.canonical_store.suspects.open > 0 ? "warn" : "ok"}
        />
      {/if}
    </div>

    <!-- MOVE 3 Eve G master pane: NEX behavior panels ──────────────── -->
    {#if data.decisions || data.mcp_calls || data.commitments}
    <div class="grid-3">
      <!-- DECISIONS BY AGENT (weekly rollup) -->
      <GlassCard>
        <h3>📊 Decisions by agent (7d)</h3>
        <p class="sub">Reconciled outcomes from <code>decisions</code>. Noise = no_action + missed.</p>
        {#if data.decisions && data.decisions.weekly_rollup.length}
          <table class="mini">
            <thead><tr><th class="l">agent</th><th class="r">total</th><th class="r">acted</th><th class="r">noise</th></tr></thead>
            <tbody>
            {#each data.decisions.weekly_rollup as r}
              <tr>
                <td class="l">{r.recommended_by}</td>
                <td class="r">{r.total}</td>
                <td class="r" class:ok-text={Number(r.land_rate) >= 0.6}>{Math.round(Number(r.land_rate) * 100)}%</td>
                <td class="r" class:warn-text={Number(r.noise_rate) >= 0.7}>{Math.round(Number(r.noise_rate) * 100)}%</td>
              </tr>
            {/each}
            </tbody>
          </table>
        {:else}
          <p class="muted">No reconciled decisions in window yet. Reconciler runs at 00:15 CEST daily.</p>
        {/if}
      </GlassCard>

      <!-- TODAY'S ACTIVITY -->
      <GlassCard>
        <h3>🤖 Agents today</h3>
        <p class="sub">Decisions emitted since midnight CEST.</p>
        {#if data.decisions && data.decisions.today.total > 0}
          <ul class="evt-list">
            {#each data.decisions.today.by_agent as a}
              <li>
                <span class="dot" style="background: var(--a)"></span>
                <span class="trend">{a.agent}</span>
                <span class="dist">{a.count}×</span>
              </li>
            {/each}
          </ul>
          <details>
            <summary class="muted">recent {Math.min(8, data.decisions.today.recent.length)}</summary>
            <ul class="evt-list small">
              {#each data.decisions.today.recent as d}
                <li>
                  <span class="trend">{d.agent}</span>
                  <span class="excerpt">{d.preview}</span>
                </li>
              {/each}
            </ul>
          </details>
        {:else}
          <p class="muted">No decisions today yet.</p>
        {/if}
      </GlassCard>

      <!-- COMMITMENTS -->
      <GlassCard>
        <h3>⏱ Commitments</h3>
        <p class="sub">{data.commitments?.due_today_count ?? 0} due today · {data.commitments?.overdue_count ?? 0} overdue</p>
        {#if data.commitments && data.commitments.due_today.length}
          <h4 class="mini-h">Due today</h4>
          <ul class="evt-list">
            {#each data.commitments.due_today as c}
              <li>
                <span class="dot" style="background: var(--a2)"></span>
                <span class="excerpt">{c.promise}</span>
                <span class="t">{fmtTime(c.due_at)}</span>
              </li>
            {/each}
          </ul>
        {/if}
        {#if data.commitments && data.commitments.overdue.length}
          <h4 class="mini-h">Overdue</h4>
          <ul class="evt-list">
            {#each data.commitments.overdue.slice(0, 5) as c}
              <li>
                <span class="dot" style="background: var(--error, #ef4444)"></span>
                <span class="excerpt">{c.promise}</span>
                <span class="dist">{c.days_overdue}d late</span>
              </li>
            {/each}
          </ul>
        {/if}
        {#if (!data.commitments?.due_today.length && !data.commitments?.overdue.length)}
          <p class="muted">No commitments due or overdue. ✨</p>
        {/if}
      </GlassCard>
    </div>

    <div class="grid-3">
      <!-- MCP TOOL CALL FREQUENCY -->
      <GlassCard>
        <h3>🛠 MCP tool calls (7d)</h3>
        <p class="sub">Total {data.mcp_calls?.total ?? 0} · which tools the daemon actually uses.</p>
        {#if data.mcp_calls && data.mcp_calls.by_tool.length}
          <table class="mini">
            <thead><tr><th class="l">tool</th><th class="r">fires</th><th class="r">ok</th><th class="r">err</th><th class="r">avg ms</th></tr></thead>
            <tbody>
            {#each data.mcp_calls.by_tool.slice(0, 12) as t}
              <tr>
                <td class="l">{t.tool}</td>
                <td class="r">{t.fires}</td>
                <td class="r ok-text">{t.ok}</td>
                <td class="r" class:warn-text={t.errors > 0}>{t.errors}</td>
                <td class="r">{t.avg_latency_ms ?? '—'}</td>
              </tr>
            {/each}
            </tbody>
          </table>
        {:else}
          <p class="muted">No MCP telemetry yet (Eve A wired in tonight; populates as daemon runs).</p>
        {/if}
      </GlassCard>

      <!-- AGENT HEARTBEATS -->
      {#if data.agent_health && data.agent_health.agents.length}
      <GlassCard>
        <h3>💓 Agent heartbeats</h3>
        <p class="sub">
          {data.agent_health.fresh} fresh · {data.agent_health.stale} stale · {data.agent_health.dead} dead
          {#if data.agent_health.unknown > 0} · {data.agent_health.unknown} unknown{/if}
        </p>
        <table class="mini">
          <thead><tr><th class="l">agent</th><th class="l">health</th><th class="r">last seen</th></tr></thead>
          <tbody>
          {#each data.agent_health.agents as a}
            <tr>
              <td class="l">{a.name}</td>
              <td class="l">
                <span class="dot" style="background: {
                  a.health === 'fresh' ? 'var(--ok, #10b981)' :
                  a.health === 'stale' ? 'var(--warn, #f59e0b)' :
                  a.health === 'dead'  ? 'var(--error, #ef4444)' :
                                          'var(--tx2, #6b7280)'
                }"></span>
                {a.health}
              </td>
              <td class="r">{a.minutes_since != null ? Math.round(a.minutes_since) + 'm' : '—'}</td>
            </tr>
          {/each}
          </tbody>
        </table>
      </GlassCard>
      {/if}

      <!-- LOOP B GAP STATS -->
      <GlassCard>
        <h3>🎓 Knowledge gaps (Loop B)</h3>
        <p class="sub">Curriculum loop — what NEX is still learning.</p>
        {#if data.gaps}
          <table class="mini">
            <tbody>
              <tr><td class="l">detected this week</td><td class="r">{data.gaps.detected_this_week}</td></tr>
              <tr><td class="l">resolved this week</td><td class="r ok-text">{data.gaps.resolved_this_week}</td></tr>
              <tr><td class="l">surfaced this week</td><td class="r">{data.gaps.surfaced_this_week}</td></tr>
              <tr><td class="l">still open</td><td class="r" class:warn-text={data.gaps.still_open > 5}>{data.gaps.still_open}</td></tr>
              <tr><td class="l">snoozed</td><td class="r">{data.gaps.snoozed}</td></tr>
              <tr><td class="l">stale (&gt;3d unanswered)</td><td class="r" class:warn-text={data.gaps.stale_surfaced > 0}>{data.gaps.stale_surfaced}</td></tr>
            </tbody>
          </table>
        {:else}
          <p class="muted">No data.</p>
        {/if}
      </GlassCard>
    </div>
    {/if}

    <!-- CANONICAL STORE PANEL — Phase C ───────────────────────────── -->
    {#if data.canonical_store}
    <div class="grid-3">
      <!-- Freshness + sources -->
      <GlassCard>
        <h3>🧠 Canonical store · freshness</h3>
        <p class="sub">
          {data.canonical_store.total_active} active · {data.canonical_store.distinct_subjects} subjects ·
          {data.canonical_store.distinct_predicates} predicates
        </p>
        <table class="mini">
          <tbody>
            <tr><td class="l">🟢 fresh (≤30d)</td><td class="r ok-text">{data.canonical_store.freshness.fresh}</td></tr>
            <tr><td class="l">🟡 aging (≤90d)</td><td class="r">{data.canonical_store.freshness.aging}</td></tr>
            <tr><td class="l">🔴 stale (&gt;90d)</td><td class="r" class:warn-text={data.canonical_store.freshness.stale > 0}>{data.canonical_store.freshness.stale}</td></tr>
            <tr><td class="l">unknown</td><td class="r">{data.canonical_store.freshness.unknown}</td></tr>
          </tbody>
        </table>
        <h4 class="mini-h">Sources</h4>
        <table class="mini">
          <tbody>
            <tr><td class="l">vault frontmatter</td><td class="r">{data.canonical_store.sources.from_vault}</td></tr>
            <tr><td class="l">chat (CEO confirm)</td><td class="r">{data.canonical_store.sources.from_chat}</td></tr>
            <tr><td class="l">other actors</td><td class="r">{data.canonical_store.sources.from_other}</td></tr>
          </tbody>
        </table>
      </GlassCard>

      <!-- Suspects (vault drift) -->
      <GlassCard>
        <h3>⚠ Vault drift suspects</h3>
        <p class="sub">
          {data.canonical_store.suspects.open} open · {data.canonical_store.suspects.new_this_week} new this week
        </p>
        {#if data.canonical_store.suspects.recent.length}
          <ul class="evt-list small">
            {#each data.canonical_store.suspects.recent as s}
              <li>
                <strong>{s.subject_id}.{s.predicate}</strong>
                <span class="excerpt">vault: {String(typeof s.vault_value === 'object' ? JSON.stringify(s.vault_value) : s.vault_value).slice(0, 40)}</span>
                <span class="excerpt">canon: {String(typeof s.canonical_value === 'object' ? JSON.stringify(s.canonical_value) : s.canonical_value).slice(0, 40)}</span>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="muted">No drift detected. Vault and canonical in sync. ✨</p>
        {/if}
      </GlassCard>

      <!-- Top predicates + cold facts -->
      <GlassCard>
        <h3>📚 Predicate distribution</h3>
        <p class="sub">Most-blessed predicates across all subjects.</p>
        {#if data.canonical_store.top_predicates.length}
          <table class="mini">
            <tbody>
              {#each data.canonical_store.top_predicates.slice(0, 8) as p}
                <tr><td class="l">{p.predicate}</td><td class="r">{p.count}</td></tr>
              {/each}
            </tbody>
          </table>
        {/if}
        {#if data.canonical_store.cold_facts.length}
          <h4 class="mini-h">🧊 Cold facts (never queried)</h4>
          <ul class="evt-list small">
            {#each data.canonical_store.cold_facts.slice(0, 5) as c}
              <li>
                <span class="trend">{c.subject_id}.{c.predicate}</span>
                <span class="t">{c.age_days}d old</span>
              </li>
            {/each}
          </ul>
        {/if}
      </GlassCard>
    </div>
    {/if}

    <!-- VOLUME / CALLERS -->
    <div class="grid-2">
      <GlassCard>
        <h3>Volume per day</h3>
        <div class="vol-chart">
          {#each data.retrieval.volume_series as v}
            <div class="bar" style="height: {Math.max(2, v.count * 4)}px" title="{v.day}: {v.count}"></div>
          {/each}
        </div>
        <div class="vol-labels">
          <span>{data.retrieval.volume_series[0]?.day || ""}</span>
          <span>{data.retrieval.volume_series[data.retrieval.volume_series.length - 1]?.day || ""}</span>
        </div>
      </GlassCard>

      <GlassCard>
        <h3>Top callers</h3>
        {#if data.retrieval.callers.length}
          <table class="mini">
            {#each data.retrieval.callers as c}
              <tr><td class="r">{c.count}</td><td>{c.caller}</td></tr>
            {/each}
          </table>
        {:else}
          <p class="muted">No retrieval traffic in window.</p>
        {/if}
      </GlassCard>
    </div>

    <!-- HOT / COLD CORNERS -->
    <div class="grid-2">
      <GlassCard>
        <h3>🔥 Hot corners</h3>
        <p class="sub">Most-cited sources in retrieval results — your canonical knowledge.</p>
        {#if data.retrieval.hot_corners.length}
          <table class="mini">
            {#each data.retrieval.hot_corners as h}
              <tr><td class="r">{h.hits}×</td><td class="ref">{h.source_ref}</td></tr>
            {/each}
          </table>
        {:else}
          <p class="muted">No hot corners yet.</p>
        {/if}
      </GlassCard>

      <GlassCard>
        <h3>🧊 Cold corners</h3>
        <p class="sub">{data.retrieval.cold.total} sources never retrieved — orphans or niche.</p>
        {#if Object.keys(data.retrieval.cold.by_type).length}
          <table class="mini">
            {#each Object.entries(data.retrieval.cold.by_type) as [type, count]}
              <tr><td class="r">{count}</td><td>{type}</td></tr>
            {/each}
          </table>
        {/if}
        {#if data.retrieval.cold.sample.length}
          <details>
            <summary class="muted">sample sources ({data.retrieval.cold.sample.length})</summary>
            <ul class="ref-list">
              {#each data.retrieval.cold.sample as s}
                <li>{s}</li>
              {/each}
            </ul>
          </details>
        {/if}
      </GlassCard>
    </div>

    <!-- DRIFT / COHERENCE / MEMORY -->
    <div class="grid-3">
      <GlassCard>
        <h3>Drift (δ1)</h3>
        <p class="sub">Recent CEO-input register evaluations.</p>
        {#if data.drift.recent.length}
          <ul class="evt-list">
            {#each data.drift.recent as e}
              <li>
                <span class="dot" style="background: {trendBadgeColor(e.trend)}"></span>
                <span class="trend">{e.trend}</span>
                <span class="dist">{e.distance?.toFixed(3) ?? "—"}</span>
                <span class="caller">{e.caller}</span>
                <span class="t">{fmtTime(e.occurred_at)}</span>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="muted">No drift events.</p>
        {/if}
      </GlassCard>

      <GlassCard>
        <h3>Coherence holds (δ2)</h3>
        <p class="sub">{data.coherence.pending} pending, {data.coherence.shipped} shipped, {data.coherence.killed} killed.</p>
        {#if data.coherence.recent.length}
          <ul class="evt-list">
            {#each data.coherence.recent as h}
              <li>
                <span class="dot" style="background: {h.decision === 'pending' ? 'var(--warn)' : h.decision === 'killed' ? 'var(--error)' : 'var(--ok)'}"></span>
                <span class="trend">{h.decision}</span>
                <span class="dist">{(h.anomaly_score ?? 0).toFixed(2)}</span>
                <span class="excerpt">{h.text_excerpt}</span>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="muted">No coherence holds.</p>
        {/if}
      </GlassCard>

      <GlassCard>
        <h3>Memory conflicts (δ3)</h3>
        <p class="sub">{data.memory.open_clusters} open triple{data.memory.open_clusters === 1 ? "" : "s"} need CEO resolution.</p>
        {#if data.memory.clusters.length}
          <ul class="evt-list">
            {#each data.memory.clusters as c}
              <li>
                <strong>{c.subject_type}::{c.subject_id}::{c.predicate}</strong>
                <span class="dist">{c.live_count} live</span>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="muted">No conflicts. ✨</p>
        {/if}
      </GlassCard>
    </div>

    <p class="footer muted">generated {fmtTime(data.window.generated_at)} · window {days} day{days === 1 ? "" : "s"} · since {fmtTime(data.window.since)}</p>
  {/if}
</section>

<style>
  .intel-retrieval { padding: 1rem 1.5rem 4rem; max-width: 1400px; margin: 0 auto; }
  .head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; }
  .head h1 { font-size: 1.5rem; margin: 0; }
  .controls { display: flex; gap: 0.75rem; align-items: center; font-size: 0.9rem; }
  .controls select { padding: 0.25rem 0.5rem; border-radius: 6px; background: var(--bg2); color: var(--tx); border: 1px solid var(--bd); }
  .refresh { padding: 0.25rem 0.7rem; border-radius: 6px; background: var(--bg2); color: var(--tx); border: 1px solid var(--bd); cursor: pointer; }
  .refresh:hover { background: var(--bg3); }

  /* ── Phase D — module status strip ─────────────────────────── */
  .module-strip {
    background: var(--bg2, rgba(255,255,255,0.04));
    border: 1px solid var(--bd, rgba(255,255,255,0.08));
    border-radius: 10px;
    padding: 0.6rem 0.9rem;
    margin-bottom: 1rem;
  }
  .module-strip-head {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    margin-bottom: 0.5rem;
    font-size: 0.78rem;
  }
  .module-strip-title { font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--tx2); }
  .module-strip-summary { display: inline-flex; gap: 0.4rem; align-items: center; font-variant-numeric: tabular-nums; }
  .module-strip-summary .dot { width: 8px; height: 8px; }
  .module-strip-stamp { margin-left: auto; color: var(--tx2); font-size: 0.7rem; }
  .module-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .module-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.25rem 0.6rem;
    border-radius: 999px;
    background: var(--bg3, rgba(255,255,255,0.05));
    border: 1px solid var(--bd, rgba(255,255,255,0.08));
    font-size: 0.78rem;
    cursor: help;
    transition: background 0.15s, border-color 0.15s;
  }
  .module-pill:hover {
    background: var(--bg2, rgba(255,255,255,0.08));
    border-color: var(--a, #5b9eff);
  }
  .module-pill .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .module-pill .module-name { white-space: nowrap; }
  .dot-active           { background: var(--ok, #10b981); }
  .dot-degraded         { background: var(--warn, #f59e0b); }
  .dot-silent           { background: var(--error, #ef4444); }
  .dot-not_initialized  { background: var(--tx2, #6b7280); }
  .dot-unknown          { background: var(--tx2, #6b7280); }
  .module-pill--degraded { border-color: var(--warn, #f59e0b); }
  .module-pill--silent   { border-color: var(--error, #ef4444); }
  .module-pill--not_initialized,
  .module-pill--unknown  { opacity: 0.6; }

  .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 0.75rem; margin-bottom: 1rem; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 1rem; }
  .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.75rem; margin-bottom: 1rem; }
  @media (max-width: 900px) {
    .grid-2, .grid-3 { grid-template-columns: 1fr; }
  }

  h3 { font-size: 0.95rem; margin: 0 0 0.5rem; }
  .sub { font-size: 0.8rem; color: var(--tx2); margin: 0 0 0.5rem; }
  .muted { color: var(--tx2); font-style: italic; font-size: 0.85rem; }
  .err { color: var(--error, #ef4444); }

  .vol-chart { display: flex; align-items: flex-end; gap: 4px; height: 80px; padding-top: 8px; }
  .vol-chart .bar {
    flex: 1; min-width: 6px;
    background: linear-gradient(to top, var(--a), var(--a2));
    border-radius: 2px 2px 0 0;
    transition: opacity 0.2s;
  }
  .vol-chart .bar:hover { opacity: 0.8; }
  .vol-labels { display: flex; justify-content: space-between; font-size: 0.7rem; color: var(--tx2); margin-top: 4px; }

  .mini { width: 100%; font-size: 0.85rem; border-collapse: collapse; }
  .mini th, .mini td { padding: 0.2rem 0.4rem; border-bottom: 1px solid var(--bd); }
  .mini th { font-weight: 500; color: var(--tx2); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; }
  .mini .r { text-align: right; font-variant-numeric: tabular-nums; color: var(--a); }
  .mini .l { text-align: left; }
  .mini .ref { font-family: var(--font-mono, monospace); font-size: 0.78rem; word-break: break-all; }
  .ok-text { color: var(--ok, #10b981); }
  .warn-text { color: var(--warn, #f59e0b); }
  .mini-h { font-size: 0.78rem; color: var(--tx2); text-transform: uppercase; letter-spacing: 0.04em; margin: 0.5rem 0 0.2rem; }
  .evt-list.small { font-size: 0.75rem; }
  .evt-list.small li { grid-template-columns: auto 1fr; gap: 0.4rem; }

  .evt-list { list-style: none; padding: 0; margin: 0; font-size: 0.85rem; }
  .evt-list li {
    display: grid; grid-template-columns: auto auto auto 1fr auto; gap: 0.5rem;
    align-items: center; padding: 0.3rem 0; border-bottom: 1px solid var(--bd);
  }
  .evt-list li:last-child { border-bottom: none; }
  .evt-list .dot { width: 8px; height: 8px; border-radius: 50%; }
  .evt-list .trend { font-weight: 500; text-transform: capitalize; }
  .evt-list .dist { font-variant-numeric: tabular-nums; color: var(--tx2); font-size: 0.8rem; }
  .evt-list .caller, .evt-list .excerpt { color: var(--tx2); font-size: 0.78rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .evt-list .t { font-size: 0.72rem; color: var(--tx2); white-space: nowrap; }

  .ref-list { font-family: var(--font-mono, monospace); font-size: 0.72rem; padding-left: 1rem; }
  .ref-list li { color: var(--tx2); padding: 0.1rem 0; word-break: break-all; }

  .footer { font-size: 0.75rem; text-align: center; margin-top: 2rem; }
</style>

<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { recentAudit, subscribeAuditLog, hasClient, fetchTurnLatencySummary, type AuditRow, type TurnLatencySummary } from "$lib/db";
  import GlassCard from "$components/GlassCard.svelte";
  import GlassStat from "$components/GlassStat.svelte";
  import LiveBadge from "$components/LiveBadge.svelte";
  import { SLA_SERVICES, serviceRollup, type Severity } from "$lib/health-sla";

  let audit = $state<AuditRow[]>([]);
  let unsub: (() => void) | null = null;
  let loading = $state(true);
  let realtime = $state(false);
  let expandedKey = $state<string | null>(null);

  // F11 audit fix 2026-05-15: NEX→CEO latency SLA tile
  let slaSummary = $state<TurnLatencySummary | null>(null);
  let slaTimer: ReturnType<typeof setInterval> | null = null;

  async function refreshSla() {
    slaSummary = await fetchTurnLatencySummary();
  }

  onMount(async () => {
    audit = await recentAudit(300);
    loading = false;
    unsub = subscribeAuditLog(row => {
      realtime = true;
      audit = [row, ...audit].slice(0, 300);
    });
    setTimeout(() => { if (hasClient()) realtime = true; }, 1500);
    await refreshSla();
    slaTimer = setInterval(refreshSla, 30_000);
  });
  onDestroy(() => {
    unsub?.();
    if (slaTimer) clearInterval(slaTimer);
  });

  function fmtMs(ms: number | null | undefined): string {
    if (ms == null) return "—";
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
    const m = Math.floor(ms / 60_000);
    const s = Math.round((ms % 60_000) / 1000);
    return `${m}m${s}s`;
  }

  function p99Tone(ms: number | null | undefined): "ok" | "warn" | "error" {
    if (ms == null) return "ok";
    if (ms < 60_000) return "ok";
    if (ms < 120_000) return "warn";
    return "error";
  }

  const rollup = $derived(serviceRollup(audit));

  const lastByActor = $derived((() => {
    const m = new Map<string, AuditRow>();
    for (const a of audit) {
      const k = a.actor || "unknown";
      if (!m.has(k)) m.set(k, a);
    }
    return [...m.entries()].sort();
  })());

  const errors = $derived(audit.filter(a => /error|critical/i.test(a.details?.severity || "") || /fail|error/i.test(a.action)).slice(0, 12));

  const countBySeverity = $derived((() => {
    const c: Record<Severity, number> = { ok: 0, yellow: 0, red: 0, unknown: 0 };
    rollup.forEach(r => { c[r.severity]++; });
    return c;
  })());

  function ago(iso?: string) {
    if (!iso) return "never";
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 60_000)    return "just now";
    if (ms < 3600_000)  return Math.floor(ms / 60_000) + "m ago";
    if (ms < 86400_000) return Math.floor(ms / 3600_000) + "h ago";
    return Math.floor(ms / 86400_000) + "d ago";
  }

  function thresholdLabel(ok: number, yellow: number) {
    const fmt = (m: number) => m < 60 ? `${m}m` : `${Math.round(m / 60)}h`;
    return `ok <${fmt(ok)} · warn <${fmt(yellow)}`;
  }

  function relatedEvents(key: string) {
    const svc = SLA_SERVICES.find(s => s.key === key);
    if (!svc) return [];
    return audit.filter(a => svc.match(a)).slice(0, 20);
  }
</script>

<header class="row between items-center wrap gap-4">
  <div class="stack gap-1">
    <span class="caption">10 · HEALTH</span>
    <h1 class="h1 font-display">System pulse</h1>
    <p class="body">Per-service SLAs · webhook freshness · error stream · live audit feed.</p>
  </div>
  <LiveBadge active={realtime} label={realtime ? "REALTIME" : "OFFLINE"} />
</header>

<section class="kpi-grid">
  <GlassStat label="SERVICES GREEN" value={countBySeverity.ok}     tone="ok"    idx={0} />
  <GlassStat label="SERVICES WARN"  value={countBySeverity.yellow} tone="warn"  idx={1} />
  <GlassStat label="SERVICES RED"   value={countBySeverity.red}    tone={countBySeverity.red > 0 ? "error" : "ok"} idx={2} />
  <GlassStat label="ERROR ROWS"     value={errors.length}          tone={errors.length > 0 ? "error" : "ok"} idx={3} />
  <GlassStat label="REALTIME"       value={realtime ? "ON" : "OFF"} tone={realtime ? "ok" : "error"} idx={4} />
</section>

<!-- F11 audit fix 2026-05-15: NEX→CEO latency SLA -->
<section class="sla-section">
  <h2 class="h2 font-display">NEX → CEO latency (last 24h)</h2>
  <p class="caption dim">End-to-end: CEO message arrival → first NEX reply. Target: p99 &lt; 60s.</p>
  <div class="kpi-grid">
    <GlassStat label="TURNS 24H"      value={slaSummary?.turns_24h ?? 0}                                     tone="ok"                                idx={0} />
    <GlassStat label="P50"            value={fmtMs(slaSummary?.p50_total_ms)}                                tone="ok"                                idx={1} />
    <GlassStat label="P90"            value={fmtMs(slaSummary?.p90_total_ms)}                                tone={p99Tone(slaSummary?.p90_total_ms)} idx={2} />
    <GlassStat label="P99"            value={fmtMs(slaSummary?.p99_total_ms)}                                tone={p99Tone(slaSummary?.p99_total_ms)} idx={3} />
    <GlassStat label="MAX"            value={fmtMs(slaSummary?.max_total_ms)}                                tone={p99Tone(slaSummary?.max_total_ms)} idx={4} />
    <GlassStat label="OVER 60s"       value={slaSummary?.over_60s ?? 0}                                      tone={(slaSummary?.over_60s ?? 0) > 0 ? "warn" : "ok"} idx={5} />
    <GlassStat label="OVER 120s"      value={slaSummary?.over_120s ?? 0}                                     tone={(slaSummary?.over_120s ?? 0) > 0 ? "error" : "ok"} idx={6} />
    <GlassStat label="PUSH ENFORCED"  value={slaSummary?.push_enforced_count ?? 0}                           tone={(slaSummary?.push_enforced_count ?? 0) > 0 ? "warn" : "ok"} idx={7} />
  </div>
  <p class="caption dim" style="margin-top:8px">
    Full-turn p99 (CEO send → final completion): {fmtMs(slaSummary?.p99_full_ms)} ·
    P50 full: {fmtMs(slaSummary?.p50_full_ms)}
  </p>
</section>

<!-- SLA table -->
<section class="sla-section">
  <h2 class="h2 font-display">Service SLAs</h2>
  <p class="caption dim">Click any row to see the last 20 matching audit events.</p>

  {#if loading}
    <ul class="sla-list" aria-busy="true">
      {#each Array(8) as _, i}
        <li class="sla-row sev-unknown skel-row">
          <div class="sla-header" style="pointer-events: none;">
            <span class="sla-dot skel-dot"></span>
            <div class="sla-labels">
              <div class="skel-bar" style="width: {100 + (i % 3) * 60}px; height: 14px;"></div>
              <div class="skel-bar" style="width: 80px; height: 10px; margin-top: 4px;"></div>
            </div>
            <div class="sla-meta">
              <div class="skel-bar" style="width: 50px; height: 11px;"></div>
              <div class="skel-bar" style="width: 36px; height: 18px; border-radius: 999px;"></div>
            </div>
          </div>
        </li>
      {/each}
    </ul>
  {:else}
  <ul class="sla-list">
    {#each rollup as r}
      {@const expanded = expandedKey === r.svc.key}
      <li class="sla-row sev-{r.severity}" class:expanded>
        <button class="sla-header" onclick={() => expandedKey = expanded ? null : r.svc.key}>
          <span class="sla-dot"></span>
          <div class="sla-labels">
            <span class="sla-name">{r.svc.label}</span>
            <span class="sla-thresh caption dim">{thresholdLabel(r.svc.threshold.ok, r.svc.threshold.yellow)}</span>
          </div>
          <div class="sla-meta">
            {#if r.svc.plist_path}
              <span class="caption dim plist">{r.svc.plist_path}</span>
            {/if}
            <span class="sla-age">{ago(r.latest?.created_at)}</span>
            <span class={`sla-chip chip-${r.severity}`}>{r.severity}</span>
            <span class="caret">{expanded ? "▾" : "▸"}</span>
          </div>
        </button>
        {#if expanded}
          {@const events = relatedEvents(r.svc.key)}
          <div class="sla-body">
            {#if r.svc.hint}
              <p class="caption dim">{r.svc.hint}</p>
            {/if}
            {#if events.length === 0}
              <p class="body dim">No matching audit rows in current window.</p>
            {:else}
              <ul class="event-list">
                {#each events as e}
                  <li class="event-row">
                    <span class="caption ts">{ago(e.created_at)}</span>
                    <span class="action">{e.action}</span>
                    {#if e.entity_id}<span class="font-mono eid">{e.entity_id}</span>{/if}
                    {#if e.details?.severity}<span class={`sev-tag sev-${e.details.severity}`}>{e.details.severity}</span>{/if}
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
        {/if}
      </li>
    {/each}
  </ul>
  {/if}
</section>

<div class="two-col">
  <GlassCard idx={6}>
    <h2 class="h2 font-display">Recent errors</h2>
    {#if errors.length === 0}
      <p class="body">No errors in window.</p>
    {:else}
      <ul class="hlist">
        {#each errors as e}
          <li class="row between items-center">
            <span class="caption">{ago(e.created_at)}</span>
            <span class="grow">{e.action}</span>
            <span class="chip error">{e.details?.severity || "error"}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </GlassCard>

  <GlassCard idx={7}>
    <h2 class="h2 font-display">Last seen by actor</h2>
    {#if lastByActor.length === 0}
      <p class="body">No data.</p>
    {:else}
      <ul class="hlist grid-2">
        {#each lastByActor as [actor, a]}
          <li class="row between items-center">
            <span class="font-mono caption">{actor}</span>
            <span class="caption">{ago(a.created_at)}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </GlassCard>
</div>

<style>
  .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  @media (max-width: 920px) { .two-col { grid-template-columns: 1fr; } }

  .sla-section { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
  .dim { color: var(--t4); }

  .sla-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .sla-row {
    background: var(--s1);
    border: 1px solid var(--b1);
    border-radius: var(--r-md);
    overflow: hidden;
    transition: border-color var(--dur-fast);
  }
  .sla-row.sev-red    { border-color: rgba(239,68,68,0.35); box-shadow: 0 0 0 1px rgba(239,68,68,0.15); }
  .sla-row.sev-yellow { border-color: rgba(245,158,11,0.3); }
  .sla-row.sev-ok     { border-color: rgba(34,197,94,0.22); }

  .sla-header {
    all: unset; cursor: pointer;
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 14px;
    align-items: center;
    padding: 12px 16px;
    width: 100%;
    box-sizing: border-box;
  }
  .sla-header:hover { background: var(--s2); }

  .sla-dot {
    width: 10px; height: 10px; border-radius: 50%;
  }
  .sla-row.sev-red    .sla-dot { background: var(--re); box-shadow: 0 0 8px var(--re); animation: pulse 1.6s infinite ease-in-out; }
  .sla-row.sev-yellow .sla-dot { background: var(--ye); box-shadow: 0 0 6px var(--ye); }
  .sla-row.sev-ok     .sla-dot { background: var(--gr); box-shadow: 0 0 6px var(--gr); }

  .sla-labels { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .sla-name { font-size: 14px; color: var(--tx); font-weight: 500; }
  .sla-thresh { font-size: 10.5px; }

  .sla-meta { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; justify-content: flex-end; }
  .plist { font-family: "JetBrains Mono", monospace; font-size: 10.5px; opacity: 0.7; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sla-age { font-family: "JetBrains Mono", monospace; font-size: 11px; color: var(--t3); }
  .sla-chip {
    padding: 2px 10px;
    border-radius: 999px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 600;
  }
  .chip-ok     { background: var(--gr-14); color: var(--gr); }
  .chip-yellow { background: var(--ye-14); color: var(--ye); }
  .chip-red    { background: var(--re-14); color: var(--re); }
  .chip-unknown { background: var(--s2); color: var(--t3); }
  .caret { color: var(--t3); font-size: 11px; }

  .sla-body {
    padding: 10px 18px 14px 42px;
    border-top: 1px solid var(--b1);
    background: var(--s2);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .event-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
  .event-row {
    display: grid;
    grid-template-columns: 80px 1fr auto auto;
    gap: 10px;
    align-items: center;
    padding: 6px 10px;
    background: var(--s1);
    border-radius: var(--r-sm);
    font-size: 12px;
  }
  .ts { font-family: "JetBrains Mono", monospace; font-size: 10.5px; color: var(--t3); }
  .action { color: var(--tx); }
  .eid { font-size: 10.5px; color: var(--t3); }
  .sev-tag {
    padding: 1px 6px; border-radius: 999px; font-size: 10px;
    letter-spacing: 0.04em; text-transform: uppercase;
  }
  .sev-tag.sev-error { background: var(--re-18); color: var(--re); }
  .sev-tag.sev-critical { background: var(--re-28); color: var(--re); }
  .sev-tag.sev-warning { background: var(--ye-18); color: var(--ye); }

  .hlist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .hlist li { padding: 8px 12px; border-radius: var(--r-sm); }
  .hlist li:hover { background: var(--s1); }
  .hlist.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 12px; }

  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%      { opacity: 0.6; transform: scale(1.3); }
  }

  /* Skeletons */
  .skel-row { pointer-events: none; }
  .skel-dot { background: var(--b2) !important; box-shadow: none !important; animation: none !important; }
  .skel-bar {
    border-radius: 4px;
    background: var(--s2);
    animation: skel-pulse 1.4s ease-in-out infinite;
  }
  @keyframes skel-pulse { 0%,100%{opacity:0.45} 50%{opacity:0.85} }
  @media (prefers-reduced-motion: reduce) { .skel-bar { animation: none; opacity: 0.5; } }

  /* Mobile */
  @media (max-width: 480px) {
    .kpi-grid { grid-template-columns: repeat(2, 1fr); }
    .two-col { grid-template-columns: 1fr; }
    .sla-meta .plist { display: none; }
  }
</style>

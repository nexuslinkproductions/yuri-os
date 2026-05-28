<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { supabase, hasClient, subscribeAuditLog, type AuditRow } from "$lib/db";
  import { goto } from "$app/navigation";

  // ───────── State ─────────
  let authorized   = $state(false);
  let loading      = $state(true);
  let now          = $state(Date.now());
  let refreshedAt  = $state(Date.now());
  let events       = $state<AuditRow[]>([]);
  let realtimeOk   = $state(false);
  let dbOk         = $state(false);
  let lastError    = $state<string | null>(null);
  let flashId      = $state<string | null>(null);
  let expandedId   = $state<string | null>(null);
  let liveEnabled  = $state(true);
  let animProgress = $state(0);

  let nowTick:  ReturnType<typeof setInterval> | null = null;
  let pollTick: ReturnType<typeof setInterval> | null = null;
  let auditUnsub: (() => void) | null = null;

  // ───────── Auth + boot ─────────
  onMount(async () => {
    nowTick = setInterval(() => { now = Date.now(); }, 1000);

    try {
      const { data: { user } } = await supabase().auth.getUser();
      if (user?.email !== "claudio@c2moviez.com") {
        goto("/", { replaceState: true });
        return;
      }
      authorized = true;
    } catch {
      goto("/", { replaceState: true });
      return;
    }

    await refresh();
    pollTick = setInterval(() => { if (liveEnabled) refresh(); }, 30_000);

    try {
      auditUnsub = subscribeAuditLog((row) => {
        if (!isDeploymentRow(row)) return;
        realtimeOk = true;
        events = [row, ...events.filter(e => e.id !== row.id)].slice(0, 200);
        flashId = row.id;
        setTimeout(() => { if (flashId === row.id) flashId = null; }, 2400);
      });
      realtimeOk = true;
    } catch (e) {
      console.warn("[di-monitor] realtime subscribe failed", e);
      realtimeOk = false;
    }

    // gauge / card entry animation
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 1100);
      animProgress = 1 - Math.pow(1 - k, 3);
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    loading = false;
  });

  onDestroy(() => {
    if (nowTick)  clearInterval(nowTick);
    if (pollTick) clearInterval(pollTick);
    if (auditUnsub) { try { auditUnsub(); } catch {} }
  });

  // ───────── Helpers ─────────
  const DEPLOY_KEYWORDS = ["deploy", "build", "rsync", "restart", "release", "rollout", "pm2"];

  function isDeploymentRow(row: AuditRow): boolean {
    const a = (row.action || "").toLowerCase();
    const et = (row.entity_type || "").toLowerCase();
    if (et === "deployment" || et === "deploy") return true;
    return DEPLOY_KEYWORDS.some(k => a.includes(k));
  }

  // ───────── Data fetch ─────────
  async function refresh() {
    if (!hasClient()) return;
    try {
      // Two-pass: targeted deployment events + general system feed.
      // PostgREST `or=` filter — last 200 deployment-ish rows.
      const deployFilter = [
        "action.ilike.*deploy*",
        "action.ilike.*build*",
        "action.ilike.*rsync*",
        "action.ilike.*restart*",
        "action.ilike.*release*",
        "action.ilike.*pm2*",
        "entity_type.eq.deployment",
        "entity_type.eq.deploy",
      ].join(",");

      const { data, error } = await supabase()
        .from("audit_log")
        .select("id,action,entity_type,entity_id,entity_name,actor,details,created_at")
        .or(deployFilter)
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) throw error;

      events = (data ?? []) as AuditRow[];
      refreshedAt = Date.now();
      dbOk = true;
      lastError = null;
    } catch (e: any) {
      console.error("[di-monitor] refresh", e);
      dbOk = false;
      lastError = e?.message ?? String(e);
    }
  }

  // ───────── Derived ─────────
  const monthCutoff = $derived(() => {
    const d = new Date(now);
    return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  });

  const stats = $derived((() => {
    const cutoff = monthCutoff();
    const monthDeploys = events.filter(e => {
      const t = new Date(e.created_at).getTime();
      return t >= cutoff && classify(e.action).kind === "deploy";
    }).length;
    const last = events[0] ?? null;
    const lastActor = last?.actor ?? "—";
    const lastTime  = last?.created_at ?? null;

    // Uptime streak — find most recent error/fail row
    const lastErr = events.find(e => classify(e.action).kind === "error");
    let streakDays: number | null = null;
    if (lastErr) {
      streakDays = Math.max(0, Math.floor((now - new Date(lastErr.created_at).getTime()) / 86400_000));
    } else if (events.length > 0) {
      const oldest = events[events.length - 1];
      streakDays = Math.max(0, Math.floor((now - new Date(oldest.created_at).getTime()) / 86400_000));
    }

    return { monthDeploys, lastActor, lastTime, streakDays };
  })());

  // ───────── Classify action → badge ─────────
  type Badge = { label: string; kind: "deploy" | "build" | "restart" | "rsync" | "error" | "info"; color: string };
  function classify(action: string | null): Badge {
    const a = (action || "").toLowerCase();
    if (a.includes("error") || a.includes("fail")) return { label: "ERROR",   kind: "error",   color: "#f43f5e" };
    if (a.includes("rsync"))                       return { label: "RSYNC",   kind: "rsync",   color: "#22d3a5" };
    if (a.includes("build"))                       return { label: "BUILD",   kind: "build",   color: "#f59e0b" };
    if (a.includes("restart") || a.includes("pm2"))return { label: "RESTART", kind: "restart", color: "#8b5cf6" };
    if (a.includes("deploy") || a.includes("release") || a.includes("rollout"))
                                                   return { label: "DEPLOY",  kind: "deploy",  color: "#56bcec" };
    return { label: "INFO", kind: "info", color: "#64748b" };
  }

  // ───────── Formatters ─────────
  function fmtClock(): string {
    return new Date(now).toLocaleTimeString("en-GB", {
      timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  }
  function fmtTime(iso: string): string {
    return new Date(iso).toLocaleString("en-GB", {
      timeZone: "Europe/Zurich",
      day: "2-digit", month: "2-digit", year: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).replace(",", " ·");
  }
  function fmtRelative(iso: string | null): string {
    if (!iso) return "never";
    const diff = (now - new Date(iso).getTime()) / 1000;
    if (diff < 1)     return "just now";
    if (diff < 60)    return `${Math.floor(diff)}s ago`;
    if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }
  function freshnessPct(iso: string | null): number {
    if (!iso) return 0;
    const age = now - new Date(iso).getTime();
    const limit = 24 * 3600 * 1000; // 24h cool-off
    if (age >= limit) return 0;
    return Math.max(0, Math.min(100, Math.round((1 - age / limit) * 100)));
  }
  function freshnessColor(pct: number): string {
    if (pct >= 80) return "#22d3a5";
    if (pct >= 40) return "#56bcec";
    if (pct >= 15) return "#f59e0b";
    return "#64748b";
  }
  function payloadPreview(details: Record<string, any> | null): string {
    if (!details || typeof details !== "object") return "";
    try {
      const json = JSON.stringify(details);
      return json.length > 90 ? json.slice(0, 87) + "..." : json;
    } catch { return ""; }
  }
  function payloadFull(details: Record<string, any> | null): string {
    if (!details) return "—";
    try { return JSON.stringify(details, null, 2); } catch { return String(details); }
  }
</script>

<div class="page">
  <!-- Aurora background -->
  <div class="aurora" aria-hidden="true">
    <span class="blob a1"></span>
    <span class="blob a2"></span>
    <span class="blob a3"></span>
    <span class="grid"></span>
  </div>

  <!-- Header -->
  <header class="hero">
    <div class="hero-left">
      <a href="/" class="back-link">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Command
      </a>
      <div class="hero-title-block">
        <span class="hero-pulse" class:on={realtimeOk}></span>
        <span class="hero-eyebrow">DEPLOY LOG / OBSERVABILITY / CLAUDIO ONLY</span>
        <h1 class="hero-h1">NEX Deployment Log</h1>
        <span class="hero-sub">Every build, rsync, restart - end-to-end visibility into how the system ships.</span>
      </div>
    </div>
    <div class="hero-right">
      <div class="hero-clock">
        <span class="clock-label">ZURICH</span>
        <span class="clock-val">{fmtClock()}</span>
      </div>
      <button
        class="live-btn"
        class:on={liveEnabled}
        onclick={() => liveEnabled = !liveEnabled}
        aria-label={liveEnabled ? "Pause live feed" : "Resume live feed"}
        title={liveEnabled ? "Pause auto-refresh" : "Resume auto-refresh"}
      >
        <span class="live-dot" class:pulse={liveEnabled && realtimeOk}></span>
        {liveEnabled ? (realtimeOk ? "live" : "polling") : "paused"}
      </button>
      <button class="refresh-btn" onclick={refresh} aria-label="Refresh">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
          <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
        </svg>
        {fmtRelative(new Date(refreshedAt).toISOString())}
      </button>
    </div>
  </header>

  {#if loading}
    <div class="loading">
      <span class="spinner"></span>
      <span>Checking authorization...</span>
    </div>
  {:else if authorized}

    <!-- KPI row -->
    <section class="kpi-row">
      <div class="kpi-card" style="--d: 0ms;">
        <span class="kpi-icon" style="color:#56bcec;">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>
            <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>
            <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/>
            <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>
          </svg>
        </span>
        <span class="kpi-eyebrow">DEPLOYMENTS</span>
        <span class="kpi-val">{stats.monthDeploys}</span>
        <span class="kpi-sub">this month</span>
      </div>

      <div class="kpi-card" style="--d: 80ms;">
        <span class="kpi-icon" style="color:#8b5cf6;">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
        </span>
        <span class="kpi-eyebrow">LAST DEPLOY</span>
        <span class="kpi-val small">{stats.lastTime ? fmtRelative(stats.lastTime) : "never"}</span>
        <span class="kpi-sub">{stats.lastTime ? fmtTime(stats.lastTime).split(" · ")[0] : "no events"}</span>
      </div>

      <div class="kpi-card" style="--d: 160ms;">
        <span class="kpi-icon" style="color:#22d3a5;">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
        </span>
        <span class="kpi-eyebrow">LAST ACTOR</span>
        <span class="kpi-val small">{stats.lastActor || "—"}</span>
        <span class="kpi-sub">most recent push</span>
      </div>

      <div class="kpi-card" style="--d: 240ms;">
        <span class="kpi-icon" style="color:#f59e0b;">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
        </span>
        <span class="kpi-eyebrow">UPTIME STREAK</span>
        <span class="kpi-val">{stats.streakDays ?? 0}<i>d</i></span>
        <span class="kpi-sub">since last error</span>
      </div>
    </section>

    <!-- Timeline -->
    <section class="section">
      <div class="section-head">
        <span class="section-eyebrow">DEPLOYMENT TIMELINE</span>
        <span class="section-sep"><span class="sep-dot"></span></span>
        <span class="section-sub">{events.length} events / scoped to deploy + build + rsync + restart + error</span>
      </div>

      {#if !dbOk && lastError}
        <div class="empty err">
          <span class="empty-icon">!</span>
          <em>postgrest error: {lastError}</em>
        </div>
      {:else if events.length === 0}
        <div class="empty">
          <span class="empty-icon">~</span>
          <em>no deployment events recorded yet</em>
          <span class="empty-hint">audit_log will populate as deploys, builds, and pm2 restarts emit events</span>
        </div>
      {:else}
        <ol class="timeline">
          <span class="timeline-spine"></span>
          {#each events as e, i (e.id)}
            {@const b = classify(e.action)}
            {@const isOpen = expandedId === e.id}
            {@const isFlash = flashId === e.id}
            {@const fresh = freshnessPct(e.created_at)}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <li
              class="row kind-{b.kind}"
              class:flash={isFlash}
              class:open={isOpen}
              style="--d: {Math.min(i, 18) * 35}ms; --c: {b.color};"
              onclick={() => expandedId = isOpen ? null : e.id}
            >
              <span class="dot"></span>
              <div class="card">
                <div class="card-head">
                  <span class="time">{fmtTime(e.created_at)}</span>
                  <span class="badge" style="--bc: {b.color};">{b.label}</span>
                  <span class="rel">{fmtRelative(e.created_at)}</span>
                  <span class="spacer"></span>
                  <span class="actor">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                      <circle cx="12" cy="7" r="4"/>
                    </svg>
                    {e.actor || "system"}
                  </span>
                </div>
                <div class="action-line">
                  <code class="action">{e.action || "(no action)"}</code>
                  {#if e.entity_name || e.entity_id}
                    <span class="arrow">→</span>
                    <span class="entity">{e.entity_name || e.entity_id}</span>
                  {/if}
                </div>
                {#if !isOpen && payloadPreview(e.details)}
                  <div class="payload-preview">{payloadPreview(e.details)}</div>
                {/if}
                {#if isOpen}
                  <pre class="payload-full">{payloadFull(e.details)}</pre>
                {/if}
                <div class="freshness">
                  <div class="fresh-bar">
                    <span class="fresh-fill" style="width: {fresh * animProgress}%; background: {freshnessColor(fresh)};"></span>
                  </div>
                  <span class="fresh-label">{fresh}% fresh</span>
                </div>
              </div>
            </li>
          {/each}
        </ol>
      {/if}
    </section>

  {/if}
</div>

<style>
  :global(body) {
    background: #0a0f1a;
    color: #e2e8f0;
  }
  :global(::-webkit-scrollbar) { width: 8px; height: 8px; }
  :global(::-webkit-scrollbar-track) { background: transparent; }
  :global(::-webkit-scrollbar-thumb) {
    background: rgba(86,188,236,0.18);
    border-radius: 999px;
    border: 1px solid rgba(86,188,236,0.08);
  }
  :global(::-webkit-scrollbar-thumb:hover) { background: rgba(86,188,236,0.35); }

  .page {
    position: relative;
    min-height: 100vh;
    padding: 22px 28px 80px;
    max-width: 1440px;
    margin: 0 auto;
    font-family: Inter, sans-serif;
    color: #e2e8f0;
    z-index: 1;
  }

  /* ───────── Aurora ───────── */
  .aurora {
    position: fixed; inset: 0; z-index: 0;
    overflow: hidden; pointer-events: none;
    background:
      radial-gradient(ellipse at 18% 0%, rgba(86,188,236,0.08), transparent 50%),
      radial-gradient(ellipse at 82% 100%, rgba(139,92,246,0.08), transparent 55%),
      radial-gradient(ellipse at 50% 50%, rgba(34,211,165,0.025), transparent 60%),
      #0a0f1a;
  }
  .blob {
    position: absolute; border-radius: 50%; filter: blur(80px); opacity: 0.4;
  }
  .a1 { width: 560px; height: 560px; left: -120px; top: -180px;
        background: radial-gradient(circle, rgba(86,188,236,0.4), transparent 70%);
        animation: drift1 28s ease-in-out infinite alternate; }
  .a2 { width: 480px; height: 480px; right: -160px; top: 30%;
        background: radial-gradient(circle, rgba(139,92,246,0.35), transparent 70%);
        animation: drift2 34s ease-in-out infinite alternate; }
  .a3 { width: 420px; height: 420px; left: 42%; bottom: -200px;
        background: radial-gradient(circle, rgba(34,211,165,0.18), transparent 70%);
        animation: drift3 42s ease-in-out infinite alternate; }
  @keyframes drift1 { from { transform: translate(0,0) scale(1); } to { transform: translate(120px,80px) scale(1.15); } }
  @keyframes drift2 { from { transform: translate(0,0) scale(1); } to { transform: translate(-90px,60px) scale(1.1); } }
  @keyframes drift3 { from { transform: translate(0,0) scale(1); } to { transform: translate(60px,-100px) scale(1.12); } }
  .grid {
    position: absolute; inset: 0;
    background-image:
      linear-gradient(rgba(86,188,236,0.04) 1px, transparent 1px),
      linear-gradient(90deg, rgba(86,188,236,0.04) 1px, transparent 1px);
    background-size: 60px 60px;
    mask-image: radial-gradient(ellipse at center, black 30%, transparent 75%);
    opacity: 0.4;
  }

  /* ───────── Hero ───────── */
  .hero {
    display: flex; justify-content: space-between; align-items: flex-start;
    gap: 16px; margin-bottom: 26px; flex-wrap: wrap;
    padding: 22px 24px;
    border-radius: 22px;
    background:
      linear-gradient(135deg, rgba(86,188,236,0.08) 0%, rgba(139,92,246,0.06) 50%, rgba(34,211,165,0.04) 100%),
      rgba(8,12,20,0.55);
    border: 1px solid rgba(86,188,236,0.18);
    backdrop-filter: blur(24px) saturate(1.5);
    position: relative; overflow: hidden;
  }
  .hero::before {
    content: ""; position: absolute; inset: 0;
    background: linear-gradient(115deg, transparent 0%, rgba(86,188,236,0.08) 45%, transparent 80%);
    transform: translateX(-100%);
    animation: shimmer 7s ease-in-out infinite;
    pointer-events: none;
  }
  @keyframes shimmer {
    0% { transform: translateX(-120%); }
    45% { transform: translateX(120%); }
    100% { transform: translateX(120%); }
  }
  .hero-left { display: flex; flex-direction: column; gap: 10px; position: relative; z-index: 1; }
  .back-link {
    display: inline-flex; align-items: center; gap: 6px;
    font: 500 11px/1 'JetBrains Mono', monospace;
    color: rgba(86,188,236,0.78);
    text-decoration: none;
    transition: color 0.2s;
    letter-spacing: 0.08em; text-transform: uppercase;
  }
  .back-link:hover { color: #56bcec; }
  .hero-title-block { display: flex; flex-direction: column; gap: 5px; padding-left: 16px; position: relative; }
  .hero-pulse {
    position: absolute; left: 0; top: 6px;
    width: 10px; height: 10px; border-radius: 50%;
    background: #64748b;
    transition: background 0.3s;
  }
  .hero-pulse.on {
    background: #22d3a5;
    box-shadow: 0 0 0 0 rgba(34,211,165,0.55);
    animation: pulse-hero 1.8s ease-out infinite;
  }
  @keyframes pulse-hero {
    0%   { box-shadow: 0 0 0 0 rgba(34,211,165,0.55); }
    70%  { box-shadow: 0 0 0 14px rgba(34,211,165,0); }
    100% { box-shadow: 0 0 0 0 rgba(34,211,165,0); }
  }
  .hero-eyebrow {
    font: 600 10px/1 'JetBrains Mono', monospace;
    letter-spacing: 0.18em; color: #56bcec;
    text-transform: uppercase;
  }
  .hero-h1 {
    margin: 0; font: 700 28px/1.1 Inter, sans-serif;
    letter-spacing: -0.025em; color: #f8fafc;
  }
  .hero-sub {
    font: 400 12px/1.4 Inter, sans-serif; color: #94a3b8;
  }

  .hero-right { display: flex; align-items: center; gap: 12px; position: relative; z-index: 1; flex-wrap: wrap; }
  .hero-clock {
    display: flex; flex-direction: column; align-items: flex-end; gap: 2px;
    padding: 8px 14px;
    border-radius: 12px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(86,188,236,0.12);
  }
  .clock-label {
    font: 600 9px/1 'JetBrains Mono', monospace; letter-spacing: 0.18em;
    color: #64748b;
  }
  .clock-val {
    font: 700 16px/1 'JetBrains Mono', monospace; color: #56bcec;
    font-variant-numeric: tabular-nums;
    text-shadow: 0 0 12px rgba(86,188,236,0.4);
  }
  .live-btn, .refresh-btn {
    all: unset; cursor: pointer;
    display: inline-flex; align-items: center; gap: 7px;
    padding: 10px 14px; border-radius: 12px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(86,188,236,0.18);
    color: #94a3b8;
    font: 500 11px/1 'JetBrains Mono', monospace;
    transition: all 0.2s;
    letter-spacing: 0.04em;
  }
  .live-btn:hover, .refresh-btn:hover {
    background: rgba(86,188,236,0.10);
    border-color: rgba(86,188,236,0.45);
    color: #56bcec;
    transform: translateY(-1px);
    box-shadow: 0 6px 20px -8px rgba(86,188,236,0.4);
  }
  .live-btn.on {
    color: #22d3a5;
    border-color: rgba(34,211,165,0.4);
    background: rgba(34,211,165,0.06);
  }
  .live-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: #64748b;
  }
  .live-dot.pulse {
    background: #22d3a5;
    box-shadow: 0 0 0 0 rgba(34,211,165,0.55);
    animation: pulse-dot 1.8s ease-out infinite;
  }
  @keyframes pulse-dot {
    0%   { box-shadow: 0 0 0 0 rgba(34,211,165,0.55); }
    70%  { box-shadow: 0 0 0 10px rgba(34,211,165,0); }
    100% { box-shadow: 0 0 0 0 rgba(34,211,165,0); }
  }

  /* ───────── Loading ───────── */
  .loading {
    display: flex; align-items: center; gap: 12px;
    padding: 60px 24px; color: #64748b;
    font: 500 13px/1 Inter, sans-serif;
  }
  .spinner {
    width: 22px; height: 22px; border-radius: 50%;
    border: 2px solid rgba(86,188,236,0.18);
    border-top-color: #56bcec;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ───────── KPI Row ───────── */
  .kpi-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    margin-bottom: 28px;
  }
  .kpi-card {
    position: relative;
    padding: 18px 20px;
    border-radius: 16px;
    background:
      linear-gradient(135deg, rgba(86,188,236,0.05) 0%, rgba(139,92,246,0.04) 100%),
      rgba(255,255,255,0.025);
    border: 1px solid rgba(86,188,236,0.14);
    backdrop-filter: blur(18px);
    display: flex; flex-direction: column; gap: 6px;
    opacity: 0; transform: translateY(12px);
    animation: kpi-in 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    animation-delay: var(--d, 0ms);
    overflow: hidden;
  }
  .kpi-card::before {
    content: ""; position: absolute; top: 0; left: 0; right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(86,188,236,0.5), transparent);
  }
  @keyframes kpi-in {
    to { opacity: 1; transform: translateY(0); }
  }
  .kpi-icon {
    width: 28px; height: 28px;
    display: grid; place-items: center;
    margin-bottom: 4px;
    filter: drop-shadow(0 0 6px currentColor);
    opacity: 0.85;
  }
  .kpi-eyebrow {
    font: 700 9px/1 'JetBrains Mono', monospace;
    letter-spacing: 0.18em;
    color: #64748b;
    text-transform: uppercase;
  }
  .kpi-val {
    font: 700 32px/1 'JetBrains Mono', monospace;
    color: #f8fafc;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.015em;
  }
  .kpi-val.small {
    font-size: 18px;
    line-height: 1.2;
  }
  .kpi-val i {
    font-style: normal;
    font-size: 14px;
    color: #56bcec;
    margin-left: 3px;
    font-weight: 500;
  }
  .kpi-sub {
    font: 400 11px/1.3 Inter, sans-serif;
    color: #94a3b8;
  }

  /* ───────── Section ───────── */
  .section { margin-bottom: 24px; }
  .section-head {
    display: flex; align-items: center; gap: 14px;
    margin-bottom: 16px;
    padding: 0 4px;
  }
  .section-eyebrow {
    font: 700 10px/1 'JetBrains Mono', monospace;
    letter-spacing: 0.18em; color: #56bcec;
    text-transform: uppercase;
    white-space: nowrap;
  }
  .section-sep {
    flex: 1; height: 1px;
    background: linear-gradient(90deg, rgba(86,188,236,0.4), rgba(86,188,236,0.04));
    position: relative;
  }
  .sep-dot {
    position: absolute; top: -2px; left: 0;
    width: 5px; height: 5px; border-radius: 50%;
    background: #56bcec;
    box-shadow: 0 0 8px rgba(86,188,236,0.7);
    animation: travel 5s ease-in-out infinite;
  }
  @keyframes travel {
    0%, 100% { left: 0; }
    50%      { left: calc(100% - 5px); }
  }
  .section-sub {
    font: 400 11px/1 Inter, sans-serif; color: #64748b;
    white-space: nowrap;
  }

  /* ───────── Empty / err ───────── */
  .empty {
    display: flex; flex-direction: column; align-items: center; gap: 8px;
    padding: 60px 24px;
    border-radius: 16px;
    background: rgba(255,255,255,0.02);
    border: 1px dashed rgba(86,188,236,0.18);
    color: #64748b;
    text-align: center;
  }
  .empty.err {
    border-color: rgba(244,63,94,0.3);
    color: #fda4af;
  }
  .empty-icon {
    font: 700 28px/1 'JetBrains Mono', monospace;
    color: #56bcec;
    opacity: 0.5;
  }
  .empty em {
    font-style: normal;
    font: 500 13px/1.3 Inter, sans-serif;
  }
  .empty-hint {
    font: 400 11px/1.4 Inter, sans-serif;
    color: #475569;
    max-width: 420px;
  }

  /* ───────── Timeline ───────── */
  .timeline {
    list-style: none;
    margin: 0; padding: 0 0 0 22px;
    position: relative;
  }
  .timeline-spine {
    position: absolute;
    left: 7px; top: 8px; bottom: 8px;
    width: 1px;
    background: linear-gradient(180deg,
      rgba(86,188,236,0.4) 0%,
      rgba(139,92,246,0.25) 60%,
      rgba(86,188,236,0.05) 100%);
  }

  .row {
    position: relative;
    margin-bottom: 12px;
    cursor: pointer;
    opacity: 0; transform: translateX(-8px);
    animation: row-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    animation-delay: var(--d, 0ms);
  }
  @keyframes row-in {
    to { opacity: 1; transform: translateX(0); }
  }
  .dot {
    position: absolute;
    left: -22px; top: 18px;
    width: 11px; height: 11px;
    border-radius: 50%;
    background: var(--c, #56bcec);
    box-shadow: 0 0 0 3px rgba(10,15,26,0.95), 0 0 12px var(--c, #56bcec);
    transition: transform 0.25s, box-shadow 0.25s;
  }
  .row:hover .dot {
    transform: scale(1.3);
    box-shadow: 0 0 0 3px rgba(10,15,26,0.95), 0 0 18px var(--c, #56bcec);
  }

  .card {
    padding: 14px 16px;
    border-radius: 14px;
    background: rgba(255,255,255,0.025);
    border: 1px solid rgba(255,255,255,0.06);
    transition: border-color 0.25s, background 0.25s, transform 0.25s;
    position: relative;
    overflow: hidden;
  }
  .card::before {
    content: "";
    position: absolute;
    left: 0; top: 0; bottom: 0;
    width: 2px;
    background: var(--c, #56bcec);
    opacity: 0.7;
  }
  .row:hover .card {
    background: rgba(255,255,255,0.04);
    border-color: rgba(86,188,236,0.25);
    transform: translateX(2px);
  }
  .row.open .card {
    background: rgba(86,188,236,0.04);
    border-color: rgba(86,188,236,0.4);
  }
  .row.flash .card {
    animation: flash 2.4s ease-out;
  }
  @keyframes flash {
    0%   { box-shadow: 0 0 0 0 rgba(86,188,236,0.6), inset 0 0 0 1px rgba(86,188,236,0.6); background: rgba(86,188,236,0.10); }
    50%  { box-shadow: 0 0 0 6px rgba(86,188,236,0), inset 0 0 0 1px rgba(86,188,236,0.3); }
    100% { box-shadow: 0 0 0 0 rgba(86,188,236,0); background: rgba(255,255,255,0.025); }
  }

  .card-head {
    display: flex; align-items: center; gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 8px;
  }
  .time {
    font: 500 11px/1 'JetBrains Mono', monospace;
    color: #cbd5e1;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.02em;
  }
  .badge {
    display: inline-flex; align-items: center;
    padding: 4px 8px;
    border-radius: 6px;
    font: 700 9px/1 'JetBrains Mono', monospace;
    letter-spacing: 0.14em;
    color: var(--bc);
    background: color-mix(in srgb, var(--bc) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--bc) 35%, transparent);
  }
  .rel {
    font: 400 10px/1 'JetBrains Mono', monospace;
    color: #64748b;
  }
  .spacer { flex: 1; }
  .actor {
    display: inline-flex; align-items: center; gap: 5px;
    font: 500 11px/1 Inter, sans-serif;
    color: #94a3b8;
  }
  .actor svg { opacity: 0.7; }

  .action-line {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    margin-bottom: 6px;
  }
  .action {
    font: 600 13px/1.3 'JetBrains Mono', monospace;
    color: #e2e8f0;
    background: rgba(86,188,236,0.06);
    padding: 3px 8px;
    border-radius: 6px;
    border: 1px solid rgba(86,188,236,0.12);
  }
  .arrow {
    color: #64748b;
    font: 500 13px/1 Inter, sans-serif;
  }
  .entity {
    font: 500 13px/1.3 Inter, sans-serif;
    color: #cbd5e1;
  }

  .payload-preview {
    font: 400 11px/1.4 'JetBrains Mono', monospace;
    color: #64748b;
    margin-top: 4px;
    padding: 6px 10px;
    background: rgba(255,255,255,0.02);
    border-radius: 6px;
    border-left: 2px solid rgba(86,188,236,0.2);
    word-break: break-word;
  }
  .payload-full {
    font: 400 11px/1.45 'JetBrains Mono', monospace;
    color: #cbd5e1;
    margin: 8px 0 0;
    padding: 10px 12px;
    background: rgba(8,12,20,0.6);
    border-radius: 8px;
    border: 1px solid rgba(86,188,236,0.16);
    max-height: 320px;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .freshness {
    display: flex; align-items: center; gap: 8px;
    margin-top: 10px;
  }
  .fresh-bar {
    flex: 1;
    height: 3px;
    background: rgba(255,255,255,0.04);
    border-radius: 2px;
    overflow: hidden;
  }
  .fresh-fill {
    display: block;
    height: 100%;
    border-radius: 2px;
    transition: width 0.8s cubic-bezier(0.16, 1, 0.3, 1), background 0.3s;
    box-shadow: 0 0 6px currentColor;
  }
  .fresh-label {
    font: 500 9px/1 'JetBrains Mono', monospace;
    color: #64748b;
    letter-spacing: 0.1em;
    white-space: nowrap;
  }

  /* ───────── Responsive ───────── */
  @media (max-width: 960px) {
    .kpi-row { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 680px) {
    .page { padding: 16px 14px 60px; }
    .hero { padding: 16px 18px; }
    .hero-h1 { font-size: 22px; }
    .kpi-row { grid-template-columns: 1fr; gap: 12px; }
    .kpi-val { font-size: 26px; }
    .section-sub { display: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    .blob, .grid, .hero::before, .sep-dot, .hero-pulse.on, .live-dot.pulse { animation: none; }
    .row, .kpi-card { animation-duration: 0.01s; opacity: 1; transform: none; }
  }
</style>

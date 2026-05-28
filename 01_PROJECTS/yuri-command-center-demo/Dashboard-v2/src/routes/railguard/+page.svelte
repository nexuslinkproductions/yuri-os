<script lang="ts">
  import { onMount, onDestroy } from "svelte";

  // ── Types ─────────────────────────────────────────────────────────────────
  type RailKey = "language" | "role-scope" | "email-gate" | "retrieval-confidence" | "output-sanitize" | "infra" | "passed";
  type ActionKey = "block" | "hold" | "flag" | "pass";

  type GuardrailEvent = {
    ts: string;
    rail: RailKey;
    action: ActionKey;
    channel: "telegram" | "email" | "nexogram" | string;
    recipientRole: "ceo" | "fanny" | "external" | string;
    reason: string | null;
  };

  type Stats = {
    totalToday: number;
    blocksToday: number;
    holdsToday: number;
    passesToday: number;
    flagsToday: number;
    blocksByRail: Record<string, number>;
    holdsPending: number;
    passRate24h: number;
    rails: string[];
  };

  // The 5 protection rails as nodes (left to right). "passed" is a synthetic
  // terminal label so the live event feed can show successful traversals; it
  // never appears on the map itself.
  const RAILS: { key: RailKey; label: string; short: string; desc: string }[] = [
    { key: "language",             label: "Language",   short: "LANG",  desc: "Blocks German output to the CEO" },
    { key: "role-scope",           label: "Role Scope", short: "SCOPE", desc: "Hides finance + offers from Fanny" },
    { key: "email-gate",           label: "Email Gate", short: "MAIL",  desc: "Holds outbound mail for confirmation" },
    { key: "retrieval-confidence", label: "Retrieval",  short: "RAG",   desc: "Flags weak RAG-grounded claims" },
    { key: "output-sanitize",      label: "Sanitize",   short: "CLEAN", desc: "Strips secrets + control chars" },
    { key: "infra",                label: "Infra",      short: "INFRA", desc: "VPS security events (SSH, disk, PM2)" },
  ];

  // ── State ─────────────────────────────────────────────────────────────────
  let events       = $state<GuardrailEvent[]>([]);
  let stats        = $state<Stats | null>(null);
  let loading      = $state(true);
  let lastUpdated  = $state(Date.now());
  let now          = $state(Date.now());
  let liveStatus   = $state<"online" | "stale" | "offline">("online");

  // Per-rail mini history (last 20 events) for sparklines
  let railHistory  = $state<Record<RailKey, GuardrailEvent[]>>({
    "language":            [],
    "role-scope":          [],
    "email-gate":          [],
    "retrieval-confidence":[],
    "output-sanitize":     [],
    "infra":               [],
    "passed":              [],
  });
  // Per-rail last action so node colour reflects most recent activity
  let railLastAction = $state<Record<RailKey, { action: ActionKey; at: number } | null>>({
    "language":            null,
    "role-scope":          null,
    "email-gate":          null,
    "retrieval-confidence":null,
    "output-sanitize":     null,
    "infra":               null,
    "passed":              null,
  });

  // Sparkline series for "events today" KPI (last 24 buckets)
  let sparkSeries  = $state<number[]>(Array(24).fill(0));

  // Animated particles flowing through the chain
  type Particle = {
    id: number;
    x: number;          // 0..100 along the chain
    speed: number;      // % per frame at 60fps
    state: "moving" | "blocked" | "held" | "passed";
    blockedAt?: number; // rail index where it stopped
    color: string;
    fade: number;       // 1 → 0 after stop, particle removed at 0
  };
  let particles    = $state<Particle[]>([]);
  let nextParticleId = 1;
  let lastSpawnedEventTs: string | null = null;

  // ── Helpers ───────────────────────────────────────────────────────────────
  function colorForAction(action: ActionKey): string {
    if (action === "block") return "#f72585";
    if (action === "hold")  return "#f5b850";
    if (action === "flag")  return "#56bcec";
    return "#46a758"; // pass
  }

  function actionLabel(action: ActionKey): string {
    return action.toUpperCase();
  }

  function railIndex(key: RailKey): number {
    return RAILS.findIndex(r => r.key === key);
  }

  function relativeTime(iso: string): string {
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return "—";
    const diff = Math.max(0, Math.floor((now - t) / 1000));
    if (diff < 60)    return `${diff}s ago`;
    if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  function timeOfDay(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  // ── Particle engine ───────────────────────────────────────────────────────
  // Spawn a particle that represents a single guardrail event. Particles flow
  // left to right; if the event blocked, the particle stops at that rail and
  // flashes the rail node. If held, it stops at email-gate and pulses yellow.
  function spawnFromEvent(e: GuardrailEvent) {
    const idx = railIndex(e.rail);
    let p: Particle;
    if (e.action === "block" && idx >= 0) {
      p = {
        id: nextParticleId++,
        x: 0,
        speed: 1.2,
        state: "moving",
        blockedAt: idx,
        color: "#f72585",
        fade: 1,
      };
    } else if (e.action === "hold") {
      const holdIdx = railIndex("email-gate");
      p = {
        id: nextParticleId++,
        x: 0,
        speed: 1.2,
        state: "moving",
        blockedAt: holdIdx,
        color: "#f5b850",
        fade: 1,
      };
    } else if (e.action === "flag") {
      p = {
        id: nextParticleId++,
        x: 0,
        speed: 1.0,
        state: "moving",
        color: "#56bcec",
        fade: 1,
      };
    } else {
      p = {
        id: nextParticleId++,
        x: 0,
        speed: 1.4,
        state: "moving",
        color: "#46a758",
        fade: 1,
      };
    }
    // FIFO cap at 10
    particles = [...particles, p].slice(-10);
  }

  function spawnDemo() {
    // Demo particle: rotates through all 4 outcomes so the map shows life
    const palette: { action: ActionKey; rail: RailKey }[] = [
      { action: "pass",  rail: "passed" },
      { action: "block", rail: "language" },
      { action: "pass",  rail: "passed" },
      { action: "hold",  rail: "email-gate" },
      { action: "pass",  rail: "passed" },
      { action: "flag",  rail: "retrieval-confidence" },
      { action: "block", rail: "output-sanitize" },
    ];
    const pick = palette[Math.floor(Math.random() * palette.length)];
    spawnFromEvent({
      ts: new Date().toISOString(),
      rail: pick.rail,
      action: pick.action,
      channel: "demo",
      recipientRole: "ceo",
      reason: null,
    });
  }

  let rafId: number | null = null;
  let lastFrame = 0;
  function animate(t: number) {
    if (!lastFrame) lastFrame = t;
    const dt = Math.min(64, t - lastFrame); // clamp huge gaps when tab regains focus
    lastFrame = t;
    const k = dt / 16.67; // normalize to 60fps step

    let changed = false;
    const next: Particle[] = [];
    for (const p of particles) {
      if (p.state === "moving") {
        // Target X for this particle
        let limit = 100;
        if (p.blockedAt !== undefined) {
          // Rail nodes are spaced evenly between 8% and 92%
          const pos = 8 + (p.blockedAt / (RAILS.length - 1)) * 84;
          limit = pos;
        }
        const newX = p.x + p.speed * k;
        if (newX >= limit) {
          // Reached its stopping point
          if (p.blockedAt !== undefined) {
            next.push({ ...p, x: limit, state: p.color === "#f5b850" ? "held" : "blocked", fade: 1 });
          } else {
            // Pass: exit right side
            if (newX >= 100) {
              // particle exits, drop it
              continue;
            }
            next.push({ ...p, x: newX });
          }
          changed = true;
        } else {
          next.push({ ...p, x: newX });
          changed = true;
        }
      } else {
        // Blocked/held: fade out over ~1.4s
        const newFade = p.fade - 0.012 * k;
        if (newFade <= 0) continue;
        next.push({ ...p, fade: newFade });
        changed = true;
      }
    }
    if (changed) particles = next;
    rafId = requestAnimationFrame(animate);
  }

  // ── Data ──────────────────────────────────────────────────────────────────
  async function fetchEvents() {
    try {
      const r = await fetch("/api/railguard/events?limit=200", { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      const fresh: GuardrailEvent[] = (j.events || []) as GuardrailEvent[];

      // Diff: spawn particles for events newer than the last we've seen
      if (lastSpawnedEventTs === null) {
        // First load — don't spawn the whole history at once; show last 3
        const seed = fresh.slice(0, 3).reverse();
        for (const e of seed) spawnFromEvent(e);
        if (fresh.length) lastSpawnedEventTs = fresh[0].ts;
      } else {
        const idx = fresh.findIndex(e => e.ts === lastSpawnedEventTs);
        const newOnes = idx === -1 ? fresh : fresh.slice(0, idx);
        // newest is first in `fresh`; spawn in chronological order for visual flow
        for (const e of [...newOnes].reverse()) spawnFromEvent(e);
        if (fresh.length) lastSpawnedEventTs = fresh[0].ts;
      }

      events = fresh;
      lastUpdated = Date.now();
      liveStatus = "online";

      // Rebuild per-rail history + last action
      const hist: Record<RailKey, GuardrailEvent[]> = {
        "language": [], "role-scope": [], "email-gate": [],
        "retrieval-confidence": [], "output-sanitize": [], "infra": [], "passed": [],
      };
      const last: Record<RailKey, { action: ActionKey; at: number } | null> = {
        "language": null, "role-scope": null, "email-gate": null,
        "retrieval-confidence": null, "output-sanitize": null, "infra": null, "passed": null,
      };
      // Iterate from newest to oldest, fill last + take first 20 per rail
      for (const e of fresh) {
        if (hist[e.rail] && hist[e.rail].length < 20) hist[e.rail].push(e);
        if (last[e.rail] === null) last[e.rail] = { action: e.action, at: Date.parse(e.ts) };
      }
      railHistory = hist;
      railLastAction = last;

      // 24-bucket sparkline (hourly count for today)
      const buckets = Array(24).fill(0);
      const todayStr = new Date().toISOString().slice(0, 10);
      for (const e of fresh) {
        if (typeof e.ts === "string" && e.ts.startsWith(todayStr)) {
          const hr = new Date(e.ts).getHours();
          if (hr >= 0 && hr < 24) buckets[hr]++;
        }
      }
      sparkSeries = buckets;
    } catch (err) {
      console.warn("[railguard] events fetch failed", err);
      liveStatus = lastUpdated && Date.now() - lastUpdated < 60000 ? "stale" : "offline";
    } finally {
      loading = false;
    }
  }

  async function fetchStats() {
    try {
      const r = await fetch("/api/railguard/stats", { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      if (j.stats) stats = j.stats as Stats;
    } catch (err) {
      console.warn("[railguard] stats fetch failed", err);
    }
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  let eventTick: ReturnType<typeof setInterval> | null = null;
  let statsTick: ReturnType<typeof setInterval> | null = null;
  let demoTick:  ReturnType<typeof setInterval> | null = null;
  let nowTick:   ReturnType<typeof setInterval> | null = null;

  onMount(() => {
    fetchEvents();
    fetchStats();
    eventTick = setInterval(fetchEvents, 3000);
    statsTick = setInterval(fetchStats,  10000);
    nowTick   = setInterval(() => { now = Date.now(); }, 1000);
    // Demo particles when no real traffic — visible heartbeat on the map
    demoTick = setInterval(() => {
      if (events.length === 0 || (Date.now() - (events[0] ? Date.parse(events[0].ts) : 0)) > 30000) {
        spawnDemo();
      }
    }, 4000);
    rafId = requestAnimationFrame(animate);
  });

  onDestroy(() => {
    if (eventTick) clearInterval(eventTick);
    if (statsTick) clearInterval(statsTick);
    if (demoTick)  clearInterval(demoTick);
    if (nowTick)   clearInterval(nowTick);
    if (rafId)     cancelAnimationFrame(rafId);
  });

  // ── Derived for UI ────────────────────────────────────────────────────────
  // Rail node CSS state: green=last passed, red=last blocked, yellow=last held,
  // blue=last flagged, grey=idle. Active flash piggybacks on a recent particle.
  function railNodeState(key: RailKey): { color: string; flash: boolean } {
    const last = railLastAction[key];
    if (!last) return { color: "#3a4253", flash: false };
    const recent = Date.now() - last.at < 8000;
    return { color: colorForAction(last.action), flash: recent };
  }

  // Whether any moving particle is currently between rails i and i+1 (drives line dashes)
  function segmentActive(i: number): boolean {
    const a = 8 + (i / (RAILS.length - 1)) * 84;
    const b = 8 + ((i + 1) / (RAILS.length - 1)) * 84;
    return particles.some(p => p.state === "moving" && p.x >= a && p.x <= b);
  }

  // Sparkline path
  function sparkPath(series: number[], width: number, height: number): string {
    if (!series.length) return "";
    const max = Math.max(1, ...series);
    const stepX = width / (series.length - 1);
    let d = "";
    for (let i = 0; i < series.length; i++) {
      const x = i * stepX;
      const y = height - (series[i] / max) * height;
      d += (i === 0 ? "M" : "L") + x.toFixed(2) + "," + y.toFixed(2) + " ";
    }
    return d.trim();
  }

  // Per-rail mini bar chart of last 20 events (newest right)
  function railBarColor(action: ActionKey): string {
    return colorForAction(action);
  }
</script>

<svelte:head>
  <title>RailGuard · NEX</title>
</svelte:head>

<div class="rg-shell">
  <!-- Header bar ────────────────────────────────────────────────────────── -->
  <header class="rg-header">
    <div class="rg-title">
      <span class="rg-shield" aria-hidden="true">
        <svg width="22" height="26" viewBox="0 0 22 26" fill="none" stroke="#56bcec" stroke-width="1.6" stroke-linejoin="round">
          <path d="M11 1.5 L20.5 5 V12.2 C20.5 18.3 16.5 22.8 11 24.5 C5.5 22.8 1.5 18.3 1.5 12.2 V5 Z"/>
          <path d="M6.5 12.5 L9.6 15.6 L15.5 9.7" stroke="#56bcec" stroke-width="1.8"/>
        </svg>
      </span>
      <div class="rg-title-text">
        <h1>RailGuard</h1>
        <span class="rg-subtitle">NEX Guardrails · Live SOC</span>
      </div>
    </div>
    <div class="rg-meta">
      <span class="rg-live rg-live--{liveStatus}">
        <span class="rg-dot"></span>
        {liveStatus === "online" ? "LIVE" : liveStatus === "stale" ? "STALE" : "OFFLINE"}
      </span>
      <span class="rg-updated">Updated {relativeTime(new Date(lastUpdated).toISOString())}</span>
    </div>
  </header>

  <!-- Rail Network Map ──────────────────────────────────────────────────── -->
  <section class="rg-map-card">
    <div class="rg-map-head">
      <div class="rg-map-title">Rail Network</div>
      <div class="rg-map-legend">
        <span><i style="background:#46a758"></i>pass</span>
        <span><i style="background:#56bcec"></i>flag</span>
        <span><i style="background:#f5b850"></i>hold</span>
        <span><i style="background:#f72585"></i>block</span>
      </div>
    </div>
    <div class="rg-map">
      <svg viewBox="0 0 100 50" preserveAspectRatio="none" class="rg-map-svg">
        <!-- Connecting line + segments -->
        {#each RAILS as _r, i (i)}
          {#if i < RAILS.length - 1}
            {@const a = 8 + (i / (RAILS.length - 1)) * 84}
            {@const b = 8 + ((i + 1) / (RAILS.length - 1)) * 84}
            <line
              class="rg-link"
              class:rg-link--active={segmentActive(i)}
              x1={a} y1="25" x2={b} y2="25"
            />
          {/if}
        {/each}

        <!-- Particles -->
        {#each particles as p (p.id)}
          <circle
            cx={p.x}
            cy="25"
            r="0.9"
            fill={p.color}
            opacity={p.fade}
            class="rg-particle"
            class:rg-particle--blocked={p.state === "blocked"}
            class:rg-particle--held={p.state === "held"}
          />
        {/each}

      </svg>

      <!-- HTML node circles (not inside SVG to stay circular regardless of aspect ratio) -->
      <div class="rg-nodes-overlay">
        {#each RAILS as r, i (r.key)}
          {@const xPct = 8 + (i / (RAILS.length - 1)) * 84}
          {@const st = railNodeState(r.key)}
          <div
            class="rg-node-html"
            class:rg-node-html--flash={st.flash}
            style="left:{xPct}%;--nc:{st.color};--delay:{i * 0.5}s"
          >
            <div class="rg-node-ping"></div>
            <div class="rg-node-outer"></div>
            <div class="rg-node-mid"></div>
            <div class="rg-node-inner"></div>
          </div>
        {/each}
      </div>

      <!-- Labels under nodes -->
      <div class="rg-map-labels">
        {#each RAILS as r, i (r.key)}
          {@const st = railNodeState(r.key)}
          <div
            class="rg-map-label"
            style="left:{8 + (i / (RAILS.length - 1)) * 84}%"
          >
            <div class="rg-map-label-name" style="color:{st.color}">{r.short}</div>
            <div class="rg-map-label-desc">{r.label}</div>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <!-- Stats row ─────────────────────────────────────────────────────────── -->
  <section class="rg-stats">
    <article class="rg-stat">
      <div class="rg-stat-label">Events today</div>
      <div class="rg-stat-value">{stats?.totalToday ?? "—"}</div>
      <svg class="rg-spark" viewBox="0 0 100 24" preserveAspectRatio="none">
        <path d={sparkPath(sparkSeries, 100, 24)} fill="none" stroke="#56bcec" stroke-width="1.2"/>
      </svg>
    </article>

    <article class="rg-stat rg-stat--alert">
      <div class="rg-stat-label">Blocks today</div>
      <div class="rg-stat-value" style="color:#f72585">{stats?.blocksToday ?? "—"}</div>
      <div class="rg-stat-sub">{stats ? Object.values(stats.blocksByRail).reduce((a,b)=>a+b,0) : 0} across {RAILS.length} rails</div>
    </article>

    <article class="rg-stat rg-stat--warn">
      <div class="rg-stat-label">Holds pending</div>
      <div class="rg-stat-value" style="color:#f5b850">{stats?.holdsPending ?? "—"}</div>
      <div class="rg-stat-sub">awaiting confirmation</div>
    </article>

    <article class="rg-stat rg-stat--ok">
      <div class="rg-stat-label">Pass rate · 24h</div>
      <div class="rg-stat-value" style="color:#46a758">{stats ? stats.passRate24h.toFixed(1) : "—"}<span class="rg-stat-pct">%</span></div>
      <div class="rg-stat-sub">{stats?.passesToday ?? 0} passes today</div>
    </article>
  </section>

  <!-- Per-rail status grid ─────────────────────────────────────────────── -->
  <section class="rg-rails-grid">
    {#each RAILS as r (r.key)}
      {@const hist = railHistory[r.key]}
      {@const last = railLastAction[r.key]}
      {@const todayCount = stats ? (stats.blocksByRail[r.key] ?? 0) : 0}
      <article class="rg-rail-card">
        <header class="rg-rail-head">
          <div class="rg-rail-name">{r.label}</div>
          <div class="rg-rail-badge" style="border-color:{last ? colorForAction(last.action) : '#3a4253'};color:{last ? colorForAction(last.action) : '#7d8493'}">
            {last ? actionLabel(last.action) : "IDLE"}
          </div>
        </header>
        <p class="rg-rail-desc">{r.desc}</p>
        <div class="rg-rail-meta">
          <span class="rg-rail-meta-k">Last</span>
          <span class="rg-rail-meta-v">{last ? relativeTime(new Date(last.at).toISOString()) : "—"}</span>
          <span class="rg-rail-meta-k">Blocks today</span>
          <span class="rg-rail-meta-v">{todayCount}</span>
        </div>
        <div class="rg-rail-bars" aria-label="Last 20 events">
          {#each Array(20) as _x, i (i)}
            {@const ev = hist[hist.length - 1 - i]}
            <span
              class="rg-rail-bar"
              style="background:{ev ? railBarColor(ev.action) : 'rgba(255,255,255,0.06)'}"
              title={ev ? `${ev.action.toUpperCase()} · ${timeOfDay(ev.ts)}` : "no event"}
            ></span>
          {/each}
        </div>
      </article>
    {/each}
  </section>

  <!-- Live event feed ──────────────────────────────────────────────────── -->
  <section class="rg-feed">
    <header class="rg-feed-head">
      <h2>Live Event Feed</h2>
      <span class="rg-feed-count">{events.length} events</span>
    </header>
    <div class="rg-feed-table">
      <div class="rg-feed-row rg-feed-row--head">
        <div>Time</div>
        <div>Rail</div>
        <div>Action</div>
        <div>Channel</div>
        <div>Recipient</div>
        <div>Reason</div>
      </div>
      {#if loading && events.length === 0}
        <div class="rg-feed-empty">Connecting to /api/railguard/events…</div>
      {:else if events.length === 0}
        <div class="rg-feed-empty">No events yet — the rail network is idle. Demo particles are flowing every ~4s above.</div>
      {:else}
        {#each events.slice(0, 80) as e (e.ts + e.rail + e.action)}
          <div class="rg-feed-row rg-feed-row--{e.action}">
            <div class="rg-feed-time">{timeOfDay(e.ts)}</div>
            <div class="rg-feed-rail">{e.rail}</div>
            <div>
              <span class="rg-action-pill" style="background:{colorForAction(e.action)}1a;color:{colorForAction(e.action)};border-color:{colorForAction(e.action)}55">
                {actionLabel(e.action)}
              </span>
            </div>
            <div>{e.channel}</div>
            <div>{e.recipientRole}</div>
            <div class="rg-feed-reason">{e.reason ?? "—"}</div>
          </div>
        {/each}
      {/if}
    </div>
  </section>
</div>

<style>
  :global(body:has(.rg-shell)) {
    background: #0a0e1a;
  }

  .rg-shell {
    min-height: 100vh;
    padding: 24px 28px 64px;
    color: #e4e9f2;
    font-family: Inter, system-ui, sans-serif;
    background:
      radial-gradient(900px 600px at 12% -10%, rgba(86,188,236,0.10), transparent 60%),
      radial-gradient(700px 500px at 92% 8%,  rgba(124,58,237,0.08), transparent 60%),
      #0a0e1a;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  /* Header ─────────────────────────────────────────────────────────────── */
  .rg-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 4px 12px;
    border-bottom: 1px solid rgba(86,188,236,0.14);
  }
  .rg-title { display: flex; align-items: center; gap: 14px; }
  .rg-shield {
    width: 44px; height: 44px;
    display: grid; place-items: center;
    border-radius: 12px;
    background: rgba(86,188,236,0.08);
    border: 1px solid rgba(86,188,236,0.28);
    box-shadow: 0 4px 18px rgba(86,188,236,0.18), inset 0 1px 0 rgba(255,255,255,0.06);
  }
  .rg-title-text h1 {
    margin: 0;
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: #f4f7fb;
  }
  .rg-subtitle {
    font-size: 11px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: #7d8493;
    font-weight: 600;
    font-family: 'JetBrains Mono', monospace;
  }
  .rg-meta { display: flex; align-items: center; gap: 14px; }
  .rg-live {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    border-radius: 999px;
    font-size: 11px;
    letter-spacing: 0.18em;
    font-weight: 700;
    border: 1px solid rgba(70,167,88,0.5);
    background: rgba(70,167,88,0.10);
    color: #46a758;
  }
  .rg-live--stale   { border-color: rgba(245,184,80,0.5); background: rgba(245,184,80,0.08); color: #f5b850; }
  .rg-live--offline { border-color: rgba(247,37,133,0.5); background: rgba(247,37,133,0.08); color: #f72585; }
  .rg-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: currentColor;
    box-shadow: 0 0 0 0 currentColor;
    animation: rg-pulse 1.6s infinite;
  }
  .rg-updated { font-size: 12px; color: #8a92a3; }

  /* Map card ──────────────────────────────────────────────────────────── */
  .rg-map-card {
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(86,188,236,0.18);
    border-radius: 16px;
    padding: 18px 18px 24px;
    -webkit-backdrop-filter: blur(12px);
    backdrop-filter: blur(12px);
    box-shadow: 0 6px 30px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04);
  }
  .rg-map-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
  }
  .rg-map-title {
    font-size: 11px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: #8a92a3;
    font-weight: 700;
  }
  .rg-map-legend {
    display: flex;
    gap: 14px;
    font-size: 11px;
    color: #8a92a3;
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }
  .rg-map-legend span { display: inline-flex; align-items: center; gap: 6px; }
  .rg-map-legend i {
    width: 8px; height: 8px; border-radius: 50%;
    display: inline-block;
  }

  .rg-map {
    position: relative;
    height: 280px;
    border-radius: 12px;
    background:
      radial-gradient(420px 220px at 50% 50%, rgba(86,188,236,0.07), transparent 70%),
      #060912;
    border: 1px solid rgba(86,188,236,0.10);
    overflow: hidden;
  }
  .rg-map-svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: calc(100% - 60px);
  }
  .rg-link {
    stroke: rgba(86,188,236,0.20);
    stroke-width: 0.25;
    stroke-dasharray: 1 1;
  }
  .rg-link--active {
    stroke: rgba(86,188,236,0.7);
    stroke-width: 0.35;
    stroke-dasharray: 2 1;
    animation: rg-dash 1.2s linear infinite;
  }
  /* ── HTML node circles ──────────────────────────────────────────────────── */
  .rg-nodes-overlay {
    position: absolute;
    left: 0; right: 0;
    top: 0; bottom: 60px;
    pointer-events: none;
  }
  .rg-node-html {
    position: absolute;
    top: 50%;
    width: 56px; height: 56px;
    transform: translate(-50%, -50%);
    --nc: #56bcec;
  }
  .rg-node-inner {
    position: absolute;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    width: 10px; height: 10px;
    border-radius: 50%;
    background: var(--nc);
    box-shadow: 0 0 10px var(--nc), 0 0 24px color-mix(in srgb, var(--nc) 50%, transparent);
    transition: background 0.4s, box-shadow 0.4s;
  }
  .rg-node-mid {
    position: absolute;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    width: 28px; height: 28px;
    border-radius: 50%;
    border: 1.5px solid color-mix(in srgb, var(--nc) 45%, transparent);
    background: color-mix(in srgb, var(--nc) 7%, transparent);
    transition: border-color 0.4s;
  }
  .rg-node-outer {
    position: absolute;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%) rotate(0deg);
    width: 46px; height: 46px;
    border-radius: 50%;
    border: 1px dashed color-mix(in srgb, var(--nc) 35%, transparent);
    animation: rg-orbit 6s linear infinite;
    transition: border-color 0.4s;
  }
  .rg-node-ping {
    position: absolute;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%) scale(0.6);
    width: 56px; height: 56px;
    border-radius: 50%;
    border: 1.5px solid var(--nc);
    opacity: 0;
    animation: rg-ping 3s ease-out var(--delay, 0s) infinite;
  }
  .rg-node-html--flash .rg-node-inner {
    animation: rg-flash-node 0.8s ease-out;
  }
  .rg-node-html--flash .rg-node-ping {
    animation: rg-ping 0.6s ease-out 1, rg-ping 3s ease-out infinite 0.6s;
  }
  @keyframes rg-orbit {
    to { transform: translate(-50%, -50%) rotate(360deg); }
  }
  @keyframes rg-ping {
    0%   { transform: translate(-50%,-50%) scale(0.55); opacity: 0.7; }
    100% { transform: translate(-50%,-50%) scale(1.2);  opacity: 0; }
  }
  @keyframes rg-flash-node {
    0%   { transform: translate(-50%,-50%) scale(2.2); opacity: 1; }
    60%  { transform: translate(-50%,-50%) scale(0.9); opacity: 1; }
    100% { transform: translate(-50%,-50%) scale(1);   opacity: 1; }
  }
  .rg-particle--blocked {
    animation: rg-burst 0.5s ease-out;
  }
  .rg-particle--held {
    animation: rg-pulse-hold 1.2s ease-in-out infinite;
  }

  .rg-map-labels {
    position: absolute;
    left: 0; right: 0; bottom: 6px;
    height: 60px;
  }
  .rg-map-label {
    position: absolute;
    transform: translateX(-50%);
    text-align: center;
    width: 110px;
    pointer-events: none;
  }
  .rg-map-label-name {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.14em;
    margin-bottom: 2px;
  }
  .rg-map-label-desc {
    font-size: 11px;
    color: #8a92a3;
    line-height: 1.3;
  }

  /* Stats row ─────────────────────────────────────────────────────────── */
  .rg-stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 14px;
  }
  .rg-stat {
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(86,188,236,0.16);
    border-radius: 14px;
    padding: 16px 18px 14px;
    -webkit-backdrop-filter: blur(12px);
    backdrop-filter: blur(12px);
    position: relative;
    overflow: hidden;
  }
  .rg-stat--alert { border-color: rgba(247,37,133,0.30); }
  .rg-stat--warn  { border-color: rgba(245,184,80,0.30); }
  .rg-stat--ok    { border-color: rgba(70,167,88,0.30); }
  .rg-stat-label {
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #8a92a3;
    font-weight: 600;
    margin-bottom: 6px;
  }
  .rg-stat-value {
    font-size: 30px;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1;
    color: #f4f7fb;
  }
  .rg-stat-pct {
    font-size: 18px;
    color: #8a92a3;
    margin-left: 2px;
  }
  .rg-stat-sub {
    margin-top: 8px;
    font-size: 11px;
    color: #8a92a3;
  }
  .rg-spark {
    position: absolute;
    right: 12px; bottom: 10px;
    width: 90px; height: 22px;
    opacity: 0.85;
  }

  /* Rails grid ───────────────────────────────────────────────────────── */
  .rg-rails-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 14px;
  }
  .rg-rail-card {
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(86,188,236,0.16);
    border-radius: 14px;
    padding: 14px 16px 16px;
    -webkit-backdrop-filter: blur(12px);
    backdrop-filter: blur(12px);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .rg-rail-head { display: flex; align-items: center; justify-content: space-between; }
  .rg-rail-name { font-weight: 600; font-size: 14px; color: #f4f7fb; }
  .rg-rail-badge {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    letter-spacing: 0.16em;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 999px;
    border: 1px solid;
    background: rgba(0,0,0,0.25);
  }
  .rg-rail-desc {
    font-size: 12px;
    color: #8a92a3;
    margin: 0;
    line-height: 1.4;
    min-height: 32px;
  }
  .rg-rail-meta {
    display: grid;
    grid-template-columns: auto 1fr;
    column-gap: 10px;
    row-gap: 3px;
    font-size: 11px;
    margin-top: 2px;
  }
  .rg-rail-meta-k { color: #6c7384; letter-spacing: 0.06em; }
  .rg-rail-meta-v { color: #cfd5e0; text-align: right; font-family: 'JetBrains Mono', monospace; }
  .rg-rail-bars {
    display: flex;
    gap: 2px;
    margin-top: 8px;
    height: 22px;
    align-items: stretch;
  }
  .rg-rail-bar {
    flex: 1;
    border-radius: 2px;
    opacity: 0.9;
    transition: transform var(--dur, 160ms) ease;
  }
  .rg-rail-bar:hover { transform: scaleY(1.15); }

  /* Live feed ────────────────────────────────────────────────────────── */
  .rg-feed {
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(86,188,236,0.16);
    border-radius: 14px;
    padding: 18px 18px 12px;
    -webkit-backdrop-filter: blur(12px);
    backdrop-filter: blur(12px);
  }
  .rg-feed-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 10px;
  }
  .rg-feed-head h2 {
    margin: 0;
    font-size: 14px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #cfd5e0;
    font-weight: 700;
  }
  .rg-feed-count { font-size: 11px; color: #8a92a3; font-family: 'JetBrains Mono', monospace; }

  .rg-feed-table {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 420px;
    overflow-y: auto;
  }
  .rg-feed-row {
    display: grid;
    grid-template-columns: 100px 140px 90px 100px 110px 1fr;
    gap: 12px;
    padding: 9px 10px;
    font-size: 12px;
    border-radius: 8px;
    align-items: center;
    border-left: 3px solid transparent;
  }
  .rg-feed-row--head {
    font-size: 10px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #6c7384;
    font-weight: 700;
    border-left: 3px solid transparent;
    padding-bottom: 6px;
  }
  .rg-feed-row--block { background: rgba(247,37,133,0.06); border-left-color: #f72585; }
  .rg-feed-row--hold  { background: rgba(245,184,80,0.06); border-left-color: #f5b850; }
  .rg-feed-row--flag  { background: rgba(86,188,236,0.06); border-left-color: #56bcec; }
  .rg-feed-row--pass  { background: rgba(70,167,88,0.04);  border-left-color: rgba(70,167,88,0.4); }

  .rg-feed-row:not(.rg-feed-row--head) {
    animation: rg-slide-in 320ms cubic-bezier(0.18, 0.65, 0.22, 1);
  }

  .rg-feed-time { font-family: 'JetBrains Mono', monospace; color: #cfd5e0; }
  .rg-feed-rail { color: #cfd5e0; font-weight: 500; }
  .rg-feed-reason {
    color: #8a92a3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .rg-action-pill {
    display: inline-block;
    padding: 2px 9px;
    border: 1px solid;
    border-radius: 999px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12em;
  }

  .rg-feed-empty {
    padding: 24px 12px;
    text-align: center;
    color: #6c7384;
    font-size: 13px;
  }

  /* Animations ──────────────────────────────────────────────────────── */
  @keyframes rg-pulse {
    0%   { box-shadow: 0 0 0 0   currentColor; opacity: 1; }
    70%  { box-shadow: 0 0 0 7px transparent;  opacity: 0.4; }
    100% { box-shadow: 0 0 0 0   transparent;  opacity: 1; }
  }
  @keyframes rg-dash {
    to { stroke-dashoffset: -6; }
  }
  @keyframes rg-flash {
    0%   { r: 2.6; }
    40%  { r: 4.0; }
    100% { r: 2.6; }
  }
  @keyframes rg-burst {
    0%   { r: 0.9; opacity: 1; }
    100% { r: 2.6; opacity: 0; }
  }
  @keyframes rg-pulse-hold {
    0%,100% { opacity: 1;   r: 0.9; }
    50%     { opacity: 0.4; r: 1.6; }
  }
  @keyframes rg-slide-in {
    from { opacity: 0; transform: translateY(-6px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* Responsive ──────────────────────────────────────────────────────── */
  @media (max-width: 1100px) {
    .rg-stats       { grid-template-columns: repeat(2, 1fr); }
    .rg-rails-grid  { grid-template-columns: repeat(2, 1fr); }
    .rg-feed-row    { grid-template-columns: 80px 110px 80px 90px 90px 1fr; }
  }
  @media (max-width: 720px) {
    .rg-shell        { padding: 16px 12px 48px; }
    .rg-stats        { grid-template-columns: 1fr; }
    .rg-rails-grid   { grid-template-columns: 1fr; }
    .rg-feed-row     { grid-template-columns: 70px 1fr 70px; }
    .rg-feed-row > div:nth-child(4),
    .rg-feed-row > div:nth-child(5),
    .rg-feed-row > div:nth-child(6) { display: none; }
    .rg-map          { height: 220px; }
  }

  @media (prefers-reduced-motion: reduce) {
    .rg-link--active,
    .rg-node-html--flash .rg-node-inner,
    .rg-node-outer, .rg-node-ping,
    .rg-particle--blocked,
    .rg-particle--held,
    .rg-feed-row:not(.rg-feed-row--head),
    .rg-dot {
      animation: none !important;
    }
  }
</style>

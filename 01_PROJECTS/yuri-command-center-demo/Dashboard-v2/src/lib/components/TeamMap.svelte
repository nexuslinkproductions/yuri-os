<script lang="ts">
  import { type EntityState } from "$lib/db";

  interface Member {
    code: string; name: string; role: string; location: string; country: string;
    lon: number; lat: number; plane_uuid: string; color: string;
  }

  interface Props {
    tickets?: EntityState[];
  }
  let { tickets = [] }: Props = $props();

  const MEMBERS: Member[] = [
    { code: "CTI", name: "Claudio Tinner", role: "CEO & Director",        location: "Wetzikon, ZH", country: "CH", lon: 8.80, lat: 47.32, plane_uuid: "2d7e4403-be9f-455b-811d-f09a91fee061", color: "#3FB5F2" },
    { code: "FK",  name: "Fanny Kecskes",  role: "Marketing Manager",     location: "Zürich, ZH",   country: "CH", lon: 8.44, lat: 47.38, plane_uuid: "bff07aa8-a285-460b-bd38-760cd24b8513", color: "#7B5CFF" },
    { code: "SW",  name: "Silas Wirth",    role: "Visual Director",       location: "Weinfelden, TG", country: "CH", lon: 9.11, lat: 47.57, plane_uuid: "1d2b9cf5-7174-4d91-be58-6d0f4417d2f3", color: "#34c759" },
    { code: "MS",  name: "Marcel S.",      role: "Production Specialist", location: "Vienna, AT",    country: "AT", lon: 16.37, lat: 48.21, plane_uuid: "f7d0b647-beca-4d79-8714-4988918b19c0", color: "#ff9f0a" },
  ];

  // Viewport: lon 5.2–18.0, lat 45.2–49.8
  const LON0 = 5.2, LON1 = 18.0, LAT0 = 45.2, LAT1 = 49.8;
  const W = 800, H = 380;
  function geoToSvg(lon: number, lat: number): [number, number] {
    const x = ((lon - LON0) / (LON1 - LON0)) * W;
    const y = ((LAT1 - lat) / (LAT1 - LAT0)) * H;
    return [x, y];
  }

  // Simplified country paths
  const CH_PATH = (() => {
    const pts: [number,number][] = [
      [5.96,47.81],[6.02,47.55],[6.16,46.82],[6.45,46.43],[7.05,46.08],
      [7.63,46.07],[8.05,45.82],[8.48,45.82],[9.02,46.10],[9.60,46.31],
      [10.08,46.57],[10.49,46.86],[10.37,47.37],[9.59,47.56],[9.10,47.60],
      [8.88,47.79],[8.42,47.83],[7.80,47.74],[7.33,47.63],[6.74,47.67],
    ];
    return "M " + pts.map(([lon,lat]) => geoToSvg(lon,lat).map(v => v.toFixed(1)).join(",")).join(" L ") + " Z";
  })();

  const AT_PATH = (() => {
    const pts: [number,number][] = [
      [9.53,47.52],[10.49,47.37],[10.88,47.73],[12.00,47.69],[12.50,47.78],
      [13.00,47.74],[13.84,47.75],[14.50,48.00],[15.00,48.00],[16.00,48.28],
      [17.08,48.01],[17.16,47.76],[16.78,47.68],[16.60,47.22],[16.10,46.87],
      [15.75,46.83],[15.45,46.66],[14.56,46.40],[14.00,46.46],[13.70,46.52],
      [13.38,46.56],[12.60,46.66],[12.38,46.77],[12.15,46.94],[11.82,46.99],
      [11.51,46.99],[11.17,46.94],[10.88,46.96],[10.40,46.85],[9.92,46.92],
      [9.63,47.36],
    ];
    return "M " + pts.map(([lon,lat]) => geoToSvg(lon,lat).map(v => v.toFixed(1)).join(",")).join(" L ") + " Z";
  })();

  // Member SVG positions
  const memberPos = MEMBERS.map(m => ({ ...m, pos: geoToSvg(m.lon, m.lat) }));

  // Connection line pairs
  const connections: [number, number][] = [[0,1],[1,2],[2,3],[0,2]];

  // Selected member panel
  let selected = $state<typeof memberPos[0] | null>(null);
  let panelVisible = $state(false);

  function selectMember(m: typeof memberPos[0]) {
    if (selected?.code === m.code) {
      panelVisible = false;
      setTimeout(() => { selected = null; }, 320);
    } else {
      selected = m;
      panelVisible = true;
    }
  }
  function closePanel() {
    panelVisible = false;
    setTimeout(() => { selected = null; }, 320);
  }

  // Display-name keywords per member (assignee field is usually a full name, not a code)
  const MEMBER_NAMES: Record<string, string[]> = {
    CTI: ["claudio", "tinner"],
    FK:  ["fanny", "kecskes"],
    SW:  ["silas", "wirth"],
    MS:  ["marcel"],
  };

  // Per-member ticket stats
  function memberTickets(m: Member) {
    const names = MEMBER_NAMES[m.code] ?? [];
    return tickets.filter(t => {
      const a = (t.state?.assignee ?? "").toString().toLowerCase();
      if (a === m.code.toLowerCase() || names.some(n => a.includes(n))) return true;
      const assignees: unknown[] = Array.isArray(t.state?.assignees) ? t.state.assignees : [];
      return assignees.some(x => {
        if (typeof x === "string") {
          const xs = x.toLowerCase();
          // Full UUID match, truncated prefix match (first 8-char segment), or name keyword
          return xs === m.plane_uuid || (xs.length >= 8 && m.plane_uuid.startsWith(xs)) || names.some(n => xs.includes(n));
        }
        if (x && typeof x === "object") {
          const o = x as Record<string, unknown>;
          if (o.id === m.plane_uuid) return true;
          const dn = ((o.display_name ?? o.name ?? "") as string).toLowerCase();
          return names.some(n => dn.includes(n));
        }
        return false;
      });
    });
  }
  function openCount(m: Member) {
    return memberTickets(m).filter(t => !/done|cancel/i.test(t.state?.state || "")).length;
  }
  function overdueCount(m: Member) {
    return memberTickets(m).filter(t => {
      const d = t.state?.due_date;
      return d && new Date(d) < new Date() && !/done|cancel/i.test(t.state?.state || "");
    }).length;
  }
  function doneThisMonth(m: Member) {
    const start = new Date(); start.setDate(1); start.setHours(0,0,0,0);
    return memberTickets(m).filter(t => {
      if (!/done/i.test(t.state?.state || "")) return false;
      const u = new Date(t.updated_at);
      return u >= start;
    }).length;
  }

  // Priority breakdown
  const PRIOS = ["urgent","high","medium","low"] as const;
  function prioColor(p: string) {
    return p==="urgent"?"#ef4444":p==="high"?"#f97316":p==="medium"?"#eab308":"#10b981";
  }
  function prioCounts(m: Member) {
    const tix = memberTickets(m).filter(t => !/done|cancel/i.test(t.state?.state||""));
    return PRIOS.map(p => ({ p, n: tix.filter(t => (t.state?.priority||"").toLowerCase()===p).length }));
  }
  function recentTix(m: Member) {
    return memberTickets(m)
      .filter(t => !/done|cancel/i.test(t.state?.state||""))
      .sort((a,b) => {
        const pa = ["urgent","high","medium","low"].indexOf((a.state?.priority||"none").toLowerCase());
        const pb = ["urgent","high","medium","low"].indexOf((b.state?.priority||"none").toLowerCase());
        return pa - pb;
      })
      .slice(0,5);
  }

</script>

<div class="map-wrap">
  <!-- Map canvas -->
  <div class="map-canvas">
    <svg viewBox="0 0 {W} {H}" class="map-svg" preserveAspectRatio="xMidYMid meet">
      <defs>
        <filter id="map-glow">
          <feGaussianBlur stdDeviation="3" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="pin-glow">
          <feGaussianBlur stdDeviation="4" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        {#each MEMBERS as m}
          <radialGradient id="glow-{m.code}" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stop-color={m.color} stop-opacity="0.35"/>
            <stop offset="100%" stop-color={m.color} stop-opacity="0"/>
          </radialGradient>
        {/each}
        <linearGradient id="conn-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stop-color="#3FB5F2" stop-opacity="0.5"/>
          <stop offset="100%" stop-color="#7B5CFF" stop-opacity="0.5"/>
        </linearGradient>
      </defs>

      <!-- Geographic grid -->
      {#each [47, 48, 49] as lat}
        {@const y = ((LAT1 - lat) / (LAT1 - LAT0)) * H}
        <line x1="0" y1={y} x2={W} y2={y} stroke="rgba(255,255,255,0.04)" stroke-width="1"/>
        <text x="6" y={y - 4} fill="rgba(255,255,255,0.12)" font-size="8" font-family="JetBrains Mono">{lat}°N</text>
      {/each}
      {#each [7, 9, 11, 13, 15, 17] as lon}
        {@const x = ((lon - LON0) / (LON1 - LON0)) * W}
        <line x1={x} y1="0" x2={x} y2={H} stroke="rgba(255,255,255,0.04)" stroke-width="1"/>
        <text x={x + 4} y={H - 6} fill="rgba(255,255,255,0.12)" font-size="8" font-family="JetBrains Mono">{lon}°E</text>
      {/each}

      <!-- Country fills -->
      <path d={CH_PATH} fill="rgba(63,181,242,0.07)" stroke="rgba(63,181,242,0.28)" stroke-width="1.5" stroke-linejoin="round"/>
      <path d={AT_PATH} fill="rgba(123,92,255,0.06)" stroke="rgba(123,92,255,0.25)" stroke-width="1.5" stroke-linejoin="round"/>

      <!-- Country labels -->
      <text x={geoToSvg(7.9, 47.0)[0]} y={geoToSvg(7.9, 47.0)[1]}
        fill="rgba(63,181,242,0.45)" font-size="11" font-family="Space Grotesk" letter-spacing="0.18em" font-weight="600" text-anchor="middle">SCHWEIZ</text>
      <text x={geoToSvg(13.5, 47.5)[0]} y={geoToSvg(13.5, 47.5)[1]}
        fill="rgba(123,92,255,0.45)" font-size="11" font-family="Space Grotesk" letter-spacing="0.18em" font-weight="600" text-anchor="middle">ÖSTERREICH</text>

      <!-- Connection lines (animated dashes) -->
      {#each connections as [i, j]}
        {@const [x1, y1] = memberPos[i].pos}
        {@const [x2, y2] = memberPos[j].pos}
        <line {x1} {y1} {x2} {y2}
          stroke="url(#conn-grad)"
          stroke-width="1"
          stroke-dasharray="4 6"
          opacity="0.4"
          class="conn-line"/>
      {/each}

      <!-- Team member pins -->
      {#each memberPos as m}
        {@const [cx, cy] = m.pos}
        {@const isSelected = selected?.code === m.code}

        <!-- Glow halo -->
        <circle {cx} {cy} r={18}
          fill="url(#glow-{m.code})"
          class="glow-halo"
          style="opacity: 0.6"/>

        <!-- Pin circle (clickable) -->
        <circle {cx} {cy} r={isSelected ? 13 : 10}
          fill={isSelected ? m.color : `color-mix(in oklab, ${m.color} 25%, rgba(6,8,14,0.9))`}
          stroke={m.color}
          stroke-width={isSelected ? 2.5 : 1.5}
          filter="url(#pin-glow)"
          class="pin"
          style="cursor:pointer; transition: all 0.22s cubic-bezier(0.34,1.56,0.64,1);"
          role="button"
          tabindex="0"
          aria-label={m.name}
          onclick={() => selectMember(m)}
          onkeydown={(e) => e.key==='Enter' && selectMember(m)}/>

        <!-- Initials label -->
        <text {cx} cy={cy + 1}
          text-anchor="middle" dominant-baseline="middle"
          fill="white" font-size="8" font-family="JetBrains Mono" font-weight="700"
          style="pointer-events:none; user-select:none;">
          {m.code}
        </text>

        <!-- Name tag -->
        <g class="name-tag" style="pointer-events:none;">
          <text cx={cx + 16} x={cx + 16} y={cy - 4}
            fill={m.color} font-size="9.5" font-family="Space Grotesk" font-weight="600"
            opacity="0.9">{m.name}</text>
          <text x={cx + 16} y={cy + 8}
            fill="rgba(255,255,255,0.45)" font-size="8" font-family="JetBrains Mono">{m.location}</text>
        </g>
      {/each}
    </svg>
  </div>

  <!-- Member panel (slides in from right) -->
  {#if selected}
    <div class="panel-backdrop" class:visible={panelVisible} onclick={closePanel} role="none"></div>
    <div class="member-panel glass" class:visible={panelVisible}>
      <button class="panel-close" onclick={closePanel} aria-label="Close">✕</button>

      <!-- Header -->
      <div class="panel-head">
        <div class="avatar-ring" style="--c:{selected.color}">
          <div class="avatar-inner">
            <span class="avatar-code">{selected.code}</span>
          </div>
          <svg class="ring-svg" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="36" fill="none" stroke={selected.color} stroke-width="2"
              stroke-dasharray="226" stroke-dashoffset="56" stroke-linecap="round"
              transform="rotate(-90 40 40)" opacity="0.8"/>
          </svg>
        </div>
        <div class="panel-meta">
          <h2 class="panel-name">{selected.name}</h2>
          <p class="panel-role">{selected.role}</p>
          <div class="panel-loc">
            <span class="loc-dot" style="background:{selected.color}"></span>
            {selected.location} · {selected.country}
          </div>
        </div>
      </div>

      <!-- Stats grid -->
      <div class="stat-grid">
        <div class="stat-cell">
          <span class="stat-val" style="color:{selected.color}">{openCount(selected)}</span>
          <span class="stat-lbl">OPEN</span>
        </div>
        <div class="stat-cell">
          <span class="stat-val" style="color:{overdueCount(selected)>0?'#ef4444':'var(--tx)'}">{overdueCount(selected)}</span>
          <span class="stat-lbl">OVERDUE</span>
        </div>
        <div class="stat-cell">
          <span class="stat-val" style="color:var(--gr)">{doneThisMonth(selected)}</span>
          <span class="stat-lbl">DONE / MO</span>
        </div>
      </div>

      <!-- Priority breakdown — CYBER COMMAND -->
      {#if selected}
        {@const _pc = prioCounts(selected)}
        {@const _pcMax = Math.max(..._pc.map(x=>x.n), 1)}
        {@const _pcTotal = _pc.reduce((s,x)=>s+x.n,0)}
        {@const _pcUrgent = _pc.find(x=>x.p==='urgent')?.n ?? 0}
        {@const _pcHigh = _pc.find(x=>x.p==='high')?.n ?? 0}
        {@const _pcEsc = _pcUrgent + _pcHigh}
        {@const _pcWeight = _pc.reduce((s,x,i)=>s + x.n*(4-i),0)}
        {@const _pcAvg = _pcTotal>0 ? (_pcWeight/_pcTotal).toFixed(1) : '0.0'}
        <div class="cyber-prio-chart">
          <div class="cpc-head">
            <div class="cpc-eb">
              <span class="cpc-eb-line"></span>
              <span class="cpc-eb-text">PRIORITY BREAKDOWN</span>
            </div>
            <div class="cpc-sub">Verteilung offener Tickets</div>
          </div>

          <div class="prio-bars">
            {#each _pc as {p, n}, i}
              <div class="pb-row" style="--i: {i}">
                <span class="pb-lbl pb-lbl-{p}">{p}</span>
                <div class="pb-track">
                  <div class="pb-fill pb-fill-{p}"
                    style="--w: {(n/_pcMax)*100}%; --glow: {prioColor(p)}; --d: {120 + i*90}ms"></div>
                </div>
                <span class="pb-val">{n}</span>
              </div>
            {/each}
          </div>

          <div class="cpc-foot">
            <span class="cpc-foot-cell">
              <span class="cpc-foot-lbl">Eskalierte Tickets</span>
              <span class="cpc-foot-val" class:hot={_pcEsc>0}>{_pcEsc}</span>
            </span>
            <span class="cpc-foot-sep"></span>
            <span class="cpc-foot-cell">
              <span class="cpc-foot-lbl">AVG · PRIO</span>
              <span class="cpc-foot-val">{_pcAvg}</span>
            </span>
          </div>
        </div>
      {/if}

      <!-- Recent tickets -->
      <div class="section-label">Top open tickets</div>
      <div class="tix-list">
        {#each recentTix(selected) as t}
          <div class="tix-row">
            <span class="tix-prio-dot" style="background:{prioColor(t.state?.priority||'none')}"></span>
            <span class="tix-name">{t.state?.name || t.entity_id}</span>
            {#if t.state?.due_date}
              <span class="tix-due" class:overdue={new Date(t.state.due_date)<new Date()}>
                {new Date(t.state.due_date).toLocaleDateString('de-CH',{month:'short',day:'numeric'})}
              </span>
            {/if}
          </div>
        {:else}
          <p class="no-tix">No open tickets 🎉</p>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .map-wrap {
    position: relative;
    width: 100%;
    overflow: hidden;
    border-radius: var(--r-lg);
  }

  .map-canvas {
    width: 100%;
    background:
      radial-gradient(ellipse 60% 80% at 25% 50%, rgba(63,181,242,0.06) 0%, transparent 70%),
      radial-gradient(ellipse 50% 70% at 75% 50%, rgba(123,92,255,0.05) 0%, transparent 70%),
      #06080e;
    border-radius: var(--r-lg);
    border: 1px solid var(--b1);
    overflow: hidden;
  }

  .map-svg { width: 100%; height: auto; display: block; }

  .conn-line { animation: dash-flow 4s linear infinite; }
  @keyframes dash-flow { to { stroke-dashoffset: -20; } }

  circle.pin { animation: pin-pulse 3s ease-in-out infinite; }
  @keyframes pin-pulse { 0%,100%{opacity:0.9} 50%{opacity:0.6} }

  /* ── Member panel ── */
  .panel-backdrop {
    position: absolute; inset: 0;
    background: rgba(6,8,14,0.5);
    backdrop-filter: blur(2px);
    opacity: 0; pointer-events: none;
    transition: opacity 0.3s ease;
    border-radius: var(--r-lg);
    z-index: 10;
  }
  .panel-backdrop.visible { opacity: 1; pointer-events: auto; }

  .member-panel {
    position: absolute; top: 0; right: 0; bottom: 0;
    width: 320px;
    background: rgba(14,16,24,0.92);
    backdrop-filter: blur(36px) saturate(1.6);
    border-left: 1px solid var(--b2);
    border-radius: 0 var(--r-lg) var(--r-lg) 0;
    padding: 24px 22px;
    display: flex; flex-direction: column; gap: 18px;
    z-index: 11;
    transform: translateX(100%);
    transition: transform 0.32s cubic-bezier(0.22,1,0.36,1);
    overflow-y: auto;
  }
  .member-panel.visible { transform: translateX(0); }

  .panel-close {
    all: unset; cursor: pointer;
    position: absolute; top: 14px; left: 14px;
    width: 28px; height: 28px;
    display: grid; place-items: center;
    border-radius: 8px;
    color: var(--t3); font-size: 13px;
    transition: background 0.15s, color 0.15s;
  }
  .panel-close:hover { background: var(--s2); color: var(--tx); }

  .panel-head { display: flex; align-items: center; gap: 16px; margin-top: 10px; }

  .avatar-ring {
    position: relative; width: 80px; height: 80px; flex-shrink: 0;
  }
  .avatar-inner {
    position: absolute; inset: 8px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--c, #3FB5F2) 0%, color-mix(in oklab, var(--c,#3FB5F2) 60%, #7B5CFF) 100%);
    display: grid; place-items: center;
    box-shadow: 0 0 20px color-mix(in oklab, var(--c,#3FB5F2) 50%, transparent);
  }
  .avatar-code {
    font-family: "JetBrains Mono", monospace;
    font-size: 13px; font-weight: 700;
    color: white; letter-spacing: 0.04em;
  }
  .ring-svg {
    position: absolute; inset: 0; width: 100%; height: 100%;
    animation: ring-spin 8s linear infinite;
  }
  @keyframes ring-spin { to { transform: rotate(360deg); } }

  .panel-name  { font-family: "Space Grotesk", sans-serif; font-size: 16px; font-weight: 600; color: var(--tx); margin: 0; }
  .panel-role  { font-size: 12px; color: var(--t3); margin: 3px 0 6px; }
  .panel-loc   { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--t3); font-family: "JetBrains Mono", monospace; }
  .loc-dot     { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }

  .stat-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; }
  .stat-cell {
    display: flex; flex-direction: column; align-items: center; gap: 4px;
    padding: 12px 8px;
    background: var(--s1);
    border: 1px solid var(--b1);
    border-radius: var(--r-md);
  }
  .stat-val { font-family: "Space Grotesk", sans-serif; font-size: 24px; font-weight: 700; line-height: 1; }
  .stat-lbl { font-size: 8.5px; letter-spacing: 0.16em; color: var(--t4); text-transform: uppercase; }

  .section-label { font-size: 9px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--t4); margin-bottom: -8px; }

  /* ── CYBER COMMAND priority chart ── */
  .cyber-prio-chart {
    position: relative;
    padding: 14px 14px 12px;
    background:
      radial-gradient(ellipse 80% 60% at 50% 0%, rgba(86,188,236,0.06) 0%, transparent 70%),
      rgba(8,12,20,0.55);
    border: 1px solid rgba(86,188,236,0.15);
    border-radius: 12px;
    box-shadow:
      0 0 0 1px rgba(86,188,236,0.04) inset,
      0 0 30px rgba(86,188,236,0.04);
    -webkit-backdrop-filter: blur(20px) saturate(1.2);
    backdrop-filter: blur(20px) saturate(1.2);
    overflow: hidden;
  }
  .cyber-prio-chart::before {
    content: '';
    position: absolute; top: 0; left: 0; right: 0; height: 1px;
    background: linear-gradient(90deg, transparent, rgba(86,188,236,0.55), transparent);
    pointer-events: none;
  }
  .cpc-head { display: flex; flex-direction: column; gap: 3px; margin-bottom: 12px; }
  .cpc-eb { display: flex; align-items: center; gap: 8px; }
  .cpc-eb-line {
    width: 18px; height: 1px;
    background: linear-gradient(90deg, transparent, #56bcec);
    display: inline-block;
  }
  .cpc-eb-text {
    font-family: "JetBrains Mono", monospace;
    font-size: 8.5px; letter-spacing: 0.22em; text-transform: uppercase;
    color: #56bcec;
    text-shadow: 0 0 8px rgba(86,188,236,0.5);
  }
  .cpc-sub {
    font-family: "JetBrains Mono", monospace;
    font-size: 9.5px; letter-spacing: 0.04em;
    color: rgba(255,255,255,0.32);
  }

  .prio-bars { display: flex; flex-direction: column; gap: 9px; }
  .pb-row {
    display: grid;
    grid-template-columns: 64px 1fr 32px;
    align-items: center; gap: 10px;
    opacity: 0; transform: translateX(-6px);
    animation: pbRowIn 420ms cubic-bezier(0.22,1,0.36,1) forwards;
    animation-delay: calc(var(--i, 0) * 70ms + 80ms);
  }
  @keyframes pbRowIn { to { opacity: 1; transform: translateX(0); } }

  .pb-lbl {
    font-family: "JetBrains Mono", monospace;
    font-size: 9.5px; letter-spacing: 0.18em; text-transform: uppercase;
    color: rgba(86,188,236,0.65);
    font-weight: 600;
  }
  .pb-lbl-urgent { color: #fca5a5; text-shadow: 0 0 8px rgba(239,68,68,0.4); }
  .pb-lbl-high   { color: #fdba74; text-shadow: 0 0 8px rgba(249,115,22,0.4); }
  .pb-lbl-medium { color: #7CD4FF; text-shadow: 0 0 8px rgba(86,188,236,0.4); }
  .pb-lbl-low    { color: rgba(255,255,255,0.42); }

  .pb-track {
    position: relative;
    height: 9px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 999px;
    overflow: hidden;
  }
  .pb-track::after {
    content: '';
    position: absolute; inset: 0;
    background-image: repeating-linear-gradient(
      45deg,
      transparent 0px,
      transparent 4px,
      rgba(255,255,255,0.025) 4px,
      rgba(255,255,255,0.025) 5px
    );
    pointer-events: none;
    border-radius: 999px;
  }
  .pb-fill {
    height: 100%;
    width: 0;
    border-radius: 999px;
    background: var(--glow);
    box-shadow:
      0 0 8px var(--glow),
      0 0 16px color-mix(in srgb, var(--glow) 40%, transparent),
      inset 0 0 6px rgba(255,255,255,0.18);
    animation: pbGrow 780ms cubic-bezier(0.22,1,0.36,1) forwards;
    animation-delay: var(--d, 0ms);
    position: relative;
  }
  .pb-fill::after {
    content: '';
    position: absolute; inset: 0;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent);
    transform: translateX(-100%);
    animation: pbShimmer 3s ease-in-out 1.2s infinite;
    border-radius: 999px;
  }
  @keyframes pbGrow { to { width: var(--w); } }
  @keyframes pbShimmer { to { transform: translateX(100%); } }

  .pb-fill-urgent { background: #ef4444; box-shadow: 0 0 8px #ef4444, 0 0 20px rgba(239,68,68,0.45), inset 0 0 6px rgba(255,255,255,0.25); }
  .pb-fill-high   { background: #f97316; box-shadow: 0 0 8px #f97316, 0 0 20px rgba(249,115,22,0.45), inset 0 0 6px rgba(255,255,255,0.22); }
  .pb-fill-medium { background: #56bcec; box-shadow: 0 0 8px #56bcec, 0 0 20px rgba(86,188,236,0.45), inset 0 0 6px rgba(255,255,255,0.22); }
  .pb-fill-low    { background: rgba(255,255,255,0.4); box-shadow: 0 0 6px rgba(255,255,255,0.18), inset 0 0 4px rgba(255,255,255,0.18); }

  .pb-val {
    font-family: "JetBrains Mono", monospace;
    font-size: 12px; font-weight: 600;
    color: #ffffff;
    text-align: right;
    font-feature-settings: "tnum";
    text-shadow: 0 0 6px rgba(86,188,236,0.25);
  }

  .cpc-foot {
    display: flex; align-items: center; gap: 12px;
    margin-top: 12px; padding-top: 10px;
    border-top: 1px dashed rgba(86,188,236,0.14);
  }
  .cpc-foot-cell { display: flex; align-items: baseline; gap: 6px; }
  .cpc-foot-lbl {
    font-family: "JetBrains Mono", monospace;
    font-size: 8.5px; letter-spacing: 0.18em; text-transform: uppercase;
    color: rgba(255,255,255,0.35);
  }
  .cpc-foot-val {
    font-family: "JetBrains Mono", monospace;
    font-size: 12px; font-weight: 600;
    color: #56bcec;
    text-shadow: 0 0 8px rgba(86,188,236,0.35);
    font-feature-settings: "tnum";
  }
  .cpc-foot-val.hot {
    color: #fca5a5;
    text-shadow: 0 0 8px rgba(239,68,68,0.55);
  }
  .cpc-foot-sep {
    width: 1px; height: 14px;
    background: linear-gradient(180deg, transparent, rgba(86,188,236,0.25), transparent);
  }

  .tix-list { display: flex; flex-direction: column; gap: 5px; }
  .tix-row  { display: flex; align-items: center; gap: 8px; padding: 7px 10px; background: var(--s1); border-radius: var(--r-sm); }
  .tix-prio-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
  .tix-name { font-size: 11.5px; color: var(--t2); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tix-due  { font-family: "JetBrains Mono", monospace; font-size: 10px; color: var(--t3); flex-shrink: 0; }
  .tix-due.overdue { color: #ef4444; }
  .no-tix   { font-size: 12px; color: var(--t4); text-align: center; padding: 12px 0; }

  @media (max-width: 640px) { .member-panel { width: 100%; border-radius: 0 0 var(--r-lg) var(--r-lg); border-left: none; border-top: 1px solid var(--b2); top: auto; } }
</style>

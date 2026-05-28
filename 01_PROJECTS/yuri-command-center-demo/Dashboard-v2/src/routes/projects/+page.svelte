<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { listEntityState, subscribeEntityState, type EntityState } from "$lib/db";
  import GlassCard from "$components/GlassCard.svelte";
  import LiveBadge from "$components/LiveBadge.svelte";

  const PROJECTS = [
    { code: "C2M",  name: "Customers",          color: "#3FB5F2" },
    { code: "MFB",  name: "Med For Balance",    color: "#7B5CFF" },
    { code: "MACL", name: "MACL GmbH",          color: "#22d3ee" },
    { code: "C2I",  name: "Internal",           color: "#34c759" },
  ];

  type PlaneOverview = {
    cycles: Array<{
      name: string; project: string; start: string; end: string;
      total: number; completed: number; started: number; unstarted: number; backlog: number; cancelled: number;
      progress_pct: number;
    }>;
  };

  let tickets = $state<EntityState[]>([]);
  let overview = $state<PlaneOverview | null>(null);
  let loading = $state(true);
  let unsubT: (() => void) | null = null;
  let unsubO: (() => void) | null = null;
  let selected = $state<typeof PROJECTS[number] | null>(null);

  onMount(async () => {
    const [t, ov] = await Promise.all([
      listEntityState("ticket", 800),
      listEntityState("plane_overview", 1),
    ]);
    tickets = t;
    if (ov.length > 0 && ov[0].state) overview = ov[0].state as PlaneOverview;
    loading = false;
    unsubT = subscribeEntityState("ticket", row => {
      tickets = [row, ...tickets.filter(t => t.entity_id !== row.entity_id)].slice(0, 800);
    });
    unsubO = subscribeEntityState("plane_overview", row => {
      if (row?.state) overview = row.state as PlaneOverview;
    });
  });
  onDestroy(() => { unsubT?.(); unsubO?.(); });

  function projectOf(t: EntityState): string {
    const id = (t.entity_id || "").toUpperCase();
    for (const p of PROJECTS) {
      if (id.startsWith(p.code + "-")) return p.code;
    }
    return "—";
  }

  function statsFor(code: string) {
    const ts = tickets.filter(t => projectOf(t) === code);
    const open = ts.filter(t => !/done|cancel/i.test(t.state?.state || "") && (t.state?.state_group || "").toLowerCase() !== "completed" && (t.state?.state_group || "").toLowerCase() !== "cancelled");
    const done = ts.filter(t => /done/i.test(t.state?.state || "") || (t.state?.state_group || "").toLowerCase() === "completed");
    const overdue = open.filter(t => {
      const d = t.state?.due_date;
      return d && new Date(d) < new Date();
    });
    const completion = ts.length > 0 ? Math.round((done.length / ts.length) * 100) : 0;
    return { ts, open, done, overdue, completion };
  }

  function topOpenTickets(code: string, limit = 5): EntityState[] {
    const open = tickets.filter(t => projectOf(t) === code).filter(t => !/done|cancel/i.test(t.state?.state || ""));
    const order = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 } as Record<string, number>;
    return [...open].sort((a, b) => {
      const pa = order[(a.state?.priority || "none").toLowerCase()] ?? 5;
      const pb = order[(b.state?.priority || "none").toLowerCase()] ?? 5;
      if (pa !== pb) return pa - pb;
      const da = a.state?.due_date ? new Date(a.state.due_date).getTime() : Infinity;
      const db = b.state?.due_date ? new Date(b.state.due_date).getTime() : Infinity;
      return da - db;
    }).slice(0, limit);
  }

  function assigneeLoad(code: string): { name: string; count: number; urgent: number }[] {
    const open = tickets.filter(t => projectOf(t) === code).filter(t => !/done|cancel/i.test(t.state?.state || ""));
    const map = new Map<string, { count: number; urgent: number }>();
    for (const t of open) {
      const assignees = t.state?.assignees || (t.state?.assignee ? [t.state.assignee] : []);
      const list: string[] = Array.isArray(assignees) ? assignees : [];
      const names = list.length > 0 ? list : ["(unassigned)"];
      for (const a of names) {
        const key = String(a);
        const e = map.get(key) || { count: 0, urgent: 0 };
        e.count++;
        if ((t.state?.priority || "").toLowerCase() === "urgent") e.urgent++;
        map.set(key, e);
      }
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.count - a.count);
  }

  function cyclesFor(code: string) {
    if (!overview?.cycles) return [];
    return overview.cycles.filter(c => c.project === code && c.total > 0);
  }

  function fmtDate(d?: string): string {
    if (!d) return "—";
    try { return new Date(d).toLocaleDateString("de-CH", { timeZone: "Europe/Zurich", day: "2-digit", month: "short" }); }
    catch { return d; }
  }
  function ticketUrl(t: EntityState): string {
    return `https://app.plane.so/c2moviez/browse/${t.entity_id}/`;
  }
</script>

<svelte:window onkeydown={(e) => e.key === "Escape" && (selected = null)} />

<header class="row between items-center wrap gap-4">
  <div class="stack gap-1">
    <span class="caption">03 · PROJECTS</span>
    <h1 class="h1 font-display">Project portfolio</h1>
    <p class="body">{tickets.length} tickets across 4 projects · click a card for drilldown.</p>
  </div>
  <LiveBadge />
</header>

{#if loading}
  <p class="body">Loading…</p>
{:else}
  <section class="grid">
    {#each PROJECTS as p, i}
      {@const s = statsFor(p.code)}
      <GlassCard idx={i} hover onclick={() => (selected = p)}>
        <header class="row between items-center">
          <div class="row items-center gap-3">
            <span class="dot" style={`background:${p.color}; box-shadow: 0 0 12px ${p.color}`}></span>
            <h2 class="h2 font-display">{p.code}</h2>
          </div>
          <span class="caption">{p.name}</span>
        </header>

        <div class="kpis">
          <div class="kpi"><span class="caption">TOTAL</span><strong>{s.ts.length}</strong></div>
          <div class="kpi"><span class="caption">OPEN</span><strong>{s.open.length}</strong></div>
          <div class="kpi"><span class="caption">DONE</span><strong>{s.done.length}</strong></div>
          <div class="kpi"><span class="caption">OVERDUE</span><strong style:color={s.overdue.length > 0 ? "var(--re)" : "var(--tx)"}>{s.overdue.length}</strong></div>
        </div>

        <div class="completion">
          <div class="row between items-center">
            <span class="caption">COMPLETION</span>
            <span class="font-mono small">{s.completion}%</span>
          </div>
          <div class="bar">
            <span class="bar-fill" style={`width:${s.completion}%; background:${p.color}`}></span>
          </div>
        </div>

        {#if s.open.length > 0}
          <div class="recent stack gap-1">
            <span class="caption">RECENT OPEN</span>
            {#each s.open.slice(0, 4) as t}
              <div class="row between items-center recent-row">
                <span class="font-mono code">{t.entity_id}</span>
                <span class="grow ellipsis">{t.state?.name || ""}</span>
              </div>
            {/each}
          </div>
        {/if}
        <span class="drill-hint">Click for drilldown →</span>
      </GlassCard>
    {/each}
  </section>
{/if}

{#if selected}
  {@const s = statsFor(selected.code)}
  {@const top = topOpenTickets(selected.code, 5)}
  {@const load = assigneeLoad(selected.code)}
  {@const cycles = cyclesFor(selected.code)}
  <aside
    class="drawer-backdrop"
    onclick={(e) => { if (e.target === e.currentTarget) selected = null; }}
    role="presentation"
  >
    <div class="drawer glass glass--thick" style={`--accent:${selected.color}`}>
      <span class="corner tl"></span><span class="corner tr"></span>
      <span class="corner bl"></span><span class="corner br"></span>

      <header class="drawer-head">
        <div class="row gap-3 items-center">
          <span class="proj-pill"><span class="proj-pill-dot"></span>{selected.code}</span>
          <span class="caption drawer-id">PROJECT ▸ {selected.name}</span>
        </div>
        <button class="close" onclick={() => selected = null} aria-label="Close">×</button>
      </header>

      <div class="title-row">
        <h2 class="drawer-title font-display">{selected.name}</h2>
        <div class="meta-line">
          <span class="meta-item">{s.ts.length} total · {s.open.length} open · {s.done.length} done</span>
          {#if s.overdue.length > 0}
            <span class="meta-item warn">⚠ {s.overdue.length} overdue</span>
          {/if}
        </div>
      </div>

      <!-- KPI strip -->
      <div class="kpi-strip">
        <div class="ks-kpi"><span class="ks-val font-display">{s.ts.length}</span><span class="ks-lbl">TOTAL</span></div>
        <div class="ks-kpi"><span class="ks-val font-display">{s.open.length}</span><span class="ks-lbl">OPEN</span></div>
        <div class="ks-kpi"><span class="ks-val font-display">{s.done.length}</span><span class="ks-lbl">DONE</span></div>
        <div class="ks-kpi"><span class="ks-val font-display" style:color={s.overdue.length > 0 ? "#ef4444" : "var(--tx)"}>{s.overdue.length}</span><span class="ks-lbl">OVERDUE</span></div>
        <div class="ks-kpi"><span class="ks-val font-display">{s.completion}%</span><span class="ks-lbl">DONE %</span></div>
      </div>

      <!-- Cycles -->
      {#if cycles.length > 0}
        <section class="drawer-section">
          <h3 class="section-title"><span class="section-bracket">▸</span> ACTIVE CYCLES <span class="section-count">{cycles.length}</span></h3>
          <div class="cycle-grid">
            {#each cycles as c}
              <div class="cycle-card">
                <header class="row between items-center">
                  <span class="cycle-name font-display">{c.name}</span>
                  <span class="caption muted">{c.completed}/{c.total}</span>
                </header>
                <div class="cycle-bar">
                  <span class="seg seg-done" style={`width:${c.total ? (c.completed/c.total)*100 : 0}%`}></span>
                  <span class="seg seg-progress" style={`width:${c.total ? (c.started/c.total)*100 : 0}%`}></span>
                  <span class="seg seg-unstarted" style={`width:${c.total ? (c.unstarted/c.total)*100 : 0}%`}></span>
                  <span class="seg seg-backlog" style={`width:${c.total ? (c.backlog/c.total)*100 : 0}%`}></span>
                </div>
                <div class="row between items-center">
                  <span class="caption muted">{fmtDate(c.start)} → {fmtDate(c.end)}</span>
                  <span class="caption" style="color:var(--accent)">{c.progress_pct}%</span>
                </div>
              </div>
            {/each}
          </div>
        </section>
      {/if}

      <!-- Top open tickets -->
      <section class="drawer-section">
        <h3 class="section-title"><span class="section-bracket">▸</span> TOP OPEN BY PRIORITY <span class="section-count">{top.length}</span></h3>
        {#if top.length === 0}
          <p class="body muted">No open tickets.</p>
        {:else}
          <ul class="tix-list">
            {#each top as t}
              {@const prio = (t.state?.priority || "none").toLowerCase()}
              {@const overdue = t.state?.due_date && new Date(t.state.due_date) < new Date()}
              <li class="tix-row">
                <a class="tix-id font-mono" href={ticketUrl(t)} target="_blank" rel="noopener">{t.entity_id}</a>
                <span class="tix-name">{t.state?.name || "(no title)"}</span>
                <span class={`tix-prio chip-${prio}`}>{prio}</span>
                <span class={`tix-due caption ${overdue ? 'over' : ''}`}>{fmtDate(t.state?.due_date)}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </section>

      <!-- Assignee load -->
      <section class="drawer-section">
        <h3 class="section-title"><span class="section-bracket">▸</span> ASSIGNEE LOAD <span class="section-count">{load.length}</span></h3>
        {#if load.length === 0}
          <p class="body muted">No assignees.</p>
        {:else}
          {@const max = Math.max(...load.map(l => l.count), 1)}
          <ul class="load-list">
            {#each load as a}
              <li class="load-row">
                <span class="load-name">{a.name}</span>
                <div class="load-bar">
                  <span class="load-fill" style={`width:${(a.count/max)*100}%; background:${selected.color}`}></span>
                </div>
                <span class="load-val font-mono">
                  {a.count}
                  {#if a.urgent > 0}<span class="load-urgent">· {a.urgent} urgent</span>{/if}
                </span>
              </li>
            {/each}
          </ul>
        {/if}
      </section>

      <footer class="drawer-foot">
        <span class="caption dim">ESC to close</span>
        <a class="open-plane" href={`https://app.plane.so/c2moviez/`} target="_blank" rel="noopener">Open in Plane ↗</a>
      </footer>
    </div>
  </aside>
{/if}

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 20px;
  }
  .dot { width: 12px; height: 12px; border-radius: 50%; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .kpi {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px 12px;
    background: var(--s1);
    border-radius: var(--r-sm);
  }
  .kpi strong { font-size: 22px; font-weight: 500; font-family: "Space Grotesk", sans-serif; letter-spacing: -0.02em; }
  .completion { display: flex; flex-direction: column; gap: 6px; }
  .bar { height: 6px; background: var(--s1); border-radius: 999px; overflow: hidden; }
  .bar-fill { display: block; height: 100%; transition: width 480ms var(--ease-out); }

  .recent-row { padding: 6px 8px; border-radius: var(--r-sm); transition: background var(--dur-fast) var(--ease-out); }
  .recent-row:hover { background: var(--s1); }
  .code { font-size: 11px; color: var(--t3); }
  .ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; color: var(--t2); }

  .drill-hint {
    font-size: 10.5px; letter-spacing: 0.08em;
    color: var(--t4);
    padding-top: 6px; border-top: 1px dashed var(--b1);
    margin-top: auto;
  }

  /* Drawer */
  .drawer-backdrop {
    position: fixed; inset: 0;
    background: var(--overlay);
    backdrop-filter: blur(12px);
    z-index: 55;
    display: flex; justify-content: flex-end;
    animation: fade-in 220ms var(--ease-out);
  }
  .drawer {
    position: relative;
    width: min(680px, 100%); height: 100%;
    padding: 24px 26px;
    display: flex; flex-direction: column; gap: 18px;
    overflow-y: auto;
    border-left: 1px solid color-mix(in oklab, var(--accent) 35%, var(--b2));
    box-shadow: var(--sh-lg), 0 0 0 1px color-mix(in oklab, var(--accent) 15%, transparent);
    animation: drawer-in 320ms var(--ease-spring);
  }
  @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
  @keyframes drawer-in {
    from { transform: translateX(60px); opacity: 0; }
    to   { transform: translateX(0);    opacity: 1; }
  }
  .corner { position: absolute; width: 14px; height: 14px; border: 1.5px solid color-mix(in oklab, var(--accent) 75%, transparent); pointer-events: none; }
  .corner.tl { top: 8px; left: 8px; border-right: none; border-bottom: none; }
  .corner.tr { top: 8px; right: 8px; border-left: none; border-bottom: none; }
  .corner.bl { bottom: 8px; left: 8px; border-right: none; border-top: none; }
  .corner.br { bottom: 8px; right: 8px; border-left: none; border-top: none; }

  .drawer-head { display: flex; justify-content: space-between; align-items: center; }
  .proj-pill {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 5px 12px;
    border-radius: 999px;
    background: color-mix(in oklab, var(--accent) 14%, transparent);
    border: 1px solid color-mix(in oklab, var(--accent) 45%, transparent);
    font-size: 11px; letter-spacing: 0.08em; color: var(--tx); font-weight: 500;
  }
  .proj-pill-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 8px var(--accent); }
  .drawer-id { color: var(--t3); font-family: "JetBrains Mono", monospace; font-size: 10.5px; }

  .close {
    all: unset; cursor: pointer;
    width: 30px; height: 30px;
    display: grid; place-items: center;
    border-radius: 50%;
    background: var(--s2);
    font-size: 20px; color: var(--t2);
  }
  .close:hover { background: var(--s1); color: var(--tx); }

  .title-row {
    display: flex; flex-direction: column; gap: 8px;
    padding-bottom: 8px;
    border-bottom: 1px solid color-mix(in oklab, var(--accent) 22%, var(--b1));
  }
  .drawer-title { font-size: 24px; line-height: 1.15; color: var(--tx); margin: 0; letter-spacing: -0.015em; }
  .meta-line { display: flex; flex-wrap: wrap; gap: 12px; font-size: 12px; color: var(--t2); }
  .meta-item.warn { color: color-mix(in oklab, var(--or) 70%, white); }

  .kpi-strip {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 10px 14px;
    padding: 12px;
    background: var(--s1);
    border: 1px solid var(--b1);
    border-radius: var(--r-md);
  }
  @media (max-width: 540px) { .kpi-strip { grid-template-columns: repeat(3, 1fr); } }
  .ks-kpi { display: flex; flex-direction: column; gap: 3px; }
  .ks-val { font-size: 22px; color: var(--tx); letter-spacing: -0.01em; line-height: 1.1; }
  .ks-lbl { font-size: 9px; letter-spacing: 0.15em; color: var(--t4); }

  .drawer-section { display: flex; flex-direction: column; gap: 10px; }
  .section-title {
    font-family: "Space Grotesk", sans-serif;
    font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase;
    color: var(--t2); margin: 0;
    display: inline-flex; align-items: center; gap: 8px;
  }
  .section-bracket { color: var(--accent); font-size: 14px; }
  .section-count {
    font-family: "JetBrains Mono", monospace;
    font-size: 10.5px; color: var(--t3);
    background: var(--s1); padding: 1px 7px; border-radius: 999px;
    border: 1px solid var(--b1); margin-left: 6px;
  }

  /* cycle-grid */
  .cycle-grid { display: grid; grid-template-columns: 1fr; gap: 10px; }
  .cycle-card {
    padding: 12px 14px;
    border-radius: var(--r-md);
    background: var(--s1);
    border: 1px solid var(--b1);
    display: flex; flex-direction: column; gap: 8px;
  }
  .cycle-name { font-size: 13px; }
  .cycle-bar {
    height: 8px; border-radius: 999px;
    background: var(--s2); overflow: hidden; display: flex;
  }
  .seg { display: block; height: 100%; transition: width 480ms var(--ease-out); }
  .seg-done { background: var(--gr); }
  .seg-progress { background: var(--ye); }
  .seg-unstarted { background: var(--t3); }
  .seg-backlog { background: var(--t4); }
  .muted { color: var(--t4); }

  /* tix-list */
  .tix-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
  .tix-row {
    display: grid;
    grid-template-columns: 80px 1fr 80px 70px;
    gap: 10px; align-items: center;
    padding: 7px 10px;
    background: var(--s1); border: 1px solid var(--b1);
    border-radius: var(--r-sm);
    font-size: 12px;
  }
  .tix-id { color: var(--t3); font-size: 10.5px; text-decoration: none; }
  .tix-id:hover { color: var(--accent); }
  .tix-name { color: var(--tx); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tix-prio { padding: 2px 8px; border-radius: 999px; font-size: 10px; text-align: center; background: var(--s2); color: var(--t2); text-transform: uppercase; letter-spacing: 0.04em; }
  .tix-due { color: var(--t3); font-size: 10.5px; text-align: right; font-family: "JetBrains Mono", monospace; }
  .tix-due.over { color: var(--re); }
  .chip-urgent { background: var(--re-18); color: color-mix(in oklab, var(--re) 70%, white); }
  .chip-high { background: rgba(249,115,22,0.18); color: color-mix(in oklab, var(--or) 70%, white); }
  .chip-medium { background: var(--ye-18); color: color-mix(in oklab, var(--ye) 70%, white); }
  .chip-low { background: var(--gr-18); color: color-mix(in oklab, var(--gr) 70%, white); }

  /* load-list */
  .load-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .load-row {
    display: grid;
    grid-template-columns: 160px 1fr 100px;
    gap: 10px;
    align-items: center;
  }
  .load-name { color: var(--t2); font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .load-bar { height: 8px; background: var(--s1); border-radius: 999px; overflow: hidden; }
  .load-fill { display: block; height: 100%; border-radius: 999px; transition: width 480ms var(--ease-out); }
  .load-val { text-align: right; font-size: 11.5px; color: var(--tx); }
  .load-urgent { color: color-mix(in oklab, var(--re) 70%, white); }

  .drawer-foot {
    display: flex; justify-content: space-between; align-items: center;
    padding-top: 14px;
    border-top: 1px solid color-mix(in oklab, var(--accent) 22%, var(--b1));
    gap: 12px; flex-wrap: wrap;
  }
  .open-plane {
    font-size: 12px; color: var(--accent); text-decoration: none;
  }
  .open-plane:hover { text-decoration: underline; }
  .dim { color: var(--t4); }
</style>

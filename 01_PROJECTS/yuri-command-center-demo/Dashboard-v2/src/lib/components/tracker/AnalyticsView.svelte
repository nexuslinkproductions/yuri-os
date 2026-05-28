<script lang="ts">
  /**
   * AnalyticsView.svelte — CHRONEX Phase 3 (2026-05-25).
   *
   * Month-by-month analytics panel with KPI strip and 4 native SVG charts:
   *   - Bar chart of daily hours (selected month)
   *   - Donut: hours by client
   *   - Donut: hours by category (joined via client_tasks.category)
   *   - Line: cumulative monthly turnover (last 6 months, CTI only)
   *
   * Permission rules (per CHRONEX plan):
   *   - CTI sees CHF / turnover always
   *   - FK / other team see hours only (no CHF, no rate)
   *   - "Show me only" / "Show team" toggle: CTI can see team-wide or own; FK
   *     is locked to her own data.
   */
  import { onMount } from "svelte";
  import { user } from "$stores/user.svelte";
  import { supabase, hasClient } from "$lib/db";

  type EntryRow = {
    id: string;
    user_id: string;
    started_at: string;
    ended_at: string | null;
    duration_seconds: number | null;
    is_billable: boolean;
    rate_chf_per_hour: number | null;
    amount_chf: number | null;
    client_code: string | null;
    client_task_id: string | null;
    entry_type: string | null;
  };
  type TaskRow = { id: string; category: string | null };

  const DEFAULT_RATE = 120;

  const CATEGORY_COLORS: Record<string, string> = {
    video:     "#56bcec",
    photo:     "#7c3aed",
    social:    "#f59e0b",
    marketing: "#ec4899",
    sales:     "#10b981",
    it:        "#6366f1",
    admin:     "#94a3b8",
    other:     "#475569",
  };

  // ── State ─────────────────────────────────────────────────────────
  let mounted = $state(false);
  let loading = $state(true);
  let error = $state<string | null>(null);

  // Selected month start (1st of month, local time)
  let monthCursor = $state<Date>(firstOfMonth(new Date()));

  // Scope: 'me' = only this user, 'team' = all (CTI only)
  let scope = $state<"me" | "team">("me");

  // Data — we load 6 months ending at monthCursor for the line chart, but
  // KPI / bar / donut charts use only the selected month.
  let entries = $state<EntryRow[]>([]);
  let taskMap = $state<Map<string, TaskRow>>(new Map());

  const isCti = $derived(user.isAdmin);
  const monthLabel = $derived(
    monthCursor.toLocaleDateString("en-CH", { month: "long", year: "numeric" })
  );

  onMount(async () => {
    if (isCti) scope = "team";
    await load();
    mounted = true;
  });

  // Reload whenever cursor or scope changes
  $effect(() => {
    void monthCursor; void scope;
    if (mounted) void load();
  });

  function firstOfMonth(d: Date): Date {
    const r = new Date(d);
    r.setDate(1);
    r.setHours(0, 0, 0, 0);
    return r;
  }
  function nextMonth(d: Date): Date {
    const r = new Date(d);
    r.setMonth(r.getMonth() + 1);
    return r;
  }
  function prevMonth(d: Date): Date {
    const r = new Date(d);
    r.setMonth(r.getMonth() - 1);
    return r;
  }
  function daysInMonth(d: Date): number {
    const r = new Date(d);
    r.setMonth(r.getMonth() + 1);
    r.setDate(0);
    return r.getDate();
  }

  async function load() {
    if (!hasClient() || !user.id) { error = "Not ready"; loading = false; return; }
    loading = true;
    error = null;
    try {
      // 6-month window ending at monthCursor (for line chart)
      const winStart = new Date(monthCursor);
      winStart.setMonth(winStart.getMonth() - 5);
      const winEnd = nextMonth(monthCursor);

      let q = supabase()
        .from("time_entries")
        .select("id, user_id, started_at, ended_at, duration_seconds, is_billable, rate_chf_per_hour, amount_chf, client_code, client_task_id, entry_type")
        .gte("started_at", winStart.toISOString())
        .lt("started_at", winEnd.toISOString())
        .not("ended_at", "is", null);

      if (scope === "me") {
        q = q.eq("user_id", user.id);
      }

      const { data, error: err } = await q.limit(5000);
      if (err) throw new Error(err.message);
      entries = (data ?? []) as EntryRow[];

      // Pull categories for any referenced tasks
      const taskIds = Array.from(new Set(entries.map(e => e.client_task_id).filter((x): x is string => !!x)));
      if (taskIds.length > 0) {
        const { data: td } = await supabase()
          .from("client_tasks")
          .select("id, category")
          .in("id", taskIds);
        const m = new Map<string, TaskRow>();
        for (const r of (td ?? []) as TaskRow[]) m.set(r.id, r);
        taskMap = m;
      } else {
        taskMap = new Map();
      }

    } catch (e: any) {
      error = e?.message || "Load failed";
    } finally {
      loading = false;
    }
  }

  function rateOf(e: EntryRow): number {
    if (e.rate_chf_per_hour != null) return Number(e.rate_chf_per_hour);
    return DEFAULT_RATE;
  }
  function chfOf(e: EntryRow): number {
    if (e.amount_chf != null) return Number(e.amount_chf);
    if (!e.is_billable || !e.duration_seconds) return 0;
    return (e.duration_seconds / 3600) * rateOf(e);
  }

  // ── Current-month subset ───────────────────────────────────────────
  const monthEntries = $derived.by(() => {
    const start = monthCursor.getTime();
    const end = nextMonth(monthCursor).getTime();
    return entries.filter(e => {
      const t = new Date(e.started_at).getTime();
      return t >= start && t < end;
    });
  });

  // ── KPIs ───────────────────────────────────────────────────────────
  const kpis = $derived.by(() => {
    let totalSec = 0;
    let billableSec = 0;
    let chf = 0;
    let sickDays = 0;
    let travelDays = 0;
    let vacationDays = 0;
    const workingDayKeys = new Set<string>();
    for (const e of monthEntries) {
      if (!e.duration_seconds) continue;
      totalSec += e.duration_seconds;
      if (e.is_billable) billableSec += e.duration_seconds;
      chf += chfOf(e);
      const dayKey = new Date(e.started_at).toISOString().slice(0, 10);
      if (e.entry_type === "sick") sickDays += 1;
      else if (e.entry_type === "travel") travelDays += 1;
      else if (e.entry_type === "vacation") vacationDays += 1;
      else workingDayKeys.add(dayKey);
    }
    const totalH = totalSec / 3600;
    const workingDays = workingDayKeys.size;
    const avgPerDay = workingDays > 0 ? totalH / workingDays : 0;
    return {
      totalH,
      billableH: billableSec / 3600,
      avgPerDay,
      sickDays,
      travelDays,
      vacationDays,
      chf,
      workingDays,
    };
  });

  // ── Bar chart data: hours per day in selected month ────────────────
  const days = $derived.by(() => daysInMonth(monthCursor));
  const dayBars = $derived.by(() => {
    const n = days;
    const arr: { day: number; hours: number; isWeekend: boolean; isToday: boolean }[] = [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (let i = 1; i <= n; i++) {
      const d = new Date(monthCursor);
      d.setDate(i);
      arr.push({
        day: i,
        hours: 0,
        isWeekend: d.getDay() === 0 || d.getDay() === 6,
        isToday: d.getTime() === today.getTime(),
      });
    }
    for (const e of monthEntries) {
      if (!e.duration_seconds) continue;
      const di = new Date(e.started_at).getDate() - 1;
      if (di < 0 || di >= n) continue;
      arr[di].hours += e.duration_seconds / 3600;
    }
    return arr;
  });
  const maxDayHours = $derived.by(() => Math.max(8, ...dayBars.map(d => d.hours)));

  // ── Donut: hours by client ─────────────────────────────────────────
  const byClient = $derived.by(() => {
    const map = new Map<string, number>();
    for (const e of monthEntries) {
      if (!e.duration_seconds) continue;
      const k = e.client_code ?? "—";
      map.set(k, (map.get(k) ?? 0) + e.duration_seconds / 3600);
    }
    const list = Array.from(map.entries())
      .map(([code, hours]) => ({ code, hours }))
      .sort((a, b) => b.hours - a.hours);
    const total = list.reduce((s, x) => s + x.hours, 0);
    return { list, total };
  });

  // ── Donut: hours by category ───────────────────────────────────────
  const byCategory = $derived.by(() => {
    const map = new Map<string, number>();
    for (const e of monthEntries) {
      if (!e.duration_seconds) continue;
      let cat: string | null = null;
      if (e.client_task_id) {
        const t = taskMap.get(e.client_task_id);
        cat = t?.category ?? null;
      }
      if (!cat) {
        if (e.entry_type && e.entry_type !== "tracked" && e.entry_type !== "manual") cat = e.entry_type;
        else cat = "other";
      }
      map.set(cat, (map.get(cat) ?? 0) + e.duration_seconds / 3600);
    }
    const list = Array.from(map.entries())
      .map(([cat, hours]) => ({ cat, hours, color: CATEGORY_COLORS[cat] ?? "#475569" }))
      .sort((a, b) => b.hours - a.hours);
    const total = list.reduce((s, x) => s + x.hours, 0);
    return { list, total };
  });

  // ── Line: cumulative monthly turnover (last 6 months) ─────────────
  const turnoverSeries = $derived.by(() => {
    const start = new Date(monthCursor);
    start.setMonth(start.getMonth() - 5);
    const arr: { label: string; chf: number; ts: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(start);
      d.setMonth(d.getMonth() + i);
      const next = new Date(d); next.setMonth(next.getMonth() + 1);
      arr.push({
        label: d.toLocaleDateString("en-CH", { month: "short" }),
        chf: 0,
        ts: d.getTime(),
      });
    }
    for (const e of entries) {
      const t = new Date(e.started_at).getTime();
      // find bucket
      for (let i = arr.length - 1; i >= 0; i--) {
        if (t >= arr[i].ts) { arr[i].chf += chfOf(e); break; }
      }
    }
    const maxChf = Math.max(1, ...arr.map(x => x.chf));
    return { arr, maxChf };
  });

  function fmtChf(n: number): string {
    return new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF", maximumFractionDigits: 0 }).format(n);
  }
  function fmtH(n: number): string {
    return `${n.toFixed(1)}h`;
  }

  // ── Donut SVG helpers (no external lib) ────────────────────────────
  // Returns an array of arc paths for a donut chart sized to 100x100.
  function donutArcs(slices: { value: number; color: string }[], total: number) {
    if (total <= 0 || slices.length === 0) return [];
    const cx = 50, cy = 50, r = 38, rIn = 24;
    let startAngle = -Math.PI / 2;
    const out: { d: string; color: string }[] = [];
    for (const s of slices) {
      const frac = s.value / total;
      const sweep = frac * Math.PI * 2;
      const endAngle = startAngle + sweep;
      const x1 = cx + r * Math.cos(startAngle);
      const y1 = cy + r * Math.sin(startAngle);
      const x2 = cx + r * Math.cos(endAngle);
      const y2 = cy + r * Math.sin(endAngle);
      const x3 = cx + rIn * Math.cos(endAngle);
      const y3 = cy + rIn * Math.sin(endAngle);
      const x4 = cx + rIn * Math.cos(startAngle);
      const y4 = cy + rIn * Math.sin(startAngle);
      const large = sweep > Math.PI ? 1 : 0;
      const d = [
        `M ${x1} ${y1}`,
        `A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`,
        `L ${x3} ${y3}`,
        `A ${rIn} ${rIn} 0 ${large} 0 ${x4} ${y4}`,
        "Z",
      ].join(" ");
      out.push({ d, color: s.color });
      startAngle = endAngle;
    }
    return out;
  }

  const clientArcs = $derived.by(() => {
    const slices = byClient.list.map((c, i) => ({
      value: c.hours,
      color: clientColor(c.code, i),
    }));
    return donutArcs(slices, byClient.total);
  });

  const categoryArcs = $derived.by(() =>
    donutArcs(byCategory.list.map(c => ({ value: c.hours, color: c.color })), byCategory.total)
  );

  // Color palette for clients (cycled when CSS var is not defined for code)
  const PALETTE = ["#56bcec","#7c3aed","#f59e0b","#10b981","#ec4899","#6366f1","#f43f5e","#14b8a6","#a855f7","#eab308"];
  function clientColor(code: string, idx: number): string {
    return PALETTE[idx % PALETTE.length];
  }

  // ── Line chart pathing ─────────────────────────────────────────────
  const linePath = $derived.by(() => {
    const arr = turnoverSeries.arr;
    if (arr.length === 0) return { line: "", area: "", points: [] as { x: number; y: number; chf: number; label: string }[] };
    const w = 600, h = 180, pad = 24;
    const stepX = (w - pad * 2) / Math.max(1, arr.length - 1);
    const yScale = (h - pad * 2) / turnoverSeries.maxChf;
    const pts = arr.map((p, i) => ({
      x: pad + i * stepX,
      y: h - pad - p.chf * yScale,
      chf: p.chf,
      label: p.label,
    }));
    const line = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    const area = [
      `M ${pts[0].x} ${h - pad}`,
      ...pts.map(p => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`),
      `L ${pts[pts.length - 1].x} ${h - pad}`,
      "Z",
    ].join(" ");
    return { line, area, points: pts };
  });
</script>

<div class="analytics">
  <!-- Month switcher -->
  <header class="head">
    <div class="head__nav">
      <button type="button" class="nav-btn" aria-label="Previous month" onclick={() => monthCursor = prevMonth(monthCursor)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <div class="head__month">
        <span class="eyebrow">CHRONEX / ANALYTICS</span>
        <h2>{monthLabel}</h2>
      </div>
      <button
        type="button"
        class="nav-btn"
        aria-label="Next month"
        disabled={nextMonth(monthCursor).getTime() > Date.now()}
        onclick={() => monthCursor = nextMonth(monthCursor)}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
    </div>
    {#if isCti}
      <div class="head__scope">
        <button type="button" class="scope-btn" class:scope-btn--active={scope === "me"} onclick={() => scope = "me"}>Me only</button>
        <button type="button" class="scope-btn" class:scope-btn--active={scope === "team"} onclick={() => scope = "team"}>Whole team</button>
      </div>
    {/if}
  </header>

  {#if loading && entries.length === 0}
    <div class="state">Loading analytics...</div>
  {:else if error}
    <div class="state state--err">{error}</div>
  {:else}
    <!-- KPI strip -->
    <div class="kpis">
      <div class="kpi">
        <span class="kpi__label">Total hours</span>
        <span class="kpi__value">{kpis.totalH.toFixed(1)}<span class="kpi__unit">h</span></span>
      </div>
      <div class="kpi">
        <span class="kpi__label">Avg / working day</span>
        <span class="kpi__value">{kpis.avgPerDay.toFixed(1)}<span class="kpi__unit">h</span></span>
        <span class="kpi__sub">{kpis.workingDays} day{kpis.workingDays === 1 ? "" : "s"}</span>
      </div>
      <div class="kpi">
        <span class="kpi__label">Sick days</span>
        <span class="kpi__value">{kpis.sickDays}</span>
      </div>
      <div class="kpi">
        <span class="kpi__label">Travel days</span>
        <span class="kpi__value">{kpis.travelDays}</span>
      </div>
      <div class="kpi">
        <span class="kpi__label">Vacation days</span>
        <span class="kpi__value">{kpis.vacationDays}</span>
      </div>
      {#if isCti}
        <div class="kpi kpi--accent">
          <span class="kpi__label">Turnover</span>
          <span class="kpi__value">{fmtChf(kpis.chf)}</span>
          <span class="kpi__sub">{kpis.billableH.toFixed(1)}h billable</span>
        </div>
      {/if}
    </div>

    <!-- Charts grid -->
    <div class="charts">
      <!-- Bar: daily hours -->
      <section class="card card--wide">
        <header class="card__head">
          <span class="card__eyebrow">DAILY HOURS</span>
          <h3>Hours per day, {monthLabel}</h3>
        </header>
        <div class="bars">
          {#each dayBars as d}
            {@const pct = (d.hours / maxDayHours) * 100}
            <div class="bar-col" class:bar-col--today={d.isToday} class:bar-col--weekend={d.isWeekend} title={`${d.day}: ${fmtH(d.hours)}`}>
              <div class="bar-stack">
                <div class="bar-fill" style={`height: ${pct.toFixed(1)}%;`}></div>
              </div>
              <div class="bar-label">{d.day}</div>
            </div>
          {/each}
        </div>
        <div class="bars-foot">
          <span>1</span>
          <span>0 to {maxDayHours.toFixed(0)}h scale</span>
          <span>{days}</span>
        </div>
      </section>

      <!-- Donut: by client -->
      <section class="card">
        <header class="card__head">
          <span class="card__eyebrow">BY CLIENT</span>
          <h3>Hours by client</h3>
        </header>
        {#if byClient.total > 0}
          <div class="donut-block">
            <svg viewBox="0 0 100 100" class="donut">
              {#each clientArcs as a}
                <path d={a.d} fill={a.color} />
              {/each}
              <text x="50" y="46" text-anchor="middle" class="donut-total">{byClient.total.toFixed(0)}</text>
              <text x="50" y="58" text-anchor="middle" class="donut-unit">hours</text>
            </svg>
            <ul class="legend">
              {#each byClient.list.slice(0, 8) as c, i (c.code)}
                <li>
                  <span class="dot" style={`background: ${clientColor(c.code, i)};`}></span>
                  <span class="legend__code">{c.code}</span>
                  <span class="legend__val">{c.hours.toFixed(1)}h</span>
                </li>
              {/each}
            </ul>
          </div>
        {:else}
          <div class="empty">No client data this month.</div>
        {/if}
      </section>

      <!-- Donut: by category -->
      <section class="card">
        <header class="card__head">
          <span class="card__eyebrow">BY CATEGORY</span>
          <h3>Hours by category</h3>
        </header>
        {#if byCategory.total > 0}
          <div class="donut-block">
            <svg viewBox="0 0 100 100" class="donut">
              {#each categoryArcs as a}
                <path d={a.d} fill={a.color} />
              {/each}
              <text x="50" y="46" text-anchor="middle" class="donut-total">{byCategory.total.toFixed(0)}</text>
              <text x="50" y="58" text-anchor="middle" class="donut-unit">hours</text>
            </svg>
            <ul class="legend">
              {#each byCategory.list as c (c.cat)}
                <li>
                  <span class="dot" style={`background: ${c.color};`}></span>
                  <span class="legend__code">{c.cat}</span>
                  <span class="legend__val">{c.hours.toFixed(1)}h</span>
                </li>
              {/each}
            </ul>
          </div>
        {:else}
          <div class="empty">No category data this month.</div>
        {/if}
      </section>

      <!-- Line: cumulative turnover -->
      {#if isCti}
        <section class="card card--wide">
          <header class="card__head">
            <span class="card__eyebrow">TURNOVER TREND</span>
            <h3>Monthly billable revenue, last 6 months</h3>
          </header>
          <div class="line-wrap">
            <svg viewBox="0 0 600 180" class="line">
              <defs>
                <linearGradient id="lineFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#56bcec" stop-opacity="0.35"/>
                  <stop offset="100%" stop-color="#56bcec" stop-opacity="0"/>
                </linearGradient>
              </defs>
              <path d={linePath.area} fill="url(#lineFill)" />
              <path d={linePath.line} fill="none" stroke="#56bcec" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              {#each linePath.points as p}
                <circle cx={p.x} cy={p.y} r="3.5" fill="#56bcec" stroke="#0a0f1a" stroke-width="1.5"/>
              {/each}
            </svg>
            <div class="line-labels">
              {#each linePath.points as p}
                <div class="line-label">
                  <span class="line-label__val">{fmtChf(p.chf)}</span>
                  <span class="line-label__month">{p.label}</span>
                </div>
              {/each}
            </div>
          </div>
        </section>
      {/if}
    </div>
  {/if}
</div>

<style>
  .analytics {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 14px 18px;
    border-radius: var(--r2);
    background: var(--glass-card);
    backdrop-filter: var(--blur-card);
    -webkit-backdrop-filter: var(--blur-card);
    border: 1px solid var(--line);
    box-shadow: var(--sh-card);
  }
  .head__nav { display: flex; align-items: center; gap: 14px; }
  .head__month { min-width: 200px; }
  .eyebrow {
    font: 700 10.5px/1.3 var(--sa);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--brand-deep);
    display: block;
  }
  .head__month h2 {
    margin: 4px 0 0;
    font: 700 22px/1.1 var(--hd);
    letter-spacing: -0.01em;
  }
  .nav-btn {
    appearance: none; border: 1px solid var(--line);
    background: var(--s1); color: var(--t2);
    width: 36px; height: 36px; border-radius: 10px;
    cursor: pointer;
    display: grid; place-items: center;
    transition: all 140ms;
  }
  .nav-btn:hover:not(:disabled) { background: var(--brand-softer); color: var(--brand-deep); border-color: var(--brand-line); }
  .nav-btn:disabled { opacity: 0.35; cursor: not-allowed; }

  .head__scope {
    display: inline-flex;
    border: 1px solid var(--line);
    border-radius: 999px;
    overflow: hidden;
    background: var(--s1);
  }
  .scope-btn {
    appearance: none; border: 0;
    height: 32px; padding: 0 14px;
    background: transparent;
    font: 600 12px/1 var(--sa); color: var(--t3);
    cursor: pointer;
    transition: background 120ms, color 120ms;
  }
  .scope-btn--active { background: var(--brand-softer); color: var(--brand-deep); }

  .state {
    padding: 40px 16px;
    text-align: center;
    color: var(--t3);
    font: 500 13.5px/1.5 var(--sa);
    border-radius: var(--r2);
    background: var(--glass-card);
    border: 1px dashed var(--line-2);
  }
  .state--err { color: var(--re); }
  .empty {
    padding: 24px; text-align: center;
    color: var(--t3); font: 500 12.5px/1.5 var(--sa);
  }

  /* KPI strip */
  .kpis {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 10px;
  }
  .kpi {
    padding: 14px 16px;
    border-radius: var(--r1);
    background: var(--glass-card);
    backdrop-filter: var(--blur-card);
    border: 1px solid var(--line);
    box-shadow: var(--sh-card);
    display: flex; flex-direction: column; gap: 4px;
  }
  .kpi--accent {
    background: linear-gradient(135deg, var(--brand-softer) 0%, rgba(124,58,237,0.08) 100%);
    border-color: var(--brand-line);
  }
  .kpi__label {
    font: 600 10.5px/1.2 var(--sa);
    text-transform: uppercase;
    letter-spacing: 0.10em;
    color: var(--t3);
  }
  .kpi__value {
    font: 700 22px/1.1 var(--mo);
    font-variant-numeric: tabular-nums;
    color: var(--tx);
  }
  .kpi--accent .kpi__value { color: var(--brand-deep); }
  .kpi__unit { font-size: 13px; color: var(--t3); margin-left: 2px; font-weight: 500; }
  .kpi__sub { font: 500 11px/1 var(--sa); color: var(--t3); }

  /* Charts grid */
  .charts {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 14px;
  }
  .card {
    padding: 16px 18px;
    border-radius: var(--r2);
    background: var(--glass-card);
    backdrop-filter: var(--blur-card);
    -webkit-backdrop-filter: var(--blur-card);
    border: 1px solid var(--line);
    box-shadow: var(--sh-card);
    display: flex; flex-direction: column; gap: 12px;
  }
  .card--wide { grid-column: 1 / -1; }
  .card__head { display: flex; flex-direction: column; gap: 2px; }
  .card__eyebrow {
    font: 700 10px/1.2 var(--sa);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--brand-deep);
  }
  .card__head h3 { margin: 0; font: 600 14px/1.3 var(--hd); color: var(--tx); }

  /* Bar chart */
  .bars {
    display: flex;
    align-items: flex-end;
    gap: 3px;
    height: 180px;
    padding: 10px 0 0;
  }
  .bar-col {
    flex: 1;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 4px;
  }
  .bar-stack {
    flex: 1;
    display: flex; align-items: flex-end;
    background: linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.04) 100%);
    border-radius: 4px 4px 0 0;
    position: relative;
    overflow: hidden;
  }
  .bar-fill {
    width: 100%;
    background: linear-gradient(180deg, #56bcec 0%, #2d8cbf 100%);
    border-radius: 3px 3px 0 0;
    transition: height 320ms cubic-bezier(.34,1.2,.64,1);
    min-height: 0;
  }
  .bar-col--weekend .bar-fill { background: linear-gradient(180deg, rgba(86,188,236,0.4) 0%, rgba(86,188,236,0.2) 100%); }
  .bar-col--today .bar-fill {
    background: linear-gradient(180deg, #7c3aed 0%, #56bcec 100%);
    box-shadow: 0 0 12px rgba(86,188,236,0.5);
  }
  .bar-label {
    font: 600 9px/1 var(--mo);
    color: var(--t4, var(--t3));
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .bar-col--today .bar-label { color: var(--brand-deep); font-weight: 700; }
  .bars-foot {
    display: flex;
    justify-content: space-between;
    font: 500 10px/1 var(--mo);
    color: var(--t3);
    padding-top: 4px;
    border-top: 1px dashed var(--line);
  }

  /* Donut */
  .donut-block {
    display: grid;
    grid-template-columns: 180px 1fr;
    gap: 14px;
    align-items: center;
  }
  .donut {
    width: 100%;
    max-width: 180px;
    aspect-ratio: 1;
  }
  .donut-total {
    font: 700 14px/1 var(--mo);
    fill: var(--tx);
  }
  .donut-unit {
    font: 500 5px/1 var(--sa);
    fill: var(--t3);
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }
  .legend {
    list-style: none;
    margin: 0; padding: 0;
    display: flex; flex-direction: column;
    gap: 4px;
    max-height: 180px;
    overflow: auto;
  }
  .legend li {
    display: grid;
    grid-template-columns: 10px 1fr auto;
    gap: 8px;
    align-items: center;
    font: 500 12px/1.3 var(--sa);
    padding: 3px 0;
  }
  .dot {
    width: 10px; height: 10px; border-radius: 3px;
  }
  .legend__code { color: var(--tx); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
  .legend__val {
    color: var(--t2);
    font-family: var(--mo);
    font-variant-numeric: tabular-nums;
  }

  /* Line chart */
  .line-wrap { display: flex; flex-direction: column; gap: 4px; }
  .line {
    width: 100%;
    height: auto;
  }
  .line-labels {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    text-align: center;
    padding-top: 4px;
  }
  .line-label { display: flex; flex-direction: column; gap: 2px; }
  .line-label__val {
    font: 700 12px/1 var(--mo);
    font-variant-numeric: tabular-nums;
    color: var(--brand-deep);
  }
  .line-label__month {
    font: 600 10.5px/1 var(--sa);
    color: var(--t3);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  @media (max-width: 760px) {
    .head { flex-direction: column; align-items: stretch; }
    .charts { grid-template-columns: 1fr; }
    .donut-block { grid-template-columns: 1fr; justify-items: center; }
    .legend { max-height: none; }
  }
</style>

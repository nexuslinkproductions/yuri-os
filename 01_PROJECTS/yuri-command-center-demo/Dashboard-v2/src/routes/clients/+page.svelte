<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { listEntityState, subscribeEntityState, type EntityState } from "$lib/db";
  import GlassCard from "$components/GlassCard.svelte";
  import LiveBadge from "$components/LiveBadge.svelte";
  import ClientDrawer from "$components/ClientDrawer.svelte";
  import StateLoading from "$components/StateLoading.svelte";
  import StateEmpty from "$components/StateEmpty.svelte";

  // ─── Data ────────────────────────────────────────────
  let clients = $state<EntityState[]>([]);
  let tickets = $state<EntityState[]>([]);
  let loading = $state(true);
  let q = $state("");
  let statusFilter = $state<string>("");
  let selected = $state<EntityState | null>(null);

  let unsubC: (() => void) | null = null;
  let unsubT: (() => void) | null = null;

  onMount(async () => {
    [clients, tickets] = await Promise.all([
      listEntityState("client", 200),
      listEntityState("ticket", 500),
    ]);
    loading = false;
    unsubC = subscribeEntityState("client", row => {
      clients = [row, ...clients.filter(c => c.entity_id !== row.entity_id)].slice(0, 200);
    });
    unsubT = subscribeEntityState("ticket", row => {
      tickets = [row, ...tickets.filter(t => t.entity_id !== row.entity_id)].slice(0, 500);
    });
  });
  onDestroy(() => { unsubC?.(); unsubT?.(); });

  // ─── Status taxonomy ─────────────────────────────────
  type StatusKey = "active" | "pre_active" | "pre_sales" | "investment" | "dormant";
  // Lifecycle palette centralized in tokens.css under `/* Lifecycle palette */`.
  // We use CSS var() refs directly — these render fine in inline style attrs
  // because they're consumed verbatim by the browser as CSS values.
  const STATUS_META: Record<StatusKey, { label: string; color: string; glow: string }> = {
    active:     { label: "ACTIVE",     color: "var(--lifecycle-active)",     glow: "var(--lifecycle-active-glow)" },
    pre_active: { label: "PRE-ACTIVE", color: "var(--lifecycle-pre-active)", glow: "var(--lifecycle-pre-active-glow)" },
    pre_sales:  { label: "PRE-SALES",  color: "var(--lifecycle-pre-sales)",  glow: "var(--lifecycle-pre-sales-glow)" },
    investment: { label: "INVESTMENT", color: "var(--lifecycle-investment)", glow: "var(--lifecycle-investment-glow)" },
    dormant:    { label: "DORMANT",    color: "var(--lifecycle-dormant)",    glow: "var(--lifecycle-dormant-glow)" },
  };

  function classifyStatus(c: EntityState): StatusKey {
    const s = (c.state?.contract_status || c.state?.contract_type || "").toLowerCase();
    const stage = (c.state?.stage || "").toLowerCase();
    const mrr = Number(c.state?.monthly_revenue) || 0;
    const rev = Number(c.state?.total_revenue_chf) || 0;

    if (/invest/.test(s) || /invest/.test(stage)) return "investment";
    if (s === "active" || mrr > 0) return "active";
    if (/pre[-_ ]?contract|transition/.test(s) || /pre[-_ ]?contract|transition/.test(stage)) return "pre_active";
    if (/prospect|discovery|proposal|pre[-_ ]?sales|pitching|lead/.test(stage + " " + s)) return "pre_sales";
    if (rev > 0) return "active"; // has history even if not flagged
    return "dormant";
  }

  // ─── Per-client ticket aggregations ──────────────────
  function ticketsOfClient(c: EntityState) {
    const code = c.entity_id;
    const legalName = c.state?.name || "";
    // Match via ticket customer name OR ticketId prefix
    return tickets.filter(t => {
      const tCust = (t.state?.customer || "").toLowerCase();
      if (tCust && legalName && tCust.includes(legalName.toLowerCase().split(" ")[0])) return true;
      const tid = t.entity_id || "";
      // Match if ticket prefix before '-' equals client code OR legacy SHI matches SHIPSTER prefix
      const prefix = tid.split("-")[0];
      if (prefix === code) return true;
      // Match by extracted code from customer code column (e.g. SHI → SHIPSTER AG)
      return false;
    });
  }

  function ticketStats(c: EntityState) {
    const all = ticketsOfClient(c);
    const open = all.filter(t => !t.state?.is_done);
    const urgent = open.filter(t => (t.state?.priority || "").toLowerCase() === "urgent").length;
    const high = open.filter(t => (t.state?.priority || "").toLowerCase() === "high").length;
    const overdue = open.filter(t => {
      const d = t.state?.due_date;
      return d && new Date(d) < new Date();
    }).length;
    return { total: all.length, open: open.length, done: all.length - open.length, urgent, high, overdue };
  }

  // ─── Filtering + derived lists ───────────────────────
  const allWithStatus = $derived(clients.map(c => ({ c, status: classifyStatus(c) })));
  const counts = $derived((() => {
    const m: Record<StatusKey, number> = { active: 0, pre_active: 0, pre_sales: 0, investment: 0, dormant: 0 };
    for (const { status } of allWithStatus) m[status]++;
    return m;
  })());

  const filtered = $derived(allWithStatus.filter(({ c, status }) => {
    const text = (c.entity_id + " " + (c.state?.name || "")).toLowerCase();
    if (q && !text.includes(q.toLowerCase())) return false;
    if (statusFilter && status !== statusFilter) return false;
    return true;
  }));

  // Sort: active + investment first, then pre-active, pre-sales, dormant
  const orderRank: Record<StatusKey, number> = { active: 0, investment: 1, pre_active: 2, pre_sales: 3, dormant: 4 };
  const sorted = $derived([...filtered].sort((a, b) => {
    if (orderRank[a.status] !== orderRank[b.status]) return orderRank[a.status] - orderRank[b.status];
    const revA = Number(a.c.state?.total_revenue_chf) || 0;
    const revB = Number(b.c.state?.total_revenue_chf) || 0;
    return revB - revA;
  }));

  // Circle size based on activity (open tickets) + revenue, normalized
  function bubbleSize(c: EntityState): number {
    const st = ticketStats(c);
    const rev = Math.log10(1 + (Number(c.state?.total_revenue_chf) || 0));
    const score = st.open * 0.6 + rev * 10 + st.urgent * 3 + st.overdue * 2;
    return Math.max(96, Math.min(180, 96 + score * 4));
  }

  // ─── Health score ─────────────────────────────────────
  function healthScore(c: EntityState, stats: ReturnType<typeof ticketStats>): number {
    let s = 50;
    if (Number(c.state?.monthly_revenue) > 0) s += 15;
    if (stats.open > 0 && stats.done > 0) s += 10;
    if (stats.overdue > 0) s -= stats.overdue * 8;
    if (stats.urgent > 0) s -= stats.urgent * 5;
    const stage = (c.state?.stage || c.state?.contract_status || "").toLowerCase();
    if (/active|retain/.test(stage)) s += 10;
    if (/dormant|lost|churned/.test(stage)) s -= 15;
    return Math.max(0, Math.min(100, s));
  }

  // ─── Formatters ──────────────────────────────────────
  function fmtCHF(n: number | null | undefined): string {
    if (n == null || !Number.isFinite(Number(n))) return "-";
    return "CHF " + Math.round(Number(n)).toLocaleString("de-CH");
  }
  function fmtMonthly(c: EntityState): string {
    const r = Number(c.state?.monthly_revenue) || 0;
    return r > 0 ? fmtCHF(r) + "/mo" : "-";
  }

  function openPlaneTicket(tid: string) {
    if (typeof window !== "undefined") window.open(`https://app.plane.so/c2moviez/browse/${tid}/`, "_blank");
  }

  function handleDrawerKey(e: KeyboardEvent) {
    if (e.key === "Escape") selected = null;
  }

  // ─── Last contact helper ──────────────────────────────
  function lastContactDays(c: EntityState): number | null {
    const d = c.state?.last_contact || c.state?.last_meeting || c.updated_at;
    if (!d) return null;
    return Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
  }

  function lastContactLabel(days: number | null): string {
    if (days === null) return "no data";
    if (days === 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    return `${Math.floor(days / 30)}mo ago`;
  }

  // ─── Today's date eyebrow ────────────────────────────
  const todayStr = new Date().toLocaleDateString("en-CH", { day: "2-digit", month: "short", year: "numeric" });
</script>

<svelte:window onkeydown={handleDrawerKey} />

<!-- Stage header -->
<header class="page-header">
  <div class="header-left">
    <span class="eyebrow">CLIENTS · {todayStr}</span>
    <h1 class="page-title">Client gallery</h1>
    <p class="page-sub">{clients.length} clients · live neural sync</p>
  </div>
  <LiveBadge />
</header>

<!-- Top bar: filter chips + search -->
<div class="topbar">
  <div class="chips">
    <button
      type="button"
      class="chip {statusFilter === '' ? 'chip-active' : ''}"
      onclick={() => (statusFilter = "")}
    >
      All
      <span class="chip-count">{clients.length}</span>
    </button>
    {#each (Object.entries(STATUS_META) as [StatusKey, typeof STATUS_META.active][]) as [key, meta]}
      <button
        type="button"
        class="chip {statusFilter === key ? 'chip-active' : ''}"
        style="--dot:{meta.color}"
        onclick={() => (statusFilter = statusFilter === key ? "" : key)}
      >
        <span class="chip-dot"></span>
        {meta.label}
        <span class="chip-count">{counts[key]}</span>
      </button>
    {/each}
  </div>

  <div class="search-wrap">
    <svg class="search-icon" width="15" height="15" viewBox="0 0 15 15" fill="none">
      <circle cx="6.5" cy="6.5" r="5" stroke="var(--ink-3)" stroke-width="1.4"/>
      <path d="M10.5 10.5L13.5 13.5" stroke="var(--ink-3)" stroke-width="1.4" stroke-linecap="round"/>
    </svg>
    <input class="search-input" type="search" placeholder="Search clients..." bind:value={q} />
    {#if q || statusFilter}
      <button class="clear-btn" onclick={() => { statusFilter = ""; q = ""; }}>clear</button>
    {/if}
  </div>
</div>

<!-- Card grid -->
{#if loading}
  <StateLoading label="Loading clients..." />
{:else if sorted.length === 0}
  <StateEmpty icon="search" title="No clients match" body="Try a different filter or search term." />
{:else}
  <div class="card-grid">
    {#each sorted as { c, status }}
      {@const meta = STATUS_META[status]}
      {@const st = ticketStats(c)}
      {@const score = healthScore(c, st)}
      {@const days = lastContactDays(c)}
      {@const ringColor = score >= 60 ? "var(--brand)" : score >= 30 ? "var(--warn)" : "var(--danger)"}
      {@const circumference = 138.23}
      {@const dash = circumference * score / 100}
      <button
        type="button"
        class="client-card glass-card lift"
        onclick={() => (selected = c)}
        aria-label="{c.state?.name || c.entity_id} - {meta.label}"
      >
        <!-- Status dot -->
        <span class="status-dot" style="background:{meta.color}"></span>

        <!-- Top row: logo + health ring -->
        <div class="card-top">
          <div class="logo-placeholder">
            {(c.entity_id || "?").charAt(0).toUpperCase()}
          </div>
          <svg class="health-ring" width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">
            <!-- track -->
            <circle
              cx="28" cy="28" r="22"
              fill="none"
              stroke="var(--brand-line)"
              stroke-width="4"
            />
            <!-- arc -->
            <circle
              cx="28" cy="28" r="22"
              fill="none"
              stroke={ringColor}
              stroke-width="4"
              stroke-linecap="round"
              stroke-dasharray="{dash} {circumference}"
              transform="rotate(-90 28 28)"
            />
            <!-- score label -->
            <text
              x="28" y="32"
              text-anchor="middle"
              font-family="'JetBrains Mono', monospace"
              font-size="11"
              font-weight="500"
              fill="var(--ink)"
            >{score}</text>
          </svg>
        </div>

        <!-- Client name + code -->
        <div class="card-name">{c.state?.name || c.entity_id}</div>
        <div class="card-code">{c.entity_id}</div>

        <!-- Footer row: MRR + last contact -->
        <div class="card-footer">
          <span class="card-mrr">{fmtMonthly(c)}</span>
          {#if days !== null}
            <span class="contact-pill {days > 30 ? 'pill-danger' : days > 14 ? 'pill-warn' : 'pill-ok'}">
              {lastContactLabel(days)}
            </span>
          {/if}
        </div>
      </button>
    {/each}
  </div>
{/if}

{#if selected}
  {@const status = classifyStatus(selected)}
  {@const meta = STATUS_META[status]}
  <ClientDrawer
    client={selected}
    tickets={tickets}
    accent={meta.color}
    accentGlow={meta.glow}
    statusLabel={meta.label}
    onClose={() => (selected = null)}
  />
{/if}

<style>
  /* ── Page header ── */
  .page-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }
  .header-left {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .eyebrow {
    font-family: "JetBrains Mono", monospace;
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.18em;
    color: var(--brand);
    text-transform: uppercase;
  }
  .page-title {
    font-size: clamp(24px, 3.5vw, 34px);
    font-weight: 700;
    letter-spacing: -0.02em;
    color: var(--ink);
    line-height: 1.1;
    margin: 0;
  }
  .page-sub {
    font-size: 13px;
    color: var(--ink-3);
    margin: 0;
  }

  /* ── Top bar ── */
  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .chip {
    all: unset;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.06em;
    color: var(--ink-2);
    background: var(--canvas-2);
    border: 1px solid var(--brand-line);
    transition: background var(--dur) var(--ease), border-color var(--dur) var(--ease), color var(--dur) var(--ease);
  }
  .chip:hover {
    background: var(--brand-soft);
    border-color: var(--brand);
    color: var(--brand-deep);
  }
  .chip-active {
    background: var(--brand-soft);
    border-color: var(--brand);
    color: var(--brand-deep);
    font-weight: 600;
  }
  .chip-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--dot, var(--ink-3));
    flex-shrink: 0;
  }
  .chip-count {
    font-family: "JetBrains Mono", monospace;
    font-size: 10px;
    color: var(--ink-3);
  }

  /* ── Search ── */
  .search-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--canvas-2);
    border: 1px solid var(--brand-line);
    border-radius: var(--r2);
    padding: 8px 12px;
    min-width: 240px;
    transition: border-color var(--dur) var(--ease);
  }
  .search-wrap:focus-within {
    border-color: var(--brand);
    box-shadow: 0 0 0 3px var(--brand-soft);
  }
  .search-icon {
    flex-shrink: 0;
  }
  .search-input {
    all: unset;
    font-size: 13px;
    color: var(--ink);
    flex: 1;
    min-width: 0;
  }
  .search-input::placeholder {
    color: var(--ink-3);
  }
  .clear-btn {
    all: unset;
    cursor: pointer;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.08em;
    color: var(--ink-3);
    padding: 2px 6px;
    border-radius: var(--r1);
    transition: color var(--dur) var(--ease);
  }
  .clear-btn:hover {
    color: var(--brand-deep);
  }

  /* ── Card grid ── */
  .card-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
  }
  @media (max-width: 900px) {
    .card-grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 520px) {
    .card-grid { grid-template-columns: 1fr; }
  }

  /* ── Glass card base ── */
  .glass-card {
    background: var(--glass-card);
    backdrop-filter: var(--blur-card);
    -webkit-backdrop-filter: var(--blur-card);
    border: 1px solid var(--brand-line);
    border-radius: var(--r3);
    box-shadow: var(--sh-card);
  }
  .glass-card.lift:hover {
    transform: translateY(-1px);
    box-shadow: var(--sh-card-hover);
  }

  /* ── Client card ── */
  .client-card {
    all: unset;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 18px 16px 14px;
    position: relative;
    text-align: left;
    transition: transform var(--dur-2) var(--ease), box-shadow var(--dur-2) var(--ease);
  }

  /* Status dot top-left corner */
  .status-dot {
    position: absolute;
    top: 14px;
    left: 14px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  /* ── Card top row: logo + ring ── */
  .card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-left: 18px; /* offset status dot */
  }

  .logo-placeholder {
    width: 48px;
    height: 48px;
    border-radius: var(--r2);
    background: var(--brand-soft);
    display: grid;
    place-items: center;
    font-size: 18px;
    font-weight: 700;
    color: var(--ink-3);
    flex-shrink: 0;
    letter-spacing: 0;
  }

  .health-ring {
    flex-shrink: 0;
  }

  /* ── Card body ── */
  .card-name {
    font-size: 17px;
    font-weight: 600;
    color: var(--ink);
    line-height: 1.2;
    letter-spacing: -0.01em;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .card-code {
    font-family: "JetBrains Mono", monospace;
    font-size: 11px;
    font-weight: 400;
    color: var(--ink-3);
    letter-spacing: 0.06em;
    margin-top: -4px;
  }

  /* ── Card footer ── */
  .card-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-top: auto;
    padding-top: 6px;
    border-top: 1px solid var(--brand-line);
  }
  .card-mrr {
    font-family: "JetBrains Mono", monospace;
    font-size: 12px;
    font-weight: 500;
    color: var(--ink-2);
    letter-spacing: 0.04em;
  }

  /* Last contact pill */
  .contact-pill {
    font-size: 10px;
    font-weight: 500;
    padding: 3px 8px;
    border-radius: 999px;
    letter-spacing: 0.04em;
    white-space: nowrap;
  }
  .pill-ok {
    background: var(--success-soft);
    color: var(--success);
  }
  .pill-warn {
    background: var(--warn-soft);
    color: var(--warn);
  }
  .pill-danger {
    background: var(--danger-soft);
    color: var(--danger);
  }
</style>

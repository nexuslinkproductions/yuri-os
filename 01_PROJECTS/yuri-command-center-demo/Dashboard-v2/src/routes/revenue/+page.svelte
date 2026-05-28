<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { listEntityState, subscribeEntityState, type EntityState } from "$lib/db";
  import GlassCard from "$components/GlassCard.svelte";
  import GlassStat from "$components/GlassStat.svelte";
  import LiveBadge from "$components/LiveBadge.svelte";

  let clients = $state<EntityState[]>([]);
  let finance = $state<Record<string, Record<string, any>>>({});
  let loading = $state(true);
  let unsub: (() => void) | null = null;

  type BexioOverview = {
    ok: boolean;
    totals: {
      gross_all_time: number;
      gross_ytd: number;
      gross_last_30: number;
      gross_last_90: number;
      outstanding_ar: number;
      invoice_count: number;
      customer_count: number;
    };
    aging: { "0-30": number; "31-60": number; "61-90": number; "90+": number };
    top_customers: { id: number; name: string; revenue: number; invoices: number; last_invoice: string }[];
    months: { month: string; gross: number }[];
    months_paid: { month: string; gross: number }[];
    months_invoiced: { month: string; gross: number }[];
    fetched_at: string;
  };
  let bexio = $state<BexioOverview | null>(null);
  let bexioLoading = $state(true);
  let bexioErr = $state("");

  let unsubBexio: (() => void) | null = null;

  onMount(async () => {
    // Load client financial data from vault-synced entity_state (client_finance)
    const [clientRows, financeRows] = await Promise.all([
      listEntityState("client", 200),
      listEntityState("client_finance", 200),
    ]);
    // Build finance lookup: kuerzel → state
    const finMap: Record<string, Record<string, any>> = {};
    for (const r of financeRows) finMap[r.entity_id] = r.state ?? {};
    finance = finMap;
    // Merge finance fields into client rows so downstream computed values work
    clients = clientRows.map(c => ({
      ...c,
      state: { ...finMap[c.entity_id], ...c.state },
    }));
    loading = false;
    unsub = subscribeEntityState("client", row => {
      clients = [{ ...row, state: { ...finance[row.entity_id], ...row.state } },
                 ...clients.filter(c => c.entity_id !== row.entity_id)].slice(0, 200);
    });

    // Bexio overview — pushed to Supabase hourly from a local launchd agent
    try {
      const rows = await listEntityState("bexio_overview", 1);
      if (rows.length > 0 && rows[0].state) {
        bexio = { ok: true, ...(rows[0].state as any) };
      } else {
        bexioErr = "no Bexio snapshot yet — sync runs hourly";
      }
    } catch (e: any) { bexioErr = e.message || String(e); }
    finally { bexioLoading = false; }

    // Live update when the hourly sync writes a new snapshot
    unsubBexio = subscribeEntityState("bexio_overview", row => {
      if (row?.state) bexio = { ok: true, ...(row.state as any) };
    });
  });
  onDestroy(() => { unsub?.(); unsubBexio?.(); });

  function num(v: any): number { return Number(v) || 0; }
  function fmt(n: number) { return "CHF " + Math.round(n).toLocaleString("de-CH"); }
  function fmtShort(n: number) {
    if (n >= 1000000) return "CHF " + (n / 1000000).toFixed(1) + "M";
    if (n >= 1000) return "CHF " + (n / 1000).toFixed(1) + "k";
    return "CHF " + Math.round(n);
  }

  const recurring  = $derived(clients.filter(c => num(c.state?.monthly_revenue) > 0));
  const mrr        = $derived(recurring.reduce((s, c) => s + num(c.state?.monthly_revenue), 0));
  const arr        = $derived(mrr * 12);
  const oneTime    = $derived(clients.filter(c => num(c.state?.total_value) > 0 && num(c.state?.monthly_revenue) === 0));
  const pipeline   = $derived(oneTime.reduce((s, c) => s + num(c.state?.total_value), 0));

  // Forecast: locked ARR vs speculative pipeline
  const lockedArr = $derived(clients
    .filter(c => {
      const cs = (c.state?.contract_status || "").toLowerCase();
      const bt = (c.state?.billing_type || "").toLowerCase();
      return (cs === "active" || /year|retain|month/.test(bt)) && num(c.state?.monthly_revenue) > 0;
    })
    .reduce((s, c) => s + num(c.state?.monthly_revenue) * 12, 0));
  const speculativeArr = $derived(clients
    .filter(c => {
      const cs = (c.state?.contract_status || "").toLowerCase();
      const stage = (c.state?.stage || "").toLowerCase();
      return /pre[-_ ]?contract|transition|proposal|negot/.test(cs + " " + stage);
    })
    .reduce((s, c) => s + Math.max(num(c.state?.monthly_revenue) * 12, num(c.state?.total_value)), 0));
  const totalForecast = $derived(lockedArr + speculativeArr);

  // Contract-end heatmap: clients with contract_end within next 90 days
  type HeatRow = { client: EntityState; days: number; severity: "red" | "amber" | "yellow" | "green" };
  const contractHeatmap = $derived((() => {
    const out: HeatRow[] = [];
    const now = Date.now();
    for (const c of clients) {
      const end = c.state?.contract_end;
      if (!end) continue;
      const t = new Date(end).getTime();
      if (isNaN(t)) continue;
      const days = Math.floor((t - now) / 86400_000);
      if (days < 0 || days > 90) continue;
      let severity: HeatRow["severity"];
      if (days <= 14)      severity = "red";
      else if (days <= 30) severity = "amber";
      else if (days <= 60) severity = "yellow";
      else                 severity = "green";
      out.push({ client: c, days, severity });
    }
    return out.sort((a, b) => a.days - b.days);
  })());

  // Sparkline hover — chart uses months_invoiced (all statuses, matches Bexio dashboard exactly)
  let hoverIdx = $state<number | null>(null);
  const chartMonths = $derived(bexio?.months_invoiced ?? bexio?.months ?? []);
  const hoverMonth = $derived(hoverIdx !== null && chartMonths[hoverIdx] ? chartMonths[hoverIdx] : null);

  const byBilling = $derived((() => {
    const m: Record<string, number> = {};
    for (const c of clients) {
      const t = c.state?.billing_type || c.state?.contract_type || "—";
      m[t] = (m[t] || 0) + num(c.state?.monthly_revenue);
    }
    return Object.entries(m).filter(([, v]) => v > 0).sort(([, a], [, b]) => b - a);
  })());

  // 12-month chart — uses months_invoiced (all non-cancelled, matches Bexio dashboard exactly)
  const chartMax = $derived(chartMonths.length > 0 ? Math.max(...chartMonths.map(m => m.gross), 1) : 1);
  const chartPath = $derived(chartMonths.length > 1 ? chartMonths.map((m, i) => {
    const x = (i / (chartMonths.length - 1)) * 100;
    const y = 100 - (m.gross / chartMax) * 90;
    return (i === 0 ? "M" : "L") + x.toFixed(2) + "," + y.toFixed(2);
  }).join(" ") : "");
  const chartArea = $derived(chartPath ? chartPath + " L100,100 L0,100 Z" : "");

  // Forecast line: last 3 months projected
  const forecastPath = $derived((() => {
    if (chartMonths.length < 2) return "";
    const last = chartMonths[chartMonths.length - 1];
    const secondLast = chartMonths[chartMonths.length - 2];
    const avg = (last.gross + secondLast.gross) / 2;
    const startX = ((chartMonths.length - 1) / (chartMonths.length - 1)) * 100;
    const startY = 100 - (last.gross / chartMax) * 90;
    const pts: string[] = [`M${startX.toFixed(2)},${startY.toFixed(2)}`];
    for (let i = 1; i <= 3; i++) {
      const fx = startX + (i / 3) * 15;
      const fy = 100 - (avg / chartMax) * 90;
      pts.push(`L${fx.toFixed(2)},${fy.toFixed(2)}`);
    }
    return pts.join(" ");
  })());

  const agingTotal = $derived(bexio ? bexio.aging["0-30"] + bexio.aging["31-60"] + bexio.aging["61-90"] + bexio.aging["90+"] : 0);
  function agingPct(v: number): number { return agingTotal > 0 ? (v / agingTotal) * 100 : 0; }

  function monthShort(ym: string) {
    if (!ym) return "";
    const [y, m] = ym.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleString("de-CH", { month: "short" });
  }

  function whenFetched(iso: string): string {
    if (!iso) return "";
    const d = new Date(iso);
    const h = String(d.getHours()).padStart(2, "0");
    const m = String(d.getMinutes()).padStart(2, "0");
    return `${h}:${m}`;
  }

  // Current month/year label for header
  const currentMonthYear = $derived(new Date().toLocaleString("en-GB", { month: "long", year: "numeric" }));

  // Top 10 clients by MRR for revenue bars
  const topBar = $derived([...recurring]
    .sort((a, b) => num(b.state?.monthly_revenue) - num(a.state?.monthly_revenue))
    .slice(0, 10));
  const maxBarMrr = $derived(topBar.length > 0 ? num(topBar[0].state?.monthly_revenue) : 1);

  // MRR gauge arc fill
  // The half-circle arc (r=90, 180°) has length π×90 ≈ 282.74.
  // We use stroke-dashoffset rather than varying stroke-dasharray so the
  // arc reliably animates from zero to the target fill on every mount/update.
  const gaugeArcLen = 282.7;
  const gaugeFill = $derived(gaugeArcLen * Math.min(mrr / 25000, 1));

  // Ref to the fill <path> so we can drive the dashoffset animation from JS
  let gaugeArcEl = $state<SVGPathElement | null>(null);
  $effect(() => {
    if (!gaugeArcEl) return;
    // Reset to empty, then animate to target fill in next tick
    gaugeArcEl.style.strokeDasharray  = `${gaugeArcLen} ${gaugeArcLen}`;
    gaugeArcEl.style.strokeDashoffset = `${gaugeArcLen}`;
    const target = gaugeArcLen - gaugeFill;
    // rAF ensures the reset paint lands before the transition fires
    requestAnimationFrame(() => {
      if (!gaugeArcEl) return;
      gaugeArcEl.style.strokeDashoffset = `${target}`;
    });
  });
</script>

<!-- ═══════════════════════════════════════════════════════
     STAGE HEADER
     ═══════════════════════════════════════════════════════ -->
<div class="stage">
  <div class="stage-header">
    <div class="stage-text">
      <span class="eyebrow">REVENUE · {currentMonthYear}</span>
      <h1 class="stage-h1">Financial pulse</h1>
      <p class="stage-sub">Bexio live · Supabase MRR</p>
    </div>
    <LiveBadge />
  </div>

  <!-- ═══════════════════════════════════════════════════════
       HERO CARD — MRR Gauge + KPI tiles + Bexio sync chip
       ═══════════════════════════════════════════════════════ -->
  <div class="glass-card hero-card" data-theme="light">
    <div class="hero-body">
      <!-- Left: MRR half-gauge -->
      <div class="gauge-wrap">
        <svg viewBox="0 0 200 100" width="200" height="100" class="gauge-svg">
          <defs>
            <linearGradient id="gauge-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stop-color="var(--brand)" stop-opacity="0.7" />
              <stop offset="100%" stop-color="var(--brand-deep)" stop-opacity="1" />
            </linearGradient>
          </defs>
          <!-- Track -->
          <path
            d="M10,100 A90,90 0 0,1 190,100"
            fill="none"
            stroke="var(--brand-line)"
            stroke-width="10"
            stroke-linecap="round"
          />
          <!-- Fill arc — animated via stroke-dashoffset driven by $effect -->
          <path
            bind:this={gaugeArcEl}
            d="M10,100 A90,90 0 0,1 190,100"
            fill="none"
            stroke="url(#gauge-grad)"
            stroke-width="10"
            stroke-linecap="round"
            class="gauge-arc"
          />
          <!-- Center label -->
          <text x="100" y="82" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="18" font-weight="500" fill="var(--ink)">{fmtShort(mrr)}</text>
          <text x="100" y="97" text-anchor="middle" font-family="'Inter', sans-serif" font-size="9" fill="var(--ink-3)" letter-spacing="0.06em">CHF / month</text>
        </svg>
      </div>

      <!-- Right: KPI tiles -->
      <div class="hero-kpis">
        <div class="kpi-tile">
          <span class="kpi-label">ARR</span>
          <span class="kpi-value">{fmtShort(arr)}</span>
        </div>
        <div class="kpi-tile">
          <span class="kpi-label">YTD GROSS</span>
          <span class="kpi-value">{fmtShort(bexio?.totals.gross_ytd ?? 0)}</span>
        </div>
        <div class="kpi-tile">
          <span class="kpi-label">OUTSTANDING AR</span>
          <span class="kpi-value kpi-warn">{fmtShort(bexio?.totals.outstanding_ar ?? 0)}</span>
        </div>
      </div>
    </div>

    <!-- Bexio sync chip -->
    <div class="sync-chip">
      <span class="sync-dot"></span>
      <span class="sync-text">
        {#if bexio?.fetched_at}
          Synced {whenFetched(bexio.fetched_at)} · {bexio?.totals.invoice_count ?? 0} paid YTD
        {:else if bexioLoading}
          Loading Bexio...
        {:else if bexioErr}
          {bexioErr}
        {:else}
          No Bexio snapshot yet
        {/if}
      </span>
    </div>
  </div>

  <!-- ═══════════════════════════════════════════════════════
       REVENUE BARS — Per-client MRR
       ═══════════════════════════════════════════════════════ -->
  <div class="glass-card lift bars-card">
    <div class="bars-header">
      <h2 class="section-title">Revenue by client</h2>
      <span class="section-count">{topBar.length} clients</span>
    </div>
    {#if loading}
      <p class="empty-msg">Loading...</p>
    {:else if topBar.length === 0}
      <p class="empty-msg">No recurring revenue recorded.</p>
    {:else}
      <ul class="bars-list">
        {#each topBar as c, i}
          {@const pct = maxBarMrr > 0 ? (num(c.state?.monthly_revenue) / maxBarMrr) * 100 : 0}
          <li class="bar-row" style="--stagger: {i * 40}ms">
            <span class="bar-code">{c.entity_id}</span>
            <div class="bar-track">
              <span class="bar-fill" style="width: {pct}%"></span>
            </div>
            <span class="bar-amount">{fmt(num(c.state?.monthly_revenue))}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <!-- ═══════════════════════════════════════════════════════
       FORECAST STRIP
       ═══════════════════════════════════════════════════════ -->
  <div class="glass-card forecast-card">
    <div class="forecast-head">
      <div>
        <span class="fc-eyebrow">ARR FORECAST</span>
        <span class="fc-sub">committed vs speculative · updates in realtime</span>
      </div>
      <span class="fc-total">{fmtShort(totalForecast)}</span>
    </div>
    <div class="fc-bar-track">
      {#if totalForecast > 0}
        <span class="fc-seg fc-locked" style="width: {(lockedArr / totalForecast) * 100}%" title="Locked ARR: {fmt(lockedArr)}"></span>
        <span class="fc-seg fc-spec" style="width: {(speculativeArr / totalForecast) * 100}%" title="Speculative: {fmt(speculativeArr)}"></span>
      {:else}
        <span class="fc-empty">No forecast data yet</span>
      {/if}
    </div>
    <div class="fc-legend">
      <span class="fc-tag fc-locked-tag">&#9679; Locked ARR {fmt(lockedArr)}</span>
      <span class="fc-tag fc-spec-tag">&#9679; Speculative {fmt(speculativeArr)}</span>
    </div>
  </div>

  <!-- ═══════════════════════════════════════════════════════
       CONTRACT-END HEATMAP (next 90d)
       ═══════════════════════════════════════════════════════ -->
  <div class="heatmap-section">
    <div class="section-head">
      <div>
        <h2 class="section-h2">Contract-end heatmap</h2>
        <span class="section-sub">contracts ending in next 90 days</span>
      </div>
      <span class="count-badge">{contractHeatmap.length}</span>
    </div>
    {#if contractHeatmap.length === 0}
      <p class="empty-msg">No <code>contract_end</code> dates set on any client yet.</p>
    {:else}
      <div class="heatmap-grid">
        {#each contractHeatmap as h}
          <a class="heat-card sev-{h.severity}" href="/clients?open={h.client.entity_id}">
            <div class="heat-top">
              <span class="heat-code">{h.client.entity_id}</span>
              <span class="heat-chip sev-{h.severity}">{h.days}d</span>
            </div>
            <p class="heat-name">{h.client.state?.name || h.client.entity_id}</p>
            <span class="heat-date">ends {h.client.state?.contract_end}</span>
          </a>
        {/each}
      </div>
    {/if}
  </div>

  <!-- ═══════════════════════════════════════════════════════
       PLANE MRR KPIs
       ═══════════════════════════════════════════════════════ -->
  <div class="kpi-grid">
    <GlassStat label="MRR (contracted)"    value={mrr}              unit="CHF" tone="ok"   idx={9} />
    <GlassStat label="ARR (projected)"     value={arr}              unit="CHF" tone="ok"   idx={10} />
    <GlassStat label="ONE-OFF QUEUE"       value={pipeline}         unit="CHF"             idx={11} />
    <GlassStat label="RECURRING ACCOUNTS"  value={recurring.length}                        idx={12} />
  </div>

  <!-- ═══════════════════════════════════════════════════════
       BOTTOM TWO-COL: TREND CHART + AGING
       ═══════════════════════════════════════════════════════ -->
  {#if bexio}
    <div class="bottom-cols">

      <!-- Trend chart -->
      <div class="glass-card lift chart-card">
        <div class="chart-head">
          <h3 class="section-title">12-month revenue trend</h3>
          {#if hoverMonth}
            <span class="hover-tip">{monthShort(hoverMonth.month)} {hoverMonth.month.split("-")[0]} · {fmt(hoverMonth.gross)}</span>
          {:else}
            <span class="chart-total">{chartMonths.reduce((s, m) => s + m.gross, 0).toLocaleString("de-CH", { maximumFractionDigits: 0 })} CHF invoiced</span>
          {/if}
        </div>
        <svg viewBox="0 0 115 100" preserveAspectRatio="none" class="trend-svg" onmouseleave={() => hoverIdx = null}>
          <defs>
            <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="var(--brand)" stop-opacity="0.30" />
              <stop offset="100%" stop-color="var(--brand)" stop-opacity="0" />
            </linearGradient>
          </defs>
          <path d={chartArea} fill="url(#trend-fill)" />
          <path d={chartPath} fill="none" stroke="var(--brand)" stroke-width="0.8" vector-effect="non-scaling-stroke" />
          {#if forecastPath}
            <path d={forecastPath} fill="none" stroke="var(--brand)" stroke-width="0.7" stroke-dasharray="4 4" opacity="0.55" vector-effect="non-scaling-stroke" />
          {/if}
          {#each chartMonths as m, i}
            {@const cx = chartMonths.length > 1 ? (i / (chartMonths.length - 1)) * 100 : 50}
            {@const cy = 100 - (m.gross / chartMax) * 90}
            <circle cx={cx} cy={cy} r={hoverIdx === i ? 2.2 : 1.2} fill="var(--brand)" stroke="var(--canvas-2)" stroke-width="0.4" />
            <rect
              x={cx - 4.5} y={0} width={9} height={100}
              fill="transparent"
              onmouseenter={() => hoverIdx = i}
            />
          {/each}
        </svg>
        <div class="month-labels" style="grid-template-columns: repeat({chartMonths.length}, 1fr)">
          {#each chartMonths as m, i}
            <span class="mlabel {hoverIdx === i ? 'mlabel-active' : ''}">{monthShort(m.month)}</span>
          {/each}
        </div>
      </div>

      <!-- AR Aging -->
      <div class="glass-card lift aging-card">
        <h3 class="section-title" style="margin-bottom: 16px;">AR aging</h3>
        {#if agingTotal === 0}
          <p class="empty-msg">No outstanding receivables.</p>
        {:else}
          <ul class="aging-list">
            <li class="aging-row">
              <span class="aging-label">0-30 d</span>
              <div class="aging-track"><span class="aging-fill" style="width:{agingPct(bexio.aging['0-30'])}%; background: var(--success);"></span></div>
              <span class="aging-val">{fmtShort(bexio.aging["0-30"])}</span>
            </li>
            <li class="aging-row">
              <span class="aging-label">31-60 d</span>
              <div class="aging-track"><span class="aging-fill" style="width:{agingPct(bexio.aging['31-60'])}%; background: var(--brand);"></span></div>
              <span class="aging-val">{fmtShort(bexio.aging["31-60"])}</span>
            </li>
            <li class="aging-row">
              <span class="aging-label">61-90 d</span>
              <div class="aging-track"><span class="aging-fill" style="width:{agingPct(bexio.aging['61-90'])}%; background: var(--warn);"></span></div>
              <span class="aging-val">{fmtShort(bexio.aging["61-90"])}</span>
            </li>
            <li class="aging-row">
              <span class="aging-label">90+ d</span>
              <div class="aging-track"><span class="aging-fill" style="width:{agingPct(bexio.aging['90+'])}%; background: var(--danger);"></span></div>
              <span class="aging-val">{fmtShort(bexio.aging["90+"])}</span>
            </li>
          </ul>
        {/if}
      </div>
    </div>

    <!-- Bexio top customers table -->
    <div class="glass-card lift top-cust-card">
      <h3 class="section-title" style="margin-bottom: 14px;">Top customers (lifetime gross)</h3>
      {#if bexio.top_customers.length === 0}
        <p class="empty-msg">No customers.</p>
      {:else}
        <table class="cust-table">
          <thead>
            <tr>
              <th>#</th><th>Customer</th><th>Invoices</th><th>Last invoice</th><th class="ta-r">Gross</th>
            </tr>
          </thead>
          <tbody>
            {#each bexio.top_customers.slice(0, 10) as c, i}
              <tr>
                <td class="t-muted">{i + 1}</td>
                <td>{c.name || `bexio-${c.id}`}</td>
                <td class="t-mono">{c.invoices}</td>
                <td class="t-muted">{c.last_invoice || "-"}</td>
                <td class="t-mono ta-r t-success">{fmt(c.revenue)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>
  {:else if bexioLoading}
    <div class="glass-card loading-card">
      <span class="loading-dot"></span>
      <span class="loading-txt">Loading Bexio data...</span>
    </div>
  {/if}

  <!-- By contract type -->
  <div class="glass-card lift billing-card">
    <h2 class="section-title" style="margin-bottom: 14px;">By contract type</h2>
    {#if byBilling.length === 0}
      <p class="empty-msg">No data.</p>
    {:else}
      <ul class="billing-list">
        {#each byBilling as [type, value]}
          <li class="billing-row">
            <div class="billing-head">
              <span class="billing-type">{type}</span>
              <span class="billing-val">{fmt(value)}</span>
            </div>
            <div class="billing-track">
              <span class="billing-fill" style="width:{Math.min(100, (value / Math.max(mrr, 1)) * 100)}%"></span>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>

<style>
  /* ─── Page wrapper ─────────────────────────────────────── */
  .stage {
    display: flex;
    flex-direction: column;
    gap: 20px;
    font-family: 'Inter', -apple-system, sans-serif;
    color: var(--ink);
  }

  /* ─── Stage header ─────────────────────────────────────── */
  .stage-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    flex-wrap: wrap;
  }
  .eyebrow {
    display: block;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.22em;
    color: var(--brand-deep);
    text-transform: uppercase;
    margin-bottom: 6px;
  }
  .stage-h1 {
    font-size: 32px;
    font-weight: 700;
    color: var(--ink);
    margin: 0 0 4px;
    letter-spacing: -0.02em;
    line-height: 1.1;
  }
  .stage-sub {
    font-size: 13px;
    color: var(--ink-3);
    margin: 0;
  }

  /* ─── Glass card base ──────────────────────────────────── */
  .glass-card {
    background: var(--glass-card);
    backdrop-filter: var(--blur-card);
    -webkit-backdrop-filter: var(--blur-card);
    border: 1px solid var(--brand-line);
    border-radius: var(--r3);
    box-shadow: var(--sh-card);
  }
  .glass-card.lift {
    transition: transform var(--dur) var(--ease), box-shadow var(--dur) var(--ease);
  }
  .glass-card.lift:hover {
    transform: translateY(-1px);
    box-shadow: var(--sh-card-hover);
  }

  /* ─── Hero card ────────────────────────────────────────── */
  .hero-card {
    padding: 28px 32px 22px;
  }
  [data-theme="light"].hero-card {
    background: var(--glass-card);
    color: var(--ink);
  }
  .hero-body {
    display: flex;
    align-items: center;
    gap: 40px;
    flex-wrap: wrap;
  }
  .gauge-wrap {
    flex-shrink: 0;
  }
  .gauge-svg {
    display: block;
    overflow: visible;
  }
  .gauge-arc {
    transition: stroke-dashoffset 900ms var(--ease);
  }
  .hero-kpis {
    display: flex;
    flex-direction: column;
    gap: 12px;
    flex: 1;
    min-width: 200px;
  }
  .kpi-tile {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px 14px;
    background: var(--brand-soft);
    border: 1px solid var(--brand-line);
    border-radius: var(--r2);
  }
  .kpi-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.14em;
    color: var(--ink-3);
    text-transform: uppercase;
  }
  .kpi-value {
    font-family: 'JetBrains Mono', monospace;
    font-size: 24px;
    font-weight: 500;
    color: var(--ink);
    letter-spacing: -0.01em;
  }
  .kpi-warn {
    color: var(--warn);
  }

  /* Bexio sync chip */
  .sync-chip {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    margin-top: 18px;
    padding: 5px 12px;
    background: var(--glass-card);
    border: 1px solid var(--brand-line);
    border-radius: 999px;
    box-shadow: var(--sh-card);
    width: fit-content;
  }
  .sync-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--success);
    flex-shrink: 0;
    animation: sync-pulse 2.4s ease-in-out infinite;
  }
  @keyframes sync-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }
  .sync-text {
    font-size: 12px;
    color: var(--ink-2);
    font-family: 'Inter', sans-serif;
  }

  /* ─── Revenue bars ─────────────────────────────────────── */
  .bars-card {
    padding: 24px;
  }
  .bars-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }
  .section-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--ink);
    letter-spacing: 0.01em;
    margin: 0;
    text-transform: uppercase;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    letter-spacing: 0.14em;
    color: var(--ink-3);
  }
  .section-count {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: var(--ink-3);
  }
  .bars-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .bar-row {
    display: grid;
    grid-template-columns: 56px 1fr 100px;
    align-items: center;
    gap: 12px;
  }
  .bar-code {
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    color: var(--brand-deep);
    font-weight: 500;
    letter-spacing: 0.04em;
  }
  .bar-track {
    height: 28px;
    background: var(--brand-soft);
    border-radius: var(--r1, 12px);
    overflow: hidden;
    position: relative;
  }
  .bar-fill {
    display: block;
    height: 100%;
    background: var(--brand);
    border-radius: var(--r1, 12px);
    width: 0;
    animation: bar-grow var(--dur-2, 220ms) var(--ease, cubic-bezier(0.22,1,0.36,1)) both;
    animation-delay: var(--stagger, 0ms);
  }
  @keyframes bar-grow {
    from { width: 0; }
  }
  .bar-amount {
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    color: var(--ink);
    text-align: right;
  }

  /* ─── Forecast strip ───────────────────────────────────── */
  .forecast-card {
    padding: 20px 24px;
  }
  .forecast-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 14px;
  }
  .fc-eyebrow {
    display: block;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.18em;
    color: var(--brand);
    text-transform: uppercase;
    margin-bottom: 3px;
  }
  .fc-sub {
    font-size: 11px;
    color: var(--ink-3);
  }
  .fc-total {
    font-family: 'JetBrains Mono', monospace;
    font-size: 22px;
    color: var(--ink);
    letter-spacing: -0.01em;
    flex-shrink: 0;
  }
  .fc-bar-track {
    height: 10px;
    background: var(--brand-soft);
    border-radius: 999px;
    display: flex;
    overflow: hidden;
    margin-bottom: 10px;
  }
  .fc-seg {
    display: block;
    height: 100%;
    transition: width 600ms var(--ease, cubic-bezier(0.22,1,0.36,1));
  }
  .fc-locked { background: linear-gradient(90deg, var(--success), color-mix(in oklab, var(--success) 60%, white)); }
  .fc-spec { background: linear-gradient(90deg, var(--brand), var(--brand-deep)); opacity: 0.65; }
  .fc-empty { padding: 0 10px; color: var(--ink-3); font-size: 11px; line-height: 10px; }
  .fc-legend { display: flex; gap: 20px; flex-wrap: wrap; font-size: 11px; }
  .fc-locked-tag { color: var(--success); }
  .fc-spec-tag { color: var(--brand); }

  /* ─── Contract heatmap ─────────────────────────────────── */
  .heatmap-section {
    padding: 4px 0;
  }
  .section-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 14px;
    gap: 12px;
  }
  .section-h2 {
    font-size: 18px;
    font-weight: 600;
    color: var(--ink);
    margin: 0 0 3px;
  }
  .section-sub {
    font-size: 12px;
    color: var(--ink-3);
  }
  .count-badge {
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    color: var(--ink-3);
    background: var(--brand-soft);
    border: 1px solid var(--brand-line);
    border-radius: 999px;
    padding: 2px 10px;
  }
  .heatmap-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 10px;
  }
  .heat-card {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 12px 14px;
    background: var(--glass-card);
    backdrop-filter: var(--blur-card);
    -webkit-backdrop-filter: var(--blur-card);
    border: 1px solid var(--line);
    border-radius: var(--r2);
    box-shadow: var(--sh-card);
    text-decoration: none;
    color: var(--ink);
    transition: transform var(--dur) var(--ease), box-shadow var(--dur) var(--ease);
  }
  .heat-card:hover { transform: translateY(-2px); box-shadow: var(--sh-card-hover); }
  .heat-card.sev-red    { border-color: rgba(217,59,59,0.35); box-shadow: 0 0 0 1px rgba(217,59,59,0.15), var(--sh-card); }
  .heat-card.sev-amber  { border-color: rgba(201,142,0,0.30); }
  .heat-card.sev-yellow { border-color: rgba(201,142,0,0.20); }
  .heat-card.sev-green  { border-color: rgba(26,166,99,0.25); }
  .heat-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 6px;
  }
  .heat-code {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10.5px;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--brand-soft);
    color: var(--brand-deep);
    letter-spacing: 0.06em;
  }
  .heat-chip {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10.5px;
    padding: 2px 8px;
    border-radius: 999px;
    letter-spacing: 0.04em;
  }
  .heat-chip.sev-red    { background: var(--danger-soft); color: var(--danger); }
  .heat-chip.sev-amber  { background: var(--warn-soft); color: var(--warn); }
  .heat-chip.sev-yellow { background: var(--warn-soft); color: var(--warn); }
  .heat-chip.sev-green  { background: var(--success-soft); color: var(--success); }
  .heat-name { margin: 0; font-size: 13px; color: var(--ink); line-height: 1.3; }
  .heat-date { font-size: 11px; color: var(--ink-3); }

  /* ─── Plane KPI grid ───────────────────────────────────── */
  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
  }

  /* ─── Bottom two-col layout ────────────────────────────── */
  .bottom-cols {
    display: grid;
    grid-template-columns: 1.4fr 1fr;
    gap: 20px;
  }
  @media (max-width: 820px) {
    .bottom-cols { grid-template-columns: 1fr; }
  }

  /* ─── Trend chart ──────────────────────────────────────── */
  .chart-card {
    padding: 24px;
  }
  .chart-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
    gap: 8px;
  }
  .chart-total {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: var(--ink-3);
  }
  .hover-tip {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: var(--brand-deep);
    background: var(--brand-soft);
    border: 1px solid var(--brand-line);
    padding: 2px 8px;
    border-radius: 999px;
    letter-spacing: 0.04em;
  }
  .trend-svg {
    width: 100%;
    height: 140px;
    display: block;
  }
  .month-labels {
    display: grid;
    /* column count is set dynamically via inline style (matches actual chartMonths.length) */
    grid-template-columns: repeat(12, 1fr);
    gap: 2px;
    margin-top: 6px;
  }
  .mlabel {
    text-align: center;
    font-size: 9px;
    color: var(--ink-3);
    font-family: 'JetBrains Mono', monospace;
    letter-spacing: 0.04em;
  }
  .mlabel-active {
    color: var(--brand);
    font-weight: 600;
  }

  /* ─── AR Aging ─────────────────────────────────────────── */
  .aging-card {
    padding: 24px;
  }
  .aging-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .aging-row {
    display: grid;
    grid-template-columns: 64px 1fr 80px;
    align-items: center;
    gap: 10px;
  }
  .aging-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: var(--ink-3);
    letter-spacing: 0.06em;
  }
  .aging-track {
    height: 8px;
    background: var(--brand-soft);
    border-radius: 999px;
    overflow: hidden;
  }
  .aging-fill {
    display: block;
    height: 100%;
    border-radius: 999px;
    transition: width 600ms var(--ease, cubic-bezier(0.22,1,0.36,1));
  }
  .aging-val {
    text-align: right;
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    color: var(--ink);
  }

  /* ─── Top customers table ──────────────────────────────── */
  .top-cust-card { padding: 24px; }
  .cust-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  .cust-table th {
    text-align: left;
    color: var(--ink-3);
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    padding: 6px 8px;
    border-bottom: 1px solid var(--line);
  }
  .cust-table td {
    padding: 9px 8px;
    border-bottom: 1px solid var(--line);
    color: var(--ink);
  }
  .cust-table tbody tr:hover { background: var(--brand-softer, rgba(86,188,236,0.05)); }
  .ta-r { text-align: right !important; }
  .t-muted { color: var(--ink-3); font-size: 12px; }
  .t-mono { font-family: 'JetBrains Mono', monospace; }
  .t-success { color: var(--success); }

  /* ─── By contract type ─────────────────────────────────── */
  .billing-card { padding: 24px; }
  .billing-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .billing-row { }
  .billing-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 5px;
  }
  .billing-type {
    font-size: 13px;
    color: var(--ink-2);
  }
  .billing-val {
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    color: var(--ink);
  }
  .billing-track {
    height: 6px;
    background: var(--brand-soft);
    border-radius: 999px;
    overflow: hidden;
  }
  .billing-fill {
    display: block;
    height: 100%;
    background: linear-gradient(90deg, var(--brand), var(--brand-deep));
    border-radius: 999px;
    transition: width 600ms var(--ease, cubic-bezier(0.22,1,0.36,1));
  }

  /* ─── Loading/empty states ─────────────────────────────── */
  .empty-msg {
    font-size: 13px;
    color: var(--ink-3);
    margin: 0;
    padding: 8px 0;
  }
  .loading-card {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 20px 24px;
  }
  .loading-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--brand);
    animation: sync-pulse 1.4s ease-in-out infinite;
  }
  .loading-txt {
    font-size: 13px;
    color: var(--ink-3);
  }
</style>

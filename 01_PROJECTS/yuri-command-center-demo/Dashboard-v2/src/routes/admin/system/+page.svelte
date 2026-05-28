<script lang="ts">
  /**
   * /admin/system  P7 Admin / System.
   *
   * Live system control surface:
   *   1. Agent heartbeats        agent_heartbeat (active / idle / error chips,
   *                              relative "last seen", stale > 30 min orange)
   *   2. Module status grid      nex_module_status (per-module health card)
   *   3. Recent audit log feed   audit_log (last 20 rows, action-coloured)
   *
   * Data pulled in parallel via /api/functions/admin-system. Bearer auth
   * (CEO/CTO only, 403 otherwise). Refresh button for ad-hoc reload.
   */
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { user } from '$lib/stores/user.svelte';
  import { getAuthed } from '$lib/db';
  import AdminSubNav from '$lib/components/admin/AdminSubNav.svelte';

  type Agent = {
    agent_name: string;
    last_action: string | null;
    last_action_at: string | null;
    status: string | null;
    confidence: number | null;
  };
  type Module = {
    module_name: string;
    display_name: string;
    category: string;
    status: string;
    last_signal_at: string | null;
    notes: string | null;
    updated_at: string;
  };
  type AuditRow = {
    id: number | string;
    action: string;
    entity_type: string | null;
    entity_id: string | null;
    entity_name: string | null;
    actor: string | null;
    created_at: string;
    details: any;
  };

  let mounted = $state(false);
  let loading = $state(false);
  let errorMsg = $state<string | null>(null);

  let agents = $state<Agent[]>([]);
  let modules = $state<Module[]>([]);
  let audit = $state<AuditRow[]>([]);
  let serverNow = $state<string | null>(null);

  // Tick once per minute so "X min ago" stays current
  let nowMs = $state(Date.now());
  let tickHandle: ReturnType<typeof setInterval> | null = null;

  // Seconds-resolution clock for the "last refreshed" badge
  let lastRefreshMs = $state<number | null>(null);
  let secondsTick = $state(0);
  let secondsHandle: ReturnType<typeof setInterval> | null = null;
  const secondsSinceRefresh = $derived(
    lastRefreshMs ? Math.max(0, Math.floor((secondsTick - lastRefreshMs) / 1000)) : 0
  );

  const staleAgents = $derived(
    agents.filter((a) => agentMinutesAgo(a) !== null && (agentMinutesAgo(a) as number) > 30).length
  );
  const moduleHealthy = $derived(modules.filter((m) => m.status === 'active').length);
  const moduleDegraded = $derived(
    modules.filter((m) => m.status === 'degraded' || m.status === 'silent').length
  );
  const moduleDown = $derived(
    modules.filter((m) => m.status === 'not_initialized' || m.status === 'unknown').length
  );

  onMount(() => {
    (async () => {
      await user.init();
      if (!user.isAdmin) {
        goto('/');
        return;
      }
      await refresh();
      mounted = true;
    })();
    tickHandle = setInterval(() => { nowMs = Date.now(); }, 60_000);
    secondsHandle = setInterval(() => { secondsTick = Date.now(); }, 1000);
  });

  onDestroy(() => {
    if (tickHandle) clearInterval(tickHandle);
    tickHandle = null;
    if (secondsHandle) clearInterval(secondsHandle);
    secondsHandle = null;
  });

  async function refresh() {
    loading = true;
    errorMsg = null;
    try {
      const r = await getAuthed('/api/functions/admin-system');
      if (!r?.ok) {
        errorMsg = r?.error || 'Failed to load system status';
        return;
      }
      agents = Array.isArray(r.agents) ? r.agents : [];
      modules = Array.isArray(r.modules) ? r.modules : [];
      audit = Array.isArray(r.audit) ? r.audit : [];
      serverNow = r.now || null;
      nowMs = Date.now();
      lastRefreshMs = Date.now();
      secondsTick = Date.now();
    } catch (e: any) {
      errorMsg = e?.message || String(e);
    } finally {
      loading = false;
    }
  }

  function agentMinutesAgo(a: Agent): number | null {
    if (!a.last_action_at) return null;
    const t = new Date(a.last_action_at).getTime();
    if (!Number.isFinite(t)) return null;
    return Math.floor((nowMs - t) / 60_000);
  }

  function relTime(iso: string | null): string {
    if (!iso) return 'never';
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return 'never';
    const diffMs = nowMs - t;
    const mins = Math.floor(diffMs / 60_000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(iso).toLocaleDateString('en-CH', { day: '2-digit', month: 'short' });
  }

  function agentStatusKind(a: Agent): 'active' | 'idle' | 'error' | 'stale' | 'unknown' {
    const mins = agentMinutesAgo(a);
    if (mins !== null && mins > 30) return 'stale';
    const s = (a.status || '').toLowerCase();
    if (s === 'active' || s === 'running' || s === 'ok') return 'active';
    if (s === 'idle') return 'idle';
    if (s === 'error' || s === 'dead' || s === 'failed') return 'error';
    if (s === 'degraded') return 'idle';
    return 'unknown';
  }

  function moduleStatusKind(m: Module): 'active' | 'degraded' | 'silent' | 'init' | 'unknown' {
    switch (m.status) {
      case 'active':           return 'active';
      case 'degraded':         return 'degraded';
      case 'silent':           return 'silent';
      case 'not_initialized':  return 'init';
      default:                 return 'unknown';
    }
  }

  function actionKind(action: string): 'create' | 'update' | 'delete' | 'error' | 'other' {
    const a = (action || '').toLowerCase();
    if (a.startsWith('create') || a.includes('insert') || a.startsWith('add')) return 'create';
    if (a.startsWith('update') || a.startsWith('patch') || a.startsWith('edit') || a.startsWith('set')) return 'update';
    if (a.startsWith('delete') || a.startsWith('remove') || a.includes('drop')) return 'delete';
    if (a.includes('error') || a.includes('fail')) return 'error';
    return 'other';
  }

  function fmtTime(iso: string | null): string {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString('en-CH', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  function fmtConfidence(c: number | null): string {
    if (c === null || c === undefined) return '';
    return `${Math.round(Number(c) * 100)}%`;
  }
</script>

<svelte:head><title>NEX  System  Admin</title></svelte:head>

<div class="page">
  <AdminSubNav />

  <header class="head">
    <div>
      <span class="eyebrow">Admin / System</span>
      <h1>System control</h1>
      <p class="sub">Live agent heartbeats, module health, and the latest 20 audit events.</p>
    </div>
    <div class="head-right">
      {#if serverNow}
        <span class="server-now">Server time {fmtTime(serverNow)}</span>
      {/if}
      {#if lastRefreshMs}
        <span class="refresh-stamp">Refreshed {secondsSinceRefresh}s ago</span>
      {/if}
      <button type="button" class="glass-btn glass-btn--ghost" onclick={refresh} disabled={loading}>
        {loading ? 'Refreshing...' : 'Refresh'}
      </button>
    </div>
  </header>

  {#if !mounted}
    <div class="loading">Loading system status...</div>
  {:else if errorMsg}
    <div class="error-banner">
      <strong>Could not load:</strong> {errorMsg}
      <button type="button" class="glass-btn glass-btn--ghost" onclick={refresh}>Retry</button>
    </div>
  {:else}
    <!-- KPI strip -->
    <section class="kpi-strip">
      <div class="kpi">
        <span class="kpi__label">Agents</span>
        <span class="kpi__value">{agents.length}</span>
        {#if staleAgents > 0}
          <span class="kpi__sub kpi__sub--warn">{staleAgents} stale</span>
        {:else}
          <span class="kpi__sub">all fresh</span>
        {/if}
      </div>
      <div class="kpi">
        <span class="kpi__label">Modules</span>
        <span class="kpi__value">{modules.length}</span>
        <span class="kpi__sub">
          <span class="dot dot--ok"></span>{moduleHealthy}
          <span class="dot dot--warn"></span>{moduleDegraded}
          <span class="dot dot--off"></span>{moduleDown}
        </span>
      </div>
      <div class="kpi">
        <span class="kpi__label">Audit events</span>
        <span class="kpi__value">{audit.length}</span>
        <span class="kpi__sub">last 20</span>
      </div>
    </section>

    <!-- Agent heartbeats -->
    <section class="card">
      <header class="card__head">
        <h2>Agent heartbeats</h2>
        <span class="card__sub">{agents.length} agents tracked</span>
      </header>
      {#if agents.length === 0}
        <p class="empty">No heartbeats recorded yet.</p>
      {:else}
        <div class="table-wrap">
          <table class="agent-table">
            <thead>
              <tr>
                <th>Agent</th>
                <th>Status</th>
                <th>Last action</th>
                <th>Seen</th>
                <th class="num">Conf.</th>
              </tr>
            </thead>
            <tbody>
              {#each agents as a (a.agent_name + '|' + (a.last_action_at ?? ''))}
                {@const kind = agentStatusKind(a)}
                <tr class={kind === 'stale' ? 'row--stale' : ''}>
                  <td class="agent-name">
                    {#if kind === 'stale'}<span class="stale-warn" aria-label="Stale" title="Last seen > 30 min ago">⚠</span>{/if}
                    {a.agent_name}
                  </td>
                  <td>
                    <span class="status-chip status-chip--{kind}">{kind}</span>
                  </td>
                  <td class="agent-action">{a.last_action || '-'}</td>
                  <td class="agent-time">{relTime(a.last_action_at)}</td>
                  <td class="num">{fmtConfidence(a.confidence)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </section>

    <!-- Module status grid -->
    <section class="card">
      <header class="card__head">
        <h2>Module status</h2>
        <span class="card__sub">refreshed every 15 min by nex-rvf</span>
      </header>
      {#if modules.length === 0}
        <p class="empty">No module status rows yet.</p>
      {:else}
        <div class="module-grid">
          {#each modules as m (m.module_name)}
            {@const kind = moduleStatusKind(m)}
            <div class="mod-card mod-card--{kind}">
              <div class="mod-card__top">
                <span class="mod-card__title">{m.display_name || m.module_name}</span>
                <span class="status-chip status-chip--mod-{kind}">{m.status.replace(/_/g, ' ')}</span>
              </div>
              <div class="mod-card__meta">
                <span class="mod-card__cat">{m.category}</span>
                <span class="mod-card__time">{relTime(m.last_signal_at || m.updated_at)}</span>
              </div>
              {#if m.notes}
                <p class="mod-card__notes">{m.notes}</p>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <!-- Audit feed -->
    <section class="card">
      <header class="card__head">
        <h2>Recent audit log</h2>
        <span class="card__sub">last 20 events</span>
      </header>
      {#if audit.length === 0}
        <p class="empty">No recent audit events.</p>
      {:else}
        <ul class="audit-feed">
          {#each audit as row (row.id)}
            {@const ak = actionKind(row.action)}
            <li class="audit-row">
              <span class="audit-time">{fmtTime(row.created_at)}</span>
              <span class="audit-action audit-action--{ak}">{row.action}</span>
              {#if row.entity_type}
                <span class="audit-chip">{row.entity_type}</span>
              {/if}
              {#if row.entity_name || row.entity_id}
                <span class="audit-entity">{row.entity_name || row.entity_id}</span>
              {/if}
              {#if row.actor}
                <span class="audit-actor">by {row.actor}</span>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}
</div>

<style>
  .page {
    max-width: 1280px;
    margin: 0 auto;
    padding: 24px 24px 80px;
    font-family: var(--sa, Inter, sans-serif);
    color: var(--ink);
  }

  .head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
    margin-bottom: 20px;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--brand-line);
  }
  .eyebrow {
    font: 700 11px/1.3 var(--sa, Inter, sans-serif);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #56bcec;
  }
  .head h1 {
    margin: 6px 0 4px;
    font: 700 26px/1.15 var(--hd, Inter, sans-serif);
    letter-spacing: -0.02em;
    color: var(--ink);
  }
  .sub { margin: 0; font-size: 13px; color: var(--ink-3); }
  .head-right { display: flex; align-items: center; gap: 10px; }
  .server-now,
  .refresh-stamp {
    font: 500 12px/1 var(--mo, 'JetBrains Mono', monospace);
    color: var(--ink-3);
  }
  .refresh-stamp {
    padding: 4px 9px;
    border-radius: 999px;
    border: 1px solid var(--brand-line);
    background: rgba(86,188,236,0.05);
    color: #56bcec;
  }
  .stale-warn {
    display: inline-block;
    margin-right: 6px;
    color: #f0a045;
    font-size: 12px;
  }

  .loading,
  .empty {
    padding: 32px 16px;
    text-align: center;
    color: var(--ink-3);
    font-size: 13px;
    font-style: italic;
  }
  .error-banner {
    display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
    padding: 14px 16px;
    border-radius: 12px;
    border: 1px solid rgba(255, 92, 92, 0.40);
    background: rgba(255, 92, 92, 0.08);
    color: var(--ink);
    margin-bottom: 20px;
  }

  /* KPI strip */
  .kpi-strip {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    margin-bottom: 20px;
  }
  .kpi {
    padding: 16px 18px;
    border-radius: 14px;
    background: var(--glass-chrome);
    -webkit-backdrop-filter: var(--blur-chrome);
    backdrop-filter: var(--blur-chrome);
    border: 1px solid var(--brand-line);
    display: flex; flex-direction: column; gap: 4px;
  }
  .kpi__label {
    font: 700 10px/1 var(--sa, Inter, sans-serif);
    text-transform: uppercase; letter-spacing: 0.14em;
    color: var(--ink-3);
  }
  .kpi__value {
    font: 700 28px/1.1 var(--mo, 'JetBrains Mono', monospace);
    color: var(--ink);
    letter-spacing: -0.02em;
  }
  .kpi__sub {
    display: inline-flex; align-items: center; gap: 6px;
    font: 500 12px/1.2 var(--sa, Inter, sans-serif);
    color: var(--ink-3);
  }
  .kpi__sub--warn { color: #f0b441; }
  .dot {
    width: 8px; height: 8px; border-radius: 50%;
    display: inline-block;
  }
  .dot--ok   { background: #5ac28a; }
  .dot--warn { background: #f0b441; }
  .dot--off  { background: #888; }

  /* Cards */
  .card {
    margin: 0 0 20px;
    padding: 18px 20px;
    border-radius: 14px;
    background: var(--glass-chrome);
    -webkit-backdrop-filter: var(--blur-chrome);
    backdrop-filter: var(--blur-chrome);
    border: 1px solid var(--brand-line);
  }
  .card__head {
    display: flex; align-items: baseline; justify-content: space-between;
    gap: 12px; flex-wrap: wrap;
    margin-bottom: 14px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--brand-line);
  }
  .card__head h2 {
    margin: 0;
    font: 700 15px/1.2 var(--sa, Inter, sans-serif);
    letter-spacing: -0.005em;
    color: var(--ink);
  }
  .card__sub {
    font: 500 12px/1 var(--sa, Inter, sans-serif);
    color: var(--ink-3);
  }

  /* Agent table */
  .table-wrap { overflow-x: auto; }
  .agent-table {
    width: 100%;
    border-collapse: collapse;
    font: 500 13px/1.4 var(--sa, Inter, sans-serif);
  }
  .agent-table thead th {
    text-align: left;
    padding: 8px 10px;
    font: 700 10.5px/1 var(--sa, Inter, sans-serif);
    text-transform: uppercase;
    letter-spacing: 0.10em;
    color: var(--ink-3);
    border-bottom: 1px solid var(--brand-line);
    background: transparent;
  }
  .agent-table tbody tr {
    border-bottom: 1px solid rgba(255,255,255,0.04);
  }
  .agent-table tbody tr:nth-child(odd) {
    background: rgba(255, 255, 255, 0.015);
  }
  .agent-table tbody tr:hover {
    background: rgba(86, 188, 236, 0.06);
  }
  .agent-table td {
    padding: 10px;
    vertical-align: middle;
    color: var(--ink-2);
  }
  .agent-table td.num { text-align: right; font-family: var(--mo, 'JetBrains Mono', monospace); font-variant-numeric: tabular-nums; }
  .agent-name { font-weight: 600; color: var(--ink); font-family: var(--mo, 'JetBrains Mono', monospace); font-size: 12.5px; }
  .agent-action { color: var(--ink-2); max-width: 360px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .agent-time { font-family: var(--mo, 'JetBrains Mono', monospace); font-size: 12px; color: var(--ink-3); }

  .row--stale {
    box-shadow: inset 3px 0 0 #f0a045;
  }
  .row--stale .agent-time { color: #f0a045; font-weight: 600; }

  /* Status chips */
  .status-chip {
    display: inline-flex;
    padding: 3px 9px;
    border-radius: 999px;
    font: 600 10.5px/1.4 var(--sa, Inter, sans-serif);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    border: 1px solid transparent;
  }
  .status-chip--active   { background: rgba(90, 194, 138, 0.14); color: #6fd49b; border-color: rgba(90, 194, 138, 0.28); }
  .status-chip--idle     { background: rgba(160, 165, 175, 0.14); color: #b8bdc8; border-color: rgba(160, 165, 175, 0.28); }
  .status-chip--error    { background: rgba(255, 92, 92, 0.14); color: #ff8080; border-color: rgba(255, 92, 92, 0.32); }
  .status-chip--stale    { background: rgba(240, 160, 69, 0.14); color: #f0a045; border-color: rgba(240, 160, 69, 0.32); }
  .status-chip--unknown  { background: rgba(120, 120, 130, 0.10); color: #9aa0aa; border-color: rgba(120, 120, 130, 0.22); }

  .status-chip--mod-active   { background: rgba(90, 194, 138, 0.14); color: #6fd49b; border-color: rgba(90, 194, 138, 0.28); }
  .status-chip--mod-degraded { background: rgba(240, 180, 65, 0.14); color: #f0b441; border-color: rgba(240, 180, 65, 0.32); }
  .status-chip--mod-silent   { background: rgba(160, 165, 175, 0.14); color: #b8bdc8; border-color: rgba(160, 165, 175, 0.28); }
  .status-chip--mod-init     { background: rgba(86, 188, 236, 0.12); color: #56bcec; border-color: rgba(86, 188, 236, 0.30); }
  .status-chip--mod-unknown  { background: rgba(120, 120, 130, 0.10); color: #9aa0aa; border-color: rgba(120, 120, 130, 0.22); }

  /* Module grid */
  .module-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 12px;
  }
  .mod-card {
    padding: 14px 14px 12px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.025);
    border: 1px solid var(--brand-line);
    display: flex; flex-direction: column; gap: 8px;
    transition: transform 140ms ease, border-color 140ms ease, background 140ms ease;
  }
  .mod-card:hover {
    transform: translateY(-1px);
    border-color: var(--brand-line-2);
    background: rgba(86, 188, 236, 0.04);
  }
  .mod-card--active   { box-shadow: inset 3px 0 0 #5ac28a; }
  .mod-card--degraded { box-shadow: inset 3px 0 0 #f0b441; }
  .mod-card--silent   { box-shadow: inset 3px 0 0 #888; }
  .mod-card--init     { box-shadow: inset 3px 0 0 #56bcec; }
  .mod-card--unknown  { box-shadow: inset 3px 0 0 #555; }
  .mod-card__top {
    display: flex; align-items: center; justify-content: space-between;
    gap: 8px;
  }
  .mod-card__title {
    font: 600 13.5px/1.2 var(--sa, Inter, sans-serif);
    color: var(--ink);
  }
  .mod-card__meta {
    display: flex; align-items: center; gap: 10px;
    font: 500 11px/1 var(--sa, Inter, sans-serif);
    color: var(--ink-3);
  }
  .mod-card__cat {
    text-transform: uppercase;
    letter-spacing: 0.10em;
    font-weight: 700;
    color: #56bcec;
  }
  .mod-card__time { font-family: var(--mo, 'JetBrains Mono', monospace); }
  .mod-card__notes {
    margin: 2px 0 0;
    font: 500 11.5px/1.4 var(--sa, Inter, sans-serif);
    color: var(--ink-2);
    opacity: 0.85;
  }

  /* Audit feed */
  .audit-feed {
    list-style: none;
    margin: 0; padding: 0;
    display: flex; flex-direction: column;
    gap: 4px;
  }
  .audit-row {
    display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
    padding: 8px 10px;
    border-radius: 8px;
    font: 500 12.5px/1.3 var(--sa, Inter, sans-serif);
    color: var(--ink-2);
    transition: background 120ms ease;
  }
  .audit-row:hover { background: rgba(255, 255, 255, 0.02); }
  .audit-time {
    font-family: var(--mo, 'JetBrains Mono', monospace);
    font-size: 11.5px;
    color: var(--ink-3);
    min-width: 48px;
  }
  .audit-action {
    font-family: var(--mo, 'JetBrains Mono', monospace);
    font-size: 11.5px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 6px;
    text-transform: lowercase;
  }
  .audit-action--create { color: #6fd49b; background: rgba(90, 194, 138, 0.10); }
  .audit-action--update { color: #56bcec; background: rgba(86, 188, 236, 0.10); }
  .audit-action--delete { color: #ff8080; background: rgba(255, 92, 92, 0.10); }
  .audit-action--error  { color: #ff8080; background: rgba(255, 92, 92, 0.16); }
  .audit-action--other  { color: var(--ink-3); background: rgba(255, 255, 255, 0.03); }
  .audit-chip {
    font: 600 10.5px/1.2 var(--sa, Inter, sans-serif);
    padding: 2px 7px;
    border-radius: 999px;
    background: rgba(86, 188, 236, 0.10);
    color: #56bcec;
    border: 1px solid rgba(86, 188, 236, 0.20);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .audit-entity {
    font-weight: 600;
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 320px;
  }
  .audit-actor { color: var(--ink-3); font-size: 11.5px; }

  @media (max-width: 760px) {
    .page { padding: 16px 14px 64px; }
    .head { flex-direction: column; align-items: flex-start; }
    .head-right { width: 100%; justify-content: space-between; }
    .kpi-strip { grid-template-columns: 1fr; }
    .module-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .audit-entity { max-width: 100%; }
  }
  @media (max-width: 420px) {
    .module-grid { grid-template-columns: 1fr; }
  }
</style>

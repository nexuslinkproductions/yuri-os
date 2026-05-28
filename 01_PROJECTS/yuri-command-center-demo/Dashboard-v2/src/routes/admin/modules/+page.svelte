<script lang="ts">
  /**
   * /admin/modules  P7 Admin / Modules.
   *
   * Read-only overview of the dashboard module stack. Each module is
   * presented as a glass card with icon, label, description, status badge,
   * and a "Go to module" link. NEXITA (P8) is marked "Coming Soon".
   *
   * A system-info strip at the bottom shows build version, VPS, Supabase
   * region, and build date.
   */
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { user } from '$lib/stores/user.svelte';
  import { version } from '$app/environment';
  import AdminSubNav from '$lib/components/admin/AdminSubNav.svelte';

  type Mod = {
    id: string;
    label: string;
    icon: string;
    path: string;
    desc: string;
    status: 'active' | 'soon';
  };

  const MODULES: Mod[] = [
    { id: 'tracker',  label: 'Tracker',  icon: '⧗', path: '/tracker',           desc: 'Time tracking + billable hours',  status: 'active' },
    { id: 'crm',      label: 'CRM',      icon: '▷', path: '/pipeline/customers', desc: 'Client pipeline + kanban',         status: 'active' },
    { id: 'finance',  label: 'Finance',  icon: '◈', path: '/finance',           desc: 'Offers + invoices via Bexio',      status: 'active' },
    { id: 'nexdoc',   label: 'NEXdoc',   icon: '⊡', path: '/nexdoc',            desc: 'AI document scanner',              status: 'active' },
    { id: 'meetings', label: 'Meetings', icon: '◐', path: '/meetings',          desc: 'Meeting intelligence hub',         status: 'active' },
    { id: 'focus',    label: 'Focus',    icon: '✦', path: '/focus',             desc: 'Daily prioritization cockpit',     status: 'active' },
    { id: 'expenses', label: 'Expenses', icon: '◉', path: '/expenses',          desc: 'AP ledger + vendor invoices',      status: 'active' },
    { id: 'revenue',  label: 'Revenue',  icon: '◆', path: '/revenue',           desc: 'Revenue tracking',                 status: 'active' },
    { id: 'intel',    label: 'Intel',    icon: '◎', path: '/intel',             desc: 'Brain + signals',                  status: 'active' },
    { id: 'nexogram', label: 'NEXOGRAM', icon: '◇', path: '/nexogram',          desc: 'Team chat + NEX AI COO',           status: 'active' },
  ];

  let mounted = $state(false);

  const dashboardVersion = (version && version !== 'unknown') ? version : 'T.7.4';
  const buildDate = new Date().toISOString().slice(0, 10);

  onMount(async () => {
    await user.init();
    if (!user.isAdmin) {
      goto('/');
      return;
    }
    mounted = true;
  });
</script>

<svelte:head><title>NEX  Modules  Admin</title></svelte:head>

<div class="page">
  <AdminSubNav />

  <header class="head">
    <div>
      <span class="eyebrow">Admin / Modules</span>
      <h1>Module stack</h1>
      <p class="sub">Every dashboard surface, at a glance. Read-only for now; per-tenant enable/disable arrives with NEXBOX.</p>
    </div>
    <div class="legend">
      <span class="legend__chip legend__chip--active">Active</span>
      <span class="legend__chip legend__chip--soon">Coming soon</span>
    </div>
  </header>

  {#if !mounted}
    <div class="loading">Loading...</div>
  {:else}
    <section class="grid">
      {#each MODULES as m (m.id)}
        <article class="mcard mcard--{m.status}">
          {#if m.status === 'soon'}
            <span class="mcard__lock" aria-hidden="true">⊙</span>
          {/if}
          <div class="mcard__icon" aria-hidden="true">{m.icon}</div>
          <div class="mcard__body">
            <div class="mcard__top">
              <h2 class="mcard__title">{m.label}</h2>
              <span class="mcard__badge mcard__badge--{m.status}">
                {m.status === 'active' ? 'Active' : 'P8 - Coming Soon'}
              </span>
            </div>
            <p class="mcard__desc">{m.desc}</p>
            <div class="mcard__foot">
              {#if m.status === 'active'}
                <a href={m.path} class="glass-btn glass-btn--ghost mcard__cta">Go to module</a>
              {:else}
                <span class="mcard__disabled">Available in P8</span>
              {/if}
              <code class="mcard__path">{m.path}</code>
            </div>
          </div>
        </article>
      {/each}
    </section>

    <section class="sysinfo">
      <div class="sysinfo__row">
        <span class="sysinfo__label">Dashboard version</span>
        <code class="sysinfo__value">{dashboardVersion}</code>
      </div>
      <div class="sysinfo__row">
        <span class="sysinfo__label">VPS</span>
        <code class="sysinfo__value">Infomaniak 83.228.224.13</code>
      </div>
      <div class="sysinfo__row">
        <span class="sysinfo__label">Supabase</span>
        <code class="sysinfo__value">eu-central-2</code>
      </div>
      <div class="sysinfo__row">
        <span class="sysinfo__label">Build date</span>
        <code class="sysinfo__value">{buildDate}</code>
      </div>
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
  .sub { margin: 0; font-size: 13px; color: var(--ink-3); max-width: 640px; }

  .legend { display: flex; gap: 8px; flex-wrap: wrap; }
  .legend__chip {
    display: inline-flex;
    padding: 4px 10px;
    border-radius: 999px;
    font: 600 11px/1.3 var(--sa, Inter, sans-serif);
    letter-spacing: 0.04em;
    border: 1px solid transparent;
  }
  .legend__chip--active { background: rgba(90, 194, 138, 0.12); color: #6fd49b; border-color: rgba(90, 194, 138, 0.28); }
  .legend__chip--soon   { background: rgba(139, 92, 246, 0.12); color: #a78bfa; border-color: rgba(139, 92, 246, 0.32); }

  .loading {
    padding: 32px;
    text-align: center;
    color: var(--ink-3);
    font-size: 13px;
    font-style: italic;
  }

  /* Module grid */
  .grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
    margin-bottom: 28px;
  }
  .mcard {
    display: flex;
    gap: 14px;
    padding: 18px;
    border-radius: 16px;
    background: var(--glass-chrome);
    -webkit-backdrop-filter: var(--blur-chrome);
    backdrop-filter: var(--blur-chrome);
    border: 1px solid var(--brand-line);
    transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
    position: relative;
    overflow: hidden;
  }
  .mcard::before {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(800px 200px at -10% -10%, rgba(86,188,236,0.06), transparent 60%);
    pointer-events: none;
  }
  .mcard:hover {
    transform: translateY(-2px);
    border-color: var(--brand-line-2);
    box-shadow: 0 8px 28px rgba(0,0,0,0.18), 0 0 0 1px var(--brand-line-2);
  }
  .mcard--soon {
    opacity: 0.85;
    border-style: dashed;
    border-color: rgba(139, 92, 246, 0.45);
    background: linear-gradient(140deg, rgba(139,92,246,0.04), rgba(86,188,236,0.02));
  }
  .mcard--soon:hover { transform: none; box-shadow: none; }
  .mcard__lock {
    position: absolute;
    top: 10px; right: 10px;
    font: 700 16px/1 "JetBrains Mono", monospace;
    color: rgba(139, 92, 246, 0.7);
    pointer-events: none;
    z-index: 1;
  }

  /* Subtle pulse on active modules every 8s */
  .mcard--active {
    animation: module-pulse 8s ease-in-out infinite;
  }
  @keyframes module-pulse {
    0%, 100% { box-shadow: 0 0 0 rgba(86,188,236,0); }
    50%      { box-shadow: 0 0 12px rgba(86,188,236,0.20); }
  }
  @media (prefers-reduced-motion: reduce) {
    .mcard--active { animation: none; }
  }

  .mcard__icon {
    width: 44px; height: 44px;
    border-radius: 12px;
    background: rgba(86, 188, 236, 0.10);
    border: 1px solid rgba(86, 188, 236, 0.28);
    display: grid; place-items: center;
    font-size: 20px;
    color: #56bcec;
    flex-shrink: 0;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.10);
  }
  .mcard--soon .mcard__icon {
    background: rgba(160, 165, 175, 0.08);
    border-color: rgba(160, 165, 175, 0.22);
    color: var(--ink-3);
  }

  .mcard__body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
  .mcard__top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .mcard__title {
    margin: 0;
    font: 700 16px/1.2 var(--sa, Inter, sans-serif);
    color: var(--ink);
    letter-spacing: -0.01em;
  }
  .mcard__badge {
    display: inline-flex;
    padding: 3px 9px;
    border-radius: 999px;
    font: 700 10.5px/1.4 var(--sa, Inter, sans-serif);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    border: 1px solid transparent;
  }
  .mcard__badge--active { background: rgba(90, 194, 138, 0.14); color: #6fd49b; border-color: rgba(90, 194, 138, 0.30); }
  .mcard__badge--soon   { background: rgba(139, 92, 246, 0.15); color: #a78bfa; border-color: rgba(139, 92, 246, 0.40); }
  .mcard__desc {
    margin: 0;
    font: 500 13px/1.45 var(--sa, Inter, sans-serif);
    color: var(--ink-2);
  }
  .mcard__foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
    margin-top: 4px;
  }
  .mcard__cta {
    font-size: 12px !important;
    padding: 6px 12px !important;
  }
  .mcard__disabled {
    font: 600 11.5px/1 var(--sa, Inter, sans-serif);
    color: var(--ink-3);
    padding: 6px 0;
  }
  .mcard__path {
    font: 500 11px/1 var(--mo, 'JetBrains Mono', monospace);
    color: var(--ink-3);
    background: rgba(255, 255, 255, 0.03);
    padding: 3px 7px;
    border-radius: 6px;
    border: 1px solid var(--brand-line);
  }

  /* System info strip */
  .sysinfo {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0;
    padding: 16px 18px;
    border-radius: 14px;
    background: var(--glass-chrome);
    -webkit-backdrop-filter: var(--blur-chrome);
    backdrop-filter: var(--blur-chrome);
    border: 1px solid var(--brand-line);
  }
  .sysinfo__row {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 4px 14px;
    border-left: 1px solid var(--brand-line);
  }
  .sysinfo__row:first-child { border-left: none; padding-left: 0; }
  .sysinfo__label {
    font: 700 10px/1 var(--sa, Inter, sans-serif);
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: var(--ink-3);
  }
  .sysinfo__value {
    font: 600 13px/1.2 var(--mo, 'JetBrains Mono', monospace);
    color: var(--ink);
    background: transparent;
    padding: 0;
  }

  @media (max-width: 960px) {
    .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .sysinfo { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 0; }
    .sysinfo__row:nth-child(3) { border-left: none; padding-left: 0; }
  }
  @media (max-width: 560px) {
    .page { padding: 16px 14px 64px; }
    .head { flex-direction: column; align-items: flex-start; }
    .grid { grid-template-columns: 1fr; }
    .sysinfo { grid-template-columns: 1fr; }
    .sysinfo__row { border-left: none; padding-left: 0; padding-right: 0; border-top: 1px solid var(--brand-line); padding-top: 8px; }
    .sysinfo__row:first-child { border-top: none; padding-top: 0; }
  }
</style>

<script lang="ts">
  /**
   * /admin/permissions — CEO-only permission matrix.
   *
   * Renders all team members as rows, modules/actions as nested checkboxes.
   * Each cell shows one of three states:
   *   ✓ explicitly granted (per-user override)
   *   ✗ explicitly denied  (per-user override)
   *   ◌ inherited from role default
   *
   * Clicking a cell cycles through: granted → denied → reset. Each click is
   * an immediate RPC call (set_user_permission / reset_user_permission). The
   * RPC is SECURITY DEFINER + CEO-gated server-side; the UI also hides itself
   * if user.can('admin.manage_permissions') is false.
   */
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { user, MODULES, ROLE_DEFAULTS } from "$lib/stores/user.svelte";
  import { supabase, hasClient } from "$lib/db";
  import { toast } from "$components/GlassToast.svelte";
  // Workstream W.3 — canonical glass surfaces for the role + legend chips
  import { GlassValueChip } from "$lib/components/glass";

  interface Member { id: string; email: string | null; display_name: string | null; role: string | null; }
  interface PermRow { user_id: string; module_key: string; action_key: string; granted: boolean; }

  let members = $state<Member[]>([]);
  let perms   = $state<Record<string, Record<string, Record<string, boolean>>>>({});
  // perms[user_id][module_key][action_key] = granted boolean (or absent = inherited)
  let loading = $state(true);
  let savingCell = $state<string | null>(null);
  let activeModule = $state<string>("crm");

  onMount(async () => {
    await user.init();
    if (!user.can("admin.manage_permissions") && !user.isAdmin) {
      goto("/");
      return;
    }
    await loadAll();
  });

  async function loadAll() {
    if (!hasClient()) { toast("Supabase not configured", "error"); return; }
    loading = true;
    try {
      const supa = supabase();
      const [{ data: profiles }, { data: rows }] = await Promise.all([
        supa.from("user_profiles").select("id, email, display_name, role").order("display_name"),
        supa.from("user_module_permissions")
          .select("user_id, module_key, action_key, granted")
          .is("revoked_at", null),
      ]);
      members = (profiles ?? []) as Member[];
      const map: Record<string, Record<string, Record<string, boolean>>> = {};
      for (const r of (rows ?? []) as PermRow[]) {
        if (!map[r.user_id]) map[r.user_id] = {};
        if (!map[r.user_id][r.module_key]) map[r.user_id][r.module_key] = {};
        map[r.user_id][r.module_key][r.action_key] = r.granted;
      }
      perms = map;
    } finally { loading = false; }
  }

  function currentState(memberId: string, module: string, action: string, role: string | null): "granted" | "denied" | "inherited" {
    const v = perms[memberId]?.[module]?.[action];
    if (v === true) return "granted";
    if (v === false) return "denied";
    return "inherited";
  }

  // ROLE_DEFAULTS now imported from $lib/stores/user.svelte (single source).
  // Pill resolution mirrors user.can() exactly — no more divergence between
  // matrix display and runtime check. (Fix: AUDIT-3 Bug 6.)
  function inheritedFromRole(role: string | null, module: string, action: string): boolean {
    if (role === "ceo" || role === "cto") return true;
    if (!role) return false;
    return (ROLE_DEFAULTS as any)[role]?.[module]?.includes(action) ?? false;
  }

  async function cycle(memberId: string, module: string, action: string) {
    const cellKey = `${memberId}|${module}|${action}`;
    savingCell = cellKey;
    const state = currentState(memberId, module, action, null);
    try {
      const supa = supabase();
      // granted → denied → inherited → granted
      if (state === "inherited") {
        const { error } = await supa.rpc("set_user_permission", {
          p_target_user: memberId,
          p_module_key: module,
          p_action_key: action,
          p_granted: true,
          p_notes: null,
        });
        if (error) throw error;
        if (!perms[memberId]) perms[memberId] = {};
        if (!perms[memberId][module]) perms[memberId][module] = {};
        perms[memberId] = { ...perms[memberId], [module]: { ...perms[memberId][module], [action]: true } };
      } else if (state === "granted") {
        const { error } = await supa.rpc("set_user_permission", {
          p_target_user: memberId,
          p_module_key: module,
          p_action_key: action,
          p_granted: false,
          p_notes: null,
        });
        if (error) throw error;
        perms[memberId] = { ...perms[memberId], [module]: { ...perms[memberId][module], [action]: false } };
      } else {
        // denied → reset to inherited
        const { error } = await supa.rpc("reset_user_permission", {
          p_target_user: memberId,
          p_module_key: module,
          p_action_key: action,
        });
        if (error) throw error;
        const mod = { ...(perms[memberId]?.[module] || {}) };
        delete mod[action];
        perms[memberId] = { ...perms[memberId], [module]: mod };
      }
      // Force reactivity
      perms = { ...perms };
    } catch (e: any) {
      toast(`Save failed: ${e?.message || e}`, "error");
    } finally { savingCell = null; }
  }

  const STATE_LABELS = { granted: "✓", denied: "✗", inherited: "◌" } as const;
</script>

<svelte:head>
  <title>Admin — Permissions · c2moviez NEX</title>
</svelte:head>

<header class="page-hdr">
  <div>
    <h1 class="title">Team permissions</h1>
    <p class="sub">CEO-only · per-user override on top of role defaults · every change audited</p>
  </div>
  <div class="legend">
    <span class="legend-item">
      <GlassValueChip tone="success" size="sm" static>{#snippet children()}✓ granted{/snippet}</GlassValueChip>
    </span>
    <span class="legend-item">
      <GlassValueChip tone="danger" size="sm" static>{#snippet children()}✗ denied{/snippet}</GlassValueChip>
    </span>
    <span class="legend-item">
      <GlassValueChip tone="neutral" size="sm" static>{#snippet children()}◌ inherited from role{/snippet}</GlassValueChip>
    </span>
  </div>
</header>

{#if loading}
  <div class="loading">Loading team and permissions…</div>
{:else}
  <nav class="module-tabs" aria-label="Module">
    {#each MODULES as m}
      <button
        class="mod-tab"
        class:mod-tab--active={activeModule === m.key}
        onclick={() => (activeModule = m.key)}
      >
        <span class="mod-emoji">{m.emoji}</span>
        {m.label}
      </button>
    {/each}
  </nav>

  {#each MODULES.filter(m => m.key === activeModule) as mod}
    <section class="matrix">
      <header class="matrix-header">
        <h2 class="crm-section-title">{mod.label}</h2>
        <p class="matrix-sub">{mod.actions.length} action{mod.actions.length === 1 ? '' : 's'} · {members.length} team member{members.length === 1 ? '' : 's'}</p>
      </header>

      <div class="matrix-scroll">
        <table class="matrix-table">
          <thead>
            <tr>
              <th class="th-member">Team member</th>
              <th class="th-role">Role</th>
              {#each mod.actions as a}
                <th class="th-action" title={a.description || a.label}>
                  <span>{a.label}</span>
                </th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each members as m (m.id)}
              <tr>
                <th class="td-member" scope="row">
                  <div class="member-name">{m.display_name || m.email}</div>
                  <div class="member-email">{m.email}</div>
                </th>
                <td class="td-role">
                  <GlassValueChip
                    tone={m.role === 'ceo' || m.role === 'cto' ? 'info' : m.role === 'marketing_manager' ? 'violet' : 'warn'}
                    size="sm"
                    static
                  >
                    {#snippet children()}{m.role || '—'}{/snippet}
                  </GlassValueChip>
                </td>
                {#each mod.actions as a}
                  {@const state = currentState(m.id, mod.key, a.key, m.role)}
                  {@const inh   = inheritedFromRole(m.role, mod.key, a.key)}
                  {@const effective = state === 'granted' ? true : state === 'denied' ? false : inh}
                  {@const cellKey  = `${m.id}|${mod.key}|${a.key}`}
                  <td class="td-cell" data-label={a.label}>
                    <button
                      type="button"
                      class={`cell-pill cell-pill--${state} ${effective ? 'cell-pill--on' : 'cell-pill--off'}`}
                      onclick={() => cycle(m.id, mod.key, a.key)}
                      disabled={savingCell === cellKey || m.role === 'ceo' || m.role === 'cto'}
                      title={
                        state === 'granted' ? 'Granted (override)' :
                        state === 'denied' ? 'Denied (override)' :
                        `Inherited from ${m.role}: ${inh ? 'allowed' : 'denied'}`
                      }
                    >
                      {STATE_LABELS[state]}
                    </button>
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  {/each}
{/if}

<style>
  .page-hdr {
    display: flex; align-items: flex-end; justify-content: space-between;
    gap: 20px; padding: 24px 32px 16px;
    border-bottom: 1px solid var(--crm-gray-200, #E1E5EB);
    margin-bottom: 18px;
    flex-wrap: wrap;
  }
  .title {
    font: 600 30px/1.15 var(--crm-font-display, 'Space Grotesk', sans-serif);
    margin: 0 0 4px 0;
    color: var(--crm-gray-900, #0E1119);
    letter-spacing: -0.015em;
  }
  .sub {
    font: 500 13px/1.5 var(--crm-font-ui, 'Inter', sans-serif);
    color: var(--crm-gray-500, #6B7689);
    margin: 0;
  }
  .legend {
    display: flex; gap: 16px; align-items: center; flex-wrap: wrap;
    font: 500 12px/1 var(--crm-font-ui);
    color: var(--crm-gray-500);
  }
  .legend-item { display: inline-flex; align-items: center; gap: 6px; }

  .loading {
    padding: 60px; text-align: center;
    color: var(--crm-gray-500); font: 500 14px/1.5 var(--crm-font-ui);
  }

  /* Module tabs — same vocabulary as Sheet tabs */
  .module-tabs {
    display: flex; gap: 4px; padding: 0 32px;
    overflow-x: auto;
    border-bottom: 1px solid var(--crm-gray-200);
    margin-bottom: 18px;
  }
  .mod-tab {
    all: unset;
    position: relative;
    padding: 12px 14px;
    font: 600 13px/1 var(--crm-font-ui);
    color: var(--crm-gray-500);
    cursor: pointer;
    transition: color 120ms ease;
    white-space: nowrap;
    display: inline-flex; align-items: center; gap: 6px;
  }
  .mod-emoji { font-size: 13px; opacity: .9; }
  .mod-tab:hover { color: var(--crm-gray-800); }
  .mod-tab--active { color: var(--crm-brand-deep, #1F7AAB); }
  .mod-tab--active::after {
    content: ''; position: absolute; left: 12px; right: 12px; bottom: -1px;
    height: 2px; background: var(--crm-brand, #56BCEC);
    border-radius: 2px 2px 0 0;
  }

  /* Matrix */
  .matrix {
    padding: 0 32px 48px;
  }
  .matrix-header { margin-bottom: 14px; }
  .crm-section-title { margin: 0; }
  .matrix-sub {
    margin: 4px 0 0;
    font: 500 12px/1.4 var(--crm-font-ui);
    color: var(--crm-gray-400);
  }
  .matrix-scroll {
    overflow-x: auto;
    background: var(--crm-gray-0, #FFFFFF);
    border: 1px solid var(--crm-gray-200, #E1E5EB);
    border-radius: 14px;
    box-shadow: var(--crm-sh-1);
  }
  .matrix-table {
    width: 100%;
    border-collapse: collapse;
    min-width: 720px;
  }
  .matrix-table thead th {
    position: sticky; top: 0;
    background: var(--crm-gray-50, #FAFBFC);
    border-bottom: 1px solid var(--crm-gray-200);
    padding: 12px 10px;
    font: 700 10.5px/1.2 var(--crm-font-ui);
    letter-spacing: .08em; text-transform: uppercase;
    color: var(--crm-gray-400);
    text-align: left;
    white-space: nowrap;
  }
  .matrix-table th.th-action { text-align: center; min-width: 120px; }
  .matrix-table tbody tr { border-bottom: 1px solid var(--crm-gray-200); transition: background 120ms ease; }
  .matrix-table tbody tr:last-child { border-bottom: none; }
  .matrix-table tbody tr:hover { background: var(--crm-gray-50); }
  .matrix-table td, .matrix-table tbody th { padding: 10px; vertical-align: middle; }
  .td-member { min-width: 200px; }
  .member-name {
    font: 600 14px/1.3 var(--crm-font-ui);
    color: var(--crm-gray-900);
  }
  .member-email {
    font: 500 11.5px/1.3 var(--crm-font-mono, ui-monospace, monospace);
    color: var(--crm-gray-400);
  }
  .td-role { min-width: 130px; }
  .td-cell { text-align: center; }

  /* Cell pill — the cycle button */
  .cell-pill {
    all: unset;
    display: inline-flex; align-items: center; justify-content: center;
    width: 32px; height: 32px;
    border-radius: 8px;
    cursor: pointer;
    font: 700 14px/1 var(--crm-font-ui);
    border: 1px solid transparent;
    transition: background 120ms ease, border-color 120ms ease,
                transform 120ms ease, box-shadow 160ms ease;
  }
  .cell-pill:hover:not([disabled]) { transform: translateY(-1px); box-shadow: var(--crm-sh-1); }
  .cell-pill[disabled] { opacity: .5; cursor: not-allowed; }

  .cell-pill--granted {
    background: rgba(30,160,51,.10);
    color: #15782B;
    border-color: rgba(30,160,51,.32);
  }
  .cell-pill--denied {
    background: rgba(220,38,38,.10);
    color: #B91C1C;
    border-color: rgba(220,38,38,.32);
  }
  .cell-pill--inherited {
    background: var(--crm-gray-100, #F4F6F9);
    color: var(--crm-gray-400, #94A0B0);
    border-color: var(--crm-gray-200);
  }
  .cell-pill--inherited.cell-pill--on { color: #15782B; }
  .cell-pill--inherited.cell-pill--off { color: var(--crm-gray-400); }

  /* ─── T.7.3 follow-up · No-side-scroll mobile layout (barrierefrei) ───
       Below 760px the matrix collapses into a vertical card-per-member.
       Each cell shows its action label via the data-label attr we set on the <td>.
       Same DOM, different CSS — accessibility intact, no horizontal scroll. */
  @media (max-width: 760px) {
    .matrix-scroll {
      overflow-x: visible;
      background: transparent;
      border: 0;
      box-shadow: none;
    }
    .matrix-table {
      display: block;
      min-width: 0;
    }
    .matrix-table thead { display: none; }
    .matrix-table tbody, .matrix-table tbody tr {
      display: block;
    }
    .matrix-table tbody tr {
      background: var(--canvas-2, var(--bg));
      border: 1px solid var(--line);
      border-radius: var(--r2, 16px);
      box-shadow: var(--sh-card);
      padding: 14px 16px;
      margin-bottom: 12px;
    }
    .matrix-table tbody th, .matrix-table tbody td {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 6px 0;
      border-bottom: 1px dashed var(--line);
    }
    .matrix-table tbody tr > th:first-child {
      flex-direction: column;
      align-items: flex-start;
      gap: 2px;
      padding-bottom: 10px;
      margin-bottom: 6px;
      border-bottom: 2px solid var(--brand-line);
    }
    .matrix-table tbody tr > td:last-child {
      border-bottom: 0;
    }
    .td-cell {
      text-align: right;
    }
    .td-cell::before {
      content: attr(data-label);
      flex: 1; min-width: 0;
      font: 600 12.5px/1.3 var(--sa);
      color: var(--t2);
      text-align: left;
      letter-spacing: 0;
      text-transform: none;
    }
    .member-name { font-size: 16px; }
    .td-role {
      justify-content: flex-start;
      padding-bottom: 10px;
      border-bottom: 1px dashed var(--line);
    }
    .td-role::before {
      content: "Role";
      font: 600 12.5px/1.3 var(--sa);
      color: var(--t3);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-right: auto;
    }
  }
</style>

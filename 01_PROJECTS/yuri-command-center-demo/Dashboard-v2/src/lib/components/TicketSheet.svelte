<script lang="ts">
  /**
   * TicketSheet.svelte — reusable side drawer for any clicked ticket.
   *
   * Opens from: /clients Tickets tab, CRM Sheet (future), /pipeline (future),
   * timer ticket picker (future).
   *
   * Tabs:
   *   Overview     — name, state, priority, customer, assignees, dates, modules, cycles
   *   Worklogs     — past time entries (Plane worklogs from entity_state cache)
   *   Comments     — Plane comments (read-only this pass; write in next iteration)
   *   Plan         — placeholder for scheduling + start-tracker entry point
   *                  (time-tracker integration lands in the dedicated session)
   *
   * Props:
   *   ticket  — EntityState row for entity_type='ticket'
   *   open    — boolean
   *   onClose — callback
   */
  import Sheet from "$components/ui/Sheet.svelte";
  import { user } from "$stores/user.svelte";
  import { toast } from "$components/GlassToast.svelte";
  // Workstream T.2 — wire Start tracker → real tracker.start() call
  import { tracker, formatHMS } from "$stores/tracker.svelte";

  interface Props {
    ticket: any | null;          // EntityState row (entity_state.state holds the Plane data)
    open: boolean;
    onClose: () => void;
  }
  let { ticket, open, onClose }: Props = $props();

  type TicketTab = "overview" | "worklogs" | "comments" | "plan";
  let activeTab = $state<TicketTab>("overview");

  // Reset tab on each open
  $effect(() => { if (open) activeTab = "overview"; });

  // Helpers
  function fmtDate(d?: string | null): string {
    if (!d) return "—";
    try { return new Date(d).toLocaleDateString("de-CH", { day: "2-digit", month: "short", year: "2-digit" }); }
    catch { return d; }
  }
  function fmtDuration(s?: string | null): string {
    if (!s) return "—";
    // Plane logged_time format: "HH:MM:SS"
    const parts = String(s).split(":");
    if (parts.length === 3) {
      const h = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      if (h === 0) return `${m}min`;
      if (m === 0) return `${h}h`;
      return `${h}h ${m}min`;
    }
    return s;
  }
  function priorityClass(p?: string): string {
    switch (String(p || "").toLowerCase()) {
      case "urgent": return "prio prio--urgent";
      case "high":   return "prio prio--high";
      case "medium": return "prio prio--medium";
      case "low":    return "prio prio--low";
      default:       return "prio prio--none";
    }
  }
  function stateClass(g?: string): string {
    const x = String(g || "").toLowerCase();
    if (x === "completed") return "state-done";
    if (x === "started")   return "state-started";
    if (x === "cancelled") return "state-cancelled";
    if (x === "backlog")   return "state-backlog";
    return "state-todo";
  }

  // Derived shape from the ticket state JSON
  const t = $derived(ticket?.state || {});
  const ticketTitle = $derived(t.name || t.ticketId || "(untitled)");
  const planeUrl = $derived(t.url || `https://app.plane.so/c2moviez/browse/${t.ticketId || ""}`);

  // Worklogs — embedded in state by plane-sync.py. Empty for older rows.
  const worklogs = $derived(Array.isArray(t.worklogs) ? t.worklogs : []);
  const totalLogged = $derived.by(() => {
    let totalMin = 0;
    for (const w of worklogs) {
      const lt = String(w.logged_time || "00:00:00").split(":");
      totalMin += parseInt(lt[0] || "0", 10) * 60 + parseInt(lt[1] || "0", 10);
    }
    if (totalMin === 0) return "—";
    const h = Math.floor(totalMin / 60), m = totalMin % 60;
    return h > 0 ? `${h}h ${m}min` : `${m}min`;
  });

  // Comments — embedded similarly
  const comments = $derived(Array.isArray(t.comments) ? t.comments : []);

  // ── Actions ────────────────────────────────────────────────────────────
  // Note: real writes back to Plane (state change, comment, worklog) land in
  // the time-tracker session. This pass exposes the read surface + Open-in-Plane.
  function openInPlane() {
    if (planeUrl) window.open(planeUrl, "_blank", "noopener");
  }
  function markDone() {
    toast("Mark done writes back to Plane.so — coming in the time-tracker session.", "info");
  }
  // Workstream T.2 — wired to tracker store. Replaces the old toast stub.
  async function startTracker() {
    if (!user.can("tracker.start")) {
      toast("You don't have permission to start a timer.", "error");
      return;
    }
    // Prevent accidental re-start when already tracking this exact ticket
    if (tracker.running?.plane_issue_id && tracker.running.plane_issue_id === (t.plane_uuid || ticket?.entity_id)) {
      toast("Already tracking this ticket.", "info");
      return;
    }
    try {
      await tracker.start({
        plane_issue_id:  (t.plane_uuid || ticket?.entity_id) ?? null,
        plane_issue_seq: t.ticketId ?? null,
        client_code:     t.customer_code || t.client_code || null,
        project_code:    t.project_code || null,
        description:     t.name || null,
        is_billable:     null,  // let tracker_settings.default_billable decide
      });
      toast(`Tracking ${t.ticketId || "ticket"}`, "ok");
    } catch (e: any) {
      toast(e?.message || "Could not start tracker", "error");
    }
  }

  // Whether this very ticket is the one being tracked (drives button label)
  const isTrackingThis = $derived(
    !!tracker.running?.plane_issue_id &&
    tracker.running.plane_issue_id === (t.plane_uuid || ticket?.entity_id)
  );
  function planTicket() {
    toast("Planning — set start/due + assignees from here back to Plane. Coming in the next session.", "info");
  }
</script>

<Sheet open={open} {onClose} side="right" width="min(640px, 100vw)" title={ticketTitle}>
  {#if ticket}
    <div class="t-sheet">
      <!-- Header -->
      <header class="t-hdr">
        <div class="t-hdr-top">
          <a class="t-id" href={planeUrl} target="_blank" rel="noopener" title="Open in Plane.so">{t.ticketId || "?"}</a>
          <span class={priorityClass(t.priority)}>{t.priority || "none"}</span>
          <span class={`state-pill ${stateClass(t.state_group)}`}>{t.state || t.state_group || "?"}</span>
        </div>
        <h2 class="t-title">{ticketTitle}</h2>
        {#if t.customer}
          <div class="t-customer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 21V8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v13M3 21h18M9 21V11M15 21V11M9 7h6"/></svg>
            <span>{t.customer}</span>
          </div>
        {/if}
      </header>

      <!-- Action bar -->
      <div class="t-actions">
        {#if isTrackingThis}
          <!-- Tracking THIS ticket — turn into a stop button (still primary L1) -->
          <button class="t-btn t-btn--primary t-btn--tracking" onclick={() => tracker.stop()} disabled={tracker.loading} title="Stop the running timer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
            Stop · {formatHMS(tracker.elapsed)}
          </button>
        {:else}
          <button class="t-btn t-btn--primary" onclick={startTracker} disabled={tracker.loading} title={tracker.running ? "Tracking another ticket — start here will close the running one" : "Start tracker on this ticket"}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            {tracker.running ? "Switch to this" : "Start tracker"}
          </button>
        {/if}
        <button class="t-btn t-btn--ghost" onclick={planTicket}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          Plan
        </button>
        <button class="t-btn t-btn--ghost" onclick={markDone}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
          Mark done
        </button>
        <button class="t-btn t-btn--ghost t-btn--right" onclick={openInPlane} title="Open in Plane.so">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          Open in Plane
        </button>
      </div>

      <!-- Tabs -->
      <nav class="t-tabs" aria-label="Ticket tabs">
        <button class:active={activeTab === "overview"} onclick={() => activeTab = "overview"}>Overview</button>
        <button class:active={activeTab === "worklogs"} onclick={() => activeTab = "worklogs"}>
          Worklogs {#if worklogs.length > 0}<span class="t-tab-count">{worklogs.length}</span>{/if}
        </button>
        <button class:active={activeTab === "comments"} onclick={() => activeTab = "comments"}>
          Comments {#if comments.length > 0}<span class="t-tab-count">{comments.length}</span>{/if}
        </button>
        <button class:active={activeTab === "plan"} onclick={() => activeTab = "plan"}>Plan</button>
      </nav>

      <!-- Body -->
      <div class="t-body">
        {#if activeTab === "overview"}
          <div class="info-rail" role="list">
            {#snippet row(label: string, value: any, mono = false)}
              {#if value !== null && value !== undefined && value !== "" && value !== "—"}
                <div class="info-rail__row info-rail__row--readonly" role="listitem">
                  <span class="info-rail__label">{label}</span>
                  <span class="info-rail__value" class:info-rail__value--mono={mono}>{value}</span>
                  <span class="info-rail__action"></span>
                </div>
              {/if}
            {/snippet}

            {@render row("Project",        t.project, true)}
            {@render row("State",          t.state)}
            {@render row("Priority",       t.priority)}
            {@render row("Customer",       t.customer)}
            {@render row("Start date",     fmtDate(t.start_date))}
            {@render row("Due date",       fmtDate(t.due_date))}
            {@render row("Modules",        Array.isArray(t.modules) ? t.modules.join(" · ") : t.modules)}
            {@render row("Cycles",         Array.isArray(t.cycles) ? t.cycles.join(" · ") : t.cycles)}
            {@render row("Assignees",      Array.isArray(t.assignees) ? t.assignees.join(", ") : t.assignees)}
            {@render row("Total logged",   totalLogged, true)}
            {@render row("Plane UUID",     t.plane_uuid || t.id, true)}
            {@render row("Updated",        fmtDate(t.updated_at))}
          </div>

          {#if t.description}
            <section class="t-desc">
              <h3 class="crm-section-eyebrow">Description</h3>
              <p>{t.description}</p>
            </section>
          {/if}

        {:else if activeTab === "worklogs"}
          {#if worklogs.length === 0}
            <div class="t-empty">
              No worklogs yet for this ticket.<br>
              <span class="hint">Worklogs sync from Plane.so via <code>Scripts/plane-sync.py</code> (30-min reconcile) and the upcoming time-tracker.</span>
            </div>
          {:else}
            <ul class="wl-list">
              {#each worklogs as w}
                <li class="wl-item">
                  <div class="wl-time">{fmtDuration(w.logged_time)}</div>
                  <div class="wl-body">
                    <div class="wl-actor">{w.logged_by_name || w.user_name || "team"}</div>
                    {#if w.description}<div class="wl-desc">{w.description}</div>{/if}
                    <div class="wl-when">{fmtDate(w.created_at || w.start_time)}</div>
                  </div>
                </li>
              {/each}
            </ul>
            <p class="hint">Total: <strong>{totalLogged}</strong> across {worklogs.length} entries</p>
          {/if}

        {:else if activeTab === "comments"}
          {#if comments.length === 0}
            <div class="t-empty">
              No comments synced for this ticket yet.<br>
              <span class="hint">Comments are pulled in by <code>plane-sync.py</code>. Direct comment posting from here ships with the time-tracker.</span>
            </div>
          {:else}
            <ul class="cmt-list">
              {#each comments as c}
                <li class="cmt-item">
                  <div class="cmt-head">
                    <span class="cmt-actor">{c.actor_name || c.user_name || "team"}</span>
                    <span class="cmt-when">{fmtDate(c.created_at)}</span>
                  </div>
                  <div class="cmt-text">{c.comment_html ? c.comment_html.replace(/<[^>]+>/g, "") : (c.comment || "")}</div>
                </li>
              {/each}
            </ul>
          {/if}

        {:else if activeTab === "plan"}
          <div class="plan-stub">
            <div class="plan-stub__icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
            </div>
            <h3>Time-tracker integration</h3>
            <p>
              This is where you'll <strong>start tracking time</strong> against this ticket, set
              start + due dates back to Plane, and re-assign the owner — all live-linked to Plane.so.
            </p>
            <p class="hint">
              The full timer (start/pause/stop with auto-sync to Plane worklogs) ships in the
              dedicated time-tracker session. The "Start tracker" button above will become the
              primary entry point.
            </p>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</Sheet>

<style>
  .t-sheet {
    display: flex; flex-direction: column; height: 100%;
    width: 560px; max-width: 100vw;
    background: var(--crm-gray-0, #FFFFFF);
    color: var(--crm-gray-800);
    font-family: var(--crm-font-ui, 'Inter', sans-serif);
  }

  /* Header */
  .t-hdr {
    padding: 22px 24px 16px;
    border-bottom: 1px solid var(--crm-gray-200);
    background: linear-gradient(180deg, var(--crm-gray-50) 0%, var(--crm-gray-0) 100%);
  }
  .t-hdr-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .t-id {
    font: 700 11.5px/1 var(--crm-font-mono);
    color: var(--crm-brand-deep);
    text-decoration: none;
    padding: 3px 8px;
    background: var(--crm-brand-haze);
    border-radius: 5px;
    letter-spacing: -.01em;
  }
  .t-id:hover { text-decoration: underline; }
  .t-title {
    font: 600 20px/1.3 var(--crm-font-display, 'Space Grotesk', sans-serif);
    margin: 10px 0 6px 0;
    color: var(--crm-gray-900);
    letter-spacing: -.01em;
    word-break: break-word;
  }
  .t-customer {
    display: inline-flex; align-items: center; gap: 6px;
    font: 500 12.5px/1.4 var(--crm-font-ui);
    color: var(--crm-gray-500);
    margin-top: 2px;
  }

  .state-pill {
    font: 600 10.5px/1 var(--crm-font-ui);
    text-transform: uppercase; letter-spacing: .08em;
    padding: 4px 8px;
    border-radius: 999px;
    background: var(--crm-gray-100);
    color: var(--crm-gray-600);
  }
  .state-pill.state-started   { background: rgba(217,119,0,.14); color: #9E5800; }
  .state-pill.state-done      { background: rgba(30,160,51,.12); color: #15782B; }
  .state-pill.state-cancelled { background: var(--crm-gray-100); color: var(--crm-gray-400); text-decoration: line-through; }
  .state-pill.state-backlog   { background: var(--crm-gray-100); color: var(--crm-gray-500); }
  .state-pill.state-todo      { background: rgba(86,188,236,.10); color: var(--crm-brand-deep); }

  .prio {
    display: inline-flex; align-items: center; justify-content: center;
    padding: 3px 8px; border-radius: 5px;
    font: 700 10px/1 var(--crm-font-ui);
    letter-spacing: .08em; text-transform: uppercase;
  }
  .prio--urgent { background: rgba(220,38,38,.12); color: #B91C1C; }
  .prio--high   { background: rgba(217,119,0,.14); color: #9E5800; }
  .prio--medium { background: var(--crm-gray-100); color: var(--crm-gray-600); }
  .prio--low    { background: var(--crm-gray-100); color: var(--crm-gray-400); }
  .prio--none   { background: var(--crm-gray-100); color: var(--crm-gray-400); }

  /* Actions */
  .t-actions {
    display: flex; gap: 8px; flex-wrap: wrap;
    padding: 12px 24px;
    background: var(--crm-gray-50);
    border-bottom: 1px solid var(--crm-gray-200);
    align-items: center;
  }
  .t-btn {
    all: unset; cursor: pointer;
    display: inline-flex; align-items: center; gap: 6px;
    padding: 8px 12px;
    border-radius: 8px;
    font: 600 12px/1 var(--crm-font-ui);
    transition: background 120ms ease, transform 120ms ease, box-shadow 160ms ease;
  }
  .t-btn:focus-visible { outline: none; box-shadow: var(--crm-focus-ring); }
  .t-btn--primary {
    background: var(--crm-brand);
    color: white;
    box-shadow: var(--crm-sh-1);
  }
  .t-btn--primary:hover { filter: brightness(1.06); box-shadow: var(--crm-sh-2); transform: translateY(-1px); }
  /* Tracker variant: red-tinted "Stop" state when this ticket is the running one. */
  .t-btn--tracking {
    background: var(--re);
    box-shadow: 0 0 0 1px rgba(255,59,48,.25), 0 2px 10px rgba(255,59,48,.30);
    font-variant-numeric: tabular-nums;
  }
  .t-btn--tracking:hover { filter: brightness(1.08); box-shadow: 0 0 0 1px rgba(255,59,48,.32), 0 4px 16px rgba(255,59,48,.38); }
  .t-btn[disabled] { opacity: .55; cursor: not-allowed; transform: none; filter: none; }
  .t-btn--ghost {
    background: var(--crm-gray-0);
    color: var(--crm-gray-700);
    border: 1px solid var(--crm-gray-200);
  }
  .t-btn--ghost:hover { background: var(--crm-gray-100); color: var(--crm-gray-900); }
  .t-btn--right { margin-left: auto; }

  /* Tabs */
  .t-tabs {
    display: flex; gap: 2px;
    padding: 0 24px;
    border-bottom: 1px solid var(--crm-gray-200);
    background: var(--crm-gray-0);
  }
  .t-tabs button {
    all: unset;
    position: relative;
    padding: 13px 14px 12px;
    font: 600 12px/1 var(--crm-font-ui);
    letter-spacing: .06em; text-transform: uppercase;
    color: var(--crm-gray-500);
    cursor: pointer;
    transition: color 120ms ease;
  }
  .t-tabs button:hover { color: var(--crm-gray-800); }
  .t-tabs button.active { color: var(--crm-brand-deep); }
  .t-tabs button.active::after {
    content: ""; position: absolute;
    left: 14px; right: 14px; bottom: -1px;
    height: 2px;
    background: var(--crm-brand);
    border-radius: 2px 2px 0 0;
  }
  .t-tab-count {
    margin-left: 4px;
    display: inline-flex; align-items: center; justify-content: center;
    min-width: 16px; height: 14px; padding: 0 4px;
    background: var(--crm-gray-200);
    color: var(--crm-gray-700);
    border-radius: 7px;
    font: 700 9.5px/1 var(--crm-font-mono);
  }
  .t-tabs button.active .t-tab-count { background: var(--crm-brand); color: white; }

  .t-body {
    flex: 1; overflow-y: auto;
    padding: 22px 24px 28px;
  }

  /* Description */
  .t-desc { margin-top: 22px; }
  .t-desc p {
    margin: 8px 0 0;
    font: 400 13px/1.6 var(--crm-font-ui);
    color: var(--crm-gray-700);
    white-space: pre-wrap;
  }

  /* Empty states */
  .t-empty {
    padding: 32px 24px;
    text-align: center;
    color: var(--crm-gray-500);
    font: 500 13px/1.5 var(--crm-font-ui);
    background: var(--crm-gray-50);
    border: 1px dashed var(--crm-gray-200);
    border-radius: 10px;
  }
  .hint {
    font: 400 12px/1.6 var(--crm-font-ui);
    color: var(--crm-gray-500);
  }
  .hint code {
    font-family: var(--crm-font-mono);
    padding: 1px 5px; border-radius: 4px;
    background: var(--crm-gray-100); color: var(--crm-gray-700);
  }

  /* Worklogs */
  .wl-list { list-style: none; margin: 0 0 14px; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .wl-item {
    display: grid; grid-template-columns: 84px 1fr; gap: 12px;
    padding: 10px 12px;
    background: var(--crm-gray-0);
    border: 1px solid var(--crm-gray-200);
    border-radius: 8px;
  }
  .wl-time {
    font: 700 14px/1.2 var(--crm-font-display);
    color: var(--crm-brand-deep);
    font-variant-numeric: tabular-nums;
  }
  .wl-actor { font: 600 13px/1.3 var(--crm-font-ui); color: var(--crm-gray-900); }
  .wl-desc  { font: 400 12.5px/1.5 var(--crm-font-ui); color: var(--crm-gray-600); margin-top: 4px; }
  .wl-when  { font: 500 11px/1.3 var(--crm-font-mono); color: var(--crm-gray-400); margin-top: 4px; }

  /* Comments */
  .cmt-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
  .cmt-item {
    padding: 11px 14px;
    background: var(--crm-gray-50);
    border: 1px solid var(--crm-gray-200);
    border-radius: 10px;
  }
  .cmt-head { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; margin-bottom: 6px; }
  .cmt-actor { font: 600 12.5px/1.3 var(--crm-font-ui); color: var(--crm-gray-900); }
  .cmt-when  { font: 500 10.5px/1.3 var(--crm-font-mono); color: var(--crm-gray-400); }
  .cmt-text  { font: 400 13px/1.55 var(--crm-font-ui); color: var(--crm-gray-700); white-space: pre-wrap; word-break: break-word; }

  /* Plan stub */
  .plan-stub {
    padding: 32px 28px;
    text-align: center;
    background: linear-gradient(135deg, rgba(86,188,236,.05) 0%, rgba(107,79,216,.05) 100%);
    border: 1px solid var(--crm-gray-200);
    border-radius: 14px;
  }
  .plan-stub__icon {
    width: 64px; height: 64px;
    border-radius: 16px;
    background: linear-gradient(135deg, var(--crm-brand) 0%, var(--crm-violet) 100%);
    color: white;
    display: grid; place-items: center;
    margin: 0 auto 16px;
    box-shadow: 0 8px 24px rgba(86,188,236,.30);
  }
  .plan-stub h3 {
    font: 600 18px/1.3 var(--crm-font-display);
    color: var(--crm-gray-900);
    margin: 0 0 10px;
  }
  .plan-stub p {
    margin: 0 0 8px;
    font: 400 13px/1.6 var(--crm-font-ui);
    color: var(--crm-gray-700);
  }
</style>

<script lang="ts">
  /**
   * /tracker — personal time-tracker dashboard (Workstream T.4 first slice).
   *
   * Layout:
   *   Header        : page title + capacity bar (own week vs target)
   *   Today panel   : list of today's entries (live via subscribeTimeEntries)
   *   Week strip    : 7 days × hours-per-day with capacity overlay
   *   Manual log    : quick form to backfill an offline entry
   *
   * Subsequent slices add:
   *   /tracker/team    — peer roster (CEO + view_team holders)
   *   /tracker/history — filterable + CSV export
   *   WeekCalendar     — drag-drop hour grid (folds /focus + /schedule into here)
   */
  import { onMount, onDestroy } from "svelte";
  import { goto } from "$app/navigation";
  import { user } from "$stores/user.svelte";
  import { tracker, formatHMS } from "$stores/tracker.svelte";
  import {
    listMyTimeEntries,
    postAuthed,
    subscribeTimeEntries,
    supabase,
    hasClient,
    type TimeEntry,
  } from "$lib/db";
  import {
    GlassActionPrimary,
    GlassActionSecondary,
    GlassValueChip,
    GlassInlineLink,
  } from "$lib/components/glass";
  import { toast } from "$components/GlassToast.svelte";
  // T.7.3 — flagship UX: stopwatch hero + cascade picker on /tracker.
  import StopwatchHero from "$lib/components/tracker/StopwatchHero.svelte";
  import ClientTaskPicker, { type TaskPickResult } from "$lib/components/tracker/ClientTaskPicker.svelte";
  import StopModal from "$lib/components/tracker/StopModal.svelte";
  import TicketCreateDialog from "$lib/components/tracker/TicketCreateDialog.svelte";
  import TimeEditRequestModal from "$lib/components/tracker/TimeEditRequestModal.svelte";
  // T.7.3-D — view switcher + calendar + team (all inline tabs)
  import TrackerViewSwitch from "$lib/components/tracker/TrackerViewSwitch.svelte";
  import CalendarView from "$lib/components/tracker/CalendarView.svelte";
  import TeamTimeView from "$lib/components/tracker/TeamTimeView.svelte";
  import PlanWeekView from "$lib/components/tracker/PlanWeekView.svelte";
  import TasksView from "$lib/components/tracker/TasksView.svelte";
  import AnalyticsView from "$lib/components/tracker/AnalyticsView.svelte";
  import { page } from "$app/stores";

  let mounted = $state(false);
  let entries = $state<TimeEntry[]>([]);
  let loading = $state(true);
  let unsubTracker: (() => void) | null = null;
  let unsubEntries: (() => void) | null = null;

  // CHRONEX — view switcher (?view=tracker|tasks|analytics|calendar|team)
  // All tabs stay on /tracker with a query param; never navigate away.
  // CEO directive 2026-05-25: 5 views (timeline, tasks, analytics, plan week, team time).
  type View = "tracker" | "tasks" | "analytics" | "calendar" | "team";
  const activeView = $derived<View>(($page.url.searchParams.get("view") as View) || "tracker");
  function changeView(next: View) {
    if (next === "tracker") goto("/tracker");
    else                    goto(`/tracker?view=${next}`);
  }

  // T.7.3 — stopwatch hero + task picker state
  let pickerOpen = $state(false);
  function openPicker() { quickStartOpen = true; }
  function closePicker() { pickerOpen = false; }

  // T.7.3-G — stop modal state (CEO directive 2026-05-15)
  // After a stop, show a glass modal asking for notes + optional ticket ref.
  let stoppedEntry = $state<TimeEntry | null>(null);
  function closeStopModal() { stoppedEntry = null; }

  // Quick-start (no ticket required)
  let quickStartOpen = $state(false);
  let quickDesc = $state("");
  let quickClient = $state("");
  let quickStarting = $state(false);
  async function handleQuickStart() {
    if (quickStarting) return;
    quickStarting = true;
    try {
      await tracker.start({
        description: quickDesc.trim() || "Working...",
        client_code: quickClient.trim() || null,
        is_billable: true,
      });
      quickStartOpen = false;
      quickDesc = "";
      quickClient = "";
      toast("Tracker started", "ok");
    } catch (e: any) {
      toast(e?.message || "Could not start tracker", "error");
    } finally {
      quickStarting = false;
    }
  }
  function openTaskPicker() { quickStartOpen = false; pickerOpen = true; }
  async function handlePick(sel: TaskPickResult) {
    try {
      await tracker.start({
        client_code: sel.client_code,
        client_task_id: sel.client_task_id,
        description: sel.description || sel.task_title,
        is_billable: sel.is_billable,
      });
      pickerOpen = false;
      toast(`Tracking ${sel.client_code} · ${sel.task_title}`, "ok");
    } catch (e: any) {
      toast(e?.message || "Could not start tracker", "error");
    }
  }
  async function handleStopFromHero() {
    if (!tracker.running) return;
    try {
      const stopped = await tracker.stop({ idle_seconds: 0 });
      if (stopped) {
        // CHRONEX Phase 2: if the entry never picked a client task (e.g. it was
        // started via quick-start with only a free-text description), open the
        // CLIENT->TASK picker as a backfill modal first. Once the user picks
        // a task, the stopped entry is patched with client_task_id + rate, then
        // the regular StopModal handles notes + ticket ref.
        if (!stopped.client_task_id) {
          backfillEntry = stopped;
          backfillPickerOpen = true;
        } else {
          stoppedEntry = stopped;
        }
      } else {
        toast("Stopped", "ok");
      }
    } catch (e: any) {
      toast(e?.message || "Stop failed", "error");
    }
  }

  // CHRONEX Phase 2 — backfill picker state for entries stopped without a task.
  let backfillPickerOpen = $state(false);
  let backfillEntry = $state<TimeEntry | null>(null);
  function closeBackfillPicker() {
    backfillPickerOpen = false;
    // Even if the user skipped, still surface notes/ticket-ref modal.
    if (backfillEntry) {
      stoppedEntry = backfillEntry;
      backfillEntry = null;
    }
  }
  async function applyBackfillPick(sel: TaskPickResult) {
    if (!backfillEntry) {
      backfillPickerOpen = false;
      return;
    }
    try {
      const patch: Record<string, unknown> = {
        client_task_id: sel.client_task_id,
        client_code: sel.client_code,
        is_billable: sel.is_billable,
      };
      if (sel.description) patch.description = sel.description;
      const { error } = await supabase()
        .from("time_entries")
        .update(patch)
        .eq("id", backfillEntry.id);
      if (error) throw new Error(error.message);
      // Hand off to the notes/ticket-ref modal with the updated entry
      stoppedEntry = { ...backfillEntry, ...patch } as TimeEntry;
      backfillEntry = null;
      backfillPickerOpen = false;
      toast(`Logged to ${sel.client_code} - ${sel.task_title}`, "ok");
    } catch (e: any) {
      toast(e?.message || "Could not link task", "error");
    }
  }

  // ── Week-planner approval state (T.8) ────────────────────────────
  // We compute a single banner from this week's planned_blocks for the
  // current user: draft → "Submit for approval" CTA; submitted → "Awaiting
  // approval" banner; approved → green banner; rejected → red banner + revert.
  type PlanStatus = "draft" | "submitted" | "approved" | "rejected" | "empty";
  let planStatus = $state<PlanStatus>("empty");
  let planBlockCount = $state(0);
  let planRejectReason = $state<string | null>(null);
  let planSaving = $state(false);

  // Manual log form state
  let formOpen      = $state(false);
  let formStart     = $state("");      // datetime-local
  let formEnd       = $state("");
  let formClient    = $state("");
  let formDesc      = $state("");
  let formBillable  = $state(true);
  let formSaving    = $state(false);

  // T.7.3-F — edit request modal target
  let editingEntry = $state<TimeEntry | null>(null);
  function openEdit(e: TimeEntry) {
    if (!e.ended_at) {
      toast("Stop the entry first before editing", "info");
      return;
    }
    editingEntry = e;
  }
  function closeEdit() { editingEntry = null; }

  // T.7.3-C — on-the-fly ticket creation from manual log
  let createTicketOpen = $state(false);
  // When a ticket is created via the dialog, we stash its IDs so the next
  // manual-log submit attaches the time entry to it.
  let pendingTicket = $state<null | {
    plane_issue_id: string;
    plane_issue_seq: string;
    ticket_name: string;
    client_code: string;
  }>(null);

  function openCreateTicket() {
    if (!user.can("tracker.create_ticket") && !user.isAdmin) {
      toast("Permission required: tracker.create_ticket", "error");
      return;
    }
    createTicketOpen = true;
  }
  function handleTicketCreated(c: { issue_id: string; ref: string; name: string; client_code: string }) {
    pendingTicket = {
      plane_issue_id: c.issue_id,
      plane_issue_seq: c.ref,
      ticket_name: c.name,
      client_code: c.client_code,
    };
    formClient = c.client_code;
    if (!formDesc.trim()) formDesc = c.name;
    createTicketOpen = false;
  }

  // ── Bootstrap ────────────────────────────────────────────────────
  onMount(async () => {
    await user.init();
    if (!user.can("tracker.view_own")) {
      // Permissions failsafe — should be impossible if MODULES set up correctly
      goto("/");
      return;
    }
    unsubTracker = tracker.subscribe();
    await refresh();
    unsubEntries = subscribeTimeEntries((row, event) => {
      if (row.user_id !== user.id) return;
      if (event === "DELETE") {
        entries = entries.filter((e) => e.id !== row.id);
      } else if (event === "INSERT") {
        // Only show entries from today/this week (avoid clutter)
        if (isInVisibleWindow(row)) entries = [row, ...entries.filter((e) => e.id !== row.id)];
      } else {
        // UPDATE — swap in place
        const idx = entries.findIndex((e) => e.id === row.id);
        if (idx >= 0) entries[idx] = row;
        else if (isInVisibleWindow(row)) entries = [row, ...entries];
      }
    });
    mounted = true;
  });

  onDestroy(() => {
    unsubTracker?.();
    unsubEntries?.();
  });

  async function refresh() {
    if (!user.id) return;
    loading = true;
    try {
      entries = await listMyTimeEntries(user.id, 200);
      await refreshPlanStatus();
    } finally {
      loading = false;
    }
  }

  // Compute this week's plan-approval status from scheduled_blocks (T.7 columns).
  async function refreshPlanStatus() {
    if (!user.id || !hasClient()) return;
    const wk = currentWeekIso();
    const { data, error } = await supabase()
      .from("scheduled_blocks")
      .select("approval_status, rejection_reason")
      .eq("user_id", user.id)
      .gte("day", wk)
      .lte("day", endOfWeekIso(wk));
    if (error || !data) { planStatus = "empty"; planBlockCount = 0; return; }
    if (data.length === 0) { planStatus = "empty"; planBlockCount = 0; planRejectReason = null; return; }
    planBlockCount = data.length;
    // Precedence: rejected > submitted > draft > approved (a worse outcome wins)
    const statuses = new Set(data.map((d: any) => d.approval_status));
    if (statuses.has("rejected"))  { planStatus = "rejected"; planRejectReason = data.find((d: any) => d.rejection_reason)?.rejection_reason ?? null; return; }
    if (statuses.has("submitted")) { planStatus = "submitted"; planRejectReason = null; return; }
    if (statuses.has("draft"))     { planStatus = "draft";     planRejectReason = null; return; }
    planStatus = "approved";
    planRejectReason = null;
  }

  function currentWeekIso(): string {
    const m = startOfWeek(new Date());
    return m.toISOString().slice(0, 10);
  }
  function endOfWeekIso(weekStartIso: string): string {
    const d = new Date(weekStartIso + "T00:00:00");
    d.setDate(d.getDate() + 6);
    return d.toISOString().slice(0, 10);
  }

  async function submitPlan() {
    if (!user.can("tracker.submit_plan") && !user.isAdmin) {
      toast("You don't have permission to submit a plan.", "error");
      return;
    }
    planSaving = true;
    try {
      const r = await postAuthed("/api/functions/tracker-plan-submit", {
        week_start: currentWeekIso(),
      });
      const status = r?.result?.status;
      const blocks = r?.result?.blocks_changed ?? 0;
      if (status === "approved") {
        toast(`Plan auto-approved (${blocks} blocks)`, "ok");
      } else if (status === "submitted") {
        toast(`Plan submitted (${blocks} blocks) — CEO Telegram fired`, "ok");
      } else {
        toast("Nothing in draft to submit.", "info");
      }
      await refreshPlanStatus();
    } catch (e: any) {
      toast(e?.message || "Submit failed", "error");
    } finally {
      planSaving = false;
    }
  }

  async function revertPlan() {
    planSaving = true;
    try {
      // Tiny RPC inline — revert sets rejected/submitted blocks back to draft
      const { error } = await supabase().rpc("tracker_plan_revert", {
        p_actor: user.id,
        p_week_start: currentWeekIso(),
      });
      if (error) throw new Error(error.message);
      toast("Plan reverted to draft", "ok");
      await refreshPlanStatus();
    } catch (e: any) {
      toast(e?.message || "Revert failed", "error");
    } finally {
      planSaving = false;
    }
  }

  // ── Derived buckets ──────────────────────────────────────────────
  // We compute everything client-side from `entries` so Realtime updates flow
  // through without a re-fetch.
  function startOfWeek(d: Date): Date {
    const m = new Date(d);
    m.setHours(0, 0, 0, 0);
    const dow = m.getDay() || 7;          // 1..7 (Mon..Sun)
    m.setDate(m.getDate() - (dow - 1));
    return m;
  }
  const now = new Date();
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const weekStart = startOfWeek(now);

  function isInVisibleWindow(e: TimeEntry): boolean {
    const s = new Date(e.started_at);
    return s >= weekStart;
  }

  const todayEntries = $derived(
    entries
      .filter((e) => {
        const s = new Date(e.started_at);
        return s >= today;
      })
      .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
  );

  const weekDays = $derived.by(() => {
    // 7-day buckets Mon..Sun
    const buckets: Array<{ date: Date; label: string; isoDate: string; totalSec: number; billableSec: number; isToday: boolean }> = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      buckets.push({
        date: d,
        label: d.toLocaleDateString("de-CH", { weekday: "short", day: "numeric" }),
        isoDate: d.toISOString().slice(0, 10),
        totalSec: 0,
        billableSec: 0,
        isToday: d.getTime() === today.getTime(),
      });
    }
    for (const e of entries) {
      if (!e.ended_at || !e.duration_seconds) continue;
      const s = new Date(e.started_at);
      if (s < weekStart) continue;
      const dayIdx = Math.floor((new Date(s.getFullYear(), s.getMonth(), s.getDate()).getTime() - weekStart.getTime()) / 86_400_000);
      if (dayIdx < 0 || dayIdx >= 7) continue;
      buckets[dayIdx].totalSec += e.duration_seconds;
      if (e.is_billable) buckets[dayIdx].billableSec += e.duration_seconds;
    }
    return buckets;
  });

  // T.7.3-G — weekly stats / per-client breakdown (CEO directive 2026-05-15)
  // Hourly rate fallback when an entry has no rate_chf_per_hour stamped.
  // CEO-managed: see /admin/tracker → Billing rates. 120 CHF is the default
  // standard rate used across c2moviez retainers.
  const DEFAULT_RATE_CHF = 120;

  const weekStats = $derived.by(() => {
    let totalSec = 0;
    let billableSec = 0;
    let nonBillableSec = 0;
    let estRevenue = 0;
    const perClient = new Map<string, { totalSec: number; billableSec: number; revenue: number }>();
    for (const e of entries) {
      if (!e.ended_at || !e.duration_seconds) continue;
      const s = new Date(e.started_at);
      if (s < weekStart) continue;
      totalSec += e.duration_seconds;
      if (e.is_billable) {
        billableSec += e.duration_seconds;
        const rate = Number(e.rate_chf_per_hour ?? DEFAULT_RATE_CHF);
        estRevenue += (e.duration_seconds * rate) / 3600;
      } else {
        nonBillableSec += e.duration_seconds;
      }
      const code = e.client_code || "—";
      const slot = perClient.get(code) ?? { totalSec: 0, billableSec: 0, revenue: 0 };
      slot.totalSec += e.duration_seconds;
      if (e.is_billable) {
        slot.billableSec += e.duration_seconds;
        const rate = Number(e.rate_chf_per_hour ?? DEFAULT_RATE_CHF);
        slot.revenue += (e.duration_seconds * rate) / 3600;
      }
      perClient.set(code, slot);
    }
    const clients = Array.from(perClient.entries())
      .map(([code, v]) => ({ code, ...v, hours: v.totalSec / 3600 }))
      .sort((a, b) => b.totalSec - a.totalSec);
    const maxHours = clients.reduce((m, c) => Math.max(m, c.hours), 0);
    return {
      totalHours: totalSec / 3600,
      billableHours: billableSec / 3600,
      nonBillableHours: nonBillableSec / 3600,
      estRevenue,
      clients,
      maxHours,
    };
  });

  function fmtChf(n: number): string {
    return new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF", maximumFractionDigits: 0 }).format(n);
  }

  // Capacity targets (from tracker store)
  const dailyTargetHr = $derived(Number(tracker.capacity?.daily_target_hours ?? 8.4));
  const weeklyTargetHr = $derived(Number(tracker.capacity?.weekly_target_hours ?? 42));
  const fteText = $derived(`${tracker.capacity?.fte_percent ?? 100}% FTE · ${weeklyTargetHr.toFixed(1)} h target`);

  // Week + day percentage strings — capped at 120%
  function pct(secs: number, targetHr: number): number {
    if (targetHr <= 0) return 0;
    return Math.min(120, (secs / 3600 / targetHr) * 100);
  }

  // ── Helpers ──────────────────────────────────────────────────────
  function fmtTime(iso: string): string {
    return new Date(iso).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Zurich" });
  }
  function fmtDur(seconds: number | null): string {
    if (seconds == null) return "—";
    return formatHMS(seconds);
  }
  function clientAccent(code: string | null): string {
    if (!code) return "var(--brand)";
    return `var(--client-${code}, var(--brand))`;
  }
  function syncTone(state: TimeEntry["plane_sync_state"]): "success" | "warn" | "danger" | "neutral" | "info" {
    if (state === "synced")   return "success";
    if (state === "pending")  return "info";
    if (state === "conflict") return "danger";
    if (state === "skip")     return "neutral";
    return "neutral";
  }

  // ── Manual log submit ────────────────────────────────────────────
  function defaultFormStart(): string {
    // 1 hour ago, rounded to last minute
    const d = new Date(Date.now() - 60 * 60 * 1000);
    d.setSeconds(0, 0);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  }
  function defaultFormEnd(): string {
    const d = new Date();
    d.setSeconds(0, 0);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  }
  function openForm() {
    formStart = defaultFormStart();
    formEnd   = defaultFormEnd();
    formClient = "";
    formDesc   = "";
    formBillable = true;
    formOpen   = true;
  }
  async function submitManualLog() {
    if (!user.can("tracker.manual_log") && !user.isAdmin) {
      toast("You don't have permission to log time manually.", "error");
      return;
    }
    formSaving = true;
    try {
      // datetime-local has no tz suffix — interpret as local
      const startedAt = new Date(formStart).toISOString();
      const endedAt   = new Date(formEnd).toISOString();
      const r = await postAuthed("/api/functions/tracker-log", {
        started_at:   startedAt,
        ended_at:     endedAt,
        description:  formDesc || null,
        client_code:  formClient || pendingTicket?.client_code || null,
        is_billable:  formBillable,
        // T.7.3-C — if the dialog spawned a ticket, attach this entry to it
        plane_issue_id:  pendingTicket?.plane_issue_id || null,
        plane_issue_seq: pendingTicket?.plane_issue_seq || null,
      });
      if (r?.entry) {
        entries = [r.entry, ...entries.filter((e) => e.id !== r.entry.id)];
      }
      pendingTicket = null;
      formOpen = false;
      toast(pendingTicket ? `Entry logged + ticket linked` : "Entry logged", "ok");
    } catch (e: any) {
      toast(e?.message || "Manual log failed", "error");
    } finally {
      formSaving = false;
    }
  }
</script>

<svelte:head><title>NEX · CHRONEX</title></svelte:head>

{#if !mounted}
  <div class="page-loading">Loading tracker…</div>
{:else}
  <div class="tracker-page">
    <!-- ─── Header ───────────────────────────────────────────────────── -->
    <header class="tracker-head">
      <div class="head-left">
        <span class="eyebrow">CHRONEX · Symbiotic work intelligence</span>
        <h1>CHRONEX</h1>
        <p class="sub">{fteText} · timezone <code>{tracker.capacity?.fte_percent != null ? "Europe/Zurich" : "Europe/Zurich"}</code></p>
      </div>
      <div class="head-right">
        <div class="capacity">
          <div class="capacity__row">
            <span class="capacity__label">TODAY</span>
            <span class="capacity__value">{tracker.todayHours.toFixed(1)} / {dailyTargetHr.toFixed(1)} h</span>
          </div>
          <div class="capacity__bar" aria-hidden="true">
            <div class="capacity__fill"
                 style="width: {pct(tracker.todayHours * 3600, dailyTargetHr)}%; background: var(--brand);"></div>
          </div>
          <div class="capacity__row" style="margin-top: 12px;">
            <span class="capacity__label">WEEK</span>
            <span class="capacity__value">{tracker.weekHours.toFixed(1)} / {weeklyTargetHr.toFixed(1)} h</span>
          </div>
          <div class="capacity__bar" aria-hidden="true">
            <div class="capacity__fill"
                 style="width: {pct(tracker.weekHours * 3600, weeklyTargetHr)}%; background: var(--a2);"></div>
          </div>
        </div>
      </div>
    </header>

    <!-- ─── T.7.3-D · View switcher (Tracker / Calendar / Team) ────── -->
    <div class="view-switch-slot">
      <TrackerViewSwitch active={activeView} onChange={changeView} />
    </div>

    {#if activeView === "tasks"}
      <!-- ─── CHRONEX Phase 1: Task Manager ─── -->
      <section class="tasks-slot">
        <TasksView />
      </section>
    {:else if activeView === "analytics"}
      <!-- ─── CHRONEX Phase 3: Analytics ─── -->
      <section class="analytics-slot">
        <AnalyticsView />
      </section>
    {:else if activeView === "calendar"}
      <!-- ─── Plan Week: priority-scored focus cards + calendar grid below ─── -->
      <section class="planweek-slot">
        <PlanWeekView />
      </section>
      <section class="calendar-slot">
        <CalendarView />
      </section>
    {:else if activeView === "team"}
      <!-- ─── T.7.3-D · Team time view (formerly /tracker/team) ─── -->
      {#if user.can("tracker.view_team") || user.isAdmin}
        <section class="team-slot">
          <TeamTimeView />
        </section>
      {:else}
        <section class="team-slot">
          <p class="empty">You don't have <code>tracker.view_team</code>. Ask the CEO via /admin/permissions.</p>
        </section>
      {/if}
    {:else}
      <!-- ─── T.7.3 · Stopwatch hero (start tracking from /tracker) ───── -->
      <section class="hero-slot" aria-label="Start or stop the tracker">
        <StopwatchHero
          onStartRequested={openPicker}
          onStopRequested={handleStopFromHero}
        />

        {#if quickStartOpen && !tracker.running}
          <div class="quick-start-card">
            <input
              class="qs-input"
              type="text"
              placeholder="What are you working on?"
              bind:value={quickDesc}
              onkeydown={(e) => e.key === 'Enter' && handleQuickStart()}
              autofocus
            />
            <input
              class="qs-input qs-input--client"
              type="text"
              placeholder="Client code (e.g. SHI)"
              bind:value={quickClient}
              onkeydown={(e) => e.key === 'Enter' && handleQuickStart()}
            />
            <div class="qs-actions">
              <button class="qs-btn qs-btn--primary" onclick={handleQuickStart} disabled={quickStarting}>
                {quickStarting ? "Starting..." : "Start timer"}
              </button>
              <button class="qs-btn qs-btn--ghost" onclick={openTaskPicker}>
                Pick client task
              </button>
              <button class="qs-btn qs-btn--cancel" onclick={() => quickStartOpen = false}>
                Cancel
              </button>
            </div>
          </div>
        {/if}
      </section>
    {/if}

    <!-- ─── Plan-approval banner (T.8) ─────────────────────────────── -->
    {#if planStatus !== "empty"}
      <div class="plan-banner plan-banner--{planStatus}" role="status">
        <div class="plan-banner__main">
          {#if planStatus === "draft"}
            <span class="plan-banner__title">📝 Draft week plan</span>
            <span class="plan-banner__sub">{planBlockCount} block{planBlockCount === 1 ? "" : "s"} planned · submit for {user.isAdmin ? "auto-approval" : "CEO approval"}</span>
          {:else if planStatus === "submitted"}
            <span class="plan-banner__title">⏳ Awaiting CEO approval</span>
            <span class="plan-banner__sub">Submitted · {planBlockCount} block{planBlockCount === 1 ? "" : "s"} pending review</span>
          {:else if planStatus === "approved"}
            <span class="plan-banner__title">✅ Plan approved</span>
            <span class="plan-banner__sub">{planBlockCount} block{planBlockCount === 1 ? "" : "s"} active this week</span>
          {:else if planStatus === "rejected"}
            <span class="plan-banner__title">❌ Plan rejected</span>
            <span class="plan-banner__sub">{planRejectReason || "See CEO message"} · revert to draft to revise</span>
          {/if}
        </div>
        <div class="plan-banner__actions">
          {#if planStatus === "draft"}
            <GlassActionPrimary onclick={submitPlan} loading={planSaving} disabled={planBlockCount === 0}>
              {#snippet children()}{user.isAdmin ? "Submit (auto-approve)" : "Submit for approval"}{/snippet}
            </GlassActionPrimary>
          {:else if planStatus === "rejected"}
            <GlassActionSecondary onclick={revertPlan} loading={planSaving}>
              {#snippet children()}Revert to draft{/snippet}
            </GlassActionSecondary>
          {:else if planStatus === "submitted"}
            <GlassActionSecondary onclick={revertPlan} loading={planSaving} tone="warn">
              {#snippet children()}Withdraw submission{/snippet}
            </GlassActionSecondary>
          {/if}
        </div>
      </div>
    {/if}

    {#if activeView === "tracker"}
    <!-- ─── Week strip ──────────────────────────────────────────────── -->
    <section class="panel">
      <div class="panel__head">
        <h2>Week strip</h2>
        <span class="panel__sub">Mon → Sun · billable in solid, total in halo</span>
      </div>
      <div class="weekstrip" role="list" aria-label="This week">
        {#each weekDays as d}
          {@const total = d.totalSec / 3600}
          {@const billable = d.billableSec / 3600}
          {@const haloPct = pct(d.totalSec, dailyTargetHr)}
          {@const fillPct = pct(d.billableSec, dailyTargetHr)}
          <div class="ws-day" class:ws-day--today={d.isToday} role="listitem">
            <div class="ws-day__label">{d.label}</div>
            <div class="ws-day__bar" aria-hidden="true">
              <div class="ws-day__halo" style="height: {haloPct}%;"></div>
              <div class="ws-day__fill" style="height: {fillPct}%;"></div>
            </div>
            <div class="ws-day__hours">{total.toFixed(1)}h</div>
          </div>
        {/each}
      </div>
    </section>

    <!-- ─── Today entries ───────────────────────────────────────────── -->
    <section class="panel">
      <div class="panel__head">
        <h2>Today</h2>
        <div class="panel__actions">
          {#if user.can("tracker.manual_log") || user.isAdmin}
            <GlassActionSecondary onclick={openForm}>
              {#snippet children()}+ Log manually{/snippet}
            </GlassActionSecondary>
          {/if}
        </div>
      </div>

      {#if loading}
        <div class="rows">
          {#each Array(3) as _}<div class="skel"></div>{/each}
        </div>
      {:else if tracker.running && tracker.running.user_id === user.id}
        <!-- The running entry sits at the top — the chip handles stop -->
        <div class="entry entry--running">
          <div class="entry__accent" style={`background: ${clientAccent(tracker.running.client_code)};`}></div>
          <div class="entry__main">
            <div class="entry__top">
              {#if tracker.running!.plane_issue_seq}
                <GlassValueChip size="sm" static accent={clientAccent(tracker.running!.client_code)}>
                  {#snippet children()}{tracker.running!.plane_issue_seq}{/snippet}
                </GlassValueChip>
              {/if}
              <span class="entry__desc">{tracker.running.description || "(untitled)"}</span>
            </div>
            <div class="entry__meta">
              <span class="entry__time"><strong>{fmtTime(tracker.running.started_at)}</strong> · running</span>
              {#if tracker.running.client_code}
                <span class="entry__client">{tracker.running.client_code}</span>
              {/if}
              <span class="entry__bill" class:on={tracker.running.is_billable}>
                {tracker.running.is_billable ? "billable" : "non-billable"}
              </span>
            </div>
          </div>
          <div class="entry__dur entry__dur--live">{formatHMS(tracker.elapsed)}</div>
        </div>
      {/if}

      <div class="rows">
        {#each todayEntries.filter(e => !!e.ended_at) as e (e.id)}
          <div class="entry">
            <div class="entry__accent" style={`background: ${clientAccent(e.client_code)};`}></div>
            <div class="entry__main">
              <div class="entry__top">
                {#if e.plane_issue_seq}
                  <GlassValueChip size="sm" static accent={clientAccent(e.client_code)}>
                    {#snippet children()}{e.plane_issue_seq}{/snippet}
                  </GlassValueChip>
                {/if}
                <span class="entry__desc">{e.description || "(untitled)"}</span>
              </div>
              <div class="entry__meta">
                <span class="entry__time">{fmtTime(e.started_at)} → {fmtTime(e.ended_at!)}</span>
                {#if e.client_code}<span class="entry__client">{e.client_code}</span>{/if}
                <span class="entry__bill" class:on={e.is_billable}>{e.is_billable ? "billable" : "non-billable"}</span>
                <GlassValueChip size="sm" static tone={syncTone(e.plane_sync_state)}>
                  {#snippet children()}plane · {e.plane_sync_state}{/snippet}
                </GlassValueChip>
                {#if user.can("tracker.edit_logged_time") || user.isAdmin}
                  <!-- T.7.3-F — tap to open the edit-request modal -->
                  <GlassInlineLink onclick={() => openEdit(e)}>edit</GlassInlineLink>
                {/if}
              </div>
            </div>
            <div class="entry__dur">{fmtDur(e.duration_seconds)}</div>
          </div>
        {:else}
          <div class="empty">No entries yet today. Tap the stopwatch above, or use <GlassInlineLink onclick={openForm}>+ Log manually</GlassInlineLink>.</div>
        {/each}
      </div>
    </section>
    {/if}

    {#if activeView === "tracker"}
      <!-- ─── T.7.3-G · This week summary + per-client breakdown ──────── -->
      <!-- CEO directive 2026-05-15: client-task centric revenue + chart. -->
      <section class="panel">
        <div class="panel__head">
          <h2>This week</h2>
          <span class="panel__sub">Hours + estimated revenue · Mon → Sun</span>
        </div>

        <div class="week-summary kpi-row">
          <div class="stat">
            <span class="stat__label">Total</span>
            <span class="stat__value">{weekStats.totalHours.toFixed(1)} h</span>
          </div>
          <div class="stat">
            <span class="stat__label">Billable</span>
            <span class="stat__value stat__value--good">{weekStats.billableHours.toFixed(1)} h</span>
          </div>
          <div class="stat">
            <span class="stat__label">Non-billable</span>
            <span class="stat__value stat__value--muted">{weekStats.nonBillableHours.toFixed(1)} h</span>
          </div>
          <div class="stat stat--accent">
            <span class="stat__label">Est. revenue</span>
            <span class="stat__value stat__value--accent">{fmtChf(weekStats.estRevenue)}</span>
          </div>
        </div>

        {#if weekStats.clients.length > 0}
          <div class="client-chart" role="list" aria-label="Per-client hours this week">
            {#each weekStats.clients as c (c.code)}
              {@const widthPct = weekStats.maxHours > 0 ? Math.max(4, (c.hours / weekStats.maxHours) * 100) : 0}
              <div class="cc-row" role="listitem">
                <div class="cc-row__head">
                  <span class="cc-row__code">{c.code}</span>
                  <span class="cc-row__hours">{c.hours.toFixed(1)} h</span>
                  {#if c.revenue > 0}
                    <span class="cc-row__rev">{fmtChf(c.revenue)}</span>
                  {/if}
                </div>
                <svg class="cc-row__svg" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true">
                  <rect x="0" y="0" width="100" height="8" rx="4" ry="4" fill="var(--s2)" />
                  <rect
                    x="0" y="0"
                    width={widthPct} height="8"
                    rx="4" ry="4"
                    fill={`var(--client-${c.code}, var(--brand))`}
                  />
                </svg>
              </div>
            {/each}
          </div>
        {:else}
          <div class="empty">No closed entries this week yet.</div>
        {/if}
      </section>
    {/if}
  </div>

  <!-- T.7.3-G · ClientTaskPicker — task-centric replacement (2026-05-15) -->
  <ClientTaskPicker
    open={pickerOpen}
    onPick={handlePick}
    onClose={closePicker}
  />

  <!-- CHRONEX Phase 2 · Backfill picker after stopping a timer without a task -->
  <ClientTaskPicker
    open={backfillPickerOpen}
    onPick={applyBackfillPick}
    onClose={closeBackfillPicker}
  />

  <!-- T.7.3-G · StopModal — optional notes + ticket-ref link after stopping -->
  <StopModal
    entry={stoppedEntry}
    onClose={closeStopModal}
  />

  <!-- ─── Manual log modal ────────────────────────────────────────────── -->
  {#if formOpen}
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal__box">
        <h3>Log time manually</h3>
        <p class="modal__hint">Backfill a past entry (e.g. work you did offline). The entry will sync to Plane on the next 2-min cron.</p>
        <div class="form-grid">
          <label>
            <span>Start</span>
            <input type="datetime-local" bind:value={formStart} step="60" />
          </label>
          <label>
            <span>End</span>
            <input type="datetime-local" bind:value={formEnd} step="60" />
          </label>
          <label class="form-grid--wide">
            <span>Client code (optional)</span>
            <input type="text" placeholder="e.g. SHI, MFB" bind:value={formClient} />
          </label>
          <label class="form-grid--wide">
            <span>Description</span>
            <input type="text" placeholder="What did you work on?" bind:value={formDesc} />
          </label>
          {#if user.isAdmin}
            <!-- T.7.3 follow-up — billable toggle is a CEO-only override.
                 Non-CEO logs are auto-flagged billable based on /admin/tracker rules. -->
            <label class="form-grid--wide checkbox">
              <input type="checkbox" bind:checked={formBillable} />
              <span>Billable <span class="checkbox__hint">(CEO override · default is set per-client in /admin/tracker)</span></span>
            </label>
          {/if}

          <!-- T.7.3-C — when billable, offer to create a ticket on the fly -->
          {#if formBillable}
            <div class="form-grid--wide create-ticket-row">
              {#if pendingTicket}
                <div class="create-ticket-attached">
                  <GlassValueChip tone="success" size="sm" static>
                    {#snippet children()}✓ linked to {pendingTicket!.plane_issue_seq}{/snippet}
                  </GlassValueChip>
                  <span class="create-ticket-name">{pendingTicket!.ticket_name}</span>
                  <button type="button" class="create-ticket-clear" onclick={() => pendingTicket = null} aria-label="Unlink">×</button>
                </div>
              {:else}
                <GlassInlineLink onclick={openCreateTicket}>
                  + Create a Plane ticket for this work (data-hygiene fields required)
                </GlassInlineLink>
              {/if}
            </div>
          {/if}
        </div>
        <div class="modal__actions">
          <GlassActionSecondary onclick={() => formOpen = false}>
            {#snippet children()}Cancel{/snippet}
          </GlassActionSecondary>
          <GlassActionPrimary onclick={submitManualLog} loading={formSaving}>
            {#snippet children()}Save entry{/snippet}
          </GlassActionPrimary>
        </div>
      </div>
    </div>
  {/if}

  <!-- T.7.3-C — TicketCreateDialog spawned from the manual-log + Create ticket link -->
  <TicketCreateDialog
    open={createTicketOpen}
    initial={{ name: formDesc, client_code: formClient, description: formDesc }}
    onCreated={handleTicketCreated}
    onClose={() => createTicketOpen = false}
  />

  <!-- T.7.3-F — TimeEditRequestModal for after-the-fact edits.
       ≤5 min drift auto-applies. >5 min routes to CEO Telegram approval. -->
  <TimeEditRequestModal
    entry={editingEntry}
    onClose={closeEdit}
    onApplied={() => { /* Realtime channel will refresh the list */ }}
  />
{/if}

<style>
  .page-loading {
    display: grid; place-items: center;
    min-height: 50vh;
    color: var(--t3);
    font-family: var(--sa);
  }
  .tracker-page {
    max-width: 1200px;
    margin: 0 auto;
    padding: 32px 24px 80px;
    font-family: var(--sa);
    color: var(--tx);
  }

  .tracker-head {
    display: grid;
    grid-template-columns: 1fr minmax(260px, 380px);
    gap: 24px;
    align-items: end;
    padding-bottom: 24px;
    border-bottom: 1px solid var(--line);
    margin-bottom: 24px;
  }
  .eyebrow {
    font: 700 11px/1.3 var(--sa);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--brand-deep);
  }
  .tracker-head h1 {
    font-family: var(--hd);
    font-weight: 700;
    font-size: 30px;
    margin: 6px 0 4px;
    letter-spacing: -0.02em;
  }
  .sub { margin: 0; font-size: 13px; color: var(--t2); }
  .sub code { font-family: var(--mo); font-size: 12px; padding: 1px 6px; border-radius: 6px; background: var(--s1); }

  .capacity {
    padding: 16px;
    border-radius: var(--r2);
    background: var(--glass-card);
    backdrop-filter: var(--blur-card);
    -webkit-backdrop-filter: var(--blur-card);
    border: 1px solid var(--line);
    box-shadow: var(--sh-card);
  }
  .capacity__row { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  .capacity__label { font: 700 10.5px/1.3 var(--sa); letter-spacing: 0.10em; color: var(--t3); text-transform: uppercase; }
  .capacity__value {
    font-family: var(--mo);
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    font-size: 15px;
    color: var(--tx);
  }
  .capacity__bar {
    margin-top: 6px;
    height: 8px;
    border-radius: 999px;
    background: var(--s2);
    overflow: hidden;
  }
  .capacity__fill {
    height: 100%;
    border-radius: 999px;
    transition: width 280ms var(--ease);
  }

  .panel {
    margin-top: 28px;
    padding: 20px;
    border-radius: var(--r2);
    background: var(--glass-card);
    backdrop-filter: var(--blur-card);
    -webkit-backdrop-filter: var(--blur-card);
    border: 1px solid var(--line);
    box-shadow: var(--sh-card);
  }
  .panel__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 16px;
  }
  .panel__head h2 { margin: 0; font-family: var(--hd); font-weight: 600; font-size: 18px; }
  .panel__sub { font-size: 12px; color: var(--t3); }
  .panel__actions { display: inline-flex; gap: 8px; }

  /* Week strip — 7 vertical bars */
  .weekstrip {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 12px;
    align-items: end;
  }
  .ws-day {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }
  .ws-day__label {
    font: 600 11px/1.2 var(--sa);
    color: var(--t2);
    text-transform: capitalize;
  }
  .ws-day--today .ws-day__label { color: var(--brand-deep); }
  .ws-day__bar {
    position: relative;
    width: 100%;
    max-width: 56px;
    height: 120px;
    border-radius: 8px;
    background: var(--s1);
    border: 1px solid var(--line);
    overflow: hidden;
  }
  .ws-day__halo {
    position: absolute;
    left: 0; right: 0; bottom: 0;
    background: var(--brand-soft);
    border-radius: 8px 8px 0 0;
    transition: height 280ms var(--ease);
  }
  .ws-day__fill {
    position: absolute;
    left: 0; right: 0; bottom: 0;
    background: linear-gradient(180deg, var(--brand), var(--brand-deep));
    border-radius: 8px 8px 0 0;
    transition: height 280ms var(--ease);
  }
  .ws-day--today .ws-day__bar { border-color: var(--brand-line); box-shadow: 0 0 0 1px var(--brand-line); }
  .ws-day__hours {
    font: 600 11px/1 var(--mo);
    color: var(--t2);
    font-variant-numeric: tabular-nums;
  }

  /* Entry rows */
  .rows { display: flex; flex-direction: column; gap: 8px; }
  .entry {
    position: relative;
    display: grid;
    grid-template-columns: 4px 1fr auto;
    gap: 12px;
    padding: 10px 12px;
    border-radius: var(--r1);
    background: var(--s1);
    border: 1px solid var(--line);
    overflow: hidden;
    transition: background 120ms var(--ease), border-color 120ms var(--ease);
  }
  .entry:hover { background: var(--s2); border-color: var(--line-2); }
  .entry--running {
    background: var(--brand-softer);
    border-color: var(--brand-line);
    box-shadow: 0 0 0 1px var(--brand-line), 0 2px 16px -4px var(--brand-glow);
  }
  .entry__accent { width: 4px; align-self: stretch; border-radius: 2px; }
  .entry__main { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .entry__top {
    display: flex; align-items: center; gap: 8px; min-width: 0;
  }
  .entry__desc {
    font-weight: 600;
    font-size: 13.5px;
    color: var(--tx);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .entry__meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    font-size: 11.5px;
    color: var(--t3);
  }
  .entry__time strong { color: var(--tx); font-family: var(--mo); font-variant-numeric: tabular-nums; }
  .entry__client {
    padding: 1px 6px;
    border-radius: 4px;
    background: var(--s2);
    font: 600 11px/1.3 var(--mo);
    color: var(--t2);
  }
  .entry__bill {
    padding: 1px 6px;
    border-radius: 999px;
    background: var(--s2);
    font-size: 11px;
    color: var(--t3);
  }
  .entry__bill.on { background: rgba(30,160,51,.12); color: var(--gr); }
  .entry__dur {
    font-family: var(--mo);
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    font-size: 14px;
    color: var(--tx);
    align-self: center;
  }
  .entry__dur--live { color: var(--brand-deep); }

  .skel {
    height: 60px;
    border-radius: var(--r1);
    background: linear-gradient(90deg, var(--s1), var(--s2), var(--s1));
    background-size: 200% 100%;
    animation: skel-pulse 1.4s ease-in-out infinite;
  }
  @keyframes skel-pulse {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  .empty {
    padding: 24px 16px;
    border-radius: var(--r1);
    background: var(--s1);
    border: 1px dashed var(--line-2);
    text-align: center;
    font-size: 13px;
    color: var(--t2);
    line-height: 1.6;
  }

  /* Manual log modal */
  .modal {
    position: fixed;
    inset: 0;
    background: var(--overlay);
    display: grid;
    place-items: center;
    z-index: var(--z-modal);
    padding: 16px;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }
  .modal__box {
    width: min(520px, 100%);
    padding: 24px;
    background: var(--glass-elev);
    backdrop-filter: var(--blur-elev);
    -webkit-backdrop-filter: var(--blur-elev);
    border: 1px solid var(--line);
    border-radius: var(--r3);
    box-shadow: var(--sh-elev);
  }
  .modal__box h3 { margin: 0 0 6px; font-family: var(--hd); font-weight: 600; font-size: 18px; }
  .modal__hint { margin: 0 0 16px; font-size: 12.5px; color: var(--t2); line-height: 1.5; }
  .form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .form-grid label { display: flex; flex-direction: column; gap: 4px; }
  .form-grid--wide { grid-column: 1 / -1; }
  .form-grid label span { font: 600 11px/1.2 var(--sa); color: var(--t3); text-transform: uppercase; letter-spacing: 0.06em; }
  .form-grid label.checkbox { flex-direction: row; align-items: center; gap: 8px; }
  .form-grid label.checkbox span { text-transform: none; letter-spacing: 0; color: var(--tx); }
  .form-grid input[type="text"],
  .form-grid input[type="datetime-local"] {
    appearance: none;
    padding: 10px 12px;
    font: 500 13.5px/1 var(--sa);
    color: var(--tx);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: 10px;
    outline: none;
  }
  .form-grid input:focus { border-color: var(--brand-line-2); box-shadow: 0 0 0 3px var(--brand-line-2); }
  .modal__actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 18px;
  }

  /* T.7.3 — Stopwatch hero slot sits between header + plan banner. */
  .hero-slot {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin: 16px 0 24px;
  }

  /* Quick-start card */
  .quick-start-card {
    margin-top: 20px;
    width: 100%;
    max-width: 420px;
    background: var(--glass-chrome);
    backdrop-filter: var(--blur-chrome);
    -webkit-backdrop-filter: var(--blur-chrome);
    border: 1px solid var(--brand-line);
    border-radius: 16px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    animation: fade-in 0.15s ease;
  }
  @keyframes fade-in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }
  .qs-input {
    all: unset;
    width: 100%;
    box-sizing: border-box;
    height: 40px;
    padding: 0 12px;
    border-radius: 10px;
    background: var(--canvas-2);
    border: 1px solid var(--line);
    color: var(--ink);
    font: 400 13.5px/1 'Inter', sans-serif;
    transition: border-color 0.15s;
  }
  .qs-input:focus { border-color: var(--brand-line-2); }
  .qs-input--client { font-size: 12.5px; }
  .qs-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .qs-btn {
    all: unset;
    cursor: pointer;
    height: 36px;
    padding: 0 16px;
    border-radius: 10px;
    font: 600 12.5px/1 'Inter', sans-serif;
    transition: all 0.15s;
    white-space: nowrap;
  }
  .qs-btn--primary {
    background: var(--brand);
    color: #fff;
    flex: 1;
  }
  .qs-btn--primary:hover:not(:disabled) { filter: brightness(1.1); }
  .qs-btn--primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .qs-btn--ghost {
    background: var(--canvas-2);
    border: 1px solid var(--line);
    color: var(--ink-2);
  }
  .qs-btn--ghost:hover { border-color: var(--brand-line-2); color: var(--ink); }
  .qs-btn--cancel {
    color: var(--ink-3);
    background: transparent;
    border: 1px solid transparent;
  }
  .qs-btn--cancel:hover { color: var(--ink-2); }
  .checkbox__hint {
    font: 500 11.5px/1.2 var(--sa);
    color: var(--t3);
    margin-left: 6px;
  }

  /* T.7.3-D — view switcher pills + calendar/team slots */
  .view-switch-slot {
    display: flex;
    justify-content: center;
    margin: 8px 0 16px;
  }
  .planweek-slot {
    margin: 8px 0 0;
  }
  .calendar-slot, .team-slot, .tasks-slot, .analytics-slot {
    margin: 8px 0 24px;
  }

  /* T.7.3-C — Create-ticket link row inside the manual-log form */
  .create-ticket-row {
    padding: 10px 12px;
    border-radius: 8px;
    background: var(--brand-softer);
    border: 1px dashed var(--brand-line);
    font: 500 12.5px/1.4 var(--sa);
  }
  .create-ticket-attached {
    display: flex; align-items: center; gap: 10px;
    flex-wrap: wrap;
  }
  .create-ticket-name {
    flex: 1; min-width: 0;
    font: 600 12.5px/1.3 var(--sa);
    color: var(--tx);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .create-ticket-clear {
    appearance: none; border: 1px solid var(--line);
    background: var(--s1); color: var(--t2); cursor: pointer;
    width: 24px; height: 24px; border-radius: 6px;
    display: grid; place-items: center;
    font: 700 14px/1 var(--sa);
  }
  .create-ticket-clear:hover { color: var(--re); border-color: rgba(224,49,43,.4); }

  /* Plan-approval banner (T.8) */
  .plan-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-top: 16px;
    padding: 14px 18px;
    border-radius: var(--r2);
    border: 1px solid var(--brand-line);
    background: var(--brand-soft);
    backdrop-filter: var(--blur-card);
    -webkit-backdrop-filter: var(--blur-card);
  }
  .plan-banner__main { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .plan-banner__title { font: 600 14px/1.2 var(--sa); color: var(--tx); }
  .plan-banner__sub   { font-size: 12px; color: var(--t2); }
  .plan-banner__actions { flex-shrink: 0; }
  .plan-banner--draft { background: var(--s2); border-color: var(--line-2); }
  .plan-banner--submitted { background: var(--chip-tint-warn); border-color: rgba(217,119,0,0.32); }
  .plan-banner--approved { background: var(--chip-tint-success); border-color: rgba(30,160,51,0.32); }
  .plan-banner--rejected { background: var(--chip-tint-danger); border-color: rgba(224,49,43,0.32); }

  /* T.7.3-G — Week summary + per-client chart */
  .week-summary {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    margin-bottom: 18px;
  }
  .stat {
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--s1);
    border: 1px solid var(--line);
    display: flex; flex-direction: column; gap: 4px;
  }
  .stat--accent {
    background: var(--brand-softer);
    border-color: var(--brand-line);
  }
  .stat__label {
    font: 600 11px/1.2 var(--sa);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--t3);
  }
  .stat__value {
    font: 700 18px/1.1 var(--mo);
    font-variant-numeric: tabular-nums;
    color: var(--tx);
  }
  .stat__value--good { color: var(--gr, #1ea033); }
  .stat__value--muted { color: var(--t3); }
  .stat__value--accent { color: var(--brand-deep); }

  .client-chart {
    display: flex; flex-direction: column; gap: 10px;
  }
  .cc-row {
    display: flex; flex-direction: column; gap: 4px;
  }
  .cc-row__head {
    display: flex; align-items: baseline; gap: 12px;
  }
  .cc-row__code {
    font: 700 12px/1 var(--mo);
    color: var(--brand-deep);
    letter-spacing: 0.04em;
    min-width: 50px;
  }
  .cc-row__hours {
    font: 600 12.5px/1 var(--sa);
    color: var(--tx);
    font-variant-numeric: tabular-nums;
  }
  .cc-row__rev {
    margin-left: auto;
    font: 500 11.5px/1 var(--mo);
    color: var(--t2);
    font-variant-numeric: tabular-nums;
  }
  .cc-row__svg {
    width: 100%;
    height: 8px;
    display: block;
  }

  /* Mobile parity */
  @media (max-width: 760px) {
    .tracker-head { grid-template-columns: 1fr; }
    .head-right { width: 100%; }
    .weekstrip { gap: 6px; }
    .ws-day__bar { height: 80px; }
    .panel { padding: 16px; }
    .entry { grid-template-columns: 4px 1fr; }
    .entry__dur { grid-column: 2 / -1; justify-self: end; margin-top: 4px; }
    .plan-banner { flex-direction: column; align-items: stretch; }
    .plan-banner__actions { display: flex; justify-content: stretch; }
    .week-summary { grid-template-columns: repeat(2, 1fr); }
  }
</style>

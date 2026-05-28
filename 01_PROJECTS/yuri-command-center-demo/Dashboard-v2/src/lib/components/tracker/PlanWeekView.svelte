<script lang="ts">
  /**
   * PlanWeekView — Focus-grade week planner inside /tracker?view=planweek.
   *
   * Ports the core Focus module features directly into the Tracker module
   * so each team member plans their week in the same place they log time.
   *
   * Features ported from /focus:
   *   - Priority scoring (overdue +40/30, urgent +25, high +15, MRR +10)
   *   - CTI / FK / TEAM toggle
   *   - Today's Schedule: scored cards + time slots + "Planned" state
   *   - Calendar event match detection (purple pill on card)
   *   - Smart slot suggestions (urgent→08:30, high-MRR→09:30, admin→15:00)
   *   - Done → mark local + push to Plane via focus-mark-done
   *   - Not done → reschedule count + 5-min "why not" capture
   *   - Heavy day detection (reduce card count to 3 when production keywords)
   *   - Up Next queue (tickets this week not in today's schedule)
   *
   * Tracker-specific additions:
   *   - "Start" button on each card fires tracker.start() immediately
   *   - Shared focus:* localStorage namespace with /focus for cross-tab consistency
   */
  import { onMount, onDestroy } from "svelte";
  import { getAuthed, postAuthed } from "$lib/db";
  import { tracker } from "$stores/tracker.svelte";
  import { user } from "$stores/user.svelte";
  import { toast } from "$components/GlassToast.svelte";
  import TicketPlannerDrawer from "$components/TicketPlannerDrawer.svelte";
  type FocusTicket = import("$components/TicketPlannerDrawer.svelte").FocusTicket;

  // ── Types ─────────────────────────────────────────────────────────
  type EntityRow = { entity_id: string; entity_name: string; state: Record<string, any> | null; updated_at: string };
  type InvoiceRow = { id: string; number?: string | null; client_code?: string | null; client_name?: string | null; status: string; amount?: number | null; currency?: string | null; due_date?: string | null };
  type FocusData = { ok: boolean; today: string; tickets: EntityRow[]; clients: EntityRow[]; meetings: EntityRow[]; invoices: InvoiceRow[] };
  type SourceType = "ticket" | "meeting" | "finance";
  type PlanStatus = "open" | "in_progress" | "planned" | "done" | "not_done";
  type UserView = "CTI" | "FK" | "TEAM";
  type SlotPersist = { start: string; end: string };
  type CalEvent = { dateISO: string; startMin: number; endMin: number; title: string };
  type PlanItem = {
    id: string; type: SourceType; title: string; score: number;
    due: string; reason: string; client: string; priority?: string;
    assigneeName: string; assigneeEmail: string;
    estHours: number; slot: string; status: PlanStatus;
    rescheduleCount: number; notDoneReason: string;
    calendarMatch?: { time: string; title: string } | null;
    mrr: number; isAdmin: boolean; suggestedSlot: string;
    suggestedReschedule?: string;
    ticketNum?: string;
  };

  // ── Constants ─────────────────────────────────────────────────────
  const FK_EMAIL = "fanny@c2moviez.com";
  const FK_KEYS = ["fanny", "fk", "kecskes"];
  const CTI_NAME_KEYS = ["claudio", "tinner", "cti"];
  const CTI_EMAIL_KEYS = ["claudio", "tinner", "info@c2moviez", "c2m_coo"];
  const FK_PLANE_ID  = "bff07aa8";
  const CTI_PLANE_ID = "2d7e4403";
  const WORK_START = 9;
  const WORK_END = 18;
  const RESCHEDULE_LIMIT = 3;
  const WHY_WINDOW_MS = 5 * 60 * 1000;
  const MAX_FOCUS_NORMAL = 7;
  const MAX_FOCUS_HEAVY  = 3;
  const PRODUCTION_KW = ["shooting", "recording", "dreh", "aufnahme", "shoot", "session"];

  const todayISO = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Zurich" });

  // ── State ─────────────────────────────────────────────────────────
  let rawData = $state<FocusData | null>(null);
  let loading = $state(true);
  let calEvents = $state<CalEvent[]>([]);
  let userView = $state<UserView>("CTI");
  let nowTick = $state(Date.now());

  // localStorage-backed per-ticket state (shared namespace with /focus)
  let estHoursMap    = $state<Record<string, number>>({});
  let slotMap        = $state<Record<string, SlotPersist>>({});
  let statusMap      = $state<Record<string, PlanStatus>>({});
  let rescheduleMap  = $state<Record<string, number>>({});
  let notDoneReasonMap = $state<Record<string, string>>({});

  let whyCaptureId = $state("");
  let whyCaptureExpiresAt = $state(0);
  let whyCaptureValue = $state("");
  let whyCaptureTimer: ReturnType<typeof setTimeout> | null = null;
  let startingId = $state("");
  let queueShown = $state(8);

  let clockTimer: ReturnType<typeof setInterval> | null = null;

  // Drawer state (shared planner UI from /focus)
  let drawerTicket = $state<FocusTicket | null>(null);

  function toFocusTicket(item: PlanItem): FocusTicket {
    return {
      id: item.id,
      type: item.type,
      title: item.title,
      score: item.score,
      due: item.due,
      reason: item.reason,
      href: "",
      client: item.client,
      priority: item.priority,
      assigneeName: item.assigneeName,
      assigneeEmail: item.assigneeEmail,
      estHours: item.estHours,
      trackedHours: 0,
      slot: item.slot,
      status: (item.status === "not_done" ? "open" : item.status) as any,
      rescheduleCount: item.rescheduleCount,
      notDoneReason: item.notDoneReason,
      mrr: item.mrr,
      isAdmin: item.isAdmin,
      suggestedReschedule: item.suggestedReschedule,
      suggestedSlot: item.suggestedSlot,
      description: "",
    };
  }

  onMount(() => {
    loadLocalState();
    void loadData();
    void loadCalEvents();
    clockTimer = setInterval(() => { nowTick = Date.now(); }, 30_000);
  });

  onDestroy(() => {
    if (clockTimer) clearInterval(clockTimer);
    if (whyCaptureTimer) clearTimeout(whyCaptureTimer);
  });

  // ── Data loading ──────────────────────────────────────────────────
  async function loadData() {
    loading = true;
    try {
      const data = await getAuthed("/api/functions/focus-data");
      rawData = data;
    } catch {
      rawData = null;
    } finally {
      loading = false;
    }
  }

  async function loadCalEvents() {
    try {
      const endD = new Date(todayISO + "T12:00:00Z");
      endD.setUTCDate(endD.getUTCDate() + 7);
      const end = endD.toISOString().slice(0, 10);
      const res = await getAuthed(`/api/functions/calendar-events?user=all&start=${todayISO}&end=${end}`);
      if (res?.events && Array.isArray(res.events)) calEvents = res.events;
    } catch { /* non-critical */ }
  }

  // ── localStorage ─────────────────────────────────────────────────
  function loadLocalState() {
    if (typeof window === "undefined") return;
    try {
      const est: Record<string, number> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (k.startsWith("focus:est:")) {
          const id = k.slice("focus:est:".length);
          const v = Number(localStorage.getItem(k) || 0);
          if (v > 0) est[id] = v;
        }
        if (k.startsWith(`focus:schedule:${todayISO}:`)) {
          const id = k.slice(`focus:schedule:${todayISO}:`.length);
          try {
            const obj = JSON.parse(localStorage.getItem(k) || "{}");
            if (obj?.start && obj?.end) slotMap[id] = obj;
          } catch { /**/ }
        }
        if (k.startsWith(`focus:status:${todayISO}:`)) {
          const id = k.slice(`focus:status:${todayISO}:`.length);
          const v = localStorage.getItem(k);
          if (v === "open" || v === "in_progress" || v === "planned" || v === "done" || v === "not_done") {
            statusMap[id] = v as PlanStatus;
          }
        }
        if (k.startsWith("focus:resched:")) {
          const id = k.slice("focus:resched:".length);
          const v = Number(localStorage.getItem(k) || 0);
          if (v > 0) rescheduleMap[id] = v;
        }
        if (k.startsWith("focus:reason:")) {
          const id = k.slice("focus:reason:".length);
          const v = localStorage.getItem(k) || "";
          if (v) notDoneReasonMap[id] = v;
        }
      }
      estHoursMap = est;
    } catch { /**/ }
  }

  function persistStatus(id: string, status: PlanStatus) {
    if (typeof window === "undefined") return;
    localStorage.setItem(`focus:status:${todayISO}:${id}`, status);
    statusMap = { ...statusMap, [id]: status };
  }
  function persistSlot(id: string, slot: SlotPersist | null) {
    if (typeof window === "undefined") return;
    const k = `focus:schedule:${todayISO}:${id}`;
    if (slot) {
      localStorage.setItem(k, JSON.stringify(slot));
      slotMap = { ...slotMap, [id]: slot };
    } else {
      localStorage.removeItem(k);
      const next = { ...slotMap };
      delete next[id];
      slotMap = next;
    }
  }
  function persistResched(id: string, n: number) {
    if (typeof window === "undefined") return;
    localStorage.setItem(`focus:resched:${id}`, String(n));
    rescheduleMap = { ...rescheduleMap, [id]: n };
  }
  function persistReason(id: string, reason: string) {
    if (typeof window === "undefined") return;
    if (reason) localStorage.setItem(`focus:reason:${id}`, reason);
    else localStorage.removeItem(`focus:reason:${id}`);
    notDoneReasonMap = { ...notDoneReasonMap, [id]: reason };
  }

  // ── Helpers ───────────────────────────────────────────────────────
  function daysDiff(a: string, b: string): number {
    if (!a || !b) return 0;
    return Math.round((new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()) / 86400000);
  }
  function parseDueISO(raw: unknown): string {
    if (!raw) return "";
    const s = String(raw);
    return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : "";
  }
  function fromMinutes(m: number): string {
    const h = Math.floor(m / 60).toString().padStart(2, "0");
    const mn = (m % 60).toString().padStart(2, "0");
    return `${h}:${mn}`;
  }
  function resolveAssigneeName(arr: string[]): string {
    for (const a of arr) {
      const l = a.toLowerCase();
      if (l.startsWith(FK_PLANE_ID))  return "Fanny Kecskes";
      if (l.startsWith(CTI_PLANE_ID)) return "Claudio Tinner";
    }
    return arr.join(", ");
  }
  function isFKItem(name: string, email: string): boolean {
    if (email.toLowerCase() === FK_EMAIL) return true;
    const n = name.toLowerCase();
    return FK_KEYS.some(k => n.includes(k));
  }
  function isCTIItem(name: string, email: string): boolean {
    const n = name.toLowerCase();
    const e = email.toLowerCase();
    return CTI_NAME_KEYS.some(k => n.includes(k)) || CTI_EMAIL_KEYS.some(k => e.includes(k));
  }
  function isTeamItem(name: string, email: string): boolean {
    return !isFKItem(name, email) && !isCTIItem(name, email);
  }
  function isAdminTicket(title: string, client: string): boolean {
    const t = title.toLowerCase();
    const ADMIN_KW = ["intern", "admin", "setup", "config", "planning", "review report", "infrastructure"];
    if (ADMIN_KW.some(kw => t.includes(kw))) return true;
    if (/^c2i-\d+/i.test(title)) return true;
    const c = (client ?? "").toLowerCase();
    return c.includes("c2i") || c.includes("macl") || !c;
  }
  function findCalendarMatch(title: string, client: string): { time: string; title: string } | null {
    const titleLow = title.toLowerCase();
    const clientLow = (client ?? "").toLowerCase();
    const clientFirst = clientLow.split(/[\s\-–]+/)[0];
    const COMMON = new Set(["invoice", "meeting", "report", "update", "review", "call", "with", "for", "the"]);
    for (const ev of calEvents) {
      if (ev.dateISO !== todayISO) continue;
      const evLow = ev.title.toLowerCase();
      if (clientFirst.length > 2 && evLow.includes(clientFirst)) return { time: fromMinutes(ev.startMin), title: ev.title };
      const sig = titleLow.split(/[\s\-|]+/).find(w => w.length > 4 && !COMMON.has(w));
      if (sig && evLow.includes(sig)) return { time: fromMinutes(ev.startMin), title: ev.title };
    }
    return null;
  }
  function interleaveByClient<T extends { client: string }>(items: T[]): T[] {
    const result: T[] = [];
    const pool = [...items];
    while (pool.length) {
      const last = result.length ? result[result.length - 1].client : null;
      const idx = pool.findIndex(i => !i.client || !last || i.client !== last);
      if (idx === -1) result.push(...pool.splice(0));
      else result.push(...pool.splice(idx, 1));
    }
    return result;
  }
  function nextBusinessDay(fromISO: string): string {
    const d = new Date(fromISO + "T12:00:00Z");
    do { d.setUTCDate(d.getUTCDate() + 1); } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
    return d.toISOString().slice(0, 10);
  }
  function fmtShort(iso: string): string {
    if (!iso) return "";
    try {
      return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { timeZone: "Europe/Zurich", weekday: "short", day: "numeric", month: "short" });
    } catch { return iso; }
  }

  // ── Smart slot assignment (auto-fills first run) ──────────────────
  function autoAssignSlots(items: PlanItem[]) {
    let curMin = WORK_START * 60;
    for (const item of items) {
      if (slotMap[item.id]) continue;
      if (item.suggestedSlot) {
        const [hStr, mStr] = item.suggestedSlot.split(":");
        curMin = parseInt(hStr) * 60 + parseInt(mStr);
      }
      const dur = (item.estHours || 1) * 60;
      if (curMin + dur > WORK_END * 60) break;
      persistSlot(item.id, { start: fromMinutes(curMin), end: fromMinutes(curMin + dur) });
      curMin += dur + 15;
    }
  }

  // ── Heavy day ─────────────────────────────────────────────────────
  const isHeavyDay = $derived.by(() => {
    if (!rawData) return false;
    for (const m of rawData.meetings ?? []) {
      const st = m.state ?? {};
      const startRaw = String(st.start ?? st.meeting_date ?? "");
      if (!startRaw || startRaw.slice(0, 10) !== todayISO) continue;
      const title = String(st.subject ?? st.title ?? m.entity_name ?? "").toLowerCase();
      if (PRODUCTION_KW.some(kw => title.includes(kw))) return true;
      const endRaw = String(st.end ?? st.end_time ?? "");
      if (startRaw && endRaw) {
        const dh = (new Date(endRaw).getTime() - new Date(startRaw).getTime()) / 3600000;
        if (dh >= 3) return true;
      }
    }
    return false;
  });

  // ── Scoring ───────────────────────────────────────────────────────
  const allItems = $derived.by(() => {
    void nowTick;
    if (!rawData) return [] as PlanItem[];
    const items: PlanItem[] = [];

    for (const t of rawData.tickets ?? []) {
      const st = t.state ?? {};
      const planeState = String(st.state ?? st.group_name ?? st.status ?? "").toLowerCase();
      const planeGroup = String(st.state_group ?? "").toLowerCase();
      const localStatus = statusMap[t.entity_id] ?? "";
      const CLOSED = ["done", "completed", "cancelled", "closed", "won", "lost"];
      if (CLOSED.some(s => planeState.includes(s) || planeGroup.includes(s))) continue;
      if (localStatus === "done") continue;

      const due = parseDueISO(st.due_date ?? st.target_date ?? "");
      const pri = String(st.priority ?? "").toLowerCase();
      const mrr = Number(st.client_mrr ?? st.mrr ?? 0) || 0;
      const est = estHoursMap[t.entity_id] ?? 0;

      let score = 0, reason = "";
      if (due && due < todayISO) {
        score += 40;
        const diff = daysDiff(due, todayISO);
        reason = diff === 1 ? "Overdue by 1 day" : `Overdue by ${diff} days`;
      } else if (due === todayISO) {
        score += 30;
        reason = "Due today";
      }
      if (pri === "urgent") score += 25;
      else if (pri === "high") score += 15;
      if (pri === "urgent" && due && due < todayISO) score += 10;
      if (mrr > 2000) score += 10;
      if (est > 0) score += 5;

      if (!(score > 0 || due === todayISO || est > 0)) continue;
      if (!reason) {
        if (pri === "urgent") reason = "Priority: urgent";
        else if (pri === "high") reason = "Priority: high";
        else if (est > 0) reason = "Pinned to today";
        else reason = "Needs attention";
      }

      const id = t.entity_id;
      const clientStr = String(st.customer_name ?? st.customer ?? st.client_code ?? "");
      const titleStr = t.entity_name || id;
      // Derive ticket identifier (e.g. "C2M-83")
      let ticketNum = "";
      if (st.identifier && typeof st.identifier === "string") {
        ticketNum = st.identifier;
      } else if (st.sequence_id != null) {
        const prefix = (typeof st.project_identifier === "string" && st.project_identifier) || "C2M";
        ticketNum = `${prefix}-${st.sequence_id}`;
      }
      const isAdmin = isAdminTicket(titleStr, clientStr);
      const assigneesArr = Array.isArray(st.assignees) ? st.assignees : [];
      const assigneeName = resolveAssigneeName(assigneesArr) || String(st.assignee_name ?? st.assignee ?? "");
      const assigneeEmail = String(st.assignee_email ?? "");

      let suggestedSlot = "";
      if (pri === "urgent" && due && due < todayISO) suggestedSlot = "08:30";
      else if (mrr > 2000) suggestedSlot = "09:30";
      else if (isAdmin) suggestedSlot = "15:00";

      items.push({
        id, type: "ticket", title: titleStr, score, due, reason,
        client: clientStr, priority: pri, assigneeName, assigneeEmail,
        estHours: est,
        slot: slotMap[id] ? `${slotMap[id].start}-${slotMap[id].end}` : "",
        status: statusMap[id] ?? "open",
        rescheduleCount: rescheduleMap[id] ?? 0,
        notDoneReason: notDoneReasonMap[id] ?? "",
        calendarMatch: findCalendarMatch(titleStr, clientStr),
        mrr, isAdmin, suggestedSlot,
        ticketNum,
      });
    }

    return items;
  });

  // View filter (same logic as /focus)
  const visibleAll = $derived.by(() => {
    return allItems.filter(i => {
      const isFK   = isFKItem(i.assigneeName, i.assigneeEmail);
      const isCTI  = isCTIItem(i.assigneeName, i.assigneeEmail);
      const isTeam = isTeamItem(i.assigneeName, i.assigneeEmail);
      if (userView === "FK")   return isFK;
      if (userView === "TEAM") return isTeam;
      return isCTI; // CTI: strict — only CTI-assigned tickets (unassigned → TEAM)
    });
  });

  // Today's schedule
  const todaySchedule = $derived.by(() => {
    const candidates = visibleAll
      .filter(i => i.status !== "done" && (i.slot || i.estHours > 0 || isOverdue(i) || isDueToday(i) || i.priority === "urgent" || i.priority === "high"))
      .sort((a, b) => b.score - a.score);

    const maxActive = isHeavyDay ? MAX_FOCUS_HEAVY : MAX_FOCUS_NORMAL;
    const active = interleaveByClient(candidates.slice(0, maxActive));
    const overflow: PlanItem[] = isHeavyDay
      ? candidates.slice(MAX_FOCUS_HEAVY, MAX_FOCUS_NORMAL).map(i => ({ ...i, suggestedReschedule: nextBusinessDay(todayISO) }))
      : [];

    const all = [...active, ...overflow];
    // Auto-assign slots once on first load
    if (rawData && active.length > 0) {
      setTimeout(() => autoAssignSlots(active), 100);
    }
    return all;
  });

  // Up Next (this week, not in today's schedule)
  const upNextItems = $derived.by(() => {
    if (!rawData) return [] as PlanItem[];
    const scheduledIds = new Set(todaySchedule.map(i => i.id));
    const weekEnd = new Date(todayISO + "T00:00:00Z");
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
    const weekEndISO = weekEnd.toISOString().slice(0, 10);
    const priOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3, "": 4 };

    return visibleAll
      .filter(i => {
        if (scheduledIds.has(i.id)) return false;
        if (i.status === "done") return false;
        if (!i.due) return false;
        if (i.due <= todayISO) return false;
        if (i.due >= weekEndISO) return false;
        return true;
      })
      .sort((a, b) => {
        const da = a.due || "9999-12-31", db = b.due || "9999-12-31";
        if (da !== db) return da < db ? -1 : 1;
        return (priOrder[a.priority ?? ""] ?? 4) - (priOrder[b.priority ?? ""] ?? 4);
      })
      .slice(0, 14);
  });

  // KPIs
  const kpis = $derived.by(() => {
    let overdue = 0, dueToday = 0, dueThisWeek = 0;
    const weekEndISO = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    for (const i of visibleAll) {
      if (i.status === "done") continue;
      if (i.due && i.due < todayISO) overdue++;
      else if (i.due === todayISO) dueToday++;
      else if (i.due && i.due < weekEndISO) dueThisWeek++;
    }
    return { overdue, dueToday, dueThisWeek };
  });

  // ── Helpers for display ───────────────────────────────────────────
  function isOverdue(i: PlanItem) { return !!i.due && i.due < todayISO; }
  function isDueToday(i: PlanItem) { return i.due === todayISO; }
  function progressPct(item: PlanItem): number {
    if (item.status === "planned") return 15;
    if (item.status === "in_progress") return 50;
    return 0;
  }
  function statusLabel(s: PlanStatus): string {
    if (s === "in_progress") return "In progress";
    if (s === "planned")     return "Planned";
    if (s === "done")        return "Done";
    if (s === "not_done")    return "Not done";
    return "Open";
  }
  function priorityColor(pri: string | undefined): string {
    if (pri === "urgent") return "var(--re, #e0312b)";
    if (pri === "high")   return "var(--or, #d97700)";
    return "var(--brand)";
  }

  // ── Actions ───────────────────────────────────────────────────────
  async function handleStart(item: PlanItem) {
    if (startingId) return;
    startingId = item.id;
    try {
      await tracker.start({
        description: item.title,
        client_code: item.client?.split(/[\s\-]+/)[0]?.toUpperCase().slice(0, 8) || null,
        is_billable: !item.isAdmin,
      });
      persistStatus(item.id, "in_progress");
      toast(`Tracking: ${item.title.slice(0, 40)}`, "ok");
    } catch (e: any) {
      toast(e?.message || "Could not start tracker", "error");
    } finally {
      startingId = "";
    }
  }

  function handleDone(item: PlanItem) {
    persistStatus(item.id, "done");
    postAuthed("/api/functions/focus-mark-done", { entity_id: item.id }).catch(() => {});
    toast(`Done: ${item.title.slice(0, 40)}`, "ok");
  }

  function handleNotDone(item: PlanItem) {
    const next = (rescheduleMap[item.id] ?? 0) + 1;
    persistResched(item.id, next);
    persistStatus(item.id, "not_done");
    whyCaptureId = item.id;
    whyCaptureExpiresAt = Date.now() + WHY_WINDOW_MS;
    whyCaptureValue = "";
    if (whyCaptureTimer) clearTimeout(whyCaptureTimer);
    whyCaptureTimer = setTimeout(() => {
      if (whyCaptureId === item.id) { whyCaptureId = ""; whyCaptureValue = ""; }
    }, WHY_WINDOW_MS);
  }

  function handlePlan(item: PlanItem) {
    if (item.status === "planned") persistStatus(item.id, "open");
    else persistStatus(item.id, "planned");
  }

  function commitWhyCapture(item: PlanItem) {
    const reason = whyCaptureValue.trim();
    if (reason) persistReason(item.id, reason);
    whyCaptureId = "";
    whyCaptureValue = "";
  }
</script>

<div class="planweek">
  <!-- ── Header ─────────────────────────────────────────────────── -->
  <div class="pw-head">
    <div class="pw-title-row">
      <h2 class="pw-title">Plan Week</h2>
      <span class="pw-date">{new Date().toLocaleDateString("en-GB", { timeZone: "Europe/Zurich", weekday: "long", day: "numeric", month: "long" })}</span>
      {#if isHeavyDay}
        <span class="pw-badge pw-badge--heavy">Heavy day · {MAX_FOCUS_HEAVY} max</span>
      {/if}
    </div>

    <!-- View toggle -->
    <nav class="pw-toggle" aria-label="View filter">
      {#each (["CTI", "FK", "TEAM"] as UserView[]) as v}
        <button
          type="button"
          class="pw-toggle__pill"
          class:pw-toggle__pill--active={userView === v}
          onclick={() => { userView = v; }}
        >
          {v === "CTI" ? "Claudio" : v === "FK" ? "Fanny" : "Team"}
        </button>
      {/each}
    </nav>
  </div>

  <!-- ── KPI strip ──────────────────────────────────────────────── -->
  <div class="pw-kpis">
    <div class="pw-kpi pw-kpi--danger">
      <span class="pw-kpi__num">{kpis.overdue}</span>
      <span class="pw-kpi__label">Overdue</span>
    </div>
    <div class="pw-kpi pw-kpi--warn">
      <span class="pw-kpi__num">{kpis.dueToday}</span>
      <span class="pw-kpi__label">Due today</span>
    </div>
    <div class="pw-kpi">
      <span class="pw-kpi__num">{kpis.dueThisWeek}</span>
      <span class="pw-kpi__label">This week</span>
    </div>
    <div class="pw-kpi pw-kpi--brand">
      <span class="pw-kpi__num">{todaySchedule.filter(i => i.status === "done").length}/{todaySchedule.length}</span>
      <span class="pw-kpi__label">Done today</span>
    </div>
  </div>

  {#if loading}
    <div class="pw-loading">
      {#each Array(3) as _}<div class="pw-skel"></div>{/each}
    </div>
  {:else if !rawData}
    <div class="pw-empty">Could not load tickets. Check your connection.</div>
  {:else}
    <!-- ── Today's schedule ─────────────────────────────────────── -->
    <section class="pw-section">
      <div class="pw-section__head">
        <span class="pw-section__label">Today's Focus</span>
        <span class="pw-section__sub">{todaySchedule.filter(i => !i.suggestedReschedule).length} active · {isHeavyDay ? "heavy day" : "full capacity"}</span>
      </div>

      {#if todaySchedule.length === 0}
        <div class="pw-empty">No items scored for today. All caught up!</div>
      {:else}
        <ul class="pw-cards" role="list">
          {#each todaySchedule as item (item.id)}
            {@const isPlanned = item.status === "planned" || !!item.calendarMatch}
            {@const isDone = item.status === "done"}
            {@const isInProgress = item.status === "in_progress"}
            {@const isOverflow = !!item.suggestedReschedule}
            <li
              class="pw-card"
              class:pw-card--planned={isPlanned && !isDone}
              class:pw-card--done={isDone}
              class:pw-card--in-progress={isInProgress}
              class:pw-card--overflow={isOverflow}
              role="button"
              tabindex="0"
              onclick={() => { drawerTicket = toFocusTicket(item); }}
              onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); drawerTicket = toFocusTicket(item); } }}
              style="cursor: pointer;"
            >
              <!-- Accent bar -->
              <div class="pw-card__accent" style="background: {priorityColor(item.priority)};"></div>

              <div class="pw-card__body">
                <!-- Top row: badges + title -->
                <div class="pw-card__top">
                  <div class="pw-card__badges">
                    {#if item.type !== "ticket"}
                      <span class="pw-badge pw-badge--type">{item.type}</span>
                    {/if}
                    {#if item.priority === "urgent"}
                      <span class="pw-badge pw-badge--urgent">urgent</span>
                    {:else if item.priority === "high"}
                      <span class="pw-badge pw-badge--high">high</span>
                    {/if}
                    {#if item.status !== "open"}
                      <span class="pw-status-pill pw-status-pill--{item.status}">{statusLabel(item.status)}</span>
                    {/if}
                    {#if item.calendarMatch}
                      <span class="pw-badge pw-badge--cal" title={item.calendarMatch.title}>
                        ◷ {item.calendarMatch.time}
                      </span>
                    {:else if item.suggestedSlot && !slotMap[item.id]}
                      <span class="pw-badge pw-badge--slot">suggested {item.suggestedSlot}</span>
                    {/if}
                  </div>
                  <span class="pw-card__client">{item.client || "—"}</span>
                </div>

                <p class="pw-card__title" class:pw-card__title--done={isDone}>
                  {#if item.ticketNum}<span class="pw-card__num">{item.ticketNum}</span>{/if}{item.title}
                </p>

                <!-- Meta row -->
                <div class="pw-card__meta">
                  {#if item.slot}
                    <span class="pw-meta-item pw-meta-item--slot">⧗ {item.slot}</span>
                  {/if}
                  {#if item.due}
                    <span class="pw-meta-item" class:pw-meta-item--overdue={isOverdue(item)} class:pw-meta-item--today={isDueToday(item)}>
                      {isOverdue(item) ? "⚠ " : ""}{fmtShort(item.due)}
                    </span>
                  {/if}
                  <span class="pw-meta-item pw-meta-item--reason">{item.reason}</span>
                  {#if isOverflow}
                    <span class="pw-meta-item pw-meta-item--resched">→ reschedule to {fmtShort(item.suggestedReschedule!)}</span>
                  {/if}
                  {#if item.rescheduleCount >= RESCHEDULE_LIMIT}
                    <span class="pw-meta-item pw-meta-item--limit">⚠ Rescheduled {item.rescheduleCount}×</span>
                  {/if}
                </div>

                <!-- Progress bar if in-progress or planned -->
                {#if progressPct(item) > 0}
                  <div class="pw-progress">
                    <div class="pw-progress__fill" style="width: {progressPct(item)}%;"></div>
                  </div>
                {/if}

                <!-- Why-not capture -->
                {#if whyCaptureId === item.id}
                  <div class="pw-why" onclick={(e) => e.stopPropagation()} role="presentation">
                    <input
                      class="pw-why__input"
                      type="text"
                      placeholder="Why not done? (auto-dismissed in 5 min)"
                      bind:value={whyCaptureValue}
                      onclick={(e) => e.stopPropagation()}
                      onkeydown={(e) => e.key === "Enter" && commitWhyCapture(item)}
                      autofocus
                    />
                    <button class="pw-why__btn" type="button" onclick={(e) => { e.stopPropagation(); commitWhyCapture(item); }}>Save</button>
                    <button class="pw-why__btn pw-why__btn--ghost" type="button" onclick={(e) => { e.stopPropagation(); whyCaptureId = ""; whyCaptureValue = ""; }}>Skip</button>
                  </div>
                {/if}

                <!-- Actions -->
                {#if !isDone && !isOverflow}
                  <div class="pw-card__actions" onclick={(e) => e.stopPropagation()} role="presentation">
                    {#if !tracker.running}
                      <button
                        type="button"
                        class="pw-btn pw-btn--start"
                        onclick={(e) => { e.stopPropagation(); handleStart(item); }}
                        disabled={!!startingId}
                      >
                        {startingId === item.id ? "Starting…" : "▶ Start"}
                      </button>
                    {:else if tracker.running}
                      <button
                        type="button"
                        class="pw-btn pw-btn--start pw-btn--tracking"
                        title="Tracker already running"
                        disabled
                      >▶ Tracking…</button>
                    {/if}
                    <button type="button" class="pw-btn pw-btn--plan" onclick={(e) => { e.stopPropagation(); handlePlan(item); }}>
                      {item.status === "planned" ? "Unplan" : "Planned"}
                    </button>
                    <button type="button" class="pw-btn pw-btn--done" onclick={(e) => { e.stopPropagation(); handleDone(item); }}>Done</button>
                    <button type="button" class="pw-btn pw-btn--ghost" onclick={(e) => { e.stopPropagation(); handleNotDone(item); }}>Not done</button>
                  </div>
                {:else if isDone}
                  <div class="pw-card__actions" onclick={(e) => e.stopPropagation()} role="presentation">
                    <button type="button" class="pw-btn pw-btn--ghost" onclick={(e) => { e.stopPropagation(); persistStatus(item.id, "open"); }}>Undo</button>
                  </div>
                {/if}
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <!-- ── Up Next ─────────────────────────────────────────────── -->
    {#if upNextItems.length > 0}
      <section class="pw-section">
        <div class="pw-section__head">
          <span class="pw-section__label">Up Next this week</span>
          <span class="pw-section__sub">{upNextItems.length} ticket{upNextItems.length !== 1 ? "s" : ""}</span>
        </div>
        <ul class="pw-queue" role="list">
          {#each upNextItems.slice(0, queueShown) as item (item.id)}
            <li
              class="pw-queue-item"
              role="button"
              tabindex="0"
              onclick={() => { drawerTicket = toFocusTicket(item); }}
              onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); drawerTicket = toFocusTicket(item); } }}
              style="cursor: pointer;"
            >
              <div class="pw-queue-item__accent" style="background: {priorityColor(item.priority)};"></div>
              <div class="pw-queue-item__body">
                <span class="pw-queue-item__title">
                  {#if item.ticketNum}<span class="pw-queue-item__num">{item.ticketNum}</span>{/if}{item.title}
                </span>
                <div class="pw-queue-item__meta">
                  {#if item.client}<span class="pw-meta-item">{item.client}</span>{/if}
                  {#if item.due}<span class="pw-meta-item" class:pw-meta-item--overdue={isOverdue(item)}>{fmtShort(item.due)}</span>{/if}
                  {#if item.priority && item.priority !== "none"}<span class="pw-meta-item">{item.priority}</span>{/if}
                </div>
              </div>
              <button type="button" class="pw-btn pw-btn--xs pw-btn--ghost" onclick={(e) => { e.stopPropagation(); persistStatus(item.id, "planned"); }}>+ Plan</button>
            </li>
          {/each}
        </ul>
        {#if upNextItems.length > queueShown}
          <button type="button" class="pw-show-more" onclick={() => { queueShown += 8; }}>
            Show {Math.min(8, upNextItems.length - queueShown)} more
          </button>
        {/if}
      </section>
    {/if}
  {/if}

  {#if drawerTicket}
    <TicketPlannerDrawer
      ticket={drawerTicket}
      onClose={() => { drawerTicket = null; }}
      onPlanned={(payload) => {
        persistSlot(payload.ticketId, { start: payload.startHHMM, end: payload.startHHMM });
        persistStatus(payload.ticketId, "planned");
        drawerTicket = null;
      }}
    />
  {/if}
</div>

<style>
  .planweek {
    font-family: var(--sa);
    color: var(--tx);
    padding: 8px 0 40px;
  }

  /* Header */
  .pw-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 16px;
  }
  .pw-title-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .pw-title {
    margin: 0;
    font-family: var(--hd);
    font-weight: 700;
    font-size: 22px;
    letter-spacing: -0.01em;
  }
  .pw-date { font-size: 13px; color: var(--t2); }

  /* Toggle pills */
  .pw-toggle {
    display: inline-flex;
    gap: 4px;
    padding: 3px;
    border-radius: 999px;
    background: var(--s1);
    border: 1px solid var(--line);
  }
  .pw-toggle__pill {
    appearance: none;
    border: 0;
    padding: 6px 14px;
    border-radius: 999px;
    background: transparent;
    color: var(--t2);
    font: 600 12px/1 var(--sa);
    cursor: pointer;
    transition: background 120ms, color 120ms;
  }
  .pw-toggle__pill:hover { background: var(--s2); color: var(--tx); }
  .pw-toggle__pill--active {
    background: linear-gradient(135deg, var(--brand-soft), var(--brand-softer));
    color: var(--brand-deep);
    box-shadow: inset 0 0 0 1px var(--brand-line);
  }

  /* KPI strip */
  .pw-kpis {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    margin-bottom: 20px;
  }
  .pw-kpi {
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--s1);
    border: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .pw-kpi--danger { background: var(--chip-tint-danger, rgba(224,49,43,.06)); border-color: rgba(224,49,43,.22); }
  .pw-kpi--warn   { background: var(--chip-tint-warn, rgba(217,119,0,.06)); border-color: rgba(217,119,0,.22); }
  .pw-kpi--brand  { background: var(--brand-softer); border-color: var(--brand-line); }
  .pw-kpi__num  { font: 700 22px/1 var(--mo); font-variant-numeric: tabular-nums; color: var(--tx); }
  .pw-kpi__label { font: 600 11px/1.2 var(--sa); text-transform: uppercase; letter-spacing: 0.06em; color: var(--t3); }
  .pw-kpi--danger .pw-kpi__num { color: var(--re, #e0312b); }
  .pw-kpi--warn   .pw-kpi__num { color: var(--or, #d97700); }
  .pw-kpi--brand  .pw-kpi__num { color: var(--brand-deep); }

  /* Section */
  .pw-section {
    margin-top: 20px;
    padding: 16px;
    border-radius: var(--r2);
    background: var(--glass-card);
    backdrop-filter: var(--blur-card);
    -webkit-backdrop-filter: var(--blur-card);
    border: 1px solid var(--line);
    box-shadow: var(--sh-card);
  }
  .pw-section__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }
  .pw-section__label { font: 700 13px/1 var(--sa); text-transform: uppercase; letter-spacing: 0.08em; color: var(--brand-deep); }
  .pw-section__sub   { font-size: 11.5px; color: var(--t3); }

  /* Cards */
  .pw-cards {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .pw-card {
    display: grid;
    grid-template-columns: 4px 1fr;
    gap: 10px;
    padding: 12px;
    border-radius: var(--r2);
    background: var(--s1);
    border: 1px solid var(--line);
    transition: border-color 160ms, background 160ms;
  }
  .pw-card:hover { background: var(--s2); }
  .pw-card--planned { border-color: rgba(124,58,237,.38); background: rgba(124,58,237,.04); }
  .pw-card--in-progress { border-color: var(--brand-line); background: var(--brand-softer); }
  .pw-card--done { opacity: 0.55; }
  .pw-card--overflow { opacity: 0.7; border-style: dashed; }
  .pw-card__accent { width: 4px; align-self: stretch; border-radius: 2px; flex-shrink: 0; }
  .pw-card__body { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .pw-card__top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
  }
  .pw-card__badges { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
  .pw-card__client { font: 600 11px/1 var(--mo); color: var(--brand-deep); letter-spacing: 0.04em; flex-shrink: 0; }
  .pw-card__title {
    font: 600 13.5px/1.35 var(--sa);
    color: var(--tx);
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pw-card__title--done { text-decoration: line-through; color: var(--t3); }
  .pw-card__num {
    font: 600 10.5px/1 var(--mo);
    color: var(--brand-deep);
    letter-spacing: 0.04em;
    opacity: 0.8;
    flex-shrink: 0;
    margin-right: 6px;
  }
  .pw-queue-item__num {
    font: 600 10.5px/1 var(--mo);
    color: var(--brand-deep);
    opacity: 0.7;
    flex-shrink: 0;
    margin-right: 4px;
  }
  .pw-card__meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  .pw-card__actions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-top: 4px;
  }

  /* Progress bar */
  .pw-progress {
    height: 3px;
    background: var(--s2);
    border-radius: 999px;
    overflow: hidden;
  }
  .pw-progress__fill {
    height: 100%;
    border-radius: 999px;
    background: var(--brand);
    transition: width 300ms ease;
  }

  /* Why-not capture */
  .pw-why {
    display: flex;
    gap: 6px;
    align-items: center;
    padding: 8px 10px;
    border-radius: 8px;
    background: var(--s2);
    border: 1px solid var(--line-2);
  }
  .pw-why__input {
    flex: 1;
    all: unset;
    font: 400 12.5px/1 var(--sa);
    color: var(--tx);
  }
  .pw-why__btn {
    appearance: none;
    padding: 4px 10px;
    border-radius: 6px;
    font: 600 11.5px/1 var(--sa);
    cursor: pointer;
    border: 1px solid var(--brand-line);
    background: var(--brand-soft);
    color: var(--brand-deep);
    transition: filter 120ms;
  }
  .pw-why__btn:hover { filter: brightness(1.1); }
  .pw-why__btn--ghost { background: transparent; border-color: var(--line); color: var(--t2); }

  /* Badges / pills */
  .pw-badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 7px;
    border-radius: 999px;
    font: 600 10.5px/1.4 var(--sa);
    letter-spacing: 0.04em;
  }
  .pw-badge--urgent { background: rgba(224,49,43,.12); color: var(--re, #e0312b); }
  .pw-badge--high   { background: rgba(217,119,0,.12);  color: var(--or, #d97700); }
  .pw-badge--type   { background: var(--s2); color: var(--t2); }
  .pw-badge--heavy  { background: rgba(224,49,43,.1); color: var(--re, #e0312b); border: 1px solid rgba(224,49,43,.2); }
  .pw-badge--cal    { background: rgba(124,58,237,.12); color: #7c3aed; border: 1px solid rgba(124,58,237,.22); }
  .pw-badge--slot   { background: var(--s2); color: var(--t3); border: 1px solid var(--line); }
  .pw-status-pill {
    display: inline-flex;
    align-items: center;
    padding: 2px 7px;
    border-radius: 999px;
    font: 600 10.5px/1.4 var(--sa);
  }
  .pw-status-pill--planned    { background: rgba(124,58,237,.12); color: #7c3aed; }
  .pw-status-pill--in_progress { background: var(--brand-softer); color: var(--brand-deep); }
  .pw-status-pill--not_done   { background: rgba(217,119,0,.1);  color: var(--or, #d97700); }

  /* Meta items */
  .pw-meta-item {
    font-size: 11.5px;
    color: var(--t3);
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }
  .pw-meta-item--slot    { color: var(--brand-deep); font-weight: 600; }
  .pw-meta-item--overdue { color: var(--re, #e0312b); font-weight: 600; }
  .pw-meta-item--today   { color: var(--or, #d97700); font-weight: 600; }
  .pw-meta-item--reason  { color: var(--t3); }
  .pw-meta-item--resched { color: var(--brand); font-style: italic; }
  .pw-meta-item--limit   { color: var(--re, #e0312b); }

  /* Buttons */
  .pw-btn {
    appearance: none;
    border: 0;
    cursor: pointer;
    border-radius: 8px;
    font: 600 11.5px/1 var(--sa);
    padding: 6px 12px;
    transition: filter 120ms, opacity 120ms;
    white-space: nowrap;
  }
  .pw-btn--start {
    background: var(--brand);
    color: #fff;
    padding: 6px 14px;
  }
  .pw-btn--start:hover:not(:disabled) { filter: brightness(1.1); }
  .pw-btn--start:disabled { opacity: 0.5; cursor: not-allowed; }
  .pw-btn--tracking { background: var(--brand-soft); color: var(--brand-deep); cursor: not-allowed; }
  .pw-btn--plan {
    background: rgba(124,58,237,.1);
    color: #7c3aed;
    border: 1px solid rgba(124,58,237,.25);
  }
  .pw-btn--plan:hover { background: rgba(124,58,237,.18); }
  .pw-btn--done {
    background: rgba(30,160,51,.1);
    color: var(--gr, #1ea033);
    border: 1px solid rgba(30,160,51,.25);
  }
  .pw-btn--done:hover { background: rgba(30,160,51,.18); }
  .pw-btn--ghost {
    background: transparent;
    border: 1px solid var(--line);
    color: var(--t2);
  }
  .pw-btn--ghost:hover { color: var(--tx); border-color: var(--line-2); }
  .pw-btn--xs { padding: 4px 10px; font-size: 11px; }

  /* Up Next queue */
  .pw-queue {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .pw-queue-item {
    display: grid;
    grid-template-columns: 3px 1fr auto;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 8px;
    background: var(--s1);
    border: 1px solid var(--line);
  }
  .pw-queue-item:hover { background: var(--s2); }
  .pw-queue-item__accent { width: 3px; align-self: stretch; border-radius: 2px; }
  .pw-queue-item__body { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .pw-queue-item__title {
    font: 500 12.5px/1.3 var(--sa);
    color: var(--tx);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pw-queue-item__meta { display: flex; gap: 8px; flex-wrap: wrap; }

  .pw-show-more {
    appearance: none;
    border: 0;
    background: none;
    color: var(--brand-deep);
    font: 600 12px/1 var(--sa);
    cursor: pointer;
    padding: 10px 0 0;
    display: block;
    width: 100%;
    text-align: center;
    opacity: 0.8;
  }
  .pw-show-more:hover { opacity: 1; }

  /* Skeleton */
  .pw-loading { display: flex; flex-direction: column; gap: 10px; margin-top: 8px; }
  .pw-skel {
    height: 80px;
    border-radius: var(--r2);
    background: linear-gradient(90deg, var(--s1), var(--s2), var(--s1));
    background-size: 200% 100%;
    animation: skel 1.4s ease-in-out infinite;
  }
  @keyframes skel { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

  .pw-empty {
    padding: 24px;
    text-align: center;
    font-size: 13px;
    color: var(--t2);
    background: var(--s1);
    border: 1px dashed var(--line-2);
    border-radius: var(--r1);
  }

  @media (max-width: 640px) {
    .pw-kpis { grid-template-columns: repeat(2, 1fr); }
    .pw-head { flex-direction: column; align-items: stretch; }
    .pw-toggle { align-self: flex-start; }
    .pw-card__title { white-space: normal; }
  }
</style>

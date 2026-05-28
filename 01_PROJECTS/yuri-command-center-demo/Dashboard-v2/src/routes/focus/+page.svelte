<script lang="ts">
  /**
   * /focus - P5 Ultimate Daily Focus Schedule.
   *
   * Sections (CEO spec 2026-05-19):
   *   1. Command header (greeting + live clock + CTI/FK toggle)
   *   2. KPI strip (overdue, due today, due this week, hours today, on-time 7d)
   *   3. Today's Schedule (priority-scored cards with inline hours edit,
   *      auto-assigned time slots, Start/Done/Not Done actions, "Why not?"
   *      capture with 5-min auto-dismiss)
   *   4. Week Overview (compact table with hours column)
   *   5. Analytics Panel (CTI + FK side-by-side stats + 14d heatmap)
   *   6. Calendar sync banner
   *
   * Data: /api/functions/focus-data (tickets, meetings, invoices, clients)
   * Estimates + schedule + status + reasons are localStorage-only for now.
   *
   * FK working hours: 25.2h/week (50%). FK email: fanny@c2moviez.com
   * Reschedule limit: 3 "not done" responses before CEO escalation.
   * "Why not?" capture: next message in 5 min = reason; silent after.
   */
  import { onMount, onDestroy } from "svelte";
  import { goto } from "$app/navigation";
  import { getAuthed, postAuthed } from "$lib/db";
  import TicketPlannerDrawer from "$components/TicketPlannerDrawer.svelte";

  // Debounced push of today's full slot map to the orchestrator endpoint.
  // Format must match focus-schedule-sync normaliseItem: { ticketId, title, slot (HH:MM), hours, assignee }
  let _syncTimer: ReturnType<typeof setTimeout> | null = null;
  function pushScheduleToOrchestrator() {
    if (_syncTimer) clearTimeout(_syncTimer);
    _syncTimer = setTimeout(async () => {
      try {
        const schedule = Object.entries(slotMap).map(([id, s]) => {
          const item = todaySchedule.find((i) => i.id === id);
          return {
            ticketId: id,
            title: item?.title || id,
            slot: s.start,
            hours: estHoursMap[id] ?? 1,
            assignee: FK_KEYS.some((k) => (item?.assigneeEmail || "").toLowerCase().includes(k)) ? "fk" : "cti",
            client: item?.client ? item.client.slice(0, 32) : null,
          };
        });
        await postAuthed("/api/functions/focus-schedule-sync", {
          date: todayISO,
          schedule,
        });
      } catch { /* non-critical - orchestrator will miss nudges, not fatal */ }
    }, 800);
  }

  // -- Types ------------------------------------------------------
  type EntityRow = {
    entity_id: string;
    entity_name: string;
    state: Record<string, any> | null;
    updated_at: string;
  };
  type InvoiceRow = {
    id: string;
    number?: string | null;
    client_code?: string | null;
    client_name?: string | null;
    status: string;
    amount?: number | null;
    currency?: string | null;
    due_date?: string | null;
    created_at?: string | null;
  };
  type FocusData = {
    ok: boolean;
    today: string;
    tickets: EntityRow[];
    clients: EntityRow[];
    meetings: EntityRow[];
    invoices: InvoiceRow[];
  };
  type SourceType = "ticket" | "client" | "meeting" | "finance";
  type FocusStatus = "open" | "in_progress" | "planned" | "done" | "not_done";
  type FocusItem = {
    id: string;
    type: SourceType;
    title: string;
    score: number;
    due: string;
    reason: string;
    href: string;
    client: string;
    priority?: string;
    assigneeName?: string;
    assigneeEmail?: string;
    assigneesRaw?: string[];  // Raw assignees array from Plane (UUID prefixes or legacy strings)
    estHours: number;
    trackedHours: number;
    slot: string;           // "HH:MM-HH:MM" or ""
    status: FocusStatus;
    rescheduleCount: number;
    notDoneReason: string;
    calendarMatch?: { time: string; title: string } | null;
    // Calendar-aware load balancing fields
    mrr?: number;
    isAdmin?: boolean;
    suggestedReschedule?: string;   // set on items pushed off by heavy-day cap
    suggestedSlot?: string;         // smart time-slot suggestion ("09:30", "15:00", etc.)
  };
  type UserView = "CTI" | "FK" | "TEAM" | "BOTH";
  type SlotPersist = { start: string; end: string };

  // -- Constants --------------------------------------------------
  const FK_EMAIL = "fanny@c2moviez.com";
  const FK_KEYS = ["fanny", "fk", "kecskes"];
  const CTI_EMAIL_KEYS = ["claudio", "tinner", "info@c2moviez", "c2m_coo"];
  const CTI_NAME_KEYS  = ["claudio", "tinner", "cti"];
  // Plane stores assignees as truncated UUIDs in entity_state.state.assignees[]
  const FK_PLANE_ID  = "bff07aa8"; // Fanny Kecskes — Plane user UUID prefix
  const CTI_PLANE_ID = "2d7e4403"; // Claudio Tinner — Plane user UUID prefix

  function resolveAssigneeName(arr: string[]): string {
    // Order priority: FK first when both assigned (FK tab needs to see dual-assigned)
    // CTI tab also sees dual-assigned via assigneesContainsCTI() not this name string.
    const names: string[] = [];
    for (const a of arr) {
      const l = a.toLowerCase();
      if (l.startsWith(FK_PLANE_ID))  { if (!names.includes("Fanny Kecskes")) names.push("Fanny Kecskes"); continue; }
      if (l.startsWith(CTI_PLANE_ID)) { if (!names.includes("Claudio Tinner")) names.push("Claudio Tinner"); continue; }
      names.push(a);
    }
    return names.join(", ");
  }

  /** True if the raw Plane assignees array contains FK (UUID prefix or legacy name). */
  function assigneesContainsFK(arr: string[]): boolean {
    for (const a of arr) {
      const l = String(a ?? "").toLowerCase();
      if (l.startsWith(FK_PLANE_ID)) return true;
      // Legacy data: arrays like ["fanny"] or ["FK"]
      if (l === "fanny" || l === "fk" || l.includes("kecskes")) return true;
    }
    return false;
  }

  /** True if the raw Plane assignees array contains CTI (UUID prefix or legacy name). */
  function assigneesContainsCTI(arr: string[]): boolean {
    for (const a of arr) {
      const l = String(a ?? "").toLowerCase();
      if (l.startsWith(CTI_PLANE_ID)) return true;
      // Legacy data: arrays like ["CTI"] or ["claudio"]
      if (l === "cti" || l === "claudio" || l.includes("tinner") || l.includes("c2moviez")) return true;
    }
    return false;
  }
  const WORK_START = 9;     // 09:00
  const WORK_END = 18;      // 18:00
  const RESCHEDULE_LIMIT = 3;
  const WHY_WINDOW_MS = 5 * 60 * 1000;

  // Keywords that signal a production/heavy day.
  const PRODUCTION_KEYWORDS = [
    "shooting", "recording", "dreh", "aufnahme", "shoot",
    "stäfa", "vierwaldstättersee", "stafa", "session",
  ];
  // Normal max tickets shown in focus; reduced on heavy days.
  const MAX_FOCUS_NORMAL = 7;
  const MAX_FOCUS_HEAVY  = 3;

  // -- Calendar load helpers --------------------------------------
  type DayLoad = {
    isHeavy: boolean;
    productionHours: number;
    indicator: "green" | "yellow" | "red";
    label: string;
  };

  function computeDayLoad(meetings: EntityRow[], forDate: string): DayLoad {
    let totalProductionHours = 0;
    let hasHeavyKeyword = false;

    for (const m of meetings) {
      const st = m.state ?? {};
      const startRaw = String(st.start ?? st.meeting_date ?? st.start_time ?? "");
      const endRaw   = String(st.end   ?? st.end_time   ?? "");

      // Only consider today's events.
      const dayISO = startRaw ? startRaw.slice(0, 10) : "";
      if (dayISO !== forDate) continue;

      // Check title for production keywords.
      const title = String(st.subject ?? st.title ?? m.entity_name ?? "").toLowerCase();
      const hasKw = PRODUCTION_KEYWORDS.some((kw) => title.includes(kw));

      // Duration in hours.
      let durationH = 0;
      if (startRaw && endRaw) {
        const startMs = new Date(startRaw).getTime();
        const endMs   = new Date(endRaw).getTime();
        if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs > startMs) {
          durationH = (endMs - startMs) / 3600000;
        }
      }

      // A meeting is "production" if it has a keyword OR lasts 3+ hours.
      if (hasKw || durationH >= 3) {
        hasHeavyKeyword = hasHeavyKeyword || hasKw;
        totalProductionHours += durationH;
      }
    }

    const isHeavy = hasHeavyKeyword || totalProductionHours >= 3;
    let indicator: "green" | "yellow" | "red";
    let label: string;

    if (isHeavy) {
      indicator = "red";
      label = "Heavy production day - load reduced";
    } else if (totalProductionHours > 0) {
      const h = Math.round(totalProductionHours * 10) / 10;
      indicator = "yellow";
      label = `Mixed day - ${h}h production scheduled`;
    } else {
      indicator = "green";
      label = "Light day - full capacity";
    }

    return { isHeavy, productionHours: totalProductionHours, indicator, label };
  }

  /** Returns the next business day (Mon-Fri) after fromISO. */
  function nextBusinessDay(fromISO: string): string {
    const d = new Date(fromISO + "T12:00:00Z");
    do {
      d.setUTCDate(d.getUTCDate() + 1);
    } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
    return d.toISOString().slice(0, 10);
  }

  /** Detect admin/internal tickets by title and client prefix. */
  function isAdminTicket(title: string, client: string): boolean {
    const t = title.toLowerCase();
    const adminKws = ["intern", "admin", "setup", "config", "planning", "review report", "infrastructure"];
    if (adminKws.some((kw) => t.includes(kw))) return true;
    if (/^c2i-\d+/i.test(title)) return true;
    const c = (client ?? "").toLowerCase();
    if (c.includes("c2i") || c.includes("macl") || !c) return true;
    return false;
  }

  /** Find a calendar event today whose title matches the ticket's client or title. */
  function findCalendarMatch(title: string, client: string): { time: string; title: string } | null {
    const titleLow = title.toLowerCase();
    const clientLow = (client ?? "").toLowerCase();
    // "CASA" → "casa", "SHIPSTER AG" → "shipster"
    const clientFirst = clientLow.split(/[\s\-–]+/)[0];
    for (const ev of calEvents) {
      if (ev.dateISO !== todayISO) continue;
      const evLow = ev.title.toLowerCase();
      // Match by client name prefix (>2 chars to avoid false positives)
      if (clientFirst.length > 2 && evLow.includes(clientFirst)) {
        return { time: fromMinutes(ev.startMin), title: ev.title };
      }
      // Match by first significant word from ticket title (skip short/common words)
      const COMMON = new Set(["invoice", "meeting", "report", "update", "review", "call", "with", "for", "the"]);
      const sig = titleLow.split(/[\s\-|]+/).find(w => w.length > 4 && !COMMON.has(w));
      if (sig && evLow.includes(sig)) {
        return { time: fromMinutes(ev.startMin), title: ev.title };
      }
    }
    return null;
  }

  /**
   * Reorder an array of items so no two adjacent items share the same client.
   * Greedy insertion from a pool.
   */
  function interleaveByClient<T extends { client: string }>(items: T[]): T[] {
    const result: T[] = [];
    const pool = [...items];
    while (pool.length > 0) {
      const lastClient = result.length > 0 ? result[result.length - 1].client : null;
      const idx = pool.findIndex(
        (i) => !i.client || !lastClient || i.client !== lastClient,
      );
      if (idx === -1) {
        result.push(...pool.splice(0));
      } else {
        result.push(...pool.splice(idx, 1));
      }
    }
    return result;
  }

  // -- State ------------------------------------------------------
  let rawData = $state<FocusData | null>(null);
  let loading = $state(true);
  let loadError = $state("");
  let nowTick = $state(Date.now());
  let userView = $state<UserView>("CTI");
  let analyticsOpen = $state(true);
  let calendarSyncState = $state<"idle" | "syncing" | "synced" | "error">("idle");
  let calendarSyncMsg = $state("");

  // Per-ticket transient state
  let estHoursMap = $state<Record<string, number>>({});
  let slotMap = $state<Record<string, SlotPersist>>({});
  let statusMap = $state<Record<string, FocusStatus>>({});
  let rescheduleMap = $state<Record<string, number>>({});
  let notDoneReasonMap = $state<Record<string, string>>({});

  // UI ephemeral
  let editingHoursId = $state<string>("");
  let editingHoursValue = $state<string>("");
  // Ticket detail modal state
  let modalItem = $state<FocusItem | null>(null);
  let modalHours = $state(1);
  let modalDate = $state("");
  let modalTime = $state("09:00");
  let modalReason = $state("");
  let modalCannotResolve = $state(false);
  let modalRescheduleDate = $state("");

  let whyCaptureId = $state<string>("");          // ticket id awaiting reason
  let whyCaptureExpiresAt = $state<number>(0);
  let whyCaptureValue = $state<string>("");
  let whyCaptureTimer: ReturnType<typeof setTimeout> | null = null;

  // Ticket planning drawer
  let drawerTicket = $state<FocusItem | null>(null);
  // "Up Next" smart queue - controls how many rows are visible
  let queueShown = $state(10);

  // Real calendar events fetched from MS Graph (claudio@ + fanny@)
  type CalEvent = { dateISO: string; startMin: number; endMin: number; title: string; owner?: string };
  let calEvents = $state<CalEvent[]>([]);

  // History (in-session done events for stats; localStorage backed)
  type DoneEvent = { ticketId: string; due: string; doneAtISO: string; lateDays: number; };
  let doneEvents = $state<DoneEvent[]>([]);

  // Zurich-local ISO date.
  const todayISO = new Date().toLocaleDateString("sv-SE", {
    timeZone: "Europe/Zurich",
  });

  // -- Lifecycle --------------------------------------------------
  let clockTimer: ReturnType<typeof setInterval> | null = null;

  onMount(() => {
    loadLocalState();
    void loadData();
    void loadCalendarEvents();
    clockTimer = setInterval(() => { nowTick = Date.now(); }, 30_000);
  });

  onDestroy(() => {
    if (clockTimer) clearInterval(clockTimer);
    if (whyCaptureTimer) clearTimeout(whyCaptureTimer);
    document.body.classList.remove('planner-open');
  });

  async function loadCalendarEvents() {
    try {
      // Fetch next 14 days so both this week and next week are covered in the drawer
      const start = todayISO;
      const endD = new Date(todayISO + "T12:00:00Z");
      endD.setUTCDate(endD.getUTCDate() + 14);
      const end = endD.toISOString().slice(0, 10);
      const res = await getAuthed(`/api/functions/calendar-events?user=all&start=${start}&end=${end}`);
      if (res?.events && Array.isArray(res.events)) {
        calEvents = res.events;
      }
    } catch { /* non-critical — drawer shows free if graph unavailable */ }
  }

  function loadLocalState() {
    if (typeof window === "undefined") return;
    try {
      // estimates
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
            if (obj && obj.start && obj.end) slotMap[id] = obj;
          } catch { /* ignore */ }
        }
        if (k.startsWith(`focus:status:${todayISO}:`)) {
          const id = k.slice(`focus:status:${todayISO}:`.length);
          const v = localStorage.getItem(k);
          if (v === "open" || v === "in_progress" || v === "planned" || v === "done" || v === "not_done") {
            statusMap[id] = v;
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
      // history
      const histRaw = localStorage.getItem("focus:history");
      if (histRaw) {
        const parsed = JSON.parse(histRaw);
        if (Array.isArray(parsed)) doneEvents = parsed;
      }
    } catch {
      /* corrupt storage - ignore */
    }
  }

  function persistEst(id: string, h: number) {
    if (typeof window === "undefined") return;
    if (h > 0) localStorage.setItem(`focus:est:${id}`, String(h));
    else localStorage.removeItem(`focus:est:${id}`);
    estHoursMap = { ...estHoursMap, [id]: h };
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
    pushScheduleToOrchestrator();
  }
  function persistStatus(id: string, status: FocusStatus) {
    if (typeof window === "undefined") return;
    localStorage.setItem(`focus:status:${todayISO}:${id}`, status);
    statusMap = { ...statusMap, [id]: status };
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
  function persistHistory(events: DoneEvent[]) {
    if (typeof window === "undefined") return;
    doneEvents = events;
    localStorage.setItem("focus:history", JSON.stringify(events.slice(-200)));
  }

  async function loadData() {
    loading = true;
    loadError = "";
    try {
      const data = await getAuthed("/api/functions/focus-data");
      rawData = data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // 401/auth errors → redirect to login rather than showing a dead error state
      if (msg.includes("401") || /session|expired|auth|login/i.test(msg)) {
        goto("/login");
        return;
      }
      loadError = msg;
      rawData = null;
    } finally {
      loading = false;
    }
  }

  // -- Helpers ----------------------------------------------------
  function daysDiff(a: string, b: string): number {
    if (!a || !b) return 0;
    const da = new Date(a + "T00:00:00Z").getTime();
    const db = new Date(b + "T00:00:00Z").getTime();
    return Math.round((db - da) / 86400000);
  }

  function parseDueISO(raw: unknown): string {
    if (!raw) return "";
    const s = String(raw);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    return "";
  }

  function greeting(): string {
    void nowTick;
    const h = new Date().toLocaleString("en-US", {
      timeZone: "Europe/Zurich",
      hour: "numeric",
      hour12: false,
    });
    const hour = parseInt(h, 10);
    if (Number.isNaN(hour)) return "Hello";
    if (hour < 5)  return "Still up";
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    if (hour < 22) return "Good evening";
    return "Good night";
  }

  function liveClock(): string {
    void nowTick;
    return new Date().toLocaleTimeString("de-CH", {
      timeZone: "Europe/Zurich",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function fmtTodayLong(): string {
    return new Date().toLocaleDateString("en-GB", {
      timeZone: "Europe/Zurich",
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  function fmtShort(iso: string): string {
    if (!iso) return "";
    try {
      return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
        timeZone: "Europe/Zurich",
        weekday: "short",
        day: "numeric",
        month: "short",
      });
    } catch {
      return iso;
    }
  }

  function sourceIcon(t: SourceType): string {
    if (t === "ticket")  return "T";
    if (t === "meeting") return "M";
    if (t === "finance") return "$";
    return "C";
  }

  function isOverdue(item: FocusItem): boolean {
    return !!item.due && item.due < todayISO;
  }
  function isDueToday(item: FocusItem): boolean {
    return item.due === todayISO;
  }

  function sourceLabel(t: SourceType): string {
    if (t === "ticket")  return "Ticket";
    if (t === "meeting") return "Meeting";
    if (t === "finance") return "Finance";
    return "Client";
  }

  function isFKAssigned(st: Record<string, any>): boolean {
    const name = String(st.assignee_name ?? st.assignee ?? "").toLowerCase();
    const email = String(st.assignee_email ?? "").toLowerCase();
    if (email === FK_EMAIL) return true;
    for (const k of FK_KEYS) if (name.includes(k)) return true;
    return false;
  }

  function isFKItem(assigneeName: string, assigneeEmail: string): boolean {
    const name = assigneeName.toLowerCase();
    const email = assigneeEmail.toLowerCase();
    if (email === FK_EMAIL) return true;
    for (const k of FK_KEYS) if (name.includes(k)) return true;
    return false;
  }

  function isCTIItem(assigneeName: string, assigneeEmail: string): boolean {
    const name = assigneeName.toLowerCase();
    const email = assigneeEmail.toLowerCase();
    for (const k of CTI_NAME_KEYS) if (name.includes(k)) return true;
    for (const k of CTI_EMAIL_KEYS) if (email.includes(k)) return true;
    return false;
  }

  function isTeamItem(assigneeName: string, assigneeEmail: string): boolean {
    return !isFKItem(assigneeName, assigneeEmail) && !isCTIItem(assigneeName, assigneeEmail);
  }

  // -- Day load (derived from today's meetings) -------------------
  const dayLoad = $derived.by((): DayLoad => {
    if (!rawData) return { isHeavy: false, productionHours: 0, indicator: "green", label: "Light day - full capacity" };
    return computeDayLoad(rawData.meetings ?? [], todayISO);
  });

  // -- Scoring ----------------------------------------------------
  const allItems = $derived.by(() => {
    void nowTick;
    if (!rawData) return [] as FocusItem[];
    const items: FocusItem[] = [];

    for (const t of rawData.tickets ?? []) {
      const st = t.state ?? {};

      // Skip tickets already done/cancelled in Plane or locally
      const planeState = String(st.state ?? st.group_name ?? st.status ?? "").toLowerCase();
      const planeGroup = String(st.state_group ?? "").toLowerCase();
      const planeStateName = String(st.state_name ?? "").toLowerCase();
      const localStatus = statusMap[t.entity_id] ?? "";
      const CLOSED = ["done", "completed", "cancelled", "closed", "won", "lost"];
      if (CLOSED.some((s) => planeState.includes(s) || planeGroup.includes(s) || planeStateName.includes(s))) continue;
      if (localStatus === "done") continue;

      // Zombie filter: unstarted + overdue 21d + entity_state stale 21d = deleted or abandoned
      if (planeGroup === "unstarted") {
        const dueCheck = st.due_date ?? st.target_date ?? "";
        const updatedCheck = t.updated_at ?? "";
        if (dueCheck && updatedCheck) {
          const nowMs = Date.now();
          const daysDue = (nowMs - new Date(dueCheck).getTime()) / 86400000;
          const daysSinceUpd = (nowMs - new Date(updatedCheck).getTime()) / 86400000;
          if (daysDue > 21 && daysSinceUpd > 21) continue;
        }
      }

      const dueRaw = st.due_date ?? st.target_date ?? st.due ?? "";
      const due = parseDueISO(dueRaw);
      const pri = String(st.priority ?? "").toLowerCase();
      const mrr = Number(st.client_mrr ?? st.mrr ?? 0) || 0;
      const est = estHoursMap[t.entity_id] ?? 0;
      let score = 0;
      let reason = "";

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
      // Urgent + overdue gets extra boost to guarantee first slot regardless.
      if (pri === "urgent" && due && due < todayISO) score += 10;
      if (mrr > 2000) score += 10;
      if (est > 0) score += 5;

      const surfaces = score > 0 || due === todayISO || est > 0;
      if (!surfaces) continue;

      if (!reason) {
        if (pri === "urgent") reason = "Priority: urgent";
        else if (pri === "high") reason = "Priority: high";
        else if (est > 0) reason = "Pinned to today";
        else reason = "Needs attention";
      }

      const id = t.entity_id;
      const slot = slotMap[id];
      const clientStr = String(st.customer_name ?? st.customer ?? st.client_code ?? "");
      const titleStr = t.entity_name || id;
      const isAdmin = isAdminTicket(titleStr, clientStr);

      // Smart suggested slot: high-MRR -> morning (<13:00), admin -> afternoon (15:00+),
      // urgent+overdue -> earliest slot.
      let suggestedSlot = "";
      if (pri === "urgent" && due && due < todayISO) {
        suggestedSlot = "08:30";
      } else if (mrr > 2000) {
        suggestedSlot = "09:30"; // morning energy window
      } else if (isAdmin) {
        suggestedSlot = "15:00"; // admin to low-energy afternoon block
      }

      // Plane stores assignees as truncated UUIDs or short names in st.assignees[]
      const assigneesArr = Array.isArray(st.assignees) ? st.assignees : [];
      const resolvedAssigneeName = resolveAssigneeName(assigneesArr) || String(st.assignee_name ?? st.assignee ?? "");
      const resolvedAssigneeEmail = String(st.assignee_email ?? "");

      items.push({
        id,
        type: "ticket",
        title: titleStr,
        score,
        due,
        reason,
        href: "/pipeline",
        client: clientStr,
        priority: pri,
        assigneeName: resolvedAssigneeName,
        assigneeEmail: resolvedAssigneeEmail,
        assigneesRaw: assigneesArr,
        estHours: est,
        trackedHours: Number(st.tracked_hours ?? st.logged_hours ?? 0) || 0,
        slot: slot ? `${slot.start}-${slot.end}` : "",
        status: statusMap[id] ?? "open",
        rescheduleCount: rescheduleMap[id] ?? 0,
        notDoneReason: notDoneReasonMap[id] ?? "",
        calendarMatch: findCalendarMatch(titleStr, clientStr),
        mrr,
        isAdmin,
        suggestedSlot,
      });
    }

    for (const m of rawData.meetings ?? []) {
      const st = m.state ?? {};
      const startRaw = st.start ?? st.meeting_date ?? "";
      const dayISO = parseDueISO(startRaw);
      if (dayISO !== todayISO) continue;

      let reason = "Meeting today";
      const startMs = startRaw ? new Date(String(startRaw)).getTime() : 0;
      if (startMs > 0) {
        const diffMin = Math.round((startMs - nowTick) / 60000);
        if (diffMin > 0 && diffMin <= 180) {
          const h = Math.floor(diffMin / 60);
          const mn = diffMin % 60;
          if (h > 0 && mn > 0) reason = `Meeting in ${h}h ${mn}m`;
          else if (h > 0)      reason = `Meeting in ${h}h`;
          else                 reason = `Meeting in ${mn}m`;
        } else if (diffMin <= 0 && diffMin > -180) {
          reason = "Meeting started";
        }
      }

      const id = m.entity_id;
      items.push({
        id,
        type: "meeting",
        title: String(st.subject ?? st.title ?? m.entity_name ?? "Meeting"),
        score: 35,
        due: dayISO,
        reason,
        href: "/meetings",
        client: "",
        assigneeName: String(st.organizer ?? ""),
        assigneeEmail: String(st.organizer_email ?? ""),
        estHours: estHoursMap[id] ?? 0,
        trackedHours: 0,
        slot: slotMap[id] ? `${slotMap[id].start}-${slotMap[id].end}` : "",
        status: statusMap[id] ?? "open",
        rescheduleCount: rescheduleMap[id] ?? 0,
        notDoneReason: notDoneReasonMap[id] ?? "",
        mrr: 0,
        isAdmin: false,
        suggestedSlot: "",
      });
    }

    for (const inv of rawData.invoices ?? []) {
      const due = parseDueISO(inv.due_date ?? "");
      if (!due) continue;
      let score = 0;
      let reason = "";
      if (due < todayISO) {
        score += 40;
        const diff = daysDiff(due, todayISO);
        reason = diff === 1 ? "Invoice overdue 1 day" : `Invoice overdue ${diff} days`;
      } else if (due === todayISO) {
        score += 30;
        reason = "Invoice due today";
      } else {
        const ahead = daysDiff(todayISO, due);
        if (ahead === 1) { score += 18; reason = "Invoice due tomorrow"; }
        else if (ahead === 2) { score += 10; reason = "Invoice due in 2 days"; }
        else continue;
      }
      const amount = inv.amount ? `${inv.currency || "CHF"} ${Number(inv.amount).toLocaleString("de-CH", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : "";
      const title = [inv.number, amount, inv.client_name || inv.client_code]
        .filter(Boolean)
        .join(" - ");

      items.push({
        id: inv.id,
        type: "finance",
        title: title || `Invoice ${inv.id}`,
        score,
        due,
        reason,
        href: "/finance",
        client: String(inv.client_name || inv.client_code || ""),
        estHours: estHoursMap[inv.id] ?? 0,
        trackedHours: 0,
        slot: slotMap[inv.id] ? `${slotMap[inv.id].start}-${slotMap[inv.id].end}` : "",
        status: statusMap[inv.id] ?? "open",
        rescheduleCount: rescheduleMap[inv.id] ?? 0,
        notDoneReason: notDoneReasonMap[inv.id] ?? "",
        mrr: 0,
        isAdmin: true,   // finance admin
        suggestedSlot: "15:00",
      });
    }

    return items;
  });

  // View filter:
  //   CTI  = CTI-assigned tickets + meetings + invoices (strict: no unassigned bleed)
  //   FK   = FK-assigned tickets only
  //   TEAM = unassigned tickets (neither CTI nor FK explicit) — plan together
  //   BOTH = everything
  const visibleAll = $derived.by(() => {
    if (userView === "BOTH") return allItems;

    return allItems.filter((i) => {
      const name = i.assigneeName ?? "";
      const email = i.assigneeEmail ?? "";
      const isFK   = isFKItem(name, email);
      const isCTI  = isCTIItem(name, email);
      const isTeam = isTeamItem(name, email);

      if (userView === "FK") {
        return i.type === "ticket" && isFK;
      }
      if (userView === "TEAM") {
        return i.type === "ticket" && isTeam;
      }
      // CTI: strict — only CTI-assigned tickets, plus meetings/invoices (unassigned → TEAM).
      if (i.type === "meeting" || i.type === "finance") return true;
      return isCTI;
    });
  });

  // Today schedule = focus items that are due today, overdue, urgent/high or
  // explicitly time-slotted. Heavy-day logic caps active items to 3; items
  // 4-7 are still shown but tagged with suggestedReschedule = next business day.
  const todaySchedule = $derived.by(() => {
    const candidates = visibleAll
      .filter((i) => {
        if (i.status === "done") return false;
        if (i.slot) return true;
        if (i.estHours > 0) return true;
        if (isOverdue(i) || isDueToday(i)) return true;
        if (i.priority === "urgent" || i.priority === "high") return true;
        return false;
      })
      .sort((a, b) => b.score - a.score);

    const maxActive = dayLoad.isHeavy ? MAX_FOCUS_HEAVY : MAX_FOCUS_NORMAL;

    // Active items (shown with normal slots): interleave by client for context freshness.
    const active = interleaveByClient(candidates.slice(0, maxActive));

    // Overflow items on heavy days: show with reschedule suggestion, not a time slot.
    const overflow: FocusItem[] = dayLoad.isHeavy
      ? candidates.slice(MAX_FOCUS_HEAVY, MAX_FOCUS_NORMAL).map((i) => ({
          ...i,
          suggestedReschedule: nextBusinessDay(todayISO),
        }))
      : [];

    return [...active, ...overflow];
  });

  // -- This week --------------------------------------------------
  const thisWeek = $derived.by(() => {
    if (!rawData) return [] as FocusItem[];
    const todayDate = new Date(todayISO + "T00:00:00Z");
    const weekEnd = new Date(todayDate.getTime() + 7 * 86400000)
      .toISOString()
      .slice(0, 10);

    const todaysIds = new Set(todaySchedule.map((f) => `${f.type}:${f.id}`));
    const out: FocusItem[] = [];
    const seen = new Set<string>();

    for (const i of visibleAll) {
      const key = `${i.type}:${i.id}`;
      if (todaysIds.has(key) || seen.has(key)) continue;
      if (i.status === "done") continue;
      if (!i.due) continue;
      if (i.due <= todayISO) continue;
      if (i.due >= weekEnd) continue;
      seen.add(key);
      out.push(i);
    }

    return out.sort((a, b) => a.due.localeCompare(b.due)).slice(0, 14);
  });

  // -- Up Next smart queue (open tickets NOT already in today's blocks) --
  // Sort: overdue first -> deadline ascending -> priority -> alphabetical.
  const upNextItems = $derived.by(() => {
    if (!rawData) return [] as FocusItem[];

    const scheduledIds = new Set([
      ...todaySchedule.map((i) => i.id),
      ...thisWeek.map((i) => i.id),
    ]);

    const priOrder: Record<string, number> = {
      urgent: 0, high: 1, medium: 2, low: 3, none: 4, "": 4,
    };
    const items: FocusItem[] = [];

    for (const t of rawData.tickets ?? []) {
      const st = t.state ?? {};
      const id = t.entity_id;
      if (scheduledIds.has(id)) continue;

      // Skip closed states (Plane or local)
      const stateStr = String(st.state ?? st.group_name ?? st.status ?? "").toLowerCase();
      const stateGrp = String(st.state_group ?? "").toLowerCase();
      if (["done", "completed", "cancelled", "closed", "won", "lost"].some((s) => stateStr.includes(s) || stateGrp.includes(s))) continue;
      if ((statusMap[id] ?? "") === "done") continue;

      // User-view filter — Plane stores assignees as truncated UUIDs in st.assignees[]
      {
        const upFilterArr = Array.isArray(st.assignees) ? st.assignees : [];
        const aName  = resolveAssigneeName(upFilterArr) || String(st.assignee_name ?? st.assignee ?? "");
        const aEmail = String(st.assignee_email ?? "");
        const isFK   = isFKItem(aName, aEmail);
        const isCTI  = isCTIItem(aName, aEmail);
        const isTeam = isTeamItem(aName, aEmail);
        if (userView === "FK"   && !isFK)   continue;
        if (userView === "TEAM" && !isTeam) continue;
        if (userView === "CTI"  && !isCTI)  continue;
      }

      const due = parseDueISO(st.due_date ?? st.target_date ?? "");
      const pri = String(st.priority ?? "").toLowerCase();
      const clientStr = String(st.customer_name ?? st.customer ?? st.client_code ?? "");

      const upAssigneesArr = Array.isArray(st.assignees) ? st.assignees : [];
      const upAssigneeName  = resolveAssigneeName(upAssigneesArr) || String(st.assignee_name ?? st.assignee ?? "");
      const upAssigneeEmail = String(st.assignee_email ?? "");

      items.push({
        id,
        type: "ticket",
        title: t.entity_name || id,
        score: 0,
        due,
        reason: "",
        href: "/pipeline",
        client: clientStr,
        priority: pri,
        assigneeName: upAssigneeName,
        assigneeEmail: upAssigneeEmail,
        estHours: estHoursMap[id] ?? 0,
        trackedHours: Number(st.tracked_hours ?? st.logged_hours ?? 0) || 0,
        slot: "",
        status: statusMap[id] ?? "open",
        rescheduleCount: 0,
        notDoneReason: "",
        mrr: 0,
        isAdmin: isAdminTicket(t.entity_name || id, clientStr),
      });
    }

    // Sort: overdue first -> deadline ASC -> priority -> alphabetical
    items.sort((a, b) => {
      const aOver = !!a.due && a.due < todayISO;
      const bOver = !!b.due && b.due < todayISO;
      if (aOver !== bOver) return aOver ? -1 : 1;

      const da = a.due || "9999-12-31";
      const db = b.due || "9999-12-31";
      if (da !== db) return da < db ? -1 : 1;

      const pa = priOrder[a.priority ?? ""] ?? 4;
      const pb = priOrder[b.priority ?? ""] ?? 4;
      if (pa !== pb) return pa - pb;

      return a.title.localeCompare(b.title);
    });

    return items;
  });

  // -- KPI strip --------------------------------------------------
  const kpis = $derived.by(() => {
    let overdue = 0;
    let dueToday = 0;
    let dueThisWeek = 0;
    let hoursToday = 0;

    const todayDate = new Date(todayISO + "T00:00:00Z");
    const weekEnd = new Date(todayDate.getTime() + 7 * 86400000)
      .toISOString()
      .slice(0, 10);

    for (const i of visibleAll) {
      if (i.status === "done") continue;
      if (i.due && i.due < todayISO) overdue++;
      if (i.due === todayISO) dueToday++;
      if (i.due && i.due > todayISO && i.due < weekEnd) dueThisWeek++;
    }
    for (const i of todaySchedule) {
      hoursToday += i.estHours || 0;
    }

    // On-time rate: last 7 days done events for current user view.
    const sevenDaysAgoMs = Date.now() - 7 * 86400000;
    const relevant = doneEvents.filter((d) => new Date(d.doneAtISO).getTime() >= sevenDaysAgoMs);
    const onTime = relevant.filter((d) => d.lateDays <= 0).length;
    const onTimeRate = relevant.length > 0 ? Math.round((onTime / relevant.length) * 100) : null;

    return { overdue, dueToday, dueThisWeek, hoursToday, onTimeRate, sample: relevant.length };
  });

  // -- Analytics --------------------------------------------------
  const analytics = $derived.by(() => {
    const sevenDaysAgoMs = Date.now() - 7 * 86400000;

    function statsFor(filter: (i: FocusItem) => boolean) {
      const recent = doneEvents.filter((d) => new Date(d.doneAtISO).getTime() >= sevenDaysAgoMs);
      const onTime = recent.filter((d) => d.lateDays <= 0).length;
      const onTimeRate = recent.length > 0 ? Math.round((onTime / recent.length) * 100) : null;
      const doneThisWeek = recent.length;

      // Avg completion: hours from due_date to done_at, capped at 0 if on-time.
      let avgLateDays = 0;
      if (recent.length > 0) {
        avgLateDays = recent.reduce((acc, d) => acc + Math.max(0, d.lateDays), 0) / recent.length;
      }

      let billedHours = 0;
      for (const i of allItems.filter(filter)) {
        if (i.status === "done") billedHours += i.estHours || i.trackedHours || 0;
      }

      return {
        onTimeRate,
        doneThisWeek,
        avgLateDays: Math.round(avgLateDays * 10) / 10,
        billedHours: Math.round(billedHours * 10) / 10,
      };
    }

    const cti = statsFor((i) => {
      const n = (i.assigneeName ?? "").toLowerCase();
      const e = (i.assigneeEmail ?? "").toLowerCase();
      if (e === FK_EMAIL) return false;
      for (const k of FK_KEYS) if (n.includes(k)) return false;
      return true;
    });
    const fk = statsFor((i) => {
      const n = (i.assigneeName ?? "").toLowerCase();
      const e = (i.assigneeEmail ?? "").toLowerCase();
      if (e === FK_EMAIL) return true;
      for (const k of FK_KEYS) if (n.includes(k)) return true;
      return false;
    });

    // 14-day heatmap
    const heatmap: { date: string; score: "ontime" | "late" | "verylate" | "none"; }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const dayEvents = doneEvents.filter((e) => e.doneAtISO.slice(0, 10) === iso);
      let score: "ontime" | "late" | "verylate" | "none" = "none";
      if (dayEvents.length === 0) {
        score = "none";
      } else {
        const worst = Math.max(...dayEvents.map((e) => e.lateDays));
        if (worst <= 0) score = "ontime";
        else if (worst <= 1) score = "late";
        else score = "verylate";
      }
      heatmap.push({ date: iso, score });
    }

    return { cti, fk, heatmap };
  });

  // -- Schedule / hours actions -----------------------------------
  function nextAvailableSlot(hours: number): SlotPersist | null {
    if (hours <= 0) return null;
    // Build occupied minute-ranges from existing slots (today only).
    const ranges: Array<[number, number]> = [];
    for (const id of Object.keys(slotMap)) {
      const s = slotMap[id];
      if (!s) continue;
      const sm = toMinutes(s.start);
      const em = toMinutes(s.end);
      if (sm < em) ranges.push([sm, em]);
    }
    ranges.sort((a, b) => a[0] - b[0]);

    const dayStart = WORK_START * 60;
    const dayEnd = WORK_END * 60;
    const needed = Math.max(15, Math.round(hours * 60));

    let cursor = dayStart;
    // Start cursor from current time if today
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    if (nowMin > cursor) cursor = Math.ceil(nowMin / 15) * 15;

    for (const [a, b] of ranges) {
      if (cursor + needed <= a) {
        return { start: fromMinutes(cursor), end: fromMinutes(cursor + needed) };
      }
      if (cursor < b) cursor = b;
    }
    if (cursor + needed <= dayEnd) {
      return { start: fromMinutes(cursor), end: fromMinutes(cursor + needed) };
    }
    return null;
  }

  function toMinutes(hhmm: string): number {
    const parts = hhmm.split(":");
    if (parts.length !== 2) return 0;
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  }
  function fromMinutes(m: number): string {
    const h = Math.floor(m / 60).toString().padStart(2, "0");
    const mn = (m % 60).toString().padStart(2, "0");
    return `${h}:${mn}`;
  }

  function startEditHours(item: FocusItem) {
    editingHoursId = item.id;
    editingHoursValue = item.estHours > 0 ? String(item.estHours) : "";
  }

  function commitHoursEdit(item: FocusItem) {
    const raw = editingHoursValue.trim().replace(",", ".").replace(/h$/i, "");
    const h = Number(raw);
    editingHoursId = "";
    editingHoursValue = "";
    if (!Number.isFinite(h) || h < 0) return;
    persistEst(item.id, h);
    if (h > 0 && !slotMap[item.id]) {
      const slot = nextAvailableSlot(h);
      if (slot) persistSlot(item.id, slot);
    } else if (h === 0) {
      persistSlot(item.id, null);
    }
  }

  function cancelHoursEdit() {
    editingHoursId = "";
    editingHoursValue = "";
  }

  function reslot(item: FocusItem) {
    if (item.estHours <= 0) return;
    persistSlot(item.id, null);
    const slot = nextAvailableSlot(item.estHours);
    if (slot) persistSlot(item.id, slot);
  }

  function setStarted(item: FocusItem) {
    persistStatus(item.id, "in_progress");
  }

  function setOpen(item: FocusItem) {
    persistStatus(item.id, "open");
  }

  function setPlan(item: FocusItem) {
    persistStatus(item.id, "planned");
  }

  function setDone(item: FocusItem) {
    // Optimistic local update — removes from focus lists immediately
    persistStatus(item.id, "done");
    const today = new Date().toISOString();
    const lateDays = item.due ? daysDiff(item.due, todayISO) : 0;
    persistHistory([
      ...doneEvents,
      {
        ticketId: item.id,
        due: item.due || todayISO,
        doneAtISO: today,
        lateDays: lateDays,
      },
    ]);
    // Push to Plane.so in background — fire and forget
    postAuthed("/api/functions/focus-mark-done", { entity_id: item.id }).catch(() => {});
  }

  function setNotDone(item: FocusItem) {
    const next = (rescheduleMap[item.id] ?? 0) + 1;
    persistResched(item.id, next);
    persistStatus(item.id, "not_done");
    // open "why not" capture
    whyCaptureId = item.id;
    whyCaptureExpiresAt = Date.now() + WHY_WINDOW_MS;
    whyCaptureValue = "";
    if (whyCaptureTimer) clearTimeout(whyCaptureTimer);
    whyCaptureTimer = setTimeout(() => {
      // silent dismiss after 5 min if no reply
      if (whyCaptureId === item.id) {
        whyCaptureId = "";
        whyCaptureValue = "";
      }
    }, WHY_WINDOW_MS);
  }

  function commitWhyCapture(item: FocusItem) {
    const reason = whyCaptureValue.trim();
    if (reason) persistReason(item.id, reason);
    whyCaptureId = "";
    whyCaptureValue = "";
    if (whyCaptureTimer) { clearTimeout(whyCaptureTimer); whyCaptureTimer = null; }
  }

  function cancelWhyCapture() {
    whyCaptureId = "";
    whyCaptureValue = "";
    if (whyCaptureTimer) { clearTimeout(whyCaptureTimer); whyCaptureTimer = null; }
  }

  // -- Drawer: existing blocks payload (full week) ---------------
  // Merges local planned slots (today only) with real MS Graph calendar events.
  const drawerBlocks = $derived.by(() => {
    type Blk = { dateISO: string; startMin: number; endMin: number; title: string; client?: string };
    const out: Blk[] = [];
    // Local focus-schedule slots (today only)
    for (const item of todaySchedule) {
      const slot = slotMap[item.id];
      if (!slot) continue;
      out.push({
        dateISO: todayISO,
        startMin: toMinutes(slot.start),
        endMin: toMinutes(slot.end),
        title: item.title,
        client: item.client || undefined,
      });
    }
    // Real MS Graph calendar events (full week, both users)
    for (const ev of calEvents) {
      out.push({
        dateISO: ev.dateISO,
        startMin: ev.startMin,
        endMin: ev.endMin,
        title: ev.title,
      });
    }
    return out;
  });

  function openDrawer(item: FocusItem) {
    drawerTicket = item;
    document.body.classList.add('planner-open');
  }

  function closeDrawer() {
    drawerTicket = null;
    document.body.classList.remove('planner-open');
  }

  function handlePlanned(payload: {
    ticketId: string;
    dateISO: string;
    startHHMM: string;
    durationMin: number;
  }) {
    // If user planned for today, mirror into local slotMap + estHours and
    // mark in_progress (optimistic). If not today, just bump est hours so
    // the schedule sync agent picks it up on the right day.
    const hours = Math.max(0.25, Math.round((payload.durationMin / 60) * 4) / 4);
    persistEst(payload.ticketId, hours);
    if (payload.dateISO === todayISO) {
      const startMin = toMinutes(payload.startHHMM);
      const endMin = startMin + payload.durationMin;
      persistSlot(payload.ticketId, {
        start: payload.startHHMM,
        end: fromMinutes(endMin),
      });
      persistStatus(payload.ticketId, "in_progress");
    }
  }

  // Plan a backlog item into today with a 1h default estimate + auto-slot
  function planToday(item: FocusItem) {
    const h = item.estHours > 0 ? item.estHours : 1;
    persistEst(item.id, h);
    const slot = nextAvailableSlot(h);
    if (slot) persistSlot(item.id, slot);
  }

  // -- Calendar sync ---------------------------------------------
  async function syncToCalendar() {
    if (calendarSyncState === "syncing") return;
    calendarSyncState = "syncing";
    calendarSyncMsg = "";

    const payload = {
      date: todayISO,
      user: userView,
      items: todaySchedule
        .filter((i) => i.slot && i.estHours > 0)
        .map((i) => ({
          id: i.id,
          title: i.title,
          client: i.client,
          slot: i.slot,
          hours: i.estHours,
          due: i.due,
          source: i.type,
        })),
    };

    try {
      const res = await fetch("/api/functions/focus-calendar-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      calendarSyncState = "synced";
      calendarSyncMsg = "Synced to claudio@c2moviez.com calendar";
    } catch (err) {
      calendarSyncState = "error";
      calendarSyncMsg = err instanceof Error ? err.message : String(err);
    }
  }

  // -- Derived helpers --------------------------------------------
  function progressPct(item: FocusItem): number {
    if (item.status === "done") return 100;
    if (item.status === "planned") return 15;
    if (item.status === "in_progress") {
      if (item.trackedHours > 0 && item.estHours > 0) {
        return Math.min(95, Math.round((item.trackedHours / item.estHours) * 100));
      }
      return 35;
    }
    if (item.status === "not_done") return 0;
    return 0;
  }

  function statusLabel(s: FocusStatus): string {
    if (s === "planned")    return "Planned";
    if (s === "in_progress") return "In progress";
    if (s === "done") return "Done";
    if (s === "not_done") return "Rescheduled";
    return "Open";
  }
</script>

<svelte:head>
  <title>Focus - c2moviez ops</title>
</svelte:head>

<div class="focus-page">
  <!-- ----- Command header --------------------------------- -->
  <header class="page-head">
    <div class="head-left">
      <span class="caption">P5 - Ultimate Focus Schedule</span>
      <h1 class="hello">{greeting()}, {userView === "FK" ? "Fanny" : userView === "TEAM" ? "Team" : "Claudio"}</h1>
      <p class="today-label">
        <span>{fmtTodayLong()}</span>
        <span class="clock-dot"></span>
        <span class="clock-time">{liveClock()} CEST</span>
      </p>
    </div>
    <div class="head-right">
      <div class="user-toggle" role="tablist" aria-label="Active operator">
        <button
          type="button"
          class="user-toggle-btn"
          class:is-active={userView === "CTI"}
          role="tab"
          aria-selected={userView === "CTI"}
          onclick={() => (userView = "CTI")}
          title="Claudio's tickets"
        >CTI</button>
        <button
          type="button"
          class="user-toggle-btn"
          class:is-active={userView === "FK"}
          role="tab"
          aria-selected={userView === "FK"}
          onclick={() => (userView = "FK")}
          title="Fanny's tickets"
        >FK</button>
        <button
          type="button"
          class="user-toggle-btn user-toggle-btn--team"
          class:is-active={userView === "TEAM"}
          role="tab"
          aria-selected={userView === "TEAM"}
          onclick={() => (userView = "TEAM")}
          title="Unassigned / team tickets"
        >TEAM</button>
      </div>
      <button
        type="button"
        class="glass-btn glass-btn--ghost glass-btn--sm"
        onclick={loadData}
        disabled={loading}
        aria-label="Refresh focus data"
      >
        {loading ? "Refreshing..." : "Refresh"}
      </button>
    </div>
  </header>

  <!-- ----- KPI strip --------------------------------------- -->
  <section class="kpi-strip" aria-label="Today's signal at a glance">
    <div class="chip" class:chip--danger={kpis.overdue > 0}>
      <span class="chip-num">{kpis.overdue}</span>
      <span class="chip-lbl">Overdue</span>
    </div>
    <div class="chip" class:chip--cyan={kpis.dueToday > 0}>
      <span class="chip-num">{kpis.dueToday}</span>
      <span class="chip-lbl">Due today</span>
    </div>
    <div class="chip">
      <span class="chip-num">{kpis.dueThisWeek}</span>
      <span class="chip-lbl">Due this week</span>
    </div>
    <div class="chip" class:chip--cyan={kpis.hoursToday > 0}>
      <span class="chip-num">{kpis.hoursToday.toFixed(1)}<span class="chip-unit">h</span></span>
      <span class="chip-lbl">Planned today</span>
    </div>
    <div class="chip" class:chip--ok={kpis.onTimeRate !== null && kpis.onTimeRate >= 80} class:chip--warn={kpis.onTimeRate !== null && kpis.onTimeRate < 60}>
      <span class="chip-num">
        {kpis.onTimeRate === null ? "-" : `${kpis.onTimeRate}%`}
      </span>
      <span class="chip-lbl">On-time 7d</span>
    </div>
  </section>

  <!-- ----- Today's Schedule -------------------------------- -->
  <section class="today" aria-labelledby="today-h">
    <div class="section-head">
      <h2 id="today-h" class="section-title">Today's Schedule</h2>
      {#if todaySchedule.length > 0}
        <span class="section-count">{todaySchedule.filter(i => !i.suggestedReschedule).length}</span>
      {/if}
      <!-- Day-load indicator dot -->
      <span class="dayload-indicator dayload-indicator--{dayLoad.indicator}" title={dayLoad.label}>
        <span class="dayload-dot"></span>
        <span class="dayload-label">{dayLoad.label}</span>
      </span>
      <span class="section-sub">
        {userView === "FK" ? "FK assignments only" : userView === "TEAM" ? "Unassigned / team tickets" : "All sources"}
      </span>
    </div>

    {#if dayLoad.isHeavy}
      <div class="heavy-day-banner" role="alert">
        <span class="heavy-day-icon">rec</span>
        <span class="heavy-day-msg">Recording/shoot day detected - showing only {MAX_FOCUS_HEAVY} priority tickets to protect your focus</span>
      </div>
    {/if}

    {#if loading && !rawData}
      <div class="skel-list" aria-busy="true">
        {#each Array(4) as _, i (i)}
          <div class="skel-card"></div>
        {/each}
      </div>
    {:else if loadError}
      <div class="empty">
        <p class="empty-msg">Could not load focus data: {loadError}</p>
        <button type="button" class="glass-btn glass-btn--ghost glass-btn--sm" onclick={loadData}>Try again</button>
      </div>
    {:else if todaySchedule.length === 0}
      <div class="empty empty--clear">
        <div class="empty-check">✓</div>
        <h3 class="empty-title">All clear for today</h3>
        <p class="empty-msg">Nothing urgent on the {userView} schedule. Enjoy the clarity.</p>
      </div>
    {:else}
      <ol class="focus-list">
        {#each todaySchedule as item, idx (`${item.type}:${item.id}`)}
          <li
            class="focus-card type-{item.type} status-{item.status}"
            class:is-overdue={isOverdue(item)}
            class:is-today={isDueToday(item)}
            class:is-escalated={item.rescheduleCount >= RESCHEDULE_LIMIT}
            class:is-deferred={!!item.suggestedReschedule}
            class:is-planned={item.status === "planned" || !!item.calendarMatch}
            style="--enter-delay: {idx * 50}ms"
          >
            <div class="card-top">
              <div class="rank">{idx + 1}</div>
              <div class="src" data-type={item.type} title={sourceLabel(item.type)}>
                {sourceIcon(item.type)}
              </div>

              <div class="body">
                <div class="title-row">
                  <button
                    type="button"
                    class="title title-btn"
                    onclick={() => openDrawer(item)}
                    title="Open planner"
                  >{item.title}</button>
                  {#if item.client}
                    <span class="client-tag">{item.client}</span>
                  {/if}
                  {#if item.assigneeName}
                    <span class="assignee-tag">{item.assigneeName}</span>
                  {/if}
                </div>
                <div class="meta">
                  <span class="reason">{item.reason}</span>
                  {#if item.priority && item.priority !== "none"}
                    <span class="prio prio-{item.priority}">{item.priority}</span>
                  {/if}
                  {#if !item.suggestedReschedule}
                    <span class="status-pill status-pill-{item.status}">{statusLabel(item.status)}</span>
                  {/if}
                  {#if item.rescheduleCount > 0 && !item.suggestedReschedule}
                    <span class="resched-pill" class:is-warn={item.rescheduleCount >= RESCHEDULE_LIMIT}>
                      Rescheduled x{item.rescheduleCount}{item.rescheduleCount >= RESCHEDULE_LIMIT ? " - escalate" : ""}
                    </span>
                  {/if}
                  {#if item.suggestedReschedule}
                    <span class="resched-suggest-pill">
                      Suggested: reschedule to {fmtShort(item.suggestedReschedule)}
                    </span>
                  {/if}
                  {#if item.calendarMatch}
                    <span class="cal-match-pill" title="Calendar entry found: {item.calendarMatch.title}">
                      cal {item.calendarMatch.time} - {item.calendarMatch.title.slice(0, 28)}{item.calendarMatch.title.length > 28 ? "..." : ""}
                    </span>
                  {:else if item.suggestedSlot && !item.slot && !item.suggestedReschedule}
                    <span class="slot-suggest-pill" title="Smart slot suggestion based on client MRR and task type">
                      Suggested: {item.suggestedSlot}
                      {#if (item.mrr ?? 0) > 2000} (high-value client - morning){:else if item.isAdmin} (admin - afternoon){:else if item.priority === "urgent"} (urgent - first slot){/if}
                    </span>
                  {/if}
                  {#if (item.mrr ?? 0) > 2000 && !item.suggestedReschedule}
                    <span class="mrr-badge" title="High-MRR client - morning priority">HI-MRR</span>
                  {/if}
                </div>
              </div>

              <div class="slot-block">
                {#if item.slot}
                  <button
                    type="button"
                    class="slot-chip"
                    title="Click to reschedule"
                    onclick={() => reslot(item)}
                  >
                    {item.slot}
                  </button>
                {:else}
                  <span class="slot-chip slot-chip--empty" aria-hidden="true">unscheduled</span>
                {/if}

                {#if editingHoursId === item.id}
                  <div class="hours-edit">
                    <input
                      class="hours-input"
                      type="text"
                      inputmode="decimal"
                      bind:value={editingHoursValue}
                      onblur={() => commitHoursEdit(item)}
                      onkeydown={(e) => {
                        if (e.key === "Enter") commitHoursEdit(item);
                        else if (e.key === "Escape") cancelHoursEdit();
                      }}
                      autofocus
                      placeholder="2"
                    />
                    <span class="hours-suffix">h</span>
                  </div>
                {:else}
                  <button
                    type="button"
                    class="hours-chip"
                    onclick={() => startEditHours(item)}
                    title="Click to edit estimated hours"
                  >
                    {#if item.estHours > 0}
                      <span class="hours-val">{item.estHours}h</span>
                    {:else}
                      <span class="hours-placeholder">+ hours</span>
                    {/if}
                    {#if item.trackedHours > 0}
                      <span class="hours-tracked">/ {item.trackedHours}h logged</span>
                    {/if}
                  </button>
                {/if}
              </div>
            </div>

            <div class="card-bottom">
              <div class="progress-rail" aria-hidden="true">
                <div class="progress-fill" style="width: {progressPct(item)}%"></div>
              </div>
              <div class="card-status-actions">
                {#if item.status === "done"}
                  <button type="button" class="glass-btn glass-btn--ghost glass-btn--xs" onclick={() => setOpen(item)}>Reopen</button>
                {:else}
                  <button type="button" class="glass-btn glass-btn--xs glass-btn--success" onclick={() => setDone(item)}>Done</button>
                  {#if item.status !== "planned"}
                    <button type="button" class="glass-btn glass-btn--xs glass-btn--plan" onclick={() => setPlan(item)} title="Mark as planned - you know when this will happen">Planned</button>
                  {:else}
                    <button type="button" class="glass-btn glass-btn--ghost glass-btn--xs" onclick={() => setOpen(item)}>Unplan</button>
                  {/if}
                  <button type="button" class="glass-btn glass-btn--ghost glass-btn--xs not-done-btn" onclick={() => setNotDone(item)}>Not done</button>
                {/if}
              </div>
            </div>

            {#if whyCaptureId === item.id}
              <div class="why-capture">
                <label for="why-{item.id}" class="why-label">
                  Why not? <span class="why-window">5 min window</span>
                </label>
                <div class="why-input-row">
                  <input
                    id="why-{item.id}"
                    class="why-input"
                    type="text"
                    placeholder="Quick reason (or leave blank to dismiss)"
                    bind:value={whyCaptureValue}
                    onkeydown={(e) => {
                      if (e.key === "Enter") commitWhyCapture(item);
                      else if (e.key === "Escape") cancelWhyCapture();
                    }}
                    autofocus
                  />
                  <button
                    type="button"
                    class="glass-btn glass-btn--sm"
                    onclick={() => commitWhyCapture(item)}
                  >Save</button>
                  <button
                    type="button"
                    class="glass-btn glass-btn--ghost glass-btn--sm"
                    onclick={cancelWhyCapture}
                  >Dismiss</button>
                </div>
              </div>
            {:else if item.notDoneReason}
              <div class="prev-reason">
                <span class="prev-reason-lbl">Last reason</span>
                <span class="prev-reason-val">{item.notDoneReason}</span>
              </div>
            {/if}
          </li>
        {/each}
      </ol>
    {/if}
  </section>

  <!-- ----- Week Overview ----------------------------------- -->
  <section class="week" aria-labelledby="this-week-h">
    <div class="section-head">
      <h2 id="this-week-h" class="section-title">Week Overview</h2>
      {#if thisWeek.length > 0}
        <span class="section-count">{thisWeek.length}</span>
      {/if}
    </div>

    {#if loading && !rawData}
      <div class="skel-list" aria-busy="true">
        {#each Array(3) as _, i (i)}
          <div class="skel-card skel-card--sm"></div>
        {/each}
      </div>
    {:else if thisWeek.length === 0}
      <div class="empty empty--sm">
        <p class="empty-msg">Nothing else booked for the next 7 days.</p>
      </div>
    {:else}
      <div class="week-table">
        <div class="week-thead">
          <span>Date</span>
          <span>Type</span>
          <span>Title</span>
          <span>Client</span>
          <span class="num">Hours</span>
        </div>
        <ul class="week-list">
          {#each thisWeek as item (`${item.type}:${item.id}`)}
            <li class="week-row">
              <span class="week-date">{fmtShort(item.due)}</span>
              <span class="week-src" data-type={item.type}>{sourceLabel(item.type)}</span>
              <button type="button" class="week-title" onclick={() => openDrawer(item)}>{item.title}</button>
              <span class="week-client">{item.client || "-"}</span>
              <span class="week-hours num">{item.estHours > 0 ? `${item.estHours}h` : "-"}</span>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </section>

  <!-- ----- Analytics --------------------------------------- -->
  <section class="analytics" aria-labelledby="analytics-h">
    <button
      type="button"
      class="section-toggle"
      onclick={() => (analyticsOpen = !analyticsOpen)}
      aria-expanded={analyticsOpen}
    >
      <h2 id="analytics-h" class="section-title">Analytics</h2>
      <span class="section-sub">Live operator stats - past 7d</span>
      <span class="toggle-arrow" class:is-open={analyticsOpen}>▾</span>
    </button>

    {#if analyticsOpen}
      <div class="analytics-grid">
        <article class="stat-panel" class:is-active={userView === "CTI"}>
          <header class="stat-head">
            <span class="stat-who">CTI</span>
            <span class="stat-name">Claudio Tinner</span>
          </header>
          <div class="stat-grid">
            <div class="stat">
              <span class="stat-num">{analytics.cti.onTimeRate === null ? "-" : `${analytics.cti.onTimeRate}%`}</span>
              <span class="stat-lbl">On-time rate</span>
            </div>
            <div class="stat">
              <span class="stat-num">{analytics.cti.doneThisWeek}</span>
              <span class="stat-lbl">Done this week</span>
            </div>
            <div class="stat">
              <span class="stat-num">{analytics.cti.avgLateDays}<span class="stat-unit">d</span></span>
              <span class="stat-lbl">Avg late</span>
            </div>
            <div class="stat">
              <span class="stat-num">{analytics.cti.billedHours}<span class="stat-unit">h</span></span>
              <span class="stat-lbl">Billed hours</span>
            </div>
          </div>
        </article>

        <article class="stat-panel" class:is-active={userView === "FK"}>
          <header class="stat-head">
            <span class="stat-who">FK</span>
            <span class="stat-name">Fanny Kecskes - 25.2h/wk</span>
          </header>
          <div class="stat-grid">
            <div class="stat">
              <span class="stat-num">{analytics.fk.onTimeRate === null ? "-" : `${analytics.fk.onTimeRate}%`}</span>
              <span class="stat-lbl">On-time rate</span>
            </div>
            <div class="stat">
              <span class="stat-num">{analytics.fk.doneThisWeek}</span>
              <span class="stat-lbl">Done this week</span>
            </div>
            <div class="stat">
              <span class="stat-num">{analytics.fk.avgLateDays}<span class="stat-unit">d</span></span>
              <span class="stat-lbl">Avg late</span>
            </div>
            <div class="stat">
              <span class="stat-num">{analytics.fk.billedHours}<span class="stat-unit">h</span></span>
              <span class="stat-lbl">Billed hours</span>
            </div>
          </div>
        </article>
      </div>

      <div class="heatmap">
        <div class="heatmap-head">
          <span class="heatmap-title">Past 14 days - completion score</span>
          <div class="heatmap-legend">
            <span><i class="hm-dot hm-ontime"></i> on time</span>
            <span><i class="hm-dot hm-late"></i> late</span>
            <span><i class="hm-dot hm-verylate"></i> very late</span>
            <span><i class="hm-dot hm-none"></i> no activity</span>
          </div>
        </div>
        <div class="heatmap-row">
          {#each analytics.heatmap as cell (cell.date)}
            <div class="hm-cell hm-{cell.score}" title="{cell.date} - {cell.score}"></div>
          {/each}
        </div>
      </div>
    {/if}
  </section>

  <!-- ----- Up Next smart queue ---------------------------- -->
  <section class="upnext" aria-labelledby="upnext-h">
    <div class="section-head">
      <h2 id="upnext-h" class="section-title">Up Next</h2>
      {#if upNextItems.length > 0}
        <span class="section-count">{upNextItems.length}</span>
      {/if}
      <span class="section-sub">Tap any ticket to plan it</span>
    </div>

    {#if loading && !rawData}
      <div class="skel-list" aria-busy="true">
        {#each Array(4) as _, i (i)}
          <div class="skel-card skel-card--sm"></div>
        {/each}
      </div>
    {:else if upNextItems.length === 0}
      <div class="empty empty--sm">
        <p class="empty-msg">No other open tickets assigned to {userView}.</p>
      </div>
    {:else}
      <ul class="upnext-list">
        {#each upNextItems.slice(0, queueShown) as item (`${item.type}:${item.id}`)}
          <li class="upnext-row">
            <span class="upnext-pri-dot upnext-pri-dot--{item.priority || 'none'}"
                  title="Priority: {item.priority || 'none'}"></span>
            {#if item.client}
              <span class="upnext-client">{item.client}</span>
            {:else}
              <span class="upnext-client upnext-client--empty">-</span>
            {/if}
            <button
              type="button"
              class="upnext-title"
              onclick={() => openDrawer(item)}
              title="Open planner"
            >{item.title}</button>
            {#if item.due}
              <span
                class="upnext-due"
                class:is-overdue={item.due < todayISO}
                class:is-today={item.due === todayISO}
              >{fmtShort(item.due)}</span>
            {:else}
              <span class="upnext-due upnext-due--none">No date</span>
            {/if}
            <button
              type="button"
              class="upnext-plan"
              onclick={() => openDrawer(item)}
              title="Open planner drawer"
            >Plan →</button>
          </li>
        {/each}
      </ul>
      {#if upNextItems.length > queueShown}
        <div class="upnext-more">
          <button
            type="button"
            class="glass-btn glass-btn--ghost glass-btn--sm"
            onclick={() => (queueShown += 10)}
          >Show more ({upNextItems.length - queueShown} remaining)</button>
        </div>
      {/if}
    {/if}
  </section>

  <!-- ----- Calendar sync banner ---------------------------- -->
  <section class="cal-banner" aria-label="Calendar synchronization">
    <div class="cal-text">
      <span class="cal-icon">cal</span>
      <span class="cal-msg">
        {#if calendarSyncState === "synced"}
          {calendarSyncMsg || "Synced to claudio@c2moviez.com calendar"}
        {:else if calendarSyncState === "error"}
          Sync failed: {calendarSyncMsg}
        {:else}
          {kpis.hoursToday.toFixed(1)}h scheduled today across {todaySchedule.filter(i => i.slot).length} slots. Push to calendar?
        {/if}
      </span>
    </div>
    <div class="cal-actions">
      {#if calendarSyncState === "synced"}
        <span class="cal-check">✓ Synced</span>
        <button
          type="button"
          class="glass-btn glass-btn--ghost glass-btn--sm"
          onclick={syncToCalendar}
        >Re-sync</button>
      {:else}
        <button
          type="button"
          class="glass-btn glass-btn--sm"
          onclick={syncToCalendar}
          disabled={calendarSyncState === "syncing" || kpis.hoursToday === 0}
        >
          {calendarSyncState === "syncing" ? "Syncing..." : "Sync to Calendar"}
        </button>
      {/if}
    </div>
  </section>
</div>

<!-- ----- Ticket planning drawer (portal-rendered) ------- -->
<TicketPlannerDrawer
  ticket={drawerTicket}
  existingBlocks={drawerBlocks}
  onClose={closeDrawer}
  onPlanned={handlePlanned}
/>

<style>
  .focus-page {
    display: flex;
    flex-direction: column;
    gap: 22px;
    padding-bottom: 80px;
    color: var(--ink);
  }

  /* ----- Page header ----- */
  .page-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }
  .head-left { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .head-right { display: flex; align-items: center; gap: 12px; }
  .caption {
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 10.5px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--ink-3);
  }
  .hello {
    margin: 0;
    font: 700 30px/1.1 "Space Grotesk", "Inter", sans-serif;
    color: var(--ink);
    letter-spacing: -0.01em;
  }
  .today-label {
    margin: 0;
    font-size: 13px;
    color: var(--ink-2);
    display: inline-flex;
    align-items: center;
    gap: 10px;
  }
  .clock-dot {
    display: inline-block;
    width: 6px; height: 6px;
    background: #56bcec;
    border-radius: 50%;
    box-shadow: 0 0 8px rgba(86,188,236,0.6);
    animation: pulse 2.4s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 0.55; transform: scale(1); }
    50%      { opacity: 1;    transform: scale(1.25); }
  }
  .clock-time {
    font-family: "JetBrains Mono", monospace;
    font-size: 12px;
    color: var(--ink-2);
    letter-spacing: 0.03em;
  }

  .user-toggle {
    display: inline-flex;
    padding: 3px;
    border-radius: 999px;
    background: var(--glass-chrome);
    border: 1px solid var(--brand-line);
    backdrop-filter: var(--blur-chrome);
    -webkit-backdrop-filter: var(--blur-chrome);
  }
  .user-toggle-btn {
    appearance: none;
    border: 0;
    background: transparent;
    color: var(--ink-3);
    font: 700 11px/1 "JetBrains Mono", monospace;
    letter-spacing: 0.1em;
    padding: 8px 14px;
    border-radius: 999px;
    cursor: pointer;
    transition: background 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;
  }
  .user-toggle-btn:hover { color: var(--ink); }
  .user-toggle-btn.is-active {
    background: #56bcec;
    color: #fff;
    box-shadow: 0 4px 16px rgba(86,188,236,0.35);
  }

  /* ----- KPI strip ----- */
  .kpi-strip {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 12px;
  }
  .chip {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 14px 18px;
    border-radius: var(--r2, 16px);
    border: 1px solid var(--brand-line);
    background: var(--glass-chrome);
    backdrop-filter: var(--blur-chrome);
    -webkit-backdrop-filter: var(--blur-chrome);
    box-shadow: var(--sh-card);
    transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
  }
  .chip:hover {
    border-color: var(--brand-line-2);
    box-shadow: var(--sh-card-hover);
    transform: translateY(-1px);
  }
  .chip--danger { border-color: rgba(217,59,59,0.32); }
  .chip--danger .chip-num { color: var(--danger); }
  .chip--warn { border-color: rgba(217,163,0,0.32); }
  .chip--warn .chip-num { color: var(--warn); }
  .chip--ok { border-color: rgba(26,166,99,0.32); }
  .chip--ok .chip-num { color: var(--success); }
  .chip--cyan { border-color: rgba(86,188,236,0.4); }
  .chip--cyan .chip-num { color: #56bcec; }
  .chip-num {
    font: 700 28px/1 "Space Grotesk", sans-serif;
    color: var(--ink);
    letter-spacing: -0.02em;
  }
  .chip-unit {
    font-size: 14px;
    color: var(--ink-3);
    margin-left: 2px;
  }
  .chip-lbl {
    font-size: 11px;
    letter-spacing: 0.06em;
    color: var(--ink-3);
    text-transform: uppercase;
  }

  /* ----- Section heads ----- */
  .section-head {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin-bottom: 12px;
  }
  .section-title {
    margin: 0;
    font: 600 17px/1.2 "Space Grotesk", sans-serif;
    color: var(--ink);
    letter-spacing: -0.01em;
  }
  .section-count {
    font-family: "JetBrains Mono", monospace;
    font-size: 11px;
    color: var(--ink-3);
    padding: 1px 8px;
    border-radius: 999px;
    border: 1px solid var(--brand-line);
    background: var(--brand-soft);
  }
  .section-sub {
    font-size: 11.5px;
    color: var(--ink-3);
    font-style: italic;
    margin-left: auto;
  }

  /* ----- Focus card ----- */
  .focus-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .focus-card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px 18px 14px;
    border-radius: var(--r2, 16px);
    border: 1px solid var(--brand-line);
    background: var(--glass-chrome);
    backdrop-filter: var(--blur-chrome);
    -webkit-backdrop-filter: var(--blur-chrome);
    box-shadow: var(--sh-card);
    transition: border-color 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease;
    animation: card-in 360ms var(--ease, cubic-bezier(0.22,1,0.36,1)) both;
    animation-delay: var(--enter-delay, 0ms);
  }
  .focus-card:hover {
    border-color: var(--brand-line-2);
    transform: translateY(-1px);
    box-shadow: var(--sh-card-hover);
  }
  .focus-card.status-done { opacity: 0.55; }
  .focus-card.status-not_done { border-color: rgba(217,163,0,0.4); }
  .focus-card.is-escalated { border-color: rgba(217,59,59,0.6); }
  .focus-card.is-overdue { border-left: 3px solid rgba(239,68,68,0.7); }
  .focus-card.is-today   { border-left: 3px solid #56bcec; }
  /* Planned: purple left border overrides the red overdue state */
  .focus-card.is-planned { border-left: 3px solid #7c3aed; border-color: rgba(124,58,237,0.35); background: rgba(124,58,237,0.04); }
  .focus-card.is-planned:hover { border-color: rgba(124,58,237,0.55); }
  /* Deferred (heavy-day overflow) cards: muted, dashed border */
  .focus-card.is-deferred {
    opacity: 0.72;
    border-style: dashed;
    border-color: rgba(217,163,0,0.35);
    background: var(--brand-softer);
  }
  .focus-card.is-deferred:hover { opacity: 0.9; }
  @keyframes card-in {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .card-top {
    display: grid;
    grid-template-columns: 36px 32px 1fr auto;
    align-items: center;
    gap: 14px;
  }
  .card-bottom {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .rank {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: linear-gradient(135deg, #56bcec, #7c3aed);
    color: #fff;
    display: grid;
    place-items: center;
    font: 700 13px/1 "Space Grotesk", sans-serif;
    box-shadow: 0 0 0 4px var(--brand-soft);
  }
  .src {
    width: 30px;
    height: 30px;
    border-radius: 9px;
    display: grid;
    place-items: center;
    font: 700 12px/1 "JetBrains Mono", monospace;
    background: var(--canvas-2);
    border: 1px solid var(--line);
    color: var(--ink-2);
  }
  .src[data-type="ticket"]  { color: #56bcec; border-color: rgba(86,188,236,0.4); }
  .src[data-type="meeting"] { color: #7B5CFF; border-color: rgba(123,92,255,0.4); }
  .src[data-type="finance"] { color: var(--success); border-color: rgba(26,166,99,0.35); }
  .src[data-type="client"]  { color: var(--warn); border-color: rgba(217,163,0,0.35); }
  .body { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
  .title-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .title {
    font: 600 14.5px/1.35 "Inter", sans-serif;
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }
  .client-tag, .assignee-tag {
    font-family: "JetBrains Mono", monospace;
    font-size: 10px;
    letter-spacing: 0.08em;
    color: var(--ink-3);
    padding: 1px 7px;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: var(--canvas-2);
  }
  .assignee-tag {
    color: #7B5CFF;
    border-color: rgba(123,92,255,0.3);
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .reason {
    font-style: italic;
    font-size: 12.5px;
    color: var(--ink-3);
  }
  .prio {
    font-family: "JetBrains Mono", monospace;
    font-size: 9.5px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 1px 7px;
    border-radius: 999px;
    border: 1px solid var(--line);
  }
  .prio-urgent { color: var(--danger);  border-color: rgba(217,59,59,0.35); }
  .prio-high   { color: var(--warn);    border-color: rgba(217,163,0,0.35); }
  .prio-medium { color: var(--ink-2);   }
  .prio-low    { color: var(--ink-3);   }
  .status-pill {
    font-family: "JetBrains Mono", monospace;
    font-size: 9.5px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 1px 7px;
    border-radius: 999px;
    border: 1px solid var(--line);
    color: var(--ink-3);
  }
  .status-pill-in_progress { color: #56bcec; border-color: rgba(86,188,236,0.4); background: rgba(86,188,236,0.08); }
  .status-pill-planned { color: #7c3aed; border-color: rgba(124,58,237,0.4); background: rgba(124,58,237,0.08); }
  .status-pill-done { color: var(--success); border-color: rgba(26,166,99,0.35); }
  .status-pill-not_done { color: var(--warn); border-color: rgba(217,163,0,0.35); }
  .resched-pill {
    font-family: "JetBrains Mono", monospace;
    font-size: 9.5px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 1px 7px;
    border-radius: 999px;
    border: 1px solid var(--brand-line);
    color: var(--ink-3);
    background: var(--brand-soft);
  }
  .resched-pill.is-warn { color: var(--danger); border-color: rgba(217,59,59,0.5); background: rgba(217,59,59,0.08); }

  /* Reschedule suggestion pill (heavy-day overflow items) */
  .resched-suggest-pill {
    font-family: "JetBrains Mono", monospace;
    font-size: 9.5px;
    letter-spacing: 0.06em;
    padding: 2px 8px;
    border-radius: 999px;
    border: 1px solid rgba(217,163,0,0.5);
    color: var(--warn);
    background: rgba(217,163,0,0.08);
  }

  /* Calendar match pill - auto-detected calendar entry for this ticket */
  .cal-match-pill {
    font-family: "JetBrains Mono", monospace;
    font-size: 9.5px;
    letter-spacing: 0.05em;
    padding: 2px 8px;
    border-radius: 999px;
    border: 1px solid rgba(124,58,237,0.5);
    color: #7c3aed;
    background: rgba(124,58,237,0.09);
  }

  /* Smart slot suggestion pill */
  .slot-suggest-pill {
    font-family: "JetBrains Mono", monospace;
    font-size: 9px;
    letter-spacing: 0.05em;
    padding: 1px 7px;
    border-radius: 999px;
    border: 1px dashed rgba(86,188,236,0.4);
    color: #56bcec;
    background: rgba(86,188,236,0.06);
  }

  /* High-MRR client badge */
  .mrr-badge {
    font-family: "JetBrains Mono", monospace;
    font-size: 9px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 1px 6px;
    border-radius: 999px;
    border: 1px solid rgba(26,166,99,0.4);
    color: var(--success);
    background: rgba(26,166,99,0.07);
  }

  /* Day-load indicator (section header) */
  .dayload-indicator {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 10px;
    border-radius: 999px;
    border: 1px solid var(--brand-line);
    background: var(--brand-softer);
    cursor: default;
  }
  .dayload-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .dayload-label {
    font-family: "JetBrains Mono", monospace;
    font-size: 9.5px;
    letter-spacing: 0.06em;
    white-space: nowrap;
  }
  /* Green: light day */
  .dayload-indicator--green .dayload-dot  { background: #1aa663; box-shadow: 0 0 6px rgba(26,166,99,0.6); }
  .dayload-indicator--green .dayload-label { color: var(--success); }
  .dayload-indicator--green { border-color: rgba(26,166,99,0.35); background: rgba(26,166,99,0.06); }
  /* Yellow: mixed day */
  .dayload-indicator--yellow .dayload-dot  { background: #d9a300; box-shadow: 0 0 6px rgba(217,163,0,0.55); }
  .dayload-indicator--yellow .dayload-label { color: var(--warn); }
  .dayload-indicator--yellow { border-color: rgba(217,163,0,0.4); background: rgba(217,163,0,0.06); }
  /* Red: heavy production day */
  .dayload-indicator--red .dayload-dot  { background: #d93b3b; box-shadow: 0 0 6px rgba(217,59,59,0.6); }
  .dayload-indicator--red .dayload-label { color: var(--danger); }
  .dayload-indicator--red { border-color: rgba(217,59,59,0.4); background: rgba(217,59,59,0.06); }

  /* Heavy-day warning banner */
  .heavy-day-banner {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 14px;
    padding: 11px 16px;
    border-radius: 12px;
    border: 1px solid rgba(217,59,59,0.35);
    background: rgba(217,59,59,0.07);
  }
  .heavy-day-icon {
    width: 32px;
    height: 32px;
    flex-shrink: 0;
    border-radius: 8px;
    background: rgba(217,59,59,0.15);
    border: 1px solid rgba(217,59,59,0.4);
    color: var(--danger);
    display: grid;
    place-items: center;
    font: 700 9px/1 "JetBrains Mono", monospace;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .heavy-day-msg {
    font-size: 12.5px;
    color: var(--danger);
    font-style: italic;
  }

  /* slot + hours block */
  .slot-block {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 6px;
    min-width: 140px;
  }
  .slot-chip {
    appearance: none;
    border: 1px solid rgba(86,188,236,0.4);
    background: rgba(86,188,236,0.1);
    color: #56bcec;
    font: 700 12px/1 "JetBrains Mono", monospace;
    padding: 6px 12px;
    border-radius: 999px;
    cursor: pointer;
    transition: background 0.16s ease, border-color 0.16s ease;
  }
  .slot-chip:hover {
    background: rgba(86,188,236,0.18);
    border-color: #56bcec;
  }
  .slot-chip--empty {
    cursor: default;
    color: var(--ink-3);
    background: transparent;
    border-color: var(--line);
    font-weight: 500;
    letter-spacing: 0.06em;
  }
  .hours-chip {
    appearance: none;
    border: 1px dashed var(--brand-line);
    background: transparent;
    color: var(--ink-2);
    font: 500 12px/1 "JetBrains Mono", monospace;
    padding: 6px 10px;
    border-radius: 8px;
    cursor: pointer;
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    transition: border-color 0.16s ease, color 0.16s ease, background 0.16s ease;
  }
  .hours-chip:hover {
    border-color: #56bcec;
    color: #56bcec;
    background: rgba(86,188,236,0.06);
  }
  .hours-val { color: var(--ink); font-weight: 700; }
  .hours-placeholder { color: var(--ink-3); }
  .hours-tracked { color: var(--ink-3); font-size: 10.5px; }
  .hours-edit {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border: 1px solid #56bcec;
    border-radius: 8px;
    background: rgba(86,188,236,0.08);
    padding: 4px 8px;
  }
  .hours-input {
    appearance: none;
    background: transparent;
    border: 0;
    outline: none;
    color: var(--ink);
    font: 700 12px/1 "JetBrains Mono", monospace;
    width: 42px;
    text-align: right;
  }
  .hours-suffix {
    color: var(--ink-3);
    font: 500 11px/1 "JetBrains Mono", monospace;
  }

  /* progress + actions */
  .progress-rail {
    flex: 1;
    height: 4px;
    border-radius: 999px;
    background: var(--canvas-2);
    border: 1px solid var(--line);
    overflow: hidden;
  }
  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #56bcec, #7c3aed);
    transition: width 0.4s ease;
  }
  .actions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .glass-btn--success {
    border-color: rgba(26,166,99,0.35) !important;
    color: var(--success) !important;
    background: rgba(26,166,99,0.08) !important;
  }
  .glass-btn--success:hover {
    border-color: rgba(26,166,99,0.6) !important;
    background: rgba(26,166,99,0.18) !important;
  }
  .glass-btn--plan {
    border-color: rgba(124,58,237,0.35) !important;
    color: #7c3aed !important;
    background: rgba(124,58,237,0.08) !important;
  }
  .glass-btn--plan:hover {
    border-color: rgba(124,58,237,0.6) !important;
    background: rgba(124,58,237,0.18) !important;
  }
  .not-done-btn {
    color: var(--warn) !important;
  }

  /* why-not capture */
  .why-capture {
    margin-top: 4px;
    padding: 10px 12px;
    border-radius: 12px;
    border: 1px solid rgba(217,163,0,0.4);
    background: rgba(217,163,0,0.06);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .why-label {
    font: 600 11.5px/1 "Inter", sans-serif;
    color: var(--warn);
    letter-spacing: 0.04em;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .why-window {
    font-family: "JetBrains Mono", monospace;
    font-size: 9.5px;
    color: var(--ink-3);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 1px 6px;
    border-radius: 999px;
    border: 1px solid var(--line);
  }
  .why-input-row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .why-input {
    flex: 1;
    min-width: 200px;
    background: var(--canvas-2);
    border: 1px solid var(--line);
    border-radius: 8px;
    color: var(--ink);
    font: 400 13px/1.4 "Inter", sans-serif;
    padding: 8px 10px;
  }
  .why-input:focus {
    outline: none;
    border-color: #56bcec;
    box-shadow: 0 0 0 3px rgba(86,188,236,0.15);
  }

  .prev-reason {
    font-size: 11.5px;
    color: var(--ink-3);
    display: inline-flex;
    gap: 6px;
    align-items: baseline;
    padding: 4px 0;
  }
  .prev-reason-lbl {
    font-family: "JetBrains Mono", monospace;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 9.5px;
    color: var(--ink-3);
  }
  .prev-reason-val {
    font-style: italic;
    color: var(--ink-2);
  }

  /* ----- Week table ----- */
  .week-table {
    border-radius: var(--r2, 16px);
    border: 1px solid var(--brand-line);
    background: var(--glass-chrome);
    backdrop-filter: var(--blur-chrome);
    -webkit-backdrop-filter: var(--blur-chrome);
    overflow: hidden;
  }
  .week-thead {
    display: grid;
    grid-template-columns: 130px 100px 1fr 140px 70px;
    gap: 12px;
    padding: 10px 16px;
    font-family: "JetBrains Mono", monospace;
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--ink-3);
    border-bottom: 1px solid var(--line);
    background: var(--brand-softer);
  }
  .week-thead .num { text-align: right; }
  .week-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }
  .week-row {
    display: grid;
    grid-template-columns: 130px 100px 1fr 140px 70px;
    gap: 12px;
    padding: 11px 16px;
    align-items: center;
    border-top: 1px solid var(--line);
    transition: background 0.14s ease;
  }
  .week-row:first-child { border-top: 0; }
  .week-row:hover { background: var(--brand-softer); }
  .week-date {
    font-family: "JetBrains Mono", monospace;
    font-size: 11.5px;
    color: var(--ink-2);
  }
  .week-src {
    font-family: "JetBrains Mono", monospace;
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-3);
    padding: 2px 8px;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: var(--canvas-2);
    width: fit-content;
  }
  .week-src[data-type="ticket"]  { color: #56bcec; border-color: rgba(86,188,236,0.35); }
  .week-src[data-type="meeting"] { color: #7B5CFF; border-color: rgba(123,92,255,0.35); }
  .week-src[data-type="finance"] { color: var(--success); border-color: rgba(26,166,99,0.3); }
  .week-title {
    appearance: none;
    background: transparent;
    border: 0;
    text-align: left;
    padding: 0;
    cursor: pointer;
    font-size: 13px;
    color: var(--ink);
    text-decoration: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    transition: color 0.14s ease;
  }
  .week-title:hover { color: #56bcec; }
  .week-client {
    font-family: "JetBrains Mono", monospace;
    font-size: 10.5px;
    color: var(--ink-3);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .week-hours {
    font-family: "JetBrains Mono", monospace;
    font-size: 12px;
    color: var(--ink-2);
    text-align: right;
  }

  /* ----- Analytics ----- */
  .section-toggle {
    appearance: none;
    background: none;
    border: 0;
    padding: 0;
    margin: 0 0 12px;
    display: flex;
    align-items: baseline;
    gap: 10px;
    width: 100%;
    cursor: pointer;
    color: var(--ink);
  }
  .toggle-arrow {
    color: var(--ink-3);
    font-size: 12px;
    transition: transform 0.18s ease;
  }
  .toggle-arrow.is-open { transform: rotate(180deg); }

  .analytics-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-bottom: 14px;
  }
  .stat-panel {
    padding: 16px 18px;
    border-radius: var(--r2, 16px);
    border: 1px solid var(--brand-line);
    background: var(--glass-chrome);
    backdrop-filter: var(--blur-chrome);
    -webkit-backdrop-filter: var(--blur-chrome);
    box-shadow: var(--sh-card);
    transition: border-color 0.18s ease, box-shadow 0.18s ease;
  }
  .stat-panel.is-active {
    border-color: rgba(86,188,236,0.5);
    box-shadow: 0 0 0 1px rgba(86,188,236,0.3), var(--sh-card-hover);
  }
  .stat-head {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin-bottom: 14px;
  }
  .stat-who {
    font: 800 13px/1 "JetBrains Mono", monospace;
    letter-spacing: 0.12em;
    color: #56bcec;
  }
  .stat-name {
    font: 500 12px/1 "Inter", sans-serif;
    color: var(--ink-2);
  }
  .stat-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }
  .stat {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 10px 12px;
    border-radius: 10px;
    background: var(--brand-softer);
    border: 1px solid var(--line);
  }
  .stat-num {
    font: 700 20px/1 "Space Grotesk", sans-serif;
    color: var(--ink);
    letter-spacing: -0.02em;
  }
  .stat-unit {
    font-size: 11px;
    color: var(--ink-3);
    margin-left: 2px;
  }
  .stat-lbl {
    font: 500 10.5px/1 "JetBrains Mono", monospace;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-3);
  }

  /* heatmap */
  .heatmap {
    padding: 14px 16px;
    border-radius: var(--r2, 16px);
    border: 1px solid var(--brand-line);
    background: var(--glass-chrome);
    backdrop-filter: var(--blur-chrome);
    -webkit-backdrop-filter: var(--blur-chrome);
    box-shadow: var(--sh-card);
  }
  .heatmap-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
    flex-wrap: wrap;
    gap: 10px;
  }
  .heatmap-title {
    font: 600 12px/1 "Inter", sans-serif;
    color: var(--ink-2);
  }
  .heatmap-legend {
    display: inline-flex;
    gap: 14px;
    font-size: 10.5px;
    color: var(--ink-3);
    font-family: "JetBrains Mono", monospace;
    letter-spacing: 0.04em;
  }
  .heatmap-legend span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .hm-dot {
    display: inline-block;
    width: 9px; height: 9px;
    border-radius: 3px;
  }
  .heatmap-row {
    display: grid;
    grid-template-columns: repeat(14, 1fr);
    gap: 6px;
  }
  .hm-cell {
    height: 28px;
    border-radius: 6px;
    border: 1px solid var(--line);
    transition: transform 0.14s ease, box-shadow 0.14s ease;
  }
  .hm-cell:hover { transform: scale(1.08); box-shadow: 0 0 0 2px var(--brand-soft); }
  .hm-ontime    { background: rgba(26,166,99,0.45);  border-color: rgba(26,166,99,0.6); }
  .hm-late      { background: rgba(217,163,0,0.45);  border-color: rgba(217,163,0,0.6); }
  .hm-verylate  { background: rgba(217,59,59,0.45);  border-color: rgba(217,59,59,0.6); }
  .hm-none      { background: var(--canvas-2);       border-color: var(--line); }

  /* ----- Calendar banner ----- */
  .cal-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 18px;
    border-radius: var(--r2, 16px);
    border: 1px solid var(--brand-line);
    background: linear-gradient(135deg, rgba(86,188,236,0.08), rgba(124,58,237,0.06));
    backdrop-filter: var(--blur-chrome);
    -webkit-backdrop-filter: var(--blur-chrome);
    box-shadow: var(--sh-card);
    gap: 14px;
    flex-wrap: wrap;
  }
  .cal-text {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    flex: 1;
    min-width: 0;
  }
  .cal-icon {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    background: rgba(86,188,236,0.15);
    border: 1px solid rgba(86,188,236,0.4);
    color: #56bcec;
    display: grid;
    place-items: center;
    font: 700 10px/1 "JetBrains Mono", monospace;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .cal-msg {
    font-size: 13px;
    color: var(--ink-2);
  }
  .cal-actions { display: inline-flex; gap: 8px; align-items: center; }
  .cal-check {
    color: var(--success);
    font: 700 12px/1 "JetBrains Mono", monospace;
    letter-spacing: 0.06em;
  }

  /* ----- Empty / skeletons ----- */
  .empty {
    padding: 28px 18px;
    text-align: center;
    border-radius: var(--r2, 16px);
    border: 1px dashed var(--line-2);
    background: var(--brand-softer);
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-items: center;
  }
  .empty--sm { padding: 18px; }
  .empty-msg { margin: 0; color: var(--ink-2); font-size: 13px; }
  .empty--clear { padding: 36px 18px; }
  .empty-check {
    width: 56px; height: 56px; border-radius: 50%;
    display: grid; place-items: center;
    font: 700 28px/1 "JetBrains Mono", monospace;
    color: var(--success, #1aa663);
    background: rgba(26,166,99,0.08);
    border: 1px solid rgba(26,166,99,0.30);
  }
  .empty-title {
    margin: 0;
    font: 600 16px/1.2 "Space Grotesk", sans-serif;
    color: var(--ink);
  }
  .skel-list { display: flex; flex-direction: column; gap: 10px; }
  .skel-card {
    height: 90px;
    border-radius: var(--r2, 16px);
    background: linear-gradient(
      90deg,
      var(--brand-softer) 0%,
      var(--brand-soft) 50%,
      var(--brand-softer) 100%
    );
    background-size: 200% 100%;
    animation: skel-shimmer 1.4s ease-in-out infinite;
  }
  .skel-card--sm { height: 44px; }
  @keyframes skel-shimmer {
    0%   { background-position: 100% 0; }
    100% { background-position: -100% 0; }
  }

  /* ----- Title button (clickable ticket title) ----- */
  .title-btn {
    appearance: none;
    background: transparent;
    border: 0;
    padding: 0;
    text-align: left;
    cursor: pointer;
    color: var(--ink);
    transition: color 0.14s ease;
  }
  .title-btn:hover { color: #56bcec; }

  /* ----- Up Next queue ----- */
  .upnext {
    border-radius: var(--r2, 16px);
    background: var(--brand-softer);
    border: 1px solid var(--line-2);
    overflow: hidden;
  }
  .upnext-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }
  .upnext-row {
    display: grid;
    grid-template-columns: 14px 78px 1fr 100px auto;
    align-items: center;
    gap: 12px;
    padding: 11px 16px;
    border-top: 1px solid var(--line-2);
    transition: background 0.14s ease;
  }
  .upnext-row:first-child { border-top: 0; }
  .upnext-row:hover { background: var(--brand-soft); }

  .upnext-pri-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #6b7280;
    box-shadow: 0 0 6px rgba(0, 0, 0, 0.5);
  }
  .upnext-pri-dot--urgent { background: #ef4444; box-shadow: 0 0 8px rgba(239, 68, 68, 0.7); }
  .upnext-pri-dot--high   { background: #f97316; box-shadow: 0 0 8px rgba(249, 115, 22, 0.55); }
  .upnext-pri-dot--medium { background: #eab308; }
  .upnext-pri-dot--low    { background: #94a3b8; }
  .upnext-pri-dot--none   { background: #475569; }

  .upnext-client {
    font: 700 10px/1 "JetBrains Mono", monospace;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #56bcec;
    padding: 3px 8px;
    border-radius: 999px;
    border: 1px solid rgba(86, 188, 236, 0.3);
    background: rgba(86, 188, 236, 0.06);
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .upnext-client--empty {
    color: var(--ink-3);
    border-color: var(--line-2);
    background: transparent;
  }

  .upnext-title {
    appearance: none;
    background: transparent;
    border: 0;
    text-align: left;
    color: var(--ink);
    font: 500 13px/1.35 "Inter", sans-serif;
    cursor: pointer;
    padding: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    transition: color 0.14s ease;
  }
  .upnext-title:hover { color: #56bcec; }

  .upnext-due {
    font: 500 11.5px/1 "JetBrains Mono", monospace;
    color: var(--ink-2);
    white-space: nowrap;
    text-align: right;
  }
  .upnext-due.is-overdue { color: var(--danger, #ef4444); font-weight: 600; }
  .upnext-due.is-today { color: #56bcec; font-weight: 600; }
  .upnext-due--none { color: var(--ink-3); font-style: italic; }

  .upnext-plan {
    appearance: none;
    background: rgba(86, 188, 236, 0.12);
    border: 1px solid rgba(86, 188, 236, 0.4);
    color: #56bcec;
    font: 700 11px/1 "JetBrains Mono", monospace;
    letter-spacing: 0.06em;
    padding: 6px 12px;
    border-radius: 999px;
    cursor: pointer;
    transition: background 0.14s ease, border-color 0.14s ease, color 0.14s ease;
  }
  .upnext-plan:hover {
    background: rgba(86, 188, 236, 0.22);
    border-color: #56bcec;
    color: #fff;
  }

  .upnext-more {
    padding: 12px 16px 14px;
    display: flex;
    justify-content: center;
    border-top: 1px solid var(--line-2);
  }

  /* ----- Mobile ----- */
  @media (max-width: 960px) {
    .kpi-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .kpi-strip .chip:nth-child(5) { grid-column: 1 / -1; }
    .analytics-grid { grid-template-columns: 1fr; }
    .week-thead, .week-row {
      grid-template-columns: 110px 90px 1fr 60px;
    }
    .week-thead span:nth-child(4),
    .week-row .week-client { display: none; }
  }
  @media (max-width: 960px) {
    .upnext-row {
      grid-template-columns: 12px 70px 1fr auto;
      gap: 10px;
    }
    .upnext-row .upnext-due { display: none; }
  }
  @media (max-width: 720px) {
    .upnext-row {
      grid-template-columns: 12px 1fr auto;
      gap: 8px;
    }
    .upnext-row .upnext-client { display: none; }
    .card-top {
      grid-template-columns: 32px 28px 1fr;
      grid-template-areas:
        "rank src body"
        "slot slot slot";
      row-gap: 10px;
    }
    .card-top .rank { grid-area: rank; }
    .card-top .src { grid-area: src; }
    .card-top .body { grid-area: body; }
    .card-top .slot-block {
      grid-area: slot;
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
      min-width: 0;
    }
    .card-bottom { flex-direction: column; align-items: stretch; }
    .actions { justify-content: flex-end; }
    .hello { font-size: 24px; }
    .heatmap-row { grid-template-columns: repeat(7, 1fr); }
  }

  /* ----- TEAM tab variant ----- */
  .user-toggle-btn--team {
    color: #7B5CFF;
  }
  .user-toggle-btn--team.is-active {
    background: rgba(123,92,255,0.15);
    border-color: rgba(123,92,255,0.5);
    color: #a78bfa;
  }

  /* ----- Compact status actions (replaces full actions row) ----- */
  .card-status-actions {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-shrink: 0;
  }
  .glass-btn--xs {
    padding: 3px 10px;
    font-size: 11px;
    border-radius: 999px;
  }

  /* ----- Up Next section-head padding fix ----- */
  .upnext .section-head {
    padding: 14px 16px 0;
  }

  /* ----- Reduced motion ----- */
  @media (prefers-reduced-motion: reduce) {
    .focus-card { animation: none; }
    .skel-card  { animation: none; }
    .clock-dot  { animation: none; }
  }
</style>

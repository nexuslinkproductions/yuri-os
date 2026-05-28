<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import {
    listEntityState, recentAudit, subscribeEntityState, subscribeAuditLog,
    supabase, hasClient,
    type EntityState, type AuditRow,
  } from "$lib/db";
  import LiveBadge from "$components/LiveBadge.svelte";
  import { toast } from "$components/GlassToast.svelte";
  import { goto } from "$app/navigation";
  import ClientDrawer from "$components/ClientDrawer.svelte";

  type Heartbeat = {
    agent_name: string;
    last_action: string | null;
    last_action_at: string | null;
    confidence: number | null;
    status: string | null;
  };
  type DecisionRow = {
    id: string;
    decision: string | null;
    outcome: string | null;
    decided_at: string | null;
    recommended_by: string | null;
    tags: string[] | null;
    client_code?: string | null;
  };
  type CommitmentRow = {
    id: string;
    promise: string | null;
    due_at: string | null;
    status: string | null;
    entity_id: string | null;
  };
  type InferenceRow = {
    id: number;
    occurred_at: string;
    endpoint: string;
    model: string | null;
    prompt_tokens: number | null;
    completion_tokens: number | null;
    total_tokens: number | null;
    latency_ms: number | null;
    caller: string | null;
    status: string;
  };
  type ActiveAdapter = {
    model_family: string;
    adapter_id: string | null;
    adapter_path: string | null;
    promoted_at: string | null;
    notes: string | null;
    updated_at: string;
  };

  let tickets    = $state<EntityState[]>([]);
  let clients    = $state<EntityState[]>([]);
  let meetings   = $state<EntityState[]>([]);
  let audit      = $state<AuditRow[]>([]);
  let heartbeats = $state<Heartbeat[]>([]);
  let decisions  = $state<DecisionRow[]>([]);
  let commitments = $state<CommitmentRow[]>([]);
  let embeddingCount = $state(0);
  let inferenceLog = $state<InferenceRow[]>([]);
  let activeAdapters = $state<ActiveAdapter[]>([]);
  let aiMonRefreshedAt = $state(Date.now());
  let loading    = $state(true);

  // RailGuard widget state
  type RgEvent = { ts: string; rail: string; action: string; reason: string | null };
  type RgStats = { blocksToday: number; holdsToday: number; holdsPending: number; passRate24h: number };
  let rgEvents = $state<RgEvent[]>([]);
  let rgStats  = $state<RgStats | null>(null);
  let rgTick: ReturnType<typeof setInterval> | null = null;
  let now        = $state(Date.now());
  let unsubA: (() => void) | null = null;
  let unsubT: (() => void) | null = null;
  let nowTick: ReturnType<typeof setInterval> | null = null;
  let refreshTick: ReturnType<typeof setInterval> | null = null;
  let aiMonTick: ReturnType<typeof setInterval> | null = null;
  let currentUser  = $state<{ email: string; id: string } | null>(null);

  let kpiOpen      = $state(0);
  let kpiOverdue   = $state(0);
  let kpiMrr       = $state(0);
  let kpiClients   = $state(0);
  let kpiCommits   = $state(0);
  let kpiWinRate   = $state(0);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const todayFmt = new Date().toLocaleDateString("en-US", {
    timeZone: "Europe/Zurich",
    weekday: "long", month: "long", day: "numeric",
  }).toUpperCase();
  const todayISO = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Zurich" });

  function animateNumber(setter: (n: number) => void, target: number, dur = 1100) {
    if (!target || target <= 0) { setter(0); return; }
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setter(Math.round(target * eased));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  onMount(async () => {
    nowTick = setInterval(() => { now = Date.now(); }, 30000);

    const [t, c, m, a] = await Promise.all([
      listEntityState("ticket", 500),
      listEntityState("client", 200),
      listEntityState("meeting", 100),
      recentAudit(60),
    ]);
    tickets = t; clients = c; meetings = m; audit = a;

    if (hasClient()) {
      try {
        const hb = await supabase()
          .from("agent_heartbeat")
          .select("agent_name, last_action, last_action_at, confidence, status")
          .order("last_action_at", { ascending: false })
          .limit(20);
        heartbeats = (hb.data ?? []) as Heartbeat[];
      } catch (e) { console.error("[home] heartbeat", e); }

      try {
        const dc = await supabase()
          .from("decisions")
          .select("id, decision, outcome, decided_at, recommended_by, tags")
          .order("decided_at", { ascending: false })
          .limit(30);
        decisions = (dc.data ?? []) as DecisionRow[];
      } catch (e) { console.error("[home] decisions", e); }

      try {
        const cm = await supabase()
          .from("commitments")
          .select("id, promise, due_at, status, entity_id")
          .eq("status", "open")
          .order("due_at", { ascending: true })
          .limit(12);
        commitments = (cm.data ?? []) as CommitmentRow[];
      } catch (e) { console.error("[home] commitments", e); }

      try {
        const eb = await supabase()
          .from("nex_embeddings")
          .select("id", { count: "exact", head: true });
        embeddingCount = eb.count ?? 0;
      } catch (e) { console.error("[home] embeddings", e); }
    }

    // Fetch auth user for member-scoped ticket priority
    try {
      const { data: { user } } = await supabase().auth.getUser();
      if (user) currentUser = { email: user.email ?? "", id: user.id };
    } catch { /* no-op if unauthenticated */ }

    // AI Monitor initial fetch (Claudio only)
    if (currentUser?.email === "claudio@c2moviez.com") {
      await refreshAiMonitor();
      aiMonTick = setInterval(() => { refreshAiMonitor(); }, 12000);
    }

    // RailGuard widget — fetch on mount + refresh every 5s
    fetchRailguard();
    rgTick = setInterval(fetchRailguard, 5000);

    loading = false;

    queueMicrotask(() => {
      animateNumber(n => kpiOpen = n, openTickets.length, 900);
      animateNumber(n => kpiOverdue = n, overdue.length, 900);
      animateNumber(n => kpiMrr = n, mrrTotal, 1300);
      animateNumber(n => kpiClients = n, activeClients.length, 1000);
      animateNumber(n => kpiCommits = n, commitments.length, 900);
      animateNumber(n => kpiWinRate = n, winRate, 1200);
    });

    unsubT = subscribeEntityState("ticket", row => {
      tickets = [row, ...tickets.filter(x => x.entity_id !== row.entity_id)].slice(0, 500);
    });
    unsubA = subscribeAuditLog(row => {
      audit = [row, ...audit].slice(0, 60);
    });

    // Safety-net live refresh every 25s in case Realtime drops a row.
    // Keeps Command module ticket states aligned with Plane.so within 30s.
    refreshTick = setInterval(async () => {
      try {
        const fresh = await listEntityState("ticket", 500);
        if (fresh.length > 0) tickets = fresh;
      } catch (e) { console.error("[home] ticket-refresh", e); }
    }, 25000);
  });
  async function fetchRailguard() {
    try {
      const [er, sr] = await Promise.all([
        fetch("/api/railguard/events?limit=5", { credentials: "include" }),
        fetch("/api/railguard/stats", { credentials: "include" }),
      ]);
      if (er.ok) { const j = await er.json(); rgEvents = j.events ?? []; }
      if (sr.ok) rgStats = await sr.json();
    } catch { /* silently skip if API unavailable */ }
  }

  onDestroy(() => {
    unsubT?.(); unsubA?.();
    if (nowTick) clearInterval(nowTick);
    if (refreshTick) clearInterval(refreshTick);
    if (aiMonTick) clearInterval(aiMonTick);
    if (rgTick) clearInterval(rgTick);
  });

  async function refreshAiMonitor() {
    if (!hasClient()) return;
    try {
      const [il, aa, hb, dc, au] = await Promise.all([
        supabase().from("nex_local_inference_log")
          .select("id, occurred_at, endpoint, model, prompt_tokens, completion_tokens, total_tokens, latency_ms, caller, status")
          .order("occurred_at", { ascending: false }).limit(50),
        supabase().from("nex_active_adapter")
          .select("model_family, adapter_id, adapter_path, promoted_at, notes, updated_at")
          .order("updated_at", { ascending: false }),
        supabase().from("agent_heartbeat")
          .select("agent_name, last_action, last_action_at, confidence, status")
          .order("last_action_at", { ascending: false }).limit(24),
        supabase().from("decisions")
          .select("id, decision, outcome, decided_at, recommended_by, client_code, tags")
          .order("decided_at", { ascending: false }).limit(20),
        recentAudit(30),
      ]);
      inferenceLog = (il.data ?? []) as InferenceRow[];
      activeAdapters = (aa.data ?? []) as ActiveAdapter[];
      heartbeats = (hb.data ?? []) as Heartbeat[];
      decisions = (dc.data ?? []) as DecisionRow[];
      audit = au;
      aiMonRefreshedAt = Date.now();
    } catch (e) {
      console.error("[ai-monitor] refresh", e);
    }
  }

  const openTickets = $derived(
    tickets.filter(t => {
      const g = (t.state?.state_group || t.state?.state_name || "").toLowerCase();
      return !t.state?.is_done && !g.includes("complet") && !g.includes("cancel") && !g.includes("done");
    })
  );
  const overdue = $derived(
    openTickets.filter(t => t.state?.due_date && t.state.due_date < todayISO)
  );
  const mrrTotal = $derived(
    clients.reduce((s, c) => s + (Number(c.state?.monthly_revenue) || 0), 0)
  );
  const activeClients = $derived(
    clients.filter(c => {
      const stage = (c.state?.stage || c.state?.contract_status || "").toString().toLowerCase();
      return Number(c.state?.monthly_revenue) > 0 || stage.includes("active") || stage.includes("retainer");
    })
  );

  const totalOutcomed = $derived(
    decisions.filter(d => d.outcome && d.outcome !== "unknown" && d.outcome !== "pending").length
  );
  const wonCount = $derived(
    decisions.filter(d => d.outcome === "won" || d.outcome === "actioned" || d.outcome === "kept").length
  );
  const winRate = $derived(
    totalOutcomed > 0 ? Math.round((wonCount / totalOutcomed) * 100) : 0
  );

  const todayMeetings = $derived(
    meetings.filter(m => {
      const s = m.state?.start;
      return s && new Date(s).toLocaleDateString("sv-SE", { timeZone: "Europe/Zurich" }) === todayISO;
    })
  );

  const myTickets = $derived((() => {
    const email = currentUser?.email?.toLowerCase() ?? "";
    const tokens = USER_ASSIGNEE_TOKENS[email] ?? [];
    if (!tokens.length) return openTickets;
    const mine = openTickets.filter(t => {
      const assignees = ((t.state?.assignees as string[]) || []);
      return assignees.some(a => tokens.some(tok => String(a).toLowerCase().includes(tok)));
    });
    return mine.length ? mine : openTickets;
  })());

  const topPriority = $derived((() => {
    const rank = { urgent: 0, high: 1, medium: 2, low: 3 };
    const src = myTickets;
    const today = src.filter(t => t.state?.due_date === todayISO);
    if (today.length) {
      today.sort((a, b) => (rank[(a.state?.priority||"low").toLowerCase() as keyof typeof rank] ?? 4) - (rank[(b.state?.priority||"low").toLowerCase() as keyof typeof rank] ?? 4));
      return today[0];
    }
    const urgent = src.filter(t => (t.state?.priority||"").toLowerCase() === "urgent");
    return urgent[0] ?? src[0] ?? null;
  })());

  const thingsCount = $derived(
    overdue.length
      ? overdue.length + todayMeetings.length
      : openTickets.filter(t => {
          const p = (t.state?.priority||"").toLowerCase();
          return (p === "urgent" || p === "high") && t.state?.due_date === todayISO;
        }).length + todayMeetings.length
  );

  function ticketConfidence(t: EntityState): number {
    const p = (t.state?.priority || "").toLowerCase();
    const due = t.state?.due_date;
    const base = p === "urgent" ? 0.88 : p === "high" ? 0.74 : 0.56;
    if (due) {
      const days = Math.ceil((new Date(due + "T12:00").getTime() - Date.now()) / 86400000);
      if (days <= 0) return Math.min(0.98, base + 0.08);
      if (days <= 1) return Math.min(0.95, base + 0.05);
    }
    return base;
  }
  function clientFromName(name: string): string {
    return name.match(/^([A-Z]{2,5})\s*[-]/)?.[1] ?? "";
  }

  const ACTOR_META: Record<string, { initials: string; color: string }> = {
    cti:         { initials: "CT", color: "#3b82f6" },
    fk:          { initials: "FK", color: "#f43f5e" },
    nex:         { initials: "N",  color: "#22c55e" },
    "auto-backup": { initials: "AB", color: "#22c55e" },
    plane:       { initials: "PL", color: "#f59e0b" },
    outlook:     { initials: "OL", color: "#0ea5e9" },
    system:      { initials: "SY", color: "#64748b" },
  };
  function actorMeta(actor: string) {
    return ACTOR_META[actor] ?? { initials: actor.slice(0,2).toUpperCase(), color: "#64748b" };
  }
  function fmtAction(row: AuditRow): string {
    const a = row.action || "";
    const e = row.entity_id || "";
    if (a.includes("heartbeat")) return `synced ${e}`;
    if (a.includes("ticket.done") || a.includes("complete")) return `closed ticket ${e}`;
    if (a.includes("ticket.create")) return `opened ${e}`;
    if (a.includes("ticket.update")) return `updated ${e}`;
    if (a.includes("plane.webhook") || a.includes("plane.sync")) return `synced Plane`;
    if (a.includes("outlook")) return `synced Outlook`;
    if (a.includes("telegram")) return `sent Telegram`;
    if (a.includes("meeting")) return `meeting ${e}`;
    if (a.includes("commit")) return `auto-backup ${e}`;
    if (a.includes("decision")) return `decision ${e}`;
    if (a.includes("rag") || a.includes("embed")) return `learned ${e}`;
    return (a.split(".").pop() || a) + (e && e !== a ? ` ${e}` : "");
  }
  function fmtTime(iso: string): string {
    return new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit" });
  }
  function fmtCHF(n: number): string {
    return "CHF " + n.toLocaleString("de-CH");
  }
  function fmtRelative(iso: string | null, anchor = now): string {
    if (!iso) return "never";
    const diff = (anchor - new Date(iso).getTime()) / 1000;
    if (diff < 60) return `${Math.max(1, Math.floor(diff))}s ago`;
    if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
    return `${Math.floor(diff/86400)}d ago`;
  }
  function truncate(s: string | null | undefined, n: number): string {
    if (!s) return "";
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
  }

  function relativeTime(iso: string): string {
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return "-";
    const diff = Math.max(0, Math.floor((now - t) / 1000));
    if (diff < 60)    return `${diff}s`;
    if (diff < 3600)  return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return `${Math.floor(diff / 86400)}d`;
  }

  const revenueBars = $derived((() => {
    return clients
      .filter(c => Number(c.state?.monthly_revenue) > 0)
      .map(c => ({
        code: (c.entity_id.match(/^([A-Z]{2,5})/)?.[1]) ?? c.entity_id.slice(0,4).toUpperCase(),
        full: c.state?.name || c.entity_id,
        value: Number(c.state?.monthly_revenue) || 0,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  })());

  const ticketSegments = $derived((() => {
    const buckets: Record<string, number> = { backlog: 0, todo: 0, in_progress: 0, pending: 0, done: 0 };
    for (const t of tickets) {
      const g = (t.state?.state_group || "").toLowerCase();
      const n = (t.state?.state_name || "").toLowerCase();
      const isDone = t.state?.is_done === true;
      // Order matters: terminal/pending states first, then progress, then unstarted/backlog
      if (isDone || g === "completed" || g === "cancelled" || n.includes("done") || n.includes("complet") || n.includes("cancel")) {
        buckets.done++;
      } else if (n.includes("pending") || n.includes("review") || n.includes("customer") || n.includes("hold") || n.includes("waiting")) {
        buckets.pending++;
      } else if (g === "started" || n.includes("progress") || n.includes("doing")) {
        buckets.in_progress++;
      } else if (g === "backlog" || n.includes("backlog")) {
        buckets.backlog++;
      } else if (g === "unstarted" || n.includes("todo") || n.includes("planning") || n.includes("plan")) {
        buckets.todo++;
      } else {
        // Unknown state - default to todo
        buckets.todo++;
      }
    }
    const palette: Record<string, string> = {
      backlog: "#94A3B8",
      todo: "var(--brand)",
      in_progress: "var(--violet)",
      pending: "#F5B042",
      done: "var(--success)",
    };
    return Object.entries(buckets).map(([k, v]) => ({
      key: k,
      label: k === "in_progress" ? "In Progress" : k.charAt(0).toUpperCase() + k.slice(1),
      value: v,
      color: palette[k],
    }));
  })());

  function clientHealthClass(c: EntityState): string {
    const rev = Number(c.state?.monthly_revenue) || 0;
    const code = (c.entity_id.match(/^([A-Z]{2,5})/)?.[1]) ?? c.entity_id;
    const hasOverdue = overdue.some(t => (t.state?.name || "").startsWith(code + " "));
    if (hasOverdue) return "red";
    if (rev > 0) return "green";
    return "amber";
  }

  const clientGrid = $derived(
    clients.slice(0, 28).map(c => ({
      code: (c.entity_id.match(/^([A-Z]{2,5})/)?.[1]) ?? c.entity_id.slice(0,4).toUpperCase(),
      health: clientHealthClass(c),
      entity_id: c.entity_id,
      mrr: Number(c.state?.monthly_revenue) || 0,
      name: c.state?.name || c.entity_id,
      stage: c.state?.stage || "",
      client: c,
    }))
  );
  const healthGreen = $derived(clientGrid.filter(c => c.health === "green").length);
  const healthAmber = $derived(clientGrid.filter(c => c.health === "amber").length);
  const healthRed   = $derived(clientGrid.filter(c => c.health === "red").length);

  let drawerClient  = $state<EntityState | null>(null);
  let drawerOpen    = $state(false);
  let drawerTickets = $state<EntityState[]>([]);

  // Focus + Defer state
  let focusOpen    = $state(false);
  let focusTicket  = $state<EntityState | null>(null);
  let deferOpen    = $state(false);
  let deferTarget  = $state<EntityState | null>(null);
  let focusDay     = $state(todayISO);
  let focusStartH  = $state(9);
  let focusDurH    = $state(1);
  let focusNotes   = $state("");
  let focusCalBusy = $state(false);
  let focusCalOk   = $state(false);

  function openClient(c: EntityState) {
    drawerClient = c;
    const code = c.entity_id;
    const firstWord = (c.state?.name || "").toLowerCase().split(" ")[0];
    drawerTickets = tickets.filter(t => {
      const prefix = (t.entity_id || "").split("-")[0];
      if (prefix === code) return true;
      const tCust = (t.state?.customer || "").toLowerCase();
      if (tCust && firstWord && firstWord.length > 2 && tCust.includes(firstWord)) return true;
      return false;
    });
    drawerOpen = true;
  }
  function closeDrawer() { drawerOpen = false; }

  const PLANE_PROJECT_IDS: Record<string, string> = {
    C2M:  '807ce45f-495b-452e-9e6f-6b236c66a055',
    C2I:  '23e95ec1-0acc-47f3-a124-ddb4734bcef9',
    MFB:  '8ca26c5e-6e93-42ce-92ec-10ff354d2dd3',
    MACL: '5b7e31bc-5966-4c9b-b17f-39888db77605',
  };
  const USER_ASSIGNEE_TOKENS: Record<string, string[]> = {
    'claudio@c2moviez.com': ['claudio', 'cti', 'tinner'],
    'fanny@c2moviez.com':   ['fanny', 'fk', 'kecskes'],
  };

  function openFocus(t: EntityState) {
    focusTicket  = t;
    focusDay     = (t.state?.due_date as string) || todayISO;
    focusStartH  = 9;
    focusDurH    = 1;
    focusNotes   = "";
    focusCalOk   = false;
    focusCalBusy = false;
    focusOpen    = true;
  }
  function closeFocus() { focusOpen = false; }

  function openDefer(t: EntityState) { deferTarget = t; deferOpen = true; }
  function closeDefer() { deferOpen = false; }

  async function doDefer(t: EntityState, days: number) {
    const base = t.state?.due_date
      ? new Date((t.state.due_date as string) + "T12:00")
      : new Date();
    base.setDate(base.getDate() + days);
    const newDue = base.toLocaleDateString("sv-SE");
    const project = (t.state?.project as string) || "C2M";
    const projId  = PLANE_PROJECT_IDS[project] || PLANE_PROJECT_IDS.C2M;
    const issueUuid = t.state?.plane_uuid as string | undefined;
    if (issueUuid && projId) {
      fetch(`/api/functions/plane?path=/workspaces/c2moviez/projects/${projId}/issues/${issueUuid}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_date: newDue }),
      }).catch(() => {});
    }
    tickets = tickets.map(tk =>
      tk.entity_id === t.entity_id
        ? { ...tk, state: { ...(tk.state as Record<string, unknown>), due_date: newDue } } as EntityState
        : tk
    );
    deferOpen = false;
    toast(`Deferred to ${new Date(newDue + "T12:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}`, "ok", 2500);
  }

  async function addToCalendar() {
    if (!focusTicket || focusCalBusy) return;
    focusCalBusy = true;
    focusCalOk   = false;
    try {
      const code  = clientFromName((focusTicket.state?.name as string) || "");
      const seqId = (focusTicket.state?.ticketId || focusTicket.entity_id) as string;
      const res = await fetch("/api/functions/schedule-plan-ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action:         "create",
          ticket_id:      seqId,
          ticket_name:    (focusTicket.state?.name as string) || seqId,
          client_code:    code || (focusTicket.state?.project as string) || "C2M",
          priority:       (focusTicket.state?.priority as string) || "medium",
          day:            focusDay,
          start_hour:     focusStartH,
          duration_hours: focusDurH,
          user_code:      "CTI",
          notes:          focusNotes || undefined,
        }),
      });
      if (res.ok) {
        focusCalOk = true;
        toast("Calendar block created + M365 event synced", "ok", 3000);
      } else {
        toast("Calendar error — check server logs", "err", 3000);
      }
    } catch {
      toast("Network error", "err", 3000);
    } finally {
      focusCalBusy = false;
    }
  }

  async function voteDecision(decisionId: string, vote: "up" | "down") {
    if (!hasClient()) return;
    const newOutcome = vote === "up" ? "won" : "reversed";
    const nowIso = new Date().toISOString();
    // Optimistic local update
    decisions = decisions.map(d =>
      d.id === decisionId ? { ...d, outcome: newOutcome } : d
    );
    try {
      const upd = await supabase()
        .from("decisions")
        .update({ outcome: newOutcome, outcome_at: nowIso })
        .eq("id", decisionId);
      if (upd.error) throw upd.error;

      const ins = await supabase()
        .from("nex_reply_outcome")
        .insert({
          turn_id: decisionId,
          reply_excerpt: vote === "up" ? "CEO voted: thumbs up" : "CEO voted: thumbs down",
          corrected: vote === "down",
          time_to_correction_s: null,
        });
      if (ins.error) throw ins.error;

      toast(vote === "up" ? "Outcome tagged: won" : "Outcome tagged: reversed", "ok", 2200);
    } catch (e) {
      console.error("[home] voteDecision", e);
      // Rollback optimistic update
      decisions = decisions.map(d =>
        d.id === decisionId ? { ...d, outcome: null } : d
      );
      toast("Vote failed - check console", "err", 2800);
    }
  }

  function isUntagged(o: string | null): boolean {
    const v = (o || "").toLowerCase().trim();
    return v === "" || v === "pending" || v === "unknown";
  }

  function statusDot(s: string | null | undefined): string {
    const v = (s || "").toLowerCase();
    if (v === "ok" || v === "idle" || v === "ready") return "ok";
    if (v === "running" || v === "active" || v === "syncing") return "run";
    if (v === "error" || v === "failed" || v === "dead") return "err";
    return "neutral";
  }
  function outcomeChip(o: string | null): { label: string; cls: string } {
    const v = (o || "").toLowerCase();
    if (v === "won" || v === "kept") return { label: v.toUpperCase(), cls: "success" };
    if (v === "actioned") return { label: "ACTIONED", cls: "brand" };
    if (v === "reversed" || v === "lost") return { label: v.toUpperCase(), cls: "danger" };
    if (v === "no_action") return { label: "NO ACTION", cls: "neutral" };
    return { label: "PENDING", cls: "warn" };
  }
  function commitUrgency(due: string | null): string {
    if (!due) return "future";
    const d = new Date(due).getTime();
    const today = new Date(todayISO + "T23:59").getTime();
    if (d < Date.now() - 1000 * 60 * 60 * 12) return "overdue";
    if (d < today) return "today";
    return "future";
  }
  function fmtDue(iso: string | null): string {
    if (!iso) return "no date";
    return new Date(iso).toLocaleDateString("en-GB", {
      timeZone: "Europe/Zurich", day: "2-digit", month: "short",
    });
  }

  const urgentCount = $derived(
    overdue.length + openTickets.filter(t => (t.state?.priority||"").toLowerCase() === "urgent").length
  );

  const MODULE_CARDS = [
    { path: "/tracker",            icon: "⧗", label: "Tracker",    sub: "Time tracking"    },
    { path: "/pipeline/customers", icon: "▷", label: "CRM",        sub: "Client pipeline"  },
    { path: "/finance",            icon: "◈", label: "Finance",    sub: "Offers + invoices" },
    { path: "/nexdoc",             icon: "⊡", label: "NEXdoc",     sub: "Doc scanner"      },
    { path: "/revenue",            icon: "◆", label: "Revenue",    sub: "Revenue tracking" },
    { path: "/intel",              icon: "◎", label: "Intel",      sub: "Brain + signals"  },
    { path: "/meetings",           icon: "◐", label: "Meetings",   sub: "Meeting notes"    },
    { path: "/clients",            icon: "◈", label: "Clients",    sub: "Client hub"       },
    { path: "/ai-monitor",         icon: "◉", label: "AI Monitor", sub: "Observability"   },
  ];

  const maxBar = $derived(Math.max(...revenueBars.map(b => b.value), 1));
  const donutTotal = $derived(ticketSegments.reduce((s, x) => s + x.value, 0));

  // ───── AI Monitor derivations ─────
  const isCeo = $derived(currentUser?.email === "claudio@c2moviez.com");

  const inferenceStats = $derived((() => {
    const rows = inferenceLog;
    const total = rows.length;
    const ok = rows.filter(r => r.status === "ok").length;
    const errs = total - ok;
    const avgLatency = total > 0
      ? Math.round(rows.reduce((s, r) => s + (r.latency_ms ?? 0), 0) / total)
      : 0;
    const totalTokens = rows.reduce((s, r) => s + (r.total_tokens ?? 0), 0);
    return { total, ok, errs, avgLatency, totalTokens };
  })());

  const inferenceByModel = $derived((() => {
    const m = new Map<string, { count: number; latencySum: number; tokens: number; last: string }>();
    for (const r of inferenceLog) {
      const name = r.model || r.endpoint || "unknown";
      const cur = m.get(name) ?? { count: 0, latencySum: 0, tokens: 0, last: r.occurred_at };
      cur.count += 1;
      cur.latencySum += r.latency_ms ?? 0;
      cur.tokens += r.total_tokens ?? 0;
      if (new Date(r.occurred_at) > new Date(cur.last)) cur.last = r.occurred_at;
      m.set(name, cur);
    }
    return Array.from(m.entries())
      .map(([name, v]) => ({
        name,
        count: v.count,
        avg: v.count ? Math.round(v.latencySum / v.count) : 0,
        tokens: v.tokens,
        last: v.last,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  })());

  const KNOWN_MODELS: { name: string; family: string }[] = [
    { name: "BGE-M3",       family: "embed"  },
    { name: "Qwen-7B",      family: "qwen"   },
    { name: "DeepSeek-R1",  family: "deepseek" },
    { name: "LoRA (MLX)",   family: "lora"   },
  ];

  const localVsCloud = $derived((() => {
    const local = inferenceLog.length;
    // approx cloud calls from audit log: anything with "anthropic", "openai", "claude" tag
    const cloud = audit.filter(a => {
      const v = (a.action || "").toLowerCase();
      return v.includes("anthropic") || v.includes("openai") || v.includes("claude.api") || v.includes("cloud.infer");
    }).length;
    const total = local + cloud;
    return {
      local, cloud, total,
      localPct: total > 0 ? Math.round((local / total) * 100) : 0,
      cloudPct: total > 0 ? Math.round((cloud / total) * 100) : 0,
    };
  })());

  function auditColor(action: string): string {
    const a = (action || "").toLowerCase();
    if (a.includes("error") || a.includes("fail")) return "err";
    if (a.includes("deploy") || a.includes("commit")) return "ok";
    if (a.includes("telegram")) return "brand";
    if (a.includes("webhook") || a.includes("plane") || a.includes("outlook")) return "violet";
    if (a.includes("ticket")) return "blue";
    if (a.includes("rag") || a.includes("embed") || a.includes("decision")) return "amber";
    return "neutral";
  }

  function inferenceStatusCls(s: string): string {
    if (s === "ok") return "ok";
    if (s === "offline" || s === "model_not_loaded") return "warn";
    return "err";
  }

  const donutCx = 70, donutCy = 70, donutR = 56;
  const donutCirc = 2 * Math.PI * donutR;
  const donutPaths = $derived((() => {
    if (donutTotal === 0) return [];
    let acc = 0;
    return ticketSegments.map(seg => {
      const len = (seg.value / donutTotal) * donutCirc;
      const off = -(acc / donutTotal) * donutCirc;
      acc += seg.value;
      return { ...seg, len, off };
    });
  })());
</script>

<div class="page">
  <section class="stage">
    <div class="stage-top">
      <p class="stage-eyebrow">COMMAND · {todayFmt}</p>
      <LiveBadge />
    </div>
    <h1 class="stage-title">
      {greeting}, <span class="accent">Claudio.</span>
    </h1>
    <p class="stage-sub">
      {#if loading}
        Loading your workspace.
      {:else if thingsCount > 0}
        <span class="stage-count">{thingsCount}</span> {thingsCount === 1 ? "thing needs" : "things need"} your attention today.
      {:else}
        All clear. Systems operational.
      {/if}
    </p>
  </section>

  <div class="module-banner" aria-label="Modules">
    <div class="module-banner-track">
      {#each MODULE_CARDS as mod, i}
        <a href={mod.path} class="module-card" style="--delay: {i * 70}ms">
          <span class="module-card-icon">{mod.icon}</span>
          <span class="module-card-label">{mod.label}</span>
          <span class="module-card-sub">{mod.sub}</span>
        </a>
      {/each}
    </div>
  </div>

  {#if loading}
    <div class="skel-block stagger" style="height: 120px;"></div>
  {:else if topPriority}
    {@const conf = ticketConfidence(topPriority)}
    {@const prio = (topPriority.state?.priority || "medium").toLowerCase()}
    {@const code = clientFromName(topPriority.state?.name || "")}
    {@const due  = topPriority.state?.due_date}
    {@const dueFmt = due ? new Date(due + "T12:00").toLocaleString("de-CH", {
      timeZone: "Europe/Zurich", weekday: "long", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
    }) : null}
    <article class="hero-card glass-card lift prio-{prio} stagger" style="--i: 0">
      <div class="hero-card-inner">
        <div class="hp-content">
          <div class="hp-eyebrow">
            <span class="live-dot" aria-hidden="true"></span>
            TOP PRIORITY · SUGGESTED BY NEX
          </div>
          <h2 class="hp-title">{topPriority.state?.name || topPriority.entity_id}</h2>
          <div class="hp-meta">
            {#if code}<span class="pill brand">{code}</span>{/if}
            {#if topPriority.state?.customer}<span class="pill neutral">{topPriority.state.customer}</span>{/if}
            {#if dueFmt}<span class="dot-sep" aria-hidden="true"></span><span>Due {dueFmt} CEST</span>{/if}
            <span class="dot-sep" aria-hidden="true"></span>
            <span class="conf-row">
              <span class="conf-dot {conf >= 0.75 ? 'high' : conf >= 0.55 ? 'med' : 'low'}" aria-hidden="true"></span>
              Confidence {(conf * 100).toFixed(0)}%
            </span>
          </div>
        </div>
        <div class="hp-actions">
          <button class="btn-secondary" onclick={() => openDefer(topPriority!)}>Defer</button>
          <button class="btn-primary" onclick={() => openFocus(topPriority!)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            Start focus
          </button>
        </div>
      </div>
    </article>
  {/if}

  <div class="kpi-row">
    {#each [
      { eb: 'OPEN TICKETS',  v: kpiOpen,    tone: '',        sub: openTickets.length + ' across projects', accent: 'brand' },
      { eb: 'OVERDUE',       v: kpiOverdue, tone: overdue.length ? 'danger' : 'success', sub: overdue.length ? 'past due date' : 'all on track', accent: overdue.length ? 'danger' : 'success' },
      { eb: 'MRR · ' + new Date().toLocaleString('en-US',{timeZone:'Europe/Zurich',month:'short'}).toUpperCase(), v: kpiMrr, tone: 'brand', sub: 'CHF · monthly recurring', accent: 'brand', isMoney: true },
      { eb: 'ACTIVE CLIENTS', v: kpiClients, tone: '',       sub: clients.length + ' total in vault', accent: 'violet' },
      { eb: 'COMMITMENTS',   v: kpiCommits, tone: '',        sub: 'open promises', accent: 'brand' },
      { eb: 'NEX WIN RATE',  v: kpiWinRate, tone: 'success', sub: wonCount + '/' + totalOutcomed + ' decisions', accent: 'success', isPct: true },
    ] as k, i}
      <div class="kpi glass-card lift stagger" style="--i: {i + 1}">
        <div class="kpi-eyebrow"><span>{k.eb}</span><span class="ico-bar accent-{k.accent}"></span></div>
        <div class="kpi-num {k.tone}">
          {#if k.isMoney}CHF {k.v.toLocaleString('de-CH')}
          {:else if k.isPct}{k.v}<span class="pct">%</span>
          {:else}{k.v}{/if}
        </div>
        <div class="kpi-trend">{k.sub}</div>
        <div class="kpi-spark accent-{k.accent}"></div>
      </div>
    {/each}
  </div>

  <div class="split-2">
    <section class="glass-card panel stagger" style="--i: 7">
      <div class="panel-head">
        <div>
          <p class="panel-eyebrow">REVENUE · MONTHLY RECURRING</p>
          <h3>Top clients by MRR</h3>
        </div>
        <span class="panel-num">{fmtCHF(mrrTotal)}</span>
      </div>
      {#if loading}
        <div class="skel-block" style="height: 220px;"></div>
      {:else if revenueBars.length === 0}
        <p class="empty">No revenue clients yet.</p>
      {:else}
        <div class="bars">
          {#each revenueBars as bar, i}
            <div class="bar-row">
              <div class="bar-label">{bar.code}</div>
              <div class="bar-track">
                <div class="bar-fill" style="--w: {(bar.value / maxBar) * 100}%; --d: {i * 60}ms"></div>
              </div>
              <div class="bar-val">{fmtCHF(bar.value)}</div>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <section class="glass-card panel stagger" style="--i: 8">
      <div class="panel-head">
        <div>
          <p class="panel-eyebrow">PIPELINE · TICKET DISTRIBUTION</p>
          <h3>Ticket states</h3>
        </div>
        <span class="panel-num">{tickets.length}</span>
      </div>
      {#if loading}
        <div class="skel-block" style="height: 200px;"></div>
      {:else if donutTotal === 0}
        <p class="empty">No tickets yet.</p>
      {:else}
        <div class="donut-row">
          <svg viewBox="0 0 140 140" class="donut" aria-hidden="true">
            {#each donutPaths as seg, i}
              <circle
                cx={donutCx} cy={donutCy} r={donutR}
                fill="none"
                stroke={seg.color}
                stroke-width="18"
                stroke-dasharray="{seg.len} {donutCirc - seg.len}"
                stroke-dashoffset={seg.off}
                transform="rotate(-90 {donutCx} {donutCy})"
                class="donut-seg"
                style="--d: {i * 90}ms"
              />
            {/each}
            <text x="70" y="68" text-anchor="middle" class="donut-num">{openTickets.length}</text>
            <text x="70" y="84" text-anchor="middle" class="donut-lbl">OPEN</text>
          </svg>
          <ul class="legend">
            {#each ticketSegments as seg}
              <li>
                <span class="lg-dot" style="background:{seg.color}"></span>
                <span class="lg-label">{seg.label}</span>
                <span class="lg-val">{seg.value}</span>
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    </section>
  </div>

  <div class="split-2">
    <section class="glass-card panel stagger client-map-panel" style="--i: 9">
      <div class="panel-head">
        <div>
          <p class="panel-eyebrow">PORTFOLIO · CLIENT MAP</p>
          <h3>All clients</h3>
        </div>
        <div class="legend-inline legend-rich">
          <span class="lg-pill lg-green"><span class="hm-dot green"></span><b>{healthGreen}</b><i>active</i></span>
          <span class="lg-pill lg-amber"><span class="hm-dot amber"></span><b>{healthAmber}</b><i>idle</i></span>
          <span class="lg-pill lg-red"><span class="hm-dot red"></span><b>{healthRed}</b><i>flagged</i></span>
          <span class="lg-pill lg-mrr">CHF {fmtCHF(mrrTotal)}<i>/mo</i></span>
        </div>
      </div>
      {#if loading}
        <div class="skel-block" style="height: 220px;"></div>
      {:else}
        <div class="orbital-map" aria-label="Client orbital map">
          <svg class="orbital-svg" viewBox="-240 -200 480 400" role="img" aria-label="Client constellation">
            <defs>
              <radialGradient id="nexCore" cx="50%" cy="50%" r="50%">
                <stop offset="0%"   stop-color="rgba(86,188,236,0.85)"/>
                <stop offset="40%"  stop-color="rgba(86,188,236,0.45)"/>
                <stop offset="75%"  stop-color="rgba(124,58,237,0.25)"/>
                <stop offset="100%" stop-color="rgba(86,188,236,0.02)"/>
              </radialGradient>
              <radialGradient id="nexHalo" cx="50%" cy="50%" r="50%">
                <stop offset="0%"   stop-color="rgba(86,188,236,0.28)"/>
                <stop offset="60%"  stop-color="rgba(124,58,237,0.08)"/>
                <stop offset="100%" stop-color="rgba(86,188,236,0)"/>
              </radialGradient>
              <linearGradient id="streamGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%"   stop-color="rgba(86,188,236,0.0)"/>
                <stop offset="50%"  stop-color="rgba(86,188,236,0.90)"/>
                <stop offset="100%" stop-color="rgba(86,188,236,0.0)"/>
              </linearGradient>
              <filter id="nexGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" result="blur"/>
                <feMerge>
                  <feMergeNode in="blur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>

            <!-- Outer halo (pulsing) -->
            <circle cx="0" cy="0" r="220" fill="url(#nexHalo)" class="halo-pulse"/>

            <!-- Cyber scan line (sweeps top→bottom across the map) -->
            <g class="cyber-scan" aria-hidden="true">
              <line x1="-240" y1="0" x2="240" y2="0" stroke="rgba(86,188,236,0.12)" stroke-width="1"/>
              <line x1="-240" y1="2" x2="240" y2="2" stroke="rgba(86,188,236,0.05)" stroke-width="1"/>
            </g>

            <!-- Orbital rings (each rotates at its own pace) -->
            <g class="orbital-ring ring-1">
              <circle cx="0" cy="0" r="80"  fill="none" stroke="rgba(86,188,236,0.18)" stroke-width="1" stroke-dasharray="3 6"/>
            </g>
            <g class="orbital-ring ring-2">
              <circle cx="0" cy="0" r="140" fill="none" stroke="rgba(124,58,237,0.14)" stroke-width="1" stroke-dasharray="3 8"/>
            </g>
            <g class="orbital-ring ring-3">
              <circle cx="0" cy="0" r="200" fill="none" stroke="rgba(86,188,236,0.10)" stroke-width="1" stroke-dasharray="3 10"/>
            </g>

            <!-- Service distribution beams (radiate from center to each client) -->
            {#each clientGrid as cell, i}
              {@const angle = (i / clientGrid.length) * 2 * Math.PI - Math.PI / 2}
              {@const tier = cell.mrr > 2000 ? 1 : cell.mrr > 500 ? 2 : 3}
              {@const baseR = tier === 1 ? 88 : tier === 2 ? 148 : 198}
              {@const jitter = ((i * 137.5) % 24) - 12}
              {@const cx = Math.cos(angle) * (baseR + jitter)}
              {@const cy = Math.sin(angle) * (baseR + jitter)}
              {@const glow = cell.health === "green" ? "#22c55e" : cell.health === "red" ? "#ef4444" : "#f59e0b"}
              {@const beamOpacity = cell.mrr > 2000 ? 0.55 : cell.mrr > 500 ? 0.38 : 0.22}
              <!-- Static distribution line -->
              <line class="dist-line"
                x1="0" y1="0" x2={cx} y2={cy}
                stroke={glow} stroke-opacity={beamOpacity} stroke-width={cell.mrr > 2000 ? 1.6 : 1}
                stroke-linecap="round"/>
              <!-- Travelling data pulse -->
              <line class="data-pulse"
                x1="0" y1="0" x2={cx} y2={cy}
                stroke="url(#streamGrad)" stroke-width="1.4"
                stroke-linecap="round"
                style="--d: {(i * 200) % 4500}ms;"/>
            {/each}

            <!-- c2moviez center cluster (service distributor) -->
            <!-- Glow applied only to circles, NOT text (avoids blur smearing labels) -->
            <g class="nex-center" filter="url(#nexGlow)">
              <!-- Service rotating ring with labels -->
              <g class="nex-service-ring">
                <circle cx="0" cy="0" r="48" fill="none"
                        stroke="rgba(86,188,236,0.40)" stroke-width="0.7"
                        stroke-dasharray="2 4"/>
                <!-- 8 service satellite dots around the ring -->
                <circle cx="48"   cy="0"     r="1.8" fill="#56bcec"/>
                <circle cx="34"   cy="34"    r="1.4" fill="#7c3aed"/>
                <circle cx="0"    cy="48"    r="1.8" fill="#56bcec"/>
                <circle cx="-34"  cy="34"    r="1.4" fill="#7c3aed"/>
                <circle cx="-48"  cy="0"     r="1.8" fill="#56bcec"/>
                <circle cx="-34"  cy="-34"   r="1.4" fill="#7c3aed"/>
                <circle cx="0"    cy="-48"   r="1.8" fill="#56bcec"/>
                <circle cx="34"   cy="-34"   r="1.4" fill="#7c3aed"/>
              </g>

              <!-- Counter-rotating outer halo -->
              <circle cx="0" cy="0" r="40" fill="none"
                      stroke="rgba(86,188,236,0.55)" stroke-width="0.9"
                      stroke-dasharray="6 4"
                      class="nex-halo-ring"/>

              <!-- Glass core -->
              <circle cx="0" cy="0" r="32" fill="url(#nexCore)"
                      stroke="rgba(86,188,236,0.85)" stroke-width="1.8"/>

              <!-- Inner expanding pulse -->
              <circle cx="0" cy="0" r="24" fill="rgba(86,188,236,0.14)" class="nex-pulse"/>
              <circle cx="0" cy="0" r="24" fill="none"
                      stroke="rgba(86,188,236,0.45)" stroke-width="0.8"
                      class="nex-pulse-ring"/>
            </g>

            <!-- Brand text rendered WITHOUT blur filter so it stays crisp and centered -->
            <text x="0" y="-4" text-anchor="middle" dominant-baseline="middle"
              font-size="11" font-weight="800" letter-spacing="0.18em"
              fill="rgba(8,18,40,0.92)">c2moviez</text>
            <text x="0" y="7" text-anchor="middle" dominant-baseline="middle"
              font-size="5" font-weight="700" letter-spacing="0.22em"
              fill="rgba(8,18,40,0.65)">DISTRIBUTOR</text>

            <!-- Client nodes (drawn last so they sit on top) -->
            {#each clientGrid as cell, i}
              {@const angle = (i / clientGrid.length) * 2 * Math.PI - Math.PI / 2}
              {@const tier = cell.mrr > 2000 ? 1 : cell.mrr > 500 ? 2 : 3}
              {@const baseR = tier === 1 ? 88 : tier === 2 ? 148 : 198}
              {@const jitter = ((i * 137.5) % 24) - 12}
              {@const cx = Math.cos(angle) * (baseR + jitter)}
              {@const cy = Math.sin(angle) * (baseR + jitter)}
              {@const nodeR = cell.mrr > 3000 ? 20 : cell.mrr > 1000 ? 17 : 13}
              {@const fill = cell.health === "green" ? "rgba(34,197,94,0.20)" : cell.health === "red" ? "rgba(239,68,68,0.20)" : "rgba(245,158,11,0.16)"}
              {@const stroke = cell.health === "green" ? "rgba(34,197,94,0.78)" : cell.health === "red" ? "rgba(239,68,68,0.78)" : "rgba(245,158,11,0.78)"}
              {@const glow = cell.health === "green" ? "#22c55e" : cell.health === "red" ? "#ef4444" : "#f59e0b"}
              {@const labelDy = cy > 0 ? nodeR + 12 : -(nodeR + 6)}
              <g class="client-node health-{cell.health}"
                 style="--delay: {200 + i * 45}ms; --glow: {glow};"
                 role="button" tabindex="0"
                 aria-label="Open {cell.name}"
                 onclick={() => openClient(cell.client)}
                 onkeydown={(e) => (e.key === "Enter" || e.key === " ") && openClient(cell.client)}>
                <title>{cell.name}{cell.mrr > 0 ? ` · CHF ${fmtCHF(cell.mrr)}/mo` : ""}</title>
                <circle cx={cx} cy={cy} r={nodeR + 6} fill="none" stroke={glow} stroke-opacity="0.18" stroke-width="1.5" class="node-ring"/>
                <circle cx={cx} cy={cy} r={nodeR} fill={fill} stroke={stroke} stroke-width="1.5" class="node-main"/>
                <text x={cx} y={cy + 3.5} text-anchor="middle"
                  font-size={nodeR > 16 ? 8.5 : 7}
                  font-weight="700" letter-spacing="0.08em"
                  fill={glow} opacity="0.95">{cell.code}</text>
                <!-- Floating label on hover/focus -->
                <g class="node-label" transform={`translate(${cx} ${cy + labelDy})`}>
                  <rect x="-44" y="-9" width="88" height="18" rx="4"
                        fill="rgba(8,12,20,0.86)" stroke="rgba(86,188,236,0.35)" stroke-width="0.6"/>
                  <text x="0" y="-1" text-anchor="middle" font-size="5.8" font-weight="600" letter-spacing="0.04em" fill="#e1eefa">{cell.name.length > 18 ? cell.name.slice(0,17) + "…" : cell.name}</text>
                  {#if cell.mrr > 0}
                    <text x="0" y="6.4" text-anchor="middle" font-size="5" font-weight="500" letter-spacing="0.04em" fill="rgba(86,188,236,0.95)">CHF {fmtCHF(cell.mrr)}/mo</text>
                  {:else}
                    <text x="0" y="6.4" text-anchor="middle" font-size="5" font-weight="500" letter-spacing="0.04em" fill="rgba(225,238,250,0.55)">{cell.stage || "no MRR"}</text>
                  {/if}
                </g>
              </g>
            {/each}
          </svg>
        </div>

        <div class="map-distributor-label">
          <span class="dist-dot"></span>
          c2moviez GmbH
          <span class="dist-sep">·</span>
          <span class="dist-role">Service Distributor</span>
          <span class="dist-sep">·</span>
          <span class="dist-stat">{clientGrid.length} active clients</span>
          <span class="dist-sep">·</span>
          <span class="dist-stat">CHF {fmtCHF(mrrTotal)}/mo</span>
        </div>

        <div class="health-grid mobile-only">
          {#each clientGrid as cell, i}
            <button class="health-cell health-{cell.health}"
                    onclick={() => openClient(cell.client)}
                    title={cell.name}
                    style="--d: {i * 25}ms">
              {cell.code}
            </button>
          {/each}
        </div>
      {/if}
    </section>

    <section class="glass-card panel activity-panel stagger" style="--i: 10">
      <div class="panel-head">
        <div>
          <p class="panel-eyebrow">REAL-TIME · AUDIT BUS</p>
          <h3>Live activity</h3>
        </div>
        <LiveBadge />
      </div>
      <div class="activity-list">
        {#if loading}
          {#each Array(8) as _}
            <div class="skel-block" style="height: 36px; margin: 3px 0;"></div>
          {/each}
        {:else if audit.length === 0}
          <p class="empty">No recent activity.</p>
        {:else}
          {#each audit.slice(0, 14) as row (row.id)}
            {@const meta = actorMeta(row.actor || "sys")}
            <div class="activity-row" >
              <div class="actor" style="background:linear-gradient(135deg,{meta.color}cc,{meta.color})">
                {meta.initials}
              </div>
              <span class="verb">{fmtAction(row)}</span>
              <span class="time">{fmtTime(row.created_at)}</span>
            </div>
          {/each}
        {/if}
      </div>
    </section>
  </div>

  <section class="brain glass-card stagger" style="--i: 11">
    <div class="brain-frame">
      <header class="brain-head">
        <div class="brain-title">
          <span class="brain-pulse" aria-hidden="true"></span>
          <p class="panel-eyebrow brain-eb">NEXBRAIN · SYMBIOTIC INTELLIGENCE</p>
          <h2>What I'm learning, right now.</h2>
        </div>
        <div class="brain-pills">
          <div class="brain-pill">
            <span class="bp-num">{embeddingCount.toLocaleString('de-CH')}</span>
            <span class="bp-lbl">CHUNKS INDEXED</span>
          </div>
          <div class="brain-pill">
            <span class="bp-num">{decisions.length}</span>
            <span class="bp-lbl">DECISIONS · 30D</span>
          </div>
          <div class="brain-pill">
            <span class="bp-num">{winRate}<span class="pct">%</span></span>
            <span class="bp-lbl">WIN RATE</span>
          </div>
          <div class="brain-pill">
            <span class="bp-num">{heartbeats.length}</span>
            <span class="bp-lbl">AGENTS LIVE</span>
          </div>
        </div>
      </header>

      <div class="brain-grid">
        <div class="brain-col">
          <p class="panel-eyebrow sub-eb">AGENT HEARTBEAT</p>
          {#if loading}
            <div class="skel-block" style="height: 200px;"></div>
          {:else if heartbeats.length === 0}
            <p class="empty">No agents reporting yet.</p>
          {:else}
            <div class="agent-grid">
              {#each heartbeats.slice(0, 12) as h, i}
                {@const dot = statusDot(h.status)}
                <div class="agent-card dot-{dot}" style="--d: {i * 50}ms">
                  <div class="agent-top">
                    <span class="agent-name">{h.agent_name}</span>
                    <span class="agent-dot dot-{dot}"></span>
                  </div>
                  <div class="agent-action">{truncate(h.last_action, 64) || "idle"}</div>
                  <div class="agent-foot">
                    <div class="conf-bar"><span style="--c: {Math.round((h.confidence ?? 0) * 100)}%"></span></div>
                    <span class="agent-when">{fmtRelative(h.last_action_at)}</span>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>

        <div class="brain-col">
          <p class="panel-eyebrow sub-eb">RECENT DECISIONS</p>
          {#if loading}
            <div class="skel-block" style="height: 200px;"></div>
          {:else if decisions.length === 0}
            <p class="empty">No decisions logged.</p>
          {:else}
            <ul class="decision-list">
              {#each decisions.slice(0, 8) as d, i}
                {@const oc = outcomeChip(d.outcome)}
                {@const untagged = isUntagged(d.outcome)}
                <li class="decision-row" style="--d: {i * 60}ms">
                  <span class="pill {oc.cls}">{oc.label}</span>
                  <span class="dec-text">{truncate(d.decision, 96) || "(no text)"}</span>
                  <span class="dec-when">{fmtRelative(d.decided_at)}</span>
                  {#if untagged}
                    <span class="dec-votes">
                      <button
                        class="vote-btn up"
                        title="Mark as won"
                        aria-label="Thumbs up - mark won"
                        onclick={() => voteDecision(d.id, "up")}
                      >
                        <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                          <polyline points="3 8.5 6.5 12 13 4.5"></polyline>
                        </svg>
                      </button>
                      <button
                        class="vote-btn down"
                        title="Mark as reversed"
                        aria-label="Thumbs down - mark reversed"
                        onclick={() => voteDecision(d.id, "down")}
                      >
                        <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                          <line x1="4" y1="4" x2="12" y2="12"></line>
                          <line x1="12" y1="4" x2="4" y2="12"></line>
                        </svg>
                      </button>
                    </span>
                  {/if}
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      </div>
    </div>
  </section>

  {#if isCeo}
    <a href="/ai-monitor" class="aim-link-card glass-card stagger" style="--i: 12">
      <div class="aim-lc-left">
        <span class="aim-lc-pulse" aria-hidden="true"></span>
        <div>
          <p class="panel-eyebrow aim-eb">AI MONITOR · OBSERVABILITY</p>
          <h3 class="aim-lc-title">What every model and agent is doing.</h3>
          <p class="aim-lc-sub">Pipeline visualization, tier architecture, inference trace, LoRA status - live.</p>
        </div>
      </div>
      <div class="aim-lc-pills">
        <div class="aim-lc-stat"><span>{heartbeats.length}</span><i>agents</i></div>
        <div class="aim-lc-stat"><span>{inferenceStats.total}</span><i>inferences</i></div>
        <div class="aim-lc-stat"><span>{localVsCloud.localPct}%</span><i>local</i></div>
        <div class="aim-lc-stat"><span>{embeddingCount.toLocaleString("de-CH")}</span><i>chunks</i></div>
        <span class="aim-lc-arrow" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </span>
      </div>
    </a>
  {/if}

  {#if commitments.length > 0}
    <section class="commit-strip glass-card stagger" style="--i: 13">
      <div class="panel-head">
        <div>
          <p class="panel-eyebrow">PROMISES · TRACKED</p>
          <h3>Open commitments</h3>
        </div>
        <span class="panel-num">{commitments.length}</span>
      </div>
      <div class="commit-track">
        {#each commitments as c, i}
          {@const u = commitUrgency(c.due_at)}
          <div class="commit-chip urg-{u}" style="--d: {i * 40}ms">
            <p class="cc-text">{truncate(c.promise, 80) || "(empty promise)"}</p>
            <div class="cc-foot">
              <span class="cc-due">{fmtDue(c.due_at)}</span>
              {#if c.entity_id}<span class="cc-ent">{c.entity_id}</span>{/if}
            </div>
          </div>
        {/each}
      </div>
    </section>

    <!-- ─── RailGuard Widget ──────────────────────────────────────── -->
    <section class="glass-card panel rg-widget stagger" style="--i: 14">
      <div class="panel-head">
        <div>
          <p class="panel-eyebrow">PROTECTION RAILS · REALTIME</p>
          <h3>RailGuard</h3>
        </div>
        <div class="rg-head-right">
          {#if rgStats && rgStats.holdsPending > 0}
            <span class="rg-holds-badge">{rgStats.holdsPending} HOLD{rgStats.holdsPending > 1 ? 'S' : ''}</span>
          {/if}
          <a href="/railguard" class="rg-open-link" aria-label="Open full RailGuard">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </a>
        </div>
      </div>

      <!-- Stats row -->
      <div class="rg-stats-row">
        <div class="rg-stat">
          <span class="rg-stat-num rg-block">{rgStats?.blocksToday ?? 0}</span>
          <span class="rg-stat-lbl">BLOCKS</span>
        </div>
        <div class="rg-stat">
          <span class="rg-stat-num rg-hold">{rgStats?.holdsToday ?? 0}</span>
          <span class="rg-stat-lbl">HOLDS</span>
        </div>
        <div class="rg-stat">
          <span class="rg-stat-num rg-pass">{rgStats ? Math.round(rgStats.passRate24h) : '--'}<span class="rg-pct">%</span></span>
          <span class="rg-stat-lbl">PASS RATE</span>
        </div>
      </div>

      <!-- Last 5 events -->
      <div class="rg-event-list">
        {#if loading || rgEvents.length === 0}
          {#if loading}
            {#each Array(4) as _}
              <div class="skel-block" style="height: 26px; margin: 2px 0;"></div>
            {/each}
          {:else}
            <p class="rg-empty">No recent guardrail events.</p>
          {/if}
        {:else}
          {#each rgEvents.slice(0, 5) as ev}
            <div class="rg-event-row" data-action={ev.action}>
              <span class="rg-badge rg-badge-{ev.action}">{ev.action.toUpperCase()}</span>
              <span class="rg-rail-name">{ev.rail}</span>
              {#if ev.reason}
                <span class="rg-reason">{ev.reason}</span>
              {/if}
              <span class="rg-ts">{relativeTime(ev.ts)}</span>
            </div>
          {/each}
        {/if}
      </div>
    </section>
  {/if}

  {#if drawerOpen && drawerClient}
    <ClientDrawer
      client={drawerClient}
      tickets={drawerTickets}
      open={drawerOpen}
      onClose={closeDrawer}
    />
  {/if}

  <!-- ─── Focus Modal ─────────────────────────────────────────────── -->
  {#if focusOpen && focusTicket}
    {@const ft = focusTicket}
    {@const fPrio = ((ft.state?.priority as string) || "medium").toLowerCase()}
    {@const fMods = Array.isArray(ft.state?.modules) ? ft.state.modules as string[] : []}
    {@const fCycs = Array.isArray(ft.state?.cycles)  ? ft.state.cycles  as string[] : []}
    {@const fAssignees = Array.isArray(ft.state?.assignees) ? ft.state.assignees as string[] : []}
    {@const fTicketId = (ft.state?.ticketId || ft.entity_id) as string}
    {@const fUrl = (ft.state?.url as string) || `https://app.plane.so/c2moviez/browse/${fTicketId}/`}
    {@const fDueDate = ft.state?.due_date as string | undefined}
    {@const fDueFmt = fDueDate ? new Date(fDueDate + "T12:00").toLocaleDateString("de-CH", {
      timeZone: "Europe/Zurich", weekday: "long", day: "2-digit", month: "long"
    }) : null}

    <div class="fm-backdrop" role="presentation" onclick={closeFocus}></div>
    <div class="fm-modal" role="dialog" aria-modal="true" aria-label="Focus: {ft.state?.name}">
      <button class="fm-close" onclick={closeFocus} aria-label="Close">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>

      <div class="fm-hero fm-hero-prio-{fPrio}">
        <div class="fm-eyebrow">
          <span class="fm-prio-badge prio-{fPrio}">{fPrio.toUpperCase()}</span>
          <a class="fm-ticket-id" href={fUrl} target="_blank" rel="noopener">{fTicketId}</a>
          <span class="fm-eyebrow-sep">·</span>
          <span class="fm-eyebrow-label">FOCUS SESSION</span>
        </div>
        <h2 class="fm-title">{(ft.state?.name as string) || fTicketId}</h2>
        <div class="fm-meta">
          {#if ft.state?.customer}<span class="fm-chip">{ft.state.customer as string}</span>{/if}
          {#if fDueFmt}<span class="fm-chip fm-chip-due {fDueDate && fDueDate < todayISO ? 'overdue' : ''}">Due: {fDueFmt}</span>{/if}
          {#if ft.state?.state}<span class="fm-chip">{ft.state.state as string}</span>{/if}
          {#each fAssignees as a}<span class="fm-chip fm-chip-assignee">{a}</span>{/each}
        </div>
        {#if fMods.length || fCycs.length}
          <div class="fm-chips-row">
            {#each fMods as m}<span class="fm-chip fm-chip-mod">{m}</span>{/each}
            {#each fCycs as cy}<span class="fm-chip fm-chip-cyc">{cy}</span>{/each}
          </div>
        {/if}
      </div>

      <div class="fm-body">
        <div class="fm-section">
          <h3 class="fm-section-title">Schedule Focus Block</h3>
          <p class="fm-section-sub">Creates a calendar entry in your M365 calendar (claudio@c2moviez.com)</p>

          <div class="fm-form">
            <label class="fm-field">
              <span class="fm-label">Date</span>
              <input class="fm-input" type="date" bind:value={focusDay} min={todayISO} />
            </label>

            <label class="fm-field">
              <span class="fm-label">Start time</span>
              <select class="fm-select" bind:value={focusStartH}>
                {#each Array.from({length: 22}, (_, i) => i + 7) as h}
                  <option value={h}>{String(h).padStart(2,"0")}:00</option>
                {/each}
              </select>
            </label>

            <label class="fm-field">
              <span class="fm-label">Duration</span>
              <select class="fm-select" bind:value={focusDurH}>
                <option value={0.5}>30 min</option>
                <option value={1}>1 hour</option>
                <option value={1.5}>1h 30m</option>
                <option value={2}>2 hours</option>
                <option value={3}>3 hours</option>
                <option value={4}>4 hours</option>
              </select>
            </label>

            <label class="fm-field fm-field-full">
              <span class="fm-label">Notes (optional)</span>
              <textarea class="fm-textarea" bind:value={focusNotes} placeholder="Add context for this focus block..." rows="2"></textarea>
            </label>
          </div>

          <div class="fm-cal-actions">
            {#if focusCalOk}
              <div class="fm-cal-ok">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                Block created + M365 event synced
              </div>
            {:else}
              <button class="fm-cal-btn {focusCalBusy ? 'busy' : ''}" onclick={addToCalendar} disabled={focusCalBusy}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                {focusCalBusy ? "Adding..." : "Add to Calendar"}
              </button>
            {/if}
          </div>
        </div>

        <div class="fm-footer">
          <button class="fm-action-secondary" onclick={closeFocus}>Cancel</button>
          <button class="fm-action-primary" onclick={() => { closeFocus(); toast("Focus started - you've got this!", "ok", 2500); }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Start now
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- ─── Defer Modal ─────────────────────────────────────────────── -->
  {#if deferOpen && deferTarget}
    {@const dt = deferTarget}
    {@const dtId = (dt.state?.ticketId || dt.entity_id) as string}
    <div class="def-backdrop" role="presentation" onclick={closeDefer}></div>
    <div class="def-sheet" role="dialog" aria-modal="true" aria-label="Defer ticket">
      <div class="def-handle"></div>
      <h3 class="def-title">Defer</h3>
      <p class="def-sub">{(dt.state?.name as string) || dtId}</p>
      <div class="def-options">
        <button class="def-opt" onclick={() => doDefer(dt, 1)}>
          <span class="def-opt-label">Tomorrow</span>
          <span class="def-opt-date">{new Date(Date.now() + 86400000).toLocaleDateString("en-GB", {day:"2-digit",month:"short"})}</span>
        </button>
        <button class="def-opt" onclick={() => doDefer(dt, 2)}>
          <span class="def-opt-label">+2 days</span>
          <span class="def-opt-date">{new Date(Date.now() + 2*86400000).toLocaleDateString("en-GB", {day:"2-digit",month:"short"})}</span>
        </button>
        <button class="def-opt" onclick={() => doDefer(dt, 7)}>
          <span class="def-opt-label">Next week</span>
          <span class="def-opt-date">{new Date(Date.now() + 7*86400000).toLocaleDateString("en-GB", {day:"2-digit",month:"short"})}</span>
        </button>
        <button class="def-opt" onclick={() => doDefer(dt, 14)}>
          <span class="def-opt-label">+2 weeks</span>
          <span class="def-opt-date">{new Date(Date.now() + 14*86400000).toLocaleDateString("en-GB", {day:"2-digit",month:"short"})}</span>
        </button>
      </div>
      <button class="def-cancel" onclick={closeDefer}>Cancel</button>
    </div>
  {/if}
</div>

<style>
  .page { display: flex; flex-direction: column; gap: 24px; }

  .stage { display: flex; flex-direction: column; gap: 8px; padding: 4px 4px 0; }
  .stage-top { display: flex; align-items: center; justify-content: space-between; }
  .stage-eyebrow {
    font: 700 10.5px/1 'JetBrains Mono', monospace;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--brand-deep);
    margin: 0;
  }
  .stage-title {
    font: 600 clamp(28px, 4vw, 40px)/1.15 Inter, sans-serif;
    letter-spacing: -0.025em;
    color: var(--ink);
    margin: 0;
  }
  .accent {
    background: linear-gradient(135deg, var(--ink) 20%, var(--brand-deep) 60%, var(--violet, #6b4fd8));
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .stage-sub { font-size: 14px; color: var(--ink-2); margin: 0; }
  .stage-count {
    font-family: 'JetBrains Mono', monospace;
    font-size: 16px;
    font-weight: 600;
    color: var(--brand-deep);
  }

  .glass-card {
    background: var(--glass-card);
    -webkit-backdrop-filter: var(--blur-card);
    backdrop-filter: var(--blur-card);
    border: 1px solid var(--brand-line);
    border-radius: var(--r3);
    box-shadow: var(--sh-card), 0 0 40px rgba(86,188,236,0.04);
    transition: transform var(--dur-2) var(--ease), box-shadow var(--dur-2) var(--ease);
  }
  .glass-card.lift:hover { transform: translateY(-1px); box-shadow: var(--sh-card-hover); }

  .stagger {
    opacity: 0;
    transform: translateY(10px);
    animation: rise 520ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
    animation-delay: calc(var(--i, 0) * 70ms);
  }
  @keyframes rise { to { opacity: 1; transform: translateY(0); } }

  .hero-card { padding: 28px 32px; overflow: hidden; position: relative; }
  .hero-card::before {
    content: ''; position: absolute; inset: 0;
    background: radial-gradient(circle at 0% 0%, var(--brand-soft), transparent 60%);
    pointer-events: none;
  }
  .prio-urgent::before { background: radial-gradient(circle at 0% 0%, rgba(217,59,59,0.06), transparent 60%); }
  .prio-urgent { border-color: rgba(217,59,59,0.22); }
  .prio-high::before { background: radial-gradient(circle at 0% 0%, rgba(201,142,0,0.07), transparent 60%); }
  .prio-high { border-color: rgba(201,142,0,0.20); }
  .hero-card-inner {
    position: relative; display: grid;
    grid-template-columns: 1fr auto;
    gap: 24px; align-items: center;
  }
  .hp-eyebrow {
    display: flex; align-items: center; gap: 8px;
    font: 700 10.5px/1 'JetBrains Mono', monospace;
    letter-spacing: 0.14em; text-transform: uppercase;
    color: var(--brand-deep); margin-bottom: 12px;
  }
  .live-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--brand);
    box-shadow: 0 0 0 0 var(--brand-glow);
    animation: pulse 2.4s ease-in-out infinite;
    flex-shrink: 0;
  }
  @keyframes pulse {
    0%, 100% { box-shadow: 0 0 0 0 var(--brand-glow); }
    50%      { box-shadow: 0 0 0 6px transparent; }
  }
  .hp-title {
    font: 600 clamp(18px, 2.5vw, 24px)/1.25 Inter, sans-serif;
    letter-spacing: -0.02em; color: var(--ink); margin: 0 0 10px;
  }
  .hp-meta { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; font-size: 13px; color: var(--ink-2); }
  .dot-sep { width: 3px; height: 3px; border-radius: 50%; background: var(--ink-3); flex-shrink: 0; }
  .conf-row { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; }
  .conf-dot { width: 7px; height: 7px; border-radius: 50%; }
  .conf-dot.high { background: var(--success); }
  .conf-dot.med  { background: var(--warn); }
  .conf-dot.low  { background: var(--danger); }
  .hp-actions { display: flex; gap: 10px; flex-shrink: 0; }
  @media (max-width: 640px) { .hero-card-inner { grid-template-columns: 1fr; } }

  .pill {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 3px 9px; border-radius: 999px;
    font: 600 10.5px/1.4 Inter, sans-serif; letter-spacing: 0.04em;
  }
  .pill.brand   { background: var(--brand-soft); color: var(--brand-deep); }
  .pill.success { background: var(--success-soft); color: var(--success); }
  .pill.warn    { background: var(--warn-soft); color: var(--warn); }
  .pill.danger  { background: var(--danger-soft); color: var(--danger); }
  .pill.neutral { background: var(--line); color: var(--ink-2); }

  .btn-primary {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 0 18px; height: 40px; border-radius: 11px;
    font: 600 13.5px/1 Inter, sans-serif; cursor: pointer;
    border: 1px solid transparent;
    background: linear-gradient(180deg, var(--brand), var(--brand-deep));
    color: white;
    box-shadow: 0 6px 18px -4px var(--brand-glow), inset 0 1px 0 rgba(255,255,255,0.4);
    transition: transform var(--dur) var(--ease), box-shadow var(--dur) var(--ease);
    white-space: nowrap;
  }
  .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 10px 24px -6px var(--brand-glow), inset 0 1px 0 rgba(255,255,255,0.4); }
  .btn-secondary {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 0 18px; height: 40px; border-radius: 11px;
    font: 600 13.5px/1 Inter, sans-serif; cursor: pointer;
    background: var(--canvas-2); border: 1px solid var(--line); color: var(--ink);
    transition: all var(--dur) var(--ease); white-space: nowrap;
  }
  .btn-secondary:hover { border-color: var(--brand-line-2); transform: translateY(-1px); }

  /* KPI row */
  .kpi-row {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 14px;
  }
  @media (max-width: 1180px) { .kpi-row { grid-template-columns: repeat(3, 1fr); } }
  @media (max-width: 620px)  { .kpi-row { grid-template-columns: repeat(2, 1fr); gap: 10px; } }

  .kpi {
    position: relative; overflow: hidden;
    padding: 18px 18px 14px; display: flex; flex-direction: column; gap: 8px;
  }
  .kpi-eyebrow {
    display: flex; align-items: center; justify-content: space-between;
    font: 700 9.5px/1 'JetBrains Mono', monospace;
    letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-3);
  }
  .ico-bar {
    width: 18px; height: 2px; border-radius: 2px;
    background: var(--ink-3); opacity: 0.6;
  }
  .ico-bar.accent-brand   { background: var(--brand); opacity: 1; }
  .ico-bar.accent-violet  { background: var(--violet, #6b4fd8); opacity: 1; }
  .ico-bar.accent-success { background: var(--success); opacity: 1; }
  .ico-bar.accent-danger  { background: var(--danger); opacity: 1; }

  .kpi-num {
    font: 500 clamp(26px, 3vw, 34px)/1 'JetBrains Mono', monospace;
    letter-spacing: -0.025em; color: var(--ink);
    font-feature-settings: "tnum";
  }
  .kpi-num.brand   { color: var(--brand-deep); text-shadow: 0 0 14px rgba(86,188,236,0.22); }
  .kpi-num.success { color: var(--success);    text-shadow: 0 0 14px color-mix(in srgb, var(--success) 35%, transparent); }
  .kpi-num.danger  { color: var(--danger);     text-shadow: 0 0 14px color-mix(in srgb, var(--danger)  35%, transparent); }
  .pct { font-size: 0.65em; opacity: 0.6; margin-left: 2px; }
  .kpi-trend { font-size: 11.5px; color: var(--ink-2); }
  .kpi-spark {
    position: absolute; left: 0; right: 0; bottom: 0;
    height: 3px;
    background: linear-gradient(90deg, transparent, var(--brand) 30%, var(--brand-deep) 70%, transparent);
    opacity: 0.55;
  }
  .kpi-spark.accent-violet  { background: linear-gradient(90deg, transparent, var(--violet, #6b4fd8) 30%, var(--brand-deep) 70%, transparent); }
  .kpi-spark.accent-success { background: linear-gradient(90deg, transparent, var(--success) 50%, transparent); }
  .kpi-spark.accent-danger  { background: linear-gradient(90deg, transparent, var(--danger)  50%, transparent); }

  /* Panels */
  .split-2 { display: grid; grid-template-columns: 1.25fr 1fr; gap: 20px; }
  @media (max-width: 1024px) { .split-2 { grid-template-columns: 1fr; } }

  .panel { padding: 22px 24px; display: flex; flex-direction: column; gap: 16px; }
  .panel-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  .panel-head h3 { margin: 4px 0 0; font: 600 17px/1.2 Inter, sans-serif; color: var(--ink); letter-spacing: -0.01em; }
  .panel-eyebrow {
    font: 700 10px/1 'JetBrains Mono', monospace;
    letter-spacing: 0.16em; text-transform: uppercase;
    color: var(--brand-deep); margin: 0;
  }
  .panel-num {
    font: 500 22px/1 'JetBrains Mono', monospace;
    color: var(--ink); letter-spacing: -0.02em;
    font-feature-settings: "tnum";
  }
  .empty { color: var(--ink-3); font-size: 13px; margin: 12px 0 0; }
  .legend-inline {
    display: flex; gap: 14px; font: 600 10.5px/1 'JetBrains Mono', monospace;
    color: var(--ink-3); letter-spacing: 0.08em; text-transform: uppercase;
  }
  .legend-inline span { display: inline-flex; align-items: center; gap: 5px; }

  /* Bars — CYBER COMMAND revenue */
  .bars { display: flex; flex-direction: column; gap: 11px; }
  .bar-row {
    display: grid; grid-template-columns: 56px 1fr 96px;
    align-items: center; gap: 12px;
  }
  .bar-label {
    font: 700 10.5px/1 'JetBrains Mono', monospace;
    color: var(--brand-deep);
    letter-spacing: 0.16em;
    text-transform: uppercase;
    text-shadow: 0 0 6px rgba(86,188,236,0.18);
  }
  .bar-track {
    position: relative;
    height: 11px; border-radius: 999px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(86,188,236,0.10);
    overflow: hidden;
  }
  .bar-track::after {
    content: '';
    position: absolute; inset: 0;
    background-image: repeating-linear-gradient(
      45deg,
      transparent 0px,
      transparent 4px,
      rgba(255,255,255,0.025) 4px,
      rgba(255,255,255,0.025) 5px
    );
    pointer-events: none;
    border-radius: 999px;
  }
  .bar-fill {
    height: 100%;
    width: 0;
    border-radius: 999px;
    background: linear-gradient(90deg, #56bcec 0%, #7B5CFF 100%);
    box-shadow:
      0 0 8px rgba(86,188,236,0.55),
      0 0 18px rgba(123,92,255,0.30),
      inset 0 0 6px rgba(255,255,255,0.22);
    animation: barGrow 900ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
    animation-delay: var(--d, 0ms);
    position: relative;
  }
  .bar-fill::after {
    content: '';
    position: absolute; inset: 0;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent);
    transform: translateX(-100%);
    animation: barShimmer 3.4s ease-in-out 1s infinite;
    border-radius: 999px;
  }
  @keyframes barGrow { to { width: var(--w); } }
  @keyframes barShimmer { to { transform: translateX(100%); } }
  .bar-val {
    font: 600 12px/1 'JetBrains Mono', monospace;
    color: var(--ink); text-align: right;
    font-feature-settings: "tnum";
    text-shadow: 0 0 6px rgba(86,188,236,0.18);
  }

  /* Donut */
  .donut-row { display: grid; grid-template-columns: 160px 1fr; align-items: center; gap: 20px; }
  @media (max-width: 480px) { .donut-row { grid-template-columns: 1fr; justify-items: center; } }
  .donut { width: 160px; height: 160px; }
  .donut-seg {
    transform-origin: 70px 70px;
    stroke-dashoffset: 0;
    filter: drop-shadow(0 0 4px currentColor);
    animation: segDraw 700ms ease-out both;
    animation-delay: var(--d, 0ms);
  }
  @keyframes segDraw {
    from { opacity: 0; stroke-width: 6; }
    to   { opacity: 1; stroke-width: 18; }
  }
  .donut-num {
    font: 600 26px/1 'JetBrains Mono', monospace;
    fill: var(--ink); font-feature-settings: "tnum";
  }
  .donut-lbl {
    font: 700 9px/1 'JetBrains Mono', monospace;
    fill: var(--ink-3); letter-spacing: 0.18em;
  }
  .legend { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 7px; }
  .legend li { display: grid; grid-template-columns: 12px 1fr 32px; align-items: center; gap: 8px; font-size: 12px; color: var(--ink-2); }
  .lg-dot { width: 10px; height: 10px; border-radius: 3px; }
  .lg-val { font: 500 12px/1 'JetBrains Mono', monospace; color: var(--ink); text-align: right; font-feature-settings: "tnum"; }

  /* Health heatmap */
  .health-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
    gap: 6px;
  }
  .health-cell {
    display: grid; place-items: center;
    aspect-ratio: 1.4 / 1;
    border-radius: 9px;
    font: 600 11px/1 'JetBrains Mono', monospace;
    letter-spacing: 0.04em;
    text-decoration: none;
    border: 1px solid transparent;
    opacity: 0;
    transform: scale(0.9);
    animation: cellPop 360ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
    animation-delay: var(--d, 0ms);
    transition: transform 160ms var(--ease), box-shadow 160ms var(--ease);
  }
  @keyframes cellPop { to { opacity: 1; transform: scale(1); } }
  .health-cell:hover { transform: translateY(-1px) scale(1.02); box-shadow: 0 4px 14px -4px var(--brand-glow); }
  .health-green {
    background: var(--success-soft); color: var(--success);
    border-color: rgba(26,166,99,0.30);
  }
  .health-amber {
    background: var(--warn-soft); color: var(--warn);
    border-color: rgba(217,163,0,0.30);
  }
  .health-red {
    background: var(--danger-soft); color: var(--danger);
    border-color: rgba(217,59,59,0.30);
  }
  .hm-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
  .hm-dot.green { background: var(--success); }
  .hm-dot.amber { background: var(--warn); }
  .hm-dot.red   { background: var(--danger); }

  /* Orbital client map — CYBER COMMAND wrapper */
  .client-map-panel {
    min-height: 340px;
    position: relative;
    border-color: rgba(86,188,236,0.18);
    box-shadow:
      var(--sh-card),
      0 0 0 1px rgba(86,188,236,0.04) inset,
      0 0 60px rgba(86,188,236,0.05);
    overflow: hidden;
  }
  .client-map-panel::before {
    content: '';
    position: absolute; top: 0; left: 16px; right: 16px; height: 1px;
    background: linear-gradient(90deg, transparent, rgba(86,188,236,0.55), transparent);
    pointer-events: none;
    z-index: 1;
  }
  .orbital-map {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px 0 0;
    position: relative;
  }
  .orbital-svg {
    width: 100%;
    max-width: 520px;
    height: auto;
    overflow: visible;
  }
  /* Cyber scan line — slow vertical sweep across the map */
  .cyber-scan {
    animation: cyberScanMove 7s ease-in-out infinite;
    transform-origin: center;
    mix-blend-mode: screen;
    opacity: 0.7;
  }
  @keyframes cyberScanMove {
    0%   { transform: translateY(-200px); opacity: 0; }
    8%   { opacity: 0.6; }
    50%  { transform: translateY(0px);   opacity: 0.7; }
    92%  { opacity: 0.6; }
    100% { transform: translateY(200px); opacity: 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .cyber-scan { animation: none; opacity: 0.15; }
  }
  .mobile-only { display: none; }

  .nex-pulse {
    transform-origin: center;
    transform-box: fill-box;
    animation: nexPulse 2.8s ease-in-out infinite;
  }
  @keyframes nexPulse {
    0%, 100% { opacity: 0.45; transform: scale(1); }
    50%      { opacity: 1;    transform: scale(1.18); }
  }
  .nex-pulse-ring {
    transform-origin: center;
    transform-box: fill-box;
    animation: nexPulseRing 2.8s ease-out infinite;
  }
  @keyframes nexPulseRing {
    0%   { opacity: 0.85; transform: scale(1); }
    100% { opacity: 0;    transform: scale(1.85); }
  }
  .halo-pulse {
    transform-origin: center;
    transform-box: fill-box;
    animation: haloOuterPulse 6s ease-in-out infinite;
  }
  @keyframes haloOuterPulse {
    0%, 100% { opacity: 0.85; }
    50%      { opacity: 1; }
  }
  .nex-service-ring {
    transform-origin: center;
    transform-box: fill-box;
    animation: ringRotate 26s linear infinite;
  }
  .dist-line {
    opacity: 0;
    animation: distLineAppear 0.8s cubic-bezier(0.22, 1, 0.36, 1) forwards;
  }
  @keyframes distLineAppear {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  .data-pulse {
    stroke-dasharray: 24 180;
    animation: dataPulseFlow 4.5s linear infinite;
    animation-delay: var(--d, 0ms);
  }
  @keyframes dataPulseFlow {
    from { stroke-dashoffset: 0; opacity: 0; }
    8%   { opacity: 1; }
    92%  { opacity: 1; }
    to   { stroke-dashoffset: -240; opacity: 0; }
  }

  /* Animated orbital rings - subtle slow rotation, each at its own pace */
  .orbital-ring {
    transform-origin: center;
    transform-box: fill-box;
  }
  .orbital-ring.ring-1 { animation: ringRotate 140s linear infinite; }
  .orbital-ring.ring-2 { animation: ringRotate 200s linear infinite reverse; }
  .orbital-ring.ring-3 { animation: ringRotate 260s linear infinite; }
  @keyframes ringRotate {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }

  /* Data-stream lines from center to each node */
  .data-stream {
    animation: streamFlow 6s linear infinite;
    animation-delay: var(--d, 0ms);
  }
  @keyframes streamFlow {
    from { stroke-dashoffset: 0; }
    to   { stroke-dashoffset: -40; }
  }

  /* Center cluster */
  .nex-center {
    transform-origin: center;
    transform-box: fill-box;
  }
  .nex-orbit-ring {
    transform-origin: center;
    transform-box: fill-box;
    animation: ringRotate 38s linear infinite;
  }
  .nex-satellites {
    transform-origin: center;
    transform-box: fill-box;
    animation: ringRotate 22s linear infinite reverse;
  }
  .nex-halo-ring {
    transform-origin: center;
    transform-box: fill-box;
    animation: haloPulse 3.6s ease-in-out infinite;
  }
  @keyframes haloPulse {
    0%, 100% { stroke-opacity: 0.30; transform: scale(1); }
    50%      { stroke-opacity: 0.65; transform: scale(1.06); }
  }

  .client-node {
    opacity: 0;
    cursor: pointer;
    animation: nodeAppear 0.6s cubic-bezier(0.22, 1, 0.36, 1) forwards;
    animation-delay: var(--delay, 0ms);
    transition: filter 0.18s var(--ease), transform 0.22s cubic-bezier(0.22, 1, 0.36, 1);
    transform-origin: center;
    transform-box: fill-box;
    outline: none;
  }
  .client-node:hover,
  .client-node:focus-visible {
    filter: drop-shadow(0 0 12px var(--glow));
    transform: scale(1.15);
  }
  .client-node:hover .node-main,
  .client-node:focus-visible .node-main {
    stroke-width: 2.2;
  }
  /* Green (active) nodes glow softly all the time */
  .client-node.health-green .node-main {
    filter: drop-shadow(0 0 4px rgba(34,197,94,0.55));
  }
  .client-node .node-main {
    transition: stroke-width 0.18s var(--ease);
  }
  .node-ring {
    animation: ringPulse 3.4s ease-in-out infinite;
    animation-delay: var(--delay, 0ms);
  }
  @keyframes ringPulse {
    0%, 100% { stroke-opacity: 0.10; }
    50%      { stroke-opacity: 0.38; }
  }
  @keyframes nodeAppear {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  /* Floating label appears on hover/focus */
  .node-label {
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.18s var(--ease);
  }
  .client-node:hover .node-label,
  .client-node:focus-visible .node-label {
    opacity: 1;
  }

  /* Distributor strip below the orbital map */
  .map-distributor-label {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 8px;
    padding: 10px 12px 4px;
    border-top: 1px solid rgba(86,188,236,0.10);
    font: 600 10.5px/1.3 "JetBrains Mono", ui-monospace, monospace;
    color: rgba(86,188,236,0.78);
    letter-spacing: 0.10em;
    text-transform: uppercase;
  }
  .map-distributor-label .dist-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: #56bcec;
    box-shadow: 0 0 8px rgba(86,188,236,0.7);
    animation: nexPulse 2.4s ease-in-out infinite;
  }
  .map-distributor-label .dist-sep { color: rgba(225,238,250,0.22); }
  .map-distributor-label .dist-role { color: rgba(225,238,250,0.60); }
  .map-distributor-label .dist-stat { color: rgba(225,238,250,0.85); }

  /* Upgraded legend pills */
  .legend-inline.legend-rich {
    gap: 6px;
  }
  .legend-inline.legend-rich .lg-pill {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 4px 8px;
    border-radius: 999px;
    border: 1px solid rgba(255,255,255,0.06);
    background: rgba(255,255,255,0.025);
    font-size: 11px;
    color: var(--ink-2);
  }
  .legend-inline.legend-rich .lg-pill b {
    font-weight: 700; font-variant-numeric: tabular-nums;
    color: var(--ink-1);
  }
  .legend-inline.legend-rich .lg-pill i {
    font-style: normal; opacity: 0.6; font-size: 10.5px;
  }
  .legend-inline.legend-rich .lg-green { border-color: rgba(34,197,94,0.22); }
  .legend-inline.legend-rich .lg-amber { border-color: rgba(245,158,11,0.22); }
  .legend-inline.legend-rich .lg-red   { border-color: rgba(239,68,68,0.22); }
  .legend-inline.legend-rich .lg-mrr {
    border-color: rgba(86,188,236,0.30);
    color: #56bcec;
    font-weight: 600;
    letter-spacing: 0.04em;
  }

  @media (max-width: 860px) {
    .orbital-map { display: none; }
    .mobile-only.health-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(64px, 1fr)); gap: 6px; padding-top: 4px; }
  }

  /* Activity */
  .activity-panel { max-height: 460px; }
  .activity-list { display: flex; flex-direction: column; gap: 2px; flex: 1; overflow: auto; scrollbar-width: none; }
  .activity-list::-webkit-scrollbar { display: none; }
  .activity-row {
    display: flex; align-items: center; gap: 10px;
    padding: 8px; border-radius: 8px;
    font-size: 12.5px; color: var(--ink-2);
    transition: background var(--dur) var(--ease);
    cursor: pointer;
    animation: slideIn 380ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  @keyframes slideIn {
    from { opacity: 0; transform: translateX(14px); }
    to   { opacity: 1; transform: translateX(0); }
  }
  .activity-row:hover { background: var(--brand-soft); }
  .actor {
    width: 22px; height: 22px; border-radius: 50%;
    display: grid; place-items: center;
    font: 700 9px/1 Inter, sans-serif;
    color: white; flex-shrink: 0;
  }
  .verb { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .time { margin-left: auto; color: var(--ink-3); font: 500 11px/1 'JetBrains Mono', monospace; white-space: nowrap; }

  /* NEX Brain section */
  .brain {
    position: relative;
    padding: 0;
    overflow: hidden;
    border-color: transparent;
  }
  .brain::before {
    content: '';
    position: absolute;
    inset: -1px;
    border-radius: inherit;
    padding: 1px;
    background: conic-gradient(
      from 0deg,
      var(--brand) 0deg,
      var(--violet, #6b4fd8) 90deg,
      var(--brand-deep) 180deg,
      var(--violet, #6b4fd8) 270deg,
      var(--brand) 360deg
    );
    -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    -webkit-mask-composite: xor;
            mask-composite: exclude;
    animation: spinBorder 14s linear infinite;
    pointer-events: none;
    opacity: 0.55;
  }
  @keyframes spinBorder { to { transform: rotate(1turn); } }
  .brain-frame {
    position: relative;
    padding: 28px 28px 28px;
    background:
      radial-gradient(circle at 0% 0%, rgba(86,188,236,0.08), transparent 50%),
      radial-gradient(circle at 100% 100%, rgba(107,79,216,0.08), transparent 50%);
    border-radius: inherit;
  }
  .brain-head {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 20px;
    align-items: center;
    margin-bottom: 22px;
  }
  @media (max-width: 900px) { .brain-head { grid-template-columns: 1fr; } }
  .brain-title { display: flex; flex-direction: column; gap: 6px; position: relative; padding-left: 18px; }
  .brain-pulse {
    position: absolute; left: 0; top: 8px;
    width: 9px; height: 9px; border-radius: 50%;
    background: var(--brand);
    box-shadow: 0 0 0 0 var(--brand-glow);
    animation: pulse 2s ease-in-out infinite;
  }
  .brain-eb { color: var(--brand-deep); }
  .brain-title h2 {
    margin: 0;
    font: 600 clamp(20px, 2.4vw, 26px)/1.2 Inter, sans-serif;
    letter-spacing: -0.02em;
    color: var(--ink);
  }
  .brain-pills { display: flex; gap: 10px; flex-wrap: wrap; }
  .brain-pill {
    position: relative;
    background:
      linear-gradient(180deg, rgba(86,188,236,0.06) 0%, rgba(8,12,20,0.55) 60%);
    border: 1px solid rgba(86,188,236,0.18);
    border-radius: 12px;
    padding: 12px 14px 11px;
    min-width: 110px;
    display: flex; flex-direction: column; gap: 4px;
    overflow: hidden;
    box-shadow: 0 0 24px rgba(86,188,236,0.05) inset;
  }
  .brain-pill::before {
    content: '';
    position: absolute; top: 0; left: 8px; right: 8px; height: 1px;
    background: linear-gradient(90deg, transparent, #56bcec, transparent);
    box-shadow: 0 0 6px rgba(86,188,236,0.6);
  }
  .bp-num {
    font: 600 22px/1 'JetBrains Mono', monospace;
    color: #7CD4FF;
    letter-spacing: -0.02em;
    font-feature-settings: "tnum";
    text-shadow: 0 0 10px rgba(86,188,236,0.45);
  }
  .bp-lbl {
    font: 700 9px/1 'JetBrains Mono', monospace;
    letter-spacing: 0.18em;
    color: rgba(255,255,255,0.45);
    text-transform: uppercase;
  }

  .brain-grid {
    display: grid;
    grid-template-columns: 1.2fr 1fr;
    gap: 24px;
  }
  @media (max-width: 980px) { .brain-grid { grid-template-columns: 1fr; } }
  .sub-eb { margin: 0 0 12px; color: var(--ink-3); }

  .agent-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 10px;
  }
  .agent-card {
    background:
      linear-gradient(180deg, rgba(86,188,236,0.04) 0%, var(--canvas-2) 70%);
    border: 1px solid rgba(86,188,236,0.14);
    border-radius: 12px;
    padding: 12px 13px;
    display: flex; flex-direction: column; gap: 6px;
    position: relative;
    overflow: hidden;
    opacity: 0;
    transform: translateY(6px);
    animation: rise 360ms var(--ease) forwards;
    animation-delay: var(--d, 0ms);
    box-shadow: 0 0 18px rgba(86,188,236,0.03) inset;
  }
  .agent-card::before {
    content: '';
    position: absolute; top: 0; left: 10px; right: 10px; height: 1px;
    background: linear-gradient(90deg, transparent, rgba(86,188,236,0.45), transparent);
    pointer-events: none;
  }
  .agent-card.dot-run::after {
    content: '';
    position: absolute; inset: 0;
    background: linear-gradient(110deg, transparent 30%, var(--brand-soft) 50%, transparent 70%);
    transform: translateX(-100%);
    animation: shimmer 2.4s ease-in-out infinite;
    pointer-events: none;
  }
  @keyframes shimmer { to { transform: translateX(100%); } }
  .agent-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .agent-name {
    font: 600 12px/1.2 'JetBrains Mono', monospace;
    color: var(--ink); letter-spacing: -0.01em;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .agent-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .agent-dot.dot-ok      { background: var(--success); box-shadow: 0 0 6px var(--success), 0 0 14px color-mix(in srgb, var(--success) 55%, transparent); }
  .agent-dot.dot-run     { background: var(--warn);    box-shadow: 0 0 6px var(--warn),    0 0 14px color-mix(in srgb, var(--warn) 55%, transparent); animation: pulse 1.8s ease-in-out infinite; }
  .agent-dot.dot-err     { background: var(--danger);  box-shadow: 0 0 6px var(--danger),  0 0 14px color-mix(in srgb, var(--danger) 55%, transparent); }
  .agent-dot.dot-neutral { background: var(--ink-3); box-shadow: 0 0 4px rgba(255,255,255,0.18); }
  .agent-action {
    font-size: 11.5px; color: var(--ink-2);
    overflow: hidden; text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    min-height: 28px;
  }
  .agent-foot { display: flex; align-items: center; gap: 8px; margin-top: 2px; }
  .conf-bar {
    flex: 1; height: 4px; border-radius: 2px;
    background: var(--brand-softer);
    overflow: hidden;
  }
  .conf-bar span {
    display: block; height: 100%;
    width: var(--c, 0%);
    background: linear-gradient(90deg, var(--brand), var(--brand-deep));
    border-radius: 2px;
    transition: width 700ms var(--ease);
  }
  .agent-when {
    font: 500 10px/1 'JetBrains Mono', monospace;
    color: var(--ink-3); white-space: nowrap;
  }

  .decision-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
  .decision-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 10px;
    background: var(--canvas-2);
    border: 1px solid var(--line);
    opacity: 0;
    transform: translateX(8px);
    animation: rowIn 380ms var(--ease) forwards;
    animation-delay: var(--d, 0ms);
  }
  @keyframes rowIn { to { opacity: 1; transform: translateX(0); } }
  .decision-row .pill { flex-shrink: 0; }
  .dec-text {
    flex: 1 1 auto;
    min-width: 0;
    font-size: 12.5px; color: var(--ink-2);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .dec-when {
    flex-shrink: 0;
    font: 500 10.5px/1 'JetBrains Mono', monospace;
    color: var(--ink-3); white-space: nowrap;
  }
  .dec-votes {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }
  .vote-btn {
    width: 22px;
    height: 22px;
    border-radius: 5px;
    border: 1px solid rgba(255,255,255,0.10);
    background: rgba(255,255,255,0.04);
    color: var(--ink-3);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    transition: background 0.18s, border-color 0.18s, color 0.18s, transform 0.18s;
    flex-shrink: 0;
  }
  .vote-btn:hover { background: rgba(255,255,255,0.10); transform: translateY(-1px); }
  .vote-btn.up:hover { border-color: var(--success); color: var(--success); }
  .vote-btn.down:hover { border-color: var(--danger); color: var(--danger); }
  .vote-btn:active { transform: translateY(0); }

  /* Commitments strip */
  .commit-strip { padding: 22px 24px; }
  .commit-track {
    display: flex; gap: 10px; overflow-x: auto;
    scrollbar-width: thin;
    padding: 4px 2px;
    margin-top: 14px;
  }
  .commit-chip {
    flex-shrink: 0;
    min-width: 240px; max-width: 280px;
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--canvas-2);
    border: 1px solid var(--line);
    display: flex; flex-direction: column; gap: 8px;
    opacity: 0;
    transform: translateY(6px);
    animation: rise 360ms var(--ease) forwards;
    animation-delay: var(--d, 0ms);
  }
  .commit-chip.urg-overdue { border-color: rgba(217,59,59,0.30); background: var(--danger-soft); }
  .commit-chip.urg-today   { border-color: rgba(217,163,0,0.30); background: var(--warn-soft); }
  .commit-chip.urg-future  { border-color: var(--brand-line); }
  .cc-text { margin: 0; font-size: 12.5px; color: var(--ink); line-height: 1.4; }
  .cc-foot {
    display: flex; align-items: center; justify-content: space-between;
    font: 500 10.5px/1 'JetBrains Mono', monospace;
    color: var(--ink-3);
  }
  .cc-due { color: var(--ink-2); }
  .cc-ent {
    padding: 2px 6px;
    border-radius: 4px;
    background: var(--brand-soft);
    color: var(--brand-deep);
  }

  /* Skeleton */
  .skel-block {
    border-radius: 8px;
    background: var(--line);
    animation: skel 1.4s ease-in-out infinite;
  }
  @keyframes skel { 0%,100%{opacity:0.5} 50%{opacity:1} }

  /* Mobile module banner */
  .module-banner { display: none; }
  @media (max-width: 760px) {
    .module-banner {
      display: block;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
      padding: 0 16px 4px;
      margin-bottom: 8px;
    }
    .module-banner::-webkit-scrollbar { display: none; }
    .module-banner-track { display: flex; gap: 10px; width: max-content; }
    .module-card {
      display: flex; flex-direction: column; align-items: flex-start; gap: 4px;
      width: 120px; padding: 14px 14px 12px;
      border-radius: 14px;
      background: var(--glass-chrome);
      border: 1px solid var(--brand-line);
      backdrop-filter: var(--blur-chrome);
      -webkit-backdrop-filter: var(--blur-chrome);
      text-decoration: none; color: var(--ink);
      opacity: 0; transform: translateY(12px);
      animation: card-rise 0.4s ease forwards;
      animation-delay: var(--delay, 0ms);
      transition: border-color 0.15s, box-shadow 0.15s;
      flex-shrink: 0;
    }
    .module-card:active {
      border-color: var(--brand-line-2);
      box-shadow: 0 0 0 1px var(--brand-line-2), 0 4px 16px rgba(86,188,236,0.15);
    }
    .module-card-icon { font-size: 20px; line-height: 1; color: var(--brand); }
    .module-card-label { font: 600 13px/1.2 Inter, sans-serif; color: var(--ink); }
    .module-card-sub { font: 400 10px/1.3 Inter, sans-serif; color: var(--ink-3); }
    @keyframes card-rise { to { opacity: 1; transform: translateY(0); } }
  }

  @media (prefers-reduced-motion: reduce) {
    .live-dot, .brain-pulse { animation: none; box-shadow: 0 0 0 4px var(--brand-glow); }
    .skel-block { animation: none; opacity: 0.6; }
    .glass-card.lift:hover { transform: none; }
    .btn-primary:hover, .btn-secondary:hover { transform: none; }
    .stagger { animation: none; opacity: 1; transform: none; }
    .bar-fill { animation: none; width: var(--w); }
    .donut-seg { animation: none; }
    .health-cell { animation: none; opacity: 1; transform: none; }
    .agent-card, .decision-row, .commit-chip, .activity-row { animation: none; opacity: 1; transform: none; }
    .brain::before { animation: none; }
    .agent-card.dot-run::after { animation: none; opacity: 0; }
    .client-node { animation: none; opacity: 1; transform: none; }
    .node-ring, .nex-pulse, .nex-pulse-ring, .halo-pulse,
    .orbital-ring, .orbital-ring.ring-1, .orbital-ring.ring-2, .orbital-ring.ring-3,
    .nex-orbit-ring, .nex-satellites, .nex-halo-ring, .nex-service-ring,
    .data-stream, .data-pulse, .dist-line, .map-distributor-label .dist-dot { animation: none; }
    .dist-line { opacity: 1; }
  }

  /* ── Focus Modal ──────────────────────────────────────────────── */
  .fm-backdrop {
    position: fixed; inset: 0; z-index: 200;
    background: rgba(5,10,20,0.76);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    animation: fm-fade 200ms ease;
  }
  @keyframes fm-fade { from { opacity: 0; } to { opacity: 1; } }

  .fm-modal {
    position: fixed;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    z-index: 210;
    width: min(720px, 96vw);
    max-height: 90vh;
    overflow-y: auto;
    border-radius: 24px;
    background: var(--canvas, #0e1627);
    border: 1px solid var(--brand-line, rgba(86,188,236,0.18));
    box-shadow: 0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(86,188,236,0.08);
    animation: fm-spring 340ms cubic-bezier(0.22,1,0.36,1);
  }
  @keyframes fm-spring {
    from { opacity: 0; transform: translate(-50%,-50%) scale(0.92); }
    to   { opacity: 1; transform: translate(-50%,-50%) scale(1); }
  }

  .fm-close {
    all: unset; cursor: pointer;
    position: absolute; top: 16px; right: 16px;
    width: 32px; height: 32px;
    display: grid; place-items: center;
    border-radius: 10px;
    background: rgba(255,255,255,0.06);
    color: var(--ink-3);
    transition: background 0.15s, color 0.15s;
    z-index: 1;
  }
  .fm-close:hover { background: rgba(255,255,255,0.12); color: var(--ink); }

  .fm-hero {
    padding: 28px 28px 20px;
    border-radius: 24px 24px 0 0;
    background: linear-gradient(135deg, rgba(86,188,236,0.08) 0%, rgba(107,79,216,0.06) 100%);
    border-bottom: 1px solid var(--brand-line, rgba(86,188,236,0.12));
  }
  .fm-hero.fm-hero-prio-urgent { background: linear-gradient(135deg, rgba(239,68,68,0.10) 0%, rgba(107,79,216,0.06) 100%); }
  .fm-hero.fm-hero-prio-high   { background: linear-gradient(135deg, rgba(245,158,11,0.08) 0%, rgba(107,79,216,0.06) 100%); }

  .fm-eyebrow {
    display: flex; align-items: center; gap: 8px;
    margin-bottom: 12px;
    font: 600 10.5px/1 'JetBrains Mono', monospace;
    letter-spacing: 0.12em; text-transform: uppercase;
  }
  .fm-prio-badge {
    padding: 3px 8px; border-radius: 6px; font-size: 9.5px;
    font-weight: 700; letter-spacing: 0.1em;
  }
  .fm-prio-badge.prio-urgent { background: rgba(239,68,68,0.18); color: #f87171; }
  .fm-prio-badge.prio-high   { background: rgba(245,158,11,0.18); color: #fbbf24; }
  .fm-prio-badge.prio-medium { background: rgba(86,188,236,0.18); color: var(--brand); }
  .fm-prio-badge.prio-low    { background: rgba(148,163,184,0.18); color: var(--ink-3); }
  .fm-ticket-id {
    color: var(--brand); text-decoration: none; font-size: 11px;
    transition: color 0.15s;
  }
  .fm-ticket-id:hover { color: var(--brand-deep); text-decoration: underline; }
  .fm-eyebrow-sep { color: var(--ink-4); }
  .fm-eyebrow-label { color: var(--ink-3); }

  .fm-title {
    font: 600 clamp(18px, 2.5vw, 24px)/1.3 Inter, sans-serif;
    letter-spacing: -0.02em; color: var(--ink);
    margin: 0 0 14px; padding-right: 36px;
  }
  .fm-meta { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
  .fm-chips-row { display: flex; flex-wrap: wrap; gap: 6px; }
  .fm-chip {
    padding: 3px 10px; border-radius: 20px;
    font: 500 11px/1.4 Inter, sans-serif;
    background: rgba(255,255,255,0.07); color: var(--ink-2);
    border: 1px solid rgba(255,255,255,0.08);
  }
  .fm-chip-due { background: rgba(86,188,236,0.10); color: var(--brand); border-color: rgba(86,188,236,0.2); }
  .fm-chip-due.overdue { background: rgba(239,68,68,0.10); color: #f87171; border-color: rgba(239,68,68,0.2); }
  .fm-chip-assignee { background: rgba(107,79,216,0.12); color: var(--violet, #6b4fd8); border-color: rgba(107,79,216,0.2); }
  .fm-chip-mod  { background: rgba(86,188,236,0.08); color: var(--brand); border-color: rgba(86,188,236,0.15); }
  .fm-chip-cyc  { background: rgba(107,79,216,0.08); color: var(--violet, #6b4fd8); border-color: rgba(107,79,216,0.15); }

  .fm-body { padding: 24px 28px 28px; }
  .fm-section { margin-bottom: 24px; }
  .fm-section-title {
    font: 600 13px/1.2 Inter, sans-serif;
    letter-spacing: 0.06em; text-transform: uppercase;
    color: var(--brand); margin: 0 0 4px;
  }
  .fm-section-sub { font-size: 12px; color: var(--ink-3); margin: 0 0 18px; }

  .fm-form {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 12px;
  }
  @media (max-width: 540px) { .fm-form { grid-template-columns: 1fr 1fr; } }
  .fm-field { display: flex; flex-direction: column; gap: 6px; }
  .fm-field-full { grid-column: 1/-1; }
  .fm-label { font: 600 10.5px/1 Inter, sans-serif; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-3); }
  .fm-input, .fm-select, .fm-textarea {
    padding: 9px 12px;
    border-radius: 10px;
    background: rgba(255,255,255,0.05);
    border: 1px solid var(--line, rgba(255,255,255,0.10));
    color: var(--ink);
    font: 500 13px/1.4 Inter, sans-serif;
    outline: none;
    transition: border-color 0.15s;
    width: 100%; box-sizing: border-box;
    color-scheme: dark;
  }
  .fm-input:focus, .fm-select:focus, .fm-textarea:focus {
    border-color: var(--brand, #56bcec);
    box-shadow: 0 0 0 2px rgba(86,188,236,0.15);
  }
  .fm-textarea { resize: vertical; min-height: 60px; }
  .fm-select { cursor: pointer; }

  .fm-cal-actions { margin-top: 16px; }
  .fm-cal-btn {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 10px 20px; border-radius: 12px;
    background: var(--brand, #56bcec);
    color: #fff; font: 600 13px/1 Inter, sans-serif;
    border: none; cursor: pointer;
    transition: opacity 0.15s, transform 0.15s;
  }
  .fm-cal-btn:hover { opacity: 0.88; transform: translateY(-1px); }
  .fm-cal-btn.busy  { opacity: 0.6; cursor: not-allowed; }
  .fm-cal-ok {
    display: flex; align-items: center; gap: 8px;
    color: #4ade80; font: 600 13px/1 Inter, sans-serif;
  }

  .fm-footer {
    display: flex; align-items: center; justify-content: flex-end; gap: 12px;
    padding-top: 16px; border-top: 1px solid var(--line, rgba(255,255,255,0.07));
  }
  .fm-action-secondary {
    all: unset; cursor: pointer;
    padding: 10px 20px; border-radius: 12px;
    font: 600 13px/1 Inter, sans-serif; color: var(--ink-2);
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.08);
    transition: background 0.15s;
  }
  .fm-action-secondary:hover { background: rgba(255,255,255,0.10); }
  .fm-action-primary {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 10px 22px; border-radius: 12px;
    background: linear-gradient(135deg, var(--brand, #56bcec), var(--violet, #6b4fd8));
    color: #fff; font: 700 13px/1 Inter, sans-serif;
    border: none; cursor: pointer;
    box-shadow: 0 4px 16px rgba(86,188,236,0.28);
    transition: opacity 0.15s, transform 0.15s;
  }
  .fm-action-primary:hover { opacity: 0.9; transform: translateY(-1px); }

  /* ── Defer Sheet ──────────────────────────────────────────────── */
  .def-backdrop {
    position: fixed; inset: 0; z-index: 200;
    background: rgba(5,10,20,0.60);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    animation: fm-fade 200ms ease;
  }
  .def-sheet {
    position: fixed;
    bottom: 0; left: 0; right: 0;
    z-index: 210;
    padding: 0 0 calc(24px + var(--safe-bottom, 0px));
    border-radius: 24px 24px 0 0;
    background: var(--canvas, #0e1627);
    border-top: 1px solid var(--brand-line, rgba(86,188,236,0.18));
    box-shadow: 0 -8px 40px rgba(0,0,0,0.4);
    animation: sheet-up 320ms cubic-bezier(0.32,0.72,0,1);
  }
  @keyframes sheet-up { from { transform: translateY(100%); } to { transform: translateY(0); } }

  .def-handle { width: 40px; height: 4px; border-radius: 2px; background: var(--ink-4); margin: 12px auto 0; }
  .def-title  { font: 700 17px/1.2 Inter, sans-serif; color: var(--ink); margin: 16px 20px 4px; }
  .def-sub    { font: 400 12px/1.4 Inter, sans-serif; color: var(--ink-3); margin: 0 20px 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .def-options { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 0 20px 16px; }
  .def-opt {
    all: unset; cursor: pointer;
    display: flex; flex-direction: column; align-items: flex-start; gap: 4px;
    padding: 14px 16px;
    border-radius: 14px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.08);
    transition: background 0.15s, border-color 0.15s;
  }
  .def-opt:hover, .def-opt:active {
    background: rgba(86,188,236,0.10);
    border-color: rgba(86,188,236,0.25);
  }
  .def-opt-label { font: 600 14px/1.2 Inter, sans-serif; color: var(--ink); }
  .def-opt-date  { font: 500 11px/1 'JetBrains Mono', monospace; color: var(--brand); }
  .def-cancel {
    all: unset; cursor: pointer; display: block;
    width: calc(100% - 40px); margin: 0 20px;
    padding: 13px; text-align: center;
    font: 600 14px/1 Inter, sans-serif; color: var(--ink-2);
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 14px;
    transition: background 0.15s;
  }
  .def-cancel:hover { background: rgba(255,255,255,0.08); }

  /* ───────── AI Monitor link card ───────── */
  .aim-eb { color: #56bcec; }
  .aim-link-card {
    display: flex; justify-content: space-between; align-items: center;
    padding: 18px 22px; gap: 20px; flex-wrap: wrap;
    text-decoration: none; color: inherit;
    border-color: rgba(86,188,236,0.14);
    background:
      radial-gradient(circle at 0% 50%, rgba(86,188,236,0.05), transparent 50%),
      var(--glass-card);
    transition: border-color 0.15s, background 0.15s;
  }
  .aim-link-card:hover {
    border-color: rgba(86,188,236,0.3);
    background:
      radial-gradient(circle at 0% 50%, rgba(86,188,236,0.09), transparent 50%),
      var(--glass-card);
  }
  .aim-lc-left { display: flex; align-items: flex-start; gap: 18px; position: relative; }
  .aim-lc-pulse {
    position: absolute; top: 4px; left: -14px;
    width: 7px; height: 7px; border-radius: 50%;
    background: #56bcec;
    box-shadow: 0 0 0 0 rgba(86,188,236,0.5);
    animation: aim-lc-pulse 1.8s infinite;
  }
  @keyframes aim-lc-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(86,188,236,0.6); }
    50%       { box-shadow: 0 0 0 8px rgba(86,188,236,0); }
  }
  .aim-lc-title {
    margin: 4px 0 5px; font: 600 17px/1.15 Inter, sans-serif;
    color: var(--ink); letter-spacing: -0.015em;
  }
  .aim-lc-sub { font: 400 12px/1.4 Inter, sans-serif; color: var(--ink-3); margin: 0; }
  .aim-lc-pills { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
  .aim-lc-stat {
    display: flex; flex-direction: column; gap: 2px; min-width: 56px;
  }
  .aim-lc-stat span {
    font: 700 20px/1 'JetBrains Mono', monospace; color: #56bcec;
  }
  .aim-lc-stat i {
    font-style: normal; font: 600 9px/1 'JetBrains Mono', monospace;
    letter-spacing: 0.1em; color: var(--ink-3); text-transform: uppercase;
  }
  .aim-lc-arrow { color: var(--ink-3); transition: color 0.15s, transform 0.15s; }
  .aim-link-card:hover .aim-lc-arrow { color: #56bcec; transform: translateX(3px); }

  /* ── RailGuard Widget ───────────────────────────────────────── */
  .rg-widget { position: relative; overflow: hidden; }
  .rg-widget::before {
    content: '';
    position: absolute; top: 0; left: 0; right: 0; height: 2px;
    background: linear-gradient(90deg, #f72585 0%, #f5b850 35%, #56bcec 65%, #46a758 100%);
    opacity: 0.7;
  }

  .rg-head-right { display: flex; align-items: center; gap: 10px; }
  .rg-holds-badge {
    font: 700 10px/1 'JetBrains Mono', monospace; letter-spacing: 0.08em;
    color: #f5b850; border: 1px solid rgba(245,184,80,0.4);
    background: rgba(245,184,80,0.08); border-radius: 4px;
    padding: 3px 7px;
    animation: rg-badge-pulse 1.6s ease-in-out infinite;
  }
  @keyframes rg-badge-pulse {
    0%, 100% { opacity: 0.8; }
    50%       { opacity: 1; box-shadow: 0 0 6px rgba(245,184,80,0.35); }
  }
  .rg-open-link {
    display: flex; align-items: center; justify-content: center;
    color: var(--ink-3); transition: color 0.15s;
  }
  .rg-open-link:hover { color: #56bcec; }

  .rg-stats-row {
    display: flex; gap: 0; margin: 12px 0 14px;
    border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; overflow: hidden;
  }
  .rg-stat {
    flex: 1; display: flex; flex-direction: column; gap: 3px;
    padding: 10px 14px; align-items: center;
    border-right: 1px solid rgba(255,255,255,0.06);
  }
  .rg-stat:last-child { border-right: none; }
  .rg-stat-num {
    font: 700 22px/1 'JetBrains Mono', monospace;
  }
  .rg-stat-num.rg-block { color: #f72585; }
  .rg-stat-num.rg-hold  { color: #f5b850; }
  .rg-stat-num.rg-pass  { color: #46a758; }
  .rg-pct { font-size: 13px; }
  .rg-stat-lbl {
    font: 600 9px/1 'JetBrains Mono', monospace; letter-spacing: 0.1em;
    color: var(--ink-3); text-transform: uppercase;
  }

  .rg-event-list { display: flex; flex-direction: column; gap: 4px; }
  .rg-empty { font: 400 12px/1.4 Inter, sans-serif; color: var(--ink-3); margin: 0; text-align: center; padding: 12px 0; }

  .rg-event-row {
    display: flex; align-items: center; gap: 8px;
    padding: 5px 8px; border-radius: 6px;
    background: rgba(255,255,255,0.025);
    font: 400 12px/1 Inter, sans-serif;
    transition: background 0.12s;
  }
  .rg-event-row:hover { background: rgba(255,255,255,0.045); }

  .rg-badge {
    font: 700 9px/1 'JetBrains Mono', monospace; letter-spacing: 0.06em;
    border-radius: 3px; padding: 2px 5px; flex-shrink: 0;
  }
  .rg-badge-block { color: #f72585; background: rgba(247,37,133,0.12); border: 1px solid rgba(247,37,133,0.25); }
  .rg-badge-hold  { color: #f5b850; background: rgba(245,184,80,0.10); border: 1px solid rgba(245,184,80,0.22); }
  .rg-badge-flag  { color: #56bcec; background: rgba(86,188,236,0.10); border: 1px solid rgba(86,188,236,0.22); }
  .rg-badge-pass  { color: #46a758; background: rgba(70,167,88,0.10);  border: 1px solid rgba(70,167,88,0.22);  }

  .rg-rail-name {
    font: 500 11px/1 Inter, sans-serif; color: var(--ink-2); flex-shrink: 0;
    text-transform: uppercase; letter-spacing: 0.04em;
  }
  .rg-reason {
    font: 400 11px/1.2 Inter, sans-serif; color: var(--ink-3);
    flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .rg-ts {
    font: 400 10px/1 'JetBrains Mono', monospace; color: var(--ink-3);
    flex-shrink: 0; margin-left: auto;
  }
</style>

/**
 * Supabase client — typed Realtime access to entity_state + audit_log.
 * Public env (exposed to browser) — read-only via RLS.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { browser } from "$app/environment";
import { env as publicEnv } from "$env/dynamic/public";
import {
  subscribeEntityStatePusher,
  subscribeAuditLogPusher,
  subscribeReasoningEdgesPusher,
  subscribeReasoningThoughtsPusher,
  subscribeScheduledBlocksPusher,
  subscribeCustomerMasterPusher,
  subscribeTimeEntriesPusher,
  subscribeTeamCapacityPusher,
  subscribeAbsencesPusher,
  subscribeUserProfilesPusher,
} from "$lib/pusher-realtime";

// SvelteKit exposes env vars prefixed PUBLIC_ via $env/dynamic/public (runtime-read)
// and $env/static/public (build-time). We use dynamic so a single build can be
// re-deployed across environments with different values.
const URL = publicEnv.PUBLIC_SUPABASE_URL  ?? (import.meta.env.PUBLIC_SUPABASE_URL  as string | undefined) ?? "";
const KEY = publicEnv.PUBLIC_SUPABASE_ANON ?? (import.meta.env.PUBLIC_SUPABASE_ANON as string | undefined) ?? "";

let _client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (_client) return _client;
  if (!URL || !KEY) {
    // Stub that throws on real queries — caller can feature-detect via hasClient().
    _client = createClient("https://stub.invalid", "stub", {
      auth: { persistSession: false },
    });
    return _client;
  }
  _client = createClient(URL, KEY, {
    auth: {
      persistSession: true,
      // PKCE flow: GoTrue v2.189 always returns ?code=... on /callback (it
      // ignores any client-side `flowType: 'implicit'` request and uses
      // server-side PKCE internally — verified 2026-05-17 from gotrue logs).
      // detectSessionInUrl: false so /auth/callback has sole control of the
      // code-for-session exchange (prevents double-setSession on init+mount).
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
    realtime: { params: { eventsPerSecond: 10 } },
  });
  return _client;
}

export function hasClient(): boolean {
  return Boolean(URL && KEY);
}

// ───────── typed helpers ─────────
export type EntityState = {
  entity_type: string;
  entity_id: string;
  state: Record<string, any>;
  updated_at: string;
};

export type AuditRow = {
  id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  entity_name: string | null;
  actor: string | null;
  details: Record<string, any> | null;
  created_at: string;
};

export async function listEntityState(entityType: string, limit = 500): Promise<EntityState[]> {
  if (!hasClient()) return [];
  const { data, error } = await supabase()
    .from("entity_state")
    .select("entity_type,entity_id,state,updated_at")
    .eq("entity_type", entityType)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) { console.error("[supabase] listEntityState", error.message); return []; }
  return (data ?? []) as EntityState[];
}

// Fetches open (non-completed/cancelled) tickets only — avoids bulk-sync pollution of updated_at
// pushing open tickets below the fetch limit in the full entity_state query.
export async function listOpenTickets(limit = 2000): Promise<EntityState[]> {
  if (!hasClient()) return [];
  const { data, error } = await supabase()
    .from("entity_state")
    .select("entity_type,entity_id,state,updated_at")
    .eq("entity_type", "ticket")
    .neq("state->>state_group", "completed")
    .neq("state->>state_group", "cancelled")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[supabase] listOpenTickets", error.message);
    // Fallback: fetch unfiltered and filter client-side
    return listEntityState("ticket", limit);
  }
  return (data ?? []) as EntityState[];
}

export async function recentAudit(limit = 200): Promise<AuditRow[]> {
  if (!hasClient()) return [];
  const { data, error } = await supabase()
    .from("audit_log")
    .select("id,action,entity_type,entity_id,entity_name,actor,details,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) { console.error("[supabase] recentAudit", error.message); return []; }
  return (data ?? []) as AuditRow[];
}

// ───────── F11 SLA tracking (audit fix 2026-05-15) ─────────
export type TurnLatencySummary = {
  turns_24h: number;
  turns_with_reply: number;
  p50_total_ms: number | null;
  p90_total_ms: number | null;
  p99_total_ms: number | null;
  max_total_ms: number | null;
  p50_full_ms: number | null;
  p90_full_ms: number | null;
  p99_full_ms: number | null;
  over_60s: number;
  over_120s: number;
  push_enforced_count: number;
};

export async function fetchTurnLatencySummary(): Promise<TurnLatencySummary | null> {
  if (!hasClient()) return null;
  const { data, error } = await supabase()
    .from("nex_turn_latency_summary")
    .select("*")
    .limit(1)
    .single();
  if (error) {
    console.error("[supabase] fetchTurnLatencySummary", error.message);
    return null;
  }
  return data as TurnLatencySummary;
}

export type TurnLatencyRow = {
  id: number;
  message_id: number;
  received_at: string;
  total_lag_ms: number | null;
  full_turn_ms: number | null;
  push_enforced: boolean;
  voice: boolean;
};

export async function fetchRecentTurnLatency(limit = 30): Promise<TurnLatencyRow[]> {
  if (!hasClient()) return [];
  const { data, error } = await supabase()
    .from("nex_turn_latency_recent")
    .select("id,message_id,received_at,total_lag_ms,full_turn_ms,push_enforced,voice")
    .limit(limit);
  if (error) {
    console.error("[supabase] fetchRecentTurnLatency", error.message);
    return [];
  }
  return (data ?? []) as TurnLatencyRow[];
}

// ───────── Realtime subscriptions with retry ─────────
type EntityStateHandler = (row: EntityState) => void;
type AuditHandler       = (row: AuditRow) => void;

export function subscribeEntityState(entityType: string, onChange: EntityStateHandler): () => void {
  if (!browser) return () => {};
  return subscribeEntityStatePusher(entityType, row => {
    if (row && row.entity_type === entityType) onChange(row as unknown as EntityState);
  });
}

// ───────── NEX Brain Phase 2: Active Learning Loop ─────────

export type Decision = {
  id: string;
  created_at: string;
  decided_at: string | null;
  context: Record<string, any> | null;
  decision: string | null;
  rationale: string | null;
  outcome: "won" | "lost" | "neutral" | "broken" | null;
  outcome_at: string | null;
  outcome_observed_at: string | null;
  client_code: string | null;
  client_id: string | null;
  tags: string[] | null;
  source: string | null;
  brain_written: boolean;
  recommendation: string | null;
  chosen_action: "followed" | "modified" | "rejected" | null;
  confidence_pre: number | null;
  confidence_post: number | null;
  recommended_by: string | null;
  target_entity_id: string | null;
};

/** Fetch decisions whose decided_at is within the last `days` days. */
export async function recentDecisions(days = 90, limit = 1000): Promise<Decision[]> {
  if (!hasClient()) return [];
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
  const { data, error } = await supabase()
    .from("decisions")
    .select("*")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) { console.error("[supabase] recentDecisions", error.message); return []; }
  return (data ?? []) as Decision[];
}

// ───────── Phase K: Reasoning Graph ─────────

export type ReasoningEdge = {
  id: string;
  chain_id: string;
  edge_kind: "trigger" | "premise" | "inference" | "action" | "artifact" | "correction" | "dependency";
  from_type: string;
  from_id: string;
  to_type: string;
  to_id: string;
  weight: number;
  label: string | null;
  rationale: string | null;
  actor: string | null;
  created_at: string;
};

export type ReasoningThought = {
  id: string;
  chain_id: string;
  kind: "observation" | "hypothesis" | "question" | "conclusion";
  content: string;
  entity_ref: { type?: string; id?: string; name?: string } | null;
  actor: string;
  confidence: number | null;
  created_at: string;
};

export async function recentReasoningEdges(limit = 500): Promise<ReasoningEdge[]> {
  if (!hasClient()) return [];
  const { data, error } = await supabase()
    .from("exeo_reasoning_edges")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) { console.error("[supabase] recentReasoningEdges", error.message); return []; }
  return (data ?? []) as ReasoningEdge[];
}

export async function recentReasoningThoughts(limit = 500): Promise<ReasoningThought[]> {
  if (!hasClient()) return [];
  const { data, error } = await supabase()
    .from("exeo_thoughts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) { console.error("[supabase] recentReasoningThoughts", error.message); return []; }
  return (data ?? []) as ReasoningThought[];
}

type EdgeHandler    = (row: ReasoningEdge) => void;
type ThoughtHandler = (row: ReasoningThought) => void;

export function subscribeReasoningEdges(onChange: EdgeHandler): () => void {
  if (!browser) return () => {};
  return subscribeReasoningEdgesPusher(row => onChange(row as unknown as ReasoningEdge));
}

export function subscribeReasoningThoughts(onChange: ThoughtHandler): () => void {
  if (!browser) return () => {};
  return subscribeReasoningThoughtsPusher(row => onChange(row as unknown as ReasoningThought));
}

export function subscribeAuditLog(onChange: AuditHandler): () => void {
  if (!browser) return () => {};
  return subscribeAuditLogPusher(row => onChange(row as unknown as AuditRow));
}

// ───────── Scheduled Blocks ─────────────────────────────────────────

export type ScheduledBlock = {
  id: string;
  ticket_id: string;
  ticket_name: string;
  client_code: string;
  priority: string;
  day: string;
  start_hour: number;
  duration_hours: number;
  assignee_code: string;
  m365_event_id?: string;
  color?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  user_id?: string | null;
  approval_status?: "draft" | "submitted" | "approved" | "rejected" | null;
  plan_period_start?: string | null;
  submitted_at?: string | null;
  submitted_by?: string | null;
  decided_at?: string | null;
  decided_by?: string | null;
  rejection_reason?: string | null;
};

export async function listStaleBlocks(): Promise<ScheduledBlock[]> {
  if (!hasClient()) return [];
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase()
    .from("scheduled_blocks")
    .select("*")
    .lt("day", today)
    .order("day", { ascending: false })
    .limit(300);
  if (error) { console.error("[supabase] listStaleBlocks", error.message); return []; }
  return (data ?? []) as ScheduledBlock[];
}

export async function listScheduledBlocks(weekStart: Date): Promise<ScheduledBlock[]> {
  if (!hasClient()) return [];
  const from = weekStart.toISOString().slice(0, 10);
  const to = new Date(weekStart.getTime() + 7 * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await supabase()
    .from("scheduled_blocks")
    .select("*")
    .gte("day", from)
    .lt("day", to)
    .order("day").order("start_hour");
  if (error) { console.error("[supabase] listScheduledBlocks", error.message); return []; }
  return (data ?? []) as ScheduledBlock[];
}

export async function upsertScheduledBlock(block: ScheduledBlock): Promise<ScheduledBlock | null> {
  if (!hasClient()) return null;
  const payload: any = { ...block, updated_at: new Date().toISOString() };
  if (!payload.id) delete payload.id;
  const { data, error } = await supabase()
    .from("scheduled_blocks")
    .upsert(payload, { onConflict: "id" })
    .select()
    .single();
  if (error) { console.error("[supabase] upsertScheduledBlock", error.message); return null; }
  return data as ScheduledBlock;
}

export async function deleteScheduledBlock(id: string): Promise<boolean> {
  if (!hasClient()) return false;
  const { error } = await supabase().from("scheduled_blocks").delete().eq("id", id);
  if (error) { console.error("[supabase] deleteScheduledBlock", error.message); return false; }
  return true;
}

type BlockHandler = (row: ScheduledBlock) => void;

export function subscribeScheduledBlocks(onChange: BlockHandler): () => void {
  if (!browser) return () => {};
  return subscribeScheduledBlocksPusher(row => onChange(row as unknown as ScheduledBlock));
}
// ───────── Customer Master (Evening 2 CRM — migration 027) ─────────

export type CustomerLifecycle =
  | "cold_queued" | "outreached" | "replied"
  | "discovery" | "proposal_sent" | "negotiation" | "pre_contract"
  | "active" | "dormant" | "lost";

export type CustomerLifecycleGroup =
  | "prospect" | "sales" | "customer" | "inactive" | "lost";

export type CustomerContractType = "retainer" | "project" | "hybrid" | "none";

export type CustomerMaster = {
  client_code: string;
  display_name: string;
  legal_name: string | null;
  lifecycle: CustomerLifecycle;
  lifecycle_group: CustomerLifecycleGroup;
  lifecycle_changed_at: string;
  contract_type: CustomerContractType;
  owner_user_id: string | null;
  source: string | null;
  plane_customer_id: string | null;
  bexio_contact_id: number | null;
  obsidian_note_path: string | null;
  domain: string | null;
  website: string | null;
  industry: string | null;
  vertical_pack: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  canton_or_bezirk: string | null;
  country_code: string;
  language: string;
  employees: number | null;
  legal_form: string | null;
  date_of_entry: string | null;
  uid_or_fn: string | null;
  plane_customer_status: string | null;
  primary_contact_name: string | null;
  primary_contact_title: string | null;
  primary_contact_email: string | null;
  primary_contact_phone: string | null;
  primary_contact_linkedin: string | null;
  decision_makers: Record<string, any>[];
  prospect_score: number | null;
  english_score: number | null;
  source_url: string | null;
  source_timestamp: string | null;
  legal_basis: string | null;
  first_touch_at: string | null;
  last_touch_at: string | null;
  next_action_at: string | null;
  next_action_owner: string | null;
  outreach_drafts: Record<string, any>;
  cold_notes: string | null;
  contract_status: string | null;
  contract_start: string | null;
  contract_end: string | null;
  billing_type: string | null;
  monthly_revenue: number | null;
  annual_revenue_chf: number | null;
  total_revenue_ytd: number;
  invoice_count: number;
  first_invoice_date: string | null;
  last_invoice_date: string | null;
  open_tickets_count: number;
  overdue_tickets_count: number;
  next_deadline: string | null;
  last_activity_at: string | null;
  engagement_score: number | null;
  priority: number;
  tags: string[] | null;
  brand_primary: string | null;
  brand_secondary: string | null;
  brand_logo_path: string | null;
  is_active: boolean;
  is_case_study: boolean;
  created_at: string;
  updated_at: string;
};

/** Fetch customer rows from the safe view (revenue masked).
 *  Optional `groups` param filters by lifecycle_group server-side — used to
 *  split surfaces: CRM uses ['prospect','sales','lost'], Clients uses
 *  ['customer','inactive']. Empty/omitted = all groups (admin overlays).
 *  RLS gates by role server-side. */
export async function listCustomerMaster(
  limit = 500,
  opts: { groups?: CustomerLifecycleGroup[] } = {}
): Promise<CustomerMaster[]> {
  if (!hasClient()) return [];
  let q = supabase()
    .from("customer_master_safe")
    .select("*")
    .order("lifecycle_group", { ascending: true })
    .order("priority", { ascending: true })
    .order("client_code", { ascending: true })
    .limit(limit);
  if (opts.groups && opts.groups.length > 0) q = q.in("lifecycle_group", opts.groups);
  const { data, error } = await q;
  if (error) { console.error("[supabase] listCustomerMaster", error.message); return []; }
  return (data ?? []) as CustomerMaster[];
}

/** Admin-only variant: full customer_master with revenue. Use this only when
 *  the session is known to be ceo (e.g. /revenue page, admin overlays). */
export async function listCustomerMasterAdmin(limit = 500): Promise<CustomerMaster[]> {
  if (!hasClient()) return [];
  const { data, error } = await supabase()
    .from("customer_master")
    .select("*")
    .order("lifecycle_group", { ascending: true })
    .order("monthly_revenue", { ascending: false, nullsFirst: false })
    .order("client_code", { ascending: true })
    .limit(limit);
  if (error) { console.error("[supabase] listCustomerMasterAdmin", error.message); return []; }
  return (data ?? []) as CustomerMaster[];
}

/** Subscribe to live customer_master changes (INSERT + UPDATE + DELETE).
 *  Refcounted singleton — multiple surfaces (CRM + Clients) share one
 *  underlying Realtime channel. Handlers filter client-side; the channel
 *  attaches on first subscriber and detaches when the last unsubscribes. */
type CustomerMasterHandler = (row: CustomerMaster, event: "INSERT" | "UPDATE" | "DELETE") => void;

let _cmHandlers = new Set<CustomerMasterHandler>();
let _cmUnsub: (() => void) | null = null;

export function subscribeCustomerMaster(onChange: CustomerMasterHandler): () => void {
  if (!browser) return () => {};
  _cmHandlers.add(onChange);
  if (!_cmUnsub) {
    _cmUnsub = subscribeCustomerMasterPusher(raw => {
      const row = raw as unknown as CustomerMaster;
      const op = (raw._op as string) ?? 'UPDATE';
      const event = op === 'INSERT' ? 'INSERT' : op === 'DELETE' ? 'DELETE' : 'UPDATE';
      for (const h of _cmHandlers) {
        try { h(row, event as "INSERT" | "UPDATE" | "DELETE"); } catch (e) {
          console.warn('[subscribeCustomerMaster handler]', e);
        }
      }
    });
  }
  return () => {
    _cmHandlers.delete(onChange);
    if (_cmHandlers.size === 0 && _cmUnsub) {
      _cmUnsub();
      _cmUnsub = null;
    }
  };
}

/** Per-customer activity timeline (status changes, notes, draft edits, etc) */
export type CustomerActivity = {
  id: string;
  client_code: string;
  actor: string | null;
  actor_label: string | null;
  action: string;
  payload: Record<string, any> | null;
  created_at: string;
};

export async function listCustomerActivities(clientCode: string, limit = 50): Promise<CustomerActivity[]> {
  if (!hasClient()) return [];
  const { data, error } = await supabase()
    .from("customer_activities")
    .select("*")
    .eq("client_code", clientCode)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) { console.error("[supabase] listCustomerActivities", error.message); return []; }
  return (data ?? []) as CustomerActivity[];
}

/* ════════════════════════════════════════════════════════════════════
   Workstream T — Tracker Realtime + reads
   ════════════════════════════════════════════════════════════════════ */

export type TimeEntry = {
  id: string;
  user_id: string;
  plane_issue_id: string | null;
  plane_issue_seq: string | null;
  client_code: string | null;
  project_code: string | null;
  description: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  idle_seconds: number;
  is_billable: boolean;
  source: "manual" | "timer" | "plane_pull" | "calendar_auto";
  rate_chf_per_hour: number | null;
  plane_worklog_id: string | null;
  plane_sync_state: "pending" | "synced" | "conflict" | "skip";
  plane_synced_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // CHRONEX additions (2026-05-25): task linkage, entry typing, materialised CHF.
  client_task_id?: string | null;
  entry_type?: "tracked" | "manual" | "sick" | "travel" | "vacation" | "training" | "personal" | null;
  amount_chf?: number | null;
};

export type TeamCapacity = {
  user_id: string;
  fte_percent: number;
  weekly_target_hours: number;
  daily_target_hours: number;
  effective_from: string;
  updated_by: string | null;
  updated_at: string;
};

export type Absence = {
  id: string;
  user_id: string;
  kind: "vacation" | "sick" | "personal" | "training" | "unpaid";
  start_date: string;
  end_date: string;
  hours_per_day: number | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  requested_at: string;
  decided_by: string | null;
  decided_at: string | null;
  reason: string | null;
  decision_notes: string | null;
};

export type TrackerSettings = {
  user_id: string;
  idle_threshold_minutes: number;
  rounding_minutes: number;
  rounding_mode: "nearest" | "up" | "down" | "none";
  eod_reminder_enabled: boolean;
  eod_reminder_local_time: string;
  auto_pause_in_meetings: boolean;
  default_billable: boolean;
  push_to_plane: boolean;
  preferred_timezone: string;
  sound_cue_on_stop: boolean;
  updated_at: string;
};

/** Returns the currently running entry for the caller, if any. */
export async function fetchRunningEntry(userId: string): Promise<TimeEntry | null> {
  if (!hasClient() || !userId) return null;
  const { data, error } = await supabase()
    .from("time_entries")
    .select("*")
    .eq("user_id", userId)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) { console.warn("[supabase] fetchRunningEntry", error.message); return null; }
  return (data as TimeEntry) ?? null;
}

/** Last N closed entries for the caller (history view). */
export async function listMyTimeEntries(userId: string, limit = 100): Promise<TimeEntry[]> {
  if (!hasClient() || !userId) return [];
  const { data, error } = await supabase()
    .from("time_entries")
    .select("*")
    .eq("user_id", userId)
    .not("ended_at", "is", null)
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) { console.warn("[supabase] listMyTimeEntries", error.message); return []; }
  return (data ?? []) as TimeEntry[];
}

/** Fetch all entries for one Plane issue (for TicketSheet's Worklogs tab live read). */
export async function listEntriesForIssue(planeIssueId: string): Promise<TimeEntry[]> {
  if (!hasClient() || !planeIssueId) return [];
  const { data, error } = await supabase()
    .from("time_entries")
    .select("*")
    .eq("plane_issue_id", planeIssueId)
    .order("started_at", { ascending: false });
  if (error) { console.warn("[supabase] listEntriesForIssue", error.message); return []; }
  return (data ?? []) as TimeEntry[];
}

/** Fetch caller's team_capacity row (auto-falls back to defaults if missing). */
export async function fetchTeamCapacity(userId: string): Promise<TeamCapacity | null> {
  if (!hasClient() || !userId) return null;
  const { data, error } = await supabase()
    .from("team_capacity")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) { console.warn("[supabase] fetchTeamCapacity", error.message); return null; }
  return (data as TeamCapacity) ?? null;
}

/* ─── Realtime: refcounted singleton on time_entries ───────────────── */
type TimeEntryHandler = (row: TimeEntry, event: "INSERT" | "UPDATE" | "DELETE") => void;

let _teHandlers = new Set<TimeEntryHandler>();
let _teUnsub: (() => void) | null = null;

/** Subscribe to live time_entries changes. Refcounted singleton. */
export function subscribeTimeEntries(onChange: TimeEntryHandler): () => void {
  if (!browser) return () => {};
  _teHandlers.add(onChange);
  if (!_teUnsub) {
    _teUnsub = subscribeTimeEntriesPusher(raw => {
      const row = raw as unknown as TimeEntry;
      const op = (raw._op as string) ?? 'UPDATE';
      const event = op === 'INSERT' ? 'INSERT' : op === 'DELETE' ? 'DELETE' : 'UPDATE';
      for (const h of _teHandlers) { try { h(row, event as "INSERT" | "UPDATE" | "DELETE"); } catch (e) { console.warn("[subscribeTimeEntries handler]", e); } }
    });
  }
  return () => {
    _teHandlers.delete(onChange);
    if (_teHandlers.size === 0 && _teUnsub) { _teUnsub(); _teUnsub = null; }
  };
}

/* ─── Realtime: team_capacity (used by CapacityBar live updates) ──── */
type TeamCapacityHandler = (row: TeamCapacity, event: "INSERT" | "UPDATE" | "DELETE") => void;
let _tcHandlers = new Set<TeamCapacityHandler>();
let _tcUnsub: (() => void) | null = null;

export function subscribeTeamCapacity(onChange: TeamCapacityHandler): () => void {
  if (!browser) return () => {};
  _tcHandlers.add(onChange);
  if (!_tcUnsub) {
    _tcUnsub = subscribeTeamCapacityPusher(raw => {
      const row = raw as unknown as TeamCapacity;
      const op = (raw._op as string) ?? 'UPDATE';
      const event = op === 'INSERT' ? 'INSERT' : op === 'DELETE' ? 'DELETE' : 'UPDATE';
      for (const h of _tcHandlers) { try { h(row, event as "INSERT" | "UPDATE" | "DELETE"); } catch (e) { console.warn("[subscribeTeamCapacity handler]", e); } }
    });
  }
  return () => {
    _tcHandlers.delete(onChange);
    if (_tcHandlers.size === 0 && _tcUnsub) { _tcUnsub(); _tcUnsub = null; }
  };
}

/** Cookie-primary POST to a backend function. Returns parsed JSON or throws.
 * Always sends credentials (exeo_token cookie). Attaches GoTrue Bearer if a
 * Supabase session exists, but does NOT require one — custom cookie auth suffices. */
export async function postAuthed(path: string, body: any): Promise<any> {
  if (!browser) throw new Error("not ready");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (hasClient()) {
    const { data: sess } = await supabase().auth.getSession();
    const t = sess?.session?.access_token;
    if (t) headers["Authorization"] = `Bearer ${t}`;
  }
  const r = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify(body ?? {}),
  });
  const json = await r.json().catch(() => null);
  if (!r.ok) throw new Error(json?.error || `${path} → ${r.status}`);
  return json;
}

/** Cookie-primary GET to a backend function. Returns parsed JSON or throws.
 * Always sends credentials (exeo_token cookie). Attaches GoTrue Bearer if a
 * Supabase session exists, but does NOT require one — custom cookie auth suffices. */
export async function getAuthed(path: string): Promise<any> {
  if (!browser) throw new Error("not ready");
  const headers: Record<string, string> = { Accept: "application/json" };
  if (hasClient()) {
    const { data: sess } = await supabase().auth.getSession();
    const t = sess?.session?.access_token;
    if (t) headers["Authorization"] = `Bearer ${t}`;
  }
  const r = await fetch(path, {
    method: "GET",
    credentials: "include",
    headers,
  });
  const json = await r.json().catch(() => null);
  if (!r.ok) throw new Error(json?.error || `${path} → ${r.status}`);
  return json;
}

/* ════════════════════════════════════════════════════════════════════
   U.3 — remaining tracker Realtime subscriptions
   ────────────────────────────────────────────────────────────────────
   Refcounted-singleton pattern (matches subscribeCustomerMaster). Used by
   /tracker/plan + /admin/tracker + future surfaces.
   ════════════════════════════════════════════════════════════════════ */

/* ─── Realtime: scheduled_blocks as planned_blocks ─── */
type ScheduledBlockHandler = (row: ScheduledBlock, event: "INSERT" | "UPDATE" | "DELETE") => void;
let _sbHandlers = new Set<ScheduledBlockHandler>();
let _sbUnsub2: (() => void) | null = null;

export function subscribePlannedBlocks(onChange: ScheduledBlockHandler): () => void {
  if (!browser) return () => {};
  _sbHandlers.add(onChange);
  if (!_sbUnsub2) {
    _sbUnsub2 = subscribeScheduledBlocksPusher(raw => {
      const row = raw as unknown as ScheduledBlock;
      const op = (raw._op as string) ?? 'UPDATE';
      const event = op === 'INSERT' ? 'INSERT' : op === 'DELETE' ? 'DELETE' : 'UPDATE';
      for (const h of _sbHandlers) { try { h(row, event as "INSERT" | "UPDATE" | "DELETE"); } catch (e) { console.warn("[subscribePlannedBlocks handler]", e); } }
    });
  }
  return () => {
    _sbHandlers.delete(onChange);
    if (_sbHandlers.size === 0 && _sbUnsub2) { _sbUnsub2(); _sbUnsub2 = null; }
  };
}

type AbsenceHandler = (row: Absence, event: "INSERT" | "UPDATE" | "DELETE") => void;
let _absHandlers = new Set<AbsenceHandler>();
let _absUnsub: (() => void) | null = null;

export function subscribeAbsences(onChange: AbsenceHandler): () => void {
  if (!browser) return () => {};
  _absHandlers.add(onChange);
  if (!_absUnsub) {
    _absUnsub = subscribeAbsencesPusher(raw => {
      const row = raw as unknown as Absence;
      const op = (raw._op as string) ?? 'UPDATE';
      const event = op === 'INSERT' ? 'INSERT' : op === 'DELETE' ? 'DELETE' : 'UPDATE';
      for (const h of _absHandlers) { try { h(row, event as "INSERT" | "UPDATE" | "DELETE"); } catch (e) { console.warn("[subscribeAbsences handler]", e); } }
    });
  }
  return () => {
    _absHandlers.delete(onChange);
    if (_absHandlers.size === 0 && _absUnsub) { _absUnsub(); _absUnsub = null; }
  };
}

type UserProfileRow = {
  id: string; email: string; display_name: string | null; role: string | null;
  avatar_url: string | null; code: string | null; color: string | null;
  country_code: string | null; is_active: boolean;
};
type UserProfileHandler = (row: UserProfileRow, event: "INSERT" | "UPDATE" | "DELETE") => void;
let _upHandlers = new Set<UserProfileHandler>();
let _upUnsub: (() => void) | null = null;

export function subscribeUserProfiles(onChange: UserProfileHandler): () => void {
  if (!browser) return () => {};
  _upHandlers.add(onChange);
  if (!_upUnsub) {
    _upUnsub = subscribeUserProfilesPusher(raw => {
      const row = raw as unknown as UserProfileRow;
      const op = (raw._op as string) ?? 'UPDATE';
      const event = op === 'INSERT' ? 'INSERT' : op === 'DELETE' ? 'DELETE' : 'UPDATE';
      for (const h of _upHandlers) { try { h(row, event as "INSERT" | "UPDATE" | "DELETE"); } catch (e) { console.warn("[subscribeUserProfiles handler]", e); } }
    });
  }
  return () => {
    _upHandlers.delete(onChange);
    if (_upHandlers.size === 0 && _upUnsub) { _upUnsub(); _upUnsub = null; }
  };
}

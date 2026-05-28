/**
 * user.svelte.ts — session-aware user role + per-module permission store.
 *
 * Reads auth.getUser() + public.user_profiles.role on mount, plus the user's
 * rows from user_module_permissions (Phase 2, migration 039). Exposes:
 *
 *   user.role         — 'ceo' | 'cto' | 'marketing_manager' | 'partner' | 'operator' | null
 *   user.display_name
 *   user.email
 *   user.loading      — true until first sync completes
 *   user.id           — auth.users.id of the current session
 *   user.can(action)  — 'module.action' string → boolean
 *
 * Permission resolution (mirrors public.has_permission in SQL):
 *   1. CEO/CTO bypass — always true
 *   2. Per-user override in user_module_permissions wins
 *   3. Role default from ROLE_DEFAULTS map (allow-by-default for marketing)
 *   4. Otherwise false
 */

import { supabase, hasClient } from "$lib/db";
import { browser } from "$app/environment";

type Role = "ceo" | "cto" | "marketing_manager" | "partner" | "operator" | null;

// Permissive defaults — CEO restricts via /admin/permissions when needed.
// Mirrors the spec in master plan: marketing gets all CRM actions, partner gets
// view + log, operator gets read-only. CEO/CTO bypass this map entirely.
// Exported so /admin/permissions matrix can reuse the SAME map for rendering
// the "inherited" pill state. (Previously the admin page had its own divergent
// copy — AUDIT-3 Bug 6.)
export const ROLE_DEFAULTS: Record<Exclude<Role, null | "ceo" | "cto">, Record<string, string[]>> = {
  marketing_manager: {
    crm: ["view","edit_notes","change_status","send_email","generate_draft","edit_contacts","manual_log","drag_status","inline_edit"],
    clients: ["view","edit_notes","manual_log","view_revenue","edit_contacts","view_invoices","view_tickets","inline_edit"],
    pipeline: ["view"],
    marketing_studio: ["view","use_tools"],
    // T.7.3 — /schedule retired, folded into /tracker?view=calendar
    meetings: ["view","add_notes","schedule"],
    health: ["view"],
    intel: ["view"],
    // Workstream T — tracker defaults. view_team enabled so Fanny sees the
    // team strip on /tracker. CEO can toggle off per-user via /admin/permissions.
    // T.7.3 adds: create_ticket (on-the-fly from manual log), edit_logged_time
    // (triggers approval flow if drift >5 min, else auto-applies silently).
    tracker: [
      "view_own","view_team","start","stop","edit_own","manual_log","request_absence","submit_plan",
      "create_ticket","edit_logged_time",
    ],
  },
  partner: {
    crm: ["view","manual_log","edit_notes"],
    // partners intentionally have NO access to /clients — leads only
    pipeline: ["view"],
    // T.7.3 — /schedule retired
    meetings: ["view"],
    // Tracker: own time only, no team view, can request absence + submit plan
    tracker: [
      "view_own","start","stop","edit_own","manual_log","request_absence","submit_plan",
      "create_ticket","edit_logged_time",
    ],
  },
  operator: {
    crm: ["view"],
    clients: ["view"],
    pipeline: ["view"],
    meetings: ["view"],   // T.7.3 follow-up — operator can read meeting notes
    // T.7.3 — /schedule retired
    // edit_logged_time included so operators can fix typo-stops; drift >5min still gates on CEO.
    tracker: ["view_own","edit_logged_time"],
  },
};

class UserState {
  role          = $state<Role>(null);
  display_name  = $state<string>("");
  email         = $state<string>("");
  avatar_url    = $state<string>("");
  loading       = $state<boolean>(true);
  id            = $state<string>("");
  /** module_key -> action_key -> granted boolean (override map; absence = inherit) */
  permissions   = $state<Record<string, Record<string, boolean>>>({});
  private _init = false;

  async init() {
    if (this._init || !browser || !hasClient()) return;
    this._init = true;
    try {
      // 1. SYNCHRONOUS read of persisted session from localStorage (no network).
      //    Fix for AUDIT-1 Bug 1: previous version awaited auth.getUser() (network)
      //    BEFORE setting any state, so cold-load with valid persisted session
      //    couldn't render the sidebar until the network round-trip completed,
      //    and any failure of that round-trip left user.role = null.
      const { data: sessData } = await supabase().auth.getSession();
      const sessionUser = sessData?.session?.user;

      if (sessionUser) {
        // Populate basic state IMMEDIATELY from the persisted session —
        // sidebar can render skeleton state while profile loads in background.
        this.id = sessionUser.id;
        this.email = sessionUser.email || "";
        this.display_name = sessionUser.user_metadata?.display_name || sessionUser.email || "";
        // Fetch profile + permissions; don't block init() finishing on this.
        await this._loadProfile(sessionUser.id);
      } else {
        // No persisted session — confirm via getUser() in case auth is in the URL hash.
        const { data } = await supabase().auth.getUser();
        const u = data.user;
        if (u) {
          this.id = u.id;
          this.email = u.email || "";
          this.display_name = u.user_metadata?.display_name || u.email || "";
          await this._loadProfile(u.id);
        }
      }
    } catch (e) {
      console.warn("[user store] init failed:", e);
    } finally {
      this.loading = false;
    }

    // Re-sync on auth changes. INITIAL_SESSION is intentionally ignored —
    // we already populated state above via getSession(). Listener handles
    // subsequent SIGNED_IN / SIGNED_OUT / TOKEN_REFRESHED events.
    supabase().auth.onAuthStateChange(async (event, session) => {
      if (event === "INITIAL_SESSION") return;   // already handled in init()
      if (event === "SIGNED_OUT") {
        this.role = null; this.display_name = ""; this.email = ""; this.id = "";
        this.permissions = {};
        return;
      }
      const u = session?.user;
      if (!u) return;                            // transient null on other events — keep state
      this.id = u.id;
      this.email = u.email || "";
      this.display_name = u.user_metadata?.display_name || u.email || "";
      await this._loadProfile(u.id);
    });
  }

  /** Background fetch of profile + permissions. Failures don't clear existing state. */
  private async _loadProfile(userId: string) {
    try {
      const { data: p, error } = await supabase()
        .from("user_profiles")
        .select("role, display_name, avatar_url")
        .eq("id", userId)
        .single();
      if (error) {
        console.warn("[user store] user_profiles read failed:", error.message, error.code);
        return;
      }
      if (p?.role) this.role = p.role as Role;
      if (p?.display_name) this.display_name = p.display_name;
      if (p && "avatar_url" in p) this.avatar_url = (p as any).avatar_url || "";
    } catch (e) {
      console.warn("[user store] _loadProfile exception:", e);
    }
    await this.loadPermissions();
  }

  /** Resolve avatar_url to a usable URL. If it's already absolute (https://),
   *  return as-is; otherwise treat as a path in the public 'avatars' bucket. */
  avatarSrc(): string {
    if (!this.avatar_url) return "";
    if (/^https?:\/\//.test(this.avatar_url)) return this.avatar_url;
    // Build public Supabase Storage URL.
    try {
      const { data } = supabase().storage.from("avatars").getPublicUrl(this.avatar_url);
      // Bust the browser cache when avatar changes (mtime via Date.now is fine).
      return data?.publicUrl ? `${data.publicUrl}?t=${Math.floor(Date.now()/60000)}` : "";
    } catch {
      return "";
    }
  }

  /** Upload + persist new avatar. Returns the new path or throws. */
  async uploadAvatar(file: File): Promise<string> {
    if (!browser || !hasClient()) throw new Error("not ready");
    if (!this.id) throw new Error("no session");
    if (!file.type.startsWith("image/")) throw new Error("must be an image");
    if (file.size > 2 * 1024 * 1024) throw new Error("max 2 MB");
    const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `${this.id}/avatar.${ext || "png"}`;
    const { error: upErr } = await supabase().storage.from("avatars")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) throw new Error(upErr.message);
    const { error: dbErr } = await supabase()
      .from("user_profiles")
      .update({ avatar_url: path })
      .eq("id", this.id);
    if (dbErr) throw new Error(dbErr.message);
    this.avatar_url = path;
    return path;
  }

  async loadPermissions() {
    if (!browser || !hasClient() || !this.id) return;
    try {
      const { data, error } = await supabase()
        .from("user_module_permissions")
        .select("module_key, action_key, granted")
        .eq("user_id", this.id)
        .is("revoked_at", null);
      if (error) { console.warn("[user store] loadPermissions:", error.message); return; }
      const map: Record<string, Record<string, boolean>> = {};
      for (const row of (data ?? []) as Array<{ module_key: string; action_key: string; granted: boolean }>) {
        if (!map[row.module_key]) map[row.module_key] = {};
        map[row.module_key][row.action_key] = row.granted;
      }
      this.permissions = map;
    } catch (e) {
      console.warn("[user store] loadPermissions exception:", e);
    }
  }

  /**
   * can('module.action') — boolean check.
   * Examples: user.can('crm.send_email'), user.can('admin.manage_permissions')
   */
  can(action: string): boolean {
    if (!this.role) return false;
    if (this.role === "ceo" || this.role === "cto") return true;
    const dotIdx = action.indexOf(".");
    if (dotIdx < 0) return false;
    const mod = action.slice(0, dotIdx);
    const act = action.slice(dotIdx + 1);
    // Per-user override wins
    const override = this.permissions[mod]?.[act];
    if (override !== undefined) return override;
    // Role default
    const defaults = ROLE_DEFAULTS[this.role as Exclude<Role, null | "ceo" | "cto">];
    return defaults?.[mod]?.includes(act) ?? false;
  }

  get isCEO()       { return this.role === "ceo"; }
  get isCTO()       { return this.role === "cto"; }
  get isMarketing() { return this.role === "marketing_manager"; }
  get isPartner()   { return this.role === "partner"; }
  get isAdmin()     { return this.role === "ceo" || this.role === "cto"; }
}

export const user = new UserState();

// Module + action catalog — used by /admin/permissions UI to render the matrix.
export interface ModuleAction { key: string; label: string; description?: string; }
export interface ModuleSpec { key: string; label: string; emoji?: string; actions: ModuleAction[]; }

export const MODULES: ModuleSpec[] = [
  {
    key: "crm", label: "CRM (sales force)", emoji: "▷",
    actions: [
      { key: "view",            label: "View pipeline" },
      { key: "inline_edit",     label: "Inline-edit fields" },
      { key: "edit_notes",      label: "Edit notes" },
      { key: "edit_contacts",   label: "Edit contacts / decision makers" },
      { key: "change_status",   label: "Change lifecycle status" },
      { key: "drag_status",     label: "Drag-and-drop between lanes" },
      { key: "manual_log",      label: "Manual activity log" },
      { key: "generate_draft",  label: "Generate AI email draft" },
      { key: "send_email",      label: "Send email via M365" },
      { key: "view_revenue",    label: "View revenue (MRR/YTD)" },
    ],
  },
  {
    key: "clients", label: "Clients (active customers)", emoji: "◐",
    actions: [
      { key: "view",            label: "View clients list" },
      { key: "view_revenue",    label: "View MRR / YTD revenue" },
      { key: "edit_notes",      label: "Edit client notes" },
      { key: "edit_contacts",   label: "Edit primary contact" },
      { key: "manual_log",      label: "Log activity / meeting note" },
      { key: "view_invoices",   label: "View recent invoices" },
      { key: "view_tickets",    label: "View open tickets" },
      { key: "inline_edit",     label: "Inline-edit fields" },
    ],
  },
  {
    key: "pipeline", label: "Work Pipeline (Plane)", emoji: "▤",
    actions: [
      { key: "view",       label: "View work pipeline" },
      { key: "edit_state", label: "Move issues between states" },
      { key: "comment",    label: "Comment on issues" },
    ],
  },
  {
    key: "marketing_studio", label: "Marketing Studio", emoji: "◈",
    actions: [
      { key: "view",      label: "View" },
      { key: "use_tools", label: "Use tools" },
    ],
  },
  // T.7.3 — schedule module retired (folded into tracker.* with calendar view).
  // Module entry removed. /admin/permissions matrix will automatically stop showing it.
  {
    key: "meetings", label: "Meetings", emoji: "◉",
    actions: [
      { key: "view",      label: "View meetings" },
      { key: "add_notes", label: "Add notes" },
      { key: "schedule",  label: "Schedule meetings" },
    ],
  },
  {
    key: "intel", label: "Intel / NEX", emoji: "✶",
    actions: [
      { key: "view",       label: "View intelligence" },
      { key: "query_nex",  label: "Query NEX directly" },
      { key: "view_audit", label: "View audit log" },
    ],
  },
  // T.7.3 — focus module retired (folded into tracker.* with calendar view).
  // Module entry removed.
  {
    key: "health", label: "Health Dashboard", emoji: "❤︎",
    actions: [
      { key: "view", label: "View" },
    ],
  },
  {
    // Workstream T — Tyme3-class time-tracker module
    // Folds /focus, /schedule, /calendar, /planner into one surface.
    key: "tracker", label: "Time Tracker", emoji: "⧗",
    actions: [
      { key: "view_own",         label: "View own time entries" },
      { key: "view_team",        label: "View team time entries" },
      { key: "start",            label: "Start a timer" },
      { key: "stop",             label: "Stop a timer" },
      { key: "edit_own",         label: "Edit own entries" },
      { key: "edit_others",      label: "Edit other members' entries" },
      { key: "manual_log",       label: "Backfill manual entry" },
      { key: "request_absence",  label: "Request absence" },
      { key: "approve_absence",  label: "Approve / reject absence" },
      { key: "submit_plan",      label: "Submit week plan for approval" },
      { key: "approve_plan",     label: "Approve / reject week plans" },
      { key: "edit_others_plan", label: "Edit others' submitted plan before approving" },
      { key: "manage_settings",  label: "Manage working hours + FTE" },
      { key: "manage_rates",     label: "Manage billing rates" },
      { key: "view_revenue",     label: "See billable revenue figures" },
      // T.7.3 additions ─────────────────────────────────────────────
      { key: "plan_others_week", label: "Plan another member's week (CEO only)" },
      { key: "approve_time_edit",label: "Approve / reject time-entry edits (CEO only)" },
      { key: "create_ticket",    label: "Create a Plane ticket from manual log" },
      { key: "edit_logged_time", label: "Edit a stopped entry (auto-applies if ≤5min drift)" },
    ],
  },
  {
    key: "projects", label: "Projects", emoji: "▣",
    actions: [
      { key: "view",   label: "View projects" },
      { key: "create", label: "Create projects" },
    ],
  },
  {
    key: "admin", label: "Admin", emoji: "✦",
    actions: [
      { key: "manage_permissions", label: "Manage team permissions (CEO only)" },
      { key: "manage_design",      label: "View design system gallery" },
    ],
  },
];

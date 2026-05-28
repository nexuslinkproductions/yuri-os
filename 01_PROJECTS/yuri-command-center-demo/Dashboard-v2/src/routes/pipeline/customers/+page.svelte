<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import {
    listCustomerMaster,
    subscribeCustomerMaster,
    listCustomerActivities,
    type CustomerMaster,
    type CustomerLifecycle,
    type CustomerLifecycleGroup,
    type CustomerActivity,
  } from "$lib/db";
  import GlassCard from "$components/GlassCard.svelte";
  import GlassStat from "$components/GlassStat.svelte";
  import LiveBadge from "$components/LiveBadge.svelte";
  import Sheet from "$components/ui/Sheet.svelte";
  import { toast } from "$components/GlassToast.svelte";
  // Workstream W — canonical L1/L2/L3/L4 interactive surfaces.
  import { GlassActionPrimary, GlassActionSecondary, GlassValueChip } from "$lib/components/glass";

  // CRM = sales force only. Customers (active + dormant) live in /clients.
  // 8 sub-stage columns grouped under 3 cluster headers (Prospect/Sales/Lost).
  // Dropping a card onto a column sets lifecycle directly to that stage.
  interface StageLane {
    key: CustomerLifecycle;
    label: string;
    group: CustomerLifecycleGroup;
    accent: string;
    glow: string;
  }
  const STAGE_LANES: StageLane[] = [
    { key: "cold_queued",   label: "Cold queue",   group: "prospect", accent: "#64748b", glow: "rgba(100,116,139,0.30)" },
    { key: "outreached",    label: "Outreached",   group: "prospect", accent: "#56bcec", glow: "rgba(86,188,236,0.30)" },
    { key: "replied",       label: "Replied",      group: "prospect", accent: "#22c55e", glow: "rgba(34,197,94,0.30)" },
    { key: "discovery",     label: "Discovery",    group: "sales",    accent: "#f59e0b", glow: "rgba(245,158,11,0.30)" },
    { key: "proposal_sent", label: "Proposal",     group: "sales",    accent: "#f97316", glow: "rgba(249,115,22,0.35)" },
    { key: "negotiation",   label: "Negotiation",  group: "sales",    accent: "#ea580c", glow: "rgba(234,88,12,0.40)" },
    { key: "pre_contract",  label: "Pre-contract", group: "sales",    accent: "#c2410c", glow: "rgba(194,65,12,0.45)" },
    { key: "lost",          label: "Lost",         group: "lost",     accent: "#94a0b0", glow: "rgba(148,160,176,0.22)" },
  ];
  // High-level groups for filter + Realtime — same as before.
  const CRM_GROUPS: CustomerLifecycleGroup[] = ["prospect", "sales", "lost"];

  // Cluster headers — visual grouping above the 8 lanes.
  interface ClusterMeta { key: CustomerLifecycleGroup; label: string; sub: string; accent: string; }
  const CLUSTERS: ClusterMeta[] = [
    { key: "prospect", label: "PROSPECT", sub: "cold leads → outreach → reply",          accent: "#64748b" },
    { key: "sales",    label: "SALES",    sub: "discovery → proposal → close",            accent: "#f97316" },
    { key: "lost",     label: "LOST",     sub: "closed · re-engage candidates",            accent: "#94a0b0" },
  ];

  // Sub-stage labels for card chips
  const STAGE_LABELS: Record<CustomerLifecycle, string> = {
    cold_queued:   "cold",
    outreached:    "outreached",
    replied:       "replied",
    discovery:     "discovery",
    proposal_sent: "proposal",
    negotiation:   "negotiation",
    pre_contract:  "pre-contract",
    active:        "active",
    dormant:       "dormant",
    lost:          "lost",
  };

  // Source signal — who brought this customer in
  // Distinguishes Claudio's network (referral / networking / inbound) from
  // CRM cold-acquisition (cold_outbound) from partner-sourced (Marcel / Silas).
  type SourceKey =
    | 'cold_outbound' | 'inbound' | 'referral' | 'networking'
    | 'partner_marcel' | 'partner_silas' | null;

  const SOURCE_META: Record<NonNullable<SourceKey>, { label: string; tone: string; title: string }> = {
    cold_outbound:  { label: "CRM",  tone: "src-crm",     title: "CRM cold-acquisition — extracted by sales-force pipeline" },
    inbound:        { label: "IN",   tone: "src-inbound", title: "Inbound — they contacted us first" },
    referral:       { label: "CTI",  tone: "src-cti",     title: "Referral — brought in via Claudio's network" },
    networking:     { label: "NET",  tone: "src-net",     title: "Networking — met at event / introduction" },
    partner_marcel: { label: "MS",   tone: "src-marcel",  title: "Marcel Spatz — AT partner sourced" },
    partner_silas:  { label: "SW",   tone: "src-silas",   title: "Silas Wirth — motion-graphics partner sourced" },
  };

  function sourceMeta(src: string | null | undefined) {
    if (!src) return null;
    return SOURCE_META[src as NonNullable<SourceKey>] ?? null;
  }

  // ─── State ─────────────────────────────────────────────────────────────────
  let customers = $state<CustomerMaster[]>([]);
  let loading   = $state(true);
  let unsub: (() => void) | null = null;

  let selected   = $state<CustomerMaster | null>(null);
  let activities = $state<CustomerActivity[]>([]);
  let activeTab  = $state<"overview" | "activity" | "outreach" | "notes">("overview");

  // Outreach editor state
  let draftSubject = $state("");
  let draftBody    = $state("");
  let draftChannel = $state<"email" | "linkedin">("email");
  let draftSaving  = $state(false);
  let draftSending = $state(false);
  let confirmSend  = $state(false);
  let confirmCheck = $state(false);
  let copyStatus   = $state<"" | "ok" | "fail">("");

  // Notes + status quick-change state
  let notesDraft   = $state("");
  let notesSaving  = $state(false);
  let notesStatus  = $state<"" | "saved" | "fail">("");
  let statusSaving = $state(false);
  let manualNote   = $state("");
  let manualNoteSaving = $state(false);

  // Claude-generated draft state
  let aiGenerating = $state(false);
  let aiStatus     = $state<"" | "ok" | "fail">("");
  let aiMeta       = $state<{ model?: string; website_used?: boolean } | null>(null);

  // Filter state
  let filterCountry = $state<"all" | "CH" | "AT">("all");
  let searchQuery   = $state("");
  // Debounced query — bound to filteredCustomers so each keystroke doesn't
  // re-walk 125 rows × 8 lanes × 2 count maps. AUDIT-2 Bug 2.
  let debouncedQuery = $state("");
  let _searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  function onSearchInput(v: string) {
    searchQuery = v;
    if (_searchDebounceTimer) clearTimeout(_searchDebounceTimer);
    _searchDebounceTimer = setTimeout(() => { debouncedQuery = v; }, 150);
  }

  // Lane visibility — cap each lane at 20 cards, expand on demand to keep
  // PROSPECT (100+ cold leads) from making the whole board infinite-scroll.
  const LANE_CAP = 20;
  let expandedLanes = $state<Set<CustomerLifecycle>>(new Set());
  function toggleLane(key: CustomerLifecycle) {
    if (expandedLanes.has(key)) expandedLanes.delete(key);
    else expandedLanes.add(key);
    expandedLanes = new Set(expandedLanes);
  }

  // ─── Team members (for next_action_owner picker) ───────────────────────────
  interface TeamMember { id: string; display_name: string | null; email: string | null; role: string | null; }
  let teamMembers = $state<TeamMember[]>([]);
  async function loadTeamMembers() {
    try {
      const { supabase, hasClient } = await import("$lib/db");
      if (!hasClient()) return;
      const { data } = await supabase()
        .from("user_profiles")
        .select("id, display_name, email, role")
        .order("display_name");
      teamMembers = (data || []) as TeamMember[];
    } catch (e) { console.warn("[crm] loadTeamMembers:", e); }
  }

  // ─── Decision makers (jsonb array) ─────────────────────────────────────────
  interface DecisionMaker {
    name: string;
    title?: string;
    email?: string;
    phone?: string;
    linkedin?: string;
    role?: "primary" | "influencer" | "blocker" | "champion";
    verified?: boolean;
  }
  let dmDraft = $state<DecisionMaker>({ name: "", title: "", email: "", phone: "", linkedin: "", role: "influencer", verified: false });
  let dmAdding = $state(false);

  function decisionMakers(): DecisionMaker[] {
    const v = selected?.decision_makers;
    if (!Array.isArray(v)) return [];
    return v as DecisionMaker[];
  }

  async function saveDecisionMakers(next: DecisionMaker[]) {
    if (!selected) return;
    const code = selected.client_code;
    const prev = decisionMakers();
    // Optimistic
    selected = { ...selected, decision_makers: next as any };
    markInFlight("decision_makers");
    try {
      const { supabase, hasClient } = await import("$lib/db");
      if (!hasClient()) throw new Error("supabase not configured");
      const { data: sess } = await supabase().auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) throw new Error("not authenticated");
      const r = await fetch("/api/functions/crm-inline-edit", {
        method: "POST", credentials: "include",
        headers: { "content-type": "application/json", "authorization": `Bearer ${token}` },
        body: JSON.stringify({ client_code: code, field: "decision_makers", value: next }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data?.ok) throw new Error(data?.error || `HTTP ${r.status}`);
      toast("Decision makers saved", "ok");
      activities = await listCustomerActivities(code, 50);
    } catch (e: any) {
      // Rollback
      if (selected?.client_code === code) selected = { ...selected, decision_makers: prev as any };
      toast(`Save failed: ${e?.message || e}`, "error");
    } finally {
      clearInFlight("decision_makers");
    }
  }
  async function addDecisionMaker() {
    if (!dmDraft.name.trim()) { toast("Name required", "error"); return; }
    dmAdding = true;
    const next = [...decisionMakers(), { ...dmDraft, name: dmDraft.name.trim() }];
    await saveDecisionMakers(next);
    dmDraft = { name: "", title: "", email: "", phone: "", linkedin: "", role: "influencer", verified: false };
    dmAdding = false;
  }
  async function removeDecisionMaker(idx: number) {
    const next = decisionMakers().filter((_, i) => i !== idx);
    await saveDecisionMakers(next);
  }
  async function toggleDmVerified(idx: number) {
    const list = decisionMakers().map((d, i) => i === idx ? { ...d, verified: !d.verified } : d);
    await saveDecisionMakers(list);
  }

  // ─── Tags chip editor ──────────────────────────────────────────────────────
  let tagDraft = $state("");
  function tags(): string[] {
    return Array.isArray(selected?.tags) ? (selected!.tags as string[]) : [];
  }
  async function saveTags(next: string[]) {
    if (!selected) return;
    const code = selected.client_code;
    const prev = tags();
    selected = { ...selected, tags: next as any };
    markInFlight("tags");
    try {
      const { supabase, hasClient } = await import("$lib/db");
      if (!hasClient()) throw new Error("supabase not configured");
      const { data: sess } = await supabase().auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) throw new Error("not authenticated");
      const r = await fetch("/api/functions/crm-inline-edit", {
        method: "POST", credentials: "include",
        headers: { "content-type": "application/json", "authorization": `Bearer ${token}` },
        body: JSON.stringify({ client_code: code, field: "tags", value: next }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data?.ok) throw new Error(data?.error || `HTTP ${r.status}`);
    } catch (e: any) {
      if (selected?.client_code === code) selected = { ...selected, tags: prev as any };
      toast(`Save failed: ${e?.message || e}`, "error");
    } finally {
      clearInFlight("tags");
    }
  }
  async function addTag() {
    const t = tagDraft.trim().toLowerCase();
    if (!t) return;
    if (tags().includes(t)) { tagDraft = ""; return; }
    await saveTags([...tags(), t]);
    tagDraft = "";
  }
  async function removeTag(t: string) {
    await saveTags(tags().filter(x => x !== t));
  }

  // ─── Prospect-score slider ─────────────────────────────────────────────────
  let scoreSaving = $state(false);
  async function saveProspectScore(score: number) {
    if (!selected) return;
    scoreSaving = true;
    const code = selected.client_code;
    const prev = selected.prospect_score ?? null;
    selected = { ...selected, prospect_score: score };
    markInFlight("prospect_score");
    try {
      const { supabase, hasClient } = await import("$lib/db");
      if (!hasClient()) throw new Error("supabase not configured");
      const { data: sess } = await supabase().auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) throw new Error("not authenticated");
      const r = await fetch("/api/functions/crm-inline-edit", {
        method: "POST", credentials: "include",
        headers: { "content-type": "application/json", "authorization": `Bearer ${token}` },
        body: JSON.stringify({ client_code: code, field: "prospect_score", value: score }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data?.ok) throw new Error(data?.error || `HTTP ${r.status}`);
    } catch (e: any) {
      if (selected?.client_code === code) selected = { ...selected, prospect_score: prev as any };
      toast(`Save failed: ${e?.message || e}`, "error");
    } finally {
      scoreSaving = false;
      clearInFlight("prospect_score");
    }
  }

  // ─── Next-action scheduler ─────────────────────────────────────────────────
  let nextActionLocal = $state("");    // for the datetime-local input
  let nextActionOwner = $state("");    // user_profiles.id
  let nextActionSaving = $state(false);

  function syncNextActionInputs() {
    if (!selected) { nextActionLocal = ""; nextActionOwner = ""; return; }
    if (selected.next_action_at) {
      // Convert ISO to local datetime-local format YYYY-MM-DDTHH:MM
      const d = new Date(selected.next_action_at);
      const pad = (n: number) => String(n).padStart(2, "0");
      nextActionLocal = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } else nextActionLocal = "";
    nextActionOwner = (selected as any).next_action_owner || "";
  }

  async function commitNextAction() {
    if (!selected) return;
    nextActionSaving = true;
    const code = selected.client_code;
    const isoAt = nextActionLocal ? new Date(nextActionLocal).toISOString() : null;
    const owner = nextActionOwner || null;
    const prevAt = selected.next_action_at;
    const prevOwner = (selected as any).next_action_owner;
    // Optimistic
    selected = { ...selected, next_action_at: isoAt as any, next_action_owner: owner as any };
    markInFlight("next_action_at");
    markInFlight("next_action_owner");
    try {
      const { supabase, hasClient } = await import("$lib/db");
      if (!hasClient()) throw new Error("supabase not configured");
      const { data: sess } = await supabase().auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) throw new Error("not authenticated");
      // Two PATCH calls (one per field)
      const post = (field: string, value: any) => fetch("/api/functions/crm-inline-edit", {
        method: "POST", credentials: "include",
        headers: { "content-type": "application/json", "authorization": `Bearer ${token}` },
        body: JSON.stringify({ client_code: code, field, value }),
      });
      const [r1, r2] = await Promise.all([post("next_action_at", isoAt), post("next_action_owner", owner)]);
      const d1 = await r1.json().catch(() => ({}));
      const d2 = await r2.json().catch(() => ({}));
      if (!d1?.ok || !d2?.ok) throw new Error(d1?.error || d2?.error || "save failed");
      toast("Next action scheduled", "ok");
      activities = await listCustomerActivities(code, 50);
    } catch (e: any) {
      if (selected?.client_code === code) {
        selected = { ...selected, next_action_at: prevAt, next_action_owner: prevOwner };
      }
      toast(`Save failed: ${e?.message || e}`, "error");
    } finally {
      nextActionSaving = false;
      clearInFlight("next_action_at");
      clearInFlight("next_action_owner");
    }
  }

  async function clearNextAction() {
    nextActionLocal = "";
    nextActionOwner = "";
    await commitNextAction();
  }

  // Combined derived: filter + counts + bucket-by-stage in a SINGLE pass over
  // customers[]. Previously: 1 filter pass + 1 count pass + 1 cluster-count pass
  // + 8 per-lane filter passes per keystroke = 11 walks. Now: 1 walk.
  // Reads `debouncedQuery` (not the raw input) for 150ms debounce. AUDIT-2 Bug 2.
  let board = $derived.by(() => {
    const q = debouncedQuery.trim().toLowerCase();
    const cf = filterCountry;
    const filtered: CustomerMaster[] = [];
    const byStage: Record<CustomerLifecycle, CustomerMaster[]> = {
      cold_queued: [], outreached: [], replied: [],
      discovery: [], proposal_sent: [], negotiation: [], pre_contract: [],
      active: [], dormant: [], lost: [],
    };
    const stageCounts: Record<CustomerLifecycle, number> = {
      cold_queued: 0, outreached: 0, replied: 0,
      discovery: 0, proposal_sent: 0, negotiation: 0, pre_contract: 0,
      active: 0, dormant: 0, lost: 0,
    };
    const clusterCounts: Record<CustomerLifecycleGroup, number> = {
      prospect: 0, sales: 0, customer: 0, inactive: 0, lost: 0,
    };
    let totalMrr = 0;
    let hasRevenue = false;
    for (const c of customers) {
      // Country filter
      if (cf !== "all" && c.country_code !== cf) continue;
      // Search filter
      if (q) {
        const hit =
          c.client_code.toLowerCase().includes(q) ||
          c.display_name.toLowerCase().includes(q) ||
          (c.industry || "").toLowerCase().includes(q) ||
          (c.domain || "").toLowerCase().includes(q);  // service-type column
        if (!hit) continue;
      }
      filtered.push(c);
      byStage[c.lifecycle].push(c);
      stageCounts[c.lifecycle]++;
      clusterCounts[c.lifecycle_group]++;
      if (c.monthly_revenue) totalMrr += Number(c.monthly_revenue);
      if (c.monthly_revenue !== null || c.total_revenue_ytd > 0) hasRevenue = true;
    }
    return { filtered, byStage, stageCounts, clusterCounts, totalMrr, hasRevenue };
  });
  // Compatibility shims for any older references in the template
  let filteredCustomers = $derived(board.filtered);
  let stageCounts       = $derived(board.stageCounts);
  let clusterCounts     = $derived(board.clusterCounts);

  // Total MRR + revenue-access flag — read from board single-pass.
  let totalMrr         = $derived(board.totalMrr);
  let hasRevenueAccess = $derived(board.hasRevenue);

  // ─── Pipeline analytics panel ──────────────────────────────────────────────
  // Secondary insight strip above the Kanban: funnel by stage + 3 KPI chips.
  // Derives from filteredCustomers (board.filtered) so it stays in sync with
  // the visible board state (country + search filters apply).
  let analyticsOpen = $state(true);
  const FUNNEL_STAGES: CustomerLifecycle[] = [
    "cold_queued", "outreached", "replied",
    "discovery", "proposal_sent", "negotiation", "pre_contract",
  ];
  let pipelineAnalytics = $derived.by(() => {
    // Walk filteredCustomers once for funnel counts + KPI chips.
    const counts: Record<CustomerLifecycle, number> = {
      cold_queued: 0, outreached: 0, replied: 0,
      discovery: 0, proposal_sent: 0, negotiation: 0, pre_contract: 0,
      active: 0, dormant: 0, lost: 0,
    };
    let pipelineTotal = 0;     // prospect + sales stages
    let activeDeals   = 0;     // proposal_sent + negotiation + pre_contract
    let mrrPotential  = 0;     // sum monthly_revenue across prospect + sales
    for (const c of board.filtered) {
      counts[c.lifecycle]++;
      const grp = c.lifecycle_group;
      if (grp === "prospect" || grp === "sales") {
        pipelineTotal++;
        if (c.monthly_revenue) mrrPotential += Number(c.monthly_revenue);
      }
      if (
        c.lifecycle === "proposal_sent" ||
        c.lifecycle === "negotiation"   ||
        c.lifecycle === "pre_contract"
      ) activeDeals++;
    }
    const max = FUNNEL_STAGES.reduce((m, s) => Math.max(m, counts[s]), 0) || 1;
    return { counts, max, pipelineTotal, activeDeals, mrrPotential };
  });
  function fmtMrrShort(n: number): string {
    if (n >= 1000) return `CHF ${Math.round(n / 1000)} k`;
    return `CHF ${Math.round(n)}`;
  }
  function stageLane(key: CustomerLifecycle): StageLane | undefined {
    return STAGE_LANES.find(s => s.key === key);
  }

  // ─── In-flight save tracking (Fix #1, DEV-B audit) ──────────────────────────
  // Each save path adds its field key here BEFORE fetch and removes it AFTER.
  // Realtime handler uses this to MERGE incoming rows rather than wholesale
  // replace — preserves un-acked optimistic edits when a previous save's
  // fire-back arrives while user is mid-edit on a different field.
  let inFlightFields = $state<Set<string>>(new Set());
  function markInFlight(field: string) {
    inFlightFields = new Set([...inFlightFields, field]);
  }
  function clearInFlight(field: string) {
    const next = new Set(inFlightFields);
    next.delete(field);
    inFlightFields = next;
  }

  // ─── DnD per-card cancel-token (Fix #2, DEV-B audit) ────────────────────────
  // When user drags X→Y then immediately X→Z before Y acks, the Y rollback
  // could revert to Z (wrong). We track the latest drop token per client_code;
  // earlier in-flight drops compare their token and abort if a newer one exists.
  let dropTokens = $state<Map<string, string>>(new Map());

  // Cards "graduating" out of CRM (lifecycle → active/dormant) get held in this
  // set briefly so the Realtime fire-back doesn't re-insert them before the
  // out:fly transition completes.
  let graduating = $state<Set<string>>(new Set());

  // ─── Lifecycle ──────────────────────────────────────────────────────────────
  onMount(async () => {
    customers = await listCustomerMaster(500, { groups: CRM_GROUPS });
    loading = false;
    void loadTeamMembers();
    unsub = subscribeCustomerMaster((row, ev) => {
      // Card just graduated → out of CRM — ignore the broadcast so the local
      // out:fly transition can run cleanly; the splice happens after animation.
      if (graduating.has(row.client_code)) return;

      // Row's lifecycle_group is no longer one we render → remove from view.
      if (!CRM_GROUPS.includes(row.lifecycle_group)) {
        customers = customers.filter(c => c.client_code !== row.client_code);
        return;
      }

      if (ev === "DELETE") {
        customers = customers.filter(c => c.client_code !== row.client_code);
      } else {
        customers = [row, ...customers.filter(c => c.client_code !== row.client_code)];
        if (selected && row.client_code === selected.client_code) {
          // Merge instead of replace when any save is in-flight — preserves
          // optimistic local values for fields that haven't ack'd yet.
          if (inFlightFields.size > 0) {
            const merged: any = { ...row };
            for (const f of inFlightFields) {
              if (f in (selected as any)) merged[f] = (selected as any)[f];
            }
            selected = merged as CustomerMaster;
          } else {
            selected = row;
          }
          syncNextActionInputs();
        }
      }
    });
  });
  onDestroy(() => { unsub?.(); });

  // ─── Drawer helpers ────────────────────────────────────────────────────────
  async function openCustomer(c: CustomerMaster) {
    selected = c;
    activeTab = "overview";
    syncNextActionInputs();
    activities = await listCustomerActivities(c.client_code, 50);

    // Auto-load (or generate) a personalized cold-email draft
    const existing = c.outreach_drafts?.cold_email;
    if (existing && existing.subject && existing.body) {
      draftSubject = existing.subject;
      draftBody    = existing.body;
      draftChannel = existing.channel || "email";
    } else {
      const generated = generateColdEmailDraft(c);
      draftSubject = generated.subject;
      draftBody    = generated.body;
      draftChannel = "email";
    }
    confirmSend = false; confirmCheck = false; copyStatus = "";

    // Notes draft loaded from cold_notes
    notesDraft  = c.cold_notes || "";
    notesStatus = "";
    manualNote  = "";
  }

  // ─── Notes save (cold_notes field + activity log) ──────────────────────────
  async function saveNotes() {
    if (!selected) return;
    notesSaving = true;
    try {
      const { supabase, hasClient } = await import("$lib/db");
      if (!hasClient()) { notesStatus = "fail"; return; }
      const { error } = await supabase()
        .from("customer_master")
        .update({ cold_notes: notesDraft })
        .eq("client_code", selected.client_code);
      if (error) { console.warn("[crm] saveNotes:", error.message); notesStatus = "fail"; return; }
      selected = { ...selected, cold_notes: notesDraft };
      notesStatus = "saved";
      setTimeout(() => notesStatus = "", 2200);
      // log activity
      const { data: u } = await supabase().auth.getUser();
      await supabase().from("customer_activities").insert({
        client_code: selected.client_code,
        actor: u?.user?.id || null,
        actor_label: u?.user?.user_metadata?.display_name || "team",
        action: "note_updated",
        payload: { length: notesDraft.length, preview: notesDraft.slice(0, 140) },
      });
      activities = await listCustomerActivities(selected.client_code, 50);
    } finally { notesSaving = false; }
  }

  // ─── Status quick-change ───────────────────────────────────────────────────
  const ALL_STAGES: CustomerLifecycle[] = ['cold_queued','outreached','replied','discovery','proposal_sent','negotiation','pre_contract','active','dormant','lost'];

  // Map lifecycle stage -> the group that contains it (used for graduation
  // detection without round-tripping to the DB trigger).
  const STAGE_GROUP: Record<CustomerLifecycle, CustomerLifecycleGroup> = {
    cold_queued: "prospect", outreached: "prospect", replied: "prospect",
    discovery: "sales", proposal_sent: "sales", negotiation: "sales", pre_contract: "sales",
    active: "customer",
    dormant: "inactive",
    lost: "lost",
  };

  async function changeStatus(newStage: CustomerLifecycle) {
    if (!selected || newStage === selected.lifecycle) return;
    statusSaving = true;
    const from = selected.lifecycle;
    const newGroup = STAGE_GROUP[newStage];
    const exitsCrm = !CRM_GROUPS.includes(newGroup);
    try {
      const { supabase, hasClient } = await import("$lib/db");
      if (!hasClient()) return;
      // Route through crm_set_lifecycle RPC — atomic permission check +
      // UPDATE + activity log in one transaction. AUDIT-2 Bug 4 fix.
      const { error } = await supabase().rpc("crm_set_lifecycle", {
        p_client_code: selected.client_code,
        p_to_lifecycle: newStage,
        p_via: "status_picker",
      });
      if (error) {
        toast(`Couldn't change status: ${error.message}`, "error");
        return;
      }
      const code = selected.client_code;
      const displayName = selected.display_name;
      selected = { ...selected, lifecycle: newStage, lifecycle_group: newGroup };
      activities = await listCustomerActivities(code, 50);

      // If the card now belongs to /clients (active/dormant), graduate it out
      // with a toast bridge — local fly-out, then splice + close drawer.
      // ALSO fire the full-stack workflow: Plane.so customer create + Obsidian
      // note + Telegram notification (best-effort, doesn't block UI).
      if (exitsCrm) {
        graduating = new Set([...graduating, code]);
        toast(`${displayName} → moved to Clients`, "ok");
        // Fire-and-forget promotion workflow
        void promoteToClient(code, from, newStage);
        setTimeout(() => {
          customers = customers.filter(c => c.client_code !== code);
          const next = new Set(graduating); next.delete(code); graduating = next;
          if (selected?.client_code === code) closeDrawer();
        }, 360);
      }
    } finally { statusSaving = false; }
  }

  // ─── Promotion workflow: Plane + Obsidian + Telegram ───────────────────────
  async function promoteToClient(code: string, from: CustomerLifecycle, to: CustomerLifecycle) {
    try {
      const { supabase: sb, hasClient: hc } = await import("$lib/db");
      if (!hc()) return;
      const token = (await sb().auth.getSession()).data?.session?.access_token;
      if (!token) return;
      const r = await fetch("/api/functions/crm-promote-to-client", {
        method: "POST", credentials: "include",
        headers: { "content-type": "application/json", "authorization": `Bearer ${token}` },
        body: JSON.stringify({ client_code: code, from_lifecycle: from, to_lifecycle: to }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data?.ok) {
        // Subtle second toast — workflow completed
        const bits: string[] = [];
        if (data.plane && !data.plane_existed) bits.push("Plane created");
        if (data.audit_logged) bits.push("Obsidian queued");
        if (data.telegram_sent) bits.push("Telegram sent");
        if (bits.length) toast(`✓ ${bits.join(" · ")}`, "ok");
      } else {
        console.warn("[crm] promoteToClient:", data?.error || r.status);
      }
    } catch (e) {
      console.warn("[crm] promoteToClient exception:", e);
    }
  }

  // ─── Drag-and-drop between stage lanes ────────────────────────────────────
  // 8 stage columns. Dropping a card sets lifecycle directly to that stage.
  // Optimistic UI: card moves locally before DB ack; reverts on error.
  let draggingCode = $state<string | null>(null);
  let dragOverStage = $state<CustomerLifecycle | null>(null);

  function onCardDragStart(e: DragEvent, code: string) {
    if (!e.dataTransfer) return;
    draggingCode = code;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', code);
  }
  function onCardDragEnd() {
    draggingCode = null;
    dragOverStage = null;
  }
  function onLaneDragOver(e: DragEvent, stage: CustomerLifecycle) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    dragOverStage = stage;
  }
  function onLaneDragLeave(stage: CustomerLifecycle) {
    if (dragOverStage === stage) dragOverStage = null;
  }
  async function onLaneDrop(e: DragEvent, newStage: CustomerLifecycle) {
    e.preventDefault();
    const code = e.dataTransfer?.getData('text/plain') || draggingCode;
    dragOverStage = null;
    draggingCode = null;
    if (!code) return;

    const card = customers.find(c => c.client_code === code);
    if (!card) return;
    if (card.lifecycle === newStage) return; // dropped in same lane
    const group = STAGE_GROUP[newStage];

    // Per-card cancel token (Fix #2): if user drops X→Y then X→Z fast, the
    // Y-flight's rollback would otherwise revert Z to Y. We stamp the latest
    // token for `code`; any older in-flight that sees its token superseded
    // aborts both its rollback AND any side-effects.
    const token = (crypto?.randomUUID?.() ?? String(Date.now() + Math.random()));
    dropTokens.set(code, token);
    dropTokens = new Map(dropTokens);  // trigger reactivity

    // Optimistic local update
    const prevStage = card.lifecycle;
    const prevGroup = card.lifecycle_group;
    customers = customers.map(c =>
      c.client_code === code ? { ...c, lifecycle: newStage, lifecycle_group: group } : c
    );
    if (selected?.client_code === code) {
      selected = { ...selected, lifecycle: newStage, lifecycle_group: group };
    }

    const isCurrent = () => dropTokens.get(code) === token;

    try {
      const { supabase, hasClient } = await import("$lib/db");
      if (!hasClient()) throw new Error('supabase not configured');
      // Atomic transition via crm_set_lifecycle RPC (permission + UPDATE +
      // activity log in one transaction). AUDIT-2 Bug 4 fix.
      const { error } = await supabase().rpc("crm_set_lifecycle", {
        p_client_code: code,
        p_to_lifecycle: newStage,
        p_via: "drag",
      });
      if (error) throw new Error(error.message);

      // If a newer drop superseded this one mid-flight, skip the toast/activity
      // refresh (the newer one already logged its own from→to via the RPC).
      if (!isCurrent()) return;

      const stageLabel = STAGE_LANES.find(s => s.key === newStage)?.label || newStage;
      toast(`Moved to ${stageLabel}`, "ok");
      if (selected?.client_code === code) {
        activities = await listCustomerActivities(code, 50);
      }
    } catch (err: any) {
      // Rollback ONLY if this is still the current drop for the card.
      // If a newer drop already overwrote it, leave the newer state intact.
      if (!isCurrent()) {
        console.warn("[crm] superseded drop failed silently:", err?.message);
        return;
      }
      customers = customers.map(c =>
        c.client_code === code ? { ...c, lifecycle: prevStage, lifecycle_group: prevGroup } : c
      );
      if (selected?.client_code === code) {
        selected = { ...selected, lifecycle: prevStage, lifecycle_group: prevGroup };
      }
      toast(`Couldn't move card: ${err?.message || err}`, "error");
    } finally {
      // Cleanup: clear my token only if it's still mine (newer drops have
      // already replaced it; their finally will clear theirs).
      if (dropTokens.get(code) === token) {
        const next = new Map(dropTokens);
        next.delete(code);
        dropTokens = next;
      }
    }
  }

  // ─── Manual quick-log (from Activity tab) ──────────────────────────────────
  async function addManualNote() {
    if (!selected || !manualNote.trim()) return;
    manualNoteSaving = true;
    try {
      const { supabase, hasClient } = await import("$lib/db");
      if (!hasClient()) return;
      const { data: u } = await supabase().auth.getUser();
      await supabase().from("customer_activities").insert({
        client_code: selected.client_code,
        actor: u?.user?.id || null,
        actor_label: u?.user?.user_metadata?.display_name || "team",
        action: "manual_log",
        payload: { text: manualNote.trim() },
      });
      // bump last_touch_at — manual logs count as touches
      await supabase().from("customer_master")
        .update({ last_touch_at: new Date().toISOString() })
        .eq("client_code", selected.client_code);
      activities = await listCustomerActivities(selected.client_code, 50);
      manualNote = "";
    } finally { manualNoteSaving = false; }
  }

  // ─── Personalized cold-email draft generator ────────────────────────────────
  // Template-based for tonight (instant + free + tunable). Future iteration
  // hits Claude API server-side for hyper-personalized prose. Industry-keyed
  // value props pulled from c2moviez creative-tech stack positioning.
  function generateColdEmailDraft(c: CustomerMaster) {
    const isEN = c.language === "en" || c.source === "cold_outbound";
    const firstName = (c.primary_contact_name || "").split(" ")[0] || (isEN ? "team" : "Team");
    const company = c.display_name || c.client_code;
    const industry = (c.industry || "").toLowerCase();

    // Industry → value-prop mapping (rough; tune as the funnel matures)
    const isTech    = /software|saas|tech|it|digital|cloud|data|ai/i.test(industry);
    const isCreative = /design|media|werbung|marketing|creative|advertising|agency/i.test(industry);
    const isHosp     = /hotel|hospitality|restaurant|tourism/i.test(industry);
    const isService  = /consult|service|beratung|advisory|management/i.test(industry);
    const isManuf    = /manufacturing|construction|bau|industrie|production/i.test(industry);

    const valueProps_en = isTech
      ? ["Founder-led explainer videos that convert technical buyers (2-3 day turnaround)",
         "Product demo content that doubles trial-to-paid conversion (case study available)",
         "LinkedIn-ready thought-leadership shorts that compound your founder's visibility"]
      : isCreative
      ? ["Higher-touch video production capacity when your team is at capacity",
         "Co-production on flagship client pitches (we handle the gear + post)",
         "Brand-system extension into motion for static-only client deliverables"]
      : isHosp
      ? ["Cinematic property and experience films that move bookings (Premiere + DaVinci)",
         "Reels-ready 9:16 cuts from every shoot, optimized for Instagram + TikTok",
         "Year-long content calendar so your social never goes dark"]
      : isService
      ? ["Case-study films that turn happy clients into your best sales tool",
         "Founder-led thought-leadership video for LinkedIn (proven trust builder)",
         "Pitch-deck videos that win when your slides can't"]
      : isManuf
      ? ["Process and capability films that pre-qualify B2B leads",
         "Time-lapse and drone work for project documentation + sales reels",
         "Premium product photography to replace generic catalogue shots"]
      : ["High-end video production with rapid turnaround (in-house post)",
         "Brand-aligned visual content across web, social, and proposals",
         "End-to-end creative-tech: strategy → shoot → post → distribution"];

    const valueProps_de = isTech
      ? ["Founder-led Erklärvideos, die technische Käufer überzeugen (2-3 Tage Turnaround)",
         "Produkt-Demo-Content, der Trial-to-Paid-Konversion verdoppelt (Case Study auf Anfrage)",
         "LinkedIn-fähige Thought-Leadership-Shorts, die die Sichtbarkeit Ihres Gründers ausbauen"]
      : isCreative
      ? ["Zusätzliche Video-Produktionskapazität, wenn Ihr Team ausgelastet ist",
         "Co-Production bei Flaggschiff-Pitches (Equipment + Post bei uns)",
         "Erweiterung Ihres Brand-Systems ins Motion-Design für statische Deliverables"]
      : isHosp
      ? ["Kinematografische Property- und Erlebnis-Filme, die Buchungen steigern",
         "Reels-fertige 9:16 Cuts aus jedem Shoot, für Instagram + TikTok optimiert",
         "Jährlicher Content-Kalender, damit Ihr Social-Auftritt nie still steht"]
      : ["High-End Video-Produktion mit schnellem Turnaround (eigene Post-Production)",
         "Brand-alignter visueller Content für Web, Social und Angebote",
         "End-to-End Creative-Tech: Strategie → Dreh → Post → Distribution"];

    const valueProps = isEN ? valueProps_en : valueProps_de;

    const subject = isEN
      ? `Quick idea for ${company}`
      : `Kurze Idee für ${company}`;

    const body = isEN
      ? `Hi ${firstName},

I'm Fanny from c2moviez — a Swiss creative-tech firm. We help SMEs like ${company} stand out with high-end video, photography, and brand-aligned content that actually moves the needle.

A few things we could build for ${company}:
- ${valueProps[0]}
- ${valueProps[1]}
- ${valueProps[2]}

Worth 20 minutes to see if there's a fit? Happy to share a few recent case studies relevant to your space.

Best,
Fanny Kecskes
c2moviez · Marketing Manager
fanny@c2moviez.com · +41 78 317 85 85
https://www.c2moviez.com`
      : `Guten Tag ${firstName},

mein Name ist Fanny Kecskes von c2moviez — einer Schweizer Creative-Tech-Firma. Wir helfen KMUs wie ${company}, sich durch hochwertige Video-, Foto- und Brand-Inhalte abzuheben, die messbar wirken.

Drei Bereiche, in denen wir für ${company} sofort Wert liefern könnten:
- ${valueProps[0]}
- ${valueProps[1]}
- ${valueProps[2]}

Hätten Sie 20 Minuten Zeit für ein kurzes Gespräch, um zu prüfen, ob ein Fit besteht? Ich teile gerne ein paar passende Case Studies.

Beste Grüße,
Fanny Kecskes
c2moviez · Marketing Manager
fanny@c2moviez.com · +41 78 317 85 85
https://www.c2moviez.com`;

    return { subject, body };
  }

  // ─── Outreach actions ──────────────────────────────────────────────────────
  async function saveDraft() {
    if (!selected) return;
    draftSaving = true;
    try {
      const { supabase, hasClient } = await import("$lib/db");
      if (!hasClient()) { copyStatus = "fail"; return; }
      const drafts = { ...(selected.outreach_drafts || {}), cold_email: { subject: draftSubject, body: draftBody, channel: draftChannel, updated_at: new Date().toISOString() } };
      const { error } = await supabase().from("customer_master").update({ outreach_drafts: drafts }).eq("client_code", selected.client_code);
      if (error) { console.warn("[crm] saveDraft:", error.message); copyStatus = "fail"; }
      else { selected = { ...selected, outreach_drafts: drafts }; copyStatus = "ok"; setTimeout(() => copyStatus = "", 2200); }
    } finally { draftSaving = false; }
  }

  async function copyDraft() {
    const text = `Subject: ${draftSubject}\n\n${draftBody}`;
    try {
      await navigator.clipboard.writeText(text);
      copyStatus = "ok"; setTimeout(() => copyStatus = "", 2200);
    } catch { copyStatus = "fail"; }
  }

  // ─── Claude-API hyper-personalized draft ─────────────────────────────────
  async function generateWithClaude() {
    if (!selected) return;
    aiGenerating = true;
    aiStatus = "";
    try {
      const r = await fetch("/api/functions/crm-generate-draft", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ client_code: selected.client_code }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data?.ok && data.subject && data.body) {
        draftSubject = data.subject;
        draftBody    = data.body;
        aiMeta = { model: data.model, website_used: data.website_used };
        aiStatus = "ok"; setTimeout(() => aiStatus = "", 4000);
        // selected gets refreshed via Realtime when DB persists
      } else {
        console.warn("[crm] generateWithClaude:", data?.error || r.status);
        aiStatus = "fail";
      }
    } catch (e) {
      console.warn("[crm] generateWithClaude exception:", e);
      aiStatus = "fail";
    } finally { aiGenerating = false; }
  }

  // Derived: sent emails for this customer (from activity log)
  let sentHistory = $derived.by(() =>
    activities.filter(a => a.action === "sent").slice(0, 10)
  );

  async function sendViaM365() {
    if (!selected) return;
    confirmSend = false;
    draftSending = true;
    try {
      // Pass Supabase session bearer so the HTTP fn can call has_permission().
      const { supabase: sb, hasClient: hc } = await import("$lib/db");
      const token = hc() ? (await sb().auth.getSession()).data?.session?.access_token : null;
      const r = await fetch("/api/functions/crm-send-email", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          ...(token ? { "authorization": `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          client_code: selected.client_code,
          to:      selected.primary_contact_email,
          subject: draftSubject,
          body:    draftBody,
          channel: draftChannel,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data?.ok) {
        copyStatus = "ok"; setTimeout(() => copyStatus = "", 3000);
        activities = await listCustomerActivities(selected.client_code, 50);
      } else {
        console.warn("[crm] sendViaM365:", data?.error || r.status);
        copyStatus = "fail";
      }
    } catch (e) {
      console.warn("[crm] sendViaM365 exception:", e);
      copyStatus = "fail";
    } finally { draftSending = false; }
  }
  function closeDrawer() {
    selected = null;
    activities = [];
  }

  function fmtCHF(n: number | null | undefined): string {
    if (n === null || n === undefined) return "—";
    return new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF", maximumFractionDigits: 0 }).format(Number(n));
  }
  function fmtDate(d?: string | null): string {
    if (!d) return "—";
    try { return new Date(d).toLocaleDateString("de-CH", { timeZone: "Europe/Zurich", day: "2-digit", month: "short", year: "numeric" }); }
    catch { return d; }
  }
  function relTime(iso?: string | null): string {
    if (!iso) return "—";
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1)    return "just now";
    if (m < 60)   return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24)   return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 30)   return `${d}d ago`;
    return new Date(iso).toLocaleDateString("de-CH");
  }

  // ─── Inline edit (Phase 1.1) ─────────────────────────────────────────────
  // Single-field PATCH via /api/functions/crm-inline-edit. The server
  // function sets app.source='crm-ui' and gates by role + field allowlist.
  // Pattern per row: click value -> shows input -> blur or Enter saves.
  let editingField = $state<string | null>(null);
  let editingValue = $state<string>("");
  let savingField  = $state<string | null>(null);
  let savedField   = $state<string | null>(null);
  let errorField   = $state<string | null>(null);

  function startEdit(field: string, current: any) {
    if (!selected) return;
    editingField = field;
    editingValue = current === null || current === undefined ? "" : String(current);
    errorField = null;
    savedField = null;
  }
  function cancelEdit() {
    editingField = null;
    editingValue = "";
  }
  async function commitEdit() {
    if (!selected || !editingField) return;
    const field = editingField;
    const value = editingValue;
    const code  = selected.client_code;
    savingField = field;
    errorField = null;
    markInFlight(field);

    try {
      // Get caller's Supabase session token (the HTTP fn verifies via /auth/v1/user)
      const { supabase, hasClient } = await import("$lib/db");
      if (!hasClient()) { toast("Supabase not configured", "error"); return; }
      const { data: sess } = await supabase().auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) { toast("Sign in again to edit", "error"); return; }

      const r = await fetch("/api/functions/crm-inline-edit", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", "authorization": `Bearer ${token}` },
        body: JSON.stringify({ client_code: code, field, value }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data?.ok) {
        const msg = data?.error || `HTTP ${r.status}`;
        errorField = field;
        toast(`Couldn't save ${field}: ${msg}`, "error");
        return;
      }
      // Optimistic local update (Realtime will reconcile shortly)
      if (selected && selected.client_code === code) {
        (selected as any)[field] = data.value ?? null;
      }
      savedField = field;
      setTimeout(() => { if (savedField === field) savedField = null; }, 1600);
      // Refresh activities so the "edit" entry appears
      activities = await listCustomerActivities(code, 50);
    } catch (e: any) {
      console.warn("[crm] inline-edit exception:", e);
      errorField = field;
      toast(`Save failed: ${e?.message || e}`, "error");
    } finally {
      savingField = null;
      editingField = null;
      editingValue = "";
      clearInFlight(field);
    }
  }
  function onEditKey(e: KeyboardEvent) {
    if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
    else if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
  }
</script>

<svelte:head>
  <title>CRM — Customer Master · c2moviez NEX</title>
</svelte:head>

<header class="page-header">
  <div class="hdr-row">
    <h1>CRM</h1>
    <LiveBadge label="Live" />
  </div>
  <div class="hdr-sub">
    <span>Sales force — prospects → sales → pre-contract. Active customers live in <a href="/clients" class="hdr-link">Clients →</a></span>
    <span class="dot">·</span>
    <a href="/pipeline" class="hdr-link">Plane state view →</a>
  </div>
</header>

<section class="view-bar" aria-label="View controls">
  <div class="filters">
    <label class="filter-chip">
      <span class="filter-label">Country</span>
      <select bind:value={filterCountry}>
        <option value="all">All</option>
        <option value="CH">CH only</option>
        <option value="AT">AT only</option>
      </select>
    </label>
    <input
      type="search"
      class="search"
      placeholder="Search code / name / industry / service…"
      value={searchQuery}
      oninput={(e) => onSearchInput((e.target as HTMLInputElement).value)}
    />
  </div>
  <div class="stats">
    <GlassStat label="Total" value={String(filteredCustomers.length)} />
    {#if hasRevenueAccess}
      <GlassStat label="MRR" value={fmtCHF(totalMrr)} />
    {/if}
  </div>
</section>

<!-- Source legend — clarifies who brought each customer in -->
<aside class="source-legend" aria-label="Source legend">
  <span class="legend-label">SOURCE:</span>
  <span class="legend-item"><span class="source-chip src-crm">CRM</span> cold acquisition (sales force)</span>
  <span class="legend-item"><span class="source-chip src-cti">CTI</span> Claudio's network</span>
  <span class="legend-item"><span class="source-chip src-inbound">IN</span> inbound</span>
  <span class="legend-item"><span class="source-chip src-net">NET</span> networking</span>
  <span class="legend-item"><span class="source-chip src-marcel">MS</span> Marcel partner</span>
  <span class="legend-item"><span class="source-chip src-silas">SW</span> Silas partner</span>
</aside>

<!-- Pipeline analytics — secondary insight panel above the Kanban.
     Funnel bars derived from filteredCustomers; collapsible. -->
<section class="analytics" class:analytics--open={analyticsOpen} aria-label="Pipeline analytics">
  <button
    type="button"
    class="analytics-toggle"
    onclick={() => (analyticsOpen = !analyticsOpen)}
    aria-expanded={analyticsOpen}
    aria-label="Toggle pipeline analytics"
  >
    <span class="analytics-title">PIPELINE ANALYTICS</span>
    <span class="analytics-sub">funnel · KPIs · derived from current filter</span>
    <span class="analytics-chevron" aria-hidden="true">{analyticsOpen ? "▾" : "▸"}</span>
  </button>

  {#if analyticsOpen}
    <div class="analytics-body">
      <div class="kpi-row" role="group" aria-label="Pipeline KPIs">
        <div class="kpi-chip">
          <span class="kpi-label">In pipeline</span>
          <span class="kpi-value">{pipelineAnalytics.pipelineTotal}</span>
          <span class="kpi-sub">prospect + sales</span>
        </div>
        <div class="kpi-chip kpi-chip--active">
          <span class="kpi-label">Active deals</span>
          <span class="kpi-value">{pipelineAnalytics.activeDeals}</span>
          <span class="kpi-sub">proposal → pre-contract</span>
        </div>
        {#if hasRevenueAccess}
          <div class="kpi-chip kpi-chip--mrr">
            <span class="kpi-label">MRR potential</span>
            <span class="kpi-value">{fmtMrrShort(pipelineAnalytics.mrrPotential)}</span>
            <span class="kpi-sub">monthly · open stages</span>
          </div>
        {/if}
      </div>

      <div class="funnel" role="img" aria-label="Pipeline funnel by stage">
        <svg viewBox="0 0 600 196" preserveAspectRatio="none" class="funnel-svg">
          {#each FUNNEL_STAGES as stageKey, i}
            {@const lane = stageLane(stageKey)}
            {@const n = pipelineAnalytics.counts[stageKey]}
            {@const ratio = n / pipelineAnalytics.max}
            {@const barW = Math.max(ratio * 480, n > 0 ? 6 : 0)}
            {@const y = 4 + i * 28}
            <text x="0" y={y + 14} class="funnel-stage-label" fill="currentColor">{lane?.label ?? stageKey}</text>
            <rect x="120" y={y} width="480" height="18" rx="3" class="funnel-track" />
            <rect
              x="120" y={y} width={barW} height="18" rx="3"
              fill={lane?.accent ?? "#94a0b0"}
              class="funnel-bar"
            />
            <text x={120 + barW + 6} y={y + 14} class="funnel-count" fill="currentColor">{n}</text>
          {/each}
        </svg>
      </div>
    </div>
  {/if}
</section>

{#if loading}
  <div class="loading">Loading customers…</div>
{:else}
  <!-- Cluster headers (Prospect/Sales/Lost) span the stage lanes beneath them.
       Each cluster owns N stage columns; CSS grid columns lock the alignment. -->
  <div class="cluster-headers">
    {#each CLUSTERS as cluster}
      {@const cols = STAGE_LANES.filter(s => s.group === cluster.key).length}
      <div class="cluster-header" style={`--cluster-accent:${cluster.accent}; grid-column: span ${cols};`}>
        <div class="cluster-header__top">
          <span class="cluster-header__label">{cluster.label}</span>
          <span class="cluster-header__count">{clusterCounts[cluster.key]}</span>
        </div>
        <div class="cluster-header__sub">{cluster.sub}</div>
      </div>
    {/each}
  </div>

  <div class="board board--stages">
    {#each STAGE_LANES as stage}
      {@const laneCards = board.byStage[stage.key]}
      {@const visibleCards = expandedLanes.has(stage.key) ? laneCards : laneCards.slice(0, LANE_CAP)}
      <div
        class="lane lane--stage"
        class:lane--drop-target={dragOverStage === stage.key}
        data-cluster={stage.group}
        style={`--lane-accent: ${stage.accent}; --lane-glow: ${stage.glow};`}
        ondragover={(e) => onLaneDragOver(e, stage.key)}
        ondragleave={() => onLaneDragLeave(stage.key)}
        ondrop={(e) => onLaneDrop(e, stage.key)}
        role="region"
        aria-label={`${stage.label} stage`}
      >
        <header class="lane-header">
          <div class="lane-title">
            <span class="lane-name">{stage.label}</span>
            <span class="lane-count">{stageCounts[stage.key]}</span>
          </div>
        </header>

        <div class="lane-cards" data-lane-name={stage.label.toLowerCase()}>
          {#each visibleCards as c (c.client_code)}
            <button
              type="button"
              class="card"
              class:card--dragging={draggingCode === c.client_code}
              class:card--graduating={graduating.has(c.client_code)}
              draggable="true"
              ondragstart={(e) => onCardDragStart(e, c.client_code)}
              ondragend={onCardDragEnd}
              onclick={() => openCustomer(c)}
              aria-label={`Open ${c.display_name}, drag to change stage`}
            >
              <div class="card-row1">
                {#if sourceMeta(c.source)}
                  {@const sm = sourceMeta(c.source)}
                  <!-- L3 value chip (static — card click handles drill-down). -->
                  <GlassValueChip
                    tone={sm?.tone === 'success' ? 'success' : sm?.tone === 'warn' ? 'warn' : sm?.tone === 'danger' ? 'danger' : 'info'}
                    size="sm"
                    static
                    title={sm?.title}
                  >
                    {#snippet children()}{sm?.label}{/snippet}
                  </GlassValueChip>
                {/if}
                <!-- Client code chip — accent driven by brand_primary if present, else the token. -->
                <GlassValueChip
                  size="sm"
                  static
                  accent={c.brand_primary || `var(--client-${c.client_code}, var(--brand))`}
                >
                  {#snippet children()}{c.client_code}{/snippet}
                </GlassValueChip>
                <span class="name">{c.display_name}</span>
                {#if c.country_code !== 'CH'}
                  <GlassValueChip tone="neutral" size="sm" static>
                    {#snippet children()}{c.country_code}{/snippet}
                  </GlassValueChip>
                {/if}
              </div>
              <div class="card-row2">
                {#if c.contract_type !== 'none'}
                  <GlassValueChip tone="violet" size="sm" static>
                    {#snippet children()}{c.contract_type}{/snippet}
                  </GlassValueChip>
                {/if}
                {#if c.monthly_revenue}
                  <span class="mrr">{fmtCHF(c.monthly_revenue)}/mo</span>
                {/if}
              </div>
              <div class="card-row3">
                <span class="industry">{c.industry || "—"}</span>
                <span class="touch">{relTime(c.last_touch_at || c.last_activity_at || c.updated_at)}</span>
              </div>
            </button>
          {:else}
            <!-- Empty stage lanes render no placeholder content — just the
                 lane shell with header + count. AUDIT-2 Bug 1. -->
            <div class="lane-empty" aria-hidden="true"></div>
          {/each}

          {#if laneCards.length > LANE_CAP}
            <button
              type="button"
              class="glass-btn glass-btn--sm lane-expand"
              onclick={() => toggleLane(stage.key)}
              aria-expanded={expandedLanes.has(stage.key)}
            >
              {expandedLanes.has(stage.key)
                ? `Show fewer`
                : `+${laneCards.length - LANE_CAP} more`}
            </button>
          {/if}
        </div>
      </div>
    {/each}
  </div>
{/if}

<!-- ─── Customer detail Sheet ────────────────────────────────────────────────── -->
<Sheet open={!!selected} onClose={closeDrawer} side="right" width="min(640px, 100vw)" title={selected?.display_name}>
  {#if selected}
    <div class="sheet">
      <header class="sheet-hdr">
        <div class="sheet-hdr-top">
          <span class="code-lg" style="background: {selected.brand_primary || '#1f2937'}">{selected.client_code}</span>
          <div class="sheet-hdr-title">
            <h2>{selected.display_name}</h2>
            <div class="sheet-meta">
              <label class="status-picker" title="Change lifecycle stage — logged to activity">
                <span class="status-label">Status</span>
                <select
                  value={selected.lifecycle}
                  disabled={statusSaving}
                  onchange={(e) => changeStatus(((e.target as HTMLSelectElement).value) as CustomerLifecycle)}
                >
                  {#each ALL_STAGES as stage}
                    <option value={stage}>{STAGE_LABELS[stage]}</option>
                  {/each}
                </select>
              </label>
              {#if selected.contract_type !== 'none'}
                <GlassValueChip tone="violet" size="sm" static>
                  {#snippet children()}{selected!.contract_type}{/snippet}
                </GlassValueChip>
              {/if}
              <span class="dim">{selected.industry || "—"}</span>
            </div>
          </div>
        </div>
        <div class="sheet-stats">
          {#if selected.monthly_revenue !== null}
            <div class="glass-stat-card glass-stat-card--mrr">
              <span class="glass-stat-card__label">MRR</span>
              <span class="glass-stat-card__value">{fmtCHF(selected.monthly_revenue)}</span>
              <span class="glass-stat-card__cap">CHF/mo</span>
            </div>
          {/if}
          {#if selected.total_revenue_ytd > 0}
            <div class="glass-stat-card">
              <span class="glass-stat-card__label">YTD</span>
              <span class="glass-stat-card__value">{fmtCHF(selected.total_revenue_ytd)}</span>
            </div>
          {/if}
          <div class="glass-stat-card">
            <span class="glass-stat-card__label">Tickets</span>
            <span class="glass-stat-card__value">{selected.open_tickets_count}</span>
          </div>
          <div class="glass-stat-card">
            <span class="glass-stat-card__label">Last touch</span>
            <span class="glass-stat-card__value glass-stat-card__value--sm">{relTime(selected.last_touch_at || selected.last_activity_at)}</span>
          </div>
        </div>
      </header>

      <nav class="tabs tabs--glass" aria-label="Detail tabs">
        <button type="button" class="glass-btn glass-btn--sm tab-pill" class:tab-pill--active={activeTab === 'overview'} onclick={() => activeTab = 'overview'}>Overview</button>
        <button type="button" class="glass-btn glass-btn--sm tab-pill" class:tab-pill--active={activeTab === 'outreach'} onclick={() => activeTab = 'outreach'}>Outreach</button>
        <button type="button" class="glass-btn glass-btn--sm tab-pill" class:tab-pill--active={activeTab === 'activity'} onclick={() => activeTab = 'activity'}>Activity ({activities.length})</button>
        <button type="button" class="glass-btn glass-btn--sm tab-pill" class:tab-pill--active={activeTab === 'notes'}    onclick={() => activeTab = 'notes'}>Notes</button>
      </nav>

      <div class="sheet-body">
        {#if activeTab === 'overview'}
          <!-- Info-rail (Phase 1.1) — grey value on lighter grey row, click to edit -->
          <div class="info-rail" role="list">
            {#snippet rail(field: string, label: string, kind: 'text'|'email'|'tel'|'url'|'number'|'select', opts?: { options?: string[]; mono?: boolean })}
              {@const isEditing = editingField === field}
              {@const isSaving  = savingField === field}
              {@const isSaved   = savedField === field}
              {@const isError   = errorField === field}
              {@const raw       = (selected as any)?.[field]}
              {@const display   = raw === null || raw === undefined || raw === '' ? '—' : String(raw)}
              {@const isLink    = !isEditing && raw && (kind === 'email' || kind === 'tel' || kind === 'url')}
              <div
                class="info-rail__row info-rail__row--editable"
                role="button"
                tabindex="0"
                aria-label={`Edit ${label}`}
                onclick={(e) => {
                  // Don't enter edit if user clicked a link
                  if ((e.target as HTMLElement)?.closest('a')) return;
                  if (!isEditing) startEdit(field, raw);
                }}
                onkeydown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !isEditing) { e.preventDefault(); startEdit(field, raw); } }}
              >
                <span class="info-rail__label">{label}</span>
                {#if isEditing}
                  {#if kind === 'select' && opts?.options}
                    <select
                      class="info-rail__input"
                      bind:value={editingValue}
                      onblur={commitEdit}
                      onkeydown={onEditKey}
                    >
                      <option value="">—</option>
                      {#each opts.options as o}<option value={o}>{o}</option>{/each}
                    </select>
                  {:else}
                    <!-- svelte-ignore a11y_autofocus -->
                    <input
                      class="info-rail__input"
                      class:info-rail__value--mono={opts?.mono}
                      type={kind === 'number' ? 'number' : kind === 'email' ? 'email' : kind === 'url' ? 'url' : kind === 'tel' ? 'tel' : 'text'}
                      bind:value={editingValue}
                      autofocus
                      onblur={commitEdit}
                      onkeydown={onEditKey}
                      placeholder={`Enter ${label.toLowerCase()}`}
                    />
                  {/if}
                {:else if isLink}
                  <span class="info-rail__value info-rail__value--link" class:info-rail__value--mono={opts?.mono}>
                    {#if kind === 'email'}<a href={`mailto:${raw}`}>{display}</a>
                    {:else if kind === 'tel'}<a href={`tel:${raw}`}>{display}</a>
                    {:else}<a href={raw.startsWith('http') ? raw : `https://${raw}`} target="_blank" rel="noopener">{display}</a>{/if}
                  </span>
                {:else}
                  <span
                    class="info-rail__value"
                    class:info-rail__value--mono={opts?.mono}
                    class:info-rail__value--empty={display === '—'}
                  >{display}</span>
                {/if}
                <span
                  class="info-rail__action"
                  class:info-rail__action--saving={isSaving}
                  class:info-rail__action--saved={isSaved}
                  class:info-rail__action--error={isError}
                  aria-live="polite"
                >
                  {#if isSaving}saving…
                  {:else if isSaved}✓ saved
                  {:else if isError}! error
                  {:else if !isEditing}edit
                  {/if}
                </span>
              </div>
            {/snippet}

            {@render rail('legal_name',              'Legal name',          'text')}
            {@render rail('display_name',            'Display name',        'text')}
            <!-- 'domain' column historically stores SERVICE TYPE strings like
                 "Boat Sharing", "Patisserie", "IT Consulting" — not URLs.
                 Labeling accordingly so the field name matches the data. -->
            {@render rail('domain',                  'Service',             'text')}
            {@render rail('industry',                'Industry',            'text')}
            {@render rail('website',                 'Website',             'url')}
            {@render rail('primary_contact_name',    'Contact name',        'text')}
            {@render rail('primary_contact_title',   'Contact title',       'text')}
            {@render rail('primary_contact_email',   'Email',               'email')}
            {@render rail('primary_contact_phone',   'Phone',               'tel')}
            {@render rail('primary_contact_linkedin','LinkedIn',            'url')}
            {@render rail('address',                 'Address',             'text')}
            {@render rail('city',                    'City',                'text')}
            {@render rail('postal_code',             'Postal code',         'text')}
            {@render rail('canton_or_bezirk',        'Canton / Bezirk',     'text')}
            {@render rail('country_code',            'Country',             'select', { options: ['CH','AT','DE','LI','FR','IT'] })}
            {@render rail('employees',               'Employees',           'number')}
            {@render rail('language',                'Language',            'select', { options: ['de','en','fr','it'] })}
            {@render rail('uid_or_fn',               'UID / FN',            'text', { mono: true })}
            {@render rail('source',                  'Source signal',       'select', { options: ['cold_outbound','inbound','referral','networking','partner_marcel','partner_silas'] })}
            {#if selected.obsidian_note_path}
              <div class="info-rail__row info-rail__row--readonly" role="listitem">
                <span class="info-rail__label">Obsidian</span>
                <span class="info-rail__value info-rail__value--link">
                  <a href={`obsidian://open?path=${encodeURIComponent(selected.obsidian_note_path)}`}>
                    <span class="info-rail__value--mono">{selected.obsidian_note_path}</span>
                  </a>
                </span>
                <span class="info-rail__action"></span>
              </div>
            {/if}
            {#if selected.plane_customer_id}
              <div class="info-rail__row info-rail__row--readonly" role="listitem">
                <span class="info-rail__label">Plane ID</span>
                <span class="info-rail__value info-rail__value--mono info-rail__value--muted">{selected.plane_customer_id}</span>
                <span class="info-rail__action"></span>
              </div>
            {/if}
          </div>

          <!-- ─── Next action ───────────────────────────────────────────── -->
          <section class="panel">
            <header class="panel-header">
              <h3 class="crm-section-title">Next action</h3>
              {#if selected.next_action_at}
                <GlassValueChip tone="info" size="sm" static>
                  {#snippet children()}{fmtDate(selected!.next_action_at)} · {new Date(selected!.next_action_at!).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zurich' })}{/snippet}
                </GlassValueChip>
              {/if}
            </header>
            <div class="next-action-grid">
              <label class="meta-field">
                <span>When</span>
                <input
                  type="datetime-local"
                  bind:value={nextActionLocal}
                  step="900"
                />
              </label>
              <label class="meta-field">
                <span>Owner</span>
                <select bind:value={nextActionOwner}>
                  <option value="">— unassigned —</option>
                  {#each teamMembers as m (m.id)}
                    <option value={m.id}>{m.display_name || m.email}</option>
                  {/each}
                </select>
              </label>
              <div class="next-action-actions">
                <GlassActionPrimary loading={nextActionSaving} onclick={commitNextAction}>
                  {#snippet children()}{nextActionSaving ? 'Saving…' : (selected!.next_action_at ? 'Update' : 'Schedule')}{/snippet}
                </GlassActionPrimary>
                {#if selected.next_action_at}
                  <GlassActionSecondary loading={nextActionSaving} onclick={clearNextAction}>
                    {#snippet children()}Clear{/snippet}
                  </GlassActionSecondary>
                {/if}
              </div>
            </div>
          </section>

          <!-- ─── Prospect score + tags ───────────────────────────────── -->
          <section class="panel panel--glass">
            <header class="panel-header">
              <h3 class="crm-section-title">Signals</h3>
            </header>
            <div class="signals-grid">
              <div class="score-block">
                <p class="crm-section-eyebrow">Prospect score</p>
                <div class="score-ring-row">
                  <div
                    class="score-ring"
                    data-heat={(selected.prospect_score ?? 0) >= 67 ? 'hot' : (selected.prospect_score ?? 0) >= 34 ? 'warm' : 'cold'}
                    style={`--score-pct: ${selected.prospect_score ?? 0}%;`}
                    aria-hidden="true"
                  >
                    <div class="score-ring-inner">
                      <span class="score-ring-val">{selected.prospect_score ?? 0}</span>
                      <span class="score-ring-cap">/100</span>
                    </div>
                  </div>
                  <div class="score-controls">
                    <input
                      type="range" min="0" max="100" step="5"
                      value={selected.prospect_score ?? 0}
                      disabled={scoreSaving}
                      oninput={(e) => { if (selected) selected = { ...selected, prospect_score: Number((e.target as HTMLInputElement).value) }; }}
                      onchange={(e) => saveProspectScore(Number((e.target as HTMLInputElement).value))}
                      aria-label="Prospect score 0 to 100"
                    />
                    <div class="score-rail" aria-hidden="true">
                      <span class="score-tick">cold</span>
                      <span class="score-tick">warm</span>
                      <span class="score-tick">hot</span>
                    </div>
                  </div>
                </div>
              </div>

              <div class="tags-block">
                <p class="crm-section-eyebrow">Tags</p>
                <div class="tags-row">
                  {#each tags() as t (t)}
                    <GlassValueChip tone="neutral" size="sm" onclick={() => removeTag(t)} title={`Click to remove tag ${t}`}>
                      {#snippet children()}<span class="tag-label">{t}</span><span class="tag-x">×</span>{/snippet}
                    </GlassValueChip>
                  {:else}
                    <span class="info-rail__value--empty">No tags yet</span>
                  {/each}
                </div>
                <div class="tags-input">
                  <input
                    type="text"
                    placeholder="add tag + Enter"
                    bind:value={tagDraft}
                    onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                  />
                </div>
              </div>
            </div>
          </section>

          <!-- ─── Decision makers ─────────────────────────────────────── -->
          <section class="panel">
            <header class="panel-header">
              <h3 class="crm-section-title">Decision makers</h3>
              <span class="dim">{decisionMakers().length}</span>
            </header>

            {#if decisionMakers().length > 0}
              <ul class="dm-list">
                {#each decisionMakers() as dm, idx (idx + (dm.email || dm.name))}
                  <li class="dm-item">
                    <div class="dm-main">
                      <div class="dm-top">
                        <span class="dm-name">{dm.name}</span>
                        {#if dm.title}<span class="dm-title">· {dm.title}</span>{/if}
                        <GlassValueChip
                          tone={dm.role === 'primary' ? 'info' : dm.role === 'blocker' ? 'danger' : dm.role === 'champion' ? 'success' : 'violet'}
                          size="sm"
                          static
                        >
                          {#snippet children()}{dm.role || 'influencer'}{/snippet}
                        </GlassValueChip>
                        {#if dm.verified}
                          <GlassValueChip tone="success" size="sm" static>
                            {#snippet children()}verified{/snippet}
                          </GlassValueChip>
                        {/if}
                      </div>
                      <div class="dm-contact">
                        {#if dm.email}<a href={`mailto:${dm.email}`} class="dm-link">{dm.email}</a>{/if}
                        {#if dm.phone}<span class="dot">·</span><a href={`tel:${dm.phone}`} class="dm-link">{dm.phone}</a>{/if}
                        {#if dm.linkedin}<span class="dot">·</span><a href={dm.linkedin} target="_blank" rel="noopener" class="dm-link">LinkedIn</a>{/if}
                      </div>
                    </div>
                    <div class="dm-actions">
                      <GlassActionSecondary
                        kind="icon"
                        title="Toggle verified"
                        ariaLabel={dm.verified ? "Mark unverified" : "Mark verified"}
                        tone={dm.verified ? "success" : "default"}
                        onclick={() => toggleDmVerified(idx)}
                      >
                        {#snippet icon()}
                          {#if dm.verified}
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                          {:else}
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/></svg>
                          {/if}
                        {/snippet}
                      </GlassActionSecondary>
                      <GlassActionSecondary
                        kind="icon"
                        tone="danger"
                        ariaLabel="Remove decision maker"
                        title="Remove"
                        onclick={() => removeDecisionMaker(idx)}
                      >
                        {#snippet icon()}
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        {/snippet}
                      </GlassActionSecondary>
                    </div>
                  </li>
                {/each}
              </ul>
            {/if}

            <div class="dm-add">
              <div class="dm-add-grid">
                <input type="text" placeholder="Name *" bind:value={dmDraft.name} />
                <input type="text" placeholder="Title" bind:value={dmDraft.title} />
                <input type="email" placeholder="Email" bind:value={dmDraft.email} />
                <input type="tel" placeholder="Phone" bind:value={dmDraft.phone} />
                <input type="url" placeholder="LinkedIn URL" bind:value={dmDraft.linkedin} />
                <select bind:value={dmDraft.role}>
                  <option value="primary">Primary</option>
                  <option value="champion">Champion</option>
                  <option value="influencer">Influencer</option>
                  <option value="blocker">Blocker</option>
                </select>
              </div>
              <GlassActionPrimary
                disabled={!dmDraft.name.trim()}
                loading={dmAdding}
                onclick={addDecisionMaker}
              >
                {#snippet children()}{dmAdding ? 'Adding…' : 'Add decision maker'}{/snippet}
              </GlassActionPrimary>
            </div>
          </section>
        {:else if activeTab === 'outreach'}
          <div class="outreach-block">
            <div class="outreach-meta">
              <label class="meta-field">
                <span>Channel</span>
                <select bind:value={draftChannel}>
                  <option value="email">Email</option>
                  <option value="linkedin">LinkedIn</option>
                </select>
              </label>
              <label class="meta-field">
                <span>To</span>
                <input type="text" value={selected.primary_contact_email || ""} placeholder="primary contact email" readonly />
              </label>
            </div>
            <label class="meta-field">
              <span>Subject</span>
              <input type="text" bind:value={draftSubject} />
            </label>
            <label class="meta-field">
              <span>Body — personalized cold-pitch (auto-drafted from {selected.industry || 'industry signals'})</span>
              <textarea bind:value={draftBody} rows="14"></textarea>
            </label>

            <div class="outreach-actions">
              <!-- L1 hero — only ONE L1 in this action zone (Workstream W discipline) -->
              <GlassActionPrimary
                loading={aiGenerating}
                onclick={generateWithClaude}
                title="Reads the prospect's website + LinkedIn signals and writes a 100% personalized email"
              >
                {#snippet children()}{aiGenerating ? "Claude is reading the website…" : "✨ Generate with Claude"}{/snippet}
              </GlassActionPrimary>
              <GlassActionSecondary loading={draftSaving} onclick={saveDraft}>
                {#snippet children()}{draftSaving ? "Saving…" : "Save draft"}{/snippet}
              </GlassActionSecondary>
              <GlassActionSecondary onclick={copyDraft}>
                {#snippet children()}Copy to clipboard{/snippet}
              </GlassActionSecondary>
              <GlassActionSecondary
                tone="success"
                disabled={!selected.primary_contact_email}
                loading={draftSending}
                onclick={() => { confirmSend = true; confirmCheck = false; }}
              >
                {#snippet children()}{draftSending ? "Sending…" : `Send from Fanny${selected!.primary_contact_email ? '' : ' (no email on file)'}`}{/snippet}
              </GlassActionSecondary>
              {#if copyStatus === 'ok'}
                <span class="status-ok">✓ done</span>
              {:else if copyStatus === 'fail'}
                <span class="status-fail">! failed</span>
              {/if}
              {#if aiStatus === 'ok' && aiMeta}
                <span class="status-ok">✓ Claude · {aiMeta.model}{aiMeta.website_used ? ' · website read' : ' · website unreachable'}</span>
              {:else if aiStatus === 'fail'}
                <span class="status-fail">! Claude failed — check console + ANTHROPIC_API_KEY env</span>
              {/if}
            </div>

            <p class="outreach-hint">
              Template starts here. Click <strong>Generate with Claude</strong> to upgrade to a fully personalized version — the model fetches {selected.website || 'the prospect website'} live, reads what they do, and rewrites the email with at least one specific reference to their actual work. Edit freely afterward. <strong>Send from Fanny</strong> pushes via M365 Graph from fanny@c2moviez.com and logs to activity.
            </p>

            {#if sentHistory.length > 0}
              <div class="sent-history">
                <h4 class="sent-title">Sent history · {sentHistory.length} email{sentHistory.length === 1 ? '' : 's'}</h4>
                <ul class="sent-list">
                  {#each sentHistory as s}
                    <li class="sent-item">
                      <span class="sent-dot"></span>
                      <div class="sent-body">
                        <div class="sent-subject">{s.payload?.subject || '(no subject)'}</div>
                        <div class="sent-meta">
                          {s.payload?.channel || 'email'} · to {s.payload?.to || '?'} · from {s.payload?.from || 'fanny@c2moviez.com'}
                        </div>
                        <div class="sent-time">{relTime(s.created_at)}</div>
                      </div>
                    </li>
                  {/each}
                </ul>
              </div>
            {/if}

            {#if confirmSend}
              <div class="modal-overlay" role="dialog" aria-modal="true">
                <div class="modal-box">
                  <h3>Send this email now?</h3>
                  <p class="modal-meta">
                    <strong>From:</strong> fanny@c2moviez.com<br/>
                    <strong>To:</strong> {selected.primary_contact_email}<br/>
                    <strong>Subject:</strong> {draftSubject}
                  </p>
                  <div class="modal-preview">{draftBody.slice(0, 240)}{draftBody.length > 240 ? '…' : ''}</div>
                  <label class="modal-check">
                    <input type="checkbox" bind:checked={confirmCheck} />
                    I confirm this draft is ready and should be sent now. CTI gets a one-tap approval Telegram before it leaves c2moviez.
                  </label>
                  <div class="modal-actions">
                    <GlassActionSecondary onclick={() => confirmSend = false}>
                      {#snippet children()}Cancel{/snippet}
                    </GlassActionSecondary>
                    <GlassActionPrimary tone="success" disabled={!confirmCheck} onclick={sendViaM365}>
                      {#snippet children()}Send for approval + dispatch{/snippet}
                    </GlassActionPrimary>
                  </div>
                </div>
              </div>
            {/if}
          </div>
        {:else if activeTab === 'activity'}
          <div class="activity-quick">
            <input
              type="text"
              class="quick-input"
              placeholder="Quick log — e.g. 'Called, left voicemail' or 'Reviewed website — outdated portfolio'"
              bind:value={manualNote}
              onkeydown={(e) => { if (e.key === 'Enter' && !manualNoteSaving) addManualNote(); }}
            />
            <GlassActionPrimary
              disabled={!manualNote.trim()}
              loading={manualNoteSaving}
              onclick={addManualNote}
            >
              {#snippet children()}{manualNoteSaving ? "Logging…" : "Log it"}{/snippet}
            </GlassActionPrimary>
          </div>
          <ol class="timeline">
            {#each activities as a}
              <li class="t-item t-{a.action}">
                <span class="t-dot" data-action={a.action}></span>
                <div class="t-body">
                  <div class="t-action">
                    <strong>{a.action.replace(/_/g, ' ')}</strong>
                    <span class="t-actor">· {a.actor_label || (a.actor ? "user" : "system")}</span>
                  </div>
                  {#if a.action === 'manual_log' && a.payload?.text}
                    <div class="t-text">{a.payload.text}</div>
                  {:else if a.action === 'note_updated' && a.payload?.preview}
                    <div class="t-text dim">"{a.payload.preview}{(a.payload.length > 140) ? '…' : ''}"</div>
                  {:else if a.action === 'status_changed' && a.payload}
                    <div class="t-text">{STAGE_LABELS[a.payload.from as CustomerLifecycle] || a.payload.from} → <strong>{STAGE_LABELS[a.payload.to as CustomerLifecycle] || a.payload.to}</strong></div>
                  {:else if a.action === 'sent' && a.payload}
                    <div class="t-text">via {a.payload.channel} · to {a.payload.to} · "{a.payload.subject}"</div>
                  {:else if a.payload}
                    <details class="t-details"><summary class="dim">payload</summary><pre class="t-payload">{JSON.stringify(a.payload, null, 2)}</pre></details>
                  {/if}
                  <div class="t-time">{relTime(a.created_at)}</div>
                </div>
              </li>
            {:else}
              <li class="t-empty">No activity yet — use the quick log above to add the first entry.</li>
            {/each}
          </ol>
        {:else}
          <div class="notes-block">
            <label for="cold_notes">Research notes</label>
            <p class="hint">
              Capture what matters: website quality, digital presence,
              social-media gaps, brand consistency, content cadence, who the
              decision-maker is, mutual contacts, what c2moviez can offer them
              specifically. Saved on click — every save is logged to Activity.
            </p>
            <textarea
              id="cold_notes"
              bind:value={notesDraft}
              placeholder="What did Fanny find? Website hooks, brand gaps, digital-presence weaknesses, contact angles, recent news / hires / launches that matter…"
              rows="14"
            ></textarea>
            <div class="notes-actions">
              <GlassActionPrimary loading={notesSaving} onclick={saveNotes}>
                {#snippet children()}{notesSaving ? "Saving…" : "Save notes"}{/snippet}
              </GlassActionPrimary>
              {#if notesStatus === 'saved'}
                <span class="status-ok">✓ saved + logged to activity</span>
              {:else if notesStatus === 'fail'}
                <span class="status-fail">! save failed — retry</span>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</Sheet>

<style>
  /* Layout shell — matches existing /pipeline conventions */
  .page-header {
    padding: 24px 0 12px;
    border-bottom: 1px solid var(--brand-line);
    margin-bottom: 20px;
  }
  .hdr-row {
    display: flex; align-items: center; gap: 12px;
  }
  .page-header h1 {
    font-size: 28px; font-weight: 600; margin: 0;
    letter-spacing: -0.01em;
  }
  .hdr-sub {
    margin-top: 6px; color: var(--ink-2); font-size: 13px;
    display: flex; gap: 8px; align-items: center;
  }
  .hdr-sub .dot { opacity: 0.5; }
  .hdr-link {
    color: var(--brand); text-decoration: none;
    border-bottom: 1px solid transparent; transition: border-color 0.15s;
  }
  .hdr-link:hover { border-color: var(--brand); }

  /* View bar */
  .view-bar {
    display: flex; align-items: center; justify-content: space-between;
    gap: 16px; flex-wrap: wrap;
    padding: 12px 16px; margin-bottom: 16px;
    background: var(--glass-chrome, var(--canvas-2));
    backdrop-filter: var(--blur-chrome, blur(20px));
    border: 1px solid var(--brand-line);
    border-radius: 12px;
  }
  .filters {
    display: flex; gap: 12px; align-items: center; flex-wrap: wrap;
  }
  .filter-chip {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 6px 10px; border: 1px solid var(--brand-line); border-radius: 8px;
    background: var(--canvas-1);
    font-size: 12px; color: var(--ink-2);
  }
  .filter-label { font-weight: 500; }
  .filter-chip select {
    background: transparent; border: none; color: var(--ink); cursor: pointer;
    font-size: 12px; padding: 0;
  }
  .search {
    padding: 7px 12px; min-width: 260px;
    border: 1px solid var(--brand-line); border-radius: 8px;
    background: var(--canvas-1); color: var(--ink);
    font-size: 13px; outline: none;
  }
  .search:focus { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-glow); }
  .stats { display: flex; gap: 8px; }

  .source-legend {
    display: flex; align-items: center; flex-wrap: wrap;
    gap: 14px;
    padding: 8px 14px; margin-bottom: 16px;
    font-size: 11px; color: var(--ink-2);
  }
  .legend-label {
    font-weight: 700; letter-spacing: 0.06em;
    color: var(--ink-3); text-transform: uppercase;
  }
  .legend-item { display: inline-flex; align-items: center; gap: 6px; }

  /* Pipeline analytics panel — collapsible funnel + KPI chips above Kanban */
  .analytics {
    margin-bottom: 16px;
    background: var(--glass-chrome, var(--canvas-2));
    backdrop-filter: var(--blur-chrome, blur(20px));
    border: 1px solid var(--brand-line, var(--line));
    border-radius: 12px;
    overflow: hidden;
  }
  .analytics-toggle {
    display: flex; align-items: baseline; gap: 12px;
    width: 100%;
    padding: 10px 16px;
    background: transparent;
    border: 0;
    color: var(--ink);
    cursor: pointer;
    text-align: left;
    font: inherit;
  }
  .analytics-toggle:hover { background: color-mix(in oklab, #56bcec 6%, transparent); }
  .analytics-title {
    font-size: 11px; font-weight: 700; letter-spacing: 0.08em;
    color: var(--ink);
  }
  .analytics-sub {
    font-size: 11px; color: var(--ink-3);
    flex: 1;
  }
  .analytics-chevron {
    font-size: 11px; color: var(--ink-2);
  }
  .analytics--open .analytics-toggle {
    border-bottom: 1px solid var(--brand-line, var(--line));
  }
  .analytics-body {
    display: grid;
    grid-template-columns: minmax(280px, 1fr) minmax(320px, 2fr);
    gap: 20px;
    padding: 16px;
  }
  @media (max-width: 880px) {
    .analytics-body { grid-template-columns: 1fr; }
  }

  .kpi-row {
    display: flex; flex-direction: column; gap: 10px;
  }
  .kpi-chip {
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-rows: auto auto;
    column-gap: 12px;
    align-items: baseline;
    padding: 10px 14px;
    border: 1px solid var(--brand-line, var(--line));
    border-left: 3px solid #56bcec;
    border-radius: 8px;
    background: var(--canvas-1);
  }
  .kpi-chip--active { border-left-color: #f97316; }
  .kpi-chip--mrr    { border-left-color: #56bcec; }
  .kpi-label {
    grid-column: 1;
    font-size: 11px; font-weight: 600; letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--ink-2);
  }
  .kpi-value {
    grid-column: 2; grid-row: 1 / span 2;
    font-size: 22px; font-weight: 700;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }
  .kpi-sub {
    grid-column: 1;
    font-size: 11px; color: var(--ink-3);
  }

  .funnel {
    align-self: stretch;
    display: flex; align-items: center;
  }
  .funnel-svg {
    width: 100%;
    height: 196px;
    display: block;
    color: var(--ink-2);
  }
  .funnel-stage-label {
    font-size: 11px;
    font-weight: 500;
    font-family: var(--crm-font-ui, inherit);
    fill: var(--ink-2);
  }
  .funnel-track {
    fill: var(--canvas-1);
    stroke: var(--brand-line, var(--line));
    stroke-width: 1;
  }
  .funnel-bar {
    transition: width 220ms ease;
  }
  .funnel-count {
    font-size: 11px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    fill: var(--ink);
  }

  @media (prefers-reduced-motion: reduce) {
    .funnel-bar { transition: none; }
  }

  /* Cluster headers — span N stage columns each (Prospect=3, Sales=4, Lost=1) */
  .cluster-headers {
    display: grid;
    grid-template-columns: repeat(3, minmax(180px, 1fr)) repeat(4, minmax(180px, 1fr)) minmax(180px, 1fr);
    gap: 14px;
    margin-bottom: 8px;
  }
  .cluster-header {
    padding: 4px 12px 8px;
    border-bottom: 2px solid var(--cluster-accent, var(--crm-gray-300));
  }
  .cluster-header__top { display: flex; align-items: baseline; gap: 8px; }
  .cluster-header__label {
    font: 700 11px/1.2 var(--crm-font-ui);
    letter-spacing: .14em;
    color: var(--cluster-accent, var(--crm-gray-500));
  }
  .cluster-header__count {
    font: 700 12px/1 var(--crm-font-mono);
    color: var(--crm-gray-600);
    font-variant-numeric: tabular-nums;
  }
  .cluster-header__sub {
    font: 500 10.5px/1.4 var(--crm-font-ui);
    color: var(--crm-gray-400);
    margin-top: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Kanban board — 8 stage lanes laid out across the 3 clusters above */
  .board--stages {
    display: grid;
    grid-template-columns: repeat(3, minmax(180px, 1fr)) repeat(4, minmax(180px, 1fr)) minmax(180px, 1fr);
    gap: 14px;
    min-height: 60vh;
  }
  @media (max-width: 1400px) {
    /* Below 1400px the 8-column layout becomes too cramped — horizontal scroll. */
    .cluster-headers, .board--stages {
      grid-template-columns: repeat(3, 200px) repeat(4, 200px) 200px;
      overflow-x: auto;
      padding-bottom: 4px;
    }
  }
  @media (max-width: 860px) {
    .cluster-headers, .board--stages { grid-template-columns: 1fr; overflow-x: visible; }
    .cluster-header { grid-column: 1 / -1; }
  }

  /* Legacy 3-lane .board styling kept for compatibility (no longer rendered) */
  .board {
    display: grid;
    grid-template-columns: repeat(3, minmax(220px, 1fr));
    gap: 14px;
    min-height: 60vh;
  }

  .lane {
    display: flex; flex-direction: column; gap: 10px;
    padding: 12px;
    background: var(--canvas-1);
    border: 1px solid var(--brand-line);
    border-radius: 12px;
    box-shadow: 0 0 0 0 var(--lane-glow);
    transition: background 160ms ease, border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
  }
  .lane--stage {
    padding: 10px 8px 12px;
    gap: 8px;
  }
  .lane--stage .lane-header { padding: 2px 4px 6px; }
  .lane--stage .lane-name {
    font-size: 11.5px;
    letter-spacing: .03em;
  }
  .lane--stage .lane-empty {
    /* Empty stage lanes show nothing — just an invisible spacer so the
       drop-target area still has a tiny height. AUDIT-2 Bug 1. */
    min-height: 24px;
  }
  .lane--drop-target {
    background: color-mix(in oklab, var(--lane-accent) 8%, var(--canvas-1));
    border-color: var(--lane-accent);
    box-shadow: 0 0 0 1px var(--lane-accent), 0 18px 48px var(--lane-glow);
    transform: translateY(-1px);
  }
  .lane--drop-target .lane-cards::after {
    content: "Drop to move to " attr(data-lane-name);
    display: block;
    margin-top: 4px;
    padding: 14px;
    text-align: center;
    color: var(--lane-accent);
    font-size: 11px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.08em;
    border: 1.5px dashed var(--lane-accent);
    border-radius: 10px;
    background: color-mix(in oklab, var(--lane-accent) 6%, transparent);
  }
  .lane-header {
    display: flex; flex-direction: column; gap: 2px;
    padding: 4px 4px 8px;
    border-bottom: 1px dashed var(--brand-line);
  }
  .lane-title {
    display: flex; align-items: center; justify-content: space-between;
  }
  .lane-name {
    font-size: 13px; font-weight: 600;
    letter-spacing: 0.04em; text-transform: uppercase;
    color: var(--lane-accent);
  }
  .lane-count {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 11px; padding: 2px 8px;
    background: var(--canvas-2); border-radius: 999px;
    color: var(--ink-2);
  }
  .lane-sub { font-size: 11px; color: var(--ink-3); }
  .lane-cards { display: flex; flex-direction: column; gap: 8px; }
  .lane-empty {
    text-align: center; color: var(--ink-3);
    font-size: 12px; padding: 16px 8px;
    border: 1px dashed var(--brand-line); border-radius: 8px;
  }

  .lane-expand {
    margin-top: 4px;
    padding: 8px 10px;
    background: transparent;
    border: 1px dashed var(--lane-accent);
    border-radius: 8px;
    color: var(--lane-accent);
    font-size: 11px; font-weight: 600;
    letter-spacing: 0.04em; text-transform: uppercase;
    cursor: pointer;
    transition: background 0.15s;
  }
  .lane-expand:hover { background: color-mix(in oklab, var(--lane-accent) 10%, transparent); }

  /* Card — high-end reactive feel: lifts on hover, subtle shadow, drag affordance */
  .card {
    display: block; width: 100%;
    padding: 11px 12px;
    background: var(--canvas-2, #FFFFFF);
    border: 1px solid var(--crm-gray-200, #E1E5EB);
    border-radius: 10px;
    text-align: left; cursor: grab;
    box-shadow: var(--crm-sh-1);
    transition: transform 120ms cubic-bezier(.2,.0,.0,1),
                border-color 120ms cubic-bezier(.2,.0,.0,1),
                box-shadow 160ms cubic-bezier(.2,.0,.0,1),
                background 120ms cubic-bezier(.2,.0,.0,1);
  }
  .card:hover {
    border-color: var(--lane-accent);
    box-shadow: var(--crm-sh-2), 0 6px 16px var(--lane-glow);
    transform: translateY(-2px);
    background: color-mix(in oklab, var(--lane-accent) 3%, var(--canvas-2, #FFFFFF));
  }
  .card:active { cursor: grabbing; transform: translateY(0); }
  .card:focus-visible {
    outline: none;
    box-shadow: var(--crm-focus-ring, 0 0 0 3px rgba(86,188,236,.32));
  }
  .card--dragging {
    opacity: 0.45;
    cursor: grabbing;
    transform: scale(0.97) rotate(-1.5deg);
    box-shadow: var(--crm-sh-3);
  }
  .card--graduating {
    animation: card-graduate 360ms cubic-bezier(.2,.0,.0,1) forwards;
    pointer-events: none;
  }
  @keyframes card-graduate {
    0%   { opacity: 1; transform: translate(0,0)     scale(1);    }
    60%  { opacity: 1; transform: translate(8px,-12px) scale(1.02); box-shadow: var(--crm-sh-2); }
    100% { opacity: 0; transform: translate(40px,-32px) scale(.94);  }
  }
  .card-row1 {
    display: flex; align-items: center; gap: 8px;
    margin-bottom: 6px;
  }
  .code {
    display: inline-block; padding: 2px 6px;
    border-radius: 4px; color: white;
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 11px; font-weight: 600;
    letter-spacing: 0.02em;
  }
  .name {
    font-size: 13px; font-weight: 500; color: var(--ink);
    flex: 1; min-width: 0;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .flag {
    font-size: 10px; padding: 2px 6px;
    background: var(--brand-soft); border-radius: 4px;
    color: var(--ink-2); font-weight: 600;
  }
  .card-row2 {
    display: flex; gap: 6px; align-items: center; flex-wrap: wrap;
    margin-bottom: 6px;
  }
  .stage-chip, .contract-chip {
    font-size: 10px; padding: 2px 6px; border-radius: 4px;
    background: var(--brand-soft); color: var(--ink-2);
    text-transform: uppercase; letter-spacing: 0.04em;
  }

  /* Source chip — who brought this customer in.
     Cyan = CRM cold-acquisition;  Purple = CTI's network;
     Green = inbound;  Amber = networking;  Orange = partners. */
  .source-chip {
    display: inline-flex; align-items: center; justify-content: center;
    min-width: 26px; padding: 2px 6px;
    border-radius: 4px; flex-shrink: 0;
    font-size: 10px; font-weight: 700;
    letter-spacing: 0.04em; text-transform: uppercase;
    color: white;
    border: 1px solid transparent;
  }
  .source-chip.src-crm     { background: #56bcec; }
  .source-chip.src-cti     { background: #8b5cf6; }
  .source-chip.src-inbound { background: #22c55e; }
  .source-chip.src-net     { background: #eab308; color: #1f2937; }
  .source-chip.src-marcel  { background: #f59e0b; }
  .source-chip.src-silas   { background: #f97316; }
  .contract-chip {
    background: var(--lane-accent); color: white; opacity: 0.85;
  }
  .mrr {
    margin-left: auto;
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 11px; color: var(--ink);
    font-weight: 600;
  }
  .card-row3 {
    display: flex; justify-content: space-between; align-items: center;
    font-size: 11px; color: var(--ink-3);
  }
  .industry {
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    max-width: 60%;
  }
  .touch { white-space: nowrap; }

  .loading {
    padding: 40px; text-align: center; color: var(--ink-2);
  }

  /* ── Sheet: forced LIGHT mode for readability ─────────────────────────────
     The bits-ui Dialog portal renders outside our scoped tree, so use
     :global() selectors to override the dark-glass default. All Sheet
     content is on a pure-white surface with dark text + subtle gray borders
     + c2moviez brand accent. */
  :global(.nex-sheet-overlay) {
    background: rgba(15, 23, 42, 0.45) !important;
    backdrop-filter: blur(4px) !important;
  }
  :global(.nex-sheet-content) {
    background: #ffffff !important;
    color: #1f2937 !important;
    border-left: 1px solid #e5e7eb !important;
    box-shadow: -20px 0 60px rgba(15, 23, 42, 0.18) !important;
  }
  :global(.nex-sheet-content *) { color: inherit; }
  :global(.nex-sheet-header) {
    background: #ffffff !important;
    border-bottom: 1px solid #e5e7eb !important;
  }
  :global(.nex-sheet-title) { color: #1f2937 !important; }
  :global(.nex-sheet-close) { color: #6b7280 !important; }
  :global(.nex-sheet-close:hover) { color: #1f2937 !important; }
  :global(.nex-sheet-body) {
    background: #ffffff !important;
    color: #1f2937 !important;
  }

  /* Sheet local styles — high-end light surface, tokens from crm-design-system.css */
  .sheet {
    display: flex; flex-direction: column; height: 100%;
    width: 560px; max-width: 100vw;
    background: var(--crm-gray-0, #FFFFFF);
    color: var(--crm-gray-800, #1A1F2C);
    font-family: var(--crm-font-ui, 'Inter', sans-serif);
  }
  .sheet-hdr {
    padding: 22px 24px 18px;
    border-bottom: 1px solid var(--crm-gray-200, #E1E5EB);
    background:
      linear-gradient(180deg, var(--crm-gray-50, #FAFBFC) 0%, var(--crm-gray-0, #FFFFFF) 100%);
  }
  .sheet-hdr-top {
    display: flex; gap: 14px; align-items: flex-start;
  }
  .sheet-hdr-title { flex: 1; min-width: 0; }
  .code-lg {
    display: inline-flex; align-items: center; justify-content: center;
    width: 46px; height: 46px; border-radius: 12px;
    color: white; font-weight: 700; font-size: 14px;
    font-family: var(--crm-font-mono, ui-monospace, monospace);
    letter-spacing: -.01em;
    flex-shrink: 0;
    box-shadow: var(--crm-sh-1);
  }
  .sheet-hdr h2 {
    font: 600 22px/1.25 var(--crm-font-display, 'Space Grotesk', sans-serif);
    margin: 0;
    color: var(--crm-gray-900, #0E1119);
    letter-spacing: -.01em;
  }
  .sheet-meta {
    display: flex; gap: 10px; align-items: center; margin-top: 8px;
    font-size: 12px; flex-wrap: wrap;
  }
  .dim { color: var(--crm-gray-400, #94A0B0); }
  .sheet-stats {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;
    margin-top: 14px;
  }

  /* Status picker in the header — refined pill */
  .status-picker {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 5px 12px 5px 14px;
    background: var(--crm-brand-haze, rgba(86,188,236,.08));
    border: 1px solid rgba(86,188,236,.28);
    border-radius: 999px;
    transition: border-color 120ms ease, background 120ms ease;
  }
  .status-picker:hover { border-color: var(--crm-brand, #56BCEC); }
  .status-label {
    font: 700 10.5px/1.2 var(--crm-font-ui);
    letter-spacing: .08em; text-transform: uppercase;
    color: var(--crm-brand-deep, #1F7AAB);
  }
  .status-picker select {
    background: transparent;
    border: none;
    color: var(--crm-gray-800);
    font: 600 12px/1.4 var(--crm-font-ui);
    text-transform: uppercase; letter-spacing: .04em;
    cursor: pointer;
    padding: 0;
    outline: none;
  }
  .status-picker select:disabled { opacity: .55; cursor: wait; }

  .tabs {
    display: flex; gap: 2px;
    padding: 0 24px;
    border-bottom: 1px solid var(--crm-gray-200, #E1E5EB);
    background: var(--crm-gray-0, #FFFFFF);
  }
  .tabs button {
    position: relative;
    padding: 13px 14px 12px;
    background: transparent; border: none; cursor: pointer;
    font: 600 12px/1 var(--crm-font-ui);
    letter-spacing: .06em; text-transform: uppercase;
    color: var(--crm-gray-500, #6B7689);
    transition: color 120ms ease;
  }
  .tabs button:hover { color: var(--crm-gray-800); }
  /* Legacy .tabs button.active styles replaced by .tab-pill--active (glass pill system) */

  .sheet-body {
    flex: 1; overflow-y: auto;
    padding: 22px 24px 28px;
    background: var(--crm-gray-0, #FFFFFF);
  }
  .sheet-body::-webkit-scrollbar { width: 10px; }
  .sheet-body::-webkit-scrollbar-thumb { background: var(--crm-gray-200); border-radius: 8px; border: 2px solid var(--crm-gray-0); }
  .sheet-body::-webkit-scrollbar-thumb:hover { background: var(--crm-gray-300); }

  /* .info-grid superseded by .info-rail (crm-design-system.css) — Phase 1.1 */
  .mono { font-family: var(--crm-font-mono, ui-monospace, monospace); font-size: 12px; }

  /* Activity timeline — token-aligned + color-coded action types */
  .activity-quick {
    display: flex; gap: 8px;
    padding: 10px 12px; margin-bottom: 16px;
    background: var(--crm-gray-50, #FAFBFC);
    border: 1px solid var(--crm-gray-200, #E1E5EB);
    border-radius: 10px;
  }
  .quick-input {
    flex: 1;
    padding: 9px 12px;
    background: var(--crm-gray-0, #FFFFFF);
    border: 1px solid var(--crm-gray-200, #E1E5EB);
    border-radius: 8px;
    color: var(--crm-gray-800, #1A1F2C);
    font: 500 13px/1.4 var(--crm-font-ui);
    outline: none;
    transition: border-color 120ms ease, box-shadow 120ms ease;
  }
  .quick-input:focus {
    border-color: var(--crm-brand, #56BCEC);
    box-shadow: var(--crm-focus-ring, 0 0 0 3px rgba(86,188,236,.32));
  }

  .timeline {
    list-style: none; margin: 0; padding: 0;
    position: relative;
  }
  .timeline::before {
    content: "";
    position: absolute; left: 4px; top: 4px; bottom: 4px;
    width: 1px; background: var(--crm-gray-200, #E1E5EB);
  }
  .t-item { display: flex; gap: 12px; padding: 11px 0; }
  .t-dot {
    flex-shrink: 0; width: 9px; height: 9px;
    background: var(--crm-brand, #56BCEC); border-radius: 50%;
    margin-top: 6px; box-shadow: 0 0 0 3px var(--crm-gray-0, #FFFFFF);
    z-index: 1;
  }
  .t-dot[data-action="status_changed"] { background: var(--crm-warn, #D97700); }
  .t-dot[data-action="sent"]           { background: var(--crm-success, #1EA033); }
  .t-dot[data-action="manual_log"]     { background: var(--crm-violet, #6B4FD8); }
  .t-dot[data-action="note_updated"]   { background: var(--crm-brand, #56BCEC); }
  .t-dot[data-action="edit"]           { background: var(--crm-brand-deep, #1F7AAB); }
  .t-dot[data-action="created"]        { background: var(--crm-gray-400, #94A0B0); }
  .t-dot[data-action="reply_logged"]   { background: var(--crm-success, #1EA033); }

  .t-body { flex: 1; min-width: 0; }
  .t-action { font: 500 13px/1.45 var(--crm-font-ui); color: var(--crm-gray-800, #1A1F2C); }
  .t-action strong { font-weight: 600; text-transform: capitalize; color: var(--crm-gray-900, #0E1119); }
  .t-actor { font: 500 11px/1.3 var(--crm-font-ui); color: var(--crm-gray-400, #94A0B0); }
  .t-text {
    font: 400 13px/1.55 var(--crm-font-ui);
    color: var(--crm-gray-600, #4E5968);
    margin-top: 4px;
  }
  .t-text.dim { color: var(--crm-gray-400); font-style: italic; }
  .t-time { font: 500 11px/1.3 var(--crm-font-ui); color: var(--crm-gray-400, #94A0B0); margin-top: 4px; }
  .t-details summary { font-size: 11px; cursor: pointer; color: var(--crm-gray-500); }
  .t-payload {
    margin-top: 4px; padding: 8px 10px;
    background: var(--crm-gray-100, #F4F6F9); border-radius: 6px;
    font-size: 11px; font-family: var(--crm-font-mono, ui-monospace, monospace);
    overflow-x: auto; max-height: 120px; color: var(--crm-gray-700, #2F3848);
    border: 1px solid var(--crm-gray-200, #E1E5EB);
  }
  .t-empty {
    color: var(--crm-gray-400); font-style: italic; padding: 24px;
    text-align: center;
    background: var(--crm-gray-50, #FAFBFC);
    border: 1px dashed var(--crm-gray-200, #E1E5EB);
    border-radius: 10px;
  }

  /* Outreach editor — light mode */
  .outreach-block { display: flex; flex-direction: column; gap: 14px; }
  .outreach-meta { display: grid; grid-template-columns: 1fr 1.6fr; gap: 12px; }
  .meta-field { display: flex; flex-direction: column; gap: 6px; }
  .meta-field > span {
    font: 700 10.5px/1.2 var(--crm-font-ui);
    color: var(--crm-gray-400, #94A0B0);
    text-transform: uppercase; letter-spacing: .08em;
  }
  .meta-field input, .meta-field select, .meta-field textarea {
    padding: 10px 12px;
    background: var(--crm-gray-0, #FFFFFF);
    border: 1px solid var(--crm-gray-200, #E1E5EB);
    border-radius: 8px;
    color: var(--crm-gray-800, #1A1F2C);
    font: 500 13px/1.55 var(--crm-font-ui);
    transition: border-color 120ms ease, box-shadow 120ms ease, background 120ms ease;
  }
  .meta-field textarea {
    resize: vertical; min-height: 220px;
    font: 400 13px/1.65 var(--crm-font-mono, ui-monospace, monospace);
  }
  .meta-field input:focus, .meta-field textarea:focus, .meta-field select:focus {
    outline: none; border-color: var(--crm-brand, #56BCEC);
    box-shadow: var(--crm-focus-ring, 0 0 0 3px rgba(86,188,236,.32));
  }
  .meta-field input[readonly] { background: var(--crm-gray-100, #F4F6F9); color: var(--crm-gray-500, #6B7689); cursor: default; }
  .outreach-actions {
    display: flex; gap: 8px; align-items: center; flex-wrap: wrap;
    padding-top: 4px;
  }
  .btn-ghost, .btn-primary {
    padding: 9px 16px;
    border-radius: 8px;
    font: 600 12px/1 var(--crm-font-ui);
    letter-spacing: .06em; text-transform: uppercase;
    cursor: pointer;
    transition: background 120ms ease, transform 120ms ease, box-shadow 160ms ease, filter 120ms ease;
  }
  .btn-ghost {
    background: var(--crm-gray-0, #FFFFFF);
    border: 1px solid var(--crm-gray-200, #E1E5EB);
    color: var(--crm-gray-700, #2F3848);
  }
  .btn-ghost:hover:not(:disabled) { background: var(--crm-gray-100, #F4F6F9); color: var(--crm-gray-900); border-color: var(--crm-gray-300); }
  .btn-primary {
    background: var(--crm-brand, #56BCEC);
    border: 1px solid var(--crm-brand, #56BCEC);
    color: white;
    box-shadow: var(--crm-sh-1);
  }
  .btn-primary:hover:not(:disabled) { filter: brightness(1.06); box-shadow: var(--crm-sh-2); transform: translateY(-1px); }
  .btn-primary:active:not(:disabled) { transform: translateY(0); }
  .btn-primary:disabled, .btn-ghost:disabled, .btn-ai:disabled { opacity: 0.55; cursor: wait; transform: none; }
  .btn-ai {
    padding: 9px 16px;
    border-radius: 8px;
    font: 700 12px/1 var(--crm-font-ui);
    letter-spacing: .06em; text-transform: uppercase;
    cursor: pointer;
    background: linear-gradient(135deg, var(--crm-violet, #6B4FD8) 0%, var(--crm-brand, #56BCEC) 100%);
    border: 1px solid transparent;
    color: white;
    box-shadow: 0 2px 12px rgba(107,79,216,.28);
    transition: filter 120ms ease, transform 120ms ease, box-shadow 160ms ease;
  }
  .btn-ai:hover:not(:disabled) { filter: brightness(1.08); transform: translateY(-1px); box-shadow: 0 4px 18px rgba(107,79,216,.36); }

  /* Sent-history (mail-viewer feel) */
  .sent-history {
    margin-top: 6px;
    padding: 16px 18px;
    background: var(--crm-gray-50, #FAFBFC);
    border: 1px solid var(--crm-gray-200, #E1E5EB);
    border-radius: 12px;
  }
  .sent-title {
    margin: 0 0 12px;
    font: 700 10.5px/1.2 var(--crm-font-ui);
    color: var(--crm-gray-400);
    text-transform: uppercase; letter-spacing: .08em;
  }
  .sent-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
  .sent-item {
    display: flex; gap: 10px; padding: 10px 12px;
    background: var(--crm-gray-0, #FFFFFF);
    border: 1px solid var(--crm-gray-200, #E1E5EB);
    border-radius: 10px;
    transition: box-shadow 160ms ease, transform 120ms ease;
  }
  .sent-item:hover { box-shadow: var(--crm-sh-1); transform: translateY(-1px); }
  .sent-dot { flex-shrink: 0; width: 8px; height: 8px; background: var(--crm-success, #1EA033); border-radius: 50%; margin-top: 7px; box-shadow: 0 0 0 3px var(--crm-gray-0); }
  .sent-body { flex: 1; min-width: 0; }
  .sent-subject { font: 600 13px/1.4 var(--crm-font-ui); color: var(--crm-gray-900, #0E1119); word-break: break-word; }
  .sent-meta { font: 500 11.5px/1.4 var(--crm-font-ui); color: var(--crm-gray-500, #6B7689); margin-top: 3px; word-break: break-word; }
  .sent-time { font: 500 11px/1.3 var(--crm-font-ui); color: var(--crm-gray-400); margin-top: 4px; }
  .status-ok    { font: 600 12px/1.3 var(--crm-font-ui); color: var(--crm-success, #1EA033); }
  .status-fail  { font: 600 12px/1.3 var(--crm-font-ui); color: var(--crm-danger, #DC2626); }
  .outreach-hint { font: 400 12px/1.6 var(--crm-font-ui); color: var(--crm-gray-500, #6B7689); margin: 0; }

  .modal-overlay {
    position: fixed; inset: 0; background: rgba(15, 23, 42, 0.45);
    backdrop-filter: blur(4px);
    display: grid; place-items: center; z-index: 1000;
  }
  .modal-box {
    width: min(520px, 92vw);
    padding: 22px 24px;
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 14px;
    box-shadow: 0 20px 60px rgba(15, 23, 42, 0.2);
    display: flex; flex-direction: column; gap: 14px;
    color: #1f2937;
  }
  .modal-box h3 { margin: 0; font-size: 16px; font-weight: 600; color: #1f2937; }
  .modal-meta { margin: 0; font-size: 12px; color: #374151; line-height: 1.7; }
  .modal-meta strong { color: #1f2937; }
  .modal-preview {
    padding: 10px 12px; background: #f9fafb;
    border: 1px solid #e5e7eb; border-radius: 8px;
    font-family: ui-monospace, monospace; font-size: 11.5px; line-height: 1.55;
    max-height: 140px; overflow-y: auto;
    white-space: pre-wrap;
    color: #374151;
  }
  .modal-check {
    display: flex; gap: 8px; align-items: flex-start;
    font-size: 12px; color: #374151; line-height: 1.5;
    cursor: pointer;
  }
  .modal-check input { margin-top: 2px; }
  .modal-actions {
    display: flex; gap: 8px; justify-content: flex-end;
  }

  /* Notes tab */
  .notes-block { display: flex; flex-direction: column; gap: 10px; }
  .notes-block label {
    display: block; font-size: 11px; color: #6b7280;
    text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 0;
    font-weight: 600;
  }
  .notes-block textarea {
    width: 100%; min-height: 240px;
    padding: 12px 14px;
    background: #ffffff; color: #1f2937;
    border: 1px solid #e5e7eb; border-radius: 10px;
    font-family: inherit; font-size: 13px; line-height: 1.6;
    resize: vertical;
  }
  .notes-block textarea:focus {
    outline: none;
    border-color: #56bcec;
    box-shadow: 0 0 0 3px rgba(86, 188, 236, 0.18);
  }
  .notes-block .hint {
    font-size: 11.5px; color: #6b7280; margin: 0;
    line-height: 1.55;
  }
  .notes-actions {
    display: flex; gap: 10px; align-items: center;
  }

  /* ─── Phase 1.3 panels (next-action / signals / decision-makers) ─────────── */
  .panel {
    margin-top: 20px;
    padding: 16px 18px;
    background: var(--crm-gray-0, #FFFFFF);
    border: 1px solid var(--crm-gray-200, #E1E5EB);
    border-radius: 12px;
    box-shadow: var(--crm-sh-1);
  }
  .panel-header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 14px;
  }
  .panel-header .crm-section-title { margin: 0; }
  .panel-header .dim { font: 500 12px/1 var(--crm-font-ui); color: var(--crm-gray-400); }

  /* Next-action */
  .next-action-grid {
    display: grid;
    grid-template-columns: 1.2fr 1fr auto;
    gap: 12px;
    align-items: end;
  }
  @media (max-width: 560px) { .next-action-grid { grid-template-columns: 1fr; } }
  .next-action-actions { display: flex; gap: 8px; }

  /* Signals (prospect_score + tags) */
  .signals-grid {
    display: grid;
    grid-template-columns: 1fr 1.4fr;
    gap: 20px;
  }
  @media (max-width: 560px) { .signals-grid { grid-template-columns: 1fr; gap: 16px; } }

  .score-block { display: flex; flex-direction: column; gap: 6px; }
  .score-controls input[type="range"] {
    flex: 1;
    -webkit-appearance: none; appearance: none;
    height: 6px; border-radius: 4px;
    background: linear-gradient(90deg,
      var(--crm-gray-400) 0%,
      var(--crm-warn) 50%,
      var(--crm-success) 100%);
    outline: none;
  }
  .score-controls input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none; appearance: none;
    width: 18px; height: 18px; border-radius: 50%;
    background: var(--crm-gray-0);
    border: 2px solid var(--crm-brand-deep);
    box-shadow: var(--crm-sh-1);
    cursor: pointer;
    transition: transform 120ms ease;
  }
  .score-controls input[type="range"]::-webkit-slider-thumb:hover { transform: scale(1.12); }
  .score-controls input[type="range"]::-moz-range-thumb {
    width: 18px; height: 18px; border-radius: 50%;
    background: var(--crm-gray-0);
    border: 2px solid var(--crm-brand-deep);
    cursor: pointer;
  }
  .score-rail {
    display: flex; justify-content: space-between;
    font: 600 10px/1 var(--crm-font-ui);
    color: var(--crm-gray-400);
    letter-spacing: .08em; text-transform: uppercase;
    padding: 0 4px;
  }

  /* Tags */
  .tags-block { display: flex; flex-direction: column; gap: 8px; }
  .tags-row {
    display: flex; flex-wrap: wrap; gap: 6px;
    min-height: 28px;
  }
  .chip-x {
    all: unset; cursor: pointer;
    margin-left: 4px; padding: 0 4px;
    line-height: 1;
    color: var(--crm-gray-400);
    font-weight: 700;
    border-radius: 4px;
    transition: color 120ms ease, background 120ms ease;
  }
  .chip-x:hover { color: var(--crm-danger); background: rgba(220,38,38,.08); }
  .tags-input input {
    width: 100%;
    padding: 8px 12px;
    background: var(--crm-gray-100);
    border: 1px solid var(--crm-gray-200);
    border-radius: 8px;
    color: var(--crm-gray-800);
    font: 500 13px/1.4 var(--crm-font-ui);
    outline: none;
    transition: background 120ms, border-color 120ms, box-shadow 120ms;
  }
  .tags-input input:focus {
    background: var(--crm-gray-0);
    border-color: var(--crm-brand);
    box-shadow: var(--crm-focus-ring);
  }

  /* Decision makers */
  .dm-list { list-style: none; margin: 0 0 14px; padding: 0; display: flex; flex-direction: column; gap: 10px; }
  .dm-item {
    display: flex; align-items: flex-start; gap: 10px;
    padding: 12px 14px;
    background: var(--crm-gray-100);
    border: 1px solid var(--crm-gray-200);
    border-radius: 10px;
    transition: background 120ms ease, border-color 120ms ease;
  }
  .dm-item:hover { background: var(--crm-gray-150); border-color: var(--crm-gray-300); }
  .dm-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
  .dm-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .dm-name { font: 600 14px/1.3 var(--crm-font-ui); color: var(--crm-gray-900); }
  .dm-title { font: 500 13px/1.3 var(--crm-font-ui); color: var(--crm-gray-500); }
  .dm-contact { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font: 500 12.5px/1.4 var(--crm-font-ui); color: var(--crm-gray-600); }
  .dm-link { color: var(--crm-brand-deep); text-decoration: none; }
  .dm-link:hover { text-decoration: underline; text-underline-offset: 2px; }
  .dm-actions { display: flex; gap: 4px; flex-shrink: 0; }
  .dm-btn {
    padding: 6px 10px;
    min-width: 32px; min-height: 32px;
    font: 700 14px/1 var(--crm-font-ui);
  }
  .dm-btn--danger:hover { color: var(--crm-danger); border-color: var(--crm-danger); background: rgba(220,38,38,.06); }

  .dm-add {
    display: flex; flex-direction: column; gap: 10px;
    padding: 14px;
    background: var(--crm-gray-50);
    border: 1px dashed var(--crm-gray-300);
    border-radius: 10px;
  }
  .dm-add-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  @media (max-width: 560px) { .dm-add-grid { grid-template-columns: 1fr; } }
  .dm-add-grid input, .dm-add-grid select {
    padding: 9px 12px;
    background: var(--crm-gray-0);
    border: 1px solid var(--crm-gray-200);
    border-radius: 8px;
    color: var(--crm-gray-800);
    font: 500 13px/1.4 var(--crm-font-ui);
    outline: none;
    transition: border-color 120ms, box-shadow 120ms;
  }
  .dm-add-grid input:focus, .dm-add-grid select:focus {
    border-color: var(--crm-brand);
    box-shadow: var(--crm-focus-ring);
  }
  .dot { color: var(--crm-gray-300); }

  /* ─── High-end glassmorphism polish (Workstream W follow-up) ─────────────── */

  /* Tab pills — glass-btn with active = filled cyan */
  .tabs--glass {
    gap: 6px;
    padding: 12px 24px 14px;
    border-bottom: 1px solid var(--crm-gray-200, #E1E5EB);
    background: var(--crm-gray-0, #FFFFFF);
  }
  .tab-pill {
    /* override the glass-btn defaults inside the white Sheet surface */
    background: var(--crm-gray-50, #FAFBFC);
    border-color: var(--crm-gray-200, #E1E5EB);
    color: var(--crm-gray-600, #4E5968);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 600;
  }
  .tab-pill:hover {
    background: rgba(86,188,236,0.10);
    border-color: rgba(86,188,236,0.40);
    color: var(--crm-brand-deep, #1F7AAB);
    box-shadow: 0 0 0 1px rgba(86,188,236,0.40), 0 4px 14px rgba(86,188,236,0.10);
  }
  .tab-pill--active {
    background: #56bcec;
    border-color: #56bcec;
    color: #fff;
    box-shadow: 0 2px 12px rgba(86,188,236,0.30);
  }
  .tab-pill--active:hover {
    background: #3bafd8;
    border-color: #3bafd8;
    color: #fff;
    box-shadow: 0 4px 18px rgba(86,188,236,0.36);
  }

  /* Lane-expand override — keep accent-aligned hover but use glass-btn base */
  .lane-expand {
    width: 100%;
    background: transparent;
    border: 1px dashed var(--lane-accent, var(--brand-line));
    color: var(--lane-accent, var(--ink-2));
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .lane-expand:hover {
    background: color-mix(in oklab, var(--lane-accent) 10%, transparent);
    border-color: var(--lane-accent);
    color: var(--lane-accent);
    box-shadow: 0 0 0 1px var(--lane-accent), 0 4px 14px var(--lane-glow);
  }

  /* Glass stat cards in the sheet header — high-end, cyan accent for MRR */
  .glass-stat-card {
    display: flex; flex-direction: column; gap: 4px;
    padding: 10px 12px;
    background: var(--glass-chrome, var(--crm-gray-50, #FAFBFC));
    -webkit-backdrop-filter: var(--blur-chrome, blur(20px));
    backdrop-filter: var(--blur-chrome, blur(20px));
    border: 1px solid var(--crm-gray-200, #E1E5EB);
    border-radius: 10px;
    min-width: 0;
    transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
  }
  .glass-stat-card:hover {
    border-color: rgba(86,188,236,0.40);
    box-shadow: 0 4px 16px rgba(86,188,236,0.10);
    transform: translateY(-1px);
  }
  .glass-stat-card__label {
    font: 700 10px/1.2 var(--crm-font-ui, 'Inter', sans-serif);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--crm-gray-500, #6B7689);
  }
  .glass-stat-card__value {
    font: 700 18px/1.15 var(--crm-font-display, 'Space Grotesk', sans-serif);
    color: var(--crm-gray-900, #0E1119);
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.01em;
    word-break: break-word;
    min-width: 0;
  }
  .glass-stat-card__value--sm { font-size: 13px; font-weight: 600; }
  .glass-stat-card__cap {
    font: 600 10px/1 var(--crm-font-ui);
    color: var(--crm-gray-400, #94A0B0);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .glass-stat-card--mrr {
    border-left: 3px solid #56bcec;
    background: linear-gradient(180deg, rgba(86,188,236,0.06) 0%, var(--crm-gray-50, #FAFBFC) 100%);
  }
  .glass-stat-card--mrr .glass-stat-card__value { color: #1F7AAB; }

  /* Prospect score ring — conic-gradient arc, cool->warm->hot */
  .panel--glass {
    background: var(--glass-chrome, var(--crm-gray-0, #FFFFFF));
    -webkit-backdrop-filter: var(--blur-chrome, blur(20px));
    backdrop-filter: var(--blur-chrome, blur(20px));
    border: 1px solid var(--crm-gray-200, #E1E5EB);
  }
  .score-ring-row {
    display: grid;
    grid-template-columns: 96px 1fr;
    gap: 16px;
    align-items: center;
  }
  .score-ring {
    --ring-color: #56bcec;
    --ring-bg: var(--crm-gray-200, #E1E5EB);
    width: 96px; height: 96px;
    border-radius: 50%;
    background: conic-gradient(
      var(--ring-color) 0% var(--score-pct, 0%),
      var(--ring-bg) var(--score-pct, 0%) 100%
    );
    display: grid; place-items: center;
    position: relative;
    box-shadow: 0 6px 18px rgba(86,188,236,0.18), 0 0 0 1px rgba(86,188,236,0.18);
    transition: box-shadow 200ms ease;
  }
  .score-ring[data-heat="cold"] {
    --ring-color: #64748b;
    box-shadow: 0 4px 14px rgba(100,116,139,0.18), 0 0 0 1px rgba(100,116,139,0.18);
  }
  .score-ring[data-heat="warm"] {
    --ring-color: #f59e0b;
    box-shadow: 0 4px 14px rgba(245,158,11,0.22), 0 0 0 1px rgba(245,158,11,0.22);
  }
  .score-ring[data-heat="hot"] {
    --ring-color: #ef4444;
    box-shadow: 0 6px 22px rgba(239,68,68,0.28), 0 0 0 1px rgba(239,68,68,0.28);
  }
  .score-ring-inner {
    width: 72px; height: 72px; border-radius: 50%;
    background: var(--crm-gray-0, #FFFFFF);
    display: grid; place-items: center;
    grid-template-rows: auto auto;
    line-height: 1;
  }
  .score-ring-val {
    font: 700 28px/1 var(--crm-font-display, 'Space Grotesk', sans-serif);
    color: var(--crm-gray-900, #0E1119);
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
    margin-bottom: 2px;
  }
  .score-ring-cap {
    font: 600 10px/1 var(--crm-font-ui);
    color: var(--crm-gray-400, #94A0B0);
    letter-spacing: 0.04em;
  }
  .score-controls { display: flex; flex-direction: column; gap: 6px; min-width: 0; }

  @media (prefers-reduced-motion: reduce) {
    .score-ring, .glass-stat-card, .tab-pill { transition: none; }
  }
  @media (max-width: 480px) {
    .score-ring-row { grid-template-columns: 1fr; }
    .score-ring { margin: 0 auto; }
  }
</style>

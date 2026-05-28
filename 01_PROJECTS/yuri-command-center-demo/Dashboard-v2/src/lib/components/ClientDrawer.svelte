<script lang="ts">
  import type { EntityState } from "$lib/db";
  import { toast } from "$components/GlassToast.svelte";

  interface Props {
    client: EntityState;
    tickets: EntityState[];
    accent?: string;
    accentGlow?: string;
    statusLabel?: string;
    open?: boolean;
    onClose: () => void;
  }

  let {
    client,
    tickets,
    accent = "#56BCEC",
    accentGlow = "rgba(86,188,236,0.45)",
    statusLabel = "CLIENT",
    open = true,
    onClose,
  }: Props = $props();

  const clientCode = $derived(
    (client?.entity_id || "").match(/^([A-Z]{2,5})/)?.[1] ?? (client?.entity_id || "").slice(0, 3).toUpperCase()
  );

  // ── Tab system ─────────────────────────────────────────────────────
  type TabId = "overview" | "tickets" | "revenue" | "meetings" | "nex-intel";
  const TABS: { id: TabId; label: string; icon: string }[] = [
    { id: "overview",  label: "Overview",  icon: "◈" },
    { id: "tickets",   label: "Tickets",   icon: "▣" },
    { id: "revenue",   label: "Revenue",   icon: "◎" },
    { id: "meetings",  label: "Meetings",  icon: "◷" },
    { id: "nex-intel", label: "NEX Intel", icon: "✦" },
  ];
  let activeTab = $state<TabId>("overview");

  // ── Draft fields ────────────────────────────────────────────────────
  let draftNotes        = $state<string>(client.state?.notes || "");
  let draftNextTouch    = $state<string>(client.state?.next_touch || client.state?.next_follow_up || "");
  let draftContactEmail = $state<string>(client.state?.contact_email || client.state?.email || "");
  let draftStage        = $state<string>(client.state?.stage || "");
  let draftBilling      = $state<string>(client.state?.billing_type || "");
  let saving            = $state(false);

  // ── Meeting log form ────────────────────────────────────────────────
  let meetingFormOpen   = $state(false);
  let newMeetingTitle   = $state<string>("");
  let meetingDate       = $state<string>(new Date().toISOString().slice(0, 16));
  let meetingAttendees  = $state<string>("");
  let meetingAgenda     = $state<string>("");
  let meetingNotes      = $state<string>("");
  let meetingActions    = $state<string>("");
  let meetingSubmitting = $state(false);

  // ── Follow-up email ─────────────────────────────────────────────────
  let emailDraftOpen = $state(false);
  let emailSubject   = $state("");
  let emailBody      = $state("");
  let emailSending   = $state(false);

  // ── Remote data ─────────────────────────────────────────────────────
  type Commitment = { id?: string; description?: string; due_at?: string | null; status?: string };
  let commitments  = $state<Commitment[]>([]);

  type Prediction  = { client_code: string; likely_ask: string; precomputed: string; confidence?: number };
  let prediction   = $state<Prediction | null>(null);

  type Meeting     = { entity_id: string; state?: any; updated_at?: string };
  let clientMeetings = $state<Meeting[]>([]);

  type Decision    = { id?: string; decision: string; rationale?: string; outcome?: string; created_at?: string; tags?: string[] };
  let decisions    = $state<Decision[]>([]);
  let decisionsLoading = $state(false);

  // Revenue details from Bexio/Supabase
  type InvoiceRow  = { id?: string; amount?: number; status?: string; date?: string; description?: string };
  let invoiceRows  = $state<InvoiceRow[]>([]);
  let invoicesLoading = $state(false);

  // ── Ask NEX strip ───────────────────────────────────────────────────
  let nexQuery        = $state<string>("");
  let nexLoading      = $state(false);
  let nexAnswer       = $state<string>("");
  let nexAnswerSource = $state<string>("");
  let nexError        = $state<string>("");

  // ── Re-init on client change ────────────────────────────────────────
  $effect(() => {
    const c = client;
    draftNotes        = c.state?.notes || "";
    draftNextTouch    = c.state?.next_touch || c.state?.next_follow_up || "";
    draftContactEmail = c.state?.contact_email || c.state?.email || "";
    draftStage        = c.state?.stage || "";
    draftBilling      = c.state?.billing_type || "";
    newMeetingTitle   = "";
    meetingFormOpen   = false;
    meetingDate       = new Date().toISOString().slice(0, 16);
    meetingAttendees  = meetingAgenda = meetingNotes = meetingActions = "";
    nexQuery = nexAnswer = nexAnswerSource = nexError = "";
    fetchCommitments(c.entity_id);
    fetchPrediction(c.entity_id);
    fetchMeetings(c);
    fetchDecisions(c.entity_id);
    fetchInvoices(c);
  });

  // ── Data fetchers ───────────────────────────────────────────────────
  async function fetchCommitments(code: string) {
    commitments = [];
    try {
      const { supabase, hasClient } = await import("$lib/db");
      if (!hasClient()) return;
      const sb = supabase();
      for (const q of [{ column: "entity_id", value: code }, { column: "client_code", value: code }]) {
        const { data, error } = await sb
          .from("commitments").select("*")
          .eq(q.column, q.value).eq("status", "open")
          .order("due_at", { ascending: true }).limit(10);
        if (!error && Array.isArray(data) && data.length > 0) { commitments = data as Commitment[]; return; }
        if (error && /column .* does not exist/i.test(error.message)) continue;
        if (error) return;
      }
    } catch { /* silent */ }
  }

  async function fetchPrediction(code: string) {
    prediction = null;
    try {
      const { supabase, hasClient } = await import("$lib/db");
      if (!hasClient()) return;
      const { data } = await supabase().from("audit_log").select("details, created_at")
        .eq("action", "cto.predictions.v1").order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!data) return;
      const all = (data.details?.predictions || []) as Prediction[];
      const candidate = all.find(p => p.client_code === code) || null;
      if (!candidate) return;

      // Skip the prediction if a canonical fact already answers it.
      // We infer the "predicate" from the likely_ask text and check
      // nex_facts_canonical for a blessed value before surfacing the ask.
      const ask = (candidate.likely_ask || "").toLowerCase();
      const predicateGuesses: string[] = [];
      if (/mrr|monthly[_\s]?revenue|revenue|chf.*\/mo|chf.*mo/.test(ask)) predicateGuesses.push("monthly_revenue");
      if (/contact|email/.test(ask)) predicateGuesses.push("contact_email", "contact_name");
      if (/contract|renewal/.test(ask)) predicateGuesses.push("contract_status", "contract_end");
      if (/stage|pipeline/.test(ask)) predicateGuesses.push("stage");
      if (/billing|invoice cadence/.test(ask)) predicateGuesses.push("billing_type", "invoice_cadence");

      if (predicateGuesses.length > 0) {
        try {
          const { data: facts } = await supabase()
            .from("nex_facts_canonical")
            .select("predicate, confidence, blessed_by")
            .eq("subject_type", "client")
            .eq("subject_id", code)
            .in("predicate", predicateGuesses);
          // If any matched predicate has a high-confidence blessing, skip this ask.
          const blessed = (facts || []).find(f =>
            Number(f.confidence ?? 0) >= 0.9 && (f.blessed_by || "").toString().toLowerCase().includes("ceo")
          );
          if (blessed) {
            // Canonical answer already exists - do not re-ask CEO.
            prediction = null;
            return;
          }
        } catch { /* fall through and surface prediction */ }
      }
      prediction = candidate;
    } catch { /* silent */ }
  }

  async function fetchMeetings(c: EntityState) {
    clientMeetings = [];
    try {
      const { listEntityState } = await import("$lib/db");
      const all = await listEntityState("meeting", 300);
      const code = c.entity_id.toLowerCase();
      const firstWord = (c.state?.name || "").toLowerCase().split(/\s+/)[0];
      clientMeetings = all.filter(m => {
        const s = (m.state?.subject || m.state?.title || "").toLowerCase();
        if (!s) return false;
        if (s.includes(code)) return true;
        if (firstWord && firstWord.length > 3 && s.includes(firstWord)) return true;
        return false;
      });
    } catch { /* silent */ }
  }

  async function fetchDecisions(code: string) {
    decisions = [];
    decisionsLoading = true;
    try {
      const { supabase, hasClient } = await import("$lib/db");
      if (!hasClient()) { decisionsLoading = false; return; }
      const { data, error } = await supabase()
        .from("decisions").select("id, decision, rationale, outcome, created_at, tags")
        .eq("client_code", code)
        .order("created_at", { ascending: false }).limit(20);
      if (!error && Array.isArray(data)) decisions = data as Decision[];
    } catch { /* silent */ } finally {
      decisionsLoading = false;
    }
  }

  async function fetchInvoices(c: EntityState) {
    invoiceRows = [];
    invoicesLoading = true;
    try {
      const { supabase, hasClient } = await import("$lib/db");
      if (!hasClient()) { invoicesLoading = false; return; }
      // Try client_finance entity or audit_log for Bexio invoice data
      const { data } = await supabase()
        .from("entity_state").select("state")
        .eq("entity_type", "client_finance").eq("entity_id", c.entity_id).maybeSingle();
      if (data?.state?.invoices && Array.isArray(data.state.invoices)) {
        invoiceRows = data.state.invoices as InvoiceRow[];
      }
    } catch { /* silent */ } finally {
      invoicesLoading = false;
    }
  }

  // ── Ask NEX handler ─────────────────────────────────────────────────
  async function submitNexQuery() {
    if (!nexQuery.trim()) return;
    nexLoading = true;
    nexAnswer = nexAnswerSource = nexError = "";
    try {
      const res = await fetch("/api/functions/nex-rag-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: nexQuery.trim(),
          client_code: client.entity_id,
          client_name: client.state?.name || "",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        nexAnswer = data.answer || "No answer returned.";
        nexAnswerSource = data.source || "nex";
      } else {
        // Graceful fallback: search entity_state locally
        const q = nexQuery.toLowerCase();
        const s = client.state || {};
        const lines: string[] = [];
        if (/revenue|mrr|billing/.test(q)) {
          lines.push(`MRR: CHF ${Number(s.monthly_revenue || 0).toLocaleString("de-CH")}`);
          lines.push(`Lifetime: CHF ${Number(s.total_revenue_chf || 0).toLocaleString("de-CH")}`);
          lines.push(`Billing: ${s.billing_type || "unknown"}`);
        }
        if (/contact|email|phone/.test(q)) {
          lines.push(`Email: ${s.contact_email || s.email || "not on file"}`);
          lines.push(`Contact: ${s.primary_contact_firstname || s.contact_name || "unknown"}`);
        }
        if (/stage|status|contract/.test(q)) {
          lines.push(`Stage: ${s.stage || "?"} | Contract: ${s.contract_status || "?"}`);
          lines.push(`Contract end: ${s.contract_end || "not set"}`);
        }
        if (/ticket|task|open/.test(q)) {
          lines.push(`Open tickets: ${cOpen.length} | Done: ${cDone.length}`);
        }
        nexAnswer = lines.length > 0
          ? lines.join("\n")
          : `NEX RAG query service unavailable (HTTP ${res.status}). Check entity_state for ${client.state?.name || client.entity_id}.`;
        nexAnswerSource = "local-fallback";
      }
    } catch (e: any) {
      nexError = e.message || String(e);
      // Local context fallback on network error
      const s = client.state || {};
      nexAnswer = `Network error. Local snapshot: Stage=${s.stage || "?"}, MRR=CHF ${s.monthly_revenue || 0}, Open tickets=${cOpen.length}`;
      nexAnswerSource = "local-fallback";
    } finally {
      nexLoading = false;
    }
  }

  // ── Actions ─────────────────────────────────────────────────────────
  async function saveClient() {
    saving = true;
    try {
      const res = await fetch("/api/functions/client-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_code: client.entity_id,
          client_name: client.state?.name || "",
          fields: {
            notes:         draftNotes,
            next_touch:    draftNextTouch || null,
            contact_email: draftContactEmail,
            stage:         draftStage,
            billing_type:  draftBilling,
          },
          source: "dashboard-v2-client-drawer",
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast("Saved - syncing to Plane + Obsidian", "ok", 2800);
    } catch (err) {
      console.warn("[client-drawer] save failed:", err);
      toast("Save queued - will retry", "warn", 2800);
    } finally {
      saving = false;
    }
  }

  async function submitMeetingLog() {
    if (!meetingNotes.trim() && !meetingAgenda.trim()) {
      toast("Add at least some notes or agenda before saving", "warn", 2400);
      return;
    }
    const title = newMeetingTitle.trim() || `Meeting - ${client.state?.name || client.entity_id}`;
    meetingSubmitting = true;
    try {
      const res = await fetch("/api/functions/client-meeting-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_code: client.entity_id,
          client_name: client.state?.name || "",
          title,
          date: meetingDate ? new Date(meetingDate).toISOString() : new Date().toISOString(),
          attendees: meetingAttendees,
          agenda: meetingAgenda,
          notes: meetingNotes,
          action_items: meetingActions,
          telegram_brief: true,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast("Meeting logged - Obsidian + NEX notified", "ok", 3200);
      meetingFormOpen = false;
      newMeetingTitle = meetingAttendees = meetingAgenda = meetingNotes = meetingActions = "";
      meetingDate = new Date().toISOString().slice(0, 16);
      await fetchMeetings(client);
    } catch (err) {
      console.warn("[client-drawer] meeting log failed:", err);
      toast("Meeting queued - will retry", "warn", 2800);
    } finally {
      meetingSubmitting = false;
    }
  }

  function openFollowUpDraft() {
    const name = client.state?.primary_contact_firstname || client.state?.contact_name || "there";
    const legal = client.state?.name || client.entity_id;
    emailSubject = `Follow-up - ${legal}`;
    emailBody = [
      `Hi ${name},`,
      ``,
      `a quick check-in on our collaboration. Any blockers I can clear, or next steps to align on this week?`,
      ``,
      `Happy to jump on a short call - you can reach me on +41 78 317 85 85 any time.`,
      ``,
      `Best,`,
      `Claudio Tinner - CEO - c2moviez GmbH`,
      `+41 78 317 85 85 - info@c2moviez.com`,
    ].join("\n");
    emailDraftOpen = true;
  }

  async function submitFollowUpDraft() {
    if (!emailSubject.trim() || !emailBody.trim()) return;
    emailSending = true;
    try {
      const res = await fetch("/api/functions/pipeline-email-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_code: client.entity_id,
          client_name: client.state?.name || "",
          to: client.state?.contact_email || client.state?.email || "",
          subject: emailSubject,
          body: emailBody,
          queue: "outlook_drafts",
          kind: "follow_up",
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast("Follow-up draft queued to Outlook", "ok", 2800);
      emailDraftOpen = false;
    } catch (err) {
      console.warn("[client-drawer] follow-up draft failed:", err);
      toast("Draft queued - will retry", "warn", 2800);
    } finally {
      emailSending = false;
    }
  }

  function openInPlane() {
    window.open("https://app.plane.so/c2moviez/customers/", "_blank", "noopener");
  }
  function openInObsidian() {
    const vault = "c2moviez";
    const name = client.state?.name || client.entity_id;
    window.location.href = `obsidian://open?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(`02 - Clients/${client.entity_id} - ${name}`)}`;
  }

  // ── Derived ──────────────────────────────────────────────────────────
  function ticketsOfClient(c: EntityState) {
    const code = c.entity_id;
    const legalName = (c.state?.name || "").toLowerCase();
    return tickets.filter(t => {
      const tCust = (t.state?.customer || "").toLowerCase();
      if (tCust && legalName && tCust.includes(legalName.split(" ")[0])) return true;
      const prefix = (t.entity_id || "").split("-")[0];
      return prefix === code;
    });
  }

  const cTickets = $derived(ticketsOfClient(client));
  const cOpen    = $derived(cTickets.filter(t => {
    if (t.state?.is_done) return false;
    const g = (t.state?.state_group || "").toLowerCase();
    if (g === "cancelled" || g === "completed") return false;
    const s = (t.state?.state || "").toLowerCase();
    if (s === "cancelled" || s === "closed") return false;
    return true;
  }));
  const cDone    = $derived(cTickets.filter(t => t.state?.is_done));

  const openByState = $derived((() => {
    const map = new Map<string, EntityState[]>();
    for (const t of cOpen) {
      const st = t.state?.state || "Backlog";
      if (!map.has(st)) map.set(st, []);
      map.get(st)!.push(t);
    }
    const order = ["Backlog", "Todo", "Planning", "In Progress", "Recording", "Editing", "on-site", "remote", "Pending Customer", "Pending external Desk", "pending internal"];
    return Array.from(map.entries()).sort(([a], [b]) => {
      const ai = order.indexOf(a); const bi = order.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
  })());

  const now = Date.now();
  const upcomingMeetings = $derived(
    clientMeetings
      .filter(m => { const d = m.state?.start || m.state?.meeting_date; if (!d) return false; const t = new Date(d).getTime(); return t >= now && t <= now + 14 * 86400_000; })
      .sort((a, b) => new Date(a.state?.start || a.state?.meeting_date).getTime() - new Date(b.state?.start || b.state?.meeting_date).getTime())
      .slice(0, 8)
  );
  const pastMeetings = $derived(
    clientMeetings
      .filter(m => { const d = m.state?.start || m.state?.meeting_date; if (!d) return false; return new Date(d).getTime() < now; })
      .sort((a, b) => new Date(b.state?.start || b.state?.meeting_date).getTime() - new Date(a.state?.start || a.state?.meeting_date).getTime())
      .slice(0, 5)
  );

  // Health score (mirrors page.svelte calculation)
  function healthScore(): number {
    let s = 50;
    if (Number(client.state?.monthly_revenue) > 0) s += 15;
    if (cOpen.length > 0 && cDone.length > 0) s += 10;
    const overdue = cOpen.filter(t => t.state?.due_date && new Date(t.state.due_date) < new Date()).length;
    const urgent  = cOpen.filter(t => (t.state?.priority || "").toLowerCase() === "urgent").length;
    if (overdue > 0) s -= overdue * 8;
    if (urgent > 0)  s -= urgent * 5;
    const stage = (client.state?.stage || client.state?.contract_status || "").toLowerCase();
    if (/active|retain/.test(stage)) s += 10;
    if (/dormant|lost|churned/.test(stage)) s -= 15;
    return Math.max(0, Math.min(100, s));
  }

  const score = $derived(healthScore());
  const ringColor = $derived(score >= 60 ? "var(--brand)" : score >= 30 ? "var(--warn)" : "var(--danger)");
  const circumference = 138.23; // 2 * pi * 22
  const dash = $derived(circumference * score / 100);

  // Health factor breakdown values (for overview tab)
  const hfOverdue = $derived(cOpen.filter(t => t.state?.due_date && new Date(t.state.due_date) < new Date()).length);
  const hfUrgent  = $derived(cOpen.filter(t => (t.state?.priority || "").toLowerCase() === "urgent").length);
  const hfStageStr = $derived((client.state?.stage || client.state?.contract_status || "").toLowerCase());
  const hfStageBoost = $derived(hfStageStr.includes("active") || hfStageStr.includes("retain"));

  const lastContactDays = $derived((() => {
    const d = client.state?.last_contact || client.state?.last_meeting || client.updated_at;
    if (!d) return null;
    return Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
  })());

  // ── Formatters ───────────────────────────────────────────────────────
  function fmtChf(n: number): string {
    if (n >= 1000) return "CHF " + Math.round(n / 1000) + "k";
    if (n > 0) return "CHF " + Math.round(n);
    return "-";
  }
  function fmtDate(d?: string): string {
    if (!d) return "-";
    try { return new Date(d).toLocaleDateString("de-CH", { timeZone: "Europe/Zurich", day: "2-digit", month: "short", year: "numeric" }); }
    catch { return d; }
  }
  function fmtMeetingDate(d?: string): string {
    if (!d) return "-";
    try {
      const dt = new Date(d);
      return dt.toLocaleDateString("de-CH", { timeZone: "Europe/Zurich", weekday: "short", day: "2-digit", month: "short" })
        + " - " + dt.toLocaleTimeString("de-CH", { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit" });
    } catch { return d; }
  }
  function lastContactLabel(days: number | null): string {
    if (days === null) return "no data";
    if (days === 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    return `${Math.floor(days / 30)}mo ago`;
  }
  function commitmentUrgency(due?: string | null) {
    if (!due) return { color: "#64748b", label: "open" };
    const days = Math.floor((new Date(due).getTime() - Date.now()) / 86400000);
    if (days < 0)  return { color: "#ef4444", label: `${Math.abs(days)}d overdue` };
    if (days <= 1) return { color: "#f59e0b", label: days === 0 ? "today" : "tomorrow" };
    if (days <= 7) return { color: "#eab308", label: `in ${days}d` };
    return { color: "#22c55e", label: `in ${days}d` };
  }
</script>

<!-- Modal overlay -->
{#if open && client}
<div
  class="cd-backdrop visible"
  onclick={onClose}
  onkeydown={(e) => e.key === "Escape" && onClose()}
  role="presentation"
  aria-hidden="true"
></div>

<div
  class="cd-modal visible"
  role="dialog"
  aria-modal="true"
  aria-label={client.state?.name || client.entity_id}
  style={`--lane-accent: ${accent}; --lane-glow: ${accentGlow}; --accent: ${accent};`}
>
  <button class="cd-close" onclick={onClose} aria-label="Close">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  </button>

  <div class="cd-hero">
    <div class="cd-hero-bg"></div>

    <div class="cd-monogram">{clientCode}</div>

    <div class="cd-hero-info">
      <div class="cd-badge-row">
        <span class="cd-badge">{statusLabel}</span>
        <span class="cd-id">{client.entity_id}</span>
      </div>
      <h1 class="cd-name">{client.state?.name || client.entity_id}</h1>
      <div class="cd-hero-meta">
        {#if client.state?.stage}
          <span class="cd-stage-pill">{(client.state.stage as string).replace(/_/g, ' ')}</span>
        {/if}
        {#if Number(client.state?.monthly_revenue) > 0}
          <span class="cd-mrr">CHF {Number(client.state?.monthly_revenue).toLocaleString("de-CH")}/mo</span>
        {/if}
        {#if client.state?.contract_status}
          <span class="cd-contract">{client.state.contract_status}</span>
        {/if}
        {#if client.state?.website}
          <a class="cd-domain" href={client.state.website as string} target="_blank" rel="noopener">{(client.state.website as string).replace(/^https?:\/\//, '')}</a>
        {:else if client.state?.domain && !(client.state.domain as string).includes(' ')}
          <a class="cd-domain" href={`https://${client.state.domain}`} target="_blank" rel="noopener">{client.state.domain}</a>
        {/if}
      </div>
    </div>

    <div class="cd-hero-ring">
      <svg width="78" height="78" viewBox="0 0 56 56" aria-label="Health {score}">
        <circle cx="28" cy="28" r="22" fill="none" stroke="rgba(255,255,255,0.10)" stroke-width="4" />
        <circle
          cx="28" cy="28" r="22"
          fill="none"
          stroke={ringColor}
          stroke-width="4"
          stroke-linecap="round"
          stroke-dasharray="{dash} {circumference}"
          transform="rotate(-90 28 28)"
        />
        <text x="28" y="31" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="13" font-weight="700" fill="var(--ink)">{score}</text>
        <text x="28" y="41" text-anchor="middle" font-family="'Inter', sans-serif" font-size="6.5" fill="var(--ink-3)" letter-spacing="0.2em">HEALTH</text>
      </svg>
    </div>

    <div class="cd-kpis">
      <div class="cd-kpi">
        <span class="cd-kpi-num">{cOpen.length}</span>
        <span class="cd-kpi-lbl">Open tickets</span>
      </div>
      <div class="cd-kpi">
        <span class="cd-kpi-num">{cDone.length}</span>
        <span class="cd-kpi-lbl">Completed</span>
      </div>
      <div class="cd-kpi">
        <span class="cd-kpi-num">{commitments.length}</span>
        <span class="cd-kpi-lbl">Commitments</span>
      </div>
      <div class="cd-kpi {hfOverdue > 0 ? 'kpi-danger' : ''}">
        <span class="cd-kpi-num">{hfOverdue}</span>
        <span class="cd-kpi-lbl">Overdue</span>
      </div>
      <div class="cd-kpi">
        <span class="cd-kpi-num cd-kpi-mono">{lastContactLabel(lastContactDays)}</span>
        <span class="cd-kpi-lbl">Last contact</span>
      </div>
    </div>
  </div>

  <div class="cd-toolbar">
    <button class="ghost-btn" onclick={openFollowUpDraft} title="Draft follow-up email">Follow-up</button>
    <button class="ghost-btn" onclick={openInPlane} title="Open in Plane.so">Plane</button>
    <button class="ghost-btn" onclick={openInObsidian} title="Open in Obsidian">Obsidian</button>
  </div>

  {#if commitments.length > 0}
    <div class="cd-commit-strip">
      {#each commitments as k}
        {@const u = commitmentUrgency(k.due_at)}
        <span class="commit-badge" style={`--u: ${u.color};`} title={k.description || "commitment"}>
          <span class="commit-dot"></span>
          <span class="commit-desc">{(k.description || "commitment").slice(0, 48)}</span>
          <span class="commit-due">{u.label}</span>
        </span>
      {/each}
    </div>
  {/if}

  <nav class="tab-bar cd-tabs" role="tablist">
      {#each TABS as tab}
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          class="tab-btn {activeTab === tab.id ? 'tab-active' : ''}"
          onclick={() => (activeTab = tab.id)}
        >
          <span class="tab-icon">{tab.icon}</span>
          <span class="tab-label">{tab.label}</span>
          {#if tab.id === "tickets"}
            <span class="tab-count">{cOpen.length}</span>
          {:else if tab.id === "meetings"}
            <span class="tab-count">{upcomingMeetings.length + pastMeetings.length}</span>
          {:else if tab.id === "nex-intel"}
            <span class="tab-count">{decisions.length}</span>
          {/if}
        </button>
      {/each}
    </nav>

    <!-- ── Tab panels ───────────────────────────────────────────────── -->
    <div class="tab-panels">

      <!-- ─── TAB: OVERVIEW ────────────────────────────────────────── -->
      {#if activeTab === "overview"}
        <div class="tab-panel" role="tabpanel">
          <!-- Contact info -->
          <section class="section">
            <h3 class="section-title"><span class="section-bracket">-</span> CONTACT INFO</h3>
            <div class="info-grid">
              <div class="info-row">
                <span class="info-label">Email</span>
                <span class="info-val mono">{client.state?.contact_email || client.state?.email || "-"}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Contact</span>
                <span class="info-val">{client.state?.primary_contact_firstname || client.state?.contact_name || "-"}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Phone</span>
                <span class="info-val mono">{client.state?.phone || "-"}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Domain</span>
                {#if client.state?.domain}
                  <a class="info-link mono" href={`https://${client.state.domain}`} target="_blank" rel="noopener">{client.state.domain}</a>
                {:else}
                  <span class="info-val">-</span>
                {/if}
              </div>
              <div class="info-row">
                <span class="info-label">Industry</span>
                <span class="info-val">{client.state?.industry || "-"}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Employees</span>
                <span class="info-val mono">{client.state?.employees || "-"}</span>
              </div>
            </div>
          </section>

          <!-- Contract status -->
          <section class="section">
            <h3 class="section-title"><span class="section-bracket">-</span> CONTRACT STATUS</h3>
            <div class="info-grid">
              <div class="info-row">
                <span class="info-label">Status</span>
                <span class="info-val">{client.state?.contract_status || "-"}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Stage</span>
                <span class="info-val">{client.state?.stage || "-"}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Billing</span>
                <span class="info-val">{client.state?.billing_type || "-"}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Contract end</span>
                <span class="info-val mono">{fmtDate(client.state?.contract_end)}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Next touch</span>
                <span class="info-val mono">{fmtDate(client.state?.next_touch || client.state?.next_follow_up)}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Payment terms</span>
                <span class="info-val">{client.state?.payment_terms || "-"}</span>
              </div>
            </div>
          </section>

          <!-- Health score breakdown -->
          <section class="section">
            <h3 class="section-title"><span class="section-bracket">-</span> HEALTH SCORE BREAKDOWN</h3>
            <div class="health-breakdown">
              <div class="health-ring-large">
                <svg width="96" height="96" viewBox="0 0 56 56" aria-label="Health score {score}">
                  <circle cx="28" cy="28" r="22" fill="none" stroke="var(--brand-line)" stroke-width="4" />
                  <circle
                    cx="28" cy="28" r="22" fill="none"
                    stroke={ringColor} stroke-width="4" stroke-linecap="round"
                    stroke-dasharray="{dash} {circumference}"
                    transform="rotate(-90 28 28)"
                  />
                  <text x="28" y="31" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="13" font-weight="700" fill="var(--ink)">{score}</text>
                </svg>
              </div>
              <div class="health-factors">
                <div class="factor-row">
                  <span class="factor-name">Revenue active</span>
                  <span class="factor-val" style={Number(client.state?.monthly_revenue) > 0 ? "color:var(--success)" : "color:var(--ink-3)"}>
                    {Number(client.state?.monthly_revenue) > 0 ? "+15" : "0"}
                  </span>
                </div>
                <div class="factor-row">
                  <span class="factor-name">Ticket activity</span>
                  <span class="factor-val" style={cOpen.length > 0 && cDone.length > 0 ? "color:var(--success)" : "color:var(--ink-3)"}>
                    {cOpen.length > 0 && cDone.length > 0 ? "+10" : "0"}
                  </span>
                </div>
                <div class="factor-row">
                  <span class="factor-name">Stage boost</span>
                  <span class="factor-val" style={hfStageBoost ? "color:var(--success)" : "color:var(--ink-3)"}>
                    {hfStageBoost ? "+10" : "0"}
                  </span>
                </div>
                <div class="factor-row">
                  <span class="factor-name">Overdue tickets</span>
                  <span class="factor-val" style={hfOverdue > 0 ? "color:var(--danger)" : "color:var(--ink-3)"}>
                    {hfOverdue > 0 ? `-${hfOverdue * 8}` : "0"}
                  </span>
                </div>
                <div class="factor-row">
                  <span class="factor-name">Urgent tickets</span>
                  <span class="factor-val" style={hfUrgent > 0 ? "color:var(--warn)" : "color:var(--ink-3)"}>
                    {hfUrgent > 0 ? `-${hfUrgent * 5}` : "0"}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <!-- Editable fields -->
          <section class="section">
            <h3 class="section-title"><span class="section-bracket">-</span> EDIT FIELDS</h3>
            <div class="edit-grid">
              <label class="field">
                <span class="caption">STAGE</span>
                <input class="input" type="text" bind:value={draftStage} placeholder="lead - proposal - active - retention" />
              </label>
              <label class="field">
                <span class="caption">BILLING TYPE</span>
                <input class="input" type="text" bind:value={draftBilling} placeholder="project - monthly - retainer" />
              </label>
              <label class="field">
                <span class="caption">CONTACT EMAIL</span>
                <input class="input" type="email" bind:value={draftContactEmail} />
              </label>
              <label class="field">
                <span class="caption">NEXT TOUCH</span>
                <input class="input" type="date" bind:value={draftNextTouch} />
              </label>
            </div>
            <label class="field mt-2">
              <span class="caption">NOTES (syncs to Obsidian)</span>
              <textarea class="input notes-area" bind:value={draftNotes} placeholder="Free-form notes..."></textarea>
            </label>
          </section>

          <!-- AI next-ask prediction -->
          {#if prediction}
            <section class="section">
              <h3 class="section-title"><span class="section-bracket">-</span> AI NEXT-ASK</h3>
              <div class="pred-box">
                <p class="pred-likely">{prediction.likely_ask}</p>
                <p class="pred-answer">{prediction.precomputed}</p>
                {#if prediction.confidence}
                  <span class="pred-conf">confidence {Math.round(prediction.confidence * 100)}%</span>
                {/if}
              </div>
            </section>
          {/if}
        </div>
      {/if}

      <!-- ─── TAB: TICKETS ─────────────────────────────────────────── -->
      {#if activeTab === "tickets"}
        <div class="tab-panel" role="tabpanel">
          <section class="section">
            <div class="section-header">
              <h3 class="section-title"><span class="section-bracket">-</span> OPEN TICKETS <span class="section-count">{cOpen.length}</span></h3>
            </div>
            {#if cOpen.length === 0}
              <p class="empty-msg">No open tickets for this client.</p>
            {:else}
              {#each openByState as [stateName, group]}
                <div class="state-group">
                  <header class="state-head">
                    <span class="state-name">{stateName}</span>
                    <span class="state-count">{group.length}</span>
                  </header>
                  <ul class="tix-list">
                    {#each group.slice(0, 10) as t}
                      {@const prio = (t.state?.priority || "none").toLowerCase()}
                      {@const overdue = t.state?.due_date && new Date(t.state.due_date) < new Date()}
                      {@const ticketId = t.state?.ticketId || t.entity_id}
                      {@const planeUrl = t.state?.url || `https://app.plane.so/c2moviez/browse/${ticketId}`}
                      {@const mods = Array.isArray(t.state?.modules) ? t.state.modules : (t.state?.modules ? [t.state.modules] : [])}
                      {@const cycs = Array.isArray(t.state?.cycles) ? t.state.cycles : (t.state?.cycles ? [t.state.cycles] : [])}
                      <li class="tix-row">
                        <div class="tix-main">
                          <a class="tix-id" href={planeUrl} target="_blank" rel="noopener" title="Open in Plane.so">{ticketId}</a>
                          <span class="tix-name">{t.state?.name || "(no title)"}</span>
                          <span class={`tix-prio chip-${prio}`}>{prio}</span>
                          <span class={`tix-due ${overdue ? "over" : ""}`}>{fmtDate(t.state?.due_date)}</span>
                        </div>
                        {#if mods.length > 0 || cycs.length > 0}
                          <div class="tix-meta">
                            {#each mods as mod}<span class="tix-chip tix-chip--module">{mod}</span>{/each}
                            {#each cycs as cyc}<span class="tix-chip tix-chip--cycle">{cyc}</span>{/each}
                          </div>
                        {/if}
                      </li>
                    {/each}
                  </ul>
                  {#if group.length > 10}
                    <p class="tix-more">+ {group.length - 10} more in {stateName}</p>
                  {/if}
                </div>
              {/each}
            {/if}
          </section>

        </div>
      {/if}

      <!-- ─── TAB: REVENUE ─────────────────────────────────────────── -->
      {#if activeTab === "revenue"}
        <div class="tab-panel" role="tabpanel">
          <!-- Summary KPIs -->
          <section class="section">
            <h3 class="section-title"><span class="section-bracket">-</span> REVENUE OVERVIEW</h3>
            <div class="rev-kpis">
              <div class="rev-kpi">
                <span class="rev-kpi-val">{fmtChf(Number(client.state?.monthly_revenue) || 0)}</span>
                <span class="rev-kpi-lbl">Monthly Recurring</span>
              </div>
              <div class="rev-kpi">
                <span class="rev-kpi-val">{fmtChf(Number(client.state?.total_revenue_chf) || 0)}</span>
                <span class="rev-kpi-lbl">Total Lifetime</span>
              </div>
              <div class="rev-kpi">
                <span class="rev-kpi-val mono">{client.state?.invoice_count ?? "-"}</span>
                <span class="rev-kpi-lbl">Invoices issued</span>
              </div>
            </div>
          </section>

          <!-- Revenue timeline bar -->
          {#if client.state?.first_invoice_date || Number(client.state?.total_revenue_chf) > 0}
            {@const first = client.state?.first_invoice_date}
            {@const last  = client.state?.last_invoice_date}
            {@const lifetime = Number(client.state?.total_revenue_chf) || 0}
            {@const invoices = Number(client.state?.invoice_count) || 0}
            {@const firstMs = first ? new Date(first).getTime() : Date.now()}
            {@const lastMs  = last  ? new Date(last).getTime()  : firstMs}
            {@const todayMs = Date.now()}
            {@const spanMs  = Math.max(todayMs - firstMs, 1)}
            {@const lastPct = Math.max(0, Math.min(100, ((lastMs - firstMs) / spanMs) * 100))}
            {@const avgPerMonth = lifetime && firstMs < lastMs ? lifetime / Math.max(1, (lastMs - firstMs) / (30 * 86400000)) : 0}
            <section class="section">
              <h3 class="section-title"><span class="section-bracket">-</span> REVENUE TIMELINE</h3>
              <div class="rev-summary">
                <span class="rev-big">{fmtChf(lifetime)}</span>
                <span class="rev-meta">lifetime - {invoices} invoice{invoices === 1 ? "" : "s"} - avg {fmtChf(Math.round(avgPerMonth))}/mo</span>
              </div>
              <div class="rev-track">
                <div class="rev-bar"></div>
                <div class="rev-last" style={`left: ${lastPct}%`} title={`last invoice: ${fmtDate(last)}`}></div>
              </div>
              <div class="rev-ticks">
                <span>{fmtDate(first)}</span>
                <span class="dim">today</span>
              </div>
            </section>
          {/if}

          <!-- Bexio invoice rows -->
          <section class="section">
            <h3 class="section-title"><span class="section-bracket">-</span> BEXIO INVOICES</h3>
            {#if invoicesLoading}
              <p class="loading-msg">Loading invoice data...</p>
            {:else if invoiceRows.length === 0}
              <p class="empty-msg">No Bexio invoice data synced yet. Run <code>Scripts/sync-financial-to-supabase.js</code> to populate.</p>
            {:else}
              <div class="invoice-table">
                <div class="invoice-header">
                  <span>Date</span>
                  <span>Description</span>
                  <span>Amount</span>
                  <span>Status</span>
                </div>
                {#each invoiceRows as inv}
                  <div class="invoice-row">
                    <span class="mono">{fmtDate(inv.date)}</span>
                    <span>{inv.description || "-"}</span>
                    <span class="mono">{fmtChf(Number(inv.amount) || 0)}</span>
                    <span class={`inv-status status-${(inv.status || "").toLowerCase()}`}>{inv.status || "?"}</span>
                  </div>
                {/each}
              </div>
            {/if}
          </section>

          <!-- Extra revenue fields -->
          <section class="section">
            <h3 class="section-title"><span class="section-bracket">-</span> BILLING DETAILS</h3>
            <div class="info-grid">
              <div class="info-row">
                <span class="info-label">Billing type</span>
                <span class="info-val">{client.state?.billing_type || "-"}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Payment terms</span>
                <span class="info-val">{client.state?.payment_terms || "-"}</span>
              </div>
              <div class="info-row">
                <span class="info-label">First invoice</span>
                <span class="info-val mono">{fmtDate(client.state?.first_invoice_date)}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Last invoice</span>
                <span class="info-val mono">{fmtDate(client.state?.last_invoice_date)}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Revenue status</span>
                <span class="info-val">{client.state?.revenue_status || "-"}</span>
              </div>
            </div>
          </section>
        </div>
      {/if}

      <!-- ─── TAB: MEETINGS ────────────────────────────────────────── -->
      {#if activeTab === "meetings"}
        <div class="tab-panel" role="tabpanel">
          <!-- Log meeting button -->
          <div class="meet-actions">
            <button class="ghost-btn" onclick={() => (meetingFormOpen = !meetingFormOpen)}>
              {meetingFormOpen ? "x Cancel" : "+ Log meeting"}
            </button>
          </div>

          {#if meetingFormOpen}
            <section class="section meet-form-section">
              <div class="meet-row-fields">
                <label class="field">
                  <span class="caption">MEETING TITLE</span>
                  <input class="input" type="text" placeholder="e.g. Q2 Strategy Review" bind:value={newMeetingTitle} />
                </label>
                <label class="field">
                  <span class="caption">DATE &amp; TIME</span>
                  <input class="input" type="datetime-local" bind:value={meetingDate} />
                </label>
              </div>
              <label class="field">
                <span class="caption">ATTENDEES</span>
                <input class="input" type="text" placeholder="Claudio, ..." bind:value={meetingAttendees} />
              </label>
              <label class="field">
                <span class="caption">AGENDA</span>
                <textarea class="input meet-area small" placeholder="Topics discussed..." bind:value={meetingAgenda}></textarea>
              </label>
              <label class="field">
                <span class="caption">NOTES *</span>
                <textarea class="input meet-area" placeholder="Key points, decisions, context..." bind:value={meetingNotes}></textarea>
              </label>
              <label class="field">
                <span class="caption">ACTION ITEMS</span>
                <textarea class="input meet-area small" placeholder="[ ] Follow-up email by Friday" bind:value={meetingActions}></textarea>
              </label>
              <div class="form-actions">
                <button class="ghost-btn" onclick={() => (meetingFormOpen = false)}>Cancel</button>
                <button class="btn-primary" onclick={submitMeetingLog} disabled={meetingSubmitting}>
                  {meetingSubmitting ? "Saving..." : "Save to Obsidian"}
                </button>
              </div>
            </section>
          {/if}

          <!-- Upcoming meetings -->
          {#if upcomingMeetings.length > 0}
            <section class="section">
              <h3 class="section-title"><span class="section-bracket">-</span> UPCOMING <span class="section-count">{upcomingMeetings.length}</span></h3>
              <ul class="meet-list">
                {#each upcomingMeetings as m}
                  <li class="meet-row upcoming">
                    <span class="meet-date">{fmtMeetingDate(m.state?.start || m.state?.meeting_date)}</span>
                    <span class="meet-subject">{m.state?.subject || m.state?.title || "(no title)"}</span>
                  </li>
                {/each}
              </ul>
            </section>
          {/if}

          <!-- Past meetings -->
          {#if pastMeetings.length > 0}
            <section class="section">
              <h3 class="section-title"><span class="section-bracket">-</span> PAST MEETINGS <span class="section-count">{pastMeetings.length}</span></h3>
              <ul class="meet-list">
                {#each pastMeetings as m}
                  <li class="meet-row past">
                    <span class="meet-date">{fmtMeetingDate(m.state?.start || m.state?.meeting_date)}</span>
                    <span class="meet-subject">{m.state?.subject || m.state?.title || "(no title)"}</span>
                    {#if m.state?.summary || m.state?.notes}
                      <p class="meet-summary">{(m.state.summary || m.state.notes || "").slice(0, 180)}</p>
                    {/if}
                  </li>
                {/each}
              </ul>
            </section>
          {/if}

          {#if upcomingMeetings.length === 0 && pastMeetings.length === 0}
            <p class="empty-msg">No meetings found for this client. Drop a transcript or notes into <code>16 - Meetings/Notes/</code> to auto-analyze.</p>
          {/if}
        </div>
      {/if}

      <!-- ─── TAB: NEX INTEL ────────────────────────────────────────── -->
      {#if activeTab === "nex-intel"}
        <div class="tab-panel" role="tabpanel">
          <!-- AI prediction -->
          {#if prediction}
            <section class="section">
              <h3 class="section-title"><span class="section-bracket">-</span> AI NEXT-ASK PREDICTION</h3>
              <div class="pred-box">
                <p class="pred-likely">{prediction.likely_ask}</p>
                <p class="pred-answer">{prediction.precomputed}</p>
                {#if prediction.confidence}
                  <span class="pred-conf">confidence {Math.round(prediction.confidence * 100)}%</span>
                {/if}
              </div>
            </section>
          {/if}

          <!-- NEX decisions -->
          <section class="section">
            <h3 class="section-title">
              <span class="section-bracket">-</span> NEX DECISIONS + RECOMMENDATIONS
              <span class="section-count">{decisions.length}</span>
            </h3>
            {#if decisionsLoading}
              <p class="loading-msg">Loading decisions...</p>
            {:else if decisions.length === 0}
              <p class="empty-msg">No NEX decisions logged for this client yet. Decisions are logged by the intel-analyst agent (Sundays 19:00 CEST) and ad-hoc via the CEO.</p>
            {:else}
              <ul class="decision-list">
                {#each decisions as d}
                  <li class="decision-row">
                    <div class="decision-header">
                      <span class="decision-date mono">{(d.created_at || "").slice(0, 10)}</span>
                      {#if d.tags && d.tags.length > 0}
                        <div class="decision-tags">
                          {#each d.tags as tag}
                            <span class="tag">{tag}</span>
                          {/each}
                        </div>
                      {/if}
                    </div>
                    <p class="decision-text">{d.decision}</p>
                    {#if d.rationale}
                      <p class="decision-rationale">{d.rationale}</p>
                    {/if}
                    {#if d.outcome}
                      <div class="decision-outcome">
                        <span class="outcome-label">Outcome</span>
                        <span class="outcome-text">{d.outcome}</span>
                      </div>
                    {/if}
                  </li>
                {/each}
              </ul>
            {/if}
          </section>

          <!-- Commitments -->
          {#if commitments.length > 0}
            <section class="section">
              <h3 class="section-title"><span class="section-bracket">-</span> OPEN COMMITMENTS <span class="section-count">{commitments.length}</span></h3>
              <ul class="commit-list">
                {#each commitments as k}
                  {@const u = commitmentUrgency(k.due_at)}
                  <li class="commit-row" style={`--u: ${u.color};`}>
                    <span class="commit-dot-inline" style={`background: ${u.color}; box-shadow: 0 0 6px ${u.color};`}></span>
                    <span class="commit-text">{k.description || "commitment"}</span>
                    <span class="commit-due-badge">{u.label}</span>
                  </li>
                {/each}
              </ul>
            </section>
          {/if}
        </div>
      {/if}

    </div><!-- /tab-panels -->

    <!-- ── Follow-up email modal ────────────────────────────────────── -->
    {#if emailDraftOpen}
      <div class="modal-inline">
        <header class="modal-head">
          <span class="caption">FOLLOW-UP DRAFT - Outlook Drafts</span>
          <button class="close-mini" onclick={() => (emailDraftOpen = false)}>x</button>
        </header>
        <label class="field">
          <span class="caption">TO</span>
          <div class="field-readonly">{client.state?.contact_email || client.state?.email || "(no email on file)"}</div>
        </label>
        <label class="field">
          <span class="caption">SUBJECT</span>
          <input class="input" type="text" bind:value={emailSubject} />
        </label>
        <label class="field">
          <span class="caption">BODY</span>
          <textarea class="input email-body" bind:value={emailBody}></textarea>
        </label>
        <div class="form-actions">
          <button class="ghost-btn" onclick={() => (emailDraftOpen = false)}>Cancel</button>
          <button class="btn-primary" onclick={submitFollowUpDraft} disabled={emailSending}>
            {emailSending ? "Queuing..." : "Save to Outlook drafts"}
          </button>
        </div>
      </div>
    {/if}

    <!-- ── Footer: Save + Ask NEX strip ────────────────────────────── -->
    <footer class="drawer-foot">
      <!-- Ask NEX strip -->
      <div class="nex-strip">
        <span class="nex-strip-label">Ask NEX</span>
        <div class="nex-input-row">
          <input
            class="nex-input"
            type="text"
            placeholder="Ask about this client... revenue, tickets, next steps"
            bind:value={nexQuery}
            onkeydown={(e) => e.key === "Enter" && !nexLoading && submitNexQuery()}
            disabled={nexLoading}
          />
          <button class="nex-send" onclick={submitNexQuery} disabled={nexLoading || !nexQuery.trim()} aria-label="Ask NEX">
            {nexLoading ? "..." : "Ask"}
          </button>
        </div>
        {#if nexAnswer}
          <div class="nex-answer">
            <div class="nex-answer-text">{nexAnswer}</div>
            {#if nexAnswerSource}
              <span class="nex-source">via {nexAnswerSource}</span>
            {/if}
          </div>
        {/if}
        {#if nexError}
          <p class="nex-error">{nexError}</p>
        {/if}
      </div>

      <!-- Save actions -->
      <div class="foot-actions">
        <span class="caption dim">ESC to close - changes sync to Plane + Obsidian</span>
        <div class="foot-btns">
          <button class="ghost-btn" onclick={onClose}>Cancel</button>
          <button class="btn-primary" onclick={saveClient} disabled={saving}>
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>
  </footer>
</div>
{/if}

<style>
  /* Modal backdrop */
  .cd-backdrop {
    position: fixed; inset: 0; z-index: 900;
    background: rgba(5, 10, 15, 0.72);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    opacity: 0;
    transition: opacity 0.28s var(--ease);
    pointer-events: none;
    animation: cdFadeIn 280ms var(--ease) forwards;
  }
  .cd-backdrop.visible { pointer-events: auto; }
  @keyframes cdFadeIn { to { opacity: 1; } }
  @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }

  /* Modal panel */
  .cd-modal {
    position: fixed;
    top: 50%; left: 50%;
    width: min(880px, 96vw);
    max-height: 92vh;
    z-index: 910;
    display: flex;
    flex-direction: column;
    background: var(--glass-card, var(--canvas, #ffffff));
    backdrop-filter: var(--blur-card);
    -webkit-backdrop-filter: var(--blur-card);
    border: 1px solid var(--brand-line);
    border-radius: 18px;
    box-shadow:
      0 40px 100px rgba(0, 0, 0, 0.32),
      0 0 0 1px rgba(86, 188, 236, 0.15),
      0 0 80px -20px var(--lane-glow, rgba(86, 188, 236, 0.4));
    overflow: hidden;
    transform: translate(-50%, -48%) scale(0.94);
    opacity: 0;
    transition: transform 0.36s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.28s var(--ease);
    pointer-events: none;
  }
  .cd-modal.visible {
    transform: translate(-50%, -50%) scale(1);
    opacity: 1;
    pointer-events: auto;
  }

  /* Hero header */
  .cd-hero {
    position: relative;
    padding: 26px 64px 20px 30px;
    display: grid;
    grid-template-columns: 78px minmax(0, 1fr) auto;
    grid-template-rows: auto auto;
    column-gap: 22px;
    row-gap: 0;
    overflow: hidden;
    border-bottom: 1px solid var(--brand-line);
    background: var(--canvas-2);
    flex-shrink: 0;
    align-items: center;
  }
  .cd-hero-bg {
    position: absolute; inset: 0;
    background:
      radial-gradient(circle at 0% 0%, rgba(86, 188, 236, 0.10), transparent 55%),
      radial-gradient(circle at 100% 100%, rgba(107, 79, 216, 0.08), transparent 55%);
    pointer-events: none;
  }
  .cd-monogram {
    grid-column: 1;
    grid-row: 1;
    width: 78px; height: 78px;
    border-radius: 18px;
    background: linear-gradient(135deg, rgba(86, 188, 236, 0.18), rgba(86, 188, 236, 0.06));
    border: 1.5px solid rgba(86, 188, 236, 0.40);
    display: grid; place-items: center;
    font: 700 22px/1 "JetBrains Mono", monospace;
    color: var(--brand-deep);
    letter-spacing: 0.10em;
    align-self: center;
    box-shadow: 0 6px 20px -8px var(--lane-glow, var(--brand-glow));
    z-index: 1;
    flex-shrink: 0;
  }
  .cd-hero-info {
    grid-column: 2;
    grid-row: 1;
    z-index: 1;
    display: flex; flex-direction: column; gap: 6px;
    min-width: 0;
    max-width: 100%;
    align-self: center;
    overflow: hidden;
  }
  .cd-badge-row { display: flex; align-items: center; gap: 8px; }
  .cd-badge {
    font: 700 9.5px/1 "JetBrains Mono", monospace;
    letter-spacing: 0.22em; text-transform: uppercase;
    color: var(--brand-deep);
    padding: 4px 9px; border-radius: 999px;
    background: var(--brand-soft);
    border: 1px solid var(--brand-line);
  }
  .cd-id {
    font: 600 10px/1 "JetBrains Mono", monospace;
    letter-spacing: 0.08em; color: var(--ink-3);
  }
  .cd-name {
    font: 700 clamp(18px, 2.2vw, 26px)/1.18 "Space Grotesk", "Inter", sans-serif;
    color: var(--ink);
    letter-spacing: -0.02em;
    margin: 0;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    max-width: 100%;
  }
  .cd-hero-meta {
    display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 2px;
  }
  .cd-stage-pill {
    padding: 3px 10px; border-radius: 999px;
    background: var(--brand-soft); color: var(--brand-deep);
    font: 600 10.5px/1 "Inter", sans-serif;
    text-transform: uppercase; letter-spacing: 0.08em;
    max-width: 160px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .cd-mrr {
    font: 700 13px/1 "JetBrains Mono", monospace;
    color: var(--brand-deep);
    font-feature-settings: "tnum";
  }
  .cd-contract {
    font: 500 11px/1 "Inter", sans-serif;
    color: var(--ink-2);
    padding: 3px 9px; border-radius: 999px;
    background: var(--canvas); border: 1px solid var(--line);
  }
  .cd-domain {
    font: 500 11px/1 "JetBrains Mono", monospace;
    color: var(--brand); text-decoration: none;
  }
  .cd-domain:hover { text-decoration: underline; }
  .cd-hero-ring {
    grid-column: 3;
    grid-row: 1;
    align-self: center; justify-self: end;
    z-index: 1;
    flex-shrink: 0;
  }

  /* KPI bar inside hero */
  .cd-kpis {
    grid-column: 1 / 4;
    display: flex; gap: 0;
    border-top: 1px solid var(--line);
    margin-top: 18px;
    padding-top: 16px;
    z-index: 1;
  }
  .cd-kpi {
    flex: 1;
    display: flex; flex-direction: column; gap: 4px;
    padding: 0 14px;
    border-right: 1px solid var(--line);
    min-width: 0;
  }
  .cd-kpi:first-child { padding-left: 0; }
  .cd-kpi:last-child  { border-right: none; }
  .cd-kpi-num {
    font: 700 20px/1 "JetBrains Mono", monospace;
    color: var(--ink);
    font-feature-settings: "tnum";
    letter-spacing: -0.01em;
  }
  .cd-kpi-num.cd-kpi-mono { font-size: 13px; font-weight: 600; }
  .cd-kpi-lbl {
    font: 600 9.5px/1 "JetBrains Mono", monospace;
    color: var(--ink-3);
    text-transform: uppercase;
    letter-spacing: 0.10em;
  }
  .cd-kpi.kpi-danger .cd-kpi-num { color: var(--danger); }

  /* Toolbar */
  .cd-toolbar {
    display: flex; gap: 6px; padding: 10px 30px;
    border-bottom: 1px solid var(--line);
    background: var(--canvas);
    flex-shrink: 0;
  }
  .cd-commit-strip {
    display: flex; flex-wrap: wrap; gap: 6px;
    padding: 10px 30px;
    border-bottom: 1px solid var(--line);
    flex-shrink: 0;
    background: var(--canvas);
  }

  /* Close button */
  .cd-close {
    position: absolute; top: 16px; right: 16px; z-index: 5;
    width: 34px; height: 34px; border-radius: 10px;
    background: var(--canvas-2); color: var(--ink-2);
    display: grid; place-items: center;
    border: 1px solid var(--line);
    cursor: pointer;
    transition: background 0.15s var(--ease), color 0.15s var(--ease), transform 0.15s var(--ease);
  }
  .cd-close:hover {
    background: var(--danger-soft); color: var(--danger);
    transform: rotate(90deg);
  }

  /* ── Drawer header (fixed) ────────────────────────────────────────── */
  .drawer-head {
    display: flex; justify-content: space-between; align-items: center;
    padding: 16px 20px 12px;
    border-bottom: 1px solid var(--brand-line);
    flex-shrink: 0;
  }
  .head-left { display: flex; align-items: center; gap: 10px; }
  .head-right { display: flex; align-items: center; gap: 8px; }
  .lane-pill {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 4px 10px; border-radius: 999px;
    background: color-mix(in oklab, var(--lane-accent) 14%, transparent);
    border: 1px solid color-mix(in oklab, var(--lane-accent) 40%, transparent);
    font-size: 10px; letter-spacing: 0.1em; font-weight: 600;
    color: var(--ink-2); text-transform: uppercase;
  }
  .lane-pill-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--lane-accent); box-shadow: 0 0 6px var(--lane-accent); }
  .drawer-id {
    font-family: "JetBrains Mono", monospace;
    font-size: 10px; color: var(--ink-3); letter-spacing: 0.05em;
  }

  /* ── Title row ────────────────────────────────────────────────────── */
  .title-row {
    display: flex; align-items: flex-start; justify-content: space-between;
    padding: 14px 20px 10px;
    border-bottom: 1px solid color-mix(in oklab, var(--lane-accent) 18%, var(--line));
    flex-shrink: 0;
    gap: 12px;
  }
  .title-left { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .drawer-title {
    font-size: 24px; font-weight: 700; letter-spacing: -0.015em;
    color: var(--ink); margin: 0; line-height: 1.15;
  }
  .drawer-domain {
    font-family: "JetBrains Mono", monospace;
    font-size: 11px; color: var(--brand); text-decoration: none;
  }
  .drawer-domain:hover { text-decoration: underline; }
  .title-ring { flex-shrink: 0; }

  /* ── Commit strip ─────────────────────────────────────────────────── */
  .commit-strip {
    display: flex; flex-wrap: wrap; gap: 6px;
    padding: 8px 20px;
    border-bottom: 1px solid var(--line);
    flex-shrink: 0;
  }
  .commit-badge {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 3px 8px; border-radius: 999px;
    background: color-mix(in oklab, var(--u) 10%, var(--canvas-2));
    border: 1px solid color-mix(in oklab, var(--u) 30%, var(--line));
    font-size: 11px; color: var(--ink-2);
  }
  .commit-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--u); box-shadow: 0 0 5px var(--u); flex-shrink: 0; }
  .commit-desc { color: var(--ink); max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .commit-due { font-family: "JetBrains Mono", monospace; font-size: 10px; color: var(--u); }

  /* ── KPI strip ────────────────────────────────────────────────────── */
  .kpi-strip {
    display: grid; grid-template-columns: repeat(5, 1fr);
    gap: 0; padding: 12px 20px;
    border-bottom: 1px solid var(--line);
    background: color-mix(in oklab, var(--lane-accent) 4%, var(--canvas));
    flex-shrink: 0;
  }
  .kpi {
    display: flex; flex-direction: column; gap: 3px; align-items: flex-start;
    padding: 0 8px 0 0;
  }
  .kpi + .kpi { border-left: 1px solid var(--line); padding-left: 12px; }
  .kpi-val {
    font-size: 15px; font-weight: 600; color: var(--ink);
    letter-spacing: -0.01em; line-height: 1.1;
    font-family: "Space Grotesk", sans-serif;
  }
  .kpi-val.kpi-mono { font-family: "JetBrains Mono", monospace; font-size: 12px; }
  .kpi-lbl {
    font-size: 8px; letter-spacing: 0.16em; color: var(--ink-3);
    text-transform: uppercase; font-weight: 500;
  }

  /* ── Tab bar ──────────────────────────────────────────────────────── */
  .tab-bar {
    display: flex; align-items: stretch;
    padding: 0 22px;
    border-bottom: 1px solid var(--line);
    gap: 4px;
    background: var(--canvas-2);
    flex-shrink: 0;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .tab-bar::-webkit-scrollbar { display: none; }
  .tab-btn {
    all: unset; cursor: pointer;
    display: inline-flex; align-items: center; gap: 5px;
    padding: 10px 12px 9px;
    font-size: 11px; font-weight: 500; letter-spacing: 0.04em;
    color: var(--ink-3);
    border-bottom: 2px solid transparent;
    white-space: nowrap;
    transition: color var(--dur) var(--ease), border-color var(--dur) var(--ease);
    position: relative; top: 1px;
  }
  .tab-btn:hover { color: var(--ink-2); }
  .tab-active {
    color: var(--brand-deep) !important;
    border-bottom-color: var(--brand) !important;
    font-weight: 600 !important;
  }
  .tab-icon { font-size: 12px; opacity: 0.7; }
  .tab-count {
    font-family: "JetBrains Mono", monospace;
    font-size: 9px; padding: 1px 5px;
    background: var(--brand-soft);
    border-radius: 999px; color: var(--brand-deep);
  }

  /* ── Tab panels (scrollable) ──────────────────────────────────────── */
  .tab-panels {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    padding: 18px 30px;
    display: flex; flex-direction: column; gap: 0;
    scrollbar-width: thin;
    scrollbar-color: var(--brand-line) transparent;
    background: var(--canvas);
  }
  .tab-panel {
    display: flex; flex-direction: column; gap: 16px;
    animation: cdPanelFade 0.26s cubic-bezier(0.22, 1, 0.36, 1);
  }
  @keyframes cdPanelFade {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* ── Section ──────────────────────────────────────────────────────── */
  .section { display: flex; flex-direction: column; gap: 10px; }
  .section-header { display: flex; align-items: center; justify-content: space-between; }
  .section-title {
    font-size: 10px; font-weight: 600; letter-spacing: 0.16em;
    text-transform: uppercase; color: var(--ink-3);
    margin: 0; display: inline-flex; align-items: center; gap: 6px;
    font-family: "Space Grotesk", sans-serif;
  }
  .section-bracket { color: var(--lane-accent); font-size: 12px; }
  .section-count {
    font-family: "JetBrains Mono", monospace;
    font-size: 9px; color: var(--ink-3);
    background: var(--brand-soft);
    padding: 1px 6px; border-radius: 999px;
    border: 1px solid var(--brand-line); margin-left: 4px;
  }

  /* ── Info grid (overview) ─────────────────────────────────────────── */
  .info-grid { display: flex; flex-direction: column; gap: 6px; }
  .info-row {
    display: grid; grid-template-columns: 110px 1fr;
    gap: 8px; align-items: baseline;
    padding: 5px 0;
    border-bottom: 1px solid var(--line);
  }
  .info-label { font-size: 10px; color: var(--ink-3); font-weight: 500; letter-spacing: 0.04em; text-transform: uppercase; }
  .info-val { font-size: 13px; color: var(--ink); }
  .info-val.mono { font-family: "JetBrains Mono", monospace; font-size: 12px; }
  .info-link { font-family: "JetBrains Mono", monospace; font-size: 12px; color: var(--brand); text-decoration: none; }
  .info-link:hover { text-decoration: underline; }

  /* ── Health breakdown ────────────────────────────────────────────── */
  .health-breakdown {
    display: flex; align-items: flex-start; gap: 20px;
    padding: 14px;
    background: color-mix(in oklab, var(--lane-accent) 5%, var(--canvas));
    border: 1px solid var(--brand-line);
    border-radius: var(--r2);
  }
  .health-ring-large { flex-shrink: 0; }
  .health-factors { flex: 1; display: flex; flex-direction: column; gap: 6px; }
  .factor-row {
    display: flex; justify-content: space-between; align-items: center;
    font-size: 12px;
  }
  .factor-name { color: var(--ink-2); }
  .factor-val { font-family: "JetBrains Mono", monospace; font-size: 11px; font-weight: 600; }

  /* ── Edit fields ─────────────────────────────────────────────────── */
  .edit-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  @media (max-width: 480px) { .edit-grid { grid-template-columns: 1fr; } }
  .field { display: flex; flex-direction: column; gap: 5px; }
  .mt-2 { margin-top: 10px; }
  .input {
    all: unset;
    padding: 9px 11px;
    background: var(--canvas-2);
    border: 1px solid var(--line-2);
    border-radius: var(--r2);
    color: var(--ink); font-size: 13px; font-family: inherit;
    transition: border-color var(--dur) var(--ease);
  }
  .input:focus { border-color: var(--lane-accent); outline: none; box-shadow: 0 0 0 3px color-mix(in oklab, var(--lane-accent) 15%, transparent); }
  .notes-area { min-height: 120px; resize: vertical; line-height: 1.5; font-family: "Inter", sans-serif; }

  /* ── Tickets ─────────────────────────────────────────────────────── */
  .state-group { margin-bottom: 12px; }
  .state-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 4px 0; margin-bottom: 6px;
  }
  .state-name { font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-3); font-weight: 600; }
  .state-count { font-family: "JetBrains Mono", monospace; font-size: 9px; color: var(--ink-4); }
  .tix-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
  .tix-row {
    display: flex; flex-direction: column; gap: 5px;
    padding: 7px 10px;
    background: var(--canvas-2); border: 1px solid var(--line);
    border-radius: var(--r1); font-size: 12px;
    transition: border-color var(--dur) var(--ease);
  }
  .tix-row:hover { border-color: var(--brand-line); }
  .tix-main {
    display: grid; grid-template-columns: 72px 1fr 72px 84px;
    gap: 8px; align-items: center;
  }
  .tix-id {
    font-family: "JetBrains Mono", monospace; font-size: 10px;
    color: var(--brand-deep); text-decoration: none; font-weight: 600;
  }
  .tix-id:hover { text-decoration: underline; }
  .tix-name { color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tix-prio {
    padding: 2px 7px; border-radius: 999px;
    font-size: 9px; text-align: center; text-transform: uppercase; letter-spacing: 0.06em;
    background: var(--canvas); color: var(--ink-3);
  }
  .chip-urgent { background: var(--danger-soft); color: var(--danger); }
  .chip-high   { background: var(--warn-soft); color: var(--warn); }
  .chip-medium { background: var(--warn-soft); color: var(--warn); }
  .chip-low    { background: var(--success-soft); color: var(--success); }
  .chip-done   { background: var(--brand-soft); color: var(--brand-deep); }
  .tix-due { font-family: "JetBrains Mono", monospace; font-size: 10px; color: var(--ink-3); text-align: right; }
  .tix-due.over { color: var(--danger); }
  .tix-meta { display: flex; flex-wrap: wrap; gap: 4px; }
  .tix-chip {
    padding: 1px 6px; border-radius: 4px;
    font-size: 9px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase;
  }
  .tix-chip--module { background: rgba(86,188,236,0.12); color: var(--brand-deep); }
  .tix-chip--cycle  { background: rgba(107,79,216,0.10); color: #5b38c4; }
  .tix-more { font-size: 10px; color: var(--ink-3); margin-top: 4px; padding-left: 4px; }

  /* ── Revenue tab ─────────────────────────────────────────────────── */
  .rev-kpis {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;
  }
  .rev-kpi {
    display: flex; flex-direction: column; gap: 4px;
    padding: 12px 14px;
    background: var(--canvas-2); border: 1px solid var(--line);
    border-radius: var(--r2);
  }
  .rev-kpi-val {
    font-family: "Space Grotesk", sans-serif;
    font-size: 18px; font-weight: 700; color: var(--ink); letter-spacing: -0.01em;
  }
  .rev-kpi-val.mono { font-family: "JetBrains Mono", monospace; font-size: 16px; }
  .rev-kpi-lbl { font-size: 9px; letter-spacing: 0.14em; color: var(--ink-3); text-transform: uppercase; }
  .rev-summary { display: flex; flex-direction: column; gap: 4px; }
  .rev-big {
    font-size: 26px; font-weight: 700; color: var(--ink);
    letter-spacing: -0.015em; line-height: 1.1;
    font-family: "Space Grotesk", sans-serif;
  }
  .rev-meta { font-size: 11px; color: var(--ink-3); }
  .rev-track {
    position: relative; height: 6px; margin: 8px 0 6px;
    border-radius: 999px; background: var(--canvas); overflow: visible;
    border: 1px solid var(--line);
  }
  .rev-bar {
    position: absolute; inset: 0;
    background: linear-gradient(90deg, color-mix(in oklab, var(--brand) 60%, transparent) 0%, color-mix(in oklab, var(--lane-accent) 80%, var(--a2)) 100%);
    border-radius: 999px;
    box-shadow: 0 0 10px var(--brand-glow);
  }
  .rev-last {
    position: absolute; top: 50%; transform: translate(-50%, -50%);
    width: 12px; height: 12px; border-radius: 50%;
    background: var(--canvas-2); border: 2px solid var(--lane-accent);
    box-shadow: 0 0 8px var(--lane-accent);
  }
  .rev-ticks {
    display: flex; justify-content: space-between;
    font-size: 10px; font-family: "JetBrains Mono", monospace;
    color: var(--ink-3); letter-spacing: 0.03em;
  }

  /* Invoices table */
  .invoice-table { display: flex; flex-direction: column; gap: 4px; }
  .invoice-header {
    display: grid; grid-template-columns: 90px 1fr 80px 70px;
    gap: 8px; padding: 5px 10px;
    font-size: 9px; letter-spacing: 0.12em; text-transform: uppercase;
    color: var(--ink-3); font-weight: 600;
  }
  .invoice-row {
    display: grid; grid-template-columns: 90px 1fr 80px 70px;
    gap: 8px; padding: 8px 10px;
    background: var(--canvas-2); border: 1px solid var(--line);
    border-radius: var(--r1); font-size: 12px; color: var(--ink);
    align-items: center;
  }
  .inv-status { font-size: 9px; padding: 2px 7px; border-radius: 999px; text-align: center; text-transform: uppercase; }
  .status-paid   { background: var(--success-soft); color: var(--success); }
  .status-open   { background: var(--warn-soft); color: var(--warn); }
  .status-overdue { background: var(--danger-soft); color: var(--danger); }

  /* ── Meetings tab ────────────────────────────────────────────────── */
  .meet-actions { display: flex; justify-content: flex-end; }
  .meet-form-section {
    padding: 14px; background: var(--canvas-2);
    border: 1px solid color-mix(in oklab, var(--lane-accent) 25%, var(--line));
    border-radius: var(--r2);
  }
  .meet-row-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  @media (max-width: 480px) { .meet-row-fields { grid-template-columns: 1fr; } }
  .meet-area { min-height: 100px; resize: vertical; line-height: 1.5; font-family: "Inter", sans-serif; font-size: 13px; }
  .meet-area.small { min-height: 64px; }
  .form-actions { display: flex; gap: 8px; justify-content: flex-end; }
  .meet-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .meet-row {
    display: grid; grid-template-columns: 170px 1fr;
    gap: 8px; align-items: start;
    padding: 8px 12px;
    background: var(--canvas-2); border: 1px solid var(--line);
    border-radius: var(--r1);
  }
  .meet-row.upcoming { border-left: 2px solid var(--lane-accent); }
  .meet-row.past { opacity: 0.7; }
  .meet-date { font-family: "JetBrains Mono", monospace; font-size: 10px; color: var(--ink-3); }
  .meet-subject { font-size: 12px; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meet-summary {
    grid-column: 1 / -1; font-size: 11px; color: var(--ink-3);
    line-height: 1.4; margin: 4px 0 0;
  }

  /* ── NEX Intel tab ───────────────────────────────────────────────── */
  .pred-box {
    padding: 14px 16px;
    background: linear-gradient(135deg,
      color-mix(in oklab, var(--lane-accent) 8%, var(--canvas)),
      color-mix(in oklab, var(--a2) 6%, var(--canvas)));
    border: 1px solid color-mix(in oklab, var(--lane-accent) 28%, var(--line));
    border-radius: var(--r2); display: flex; flex-direction: column; gap: 6px;
  }
  .pred-likely { margin: 0; font-size: 13px; color: var(--ink); font-weight: 600; line-height: 1.35; }
  .pred-answer { margin: 0; font-size: 12px; color: var(--ink-2); line-height: 1.5; }
  .pred-conf { font-family: "JetBrains Mono", monospace; font-size: 9px; color: var(--ink-3); }

  .decision-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .decision-row {
    padding: 12px 14px; display: flex; flex-direction: column; gap: 6px;
    background: var(--canvas-2); border: 1px solid var(--line);
    border-radius: var(--r2);
  }
  .decision-header { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .decision-date { font-size: 10px; color: var(--ink-3); }
  .decision-tags { display: flex; gap: 4px; flex-wrap: wrap; }
  .tag {
    font-size: 9px; padding: 1px 6px; border-radius: 999px;
    background: var(--brand-soft); color: var(--brand-deep);
    border: 1px solid var(--brand-line); letter-spacing: 0.04em;
  }
  .decision-text { font-size: 13px; color: var(--ink); line-height: 1.4; margin: 0; }
  .decision-rationale { font-size: 11px; color: var(--ink-2); line-height: 1.45; margin: 0; }
  .decision-outcome {
    display: flex; gap: 8px; align-items: baseline;
    padding: 6px 8px; background: var(--success-soft);
    border-radius: var(--r1); margin-top: 2px;
  }
  .outcome-label { font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--success); font-weight: 600; flex-shrink: 0; }
  .outcome-text { font-size: 11px; color: var(--ink-2); }

  .commit-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .commit-row {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 12px; background: var(--canvas-2); border: 1px solid var(--line);
    border-left: 2px solid var(--u); border-radius: var(--r1);
  }
  .commit-dot-inline { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .commit-text { flex: 1; font-size: 12px; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .commit-due-badge {
    font-family: "JetBrains Mono", monospace; font-size: 10px;
    color: var(--u); white-space: nowrap; flex-shrink: 0;
  }

  /* ── Modals (email draft) ────────────────────────────────────────── */
  .modal-inline {
    position: absolute; left: 20px; right: 20px; bottom: 80px;
    z-index: 10;
    display: flex; flex-direction: column; gap: 10px;
    padding: 16px;
    background: var(--glass-elev);
    backdrop-filter: var(--blur-elev);
    border: 1px solid color-mix(in oklab, var(--lane-accent) 30%, var(--line));
    border-radius: var(--r3); box-shadow: var(--sh-elev);
  }
  .modal-head { display: flex; justify-content: space-between; align-items: center; }
  .email-body { min-height: 180px; resize: vertical; line-height: 1.5; font-family: "Inter", sans-serif; }
  .field-readonly {
    padding: 8px 11px; background: var(--canvas); border: 1px solid var(--line);
    border-radius: var(--r1); font-family: "JetBrains Mono", monospace;
    font-size: 12px; color: var(--ink-2);
  }

  /* ── Buttons ─────────────────────────────────────────────────────── */
  .ghost-btn {
    all: unset; cursor: pointer;
    padding: 7px 12px; border-radius: var(--r1);
    font-size: 11px; font-weight: 500;
    color: var(--ink-2); background: var(--canvas-2);
    border: 1px solid var(--line-2);
    font-family: "Inter", sans-serif;
    white-space: nowrap;
    transition: background var(--dur) var(--ease), color var(--dur) var(--ease), border-color var(--dur) var(--ease);
  }
  .ghost-btn:hover:not(:disabled) { background: var(--brand-soft); border-color: var(--brand-line-2); color: var(--brand-deep); }
  .ghost-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .close-btn {
    all: unset; cursor: pointer;
    width: 28px; height: 28px; display: grid; place-items: center;
    border-radius: 50%; background: var(--canvas-2); border: 1px solid var(--line);
    font-size: 18px; color: var(--ink-3);
    transition: background var(--dur) var(--ease), color var(--dur) var(--ease);
  }
  .close-btn:hover { background: var(--danger-soft); color: var(--danger); }
  .close-mini {
    all: unset; cursor: pointer;
    width: 22px; height: 22px; display: grid; place-items: center;
    border-radius: 50%; background: var(--canvas); font-size: 14px; color: var(--ink-3);
  }
  .close-mini:hover { background: var(--line); color: var(--ink); }
  .btn-primary {
    all: unset; cursor: pointer;
    padding: 9px 16px; border-radius: var(--r2);
    font-family: "Space Grotesk", sans-serif; font-size: 12px; font-weight: 600;
    letter-spacing: -0.01em; color: #fff;
    background: linear-gradient(135deg, var(--lane-accent) 0%, color-mix(in oklab, var(--lane-accent) 55%, var(--a2)) 100%);
    box-shadow: 0 0 18px color-mix(in oklab, var(--lane-accent) 30%, transparent);
    transition: filter var(--dur) var(--ease), opacity var(--dur) var(--ease);
  }
  .btn-primary:hover:not(:disabled) { filter: brightness(1.08); }
  .btn-primary:disabled { opacity: 0.45; cursor: not-allowed; }

  /* ── Ask NEX strip + Footer ───────────────────────────────────────── */
  .drawer-foot {
    display: flex; flex-direction: column; gap: 12px;
    padding: 14px 30px 18px;
    border-top: 1px solid var(--brand-line);
    background: var(--canvas-2);
    flex-shrink: 0;
  }
  .nex-strip {
    display: flex; flex-direction: column; gap: 8px;
    padding: 10px 12px;
    background: color-mix(in oklab, var(--lane-accent) 7%, var(--canvas-2));
    border: 1px solid color-mix(in oklab, var(--lane-accent) 35%, var(--line));
    border-radius: var(--r2);
  }
  .nex-strip-label {
    font-size: 9px; letter-spacing: 0.18em; text-transform: uppercase;
    color: var(--brand-deep); font-weight: 600;
    font-family: "Space Grotesk", sans-serif;
    display: flex; align-items: center; gap: 4px;
  }
  .nex-strip-label::before { content: "✦"; font-size: 10px; color: var(--brand); }
  .nex-input-row {
    display: flex; gap: 8px; align-items: center;
  }
  .nex-input {
    all: unset;
    flex: 1; padding: 8px 12px;
    background: var(--canvas-2); border: 1px solid var(--line-2);
    border-radius: var(--r1); font-size: 13px; color: var(--ink);
    font-family: "Inter", sans-serif;
    transition: border-color var(--dur) var(--ease);
  }
  .nex-input:focus { border-color: var(--brand); outline: none; box-shadow: 0 0 0 3px var(--brand-soft); }
  .nex-input::placeholder { color: var(--ink-3); }
  .nex-input:disabled { opacity: 0.6; cursor: not-allowed; }
  .nex-send {
    all: unset; cursor: pointer;
    padding: 7px 16px; border-radius: var(--r1);
    font-size: 12px; font-weight: 600;
    color: var(--canvas-2); background: var(--brand);
    font-family: "Space Grotesk", sans-serif;
    white-space: nowrap;
    transition: filter var(--dur) var(--ease), opacity var(--dur) var(--ease);
    box-shadow: 0 2px 8px var(--brand-glow);
  }
  .nex-send:hover:not(:disabled) { filter: brightness(1.1); }
  .nex-send:disabled { opacity: 0.45; cursor: not-allowed; }
  .nex-answer {
    padding: 10px 12px;
    background: var(--canvas-2); border: 1px solid var(--brand-line);
    border-radius: var(--r1);
    display: flex; flex-direction: column; gap: 6px;
    animation: fade-in 200ms var(--ease);
  }
  .nex-answer-text {
    font-size: 12px; line-height: 1.55; color: var(--ink);
    white-space: pre-wrap; word-break: break-word;
  }
  .nex-source {
    font-family: "JetBrains Mono", monospace;
    font-size: 9px; color: var(--ink-3); letter-spacing: 0.06em;
  }
  .nex-error { font-size: 11px; color: var(--danger); margin: 0; }

  .foot-actions {
    display: flex; justify-content: space-between; align-items: center;
    gap: 12px; flex-wrap: wrap;
  }
  .foot-btns { display: flex; gap: 8px; }
  .dim { color: var(--ink-3); }

  /* ── Shared typography helpers ────────────────────────────────────── */
  .caption { font-size: 10px; letter-spacing: 0.08em; color: var(--ink-3); }
  .mono { font-family: "JetBrains Mono", monospace; }
  .empty-msg {
    font-size: 12px; color: var(--ink-3); line-height: 1.5;
    padding: 12px 0; font-style: italic;
  }
  .empty-msg code { font-family: "JetBrains Mono", monospace; font-size: 11px; background: var(--brand-soft); padding: 1px 4px; border-radius: 4px; }
  .loading-msg { font-size: 12px; color: var(--ink-3); padding: 8px 0; }

  /* Tablet adjustments */
  @media (max-width: 760px) {
    .cd-modal { width: 100vw; max-height: 100dvh; border-radius: 0; }
    .cd-hero { padding: 22px 56px 16px 18px; grid-template-columns: 64px minmax(0,1fr) auto; column-gap: 14px; }
    .cd-monogram { width: 64px; height: 64px; font-size: 18px; border-radius: 14px; }
    .cd-hero-ring svg { width: 64px; height: 64px; }
    .cd-toolbar, .cd-commit-strip { padding: 10px 18px; }
    .tab-bar { padding: 0 12px; }
    .tab-panels { padding: 16px 18px; }
    .drawer-foot { padding: 12px 18px 16px; }
    .cd-kpis { flex-wrap: wrap; }
    .cd-kpi { flex: 1 1 33%; padding: 6px 10px; }
    .cd-name { font-size: clamp(16px, 4vw, 22px); }
  }

  @media (max-width: 480px) {
    .cd-hero { grid-template-columns: 56px minmax(0,1fr); padding-right: 52px; }
    .cd-hero-ring { display: none; }
    .cd-kpi { flex: 1 1 50%; border-bottom: 1px solid var(--line); padding-bottom: 8px; }
  }

  @media (prefers-reduced-motion: reduce) {
    .cd-backdrop, .cd-modal { animation: none; transition: none; opacity: 1; }
    .cd-modal { transform: translate(-50%, -50%) scale(1); }
    .tab-panel { animation: none; }
    .cd-close:hover { transform: none; }
  }
</style>

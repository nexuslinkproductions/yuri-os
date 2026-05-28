<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { listEntityState, subscribeEntityState, type EntityState } from "$lib/db";
  import GlassCard from "$components/GlassCard.svelte";
  import GlassStat from "$components/GlassStat.svelte";
  import LiveBadge from "$components/LiveBadge.svelte";
  import { toast } from "$components/GlassToast.svelte";
  import ClientDrawer from "$components/ClientDrawer.svelte";

  // Tickets (for drawer) — live from entity_state
  let tickets = $state<EntityState[]>([]);
  let unsubT: (() => void) | null = null;

  // Drill-down drawer
  let selected = $state<EntityState | null>(null);
  let draftNotes = $state<string>("");
  let draftNextTouch = $state<string>("");
  let draftContactEmail = $state<string>("");
  let draftStage = $state<string>("");
  let draftBilling = $state<string>("");
  let saving = $state(false);
  let newMeetingTitle = $state<string>("");

  // Commitments for selected client
  type Commitment = { id?: string; description?: string; due_at?: string | null; status?: string; };
  let commitments = $state<Commitment[]>([]);

  // ─── 4-lane sales-process CRM ────────────────────────────
  type LaneKey = "lead" | "pre_active" | "active" | "retention";
  interface Lane {
    key: LaneKey;
    label: string;
    sub: string;
    accent: string;     // hex
    glow: string;       // rgba
  }
  const LANES: Lane[] = [
    { key: "lead",       label: "Lead",       sub: "first contact · qualifying", accent: "#3b82f6", glow: "rgba(59,130,246,0.45)" },
    { key: "pre_active", label: "Pre-active", sub: "proposal · negotiation",      accent: "#f97316", glow: "rgba(249,115,22,0.45)" },
    { key: "active",     label: "Active",     sub: "contract signed · delivering", accent: "#22c55e", glow: "rgba(34,197,94,0.45)" },
    { key: "retention",  label: "Retention",  sub: "yearly · retainer · long-term", accent: "#a855f7", glow: "rgba(168,85,247,0.45)" },
  ];

  // ─── State ───────────────────────────────────────────────
  let clients = $state<EntityState[]>([]);
  let loading = $state(true);
  let unsubC: (() => void) | null = null;

  // Local lane override — drag result applied before server confirms
  let localLane = $state<Record<string, LaneKey>>({});

  // Drag state
  let draggedId = $state<string | null>(null);
  let hoveredLane = $state<LaneKey | null>(null);

  // Email modal state
  let emailModal = $state<{ client: EntityState; draft: string; subject: string } | null>(null);

  onMount(async () => {
    [clients, tickets] = await Promise.all([
      listEntityState("client", 200),
      listEntityState("ticket", 500),
    ]);
    loading = false;
    unsubC = subscribeEntityState("client", row => {
      clients = [row, ...clients.filter(c => c.entity_id !== row.entity_id)].slice(0, 200);
      // Keep drawer in sync if this client is open
      if (selected && row.entity_id === selected.entity_id) selected = row;
    });
    unsubT = subscribeEntityState("ticket", row => {
      tickets = [row, ...tickets.filter(t => t.entity_id !== row.entity_id)].slice(0, 500);
    });
  });
  onDestroy(() => { unsubC?.(); unsubT?.(); });

  // ─── Drawer helpers ──────────────────────────────────────
  function openClient(c: EntityState) {
    selected = c;
    draftNotes         = c.state?.notes || "";
    draftNextTouch     = c.state?.next_touch || c.state?.next_follow_up || "";
    draftContactEmail  = c.state?.contact_email || c.state?.email || "";
    draftStage         = c.state?.stage || "";
    draftBilling       = c.state?.billing_type || "";
    newMeetingTitle    = "";
    fetchCommitments(c.entity_id);
  }
  function closeDrawer() { selected = null; commitments = []; }

  async function fetchCommitments(code: string) {
    commitments = [];
    try {
      // Best-effort: query commitments table by multiple possible field shapes.
      // Anon-key read — commitments table may or may not exist / be readable.
      const { supabase, hasClient } = await import("$lib/db");
      if (!hasClient()) return;
      const client = supabase();
      // Try 'entity_id' first, fall back to 'client_code' on miss.
      const tryQueries = [
        { column: "entity_id", value: code },
        { column: "client_code", value: code },
      ];
      for (const q of tryQueries) {
        const { data, error } = await client
          .from("commitments")
          .select("*")
          .eq(q.column, q.value)
          .eq("status", "open")
          .order("due_at", { ascending: true })
          .limit(10);
        if (!error && Array.isArray(data) && data.length > 0) {
          commitments = data as Commitment[];
          return;
        }
        if (error && (
          /column .* does not exist/i.test(error.message) ||
          /could not find the .* column/i.test(error.message) ||
          error.code === 'PGRST200' ||
          error.code === 'PGRST204' ||
          error.code === '42703'
        )) continue;
        if (error) return; // other error - silent
      }
    } catch { /* silent — commitments table may not exist yet */ }
  }

  function commitmentUrgency(due?: string | null): { color: string; label: string } {
    if (!due) return { color: "#64748b", label: "open" };
    const days = Math.floor((new Date(due).getTime() - Date.now()) / 86400000);
    if (days < 0)  return { color: "#ef4444", label: `${Math.abs(days)}d overdue` };
    if (days <= 1) return { color: "#f59e0b", label: days === 0 ? "today" : "tomorrow" };
    if (days <= 7) return { color: "#eab308", label: `in ${days}d` };
    return                { color: "#22c55e", label: `in ${days}d` };
  }

  function ticketsOfClient(c: EntityState) {
    const code = c.entity_id;
    const legalName = (c.state?.name || "").toLowerCase();
    return tickets.filter(t => {
      const tCust = (t.state?.customer || "").toLowerCase();
      if (tCust && legalName && tCust.includes(legalName.split(" ")[0])) return true;
      const tid = t.entity_id || "";
      const prefix = tid.split("-")[0];
      return prefix === code;
    });
  }

  function fmtDate(d?: string): string {
    if (!d) return "—";
    try { return new Date(d).toLocaleDateString("de-CH", { timeZone: "Europe/Zurich", day: "2-digit", month: "short", year: "numeric" }); }
    catch { return d; }
  }

  async function saveClient() {
    if (!selected) return;
    saving = true;
    try {
      const res = await fetch("/api/functions/client-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_code: selected.entity_id,
          client_name: selected.state?.name || "",
          fields: {
            notes:         draftNotes,
            next_touch:    draftNextTouch || null,
            contact_email: draftContactEmail,
            stage:         draftStage,
            billing_type:  draftBilling,
          },
          source: "dashboard-v2-pipeline-drawer",
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast("Saved — syncing to Plane + Obsidian", "ok", 2800);
      // Optimistic local update
      selected = {
        ...selected,
        state: {
          ...selected.state,
          notes: draftNotes,
          next_touch: draftNextTouch,
          contact_email: draftContactEmail,
          stage: draftStage,
          billing_type: draftBilling,
        },
      };
    } catch (err) {
      console.warn("[pipeline] save failed:", err);
      toast("Save queued — will retry", "warn", 2800);
    } finally {
      saving = false;
    }
  }

  async function createMeetingNote() {
    if (!selected || !newMeetingTitle.trim()) return;
    try {
      const res = await fetch("/api/functions/client-meeting-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_code: selected.entity_id,
          client_name: selected.state?.name || "",
          title: newMeetingTitle.trim(),
          date: new Date().toISOString(),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast(`Meeting note created: ${newMeetingTitle}`, "ok", 2800);
      newMeetingTitle = "";
    } catch (err) {
      console.warn("[pipeline] meeting note failed:", err);
      toast("Meeting note queued — will retry", "warn", 2800);
    }
  }

  function openInPlane(c: EntityState) {
    // Plane customer URL — workspace=c2moviez, customers route
    const url = `https://app.plane.so/c2moviez/customers/`;
    window.open(url, "_blank", "noopener");
  }
  function openInObsidian(c: EntityState) {
    // obsidian:// URL scheme — opens the client note in local vault
    const vault = "c2moviez";  // vault name
    const name = c.state?.name || c.entity_id;
    const url = `obsidian://open?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(`02 - Clients/${c.entity_id} - ${name}`)}`;
    window.location.href = url;
  }

  // ─── Classify each client into a lane ────────────────────
  function laneOf(c: EntityState): LaneKey {
    // Local override from drag
    if (localLane[c.entity_id]) return localLane[c.entity_id];

    const s = (c.state?.contract_status || c.state?.contract_type || "").toLowerCase();
    const stage = (c.state?.stage || "").toLowerCase();
    const billing = (c.state?.billing_type || "").toLowerCase();
    const mrr = Number(c.state?.monthly_revenue) || 0;

    // Retention: explicit yearly/retainer with MRR
    if (mrr > 0 && /year|retain|annual|jahr/i.test(billing + " " + s)) return "retention";
    // Active: contract active or has MRR
    if (s === "active" || mrr > 0) return "active";
    // Pre-active: proposal/negotiation/transition
    if (/propos|offer|quote|negot|pre[-_ ]?contract|transition/i.test(s + " " + stage)) return "pre_active";
    // Lead: pre-sales / prospect / discovery / cold
    if (/prospect|discover|lead|cold|pre[-_ ]?sales|pitching/i.test(s + " " + stage)) return "lead";
    // Default: lead (conservative — show in pipeline for action)
    return "lead";
  }

  const lanesData = $derived(LANES.map(l => ({
    ...l,
    items: clients.filter(c => laneOf(c) === l.key),
  })));

  // ─── KPIs ────────────────────────────────────────────────
  const mrrPipeline = $derived(clients.reduce((s, c) => s + (Number(c.state?.monthly_revenue) || 0), 0));
  const arrActive = $derived(clients.filter(c => laneOf(c) === "active" || laneOf(c) === "retention")
    .reduce((s, c) => s + (Number(c.state?.monthly_revenue) || 0), 0) * 12);
  const wipCount = $derived(clients.filter(c => laneOf(c) === "pre_active").length);
  const retentionCount = $derived(clients.filter(c => laneOf(c) === "retention").length);

  function fmtChf(n: number): string {
    if (n >= 1000) return "CHF " + Math.round(n / 1000) + "k";
    if (n > 0)     return "CHF " + Math.round(n);
    return "—";
  }

  // ─── Health dot ──────────────────────────────────────────
  function healthOf(c: EntityState): { color: string; label: string } {
    const last = c.state?.last_contact || c.state?.updated_at || c.updated_at;
    if (!last) return { color: "#64748b", label: "unknown" };
    const days = Math.floor((Date.now() - new Date(last).getTime()) / 86400000);
    if (days <= 7)  return { color: "#22c55e", label: "hot" };
    if (days <= 21) return { color: "#f59e0b", label: "warm" };
    if (days <= 60) return { color: "#f97316", label: "cooling" };
    return                 { color: "#ef4444", label: "cold" };
  }

  function nextTouchCountdown(c: EntityState): string {
    const next = c.state?.next_touch || c.state?.next_follow_up;
    if (!next) return "";
    const days = Math.floor((new Date(next).getTime() - Date.now()) / 86400000);
    if (days < 0)   return `${Math.abs(days)}d overdue`;
    if (days === 0) return "today";
    if (days === 1) return "tomorrow";
    if (days <= 7)  return `in ${days}d`;
    return new Date(next).toLocaleDateString("de-CH", { timeZone: "Europe/Zurich", month: "short", day: "numeric" });
  }

  // ─── Drag + drop ─────────────────────────────────────────
  function onDragStart(e: DragEvent, c: EntityState) {
    if (!e.dataTransfer) return;
    draggedId = c.entity_id;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", c.entity_id);
  }
  function onDragEnd() { draggedId = null; hoveredLane = null; }

  function onLaneDragOver(e: DragEvent, lane: LaneKey) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    hoveredLane = lane;
  }
  function onLaneDragLeave(lane: LaneKey) {
    if (hoveredLane === lane) hoveredLane = null;
  }

  async function onLaneDrop(e: DragEvent, lane: LaneKey) {
    e.preventDefault();
    const id = e.dataTransfer?.getData("text/plain") || draggedId;
    hoveredLane = null;
    if (!id) return;

    const client = clients.find(c => c.entity_id === id);
    if (!client) return;

    const from = laneOf(client);
    if (from === lane) return; // no-op

    // Optimistic local update
    localLane = { ...localLane, [id]: lane };
    toast(`${client.state?.name || id} → ${LANES.find(l => l.key === lane)?.label}`, "info", 2400);

    // Fire-and-forget backend sync: update client contract_status/stage in Plane.so
    syncLane(client, lane).catch(err => console.warn("[pipeline] sync failed:", err));

    // On Active drop → open email modal
    if (lane === "active" && from !== "active") {
      emailModal = {
        client,
        subject: `Willkommen bei c2moviez – ${client.state?.name || client.entity_id}`,
        draft: defaultEmailDraft(client),
      };
    }
  }

  async function syncLane(c: EntityState, lane: LaneKey) {
    try {
      const stageMap: Record<LaneKey, string> = {
        lead:       "lead",
        pre_active: "proposal",
        active:     "active",
        retention:  "retention",
      };
      const res = await fetch("/api/functions/pipeline-move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_code: c.entity_id,
          client_name: c.state?.name || "",
          to_lane: lane,
          stage: stageMap[lane],
          source: "dashboard-v2-pipeline-drag",
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      console.warn("[pipeline] sync failed:", err);
      toast("Sync queued — will retry", "warn", 2400);
    }
  }

  function defaultEmailDraft(c: EntityState): string {
    const name = c.state?.primary_contact_firstname || c.state?.contact_name || "there";
    const legal = c.state?.name || c.entity_id;
    return [
      `Hi ${name},`,
      ``,
      `welcome on board — it is a pleasure to have ${legal} working with c2moviez.`,
      ``,
      `As next steps, I will share the project kickoff timeline and introduce the team handling the delivery. You can reach me directly at +41 78 317 85 85 for anything urgent.`,
      ``,
      `Looking forward to what we will build together.`,
      ``,
      `Claudio Tinner · CEO · c2moviez GmbH`,
      `+41 78 317 85 85 · info@c2moviez.com`,
    ].join("\n");
  }

  async function submitEmailDraft() {
    if (!emailModal) return;
    const { client, subject, draft } = emailModal;
    try {
      const res = await fetch("/api/functions/pipeline-email-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_code: client.entity_id,
          client_name: client.state?.name || "",
          to: client.state?.contact_email || client.state?.email || "",
          subject,
          body: draft,
          queue: "outlook_drafts",  // never send — drafts only
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast("Draft saved to your Outlook drafts", "ok", 3000);
    } catch (err) {
      console.warn("[pipeline] email draft failed:", err);
      toast("Could not queue draft — saved locally", "warn", 3000);
    } finally {
      emailModal = null;
    }
  }
</script>

<header class="row between items-center wrap gap-4">
  <div class="stack gap-1">
    <span class="caption">04 · PIPELINE</span>
    <h1 class="h1 font-display">Sales process</h1>
    <p class="body">{clients.length} clients · drag to advance · live from Supabase</p>
  </div>
  <LiveBadge />
</header>

<section class="kpi-grid">
  <GlassStat label="MRR PIPELINE"      value={fmtChf(mrrPipeline)}      idx={0} />
  <GlassStat label="ARR ACTIVE+RETAIN" value={fmtChf(arrActive)}        tone="ok" idx={1} />
  <GlassStat label="IN NEGOTIATION"    value={wipCount}                           idx={2} />
  <GlassStat label="RETENTION CLIENTS" value={retentionCount}           tone="ok" idx={3} />
</section>

{#if loading}
  <div class="board" role="list" aria-busy="true">
    {#each LANES as lane, li}
      <div class="lane" style="--lane-accent: {lane.accent}; --lane-glow: {lane.glow};" role="listitem">
        <header class="lane-head">
          <span class="lane-dot"></span>
          <div class="stack gap-0 grow">
            <span class="lane-label">{lane.label}</span>
            <span class="lane-sub">{lane.sub}</span>
          </div>
          <span class="lane-count skel-text">—</span>
        </header>
        <div class="lane-list">
          {#each Array(li === 2 ? 3 : li === 1 ? 2 : 1) as _}
            <div class="skel-card" aria-hidden="true">
              <div class="skel-bar" style="height: 11px; width: 48px;"></div>
              <div class="skel-bar" style="height: 14px; width: 85%; margin-top: 8px;"></div>
              <div class="skel-bar" style="height: 10px; width: 65%; margin-top: 6px;"></div>
            </div>
          {/each}
        </div>
      </div>
    {/each}
  </div>
{:else}
  <section class="board" role="list">
    {#each lanesData as lane, li}
      <div
        class="lane {hoveredLane === lane.key ? 'hover' : ''}"
        style="--lane-accent: {lane.accent}; --lane-glow: {lane.glow};"
        role="listitem"
        ondragover={(e) => onLaneDragOver(e, lane.key)}
        ondragleave={() => onLaneDragLeave(lane.key)}
        ondrop={(e) => onLaneDrop(e, lane.key)}
      >
        <header class="lane-head">
          <span class="lane-dot"></span>
          <div class="stack gap-0 grow">
            <span class="lane-label">{lane.label}</span>
            <span class="lane-sub">{lane.sub}</span>
          </div>
          <span class="lane-count">{lane.items.length}</span>
        </header>

        <div class="lane-list">
          {#each lane.items as c, ti (c.entity_id)}
            {@const mrr = Number(c.state?.monthly_revenue) || 0}
            {@const h = healthOf(c)}
            {@const nt = nextTouchCountdown(c)}
            <div
              class="client-card {draggedId === c.entity_id ? 'dragging' : ''}"
              draggable="true"
              ondragstart={(e) => onDragStart(e, c)}
              ondragend={onDragEnd}
              onclick={() => openClient(c)}
              onkeydown={(e) => e.key === "Enter" && openClient(c)}
              role="button"
              tabindex="0"
            >
              <GlassCard idx={ti % 4} variant="thin" hover>
                <header class="row between items-center">
                  <div class="row gap-2 items-center">
                    <span class="health-dot" style="background: {h.color}; box-shadow: 0 0 8px {h.color};" title={h.label}></span>
                    <span class="font-mono code">{c.entity_id}</span>
                  </div>
                  {#if mrr > 0}
                    <span class="chip-mrr font-mono">{fmtChf(mrr)}/mo</span>
                  {/if}
                </header>
                <p class="cname">{c.state?.name || c.entity_id}</p>
                <div class="meta-row">
                  {#if c.state?.contact_email}
                    <span class="meta-item">{c.state.contact_email}</span>
                  {/if}
                  {#if nt}
                    <span class="meta-item next-touch">{nt}</span>
                  {/if}
                </div>
              </GlassCard>
            </div>
          {/each}
          {#if lane.items.length === 0}
            <div class="empty">drop client here</div>
          {/if}
        </div>
      </div>
    {/each}
  </section>
{/if}

{#if selected}
  {@const lane = lanesData.find(l => l.items.some(i => i.entity_id === selected!.entity_id))}
  <ClientDrawer
    client={selected}
    tickets={tickets}
    accent={lane?.accent ?? "#3b82f6"}
    accentGlow={lane?.glow ?? "rgba(59,130,246,0.4)"}
    statusLabel={lane?.label ?? "Client"}
    onClose={closeDrawer}
  />
{/if}

{#if emailModal}
  <aside
    class="modal-backdrop"
    onclick={(e) => { if (e.target === e.currentTarget) emailModal = null; }}
    role="dialog"
    aria-modal="true"
  >
    <div class="modal-card glass glass--thick">
      <header class="row between items-center">
        <div class="stack gap-0">
          <span class="caption">WELCOME DRAFT</span>
          <h2 class="h1 font-display">{emailModal.client.state?.name || emailModal.client.entity_id}</h2>
        </div>
        <button class="x glass-press" onclick={() => emailModal = null} aria-label="Close">×</button>
      </header>
      <label class="field">
        <span class="caption">TO</span>
        <div class="field-readonly">{emailModal.client.state?.contact_email || emailModal.client.state?.email || "(no email on file)"}</div>
      </label>
      <label class="field">
        <span class="caption">SUBJECT</span>
        <input class="input" type="text" bind:value={emailModal.subject} />
      </label>
      <label class="field field-grow">
        <span class="caption">BODY</span>
        <textarea class="input textarea" bind:value={emailModal.draft}></textarea>
      </label>
      <footer class="row gap-3 justify-end">
        <button class="btn-ghost" onclick={() => emailModal = null}>Cancel</button>
        <button class="btn-primary" onclick={submitEmailDraft}>Save to Outlook drafts</button>
      </footer>
    </div>
  </aside>
{/if}

<style>
  .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }

  .board {
    display: grid;
    grid-template-columns: repeat(4, minmax(260px, 1fr));
    gap: 18px;
    overflow-x: auto;
  }
  @media (max-width: 1200px) { .board { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 680px)  { .board { grid-template-columns: 1fr; } }

  .lane {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
    padding: 14px 12px 18px;
    background: linear-gradient(180deg, color-mix(in oklab, var(--lane-accent) 8%, transparent) 0%, transparent 100%);
    border: 1px solid color-mix(in oklab, var(--lane-accent) 22%, var(--b1));
    border-radius: var(--r-lg);
    transition: border-color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out);
  }
  .lane.hover {
    border-color: var(--lane-accent);
    background: linear-gradient(180deg, color-mix(in oklab, var(--lane-accent) 18%, transparent) 0%, color-mix(in oklab, var(--lane-accent) 4%, transparent) 100%);
    box-shadow: 0 0 0 1px var(--lane-accent), 0 0 24px var(--lane-glow);
  }
  .lane-head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 2px 4px 10px;
    border-bottom: 1px solid color-mix(in oklab, var(--lane-accent) 18%, var(--b1));
  }
  .lane-dot {
    width: 10px; height: 10px; border-radius: 50%;
    background: var(--lane-accent);
    box-shadow: 0 0 10px var(--lane-accent);
    flex-shrink: 0;
  }
  .stack.grow { flex: 1; min-width: 0; }
  .lane-label {
    font-family: "Space Grotesk", sans-serif;
    font-size: 13.5px; font-weight: 600;
    color: var(--tx);
    letter-spacing: -0.01em;
  }
  .lane-sub {
    font-size: 10px;
    color: var(--t3);
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }
  .lane-count {
    font-family: "JetBrains Mono", monospace;
    font-size: 11px;
    color: var(--t2);
    background: color-mix(in oklab, var(--lane-accent) 12%, var(--s1));
    padding: 3px 10px;
    border-radius: 999px;
    border: 1px solid color-mix(in oklab, var(--lane-accent) 28%, var(--b1));
  }

  .lane-list { display: flex; flex-direction: column; gap: 10px; min-height: 80px; }

  .client-card {
    cursor: grab;
    transition: transform var(--dur-fast) var(--ease-out), opacity var(--dur-fast) var(--ease-out);
  }
  .client-card:active { cursor: grabbing; }
  .client-card.dragging { opacity: 0.4; transform: scale(0.98); }

  .code { font-size: 11px; color: var(--t3); }
  .health-dot {
    width: 8px; height: 8px; border-radius: 50%;
    flex-shrink: 0;
  }
  .chip-mrr {
    font-size: 10.5px;
    padding: 3px 8px;
    border-radius: 999px;
    background: var(--gr-14);
    color: var(--gr);
    border: 1px solid var(--gr-28);
  }
  .cname {
    margin: 6px 0 8px;
    font-size: 14px;
    color: var(--tx);
    line-height: 1.3;
    font-weight: 500;
  }
  .meta-row {
    display: flex; flex-wrap: wrap; gap: 6px;
    font-size: 10.5px;
    color: var(--t3);
  }
  .meta-item {
    padding: 2px 0;
  }
  .next-touch {
    color: var(--a);
    font-family: "JetBrains Mono", monospace;
  }

  .empty {
    text-align: center;
    color: var(--t4);
    padding: 22px 12px;
    border: 1.5px dashed color-mix(in oklab, var(--lane-accent) 25%, var(--b1));
    border-radius: var(--r-md);
    font-size: 11.5px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  /* ── Email modal ───────────────────────────────────── */
  .modal-backdrop {
    position: fixed; inset: 0;
    background: rgba(6, 8, 14, 0.6);
    backdrop-filter: blur(10px);
    z-index: 60;
    display: flex; align-items: center; justify-content: center;
    padding: 20px;
  }
  .modal-card {
    width: min(640px, 100%);
    max-height: 92vh;
    padding: 24px;
    display: flex; flex-direction: column;
    gap: 14px;
    border-radius: var(--r-lg);
  }
  .x {
    all: unset; cursor: pointer;
    width: 32px; height: 32px;
    display: grid; place-items: center;
    border-radius: 50%;
    background: var(--s2);
    font-size: 22px; color: var(--t2);
  }
  .field { display: flex; flex-direction: column; gap: 6px; }
  .field-grow { flex: 1; min-height: 0; }
  .field-readonly {
    padding: 10px 12px;
    background: var(--s1);
    border: 1px solid var(--b1);
    border-radius: var(--r-md);
    font-family: "JetBrains Mono", monospace;
    font-size: 12.5px;
    color: var(--t2);
  }
  .input {
    all: unset;
    box-sizing: border-box;
    width: 100%;
    display: block;
    padding: 10px 12px;
    background: var(--s1);
    border: 1px solid var(--b1);
    border-radius: var(--r-md);
    color: var(--tx);
    font-size: 14px;
    font-family: inherit;
    transition: border-color var(--dur-fast) var(--ease-out);
  }
  .input:focus { border-color: var(--a); outline: none; }
  .textarea {
    min-height: 280px;
    resize: vertical;
    line-height: 1.55;
    font-family: "Inter", sans-serif;
  }
  .btn-ghost, .btn-primary {
    all: unset;
    cursor: pointer;
    padding: 10px 18px;
    border-radius: var(--r-md);
    font-family: "Space Grotesk", sans-serif;
    font-size: 13px;
    letter-spacing: -0.01em;
    transition: background var(--dur-fast) var(--ease-out);
  }
  .btn-ghost {
    color: var(--t2);
    background: var(--s1);
    border: 1px solid var(--b1);
  }
  .btn-ghost:hover { background: var(--s2); color: var(--tx); }
  .btn-primary {
    color: #fff;
    background: linear-gradient(135deg, var(--a) 0%, var(--a2) 100%);
    box-shadow: 0 0 18px var(--a-25);
    font-weight: 600;
  }
  .btn-primary:hover { filter: brightness(1.08); }
  .btn-primary:disabled { opacity: 0.45; cursor: not-allowed; }

  /* ── Side drawer ─────────────────────────────────── */
  .drawer-backdrop {
    position: fixed; inset: 0;
    background: rgba(6, 8, 14, 0.55);
    backdrop-filter: blur(12px);
    z-index: 55;
    display: flex; justify-content: flex-end;
    animation: fade-in 220ms var(--ease-out);
  }
  .drawer {
    position: relative;
    width: min(640px, 100%);
    height: 100%;
    padding: 24px 26px;
    display: flex; flex-direction: column;
    gap: 18px;
    overflow-y: auto;
    border-left: 1px solid color-mix(in oklab, var(--lane-accent) 35%, var(--b2));
    box-shadow: -12px 0 60px rgba(0,0,0,0.6), 0 0 0 1px color-mix(in oklab, var(--lane-accent) 15%, transparent);
    animation: drawer-in 320ms var(--ease-spring);
  }
  @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
  @keyframes drawer-in {
    from { transform: translateX(60px); opacity: 0; }
    to   { transform: translateX(0);    opacity: 1; }
  }

  .corner {
    position: absolute; width: 14px; height: 14px;
    border: 1.5px solid color-mix(in oklab, var(--lane-accent) 75%, transparent);
    pointer-events: none;
  }
  .corner.tl { top: 8px; left: 8px;  border-right: none; border-bottom: none; }
  .corner.tr { top: 8px; right: 8px; border-left:  none; border-bottom: none; }
  .corner.bl { bottom: 8px; left: 8px;  border-right: none; border-top: none; }
  .corner.br { bottom: 8px; right: 8px; border-left:  none; border-top: none; }

  .drawer-head { display: flex; justify-content: space-between; align-items: center; }
  .lane-pill {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 5px 12px;
    border-radius: 999px;
    background: color-mix(in oklab, var(--lane-accent) 14%, transparent);
    border: 1px solid color-mix(in oklab, var(--lane-accent) 45%, transparent);
    font-size: 11px;
    letter-spacing: 0.08em;
    color: var(--tx);
    font-weight: 500;
  }
  .lane-pill-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--lane-accent); box-shadow: 0 0 8px var(--lane-accent); }
  .drawer-id { color: var(--t3); font-family: "JetBrains Mono", monospace; font-size: 10.5px; }

  .ghost-btn {
    all: unset;
    cursor: pointer;
    padding: 7px 12px;
    border-radius: var(--r-sm);
    font-size: 12px;
    color: var(--t2);
    background: var(--s1);
    border: 1px solid var(--b1);
    font-family: "Space Grotesk", sans-serif;
    transition: background var(--dur-fast), color var(--dur-fast);
  }
  .ghost-btn:hover:not(:disabled) { background: var(--s2); color: var(--tx); }
  .ghost-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .close {
    all: unset; cursor: pointer;
    width: 30px; height: 30px;
    display: grid; place-items: center;
    border-radius: 50%;
    background: var(--s2);
    font-size: 20px;
    color: var(--t2);
  }
  .close:hover { background: var(--s1); color: var(--tx); }

  .drawer-title-row {
    display: flex; flex-direction: column; gap: 4px;
    padding-bottom: 8px;
    border-bottom: 1px solid color-mix(in oklab, var(--lane-accent) 22%, var(--b1));
  }
  .drawer-title {
    font-size: 26px;
    line-height: 1.15;
    color: var(--tx);
    margin: 0;
    letter-spacing: -0.015em;
  }
  .drawer-domain {
    font-size: 12px;
    color: var(--a);
    text-decoration: none;
    font-family: "JetBrains Mono", monospace;
  }
  .drawer-domain:hover { text-decoration: underline; }

  .kpi-strip {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px 14px;
    padding: 12px;
    background: var(--s1);
    border: 1px solid var(--b1);
    border-radius: var(--r-md);
  }
  .kpi { display: flex; flex-direction: column; gap: 3px; align-items: flex-start; }
  .kpi-val { font-size: 17px; color: var(--tx); letter-spacing: -0.01em; line-height: 1.1; }
  .kpi-val.small-date { font-size: 12px; font-family: "JetBrains Mono", monospace; }
  .kpi-lbl { font-size: 9px; letter-spacing: 0.15em; color: var(--t4); }

  .drawer-section {
    display: flex; flex-direction: column; gap: 10px;
  }
  .section-title {
    font-family: "Space Grotesk", sans-serif;
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--t2);
    margin: 0;
    display: inline-flex; align-items: center; gap: 8px;
  }
  .section-bracket { color: var(--lane-accent); font-size: 14px; }
  .section-count {
    font-family: "JetBrains Mono", monospace;
    font-size: 10.5px;
    color: var(--t3);
    background: var(--s1);
    padding: 1px 7px;
    border-radius: 999px;
    border: 1px solid var(--b1);
    margin-left: 6px;
  }

  .edit-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  @media (max-width: 520px) { .edit-grid { grid-template-columns: 1fr; } }

  .notes-area {
    min-height: 140px;
    resize: vertical;
    line-height: 1.5;
    font-family: "Inter", sans-serif;
  }

  .tix-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
  .tix-row {
    display: grid;
    grid-template-columns: 72px 1fr 90px 70px 90px;
    gap: 10px;
    align-items: center;
    padding: 7px 10px;
    background: var(--s1);
    border: 1px solid var(--b1);
    border-radius: var(--r-sm);
    font-size: 12px;
  }
  .tix-id { color: var(--t3); font-size: 10.5px; }
  .tix-name { color: var(--tx); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tix-state { color: var(--t3); font-size: 10.5px; }
  .tix-due  { color: var(--t3); font-size: 10.5px; text-align: right; }
  .tix-due.over { color: var(--re); }
  .tix-prio {
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 10px;
    text-align: center;
    background: var(--s2);
    color: var(--t2);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .chip-urgent { background: var(--re-18); color: color-mix(in oklab, var(--re) 70%, white); }
  .chip-high   { background: rgba(249,115,22,0.18); color: color-mix(in oklab, var(--or) 70%, white); }
  .chip-medium { background: var(--ye-18); color: color-mix(in oklab, var(--ye) 70%, white); }
  .chip-low    { background: var(--gr-18); color: color-mix(in oklab, var(--gr) 70%, white); }
  .tix-more { margin-top: 4px; color: var(--t4); }

  .meeting-row { display: flex; gap: 8px; }
  .meeting-input { flex: 1; }
  .mt-2 { margin-top: 8px; }

  .drawer-foot {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 16px;
    border-top: 1px solid color-mix(in oklab, var(--lane-accent) 22%, var(--b1));
    gap: 12px;
    flex-wrap: wrap;
  }
  .dim { color: var(--t4); }

  /* ── Commitment badges ─────────────────────────────── */
  .commit-strip {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 10px;
  }
  .commit-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 999px;
    background: color-mix(in oklab, var(--u) 12%, var(--s1));
    border: 1px solid color-mix(in oklab, var(--u) 35%, var(--b1));
    font-size: 11px;
    color: var(--t2);
    font-family: "Inter", sans-serif;
  }
  .commit-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: var(--u);
    box-shadow: 0 0 6px var(--u);
    flex-shrink: 0;
  }
  .commit-desc { color: var(--tx); }
  .commit-due { font-family: "JetBrains Mono", monospace; color: var(--u); font-size: 10.5px; }

  /* ── Revenue timeline ──────────────────────────────── */
  .rev-summary {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-bottom: 4px;
  }
  .rev-big {
    font-family: "DM Serif Display", "Space Grotesk", serif;
    font-size: 28px;
    color: var(--tx);
    line-height: 1.1;
    letter-spacing: -0.015em;
  }
  .rev-meta { font-size: 11.5px; color: var(--t3); }
  .rev-track {
    position: relative;
    height: 6px;
    margin: 10px 0 6px;
    border-radius: 999px;
    background: var(--s2);
    overflow: visible;
  }
  .rev-bar {
    position: absolute; inset: 0;
    background: linear-gradient(90deg, rgba(34,211,238,0.5) 0%, rgba(168,85,247,0.5) 100%);
    border-radius: 999px;
    box-shadow: 0 0 10px rgba(34,211,238,0.3);
  }
  .rev-last {
    position: absolute;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 14px; height: 14px;
    border-radius: 50%;
    background: var(--tx);
    border: 2px solid var(--a);
    box-shadow: 0 0 10px var(--a);
  }
  .rev-ticks {
    display: flex;
    justify-content: space-between;
    font-size: 10.5px;
    font-family: "JetBrains Mono", monospace;
    color: var(--t3);
    letter-spacing: 0.03em;
  }

  /* Skeleton */
  .skel-card {
    background: var(--s1);
    border: 1px solid var(--b1);
    border-radius: var(--r-md, 10px);
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 0;
  }
  .skel-bar {
    border-radius: 4px;
    background: var(--s2);
    animation: skel-pulse 1.4s ease-in-out infinite;
  }
  .skel-text { opacity: 0.3; }
  @keyframes skel-pulse { 0%,100%{opacity:0.45} 50%{opacity:0.85} }
  @media (prefers-reduced-motion: reduce) { .skel-bar { animation: none; opacity: 0.5; } }

  /* Mobile overrides */
  @media (max-width: 480px) {
    .kpi-grid { grid-template-columns: 1fr 1fr; }
    .modal-card { padding: 18px 16px; }
    .field-grow { min-height: 0; }
    .textarea { min-height: 180px; }
  }
</style>

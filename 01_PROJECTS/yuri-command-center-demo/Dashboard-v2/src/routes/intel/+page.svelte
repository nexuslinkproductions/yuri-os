<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { listEntityState, recentAudit, subscribeAuditLog, supabase, hasClient, type AuditRow, type EntityState } from "$lib/db";
  import GlassCard from "$components/GlassCard.svelte";
  import LiveBadge from "$components/LiveBadge.svelte";
  import { toast } from "$components/GlassToast.svelte";

  type Prediction = { client_code: string; likely_ask: string; precomputed: string; confidence?: number };

  let tickets = $state<EntityState[]>([]);
  let clients = $state<EntityState[]>([]);
  let events  = $state<AuditRow[]>([]);
  let predictions = $state<Prediction[]>([]);
  let predictionsAt = $state<string | null>(null);
  let predictionFilter = $state<string>("");
  let dismissed = $state<Set<string>>(new Set());
  let unsub: (() => void) | null = null;
  let loading = $state(true);

  // Action modal state
  let actionModal = $state<null | { kind: "draft" | "ticket"; prediction: Prediction; loading: boolean; resultText?: string; subject?: string; error?: string }>(null);
  let createdTicketRef = $state<string | null>(null);

  onMount(async () => {
    [tickets, clients, events] = await Promise.all([
      listEntityState("ticket", 500),
      listEntityState("client", 200),
      recentAudit(60),
    ]);
    if (hasClient()) {
      try {
        const { data } = await supabase()
          .from("audit_log")
          .select("details, created_at")
          .eq("action", "cto.predictions.v1")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data) {
          predictions = (data.details?.predictions || []) as Prediction[];
          predictionsAt = data.details?.generated_at || data.created_at;
        }
        // Hydrate dismissed set from audit_log (last 7 days)
        const cutoff = new Date(Date.now() - 7 * 86400_000).toISOString();
        const { data: dRows } = await supabase()
          .from("audit_log")
          .select("entity_id, created_at")
          .eq("action", "prediction.dismissed")
          .gte("created_at", cutoff)
          .limit(200);
        if (Array.isArray(dRows)) {
          dismissed = new Set(dRows.map(r => r.entity_id).filter(Boolean));
        }
      } catch { /* anon read — optional */ }
    }
    loading = false;
    unsub = subscribeAuditLog(row => {
      events = [row, ...events].slice(0, 60);
      if (row.action === "cto.predictions.v1") {
        predictions = ((row as any).details?.predictions || []) as Prediction[];
        predictionsAt = (row as any).details?.generated_at || row.created_at;
      }
      if (row.action === "prediction.dismissed" && row.entity_id) {
        const next = new Set(dismissed);
        next.add(row.entity_id);
        dismissed = next;
      }
    });
  });
  onDestroy(() => unsub?.());

  const filteredPredictions = $derived(
    predictions
      .filter(p => !dismissed.has(p.client_code))
      .filter(p => !predictionFilter || p.client_code.toLowerCase().includes(predictionFilter.toLowerCase()))
  );

  function clientName(code: string): string {
    const c = clients.find(c => c.entity_id === code);
    return c?.state?.name || code;
  }

  async function openDraftFor(p: Prediction) {
    actionModal = { kind: "draft", prediction: p, loading: true };
    try {
      const res = await fetch("/api/functions/pipeline-email-draft", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_code: p.client_code,
          client_name: clientName(p.client_code),
          subject: `Follow-up — ${clientName(p.client_code)}`,
          body: `Context (AI suggestion): ${p.likely_ask}\n\nProposed talking points:\n${p.precomputed}\n\n— sent from EXEO Intel`,
          queue: "outlook_drafts",
          kind: "follow_up_predicted",
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const note = data?.note || "Draft queued — appears in Outlook drafts on next sync.";
      actionModal = { kind: "draft", prediction: p, loading: false, resultText: note, subject: `Follow-up — ${clientName(p.client_code)}` };
      toast(`Draft queued for ${p.client_code}`, "ok", 2400);
    } catch (e: any) {
      actionModal = { kind: "draft", prediction: p, loading: false, error: e.message || String(e) };
    }
  }

  async function createTicketFor(p: Prediction) {
    actionModal = { kind: "ticket", prediction: p, loading: true };
    createdTicketRef = null;
    try {
      const res = await fetch("/api/functions/mcp-server", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: "create_ticket",
          input: {
            project: "C2M",
            title: `${p.client_code} — ${p.likely_ask}`.slice(0, 200),
            description: p.precomputed,
            priority: "medium",
            assignee: "CTI",
            due_days: 7,
          },
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const ref = data?.result?.ref || data?.ref;
      createdTicketRef = ref || null;
      actionModal = { kind: "ticket", prediction: p, loading: false, resultText: ref ? `Ticket ${ref} created.` : "Ticket created." };
      toast(ref ? `Ticket ${ref} created` : "Ticket created", "ok", 2400);
    } catch (e: any) {
      actionModal = { kind: "ticket", prediction: p, loading: false, error: e.message || String(e) };
    }
  }

  async function dismissPrediction(p: Prediction) {
    const next = new Set(dismissed);
    next.add(p.client_code);
    dismissed = next;
    toast(`Dismissed ${p.client_code}`, "info", 2000);
    try {
      const res = await fetch("/api/functions/event-dispatch", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "prediction.dismissed",
          entity_type: "client",
          entity_id: p.client_code,
          entity_name: clientName(p.client_code),
          actor: "dashboard-v2-intel",
          details: { likely_ask: p.likely_ask, dismissed_at: new Date().toISOString() },
        }),
      });
      // event-dispatch may require X-Internal-Key — fall back to direct insert via supabase
      if (!res.ok && hasClient()) {
        await supabase().from("audit_log").insert({
          action: "prediction.dismissed",
          entity_type: "client",
          entity_id: p.client_code,
          entity_name: clientName(p.client_code),
          actor: "dashboard-v2-intel",
          details: { likely_ask: p.likely_ask },
        });
      }
    } catch {
      // best-effort — UI already updated
    }
  }

  function closeModal() { actionModal = null; }
  const predictionGeneratedAgo = $derived((() => {
    if (!predictionsAt) return "";
    const h = Math.floor((Date.now() - new Date(predictionsAt).getTime()) / 3_600_000);
    if (h < 1) return "minutes ago";
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  })());

  const overdue = $derived(tickets.filter(t => {
    const due = t.state?.due_date;
    return due && new Date(due) < new Date() && !/done|cancel/i.test(t.state?.state || "");
  }).slice(0, 8));

  const stale = $derived(clients.filter(c => {
    const last = c.state?.last_activity || c.updated_at;
    return last && (Date.now() - new Date(last).getTime()) > 14 * 86400_000;
  }).slice(0, 8));

  const exeoEvents = $derived(events.filter(e => /^exeo\./.test(e.action)).slice(0, 12));

  function ago(iso: string) {
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 60_000)         return "just now";
    if (ms < 3600_000)       return Math.floor(ms / 60_000) + "m ago";
    if (ms < 86400_000)      return Math.floor(ms / 3600_000) + "h ago";
    return Math.floor(ms / 86400_000) + "d ago";
  }
</script>

<header class="row between items-center wrap gap-4">
  <div class="stack gap-1">
    <span class="caption">09 · INTEL</span>
    <h1 class="h1 font-display">Operations intelligence</h1>
    <p class="body">NEX's working memory · what's drifting · what just happened.</p>
    <nav class="intel-subnav">
      <a href="/intel/retrieval" class="sub-link">→ Retrieval quality (ε1)</a>
    </nav>
  </div>
  <LiveBadge />
</header>

<div class="grid">
  <GlassCard idx={0} class="span-2">
    <header class="row between items-center wrap gap-3" id="predictions">
      <div class="stack gap-0">
        <h2 class="h2 font-display">AI next-asks <span class="pred-count">· {predictions.length}</span></h2>
        {#if predictionsAt}
          <span class="caption dim">Generated by CTO overnight pass · {predictionGeneratedAgo}</span>
        {/if}
      </div>
      {#if predictions.length > 3}
        <input
          class="pred-filter"
          type="search"
          placeholder="filter by client code…"
          bind:value={predictionFilter}
        />
      {/if}
    </header>
    {#if loading}
      <div class="pred-list">
        {#each Array(3) as _}
          <div class="pred-row skel-row" aria-hidden="true">
            <div class="skel-line" style="width: 60px; height: 18px;"></div>
            <div class="skel-line" style="width: 90%; height: 14px; margin-top: 4px;"></div>
            <div class="skel-line" style="width: 80%; height: 11px; margin-top: 2px;"></div>
            <div class="skel-line" style="width: 80%; height: 11px; margin-top: 2px;"></div>
          </div>
        {/each}
      </div>
    {:else if predictions.length === 0}
      <p class="body dim">No predictions yet — CTO agent runs nightly at 00:30 CEST.</p>
    {:else}
      {#if filteredPredictions.length === 0}
        <p class="body dim" style="padding: 8px 0;">No predictions match that filter.</p>
      {/if}
      <ul class="pred-list">
        {#each filteredPredictions as p}
          <li class="pred-row">
            <header class="row between items-center pred-head">
              <a class="font-mono pred-code" href={`/clients?open=${p.client_code}`} title={`Open ${p.client_code} drawer`}>{p.client_code}</a>
              <span class="caption dim">{p.confidence ? (Math.round(p.confidence * 100) + "% conf") : "likely"}</span>
            </header>
            <p class="pred-ask">{p.likely_ask}</p>
            <p class="pred-answer">{p.precomputed}</p>
            <div class="pred-actions">
              <button type="button" class="pred-btn primary" onclick={() => openDraftFor(p)}>✉ Draft follow-up</button>
              <button type="button" class="pred-btn secondary" onclick={() => createTicketFor(p)}>＋ Create ticket</button>
              <button type="button" class="pred-btn ghost" onclick={() => dismissPrediction(p)} title="Dismiss prediction">✕ Dismiss</button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </GlassCard>

  <GlassCard idx={1}>
    <header class="row between items-center">
      <h2 class="h2 font-display">Overdue queue</h2>
      <span class="caption">{loading ? "" : overdue.length}</span>
    </header>
    {#if loading}
      <div class="stack gap-2" style="margin-top: 8px;" aria-busy="true">
        {#each Array(4) as _}
          <div class="skel-line" style="height: 32px; border-radius: 6px;"></div>
        {/each}
      </div>
    {:else if overdue.length === 0}
      <p class="body">All on time.</p>
    {:else}
      <ul class="ilist">
        {#each overdue as t}
          {@const days = Math.floor((Date.now() - new Date(t.state?.due_date).getTime()) / 86400_000)}
          <li class="row between items-center">
            <span class="font-mono code">{t.entity_id}</span>
            <span class="grow ellipsis">{t.state?.name || ""}</span>
            <span class="chip {days > 7 ? 'error' : 'warn'}">+{days}d</span>
          </li>
        {/each}
      </ul>
    {/if}
  </GlassCard>

  <GlassCard idx={2}>
    <header class="row between items-center">
      <h2 class="h2 font-display">Stale clients</h2>
      <span class="caption">{loading ? "" : stale.length}</span>
    </header>
    {#if loading}
      <div class="stack gap-2" style="margin-top: 8px;" aria-busy="true">
        {#each Array(4) as _}
          <div class="skel-line" style="height: 32px; border-radius: 6px;"></div>
        {/each}
      </div>
    {:else if stale.length === 0}
      <p class="body">No stale clients.</p>
    {:else}
      <ul class="ilist">
        {#each stale as c}
          {@const days = Math.floor((Date.now() - new Date(c.state?.last_activity || c.updated_at).getTime()) / 86400_000)}
          <li class="row between items-center">
            <span class="font-mono code">{c.entity_id}</span>
            <span class="grow ellipsis">{c.state?.name || c.entity_id}</span>
            <span class="caption">{days}d</span>
          </li>
        {/each}
      </ul>
    {/if}
  </GlassCard>

  <GlassCard idx={3} class="span-2">
    <header class="row between items-center">
      <h2 class="h2 font-display">EXEO recent decisions / audit</h2>
      <span class="caption">{loading ? "" : exeoEvents.length}</span>
    </header>
    {#if loading}
      <div class="stack gap-2" style="margin-top: 8px;" aria-busy="true">
        {#each Array(5) as _}
          <div class="skel-line" style="height: 28px; border-radius: 6px;"></div>
        {/each}
      </div>
    {:else if exeoEvents.length === 0}
      <p class="body">No EXEO activity in window.</p>
    {:else}
      <ul class="ilist event">
        {#each exeoEvents as e}
          <li class="row gap-3 items-center">
            <span class="caption">{ago(e.created_at)}</span>
            <span class="grow">{e.action}</span>
            {#if e.entity_id}<span class="font-mono code">{e.entity_id}</span>{/if}
          </li>
        {/each}
      </ul>
    {/if}
  </GlassCard>
</div>

{#if actionModal}
  <div
    class="modal-backdrop"
    onclick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
    onkeydown={(e) => e.key === "Escape" && closeModal()}
    role="presentation"
  >
    <div class="modal glass glass--thick">
      <header class="row between items-center modal-head">
        <div class="row gap-2 items-center">
          <span class="modal-pill">{actionModal.kind === "draft" ? "FOLLOW-UP DRAFT" : "TICKET CREATED"}</span>
          <span class="font-mono pred-code">{actionModal.prediction.client_code}</span>
        </div>
        <button class="close" onclick={closeModal} aria-label="Close">×</button>
      </header>

      <h3 class="modal-title">{actionModal.prediction.likely_ask}</h3>

      {#if actionModal.loading}
        <div class="modal-loading">
          <span class="spinner"></span>
          <span>{actionModal.kind === "draft" ? "Generating draft…" : "Creating ticket on Plane.so…"}</span>
        </div>
      {:else if actionModal.error}
        <p class="modal-error">Failed: {actionModal.error}</p>
      {:else if actionModal.kind === "draft"}
        <div class="modal-body">
          <p class="caption dim">Subject</p>
          <div class="modal-field">{actionModal.subject}</div>
          <p class="caption dim" style="margin-top: 10px;">Status</p>
          <p class="modal-text">{actionModal.resultText}</p>
          <p class="caption dim" style="margin-top: 10px;">AI talking points</p>
          <p class="modal-text small">{actionModal.prediction.precomputed}</p>
        </div>
      {:else if actionModal.kind === "ticket"}
        <div class="modal-body">
          <p class="modal-text">{actionModal.resultText}</p>
          {#if createdTicketRef}
            <a class="modal-link" href={`https://app.plane.so/c2moviez/browse/${createdTicketRef}/`} target="_blank" rel="noopener">Open {createdTicketRef} on Plane ↗</a>
          {/if}
        </div>
      {/if}

      <footer class="row gap-2 justify-end modal-foot">
        <button class="pred-btn ghost" onclick={closeModal}>Close</button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .intel-subnav { margin-top: 0.25rem; }
  .intel-subnav .sub-link {
    font-size: 0.85rem;
    color: var(--a);
    text-decoration: none;
    opacity: 0.85;
  }
  .intel-subnav .sub-link:hover { opacity: 1; text-decoration: underline; }

  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
  }
  :global(.span-2) { grid-column: span 2; }
  @media (max-width: 920px) {
    .grid { grid-template-columns: 1fr; }
    :global(.span-2) { grid-column: auto; }
  }
  .ilist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
  .ilist li { padding: 8px 12px; border-radius: var(--r-sm); }
  .ilist li:hover { background: var(--s1); }
  .ilist.event li { font-size: 13px; color: var(--t2); }
  .code { font-size: 11px; color: var(--t3); }
  .ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dim { color: var(--t4); }
  .pred-count { color: var(--t3); font-size: 16px; font-weight: 400; }
  .pred-filter {
    all: unset;
    box-sizing: border-box;
    padding: 7px 12px;
    background: var(--s1);
    border: 1px solid var(--b1);
    border-radius: var(--r-sm);
    color: var(--tx);
    font-size: 12px;
    min-width: 200px;
    transition: border-color var(--dur-fast, 150ms);
  }
  .pred-filter:focus { border-color: var(--a); outline: none; }
  .pred-list {
    list-style: none; margin: 12px 0 0; padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 10px;
  }
  .pred-row {
    background: var(--s1);
    border: 1px solid var(--b1);
    border-radius: var(--r-md);
    padding: 12px 14px;
    display: flex; flex-direction: column; gap: 8px;
    transition: background var(--dur-fast), border-color var(--dur-fast), transform var(--dur-fast);
  }
  .pred-row:hover {
    border-color: color-mix(in oklab, var(--a) 40%, var(--b1));
    transform: translateY(-1px);
  }
  .pred-head { padding-bottom: 2px; }
  .pred-code {
    font-size: 10.5px;
    padding: 2px 8px;
    border-radius: 999px;
    background: color-mix(in oklab, var(--a) 16%, transparent);
    color: var(--tx);
    letter-spacing: 0.06em;
    text-decoration: none;
  }
  .pred-code:hover { background: color-mix(in oklab, var(--a) 30%, transparent); }

  .pred-actions {
    display: flex; gap: 6px; flex-wrap: wrap;
    padding-top: 6px;
    border-top: 1px dashed var(--b1);
  }
  .pred-btn {
    all: unset;
    cursor: pointer;
    padding: 6px 12px;
    border-radius: var(--r-sm);
    font-family: "Space Grotesk", sans-serif;
    font-size: 11.5px;
    transition: filter var(--dur-fast), background var(--dur-fast);
  }
  .pred-btn.primary {
    color: #fff;
    background: linear-gradient(135deg, var(--a) 0%, var(--a2) 100%);
    box-shadow: 0 0 12px var(--a-25);
    font-weight: 600;
  }
  .pred-btn.primary:hover { filter: brightness(1.1); }
  .pred-btn.secondary {
    color: var(--tx);
    background: var(--s2);
    border: 1px solid color-mix(in oklab, var(--a) 28%, var(--b1));
  }
  .pred-btn.secondary:hover { background: var(--s1); border-color: var(--a); }
  .pred-btn.ghost {
    color: var(--t3);
    background: transparent;
    border: 1px solid var(--b1);
  }
  .pred-btn.ghost:hover { color: var(--tx); border-color: var(--b2); }

  /* Modal */
  .modal-backdrop {
    position: fixed; inset: 0;
    background: var(--overlay);
    backdrop-filter: blur(10px);
    z-index: 80;
    display: grid; place-items: center;
    padding: 20px;
    animation: fade-in 180ms var(--ease-out);
  }
  @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
  .modal {
    width: min(560px, 100%);
    padding: 22px 24px;
    display: flex; flex-direction: column; gap: 12px;
    border: 1px solid color-mix(in oklab, var(--a) 30%, var(--b2));
    box-shadow: 0 20px 60px rgba(0,0,0,0.6);
    animation: modal-in 240ms var(--ease-spring);
  }
  @keyframes modal-in {
    from { opacity: 0; transform: translateY(8px) scale(0.98); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  .modal-head { padding-bottom: 8px; border-bottom: 1px solid var(--b1); }
  .modal-pill {
    font-size: 10px; letter-spacing: 0.14em;
    padding: 3px 10px; border-radius: 999px;
    background: color-mix(in oklab, var(--a) 14%, transparent);
    border: 1px solid color-mix(in oklab, var(--a) 32%, transparent);
    color: var(--tx); font-weight: 600;
  }
  .close {
    all: unset; cursor: pointer;
    width: 28px; height: 28px;
    display: grid; place-items: center;
    border-radius: 50%;
    background: var(--s2);
    color: var(--t2);
    font-size: 18px;
  }
  .close:hover { background: var(--s1); color: var(--tx); }
  .modal-title {
    margin: 0;
    font-family: "Space Grotesk", sans-serif;
    font-size: 16px;
    color: var(--tx);
    line-height: 1.35;
  }
  .modal-loading {
    display: flex; align-items: center; gap: 10px;
    padding: 14px 0;
    font-size: 13px; color: var(--t2);
  }
  .spinner {
    width: 14px; height: 14px;
    border: 2px solid color-mix(in oklab, var(--a) 30%, transparent);
    border-top-color: var(--a);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .modal-error { color: var(--re); font-size: 13px; margin: 4px 0; }
  .modal-body { display: flex; flex-direction: column; gap: 4px; }
  .modal-field {
    padding: 9px 12px;
    background: var(--s1); border: 1px solid var(--b1); border-radius: var(--r-sm);
    font-family: "JetBrains Mono", monospace;
    font-size: 12px;
    color: var(--tx);
  }
  .modal-text { margin: 0; font-size: 13px; color: var(--t2); line-height: 1.5; }
  .modal-text.small { font-size: 12px; }
  .modal-link {
    display: inline-block; margin-top: 10px;
    font-size: 12px; color: var(--a);
    text-decoration: none;
  }
  .modal-link:hover { text-decoration: underline; }
  .modal-foot { padding-top: 8px; border-top: 1px solid var(--b1); }
  .pred-ask {
    margin: 0;
    font-size: 13px;
    color: var(--tx);
    font-weight: 500;
    line-height: 1.3;
  }
  .pred-answer {
    margin: 0;
    font-size: 11.5px;
    color: var(--t2);
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  /* Skeletons */
  .skel-row {
    pointer-events: none;
  }
  .skel-line {
    background: var(--s2);
    border-radius: 4px;
    animation: skel-pulse 1.4s ease-in-out infinite;
  }
  @keyframes skel-pulse { 0%,100%{opacity:0.45} 50%{opacity:0.85} }
  @media (prefers-reduced-motion: reduce) { .skel-line { animation: none; opacity: 0.5; } }
  /* Mobile grid fix */
  @media (max-width: 480px) {
    .pred-list { grid-template-columns: 1fr; }
    .pred-filter { min-width: 140px; width: 100%; }
  }
</style>

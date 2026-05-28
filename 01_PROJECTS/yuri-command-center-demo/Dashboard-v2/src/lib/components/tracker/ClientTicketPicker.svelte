<script lang="ts">
  /**
   * ClientTicketPicker — the cascade modal that replaces every flat ticket
   * <select> in /tracker (stopwatch start, manual log billable, calendar
   * add-block). Three steps:
   *
   *   1. customer grid — large tiles (client code + display_name + open-ticket
   *      count badge, accent strip with --client-XX colour).
   *   2. ticket grid — open tickets for the chosen client (priority pill,
   *      state pill, last-touched relative time).
   *   3. confirm — billable toggle + optional description preset.
   *
   * Closes on confirm, on Esc, or on backdrop click. The host page wires the
   * onPick callback to tracker.start(...) for the stopwatch flow OR to the
   * manual-log + calendar-add forms for those flows.
   *
   * Re-uses listCustomerMaster + listOpenTickets from lib/supabase. No
   * additional Realtime subscriptions — the picker is opened on-demand and
   * the data is short-lived; live tickets stream into /tracker via the
   * normal subscribeTimeEntries / subscribePlannedBlocks channels.
   */
  import { onMount } from "svelte";
  import {
    listCustomerMaster,
    listOpenTickets,
    type CustomerMaster,
    type EntityState,
  } from "$lib/db";
  import { user } from "$stores/user.svelte";
  import { GlassActionPrimary, GlassActionSecondary, GlassValueChip } from "$lib/components/glass";

  // Synthetic "Internal" client tile for C2I project tickets (T.7.3 follow-up).
  // It's not in customer_master — internal work doesn't have a billable customer.
  // Cast via unknown — only the picker-relevant fields matter at runtime.
  const INTERNAL_CLIENT = {
    client_code: "C2I",
    display_name: "Internal / c2moviez",
    lifecycle: "active",
    lifecycle_group: "customer",
    is_active: true,
    plane_customer_id: null,
  } as unknown as CustomerMaster;

  type PickResult = {
    customer_id: string;
    customer_code: string;
    customer_name: string;
    plane_issue_id: string;
    plane_issue_seq: string;
    ticket_name: string;
    is_billable: boolean;
    description?: string;
    project_code?: string;
  };

  interface Props {
    open: boolean;
    /** Optional default for the billable toggle on step 3 */
    prefilterBillable?: boolean | null;
    /** Optional pre-typed description, useful for "+ Create ticket" handoff */
    initialDescription?: string;
    onPick: (sel: PickResult) => void;
    onClose: () => void;
  }
  const {
    open,
    prefilterBillable = null,
    initialDescription = "",
    onPick,
    onClose,
  }: Props = $props();

  // ── Step state ────────────────────────────────────────────────────
  type Step = 1 | 2 | 3;
  let step = $state<Step>(1);

  let customers = $state<CustomerMaster[]>([]);
  let tickets   = $state<EntityState[]>([]);
  let loading   = $state(false);
  let error     = $state<string | null>(null);
  let search    = $state("");
  let pickedCustomer = $state<CustomerMaster | null>(null);
  let pickedTicket   = $state<EntityState | null>(null);

  let description = $state(initialDescription);
  let isBillable  = $state<boolean>(prefilterBillable ?? true);

  // T.7.3 follow-up — billable is a CEO-only admin setting now.
  // Non-CEO users don't see the toggle; entries auto-set is_billable=true for
  // real clients and is_billable=false for Internal (C2I). Per-client overrides
  // managed via /admin/tracker → Billing rates.
  const canEditBillable = $derived(user.isAdmin);

  // ── Boot — load both lists when the modal first opens ─────────────
  let booted = false;
  $effect(() => {
    if (!open || booted) return;
    booted = true;
    void boot();
  });

  // Reset to step 1 every time it reopens
  $effect(() => {
    if (open) {
      step = 1;
      pickedCustomer = null;
      pickedTicket = null;
      search = "";
      description = initialDescription;
      isBillable = prefilterBillable ?? true;
    }
  });

  // Auto-flip billable=false when an Internal client is picked (C2I has no customer to bill).
  $effect(() => {
    if (pickedCustomer?.client_code === "C2I" && !canEditBillable) {
      isBillable = false;
    }
  });

  async function boot() {
    loading = true;
    error = null;
    try {
      // T.7.3 follow-up — load ALL non-cold clients, then filter to "ongoing":
      //   1. lifecycle_group='customer' (paying, dormant)
      //   2. OR lifecycle_group='sales' AND has at least 1 open ticket
      //   3. Cold outreach + lost are never shown
      const [c, t] = await Promise.all([
        listCustomerMaster(500, { groups: ["customer", "sales"] }),
        listOpenTickets(500),
      ]);
      tickets = t ?? [];
      // Build a set of client display names + plane_customer_ids that
      // have ≥ 1 open ticket — used to include sales-stage clients with
      // ongoing work and to surface their counts.
      const ticketCustomerIds = new Set<string>();
      const ticketCustomerNames = new Set<string>();
      for (const ticket of tickets) {
        const s = (ticket.state as any) ?? {};
        if (s.customer_id) ticketCustomerIds.add(s.customer_id);
        if (s.customer && typeof s.customer === "string") ticketCustomerNames.add(s.customer.toLowerCase());
      }
      const all = (c ?? []).filter(x => x.is_active !== false);
      customers = all.filter(cust => {
        if (cust.lifecycle_group === "customer") return true;
        // Sales-stage: include only if they have an open ticket
        const dname = (cust.display_name || "").toLowerCase();
        return (cust.plane_customer_id && ticketCustomerIds.has(cust.plane_customer_id))
          || ticketCustomerNames.has(dname);
      });
    } catch (e: any) {
      error = e?.message || "failed to load";
    } finally {
      loading = false;
    }
  }

  // ── Derived ───────────────────────────────────────────────────────
  // Match ticket → customer via three paths (entity_state.state shape):
  //   1. The synthetic INTERNAL_CLIENT (client_code='C2I') matches all C2I-project tickets.
  //   2. state.customer_id === customer_master.plane_customer_id (Plane UUID)
  //   3. state.customer === customer_master.display_name (display-name fallback
  //      for tickets imported before plane_customer_id was wired)
  function openTicketCountFor(customer: CustomerMaster): number {
    if (customer.client_code === "C2I") {
      // Internal — count all C2I project tickets
      return tickets.filter(t => ((t.state as any)?.project || "").toUpperCase() === "C2I").length;
    }
    const pcid = customer.plane_customer_id;
    const dname = (customer.display_name || "").toLowerCase();
    let count = 0;
    for (const t of tickets) {
      const s = (t.state as any) ?? {};
      if ((s.project || "").toUpperCase() === "C2I") continue; // internal handled above
      if (pcid && s.customer_id === pcid) { count++; continue; }
      if (s.customer && typeof s.customer === "string"
          && s.customer.toLowerCase() === dname) { count++; continue; }
    }
    return count;
  }

  const visibleCustomers = $derived.by(() => {
    const q = search.trim().toLowerCase();
    // Prepend the synthetic Internal tile (always first), then real customers.
    // Sort real customers by ticket count desc, then alpha.
    let list = [INTERNAL_CLIENT, ...customers.slice().sort((a, b) => {
      const tb = openTicketCountFor(b);
      const ta = openTicketCountFor(a);
      if (tb !== ta) return tb - ta;
      return (a.display_name || "").localeCompare(b.display_name || "");
    })];
    if (q) {
      list = list.filter(c =>
        (c.client_code || "").toLowerCase().includes(q) ||
        (c.display_name || "").toLowerCase().includes(q)
      );
    }
    return list;
  });

  const visibleTickets = $derived.by(() => {
    if (!pickedCustomer) return [];
    const isInternal = pickedCustomer.client_code === "C2I";
    const pcid = pickedCustomer.plane_customer_id;
    const dname = (pickedCustomer.display_name || "").toLowerCase();
    const q = search.trim().toLowerCase();
    let list = tickets.filter(t => {
      const s = (t.state as any) ?? {};
      // Internal — match by Plane project = C2I (no customer linkage on internal tickets)
      if (isInternal) return (s.project || "").toUpperCase() === "C2I";
      // Customer — never include C2I-project tickets (those are internal)
      if ((s.project || "").toUpperCase() === "C2I") return false;
      // Match by Plane customer UUID (preferred) OR by customer display name
      if (pcid && s.customer_id === pcid) return true;
      if (s.customer && typeof s.customer === "string"
          && s.customer.toLowerCase() === dname) return true;
      return false;
    });
    if (q) {
      list = list.filter(t => {
        const s = (t.state as any) ?? {};
        return (s.name || "").toLowerCase().includes(q) ||
               (s.ticketId || "").toLowerCase().includes(q);
      });
    }
    list.sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""));
    return list;
  });

  // ── Step transitions ──────────────────────────────────────────────
  function pickCustomer(c: CustomerMaster) {
    pickedCustomer = c;
    pickedTicket = null;
    search = "";
    step = 2;
  }
  function pickTicket(t: EntityState) {
    pickedTicket = t;
    step = 3;
  }
  function back() {
    if (step === 3) step = 2;
    else if (step === 2) step = 1;
    else onClose();
  }
  function close() { onClose(); }

  async function confirm() {
    if (!pickedCustomer || !pickedTicket) return;
    const s = (pickedTicket.state as any) ?? {};
    onPick({
      customer_id: pickedCustomer.client_code,
      customer_code: pickedCustomer.client_code,
      customer_name: pickedCustomer.display_name,
      plane_issue_id: pickedTicket.entity_id,
      plane_issue_seq: s.ticketId || s.sequence_id || pickedTicket.entity_id,
      ticket_name: s.name || pickedTicket.entity_id,
      is_billable: isBillable,
      description: description.trim() || undefined,
      project_code: s.project_code || undefined,
    });
  }

  function priorityTone(p: string | undefined | null): "danger" | "warn" | "info" | "success" | "neutral" {
    const v = (p || "").toLowerCase();
    if (v === "urgent") return "danger";
    if (v === "high")   return "warn";
    if (v === "medium") return "info";
    if (v === "low")    return "success";
    return "neutral";
  }

  // ── Keyboard handling ─────────────────────────────────────────────
  function handleKey(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === "Escape") { e.preventDefault(); close(); }
  }
</script>

<svelte:window onkeydown={handleKey} />

{#if open}
  <div class="picker" role="dialog" aria-modal="true" aria-label="Pick a ticket to track">
    <div class="picker__backdrop" onclick={close} role="presentation"></div>

    <div class="picker__card" role="document">
      <header class="picker__head">
        <div class="picker__crumbs">
          <button type="button" class="crumb" class:active={step === 1} onclick={() => (step = 1)}>1. Client</button>
          <span class="crumb__sep" aria-hidden="true">→</span>
          <button type="button" class="crumb" class:active={step === 2} disabled={!pickedCustomer} onclick={() => pickedCustomer && (step = 2)}>2. Ticket</button>
          <span class="crumb__sep" aria-hidden="true">→</span>
          <button type="button" class="crumb" class:active={step === 3} disabled={!pickedTicket} onclick={() => pickedTicket && (step = 3)}>3. Confirm</button>
        </div>

        <button type="button" class="picker__close" aria-label="Close" onclick={close}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </header>

      {#if step !== 3}
        <div class="picker__search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input
            type="text"
            placeholder={step === 1 ? "Search clients (code or name)…" : "Search tickets…"}
            bind:value={search}
            autofocus
          />
        </div>
      {/if}

      <div class="picker__body">
        {#if loading && customers.length === 0}
          <div class="picker__loading">Loading clients and tickets…</div>
        {:else if error}
          <div class="picker__error">⚠ {error}</div>
        {:else if step === 1}
          <div class="grid">
            {#each visibleCustomers as c (c.client_code)}
              {@const count = openTicketCountFor(c)}
              {@const isInternal = c.client_code === "C2I"}
              <button
                type="button"
                class="tile"
                class:tile--internal={isInternal}
                onclick={() => pickCustomer(c)}
                style={`--tile-accent: ${isInternal ? "var(--a2)" : `var(--client-${c.client_code}, var(--brand))`};`}
              >
                <span class="tile__bar" aria-hidden="true"></span>
                <div class="tile__body">
                  <div class="tile__code">{isInternal ? "⌂ INTERNAL" : c.client_code}</div>
                  <div class="tile__name">{c.display_name}</div>
                </div>
                <div class="tile__meta">
                  <GlassValueChip tone={isInternal ? "violet" : count > 0 ? "info" : "neutral"} size="sm" static>
                    {#snippet children()}{count} open{/snippet}
                  </GlassValueChip>
                </div>
              </button>
            {/each}
            {#if visibleCustomers.length === 0}
              <div class="empty">No clients match "{search}".</div>
            {/if}
          </div>
        {:else if step === 2 && pickedCustomer}
          <div class="ticket-list">
            {#each visibleTickets as t (t.entity_id)}
              {@const s = (t.state as any) ?? {}}
              <button type="button" class="ticket" onclick={() => pickTicket(t)}>
                <div class="ticket__id">{s.ticketId || s.sequence_id || t.entity_id.slice(0, 8)}</div>
                <div class="ticket__title">{s.name || t.entity_id}</div>
                <div class="ticket__meta">
                  <GlassValueChip tone={priorityTone(s.priority)} size="sm" static>
                    {#snippet children()}{s.priority || "none"}{/snippet}
                  </GlassValueChip>
                  {#if s.state || s.state_name}
                    <GlassValueChip tone="neutral" size="sm" static>
                      {#snippet children()}{s.state || s.state_name}{/snippet}
                    </GlassValueChip>
                  {/if}
                </div>
              </button>
            {/each}
            {#if visibleTickets.length === 0}
              <div class="empty">
                No open tickets for {pickedCustomer.display_name} match{search ? ` "${search}"` : ""}.
                <br><span class="empty__hint">You can still log time manually + create a ticket on the fly.</span>
              </div>
            {/if}
          </div>
        {:else if step === 3 && pickedCustomer && pickedTicket}
          {@const s = (pickedTicket.state as any) ?? {}}
          <div class="confirm">
            <div class="confirm__head">
              <div class="confirm__ticket-id">{s.ticketId || pickedTicket.entity_id.slice(0, 8)}</div>
              <div class="confirm__ticket-name">{s.name || pickedTicket.entity_id}</div>
              <div class="confirm__client">
                <GlassValueChip size="sm" static accent={`var(--client-${pickedCustomer!.client_code}, var(--brand))`}>
                  {#snippet children()}{pickedCustomer!.client_code} · {pickedCustomer!.display_name}{/snippet}
                </GlassValueChip>
              </div>
            </div>

            <label class="confirm__field">
              <span class="confirm__label">Description (optional)</span>
              <textarea
                bind:value={description}
                placeholder="What are you working on? (visible in your time log + Plane worklog)"
                rows="2"
              ></textarea>
            </label>

            {#if canEditBillable}
              <label class="confirm__toggle">
                <input type="checkbox" bind:checked={isBillable} />
                <span>Billable</span>
                <span class="confirm__toggle-hint">CEO-only override · default per-client billable status set in <code>/admin/tracker → Billing rates</code></span>
              </label>
            {:else if pickedCustomer?.client_code === "C2I"}
              <div class="confirm__billable-info">
                <GlassValueChip tone="neutral" size="sm" static>
                  {#snippet children()}non-billable · internal{/snippet}
                </GlassValueChip>
                <span class="confirm__toggle-hint">Internal work is non-billable by default. CEO can override.</span>
              </div>
            {:else}
              <div class="confirm__billable-info">
                <GlassValueChip tone="success" size="sm" static>
                  {#snippet children()}billable{/snippet}
                </GlassValueChip>
                <span class="confirm__toggle-hint">Rate auto-resolved per <code>/admin/tracker → Billing rates</code>.</span>
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <footer class="picker__foot">
        <GlassActionSecondary onclick={back}>
          {#snippet children()}{step === 1 ? "Cancel" : "← Back"}{/snippet}
        </GlassActionSecondary>
        {#if step === 3}
          <GlassActionPrimary onclick={confirm}>
            {#snippet children()}Start tracking{/snippet}
          </GlassActionPrimary>
        {/if}
      </footer>
    </div>
  </div>
{/if}

<style>
  .picker {
    position: fixed; inset: 0;
    z-index: var(--z-modal, 1000);
    display: grid; place-items: center;
    padding: 20px;
  }
  .picker__backdrop {
    position: absolute; inset: 0;
    background: rgba(8, 11, 20, 0.55);
    backdrop-filter: blur(10px) saturate(1.2);
    -webkit-backdrop-filter: blur(10px) saturate(1.2);
  }
  .picker__card {
    position: relative;
    width: min(720px, 100%);
    max-height: 88vh;
    display: flex; flex-direction: column;
    border-radius: var(--r3, 22px);
    background: var(--glass-elev);
    backdrop-filter: var(--blur-elev);
    -webkit-backdrop-filter: var(--blur-elev);
    border: 1px solid var(--brand-line);
    box-shadow: var(--sh-elev), 0 0 80px -20px rgba(86,188,236,0.40);
    font-family: var(--sa);
    overflow: hidden;
    animation: picker-pop 220ms var(--tier-spring, cubic-bezier(.34,1.56,.64,1)) both;
  }
  @keyframes picker-pop {
    from { opacity: 0; transform: translateY(8px) scale(.98); }
    to   { opacity: 1; transform: translateY(0)   scale(1); }
  }

  /* Header — crumbs + close */
  .picker__head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 20px 12px;
    border-bottom: 1px solid var(--line);
  }
  .picker__crumbs { display: flex; align-items: center; gap: 8px; }
  .crumb {
    appearance: none; border: 0; padding: 4px 10px;
    background: transparent; color: var(--t3); cursor: pointer;
    font: 600 11px/1.2 var(--sa); letter-spacing: 0.04em; text-transform: uppercase;
    border-radius: 6px;
    transition: color 140ms, background 140ms;
  }
  .crumb.active { color: var(--brand-deep); background: var(--brand-soft); }
  .crumb:disabled { opacity: 0.45; cursor: not-allowed; }
  .crumb__sep { color: var(--t4); font-size: 12px; }

  .picker__close {
    appearance: none; border: 1px solid var(--line);
    width: 32px; height: 32px; border-radius: 8px;
    background: var(--s1); color: var(--t2); cursor: pointer;
    display: grid; place-items: center;
    transition: all 120ms;
  }
  .picker__close:hover { background: var(--s2); color: var(--tx); border-color: var(--line-2); }

  /* Search bar */
  .picker__search {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 20px;
    border-bottom: 1px solid var(--line);
    color: var(--t3);
  }
  .picker__search input {
    flex: 1;
    appearance: none; border: 0; background: transparent;
    color: var(--tx);
    font: 500 14px/1.4 var(--sa);
    outline: none;
  }
  .picker__search input::placeholder { color: var(--t3); }

  /* Body — scroll container */
  .picker__body {
    flex: 1; min-height: 0; overflow: auto;
    padding: 16px 20px;
  }
  .picker__loading, .picker__error, .empty {
    padding: 32px 16px; text-align: center;
    color: var(--t3); font: 500 13px/1.5 var(--sa);
  }
  .picker__error { color: var(--re); }
  .empty__hint { display: block; margin-top: 6px; color: var(--t4); font-size: 12px; }

  /* Step 1 — customer grid */
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 8px;
  }
  .tile {
    appearance: none; border: 1px solid var(--line);
    background: var(--s1); color: var(--tx);
    border-radius: var(--r1, 12px);
    padding: 10px 12px;
    cursor: pointer;
    display: grid; grid-template-columns: 4px 1fr auto; gap: 10px;
    align-items: center; text-align: left;
    transition: all 140ms var(--ease);
    overflow: hidden;
  }
  .tile:hover { background: var(--s2); border-color: var(--brand-line); transform: translateY(-1px); }
  .tile--internal {
    background: linear-gradient(135deg, var(--chip-tint-violet) 0%, var(--s1) 100%);
    border-color: rgba(107,79,216,0.32);
  }
  .tile--internal:hover { border-color: var(--a2); }
  .tile__bar { background: var(--tile-accent); align-self: stretch; }
  .tile__body { min-width: 0; }
  .tile__code { font: 700 12px/1 var(--mo); color: var(--brand-deep); letter-spacing: 0.04em; }
  .tile__name { font: 600 13px/1.3 var(--sa); color: var(--tx); margin-top: 2px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* Step 2 — ticket list */
  .ticket-list { display: flex; flex-direction: column; gap: 6px; }
  .ticket {
    appearance: none; border: 1px solid var(--line);
    background: var(--s1); color: var(--tx);
    border-radius: var(--r1, 12px);
    padding: 12px 14px;
    cursor: pointer; text-align: left;
    display: grid; grid-template-columns: 80px 1fr auto; gap: 12px;
    align-items: center;
    transition: all 140ms;
  }
  .ticket:hover { background: var(--s2); border-color: var(--brand-line); }
  .ticket__id { font: 700 11px/1 var(--mo); color: var(--brand-deep); letter-spacing: 0.02em; }
  .ticket__title { font: 600 13.5px/1.3 var(--sa); color: var(--tx);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ticket__meta { display: inline-flex; gap: 6px; align-items: center; }

  /* Step 3 — confirm */
  .confirm { display: flex; flex-direction: column; gap: 16px; }
  .confirm__head {
    padding: 14px 16px;
    border-radius: var(--r1);
    background: var(--brand-softer);
    border: 1px solid var(--brand-line);
  }
  .confirm__ticket-id { font: 700 11px/1 var(--mo); color: var(--brand-deep); letter-spacing: 0.04em; }
  .confirm__ticket-name { font: 700 16px/1.3 var(--sa); color: var(--tx); margin: 4px 0 8px; }
  .confirm__client { display: inline-flex; }
  .confirm__field { display: flex; flex-direction: column; gap: 4px; }
  .confirm__label { font: 600 11px/1.2 var(--sa); text-transform: uppercase; letter-spacing: 0.06em; color: var(--t3); }
  .confirm__field textarea {
    appearance: none; border: 1px solid var(--line);
    background: var(--s1); color: var(--tx);
    border-radius: 8px;
    padding: 10px 12px;
    font: 500 13.5px/1.4 var(--sa);
    resize: vertical; min-height: 64px;
    transition: border-color 140ms, background 140ms;
  }
  .confirm__field textarea:focus {
    outline: none;
    background: var(--canvas-2, var(--bg));
    border-color: var(--brand);
    box-shadow: 0 0 0 3px var(--brand-line-2);
  }
  .confirm__toggle {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 12px;
    border-radius: 8px;
    background: var(--s1);
    cursor: pointer;
  }
  .confirm__toggle input { width: 18px; height: 18px; accent-color: var(--brand); }
  .confirm__toggle-hint { margin-left: auto; color: var(--t3); font: 500 11.5px/1.2 var(--sa); }
  .confirm__toggle-hint code {
    font-family: var(--mo); background: var(--s2); padding: 1px 5px; border-radius: 4px; color: var(--t2);
  }
  .confirm__billable-info {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 12px;
    background: var(--s1); border-radius: 8px;
    border: 1px dashed var(--line-2);
  }
  .confirm__billable-info code {
    font-family: var(--mo); background: var(--s2); padding: 1px 5px; border-radius: 4px;
  }

  /* Footer */
  .picker__foot {
    display: flex; justify-content: space-between; align-items: center;
    gap: 8px;
    padding: 14px 20px;
    border-top: 1px solid var(--line);
  }

  /* Mobile parity */
  @media (max-width: 640px) {
    .picker { padding: 0; }
    .picker__card { max-height: 100vh; height: 100vh; border-radius: 0; width: 100%; }
    .grid { grid-template-columns: 1fr 1fr; }
    .ticket { grid-template-columns: 60px 1fr; }
    .ticket__meta { grid-column: 1 / -1; }
  }
</style>

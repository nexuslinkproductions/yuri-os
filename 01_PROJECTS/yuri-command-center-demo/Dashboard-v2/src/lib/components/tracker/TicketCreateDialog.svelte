<script lang="ts">
  /**
   * TicketCreateDialog — data-hygiene-enforcing modal that creates a Plane
   * ticket on the fly from the manual-log "+ Create ticket" flow.
   *
   * Hard-required (submit disabled until present):
   *   client (cascade picker, drives project_code), name, priority,
   *   start_date, due_date, assignee_codes, module_names, cycle_name,
   *   description, estimated_hours (appended to description suffix).
   *
   * Reuses ClientTicketPicker for the client selection (step-1 only — close
   * after a customer is picked, ignore the ticket step).
   *
   * Posts to /api/functions/tracker-ticket-create. Calls onCreated()
   * with the new issue's id + ref so the host (ManualLogForm) can attach
   * the time entry to it.
   */
  import { onMount } from "svelte";
  import { postAuthed, listCustomerMaster, type CustomerMaster } from "$lib/db";
  import { GlassActionPrimary, GlassActionSecondary, GlassValueChip } from "$lib/components/glass";
  import { toast } from "$components/GlassToast.svelte";

  type Created = {
    issue_id: string;
    sequence_id: number;
    ref: string;
    url: string;
  };

  interface Props {
    open: boolean;
    /** Optional preset values from the manual-log form */
    initial?: {
      name?: string;
      description?: string;
      client_code?: string;
    };
    onCreated: (c: Created & { name: string; client_code: string }) => void;
    onClose: () => void;
  }
  const { open, initial = {}, onCreated, onClose }: Props = $props();

  // ── Form state ────────────────────────────────────────────────────
  let customers = $state<CustomerMaster[]>([]);
  let loadingClients = $state(false);

  // Hygiene fields
  let name        = $state(initial.name || "");
  let clientCode  = $state(initial.client_code || "");
  let priority    = $state<"urgent"|"high"|"medium"|"low"|"none">("medium");
  let startDate   = $state(new Date().toISOString().slice(0, 10));
  let dueDate     = $state("");
  let assigneeCode= $state("CTI");  // default — CEO; CRM-defaults auto-routes some
  let moduleNamesRaw = $state<string>("");   // CSV → array on submit
  let cycleName   = $state(currentQuarter());
  let description = $state(initial.description || "");
  let estimatedHr = $state<number | "">("");
  let projectCode = $state<"C2M"|"MFB"|"C2I"|"MACL">("C2M");

  let submitting = $state(false);

  // Canonical module options (matches chat.js prompt)
  const MODULE_OPTIONS = [
    "Videography", "Photography", "Social Media", "Marketing",
    "IT & Web", "Design", "Consulting", "Process Management",
  ];

  function currentQuarter(): string {
    const d = new Date();
    const q = Math.ceil((d.getMonth() + 1) / 3);
    return `Q${q}-${d.getFullYear()}`;
  }

  // ── Boot ──────────────────────────────────────────────────────────
  let booted = false;
  $effect(() => {
    if (!open || booted) return;
    booted = true;
    void loadClients();
  });

  $effect(() => {
    // Reset to a clean slate on each open
    if (open) {
      name = initial.name || "";
      clientCode = initial.client_code || "";
      description = initial.description || "";
      priority = "medium";
      startDate = new Date().toISOString().slice(0, 10);
      dueDate = "";
      assigneeCode = "CTI";
      moduleNamesRaw = "";
      cycleName = currentQuarter();
      estimatedHr = "";
      projectCode = "C2M";
    }
  });

  async function loadClients() {
    loadingClients = true;
    try {
      // T.7.3 follow-up — only active clients in the picker (lifecycle_group='customer').
      // Cold-outreach leads can't have tickets created against them. When a
      // lead converts to active, they appear here automatically.
      customers = (await listCustomerMaster(500, { groups: ["customer"] }))
        .filter(x => x.is_active !== false);
    } catch (e: any) {
      toast(e?.message || "Could not load clients", "error");
    } finally {
      loadingClients = false;
    }
  }

  const moduleNames = $derived(
    moduleNamesRaw.split(/[,;]+/).map(s => s.trim()).filter(Boolean)
  );

  const valid = $derived(
    name.trim().length >= 3 &&
    clientCode.trim().length >= 2 &&
    !!startDate &&
    !!dueDate &&
    moduleNames.length >= 1 &&
    cycleName.trim().length >= 2 &&
    description.trim().length >= 5
  );

  async function submit() {
    if (!valid) {
      toast("Fill every field before submitting (data-hygiene rule)", "warn");
      return;
    }
    submitting = true;
    try {
      const r = await postAuthed("/api/functions/tracker-ticket-create", {
        project_code: projectCode,
        name: name.trim(),
        priority,
        start_date: startDate,
        due_date: dueDate,
        module_names: moduleNames,
        cycle_name: cycleName.trim(),
        customer_code: clientCode.trim().toUpperCase(),
        description_html: `<p>${escapeHtml(description.trim())}</p>`,
        estimated_hours: Number.isFinite(Number(estimatedHr)) ? Number(estimatedHr) : undefined,
      });
      if (r?.ok && r.ref) {
        toast(`✅ ${r.ref} created`, "ok");
        onCreated({
          issue_id: r.issue_id,
          sequence_id: r.sequence_id,
          ref: r.ref,
          url: r.url,
          name: name.trim(),
          client_code: clientCode.trim().toUpperCase(),
        });
      } else {
        toast(r?.error || "Ticket create failed", "error");
      }
    } catch (e: any) {
      toast(e?.message || "Ticket create failed", "error");
    } finally {
      submitting = false;
    }
  }

  function escapeHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function handleKey(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
  }
</script>

<svelte:window onkeydown={handleKey} />

{#if open}
  <div class="dlg" role="dialog" aria-modal="true" aria-label="Create ticket from manual log">
    <div class="dlg__backdrop" onclick={onClose} role="presentation"></div>

    <div class="dlg__card" role="document">
      <header class="dlg__head">
        <div>
          <span class="dlg__eyebrow">Create ticket</span>
          <h3>From manual log entry</h3>
          <p class="dlg__sub">All fields required (ticket-hygiene rule). The new ticket gets attached to your time entry on save.</p>
        </div>
        <button type="button" class="dlg__close" aria-label="Close" onclick={onClose}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </header>

      <div class="dlg__body">
        <div class="grid">
          <label class="full">
            <span>Ticket name</span>
            <input type="text" bind:value={name} placeholder="e.g. SHI - Q3 launch video reel — first cut" />
          </label>

          <label>
            <span>Client code</span>
            <input type="text" bind:value={clientCode} placeholder="SHI" list="dlg-clients" />
            {#if customers.length}
              <datalist id="dlg-clients">
                {#each customers as c}<option value={c.client_code}>{c.display_name}</option>{/each}
              </datalist>
            {/if}
          </label>

          <label>
            <span>Project</span>
            <select bind:value={projectCode}>
              <option value="C2M">C2M (Customers)</option>
              <option value="MFB">MFB (Med For Balance)</option>
              <option value="C2I">C2I (Internal)</option>
              <option value="MACL">MACL</option>
            </select>
          </label>

          <label>
            <span>Priority</span>
            <select bind:value={priority}>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
              <option value="none">None</option>
            </select>
          </label>

          <label>
            <span>Assignee code</span>
            <input type="text" bind:value={assigneeCode} placeholder="CTI" />
          </label>

          <label>
            <span>Start date</span>
            <input type="date" bind:value={startDate} />
          </label>

          <label>
            <span>Due date</span>
            <input type="date" bind:value={dueDate} />
          </label>

          <label>
            <span>Cycle (current quarter)</span>
            <input type="text" bind:value={cycleName} placeholder="Q2-2026" />
          </label>

          <label class="full">
            <span>Module(s) — comma separated</span>
            <input type="text" bind:value={moduleNamesRaw} placeholder="Videography, Marketing" list="dlg-modules" />
            <datalist id="dlg-modules">
              {#each MODULE_OPTIONS as m}<option value={m}></option>{/each}
            </datalist>
          </label>

          <label class="full">
            <span>Description</span>
            <textarea bind:value={description} rows="3" placeholder="Brief: what's the work, what's the success criteria?"></textarea>
          </label>

          <label>
            <span>Estimated hours</span>
            <input type="number" min="0" step="0.25" bind:value={estimatedHr} placeholder="e.g. 1.5" />
          </label>
        </div>

        <div class="hygiene-flag" class:hygiene-flag--ready={valid}>
          {#if valid}
            ✅ All fields present — ready to create
          {:else}
            ⚠ Fill every field before submit (no labels, no missing assignee/module/cycle/customer)
          {/if}
        </div>
      </div>

      <footer class="dlg__foot">
        <GlassActionSecondary onclick={onClose}>{#snippet children()}Cancel{/snippet}</GlassActionSecondary>
        <GlassActionPrimary
          onclick={submit}
          loading={submitting}
          disabled={!valid || submitting}
        >
          {#snippet children()}Create ticket{/snippet}
        </GlassActionPrimary>
      </footer>
    </div>
  </div>
{/if}

<style>
  .dlg {
    position: fixed; inset: 0;
    z-index: var(--z-modal, 1000);
    display: grid; place-items: center;
    padding: 20px;
  }
  .dlg__backdrop {
    position: absolute; inset: 0;
    background: rgba(8, 11, 20, 0.55);
    backdrop-filter: blur(10px) saturate(1.2);
    -webkit-backdrop-filter: blur(10px) saturate(1.2);
  }
  .dlg__card {
    position: relative;
    width: min(680px, 100%);
    max-height: 90vh;
    display: flex; flex-direction: column;
    border-radius: var(--r3, 22px);
    background: var(--glass-elev);
    backdrop-filter: var(--blur-elev);
    -webkit-backdrop-filter: var(--blur-elev);
    border: 1px solid var(--brand-line);
    box-shadow: var(--sh-elev);
    overflow: hidden;
    animation: dlg-pop 220ms var(--tier-spring, cubic-bezier(.34,1.56,.64,1)) both;
    font-family: var(--sa);
    color: var(--tx);
  }
  @keyframes dlg-pop {
    from { opacity: 0; transform: translateY(8px) scale(.98); }
    to   { opacity: 1; transform: translateY(0)   scale(1); }
  }

  .dlg__head {
    display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
    padding: 18px 22px 14px;
    border-bottom: 1px solid var(--line);
  }
  .dlg__eyebrow {
    font: 700 11px/1.3 var(--sa);
    letter-spacing: 0.10em;
    text-transform: uppercase;
    color: var(--brand-deep);
  }
  .dlg__head h3 {
    margin: 4px 0 4px;
    font: 700 18px/1.3 var(--hd, var(--sa));
    letter-spacing: -0.01em;
  }
  .dlg__sub { margin: 0; font: 500 12.5px/1.4 var(--sa); color: var(--t2); max-width: 480px; }
  .dlg__close {
    appearance: none; border: 1px solid var(--line);
    width: 32px; height: 32px; border-radius: 8px;
    background: var(--s1); color: var(--t2); cursor: pointer;
    display: grid; place-items: center;
    flex-shrink: 0;
  }
  .dlg__close:hover { background: var(--s2); color: var(--tx); }

  .dlg__body {
    flex: 1; min-height: 0; overflow: auto;
    padding: 16px 22px;
  }

  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .grid label { display: flex; flex-direction: column; gap: 4px; }
  .grid label.full { grid-column: 1 / -1; }
  .grid label > span {
    font: 600 11px/1.2 var(--sa);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--t3);
  }
  .grid input, .grid select, .grid textarea {
    appearance: none;
    padding: 9px 11px;
    font: 500 13.5px/1.4 var(--sa);
    color: var(--tx);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: 8px;
    outline: none;
    resize: vertical;
  }
  .grid input:focus, .grid select:focus, .grid textarea:focus {
    border-color: var(--brand);
    background: var(--canvas-2, var(--bg));
    box-shadow: 0 0 0 3px var(--brand-line-2);
  }

  .hygiene-flag {
    margin-top: 14px;
    padding: 10px 14px;
    border-radius: 8px;
    background: var(--chip-tint-warn);
    color: var(--or);
    font: 500 12.5px/1.4 var(--sa);
    border: 1px solid rgba(217,119,0,0.22);
  }
  .hygiene-flag--ready {
    background: var(--chip-tint-success);
    color: var(--gr);
    border-color: rgba(30,160,51,0.22);
  }

  .dlg__foot {
    display: flex; justify-content: space-between; align-items: center;
    gap: 8px;
    padding: 14px 22px;
    border-top: 1px solid var(--line);
  }

  @media (max-width: 640px) {
    .dlg { padding: 0; }
    .dlg__card { max-height: 100vh; height: 100vh; border-radius: 0; width: 100%; }
    .grid { grid-template-columns: 1fr; }
  }
</style>

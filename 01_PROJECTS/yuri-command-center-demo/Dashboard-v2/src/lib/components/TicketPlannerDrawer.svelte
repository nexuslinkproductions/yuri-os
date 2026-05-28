<script lang="ts">
  /**
   * TicketPlannerDrawer.svelte
   *
   * Full-featured planning drawer that slides in from the right when a Focus
   * ticket is clicked. Lets the operator:
   *   - Review ticket info (client, priority, due, assignee, notes)
   *   - Pick a duration (15min - 8h slider with snap points)
   *   - Pick a slot in a compact Mon-Sun week view (08:00-20:00 / 30min grid)
   *   - Accept NEX's smart slot suggestion (priority + deadline aware)
   *   - "Plan it" -> POST to /api/functions/calendar-schedule-event +
   *     mark ticket in_progress (optimistic UI)
   *   - "Can't do it?" -> reassign to CTI/FK with reason (Telegram nudge)
   *
   * Glassmorphism: rgba(6,9,15,0.95) + blur(20px), left border in #56bcec.
   * Slides via transform translateX. Click overlay to close.
   *
   * Last-used duration per priority level persists in localStorage.
   */

  import { onMount, onDestroy } from "svelte";
  import { postAuthed } from "$lib/db";

  // -- Types (mirror focus FocusItem) ----------------------------
  export type FocusStatus = "open" | "in_progress" | "done" | "not_done";
  export type SourceType = "ticket" | "client" | "meeting" | "finance";
  export type FocusTicket = {
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
    estHours: number;
    trackedHours: number;
    slot: string;
    status: FocusStatus;
    rescheduleCount: number;
    notDoneReason: string;
    mrr?: number;
    isAdmin?: boolean;
    suggestedReschedule?: string;
    suggestedSlot?: string;
    description?: string;
  };

  type ExistingBlock = {
    dateISO: string;        // YYYY-MM-DD
    startMin: number;       // minutes since 00:00
    endMin: number;
    title: string;
    client?: string;
  };

  interface Props {
    ticket: FocusTicket | null;
    existingBlocks?: ExistingBlock[];      // schedule context from focus page
    onClose: () => void;
    onPlanned?: (payload: {
      ticketId: string;
      dateISO: string;
      startHHMM: string;
      durationMin: number;
    }) => void;
  }

  let { ticket, existingBlocks = [], onClose, onPlanned }: Props = $props();

  // -- State -----------------------------------------------------
  let durationMin = $state(60);
  let selectedDayISO = $state("");
  let selectedSlot = $state("");           // "HH:MM"
  let dayExpanded = $state("");            // which day column is showing slots
  let cantDoOpen = $state(false);
  let reassignTo = $state<"CTI" | "FK">("FK");
  let reassignReason = $state("");
  let submitting = $state(false);
  let submitError = $state("");
  let planSuccess = $state<{ calCreated: boolean; slot: string; date: string } | null>(null);
  let visible = $state(false);             // for slide-in animation

  // -- Lifecycle -------------------------------------------------
  onMount(() => {
    // Trigger slide-in on next frame
    requestAnimationFrame(() => { visible = true; });

    if (ticket) {
      // Restore last-used duration for this priority level
      const stored = readStoredDuration(ticket.priority || "none");
      durationMin = stored ?? defaultDurationFor(ticket);

      // Apply smart suggestion as initial selection
      const sug = suggestedSlot();
      selectedDayISO = sug.dateISO;
      selectedSlot = sug.startHHMM;
      dayExpanded = sug.dateISO;
    }

    document.addEventListener("keydown", onKey);
  });

  onDestroy(() => {
    document.removeEventListener("keydown", onKey);
  });

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape" && !submitting) handleClose();
  }

  function handleClose() {
    visible = false;
    // Allow slide-out transition to play before unmount.
    setTimeout(() => onClose(), 300);
  }

  // -- Constants / helpers ---------------------------------------
  const DUR_SNAPS = [15, 30, 60, 120, 180, 240, 360, 480];
  const DUR_LABELS = ["15m", "30m", "1h", "2h", "3h", "4h", "6h", "8h"];

  function fmtDuration(min: number): string {
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  }

  function defaultDurationFor(t: FocusTicket): number {
    if (t.estHours > 0) return Math.max(15, Math.round(t.estHours * 60));
    const p = (t.priority || "").toLowerCase();
    if (p === "urgent") return 90;
    if (p === "high") return 60;
    return 60;
  }

  function readStoredDuration(prio: string): number | null {
    if (typeof window === "undefined") return null;
    try {
      const v = localStorage.getItem(`planner:last-duration:${prio}`);
      const n = v ? parseInt(v, 10) : NaN;
      return Number.isFinite(n) && n > 0 ? n : null;
    } catch { return null; }
  }
  function storeDuration(prio: string, min: number) {
    if (typeof window === "undefined") return;
    try { localStorage.setItem(`planner:last-duration:${prio}`, String(min)); } catch { /* */ }
  }

  // -- Week grid -------------------------------------------------
  function todayISO(): string {
    return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Zurich" });
  }

  const weekDays = $derived.by(() => {
    const todayStr = todayISO();
    const todayD = new Date(todayStr + "T12:00:00Z");
    const dow = todayD.getUTCDay() || 7; // 1=Mon … 7=Sun
    // On Fri/Sat/Sun there's nothing left to plan in the current week →
    // jump straight to NEXT Mon-Sun so the user can plan ahead.
    const monday = new Date(todayD);
    if (dow >= 5) {
      monday.setUTCDate(todayD.getUTCDate() + (8 - dow)); // next Monday
    } else {
      monday.setUTCDate(todayD.getUTCDate() - (dow - 1)); // this Monday
    }
    const days: { iso: string; label: string; dayNum: string; isToday: boolean; isPast: boolean }[] = [];
    const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setUTCDate(monday.getUTCDate() + i);
      const iso = d.toISOString().slice(0, 10);
      days.push({
        iso,
        label: labels[i],
        dayNum: String(d.getUTCDate()),
        isToday: iso === todayStr,
        isPast: iso < todayStr,
      });
    }
    return days;
  });

  // 30-min grid 08:00 - 20:00
  const SLOTS_PER_DAY: string[] = (() => {
    const out: string[] = [];
    for (let h = 8; h < 20; h++) {
      for (const m of [0, 30]) {
        out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
      }
    }
    return out;
  })();

  function toMin(hhmm: string): number {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + (m || 0);
  }

  function busyOn(dayISO: string): Array<[number, number]> {
    return existingBlocks
      .filter((b) => b.dateISO === dayISO)
      .map((b) => [b.startMin, b.endMin] as [number, number])
      .sort((a, b) => a[0] - b[0]);
  }

  function isSlotBusy(dayISO: string, hhmm: string, durMin: number): boolean {
    const start = toMin(hhmm);
    const end = start + durMin;
    for (const [a, b] of busyOn(dayISO)) {
      if (start < b && end > a) return true;
    }
    return false;
  }

  function blocksForDay(dayISO: string): ExistingBlock[] {
    return existingBlocks.filter((b) => b.dateISO === dayISO);
  }

  // -- Smart suggestion -----------------------------------------
  type Suggestion = { dateISO: string; startHHMM: string; rationale: string };

  function suggestedSlot(): Suggestion {
    if (!ticket) return { dateISO: todayISO(), startHHMM: "09:00", rationale: "" };

    const prio = (ticket.priority || "").toLowerCase();
    const today = todayISO();

    // Deadline pressure: if due within 3 days, suggest today.
    let dateISO = today;
    if (ticket.due) {
      const due = new Date(ticket.due + "T00:00:00Z").getTime();
      const todayMs = new Date(today + "T00:00:00Z").getTime();
      const daysOut = Math.round((due - todayMs) / 86400000);
      if (daysOut < 0) dateISO = today;                 // overdue -> today
      else if (daysOut <= 2) dateISO = today;           // tight -> today
      else if (daysOut <= 5) {
        // Comfortably in week -> tomorrow if a weekday, else next Monday
        const d = new Date(today + "T12:00:00Z");
        d.setUTCDate(d.getUTCDate() + 1);
        while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
        dateISO = d.toISOString().slice(0, 10);
      } else {
        dateISO = today;
      }
    }

    // Time-of-day: priority -> morning; medium/admin -> afternoon
    let preferred = "09:00";
    if (prio === "urgent" || prio === "high") preferred = "09:00";
    else if (ticket.isAdmin) preferred = "15:00";
    else preferred = "14:00";

    // Walk forward in 30m steps until we find a non-busy slot
    let probe = toMin(preferred);
    const max = toMin("19:30");
    while (probe <= max && isSlotBusy(dateISO, fmtMin(probe), durationMin)) {
      probe += 30;
    }
    if (probe > max) probe = toMin(preferred);

    let rationale = "";
    if (prio === "urgent") rationale = "urgent priority + morning energy";
    else if (prio === "high") rationale = "high priority + morning focus";
    else if (ticket.isAdmin) rationale = "admin work in afternoon block";
    else rationale = "comfortable afternoon slot";

    if (ticket.due) {
      const due = new Date(ticket.due + "T00:00:00Z").getTime();
      const todayMs = new Date(today + "T00:00:00Z").getTime();
      const daysOut = Math.round((due - todayMs) / 86400000);
      if (daysOut < 0) rationale = `overdue by ${Math.abs(daysOut)}d - schedule today`;
      else if (daysOut === 0) rationale = "due today";
      else if (daysOut <= 2) rationale = `due in ${daysOut}d - schedule today`;
    }

    return { dateISO, startHHMM: fmtMin(probe), rationale };
  }

  function fmtMin(m: number): string {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }

  const smartSuggestion = $derived(suggestedSlot());

  function applySuggestion() {
    selectedDayISO = smartSuggestion.dateISO;
    selectedSlot = smartSuggestion.startHHMM;
    dayExpanded = smartSuggestion.dateISO;
  }

  // -- Due date label -------------------------------------------
  function dueLabel(t: FocusTicket | null): { text: string; tone: "red" | "yellow" | "grey" } {
    if (!t || !t.due) return { text: "No due date", tone: "grey" };
    const today = todayISO();
    const due = new Date(t.due + "T00:00:00Z").getTime();
    const todayMs = new Date(today + "T00:00:00Z").getTime();
    const days = Math.round((due - todayMs) / 86400000);
    if (days < 0) return { text: `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"}`, tone: "red" };
    if (days === 0) return { text: "Due today", tone: "yellow" };
    if (days === 1) return { text: "Due tomorrow", tone: "yellow" };
    if (days <= 3) return { text: `Due in ${days} days`, tone: "yellow" };
    return { text: `Due in ${days} days`, tone: "grey" };
  }

  // -- Client badge color (hash-based) --------------------------
  function clientHue(code: string): number {
    if (!code) return 200;
    let h = 0;
    for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) % 360;
    return h;
  }

  // -- Actions --------------------------------------------------
  async function planIt() {
    if (!ticket || !selectedDayISO || !selectedSlot) return;
    submitting = true;
    submitError = "";
    planSuccess = null;

    storeDuration(ticket.priority || "none", durationMin);

    const startMin = toMin(selectedSlot);
    const endMin = startMin + durationMin;
    const startISO = `${selectedDayISO}T${selectedSlot}:00`;
    const endHHMM = fmtMin(endMin);
    const endISO = `${selectedDayISO}T${endHHMM}:00`;

    // Detect assignee from ticket
    const isFK = (() => {
      const n = (ticket.assigneeName || "").toLowerCase();
      const e = (ticket.assigneeEmail || "").toLowerCase();
      return e === "fanny@c2moviez.com" || ["fanny", "fk", "kecskes"].some(k => n.includes(k));
    })();

    // Optimistic local state update (parent marks in_progress + sets slot)
    try {
      onPlanned?.({ ticketId: ticket.id, dateISO: selectedDayISO, startHHMM: selectedSlot, durationMin });
    } catch { /* non-fatal */ }

    // Push to MS Graph calendar
    let calCreated = false;
    try {
      const res = await postAuthed("/api/functions/calendar-schedule-event", {
        subject: `${ticket.client ? `[${ticket.client}] ` : ""}${ticket.title}`,
        start: startISO,
        end: endISO,
        client_code: ticket.client || "",
        source: "focus-planner-drawer",
        assignee: isFK ? "fk" : "cti",
      });
      calCreated = res?.created === true;
    } catch { /* calendar push failed — local state already updated */ }

    submitting = false;
    planSuccess = {
      calCreated,
      slot: `${selectedSlot}–${endHHMM}`,
      date: selectedDayISO,
    };

    // Auto-close after brief confirmation flash
    setTimeout(() => handleClose(), 2200);
  }

  async function submitReassign() {
    if (!ticket || !reassignReason.trim()) return;
    submitting = true;
    submitError = "";
    try {
      await postAuthed("/api/functions/dispatch-event", {
        type: "focus.ticket.reassign_request",
        ticket_id: ticket.id,
        to: reassignTo,
        reason: reassignReason.trim(),
        from_ticket_title: ticket.title,
      }).catch(() => null);
      // Whether dispatch worked or not, drop the modal - the local "not done"
      // state in focus page can take it from here.
      handleClose();
    } catch (err) {
      submitError = err instanceof Error ? err.message : String(err);
    } finally {
      submitting = false;
    }
  }

  function setDuration(min: number) {
    durationMin = Math.max(15, Math.min(480, Math.round(min / 15) * 15));
  }

  function pickSlot(dayISO: string, hhmm: string) {
    if (isSlotBusy(dayISO, hhmm, durationMin)) return;
    selectedDayISO = dayISO;
    selectedSlot = hhmm;
  }

  function toggleDay(dayISO: string) {
    dayExpanded = dayExpanded === dayISO ? "" : dayISO;
  }
</script>

{#if ticket}
  <div
    class="planner-overlay"
    class:visible
    onclick={handleClose}
    onkeydown={(e) => { if (e.key === "Escape") handleClose(); }}
    role="button"
    tabindex="-1"
    aria-label="Close planner"
  ></div>

  <aside
    class="planner-drawer"
    class:visible
    role="dialog"
    aria-modal="true"
    aria-labelledby="planner-title"
  >
    <button type="button" class="close-btn" onclick={handleClose} aria-label="Close planner">
      <span aria-hidden="true">×</span>
    </button>

    <!-- ===== Header ===== -->
    <header class="head">
      <div class="head-meta">
        {#if ticket.client}
          <span
            class="client-chip"
            style="--c-hue: {clientHue(ticket.client)};"
          >{ticket.client}</span>
        {/if}
        {#if ticket.priority && ticket.priority !== "none"}
          <span class="prio-dot prio-dot--{ticket.priority}" title="Priority: {ticket.priority}">
            <span class="prio-dot-inner"></span>
            <span class="prio-dot-text">{ticket.priority}</span>
          </span>
        {/if}
        {#if ticket.assigneeName}
          <span class="assignee-chip">{ticket.assigneeName}</span>
        {/if}
      </div>

      <h2 id="planner-title" class="head-title">{ticket.title}</h2>

      {#if ticket.description}
        <p class="head-desc">{ticket.description}</p>
      {/if}

      <div class="head-due">
        {#if ticket.due}
          {@const lbl = dueLabel(ticket)}
          <span class="due-pill due-pill--{lbl.tone}">{lbl.text}</span>
          <span class="due-date">{ticket.due}</span>
        {:else}
          <span class="due-pill due-pill--grey">No due date</span>
        {/if}
      </div>
    </header>

    <!-- ===== Body ===== -->
    <div class="body">
      <!-- Duration picker -->
      <section class="block">
        <h3 class="block-h">How long will this take?</h3>
        <div class="dur-value">{fmtDuration(durationMin)}</div>
        <input
          class="dur-slider"
          type="range"
          min="15"
          max="480"
          step="15"
          bind:value={durationMin}
          aria-label="Duration in minutes"
        />
        <div class="dur-snaps">
          {#each DUR_SNAPS as snap, i (snap)}
            <button
              type="button"
              class="dur-snap"
              class:is-active={durationMin === snap}
              onclick={() => setDuration(snap)}
            >{DUR_LABELS[i]}</button>
          {/each}
        </div>
      </section>

      <!-- Smart suggestion chip -->
      <button type="button" class="smart-chip" onclick={applySuggestion}>
        <span class="smart-icon">→</span>
        <span class="smart-text">
          Suggested: {weekDays.find(d => d.iso === smartSuggestion.dateISO)?.label || ""} {smartSuggestion.startHHMM}
          {#if smartSuggestion.rationale} <span class="smart-why">- {smartSuggestion.rationale}</span>{/if}
        </span>
        <span class="smart-apply">Apply</span>
      </button>

      <!-- Calendar slot picker -->
      <section class="block">
        <h3 class="block-h">Pick a slot</h3>
        <div class="week">
          {#each weekDays as day (day.iso)}
            {@const bls = blocksForDay(day.iso)}
            {@const isSelected = selectedDayISO === day.iso}
            <button
              type="button"
              class="week-day"
              class:is-today={day.isToday}
              class:is-past={day.isPast}
              class:is-selected={isSelected}
              class:is-expanded={dayExpanded === day.iso}
              onclick={() => toggleDay(day.iso)}
            >
              <span class="wd-label">{day.label}</span>
              <span class="wd-num">{day.dayNum}</span>
              <div class="wd-blocks">
                {#each bls.slice(0, 3) as b, idx (idx)}
                  <span class="wd-block" title={b.title}>{b.title.slice(0, 14)}</span>
                {/each}
                {#if bls.length > 3}
                  <span class="wd-more">+{bls.length - 3}</span>
                {/if}
                {#if bls.length === 0 && !day.isPast}
                  <span class="wd-free">free</span>
                {/if}
              </div>
              {#if isSelected && selectedSlot}
                <span class="wd-picked">{selectedSlot}</span>
              {/if}
            </button>
          {/each}
        </div>

        {#if dayExpanded}
          <div class="slots-grid" aria-label="Time slots">
            {#each SLOTS_PER_DAY as hhmm (hhmm)}
              {@const busy = isSlotBusy(dayExpanded, hhmm, durationMin)}
              {@const picked = selectedDayISO === dayExpanded && selectedSlot === hhmm}
              <button
                type="button"
                class="slot"
                class:is-busy={busy}
                class:is-picked={picked}
                disabled={busy}
                onclick={() => pickSlot(dayExpanded, hhmm)}
                title={busy ? "Busy" : `Schedule at ${hhmm}`}
              >{hhmm}</button>
            {/each}
          </div>
        {/if}
      </section>

      {#if cantDoOpen}
        <section class="cant-do">
          <h3 class="block-h">Reassign this ticket</h3>
          <div class="cant-row">
            <label class="cant-lbl">Propose to</label>
            <div class="who-toggle">
              <button
                type="button"
                class="who-btn"
                class:is-active={reassignTo === "CTI"}
                onclick={() => (reassignTo = "CTI")}
              >Claudio</button>
              <button
                type="button"
                class="who-btn"
                class:is-active={reassignTo === "FK"}
                onclick={() => (reassignTo = "FK")}
              >Fanny</button>
            </div>
          </div>
          <textarea
            class="cant-reason"
            placeholder="Why can't you do this? (1-2 lines)"
            bind:value={reassignReason}
            rows="3"
          ></textarea>
          <div class="cant-actions">
            <button
              type="button"
              class="g-btn g-btn--primary"
              onclick={submitReassign}
              disabled={submitting || !reassignReason.trim()}
            >
              {submitting ? "Sending..." : `Propose to ${reassignTo === "CTI" ? "Claudio" : "Fanny"}`}
            </button>
            <button
              type="button"
              class="g-btn g-btn--ghost"
              onclick={() => (cantDoOpen = false)}
              disabled={submitting}
            >Cancel</button>
          </div>
        </section>
      {/if}

      {#if submitError}
        <div class="err-note">Note: {submitError}</div>
      {/if}
    </div>

    <!-- ===== Footer ===== -->
    {#if planSuccess}
      <footer class="foot foot--success">
        <div class="plan-success">
          <span class="plan-success-icon">✓</span>
          <div class="plan-success-body">
            <span class="plan-success-title">Planned — {planSuccess.slot}</span>
            <span class="plan-success-sub">
              {planSuccess.calCreated ? "Calendar event created in Outlook" : "Scheduled locally — syncing to Outlook"}
              · Status set to In Progress
            </span>
          </div>
        </div>
      </footer>
    {:else}
      <footer class="foot">
        <button
          type="button"
          class="g-btn g-btn--ghost"
          onclick={() => (cantDoOpen = !cantDoOpen)}
          disabled={submitting}
        >
          Can't do it?
        </button>
        <button
          type="button"
          class="g-btn g-btn--primary g-btn--lg"
          onclick={planIt}
          disabled={submitting || !selectedDayISO || !selectedSlot}
        >
          {submitting ? "Planning..." : "Plan it →"}
        </button>
      </footer>
    {/if}
  </aside>
{/if}

<style>
  /* ===== Overlay + drawer ===== */
  .planner-overlay {
    position: fixed;
    inset: 0;
    background: rgba(2, 6, 12, 0.55);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    opacity: 0;
    transition: opacity 0.28s ease;
    z-index: 80;
    cursor: pointer;
  }
  .planner-overlay.visible { opacity: 1; }

  .planner-drawer {
    position: fixed;
    top: 0;
    right: 0;
    height: 100vh;
    width: 40%;
    min-width: 460px;
    max-width: 640px;
    background: rgba(6, 9, 15, 0.95);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-left: 1px solid rgba(86, 188, 236, 0.2);
    box-shadow:
      -24px 0 64px -16px rgba(0, 0, 0, 0.7),
      -1px 0 0 0 rgba(124, 58, 237, 0.18);
    color: #e8edf4;
    z-index: 90;
    display: flex;
    flex-direction: column;
    transform: translateX(100%);
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    overflow: hidden;
  }
  .planner-drawer.visible { transform: translateX(0); }

  .close-btn {
    position: absolute;
    top: 14px;
    right: 14px;
    width: 36px;
    height: 36px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.04);
    color: #b6c1d2;
    font: 300 22px/1 "Inter", sans-serif;
    cursor: pointer;
    transition: background 0.16s ease, color 0.16s ease, border-color 0.16s ease;
    z-index: 2;
  }
  .close-btn:hover {
    background: rgba(86, 188, 236, 0.14);
    color: #fff;
    border-color: rgba(86, 188, 236, 0.5);
  }

  /* ===== Header ===== */
  .head {
    padding: 26px 28px 18px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    background:
      radial-gradient(ellipse at top right, rgba(124, 58, 237, 0.08), transparent 60%),
      radial-gradient(ellipse at top left, rgba(86, 188, 236, 0.08), transparent 60%);
  }
  .head-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 12px;
  }
  .client-chip {
    font: 700 10.5px/1 "JetBrains Mono", ui-monospace, monospace;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    padding: 5px 10px;
    border-radius: 999px;
    color: hsl(var(--c-hue), 70%, 78%);
    background: hsl(var(--c-hue), 60%, 30%, 0.22);
    border: 1px solid hsl(var(--c-hue), 60%, 50%, 0.45);
  }
  .prio-dot {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 9px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    font: 600 10px/1 "JetBrains Mono", monospace;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #b6c1d2;
  }
  .prio-dot-inner {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #6b7280;
    box-shadow: 0 0 6px rgba(0, 0, 0, 0.4);
  }
  .prio-dot--urgent { color: #ff6b6b; border-color: rgba(239, 68, 68, 0.45); }
  .prio-dot--urgent .prio-dot-inner { background: #ef4444; box-shadow: 0 0 8px rgba(239, 68, 68, 0.7); }
  .prio-dot--high { color: #f5a55a; border-color: rgba(249, 115, 22, 0.45); }
  .prio-dot--high .prio-dot-inner { background: #f97316; box-shadow: 0 0 8px rgba(249, 115, 22, 0.6); }
  .prio-dot--medium { color: #facc15; border-color: rgba(234, 179, 8, 0.4); }
  .prio-dot--medium .prio-dot-inner { background: #eab308; }
  .prio-dot--low { color: #94a3b8; }
  .prio-dot--low .prio-dot-inner { background: #94a3b8; }
  .assignee-chip {
    font: 500 11px/1 "JetBrains Mono", monospace;
    color: #9ba8c0;
    padding: 4px 9px;
    border-radius: 999px;
    border: 1px solid rgba(123, 92, 255, 0.32);
    background: rgba(123, 92, 255, 0.08);
  }

  .head-title {
    margin: 0 0 10px;
    font: 700 22px/1.25 "Space Grotesk", "Inter", sans-serif;
    color: #fff;
    letter-spacing: -0.01em;
    padding-right: 44px;       /* leave space for close button */
  }

  .head-desc {
    margin: 0 0 12px;
    font: 400 13.5px/1.5 "Inter", sans-serif;
    color: #c2cbdc;
    max-height: 80px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .head-due {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .due-pill {
    font: 600 11px/1 "JetBrains Mono", monospace;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 5px 10px;
    border-radius: 999px;
    border: 1px solid;
  }
  .due-pill--red {
    color: #ff8585;
    border-color: rgba(239, 68, 68, 0.5);
    background: rgba(239, 68, 68, 0.1);
  }
  .due-pill--yellow {
    color: #f5d04d;
    border-color: rgba(234, 179, 8, 0.5);
    background: rgba(234, 179, 8, 0.1);
  }
  .due-pill--grey {
    color: #94a3b8;
    border-color: rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.04);
  }
  .due-date {
    font: 500 12px/1 "JetBrains Mono", monospace;
    color: #94a3b8;
  }

  /* ===== Body ===== */
  .body {
    flex: 1;
    padding: 20px 28px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 22px;
  }
  .body::-webkit-scrollbar { width: 6px; }
  .body::-webkit-scrollbar-thumb {
    background: rgba(86, 188, 236, 0.25);
    border-radius: 999px;
  }

  .block { display: flex; flex-direction: column; gap: 10px; }
  .block-h {
    margin: 0;
    font: 600 12px/1 "JetBrains Mono", monospace;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #8ea0bc;
  }

  /* Duration */
  .dur-value {
    font: 700 30px/1 "Space Grotesk", sans-serif;
    color: #fff;
    letter-spacing: -0.02em;
    text-shadow: 0 0 24px rgba(86, 188, 236, 0.3);
  }
  .dur-slider {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 6px;
    border-radius: 999px;
    background: linear-gradient(90deg,
      rgba(86, 188, 236, 0.45) 0%,
      rgba(86, 188, 236, 0.45) calc((var(--p, 0) ) * 100%),
      rgba(255, 255, 255, 0.08) calc((var(--p, 0) ) * 100%));
    cursor: pointer;
    outline: none;
  }
  .dur-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #56bcec;
    border: 2px solid #fff;
    box-shadow: 0 0 0 4px rgba(86, 188, 236, 0.25), 0 4px 10px rgba(0, 0, 0, 0.5);
    cursor: grab;
  }
  .dur-slider::-moz-range-thumb {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #56bcec;
    border: 2px solid #fff;
    box-shadow: 0 0 0 4px rgba(86, 188, 236, 0.25);
    cursor: grab;
  }
  .dur-snaps {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 6px;
  }
  .dur-snap {
    appearance: none;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.03);
    color: #94a3b8;
    font: 600 10.5px/1 "JetBrains Mono", monospace;
    padding: 7px 0;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .dur-snap:hover {
    color: #fff;
    border-color: rgba(86, 188, 236, 0.4);
    background: rgba(86, 188, 236, 0.08);
  }
  .dur-snap.is-active {
    color: #fff;
    background: rgba(86, 188, 236, 0.18);
    border-color: rgba(86, 188, 236, 0.55);
    box-shadow: 0 0 0 2px rgba(86, 188, 236, 0.12);
  }

  /* Smart suggestion */
  .smart-chip {
    appearance: none;
    border: 1px solid rgba(86, 188, 236, 0.35);
    background:
      linear-gradient(135deg, rgba(86, 188, 236, 0.1), rgba(124, 58, 237, 0.08));
    color: #cde9f8;
    padding: 11px 14px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    transition: border-color 0.18s ease, background 0.18s ease;
    text-align: left;
  }
  .smart-chip:hover {
    border-color: rgba(86, 188, 236, 0.7);
    background:
      linear-gradient(135deg, rgba(86, 188, 236, 0.16), rgba(124, 58, 237, 0.12));
  }
  .smart-icon {
    font: 700 14px/1 "Space Grotesk", sans-serif;
    color: #56bcec;
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    border-radius: 6px;
    background: rgba(86, 188, 236, 0.2);
  }
  .smart-text {
    flex: 1;
    font: 500 12.5px/1.4 "Inter", sans-serif;
    font-style: italic;
    color: #b8d8ee;
  }
  .smart-why { color: #8ea0bc; font-style: normal; font-size: 11.5px; }
  .smart-apply {
    font: 700 10px/1 "JetBrains Mono", monospace;
    letter-spacing: 0.1em;
    color: #56bcec;
    padding: 4px 9px;
    border-radius: 999px;
    background: rgba(86, 188, 236, 0.18);
  }

  /* Week grid */
  .week {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 6px;
  }
  .week-day {
    appearance: none;
    border: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(255, 255, 255, 0.03);
    color: #b6c1d2;
    padding: 8px 6px;
    border-radius: 10px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    min-height: 88px;
    transition: all 0.16s ease;
    position: relative;
  }
  .week-day:hover {
    border-color: rgba(86, 188, 236, 0.4);
    background: rgba(86, 188, 236, 0.06);
  }
  .week-day.is-today {
    border-color: rgba(86, 188, 236, 0.5);
    background: rgba(86, 188, 236, 0.07);
  }
  .week-day.is-past {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .week-day.is-selected {
    border-color: rgba(86, 188, 236, 0.85);
    background: rgba(86, 188, 236, 0.16);
    box-shadow: 0 0 0 2px rgba(86, 188, 236, 0.2);
  }
  .week-day.is-expanded {
    box-shadow: 0 0 0 2px rgba(86, 188, 236, 0.35);
  }
  .wd-label {
    font: 700 10px/1 "JetBrains Mono", monospace;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #8ea0bc;
  }
  .wd-num {
    font: 700 17px/1 "Space Grotesk", sans-serif;
    color: #fff;
  }
  .wd-blocks {
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 100%;
    align-items: stretch;
  }
  .wd-block {
    font: 500 9px/1.2 "JetBrains Mono", monospace;
    color: #c2cbdc;
    padding: 2px 4px;
    border-radius: 4px;
    background: rgba(123, 92, 255, 0.15);
    border-left: 2px solid rgba(123, 92, 255, 0.6);
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .wd-more {
    font: 500 9px/1 "JetBrains Mono", monospace;
    color: #6b7280;
    text-align: center;
  }
  .wd-free {
    font: 500 9.5px/1 "JetBrains Mono", monospace;
    color: #4ade80;
    font-style: italic;
  }
  .wd-picked {
    position: absolute;
    bottom: 4px;
    font: 700 9.5px/1 "JetBrains Mono", monospace;
    color: #56bcec;
    background: rgba(6, 9, 15, 0.9);
    padding: 2px 6px;
    border-radius: 999px;
    border: 1px solid rgba(86, 188, 236, 0.6);
  }

  /* Slots grid */
  .slots-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 5px;
    padding: 12px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(0, 0, 0, 0.2);
  }
  .slot {
    appearance: none;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.03);
    color: #b6c1d2;
    font: 600 11px/1 "JetBrains Mono", monospace;
    padding: 8px 0;
    border-radius: 7px;
    cursor: pointer;
    transition: all 0.14s ease;
  }
  .slot:hover:not(:disabled) {
    color: #fff;
    border-color: rgba(86, 188, 236, 0.5);
    background: rgba(86, 188, 236, 0.1);
  }
  .slot.is-busy, .slot:disabled {
    color: #4b5563;
    background: rgba(255, 255, 255, 0.02);
    border-color: rgba(255, 255, 255, 0.04);
    cursor: not-allowed;
    text-decoration: line-through;
  }
  .slot.is-picked {
    color: #fff;
    background: rgba(86, 188, 236, 0.25);
    border-color: rgba(86, 188, 236, 0.8);
    box-shadow: 0 0 0 2px rgba(86, 188, 236, 0.2), 0 4px 14px rgba(86, 188, 236, 0.25);
  }

  /* Cant-do */
  .cant-do {
    padding: 14px 16px;
    border-radius: 12px;
    border: 1px solid rgba(249, 115, 22, 0.3);
    background: rgba(249, 115, 22, 0.06);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .cant-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .cant-lbl {
    font: 600 11px/1 "JetBrains Mono", monospace;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #f5a55a;
  }
  .who-toggle {
    display: inline-flex;
    padding: 3px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(0, 0, 0, 0.25);
  }
  .who-btn {
    appearance: none;
    background: transparent;
    border: 0;
    color: #94a3b8;
    padding: 6px 12px;
    border-radius: 999px;
    font: 600 11px/1 "JetBrains Mono", monospace;
    letter-spacing: 0.08em;
    cursor: pointer;
    transition: color 0.14s ease, background 0.14s ease;
  }
  .who-btn:hover { color: #fff; }
  .who-btn.is-active { background: rgba(86, 188, 236, 0.25); color: #fff; }
  .cant-reason {
    width: 100%;
    box-sizing: border-box;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    color: #fff;
    font: 400 13px/1.5 "Inter", sans-serif;
    padding: 10px 12px;
    resize: vertical;
    min-height: 60px;
  }
  .cant-reason:focus {
    outline: none;
    border-color: rgba(86, 188, 236, 0.6);
    box-shadow: 0 0 0 3px rgba(86, 188, 236, 0.15);
  }
  .cant-actions { display: flex; gap: 8px; justify-content: flex-end; }

  .err-note {
    font: 400 12px/1.5 "Inter", sans-serif;
    color: #f5a55a;
    padding: 8px 12px;
    border-radius: 8px;
    background: rgba(249, 115, 22, 0.08);
    border: 1px solid rgba(249, 115, 22, 0.25);
  }

  /* Footer */
  .foot {
    padding: 16px 28px 22px;
    display: flex;
    gap: 10px;
    justify-content: space-between;
    align-items: center;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    background: linear-gradient(180deg, rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.3));
  }
  .foot--success {
    background: linear-gradient(180deg, rgba(26, 166, 99, 0.05), rgba(26, 166, 99, 0.12));
    border-top-color: rgba(26, 166, 99, 0.3);
  }
  .plan-success {
    display: flex;
    align-items: center;
    gap: 14px;
    width: 100%;
    padding: 4px 0;
  }
  .plan-success-icon {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: rgba(26, 166, 99, 0.15);
    border: 1px solid rgba(26, 166, 99, 0.5);
    color: #1aa663;
    display: grid;
    place-items: center;
    font: 700 18px/1 "Inter", sans-serif;
    flex-shrink: 0;
  }
  .plan-success-body {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .plan-success-title {
    font: 700 14px/1.2 "Space Grotesk", sans-serif;
    color: #1aa663;
    letter-spacing: -0.01em;
  }
  .plan-success-sub {
    font-size: 11.5px;
    color: rgba(26, 166, 99, 0.7);
    font-style: italic;
  }

  /* Buttons */
  .g-btn {
    appearance: none;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.04);
    color: #d8dee9;
    padding: 9px 16px;
    border-radius: 10px;
    font: 600 12.5px/1 "Inter", sans-serif;
    letter-spacing: 0.02em;
    cursor: pointer;
    transition: all 0.16s ease;
  }
  .g-btn:hover:not(:disabled) {
    color: #fff;
    border-color: rgba(86, 188, 236, 0.5);
    background: rgba(86, 188, 236, 0.1);
  }
  .g-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .g-btn--ghost { background: transparent; }
  .g-btn--primary {
    background: linear-gradient(135deg, #56bcec, #4ba8d4);
    border-color: rgba(86, 188, 236, 0.6);
    color: #02141f;
    font-weight: 700;
    box-shadow: 0 4px 20px rgba(86, 188, 236, 0.25);
  }
  .g-btn--primary:hover:not(:disabled) {
    color: #02141f;
    background: linear-gradient(135deg, #6ec7f0, #56bcec);
    box-shadow: 0 6px 26px rgba(86, 188, 236, 0.4);
  }
  .g-btn--lg {
    padding: 11px 22px;
    font-size: 13.5px;
  }

  /* Mobile */
  @media (max-width: 720px) {
    .planner-drawer {
      width: 100vw;
      min-width: 0;
      max-width: none;
      border-left: 0;
    }
    .head { padding: 22px 20px 14px; }
    .body { padding: 16px 20px; gap: 18px; }
    .foot { padding: 14px 20px 18px; }
    .head-title { font-size: 19px; padding-right: 40px; }
    .dur-snaps { grid-template-columns: repeat(4, 1fr); }
    .slots-grid { grid-template-columns: repeat(4, 1fr); }
    .week-day { min-height: 76px; }
  }

  @media (prefers-reduced-motion: reduce) {
    .planner-drawer { transition: none; }
    .planner-overlay { transition: none; }
  }
</style>

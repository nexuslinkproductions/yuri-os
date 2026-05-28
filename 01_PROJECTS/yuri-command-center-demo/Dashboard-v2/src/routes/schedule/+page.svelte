<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import { supabase, hasClient } from "$lib/db";

  // ── types ────────────────────────────────────────────────────────────
  interface ScheduledBlock {
    id: string;
    ticket_id: string;
    ticket_name: string;
    client_code: string;
    priority: string;
    day: string;
    start_hour: number;
    duration_hours: number;
    assignee_code: string;
    user_code: string;
    m365_event_id: string | null;
    color: string | null;
    notes: string | null;
    completion_status: string;
    created_at: string;
  }

  interface CalEvent {
    id: string;
    subject: string;
    start: string;
    end: string;
    allDay: boolean;
    preview: string;
  }

  interface Ticket {
    id: string;
    title: string;
    client_code: string;
    priority: string;
    state: string;
    assignee_code: string;
  }

  // ── week helpers ──────────────────────────────────────────────────────
  function getMonday(d: Date): Date {
    const dt = new Date(d);
    const day = dt.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    dt.setDate(dt.getDate() + diff);
    dt.setHours(0, 0, 0, 0);
    return dt;
  }

  function isoDate(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  function weekLabel(monday: Date): string {
    const year = monday.getFullYear();
    const start = new Date(year, 0, 1);
    const wn = Math.ceil(((monday.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7);
    const end = new Date(monday.getTime() + 6 * 86400000);
    const fmt = (x: Date) => x.toLocaleDateString("de-CH", { day: "numeric", month: "short" });
    return `${fmt(monday)} – ${fmt(end)}, W${wn}`;
  }

  function dayLabel(monday: Date, offset: number): string {
    const d = new Date(monday.getTime() + offset * 86400000);
    return d.toLocaleDateString("de-CH", { weekday: "short", day: "numeric", month: "short" });
  }

  // ── state ─────────────────────────────────────────────────────────────
  let monday = $state(getMonday(new Date()));
  let blocks = $state<ScheduledBlock[]>([]);
  let m365Events = $state<{ CTI: CalEvent[] | null; FK: CalEvent[] | null; SW: CalEvent[] | null; MS: CalEvent[] | null }>({ CTI: null, FK: null, SW: null, MS: null });
  let tickets = $state<Ticket[]>([]);
  let loading = $state(false);
  let loadErr = $state("");

  // planner modal
  let modalOpen = $state(false);
  let modalTicket = $state<Ticket | null>(null);
  let modalDay = $state(isoDate(monday));
  let modalHour = $state(9);
  let modalDuration = $state(1);
  let modalAssignee = $state("CTI");
  let modalSaving = $state(false);
  let modalErr = $state("");

  // completion prompt
  let promptBlock = $state<ScheduledBlock | null>(null);

  const TEAM = ["CTI", "FK", "SW", "MS"] as const;
  const TEAM_COLORS: Record<string, string> = { CTI: "#56BCEC", FK: "#A78BFA", SW: "#34D399", MS: "#FB923C" };
  const HOURS_START = 6;
  const HOURS_END = 21;
  const HOUR_PX = 52;
  const PRIO_COLORS: Record<string, string> = {
    urgent: "#ef4444",
    high: "#f97316",
    medium: "#eab308",
    low: "#22c55e",
    none: "#94a3b8",
  };

  // ── data loading ──────────────────────────────────────────────────────
  async function loadWeek() {
    loading = true;
    loadErr = "";
    try {
      const ws = isoDate(monday);
      const r = await fetch(`/api/functions/schedule-list?week_start=${ws}`, { credentials: "include" });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      blocks = data.blocks || [];
      m365Events = data.events || { CTI: null, FK: null, SW: null, MS: null };
    } catch (e: unknown) {
      loadErr = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  async function loadTickets() {
    if (!hasClient()) return;
    try {
      const { data } = await supabase()
        .from("entity_state")
        .select("entity_id,state")
        .eq("entity_type", "ticket")
        .limit(300);
      if (!data) return;
      tickets = data
        .map((r: { entity_id: string; state: Record<string, unknown> }) => ({
          id: r.entity_id,
          title: String(r.state?.name || r.state?.title || r.entity_id),
          client_code: String(r.state?.client_code || r.state?.project_identifier || ""),
          priority: String(r.state?.priority || "none"),
          state: String(r.state?.state || ""),
          assignee_code: String(r.state?.assignee_code || "CTI"),
        }))
        .filter((t: Ticket) => !["done", "cancelled", "completed"].includes(t.state.toLowerCase()));
    } catch { /* silent */ }
  }

  onMount(() => {
    loadWeek();
    loadTickets();
  });

  function prevWeek() { monday = new Date(monday.getTime() - 7 * 86400000); modalDay = isoDate(monday); loadWeek(); }
  function nextWeek() { monday = new Date(monday.getTime() + 7 * 86400000); modalDay = isoDate(monday); loadWeek(); }
  function goToday()  { monday = getMonday(new Date()); modalDay = isoDate(monday); loadWeek(); }

  const isCurrentWeek = $derived(isoDate(monday) === isoDate(getMonday(new Date())));

  // ── block helpers ─────────────────────────────────────────────────────
  function blocksFor(member: string, day: string): ScheduledBlock[] {
    return blocks.filter(b => b.assignee_code === member && b.day === day);
  }

  function eventsFor(member: string, day: string): CalEvent[] {
    const evs = m365Events[member as keyof typeof m365Events];
    if (!evs) return [];
    return evs.filter(e => e.start?.slice(0, 10) === day && !e.allDay);
  }

  function blockStyle(b: ScheduledBlock) {
    const top = (b.start_hour - HOURS_START) * HOUR_PX;
    const height = Math.max(b.duration_hours * HOUR_PX - 4, 24);
    const color = b.color || TEAM_COLORS[b.assignee_code] || TEAM_COLORS.CTI;
    const expired = isExpiredUnresolved(b);
    return `top:${top}px;height:${height}px;--block-color:${color};` +
      (expired ? "border:1.5px solid var(--warn);" : "");
  }

  function eventStyle(e: CalEvent) {
    const startDt = new Date(e.start);
    const endDt = new Date(e.end);
    const startH = startDt.getHours() + startDt.getMinutes() / 60;
    const endH = endDt.getHours() + endDt.getMinutes() / 60;
    const top = (startH - HOURS_START) * HOUR_PX;
    const height = Math.max((endH - startH) * HOUR_PX - 4, 20);
    return `top:${top}px;height:${height}px;`;
  }

  function isExpiredUnresolved(b: ScheduledBlock): boolean {
    if (b.completion_status !== "pending") return false;
    const totalH = b.start_hour + b.duration_hours;
    const hh = Math.floor(totalH);
    const mm = totalH % 1 >= 0.5 ? "30" : "00";
    const blockEnd = new Date(`${b.day}T${String(hh).padStart(2, "0")}:${mm}:00`);
    return blockEnd < new Date();
  }

  function countExpired(): number {
    return blocks.filter(isExpiredUnresolved).length;
  }

  // ── planner rail ──────────────────────────────────────────────────────
  let ticketFilter = $state("");
  const plannedTicketIds = $derived(new Set(blocks.map(b => b.ticket_id)));
  const filteredTickets = $derived(
    tickets.filter(t =>
      !plannedTicketIds.has(t.id) &&
      (ticketFilter === "" || t.title.toLowerCase().includes(ticketFilter.toLowerCase()) ||
       t.client_code.toLowerCase().includes(ticketFilter.toLowerCase()))
    ).slice(0, 50)
  );

  function openModal(t: Ticket) {
    modalTicket = t;
    modalDay = isoDate(monday);
    modalHour = 9;
    modalDuration = 1;
    modalAssignee = t.assignee_code || "CTI";
    modalErr = "";
    modalOpen = true;
  }

  async function saveBlock() {
    if (!modalTicket) return;
    modalSaving = true;
    modalErr = "";
    try {
      const r = await fetch("/api/functions/schedule-plan-ticket", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "create",
          ticket_id: modalTicket.id,
          ticket_name: modalTicket.title,
          client_code: modalTicket.client_code,
          priority: modalTicket.priority,
          day: modalDay,
          start_hour: modalHour,
          duration_hours: modalDuration,
          user_code: modalAssignee,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      const d = await r.json();
      if (d.block) blocks = [...blocks, d.block];
      modalOpen = false;
    } catch (e: unknown) {
      modalErr = e instanceof Error ? e.message : "Failed to save block";
    } finally {
      modalSaving = false;
    }
  }

  async function deleteBlock(id: string) {
    // Optimistic remove — restore on failure
    const prev = blocks;
    blocks = blocks.filter(b => b.id !== id);
    try {
      const r = await fetch("/api/functions/schedule-plan-ticket", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      if (!r.ok) blocks = prev; // restore
    } catch {
      blocks = prev; // restore on network error
    }
  }

  async function resolveBlock(id: string, resolution: "done" | "rescheduled") {
    const prev = blocks;
    blocks = blocks.map(b => b.id === id ? { ...b, completion_status: resolution } : b);
    promptBlock = null;
    try {
      const r = await fetch("/api/functions/schedule-plan-ticket", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "resolve", id, resolution }),
      });
      if (!r.ok) blocks = prev; // restore on server error
    } catch {
      blocks = prev; // restore on network error
    }
  }

  // duration slider display
  function durationLabel(h: number): string {
    const total = Math.round(h * 2) / 2;
    const hours = Math.floor(total);
    const mins = total % 1 >= 0.5 ? "30m" : "";
    if (hours === 0) return "30m";
    if (!mins) return `${hours}h`;
    return `${hours}h 30m`;
  }

  function hourLabel(h: number): string {
    const hh = Math.floor(h);
    const mm = h % 1 >= 0.5 ? "30" : "00";
    return `${String(hh).padStart(2, "0")}:${mm}`;
  }

  // week day ISO strings — Mon through Fri (5 days)
  const weekDays = $derived(
    Array.from({ length: 5 }, (_, i) => isoDate(new Date(monday.getTime() + i * 86400000)))
  );
</script>

<svelte:head>
  <title>Schedule — NEX</title>
</svelte:head>

<!-- ── page header ── -->
<div class="page-head">
  <div class="head-left">
    <p class="eyebrow">SCHEDULE</p>
    <h1 class="h1">Team Planner</h1>
    <p class="sub">{weekLabel(monday)}</p>
  </div>
  <div class="head-right">
    {#if countExpired() > 0}
      <div class="warn-pill">
        <span class="warn-dot"></span>
        {countExpired()} unresolved
      </div>
    {/if}
    <div class="week-nav">
      <button class="nav-btn" onclick={prevWeek} aria-label="Previous week">‹</button>
      {#if !isCurrentWeek}
        <button class="today-pill" onclick={goToday}>Today</button>
      {/if}
      <button class="nav-btn" onclick={nextWeek} aria-label="Next week">›</button>
    </div>
  </div>
</div>

<!-- ── main layout: grid + rail ── -->
<div class="sched-layout">

  <!-- CALENDAR GRID -->
  <div class="cal-wrap glass-card">

    <!-- day column headers -->
    <div class="col-headers">
      <div class="gutter-head"></div>
      {#each TEAM as member}
        <div class="member-head">
          <div class="avatar-wrap">
            <div class="member-avatar" style="background:{TEAM_COLORS[member]}22;color:{TEAM_COLORS[member]}">
              {member}
            </div>
          </div>
          <div class="member-meta">
            <span class="member-code">{member}</span>
            <span class="member-count">{blocksFor(member, weekDays[0]).length + blocksFor(member, weekDays[1]).length + blocksFor(member, weekDays[2]).length + blocksFor(member, weekDays[3]).length + blocksFor(member, weekDays[4]).length} blocks this week</span>
          </div>
          {#if member !== "CTI"}
            <span class="access-chip">Pending</span>
          {/if}
        </div>
      {/each}
    </div>

    <!-- day rows -->
    <div class="days-scroll">
      {#each Array.from({ length: 5 }, (_, i) => i) as dayOffset}
        {@const dayISO = weekDays[dayOffset]}
        {@const isToday = dayISO === isoDate(new Date())}
        <div class="day-row" class:today={isToday}>
          <!-- day label -->
          <div class="day-label">
            <span class="day-name">{dayLabel(monday, dayOffset)}</span>
            {#if isToday}<span class="today-dot"></span>{/if}
          </div>

          <!-- per-member column -->
          {#each TEAM as member}
            <div class="member-col">
              <!-- time grid lines -->
              <div class="time-grid">
                {#each Array.from({ length: HOURS_END - HOURS_START + 1 }, (_, h) => HOURS_START + h) as h}
                  <div class="grid-line" style="top:{(h - HOURS_START) * HOUR_PX}px">
                    {#if member === "CTI"}
                      <span class="grid-label">{String(h).padStart(2, "0")}:00</span>
                    {/if}
                  </div>
                {/each}
              </div>

              <!-- M365 calendar events (CTI only for now) -->
              {#if member === "CTI"}
                {#each eventsFor(member, dayISO) as ev (ev.id)}
                  <div class="cal-event" style={eventStyle(ev)} title={ev.subject}>
                    <span class="cal-event-title">{ev.subject.replace(/^\[NEX\]\s*/, "")}</span>
                  </div>
                {/each}
              {:else if m365Events[member as keyof typeof m365Events] === null}
                <div class="pending-overlay">
                  <span>No access</span>
                </div>
              {/if}

              <!-- scheduled blocks -->
              {#each blocksFor(member, dayISO) as b (b.id)}
                {@const expired = isExpiredUnresolved(b)}
                <div
                  class="sched-block"
                  class:expired
                  class:done={b.completion_status === "done"}
                  class:rescheduled={b.completion_status === "rescheduled"}
                  style={blockStyle(b)}
                  title="{b.ticket_name} ({b.client_code})"
                  onclick={() => expired && (promptBlock = b)}
                >
                  <div class="block-inner">
                    <span class="block-title">{b.ticket_name}</span>
                    {#if b.client_code}
                      <span class="block-client">{b.client_code}</span>
                    {/if}
                    <span class="block-time">{hourLabel(b.start_hour)} · {durationLabel(b.duration_hours)}</span>
                  </div>
                  {#if b.completion_status === "pending"}
                    <button
                      class="block-del"
                      onclick={(e) => { e.stopPropagation(); deleteBlock(b.id); }}
                      aria-label="Remove block"
                    >×</button>
                  {/if}
                  {#if b.completion_status === "done"}
                    <span class="block-done-mark">✓</span>
                  {/if}
                </div>
              {/each}
            </div>
          {/each}
        </div>
      {/each}
    </div>

    {#if loading}
      <div class="grid-loading">
        <span class="spinner"></span>
        <span>Loading week…</span>
      </div>
    {/if}
    {#if loadErr}
      <div class="grid-err">{loadErr}</div>
    {/if}
  </div>

  <!-- PLANNER RAIL -->
  <div class="planner-rail glass-card">
    <div class="rail-head">
      <h3 class="rail-title">Open Tickets</h3>
      <span class="rail-count">{filteredTickets.length}</span>
    </div>

    <div class="rail-search-wrap">
      <svg class="rail-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
      </svg>
      <input
        class="rail-search"
        type="text"
        placeholder="Filter tickets…"
        bind:value={ticketFilter}
      />
    </div>

    <div class="rail-list">
      {#if filteredTickets.length === 0}
        <div class="rail-empty">
          <span>All tickets scheduled</span>
        </div>
      {:else}
        {#each filteredTickets as t (t.id)}
          <button class="rail-ticket" onclick={() => openModal(t)}>
            <div
              class="prio-dot"
              style="background:{PRIO_COLORS[t.priority] || PRIO_COLORS.none}"
            ></div>
            <div class="ticket-info">
              <span class="ticket-title">{t.title}</span>
              <span class="ticket-meta">{t.client_code || "—"} · {t.priority}</span>
            </div>
            <span class="ticket-plus">+</span>
          </button>
        {/each}
      {/if}
    </div>
  </div>
</div>

<!-- ── TICKET PLANNER MODAL ── -->
{#if modalOpen && modalTicket}
  <div class="modal-backdrop" onclick={() => (modalOpen = false)} role="presentation">
    <div class="modal-card glass-elev" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Plan ticket">
      <div class="modal-head">
        <div>
          <p class="modal-eyebrow">PLAN TICKET</p>
          <h2 class="modal-title">{modalTicket.title}</h2>
          {#if modalTicket.client_code}
            <span class="modal-client">{modalTicket.client_code}</span>
          {/if}
        </div>
        <button class="modal-close" onclick={() => (modalOpen = false)} aria-label="Close">×</button>
      </div>

      <div class="modal-body">
        <!-- assignee -->
        <div class="field">
          <label class="field-label">Assignee</label>
          <div class="assignee-row">
            {#each TEAM as m}
              <button
                class="assignee-btn"
                class:active={modalAssignee === m}
                style="--ac:{TEAM_COLORS[m]}"
                onclick={() => (modalAssignee = m)}
              >{m}</button>
            {/each}
          </div>
        </div>

        <!-- day picker -->
        <div class="field">
          <label class="field-label">Day</label>
          <div class="day-pills">
            {#each Array.from({ length: 5 }, (_, i) => i) as i}
              {@const d = isoDate(new Date(monday.getTime() + i * 86400000))}
              <button
                class="day-pill"
                class:active={modalDay === d}
                onclick={() => (modalDay = d)}
              >{dayLabel(monday, i).split(",")[0]}</button>
            {/each}
          </div>
        </div>

        <!-- start time -->
        <div class="field">
          <label class="field-label">Start time — <span class="field-val">{hourLabel(modalHour)}</span></label>
          <input
            type="range"
            class="slider"
            min={HOURS_START}
            max={20}
            step={0.5}
            bind:value={modalHour}
          />
          <div class="slider-ticks">
            {#each [6, 8, 10, 12, 14, 16, 18, 20] as h}
              <span>{String(h).padStart(2, "0")}:00</span>
            {/each}
          </div>
        </div>

        <!-- duration -->
        <div class="field">
          <label class="field-label">Duration — <span class="field-val">{durationLabel(modalDuration)}</span></label>
          <input
            type="range"
            class="slider"
            min={0.5}
            max={8}
            step={0.5}
            bind:value={modalDuration}
          />
          <div class="slider-ticks">
            {#each [0.5, 1, 2, 3, 4, 6, 8] as h}
              <span>{durationLabel(h)}</span>
            {/each}
          </div>
        </div>

        <!-- preview -->
        <div class="preview-chip" style="--ac:{TEAM_COLORS[modalAssignee]}">
          <div class="preview-bar" style="background:{TEAM_COLORS[modalAssignee]}"></div>
          <div>
            <p class="preview-title">{modalTicket.title}</p>
            <p class="preview-meta">{modalDay} · {hourLabel(modalHour)} – {hourLabel(modalHour + modalDuration)} · {modalAssignee}</p>
          </div>
        </div>
      </div>

      <div class="modal-foot">
        {#if modalErr}
          <span class="modal-err">{modalErr}</span>
        {/if}
        <button class="btn-ghost" onclick={() => (modalOpen = false)}>Cancel</button>
        <button class="btn-primary" onclick={saveBlock} disabled={modalSaving}>
          {modalSaving ? "Saving…" : "Schedule Block"}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- ── COMPLETION PROMPT ── -->
{#if promptBlock}
  <div class="modal-backdrop" onclick={() => (promptBlock = null)} role="presentation">
    <div class="prompt-card glass-elev" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Resolve block">
      <p class="prompt-q">Was this completed?</p>
      <p class="prompt-name">{promptBlock.ticket_name}</p>
      <p class="prompt-time">{promptBlock.day} · {hourLabel(promptBlock.start_hour)}</p>
      <div class="prompt-btns">
        <button class="btn-success" onclick={() => resolveBlock(promptBlock!.id, "done")}>Yes, Done</button>
        <button class="btn-warn" onclick={() => resolveBlock(promptBlock!.id, "rescheduled")}>No — Reschedule</button>
        <button class="btn-ghost" onclick={() => (promptBlock = null)}>Later</button>
      </div>
    </div>
  </div>
{/if}

<style>
/* ── page header ───────────────────────────────────────────────── */
.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 28px;
}
.eyebrow {
  font: 600 10.5px/1 'JetBrains Mono', monospace;
  letter-spacing: .1em;
  color: var(--brand-deep);
  text-transform: uppercase;
  margin: 0 0 6px;
}
.h1 {
  font: 700 28px/1.1 Inter, sans-serif;
  color: var(--ink);
  margin: 0 0 4px;
  letter-spacing: -.03em;
}
.sub {
  font: 400 13px/1 'JetBrains Mono', monospace;
  color: var(--ink-3);
  margin: 0;
}

.head-right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.week-nav {
  display: flex;
  align-items: center;
  gap: 6px;
}
.nav-btn {
  all: unset;
  cursor: pointer;
  width: 36px; height: 36px;
  border-radius: 10px;
  background: var(--glass-card);
  border: 1px solid var(--line);
  display: grid; place-items: center;
  font-size: 18px;
  color: var(--ink-2);
  box-shadow: var(--sh-card);
  transition: background var(--dur) var(--ease), border-color var(--dur) var(--ease);
}
.nav-btn:hover { background: var(--canvas-2); border-color: var(--brand-line-2); }
.today-pill {
  all: unset;
  cursor: pointer;
  padding: 6px 14px;
  border-radius: 20px;
  background: var(--brand-soft);
  border: 1px solid var(--brand-line);
  font: 600 12px/1 Inter, sans-serif;
  color: var(--brand-deep);
  transition: background var(--dur) var(--ease);
}
.today-pill:hover { background: var(--brand-line); }
.warn-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 20px;
  background: var(--warn-soft);
  border: 1px solid var(--ye-28);
  font: 600 11.5px/1 Inter, sans-serif;
  color: var(--warn);
}
.warn-dot {
  width: 7px; height: 7px;
  border-radius: 50%;
  background: var(--warn);
  animation: pulse 2s infinite;
}

/* ── layout ────────────────────────────────────────────────────── */
.sched-layout {
  display: grid;
  grid-template-columns: 1fr 300px;
  gap: 20px;
  align-items: start;
}
@media (max-width: 1100px) { .sched-layout { grid-template-columns: 1fr; } }

/* ── glass-card base ───────────────────────────────────────────── */
.glass-card {
  background: var(--glass-card);
  -webkit-backdrop-filter: var(--blur-card);
  backdrop-filter: var(--blur-card);
  border: 1px solid var(--line);
  border-radius: var(--r3);
  box-shadow: var(--sh-card);
  overflow: hidden;
}
.glass-elev {
  background: var(--glass-elev);
  -webkit-backdrop-filter: var(--blur-elev);
  backdrop-filter: var(--blur-elev);
  border: 1px solid var(--line);
  border-radius: var(--r3);
  box-shadow: var(--sh-card-hover);
}

/* ── calendar grid ─────────────────────────────────────────────── */
.cal-wrap {
  position: relative;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  min-width: 0;
}

/* column headers */
.col-headers {
  display: grid;
  grid-template-columns: 56px repeat(4, 1fr);
  border-bottom: 1px solid var(--line);
  background: var(--canvas);
  position: sticky;
  top: 0;
  z-index: 10;
  min-width: 640px;
}
.gutter-head { padding: 12px 0; }
.member-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-left: 1px solid var(--line);
  position: relative;
}
.member-avatar {
  width: 32px; height: 32px;
  border-radius: 10px;
  font: 700 11px/32px 'JetBrains Mono', monospace;
  text-align: center;
  flex-shrink: 0;
  letter-spacing: .02em;
}
.member-code {
  font: 700 12px/1 'JetBrains Mono', monospace;
  color: var(--ink);
  letter-spacing: .04em;
}
.member-count {
  font: 400 11px/1 Inter, sans-serif;
  color: var(--ink-3);
}
.member-meta { display: flex; flex-direction: column; gap: 3px; }
.access-chip {
  position: absolute;
  right: 8px; top: 10px;
  font: 500 9.5px/1 Inter, sans-serif;
  padding: 2px 7px;
  border-radius: 20px;
  background: var(--warn-soft);
  color: var(--warn);
  border: 1px solid var(--ye-18);
}

/* day rows */
.days-scroll { min-width: 640px; }
.day-row {
  display: grid;
  grid-template-columns: 56px repeat(4, 1fr);
  border-bottom: 1px solid var(--line);
}
.day-row.today { background: rgba(86,188,236,.04); }
.day-label {
  padding: 10px 6px 6px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  border-right: 1px solid var(--line);
  position: sticky;
  left: 0;
  background: var(--canvas);
  z-index: 5;
}
.day-name {
  font: 500 10.5px/1 Inter, sans-serif;
  color: var(--ink-3);
  text-align: right;
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  white-space: nowrap;
}
.today-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--brand);
}

/* member column */
.member-col {
  position: relative;
  height: calc(16 * 52px);
  border-left: 1px solid var(--line);
  overflow: hidden;
}

/* time grid */
.time-grid { position: absolute; inset: 0; pointer-events: none; }
.grid-line {
  position: absolute;
  left: 0; right: 0;
  height: 1px;
  background: var(--line);
  opacity: .5;
}
.grid-label {
  position: absolute;
  left: -52px;
  top: -7px;
  font: 500 9px/1 'JetBrains Mono', monospace;
  color: var(--ink-3);
  pointer-events: none;
  width: 44px;
  text-align: right;
}

/* pending overlay for non-CTI members */
.pending-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font: 400 11px/1 Inter, sans-serif;
  color: var(--ink-3);
  background: repeating-linear-gradient(
    -45deg,
    transparent,
    transparent 8px,
    var(--line) 8px,
    var(--line) 9px
  );
  opacity: .5;
  pointer-events: none;
}

/* calendar events (M365) */
.cal-event {
  position: absolute;
  left: 2px; right: 2px;
  background: rgba(86,188,236,.12);
  border: 1px solid rgba(86,188,236,.22);
  border-left: 3px solid var(--brand);
  border-radius: 6px;
  padding: 4px 6px;
  z-index: 1;
  overflow: hidden;
}
.cal-event-title {
  font: 400 10px/1.2 Inter, sans-serif;
  color: var(--brand-deep);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* scheduled blocks */
.sched-block {
  position: absolute;
  left: 3px; right: 3px;
  background: color-mix(in oklab, var(--block-color) 18%, var(--glass-card));
  border: 1px solid color-mix(in oklab, var(--block-color) 40%, transparent);
  border-left: 3px solid var(--block-color);
  border-radius: 8px;
  z-index: 2;
  cursor: pointer;
  overflow: hidden;
  transition: box-shadow var(--dur) var(--ease), transform var(--dur) var(--ease);
}
.sched-block:hover { box-shadow: 0 4px 16px rgba(0,0,0,.12); transform: translateX(1px); }
.sched-block.expired { animation: block-warn 2.5s ease-in-out infinite; }
.sched-block.done {
  opacity: .45;
  background: rgba(34,197,94,.08);
  border-left-color: var(--success);
}
.sched-block.rescheduled {
  opacity: .45;
  background: rgba(234,179,8,.06);
  border-left-color: var(--warn);
}
@keyframes block-warn {
  0%,100% { box-shadow: 0 0 0 0 rgba(234,179,8,.0); }
  50%      { box-shadow: 0 0 0 4px rgba(234,179,8,.35); }
}
.block-inner {
  padding: 4px 22px 4px 7px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  height: 100%;
}
.block-title {
  font: 600 10.5px/1.2 Inter, sans-serif;
  color: var(--ink);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.block-client {
  font: 500 9px/1 'JetBrains Mono', monospace;
  color: var(--ink-3);
  letter-spacing: .04em;
}
.block-time {
  font: 400 9px/1 'JetBrains Mono', monospace;
  color: var(--ink-3);
  margin-top: auto;
}
.block-del {
  all: unset;
  position: absolute;
  top: 3px; right: 4px;
  width: 16px; height: 16px;
  border-radius: 4px;
  font-size: 13px;
  line-height: 16px;
  text-align: center;
  color: var(--ink-3);
  cursor: pointer;
  opacity: 0;
  transition: opacity var(--dur) var(--ease), background var(--dur) var(--ease);
}
.sched-block:hover .block-del { opacity: 1; }
.block-del:hover { background: var(--danger-soft); color: var(--danger); }
.block-done-mark {
  position: absolute;
  top: 3px; right: 5px;
  font-size: 11px;
  color: var(--success);
}

/* loading/error overlay */
.grid-loading, .grid-err {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(244,247,252,.8);
  z-index: 20;
  font: 400 13px/1 Inter, sans-serif;
  color: var(--ink-3);
  gap: 10px;
}
[data-theme="dark"] .grid-loading { background: rgba(6,9,15,.8); }
.spinner {
  width: 20px; height: 20px;
  border: 2px solid var(--line-2);
  border-top-color: var(--brand);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
.grid-err { color: var(--danger); background: rgba(244,247,252,.9); }

/* ── planner rail ──────────────────────────────────────────────── */
.planner-rail {
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 180px);
  position: sticky;
  top: 80px;
}
.rail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px 12px;
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}
.rail-title {
  font: 600 13.5px/1 Inter, sans-serif;
  color: var(--ink);
  margin: 0;
}
.rail-count {
  font: 600 11px/1 'JetBrains Mono', monospace;
  padding: 3px 8px;
  border-radius: 20px;
  background: var(--brand-soft);
  color: var(--brand-deep);
}
.rail-search-wrap {
  position: relative;
  padding: 10px 14px;
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}
.rail-search-icon {
  position: absolute;
  left: 24px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--ink-3);
}
.rail-search {
  width: 100%;
  box-sizing: border-box;
  padding: 7px 10px 7px 30px;
  border-radius: 9px;
  border: 1px solid var(--line);
  background: var(--canvas);
  font: 400 12.5px/1 Inter, sans-serif;
  color: var(--ink);
  outline: none;
  transition: border-color var(--dur) var(--ease);
}
.rail-search:focus { border-color: var(--brand-line-2); }
.rail-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}
.rail-empty {
  padding: 32px 20px;
  text-align: center;
  font: 400 12px/1 Inter, sans-serif;
  color: var(--ink-3);
}
.rail-ticket {
  all: unset;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  box-sizing: border-box;
  padding: 9px 14px;
  transition: background var(--dur) var(--ease);
}
.rail-ticket:hover { background: var(--canvas); }
.rail-ticket:hover .ticket-plus { opacity: 1; }
.prio-dot {
  width: 7px; height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}
.ticket-info { flex: 1; min-width: 0; }
.ticket-title {
  display: block;
  font: 500 12px/1.3 Inter, sans-serif;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ticket-meta {
  display: block;
  font: 400 10.5px/1 Inter, sans-serif;
  color: var(--ink-3);
  margin-top: 3px;
}
.ticket-plus {
  font-size: 16px;
  color: var(--brand);
  opacity: 0;
  transition: opacity var(--dur) var(--ease);
  flex-shrink: 0;
}

/* ── ticket planner modal ──────────────────────────────────────── */
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(11,16,32,.48);
  -webkit-backdrop-filter: blur(4px);
  backdrop-filter: blur(4px);
  display: grid;
  place-items: center;
  padding: 20px;
  animation: fade-in 180ms var(--ease) both;
}
@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }

.modal-card {
  width: 100%;
  max-width: 520px;
  animation: slide-up 260ms var(--ease) both;
}
.prompt-card {
  width: 100%;
  max-width: 360px;
  padding: 28px 24px;
  text-align: center;
  animation: slide-up 260ms var(--ease) both;
}
@keyframes slide-up { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }

.modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 20px 22px 16px;
  border-bottom: 1px solid var(--line);
}
.modal-eyebrow {
  font: 600 10px/1 'JetBrains Mono', monospace;
  color: var(--brand-deep);
  letter-spacing: .1em;
  margin: 0 0 5px;
}
.modal-title {
  font: 600 16px/1.2 Inter, sans-serif;
  color: var(--ink);
  margin: 0 0 5px;
  letter-spacing: -.02em;
}
.modal-client {
  font: 500 10.5px/1 'JetBrains Mono', monospace;
  color: var(--ink-3);
  letter-spacing: .06em;
}
.modal-close {
  all: unset;
  cursor: pointer;
  width: 30px; height: 30px;
  border-radius: 8px;
  display: grid; place-items: center;
  font-size: 18px;
  color: var(--ink-3);
  transition: background var(--dur) var(--ease), color var(--dur) var(--ease);
}
.modal-close:hover { background: var(--canvas); color: var(--ink); }

.modal-body {
  padding: 18px 22px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.field { display: flex; flex-direction: column; gap: 8px; }
.field-label {
  font: 600 11px/1 Inter, sans-serif;
  color: var(--ink-2);
  letter-spacing: .03em;
}
.field-val {
  font: 600 11px/1 'JetBrains Mono', monospace;
  color: var(--brand-deep);
}

.assignee-row { display: flex; gap: 8px; flex-wrap: wrap; }
.assignee-btn {
  all: unset;
  cursor: pointer;
  padding: 7px 14px;
  border-radius: 9px;
  font: 700 11.5px/1 'JetBrains Mono', monospace;
  border: 1px solid var(--line);
  background: var(--canvas);
  color: var(--ink-2);
  transition: all var(--dur) var(--ease);
  letter-spacing: .06em;
}
.assignee-btn.active {
  background: color-mix(in oklab, var(--ac) 15%, transparent);
  border-color: color-mix(in oklab, var(--ac) 40%, transparent);
  color: var(--ac);
}

.day-pills { display: flex; gap: 6px; flex-wrap: wrap; }
.day-pill {
  all: unset;
  cursor: pointer;
  padding: 6px 12px;
  border-radius: 9px;
  font: 500 11.5px/1 Inter, sans-serif;
  border: 1px solid var(--line);
  background: var(--canvas);
  color: var(--ink-2);
  transition: all var(--dur) var(--ease);
}
.day-pill.active {
  background: var(--brand-soft);
  border-color: var(--brand-line-2);
  color: var(--brand-deep);
}

/* slider */
.slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 4px;
  border-radius: 4px;
  background: var(--line-2);
  outline: none;
  cursor: pointer;
}
.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 18px; height: 18px;
  border-radius: 50%;
  background: var(--brand);
  box-shadow: 0 0 0 3px rgba(86,188,236,.2);
  cursor: pointer;
  transition: box-shadow var(--dur) var(--ease);
}
.slider::-webkit-slider-thumb:hover { box-shadow: 0 0 0 5px rgba(86,188,236,.3); }
.slider-ticks {
  display: flex;
  justify-content: space-between;
  font: 400 9.5px/1 'JetBrains Mono', monospace;
  color: var(--ink-3);
  margin-top: 4px;
}

/* preview chip */
.preview-chip {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 11px;
  background: var(--canvas);
  border: 1px solid var(--line);
}
.preview-bar {
  width: 4px;
  height: 36px;
  border-radius: 4px;
  flex-shrink: 0;
}
.preview-title {
  font: 600 12.5px/1.2 Inter, sans-serif;
  color: var(--ink);
  margin: 0 0 4px;
}
.preview-meta {
  font: 400 10.5px/1 'JetBrains Mono', monospace;
  color: var(--ink-3);
  margin: 0;
}

.modal-foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 22px 18px;
  border-top: 1px solid var(--line);
  flex-wrap: wrap;
}
.modal-err {
  flex: 1 1 100%;
  font: 400 11.5px/1.3 Inter, sans-serif;
  color: var(--danger);
  margin-bottom: 4px;
}

/* ── buttons ───────────────────────────────────────────────────── */
.btn-primary {
  all: unset;
  cursor: pointer;
  padding: 10px 20px;
  border-radius: 11px;
  background: linear-gradient(135deg, var(--brand), var(--brand-deep));
  color: #fff;
  font: 600 13px/1 Inter, sans-serif;
  box-shadow: 0 2px 8px rgba(86,188,236,.35);
  transition: opacity var(--dur) var(--ease), transform var(--dur) var(--ease);
}
.btn-primary:hover { opacity: .9; transform: translateY(-1px); }
.btn-primary:disabled { opacity: .55; cursor: not-allowed; transform: none; }
.btn-ghost {
  all: unset;
  cursor: pointer;
  padding: 10px 16px;
  border-radius: 11px;
  border: 1px solid var(--line);
  font: 500 12.5px/1 Inter, sans-serif;
  color: var(--ink-2);
  transition: background var(--dur) var(--ease);
}
.btn-ghost:hover { background: var(--canvas); }
.btn-success {
  all: unset;
  cursor: pointer;
  padding: 10px 18px;
  border-radius: 11px;
  background: var(--success);
  color: #fff;
  font: 600 12.5px/1 Inter, sans-serif;
  transition: opacity var(--dur) var(--ease);
}
.btn-success:hover { opacity: .9; }
.btn-warn {
  all: unset;
  cursor: pointer;
  padding: 10px 18px;
  border-radius: 11px;
  background: var(--warn);
  color: #fff;
  font: 600 12.5px/1 Inter, sans-serif;
  transition: opacity var(--dur) var(--ease);
}
.btn-warn:hover { opacity: .9; }

/* ── prompt card ───────────────────────────────────────────────── */
.prompt-q {
  font: 700 17px/1.2 Inter, sans-serif;
  color: var(--ink);
  margin: 0 0 8px;
  letter-spacing: -.02em;
}
.prompt-name {
  font: 600 13px/1.3 Inter, sans-serif;
  color: var(--ink-2);
  margin: 0 0 4px;
}
.prompt-time {
  font: 400 11.5px/1 'JetBrains Mono', monospace;
  color: var(--ink-3);
  margin: 0 0 20px;
}
.prompt-btns {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* ── misc animations ───────────────────────────────────────────── */
@keyframes spin   { to { transform: rotate(360deg); } }
@keyframes pulse  { 0%,100% { opacity: 1; } 50% { opacity: .4; } }

/* ── responsive ────────────────────────────────────────────────── */
@media (max-width: 760px) {
  .planner-rail { position: static; max-height: 400px; }
  .col-headers, .days-scroll, .day-row { min-width: 560px; }
}
</style>

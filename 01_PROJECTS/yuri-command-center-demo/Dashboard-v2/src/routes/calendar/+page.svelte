<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { listEntityState, subscribeEntityState, type EntityState } from "$lib/db";
  import GlassCard from "$components/GlassCard.svelte";
  import LiveBadge from "$components/LiveBadge.svelte";
  import MeetingDrawer from "$components/MeetingDrawer.svelte";
  import { toast } from "$components/GlassToast.svelte";

  let meetings = $state<EntityState[]>([]);
  let clients  = $state<EntityState[]>([]);
  let tickets  = $state<EntityState[]>([]);
  let loading = $state(true);
  let weekOffset = $state(0);
  let selected = $state<EntityState | null>(null);
  let unsubM: (() => void) | null = null;
  let unsubC: (() => void) | null = null;
  let unsubT: (() => void) | null = null;

  // Schedule modal
  let scheduleOpen = $state(false);
  let scheduleDate = $state<Date | null>(null);
  let formClientCode = $state<string>("");
  let formTitle = $state<string>("");
  let formDuration = $state<30 | 60 | 120>(60);
  let formHour = $state<number>(10);
  let formMinute = $state<number>(0);
  let scheduling = $state(false);

  function openScheduleModal(d: Date) {
    scheduleDate = d;
    formClientCode = "";
    formTitle = "";
    formDuration = 60;
    // Default to next round hour from now if today, else 10:00
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      formHour = Math.min(17, Math.max(8, now.getHours() + 1));
      formMinute = 0;
    } else {
      formHour = 10;
      formMinute = 0;
    }
    scheduleOpen = true;
  }
  function closeScheduleModal() {
    scheduleOpen = false;
    scheduleDate = null;
  }

  async function submitSchedule() {
    if (!scheduleDate || !formTitle.trim()) {
      toast("Title required", "warn", 2000);
      return;
    }
    scheduling = true;
    try {
      const start = new Date(scheduleDate);
      start.setHours(formHour, formMinute, 0, 0);
      const end = new Date(start.getTime() + formDuration * 60_000);
      const client = clients.find(c => c.entity_id === formClientCode);
      const subjectFull = client
        ? `${client.entity_id} — ${formTitle.trim()}`
        : formTitle.trim();
      const res = await fetch("/api/functions/calendar-schedule-event", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subjectFull,
          start: start.toISOString(),
          end: end.toISOString(),
          attendees: client?.state?.contact_email ? [client.state.contact_email] : [],
          location: "",
          client_code: formClientCode || null,
          source: "dashboard-v2-calendar-slot",
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast(`Event queued for ${start.toLocaleDateString("de-CH", { day: "2-digit", month: "short" })} ${pad(formHour)}:${pad(formMinute)}`, "ok", 3000);
      closeScheduleModal();
    } catch (e: any) {
      toast(`Schedule failed: ${e.message || e}`, "error", 3000);
    } finally {
      scheduling = false;
    }
  }
  function pad(n: number): string { return String(n).padStart(2, "0"); }

  onMount(async () => {
    [meetings, clients, tickets] = await Promise.all([
      listEntityState("meeting", 300),
      listEntityState("client", 200),
      listEntityState("ticket", 500),
    ]);
    loading = false;
    unsubM = subscribeEntityState("meeting", row => {
      meetings = [row, ...meetings.filter(m => m.entity_id !== row.entity_id)].slice(0, 300);
    });
    unsubC = subscribeEntityState("client", row => {
      clients = [row, ...clients.filter(c => c.entity_id !== row.entity_id)].slice(0, 200);
    });
    unsubT = subscribeEntityState("ticket", row => {
      tickets = [row, ...tickets.filter(t => t.entity_id !== row.entity_id)].slice(0, 500);
    });
  });
  onDestroy(() => { unsubM?.(); unsubC?.(); unsubT?.(); });

  function startOfWeek(d: Date) {
    const day = d.getDay();
    const offset = day === 0 ? -6 : 1 - day;
    const r = new Date(d);
    r.setDate(d.getDate() + offset);
    r.setHours(0, 0, 0, 0);
    return r;
  }

  const currentWeek = $derived((() => {
    const base = startOfWeek(new Date());
    base.setDate(base.getDate() + weekOffset * 7);
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      days.push(d);
    }
    return days;
  })());

  function meetingsOf(d: Date) {
    return meetings.filter(m => {
      const start = m.state?.start;
      if (!start) return false;
      const md = new Date(start);
      return md.getFullYear() === d.getFullYear() && md.getMonth() === d.getMonth() && md.getDate() === d.getDate();
    }).sort((a, b) => new Date(a.state?.start).getTime() - new Date(b.state?.start).getTime());
  }

  function fmtDate(d: Date) {
    return d.toLocaleDateString("de-CH", { timeZone: "Europe/Zurich", day: "2-digit", month: "short" });
  }
  function fmtWeekday(d: Date) {
    return d.toLocaleDateString("en-GB", { timeZone: "Europe/Zurich", weekday: "short" });
  }
  function fmtTime(iso: string) {
    return new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit" });
  }
</script>

<header class="row between items-center wrap gap-4">
  <div class="stack gap-1">
    <span class="caption">05 · CALENDAR</span>
    <h1 class="h1 font-display">Week view</h1>
    <p class="body">{currentWeek[0] ? fmtDate(currentWeek[0]) + " — " + fmtDate(currentWeek[6]) : ""}</p>
  </div>
  <div class="row gap-2 items-center">
    <button class="nav-btn glass-press" onclick={() => weekOffset--}>‹ Prev</button>
    <button class="nav-btn glass-press" onclick={() => (weekOffset = 0)}>Today</button>
    <button class="nav-btn glass-press" onclick={() => weekOffset++}>Next ›</button>
    <LiveBadge />
  </div>
</header>

{#if loading}
  <p class="body">Loading…</p>
{:else}
  <section class="week">
    {#each currentWeek as d, i}
      {@const today = (() => { const t = new Date(); return d.toDateString() === t.toDateString(); })()}
      {@const dayMeetings = meetingsOf(d)}
      <GlassCard idx={i} variant={today ? "regular" : "thin"} class={today ? "today" : ""}>
        <header class="day-head row between items-center">
          <span class="caption day-name {today ? 'today-tag' : ''}">{fmtWeekday(d)}</span>
          <span class="day-num font-display {today ? 'today-tag' : ''}">{d.getDate()}</span>
        </header>
        {#each dayMeetings as m}
          <button
            class="meeting"
            type="button"
            onclick={(e) => {
              // Stop propagation so no ancestor click handler (or future
              // global click-outside listener) can see this gesture and
              // racingly close the drawer we are about to open.
              e.stopPropagation();
              selected = m;
            }}
          >
            <span class="caption mtg-time">{fmtTime(m.state?.start)}</span>
            <span class="mtg-name">{m.state?.subject || m.state?.title || "(meeting)"}</span>
          </button>
        {/each}
        <button class="add-slot" type="button" onclick={() => openScheduleModal(d)} title="Schedule new event on this day">
          <span class="add-icon">＋</span>
          <span class="add-label">{dayMeetings.length === 0 ? "Schedule event" : "Add event"}</span>
        </button>
      </GlassCard>
    {/each}
  </section>
{/if}

{#if scheduleOpen && scheduleDate}
  <div
    class="modal-backdrop"
    onclick={(e) => { if (e.target === e.currentTarget) closeScheduleModal(); }}
    onkeydown={(e) => e.key === "Escape" && closeScheduleModal()}
    role="presentation"
  >
    <div class="modal glass glass--thick">
      <header class="row between items-center modal-head">
        <div class="row gap-2 items-center">
          <span class="modal-pill">SCHEDULE</span>
          <span class="caption">{scheduleDate.toLocaleDateString("de-CH", { weekday: "long", day: "2-digit", month: "long" })}</span>
        </div>
        <button class="close-btn" onclick={closeScheduleModal} aria-label="Close">×</button>
      </header>

      <div class="modal-body">
        <label class="field">
          <span class="caption">CLIENT</span>
          <select class="input" bind:value={formClientCode}>
            <option value="">— No client (internal)</option>
            {#each clients.slice().sort((a,b) => a.entity_id.localeCompare(b.entity_id)) as c}
              <option value={c.entity_id}>{c.entity_id} — {c.state?.name || c.entity_id}</option>
            {/each}
          </select>
        </label>

        <label class="field">
          <span class="caption">TITLE</span>
          <input class="input" type="text" placeholder="e.g. Strategy Review" bind:value={formTitle} />
        </label>

        <div class="time-grid">
          <label class="field">
            <span class="caption">HOUR</span>
            <select class="input" bind:value={formHour}>
              {#each Array.from({length: 14}, (_, i) => i + 7) as h}
                <option value={h}>{pad(h)}</option>
              {/each}
            </select>
          </label>
          <label class="field">
            <span class="caption">MINUTE</span>
            <select class="input" bind:value={formMinute}>
              <option value={0}>00</option>
              <option value={15}>15</option>
              <option value={30}>30</option>
              <option value={45}>45</option>
            </select>
          </label>
          <label class="field">
            <span class="caption">DURATION</span>
            <select class="input" bind:value={formDuration}>
              <option value={30}>30 min</option>
              <option value={60}>1 hour</option>
              <option value={120}>2 hours</option>
            </select>
          </label>
        </div>

        <p class="caption dim hint">Queues to Outlook drafts via existing m365 sync — appears on next pass.</p>
      </div>

      <footer class="row gap-2 justify-end modal-foot">
        <button class="btn-ghost" onclick={closeScheduleModal}>Cancel</button>
        <button class="btn-primary" onclick={submitSchedule} disabled={scheduling}>
          {scheduling ? "Queuing…" : "Schedule event"}
        </button>
      </footer>
    </div>
  </div>
{/if}

{#if selected}
  <MeetingDrawer
    meeting={selected}
    clients={clients}
    tickets={tickets}
    onClose={() => selected = null}
  />
{/if}

<style>
  .nav-btn {
    all: unset;
    cursor: pointer;
    padding: 8px 14px;
    border: 1px solid var(--b2);
    border-radius: var(--r-md);
    background: var(--s1);
    font-family: "Space Grotesk", sans-serif;
    font-size: 13px;
    color: var(--t2);
    transition: background var(--dur-fast) var(--ease-out);
  }
  .nav-btn:hover { background: var(--s2); color: var(--tx); }

  .week {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 12px;
  }
  @media (max-width: 880px) { .week { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 520px)  { .week { grid-template-columns: 1fr; } }
  .day-head { padding-bottom: 4px; border-bottom: 1px solid var(--b1); margin-bottom: 8px; }
  .day-name { color: var(--t3); }
  .day-num  { font-size: 22px; color: var(--t2); }
  .today-tag { color: var(--a); }

  .meeting {
    all: unset;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 10px;
    margin-bottom: 4px;
    background: var(--s1);
    border-radius: var(--r-sm);
    border-left: 2px solid var(--a);
    transition: background var(--dur-fast), transform var(--dur-fast);
  }
  .meeting:hover {
    background: var(--s2);
    transform: translateX(2px);
  }
  .mtg-time { color: var(--a); font-size: 10px; }
  .mtg-name { font-size: 12.5px; color: var(--tx); line-height: 1.3; }
  .empty { color: var(--t4); padding: 4px 6px; }

  /* Add-slot button */
  .add-slot {
    all: unset;
    cursor: pointer;
    margin-top: auto;
    padding: 8px 10px;
    display: flex; align-items: center; justify-content: center; gap: 6px;
    border-radius: var(--r-sm);
    border: 1px dashed var(--b2);
    color: var(--t4);
    font-size: 11px;
    transition: background var(--dur-fast), border-color var(--dur-fast), color var(--dur-fast);
  }
  .add-slot:hover {
    background: color-mix(in oklab, var(--a) 8%, transparent);
    border-color: color-mix(in oklab, var(--a) 50%, transparent);
    color: var(--a);
  }
  .add-icon { font-size: 14px; line-height: 1; }
  .add-label { letter-spacing: 0.04em; }

  /* Modal */
  .modal-backdrop {
    position: fixed; inset: 0;
    background: var(--overlay);
    backdrop-filter: blur(10px);
    z-index: 80;
    display: grid; place-items: center;
    padding: 20px;
    animation: m-fade 180ms var(--ease-out);
  }
  @keyframes m-fade { from { opacity: 0 } to { opacity: 1 } }
  .modal {
    width: min(520px, 100%);
    padding: 22px 24px;
    display: flex; flex-direction: column; gap: 14px;
    border: 1px solid color-mix(in oklab, var(--a) 30%, var(--b2));
    box-shadow: var(--sh-lg);
    animation: m-in 240ms var(--ease-spring);
  }
  @keyframes m-in {
    from { opacity: 0; transform: translateY(8px) scale(0.98); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  .modal-head {
    padding-bottom: 8px;
    border-bottom: 1px solid var(--b1);
  }
  .modal-pill {
    font-size: 10px; letter-spacing: 0.14em;
    padding: 3px 10px; border-radius: 999px;
    background: color-mix(in oklab, var(--a) 14%, transparent);
    border: 1px solid color-mix(in oklab, var(--a) 32%, transparent);
    color: var(--tx); font-weight: 600;
  }
  .close-btn {
    all: unset; cursor: pointer;
    width: 28px; height: 28px;
    display: grid; place-items: center;
    border-radius: 50%;
    background: var(--s2);
    color: var(--t2);
    font-size: 18px;
  }
  .close-btn:hover { background: var(--s1); color: var(--tx); }

  .modal-body { display: flex; flex-direction: column; gap: 12px; }
  .field { display: flex; flex-direction: column; gap: 6px; }
  .input {
    all: unset;
    padding: 9px 11px;
    background: var(--s1);
    border: 1px solid var(--b1);
    border-radius: var(--r-md);
    color: var(--tx);
    font-size: 13.5px;
    font-family: inherit;
  }
  select.input {
    appearance: auto;
    -webkit-appearance: menulist;
  }
  .input:focus { border-color: var(--a); }
  .time-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1.4fr;
    gap: 10px;
  }
  .hint { margin-top: 2px; }
  .dim { color: var(--t4); }

  .modal-foot { padding-top: 8px; border-top: 1px solid var(--b1); }
  .btn-ghost {
    all: unset; cursor: pointer;
    padding: 8px 14px; border-radius: var(--r-md);
    font-family: "Space Grotesk", sans-serif; font-size: 13px;
    color: var(--t2); background: var(--s1); border: 1px solid var(--b1);
  }
  .btn-ghost:hover { background: var(--s2); color: var(--tx); }
  .btn-primary {
    all: unset; cursor: pointer;
    padding: 9px 18px; border-radius: var(--r-md);
    font-family: "Space Grotesk", sans-serif; font-size: 13px; font-weight: 600;
    color: #fff;
    background: linear-gradient(135deg, var(--a) 0%, var(--a2) 100%);
    box-shadow: 0 0 18px var(--a-25);
  }
  .btn-primary:hover:not(:disabled) { filter: brightness(1.08); }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
</style>

<script lang="ts">
  /**
   * CalendarView — the calendar tab inside /tracker?view=calendar.
   *
   * Three z-layered overlays on the week × hour grid (08:00-20:00):
   *   1. M365 events (translucent grey, read-only) — pulled via the
   *      schedule-list HTTP function (existing).
   *   2. Planned blocks from scheduled_blocks (dashed border, draggable for
   *      tracker.plan_others_week holders).
   *   3. Tracked time_entries (solid fill with billable bar on the right).
   *
   * CEO + tracker.plan_others_week holders see a member-switch above the
   * grid. Non-CEOs see only their own data (RLS already enforces this on
   * the read side; the UI just hides the picker).
   *
   * v1 scope: render + click-to-edit a block via TimeSliderControls.
   * Drag-and-drop placement is deferred to v2 (chose simplicity for the
   * first ship; click-to-add modal is functional).
   */
  import { onMount, onDestroy } from "svelte";
  import { user } from "$stores/user.svelte";
  import {
    supabase, hasClient, postAuthed, getAuthed,
    subscribePlannedBlocks,
    subscribeTimeEntries,
    type ScheduledBlock, type TimeEntry,
  } from "$lib/db";
  import { GlassActionPrimary, GlassActionSecondary, GlassValueChip, GlassInlineLink } from "$lib/components/glass";
  import { toast } from "$components/GlassToast.svelte";
  import TimeSliderControls from "./TimeSliderControls.svelte";
  import ClientTicketPicker from "./ClientTicketPicker.svelte";

  // ── Grid bounds (matches /focus + /tracker/plan) ──────────────────
  const GRID_START_HR = 8;
  const GRID_END_HR   = 20;
  const ROW_PER_HOUR  = 2;            // 30-min cells
  const ROW_HEIGHT_PX = 36;
  const TOTAL_ROWS    = (GRID_END_HR - GRID_START_HR) * ROW_PER_HOUR;

  // ── Member roster (CEO+CTO bypass; others see only themselves) ────
  type Member = { id: string; code: string | null; display_name: string; email: string | null; color: string | null };
  let members  = $state<Member[]>([]);
  let memberId = $state<string>("");    // selected member's auth uid

  // ── Week ─────────────────────────────────────────────────────────
  let weekStart = $state<Date>(startOfWeek(new Date()));

  // ── Data ─────────────────────────────────────────────────────────
  let blocks   = $state<ScheduledBlock[]>([]);
  let entries  = $state<TimeEntry[]>([]);
  let m365     = $state<Array<{ id: string; subject: string; start: string; end: string }>>([]);
  let loading  = $state(false);

  // ── Add / edit modal ─────────────────────────────────────────────
  let pickerOpen   = $state(false);
  let pickerSlot   = $state<{ day: string; startHour: number } | null>(null);
  let editBlock    = $state<ScheduledBlock | null>(null);
  let editDay      = $state("");
  let editStart    = $state(9);
  let editDur      = $state(1);
  let editSaving   = $state(false);

  let unsubBlocks: (() => void) | null = null;
  let unsubEntries: (() => void) | null = null;

  function startOfWeek(d: Date): Date {
    const m = new Date(d); m.setHours(0, 0, 0, 0);
    const dow = m.getDay() || 7; m.setDate(m.getDate() - (dow - 1));
    return m;
  }
  function iso(d: Date): string { return d.toISOString().slice(0, 10); }

  onMount(async () => {
    await loadMembers();
    memberId = user.id;
    await loadWeek();

    unsubBlocks = subscribePlannedBlocks((row, event) => {
      if (row.user_id !== memberId) return;
      if (event === "DELETE") { blocks = blocks.filter(b => b.id !== row.id); return; }
      const i = blocks.findIndex(b => b.id === row.id);
      if (i >= 0) blocks[i] = row as ScheduledBlock;
      else blocks = [...blocks, row as ScheduledBlock];
      blocks = blocks;
    });
    unsubEntries = subscribeTimeEntries((row, event) => {
      if (row.user_id !== memberId) return;
      if (event === "DELETE") { entries = entries.filter(e => e.id !== row.id); return; }
      const i = entries.findIndex(e => e.id === row.id);
      if (i >= 0) entries[i] = row as TimeEntry;
      else entries = [...entries, row as TimeEntry];
      entries = entries;
    });
  });
  onDestroy(() => { unsubBlocks?.(); unsubEntries?.(); });

  async function loadMembers() {
    if (!hasClient()) return;
    if (user.can("tracker.plan_others_week") || user.isAdmin) {
      const { data } = await supabase()
        .from("user_profiles")
        .select("id, code, display_name, email, color")
        .eq("is_active", true)
        .order("display_name");
      members = (data as Member[]) ?? [];
    } else {
      // Single-member view — caller can only see their own data anyway
      members = [{ id: user.id, code: null, display_name: user.display_name, email: user.email, color: null }];
    }
  }

  async function loadWeek() {
    if (!hasClient() || !memberId) return;
    loading = true;
    try {
      const start = iso(weekStart);
      const end   = iso(new Date(weekStart.getTime() + 6 * 86_400_000));

      // 1) scheduled_blocks (planned)
      const blocksR = await supabase()
        .from("scheduled_blocks")
        .select("*")
        .eq("user_id", memberId)
        .gte("day", start).lte("day", end)
        .order("start_hour");

      // 2) time_entries this week (tracked) — filter client-side by day
      const entriesR = await supabase()
        .from("time_entries")
        .select("*")
        .eq("user_id", memberId)
        .gte("started_at", new Date(weekStart).toISOString())
        .lt("started_at", new Date(weekStart.getTime() + 7 * 86_400_000).toISOString())
        .order("started_at");

      // 3) M365 events via schedule-list (server-side app-token, bearer-gated)
      let m365Events: Array<{ id: string; subject: string; start: string; end: string }> = [];
      try {
        const m = members.find(x => x.id === memberId);
        const memberKey = m?.code || "CTI";
        // T.7.3 adjustments — schedule-list needs an Authorization bearer
        // (its checkAuth middleware rejected the old cookie-credentials call).
        const data = await getAuthed(`/api/functions/schedule-list?week_start=${start}&member=${encodeURIComponent(memberKey)}`);
        const raw = data?.events?.[memberKey] || data?.events || [];
        m365Events = Array.isArray(raw) ? raw.filter(e => e && e.start && e.end) : [];
      } catch (e: any) {
        console.warn("[calendar] m365 fetch failed:", e?.message || e);
      }

      blocks = (blocksR.data as ScheduledBlock[]) ?? [];
      entries = (entriesR.data as TimeEntry[]) ?? [];
      m365 = m365Events;
    } finally {
      loading = false;
    }
  }

  // ── Week navigation ──────────────────────────────────────────────
  const weekDays = $derived.by(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart); d.setDate(d.getDate() + i);
      return {
        date: d,
        iso: iso(d),
        label: d.toLocaleDateString("de-CH", { weekday: "short", day: "numeric" }),
        isToday: d.getTime() === today.getTime(),
      };
    });
  });

  function shiftWeek(direction: -1 | 0 | 1) {
    if (direction === 0) weekStart = startOfWeek(new Date());
    else {
      const d = new Date(weekStart); d.setDate(d.getDate() + direction * 7);
      weekStart = d;
    }
    loadWeek();
  }

  // ── Geometry ─────────────────────────────────────────────────────
  function blockTopRow(startHr: number): number {
    return Math.max(0, Math.round((startHr - GRID_START_HR) * ROW_PER_HOUR));
  }
  function blockSpanRows(durHr: number): number {
    return Math.max(1, Math.round(durHr * ROW_PER_HOUR));
  }

  // Time entries → row positions based on started_at / ended_at hour
  function entryGeometry(e: TimeEntry, day: string): { top: number; height: number } | null {
    const startedAt = new Date(e.started_at);
    if (iso(startedAt) !== day) return null;
    const hrStart = startedAt.getHours() + startedAt.getMinutes() / 60;
    const endedAt = e.ended_at ? new Date(e.ended_at) : new Date();
    const hrEnd = endedAt.getHours() + endedAt.getMinutes() / 60;
    const dur = Math.max(0.25, hrEnd - hrStart);
    if (hrStart >= GRID_END_HR || hrEnd <= GRID_START_HR) return null;
    return {
      top:    Math.max(0, (hrStart - GRID_START_HR)) * ROW_HEIGHT_PX * ROW_PER_HOUR,
      height: Math.min(TOTAL_ROWS * ROW_HEIGHT_PX, dur * ROW_HEIGHT_PX * ROW_PER_HOUR),
    };
  }

  function m365Geometry(ev: { start: string; end: string }, day: string): { top: number; height: number } | null {
    const s = new Date(ev.start); const e = new Date(ev.end);
    if (iso(s) !== day) return null;
    const hrStart = s.getHours() + s.getMinutes() / 60;
    const hrEnd   = e.getHours() + e.getMinutes() / 60;
    if (hrStart >= GRID_END_HR || hrEnd <= GRID_START_HR) return null;
    return {
      top:    Math.max(0, (hrStart - GRID_START_HR)) * ROW_HEIGHT_PX * ROW_PER_HOUR,
      height: Math.max(ROW_HEIGHT_PX, (hrEnd - hrStart) * ROW_HEIGHT_PX * ROW_PER_HOUR),
    };
  }

  function clientAccent(code?: string | null): string {
    if (!code) return "var(--brand)";
    return `var(--client-${code}, var(--brand))`;
  }

  // ── Add new planned block (only if user can plan_others_week OR is editing self) ──
  function canPlanFor(uid: string): boolean {
    if (user.id === uid) return user.can("tracker.submit_plan") || user.isAdmin;
    return user.can("tracker.plan_others_week") || user.isAdmin;
  }

  function handleSlotClick(day: string, hr: number) {
    if (!canPlanFor(memberId)) {
      toast("Read-only view — you can't plan another member's week", "info");
      return;
    }
    pickerSlot = { day, startHour: hr };
    pickerOpen = true;
  }

  async function handlePickerPick(sel: {
    customer_code: string; plane_issue_id: string; plane_issue_seq: string;
    ticket_name: string; project_code?: string;
  }) {
    if (!pickerSlot) return;
    try {
      const r = await postAuthed("/api/functions/tracker-block", {
        action: "add",
        ticket_id: sel.plane_issue_id,
        ticket_name: sel.ticket_name,
        client_code: sel.customer_code,
        day: pickerSlot.day,
        start_hour: pickerSlot.startHour,
        duration_hours: 1,
        // CEO planning for another member overrides assignee_code via the RPC
        assignee_user_id: memberId,
      });
      if (r?.block) {
        blocks = [...blocks, r.block as ScheduledBlock];
        toast("Block added", "ok");
      }
      pickerOpen = false; pickerSlot = null;
    } catch (e: any) {
      toast(e?.message || "Add failed", "error");
    }
  }

  function openEdit(b: ScheduledBlock) {
    if (!canPlanFor(b.user_id || memberId)) { toast("Read-only", "info"); return; }
    editBlock = b;
    editDay   = b.day;
    editStart = Number(b.start_hour);
    editDur   = Number(b.duration_hours);
  }
  function closeEdit() { editBlock = null; }

  async function saveEdit() {
    if (!editBlock) return;
    editSaving = true;
    try {
      const r = await postAuthed("/api/functions/tracker-block", {
        action: "resize",
        block_id: editBlock.id,
        start_hour: editStart,
        duration_hours: editDur,
        day: editDay,
      });
      if (r?.block) {
        const i = blocks.findIndex(b => b.id === editBlock!.id);
        if (i >= 0) blocks[i] = r.block as ScheduledBlock;
        blocks = blocks;
        toast("Block updated", "ok");
      }
      editBlock = null;
    } catch (e: any) {
      toast(e?.message || "Update failed", "error");
    } finally {
      editSaving = false;
    }
  }

  async function deleteBlock() {
    if (!editBlock) return;
    try {
      const r = await postAuthed("/api/functions/tracker-block", {
        action: "delete",
        block_id: editBlock.id,
      });
      if (r?.deleted) {
        blocks = blocks.filter(b => b.id !== editBlock!.id);
        toast("Block deleted", "ok");
      }
      editBlock = null;
    } catch (e: any) {
      toast(e?.message || "Delete failed", "error");
    }
  }

  function fmtHr(h: number): string {
    const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }
</script>

<div class="cal-page">
  <header class="cal-head">
    <div>
      <span class="cal-eyebrow">Plan week · Calendar view</span>
      <h2>Week of {weekStart.toLocaleDateString("de-CH", { day: "numeric", month: "long", year: "numeric" })}</h2>
      <p class="cal-sub">M365 events · tracked time · planned blocks · all in one grid</p>
    </div>
    <div class="cal-head-actions">
      {#if members.length > 1}
        <select class="member-select" bind:value={memberId} onchange={() => loadWeek()}>
          {#each members as m}
            <option value={m.id}>{m.display_name}</option>
          {/each}
        </select>
      {/if}
      <GlassActionSecondary onclick={() => shiftWeek(-1)}>{#snippet children()}← Prev{/snippet}</GlassActionSecondary>
      <GlassActionSecondary onclick={() => shiftWeek(0)}>{#snippet children()}This week{/snippet}</GlassActionSecondary>
      <GlassActionSecondary onclick={() => shiftWeek(1)}>{#snippet children()}Next →{/snippet}</GlassActionSecondary>
    </div>
  </header>

  {#if loading}
    <div class="cal-skel"></div>
  {:else}
    <div class="grid-wrap">
      <!-- Hour column -->
      <div class="hour-col">
        <div class="hc-head"></div>
        {#each Array(GRID_END_HR - GRID_START_HR) as _, i}
          <div class="hc-label" style={`height: ${ROW_HEIGHT_PX * ROW_PER_HOUR}px;`}>
            {String(GRID_START_HR + i).padStart(2, "0")}:00
          </div>
        {/each}
      </div>

      {#each weekDays as d}
        <div class="day-col" class:day-col--today={d.isToday}>
          <div class="day-head">
            <span class="day-label">{d.label}</span>
          </div>
          <div class="day-grid" style={`height: ${ROW_HEIGHT_PX * TOTAL_ROWS}px;`}>
            <!-- click-to-add slots (hidden under the overlays) -->
            {#each Array(TOTAL_ROWS) as _, row}
              {@const hr = GRID_START_HR + row / ROW_PER_HOUR}
              <button type="button" class="slot"
                style={`top: ${row * ROW_HEIGHT_PX}px; height: ${ROW_HEIGHT_PX}px;`}
                title={`Plan a block at ${fmtHr(hr)}`}
                onclick={() => handleSlotClick(d.iso, hr)}
              ></button>
            {/each}
            <!-- hour separators -->
            {#each Array(GRID_END_HR - GRID_START_HR) as _, i}
              <div class="row-sep" style={`top: ${i * ROW_HEIGHT_PX * ROW_PER_HOUR}px;`}></div>
            {/each}

            <!-- LAYER 1: M365 events (translucent grey, read-only) -->
            {#each m365 as ev (ev.id)}
              {@const g = m365Geometry(ev, d.iso)}
              {#if g}
                <div class="m365" style={`top: ${g.top}px; height: ${g.height - 2}px;`}
                  title={`${ev.subject} (Outlook)`}>
                  <span class="m365__sub">{ev.subject || "Outlook event"}</span>
                </div>
              {/if}
            {/each}

            <!-- LAYER 2: planned blocks (dashed, draggable) -->
            {#each blocks.filter(b => b.day === d.iso) as b (b.id)}
              <button
                type="button"
                class="block block--{b.approval_status || 'draft'}"
                style={`top: ${blockTopRow(Number(b.start_hour)) * ROW_HEIGHT_PX}px;
                        height: ${blockSpanRows(Number(b.duration_hours)) * ROW_HEIGHT_PX - 2}px;
                        --b-accent: ${clientAccent(b.client_code)};`}
                onclick={() => openEdit(b)}
                title={`${b.ticket_name || b.ticket_id} · ${b.duration_hours}h`}
              >
                <span class="block__bar" aria-hidden="true"></span>
                <div class="block__body">
                  <span class="block__title">{b.ticket_id || b.ticket_name}</span>
                </div>
                <span class="block__dur">{b.duration_hours}h</span>
              </button>
            {/each}

            <!-- LAYER 3: tracked time_entries (solid + billable right-edge bar) -->
            {#each entries as e (e.id)}
              {@const g = entryGeometry(e, d.iso)}
              {#if g}
                <div class="entry" style={`top: ${g.top}px; height: ${g.height - 2}px;
                  --e-accent: ${clientAccent(e.client_code)};`}>
                  <span class="entry__bar" aria-hidden="true"></span>
                  <div class="entry__body">
                    <span class="entry__title">{e.plane_issue_seq || e.description?.slice(0, 18) || "entry"}</span>
                  </div>
                  {#if e.is_billable !== false}
                    <span class="entry__bill" aria-label="billable"></span>
                  {/if}
                </div>
              {/if}
            {/each}
          </div>
        </div>
      {/each}
    </div>

    <!-- Legend -->
    <div class="cal-legend">
      <span><span class="dot dot--m365"></span> Outlook event</span>
      <span><span class="dot dot--planned"></span> Planned block</span>
      <span><span class="dot dot--tracked"></span> Tracked time</span>
      <span class="cal-legend__sep">·</span>
      {#if canPlanFor(memberId)}
        <GlassInlineLink onclick={() => handleSlotClick(iso(weekDays[0].date), 9)}>+ Add block</GlassInlineLink>
      {:else}
        <span class="cal-readonly">Read-only — only CEO can plan another member's week</span>
      {/if}
    </div>
  {/if}
</div>

<!-- Picker for adding a new block -->
<ClientTicketPicker
  open={pickerOpen}
  onPick={handlePickerPick}
  onClose={() => { pickerOpen = false; pickerSlot = null; }}
/>

<!-- Edit-block modal with the slider port -->
{#if editBlock}
  <div class="edm" role="dialog" aria-modal="true" aria-label="Edit block">
    <div class="edm__backdrop" onclick={closeEdit} role="presentation"></div>
    <div class="edm__card" role="document">
      <header class="edm__head">
        <div>
          <span class="edm__eyebrow">Edit planned block</span>
          <h3>{editBlock.ticket_id || editBlock.ticket_name}</h3>
        </div>
        <button type="button" class="edm__close" aria-label="Close" onclick={closeEdit}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </header>
      <div class="edm__body">
        <TimeSliderControls
          day={editDay}
          startHour={editStart}
          duration={editDur}
          accentColor={clientAccent(editBlock.client_code)}
          onChange={(next) => { editDay = next.day; editStart = next.startHour; editDur = next.duration; }}
        />
      </div>
      <footer class="edm__foot">
        <GlassActionSecondary tone="danger" onclick={deleteBlock}>{#snippet children()}Delete{/snippet}</GlassActionSecondary>
        <div class="edm__foot-right">
          <GlassActionSecondary onclick={closeEdit}>{#snippet children()}Cancel{/snippet}</GlassActionSecondary>
          <GlassActionPrimary onclick={saveEdit} loading={editSaving}>{#snippet children()}Save{/snippet}</GlassActionPrimary>
        </div>
      </footer>
    </div>
  </div>
{/if}

<style>
  /* T.7.3 follow-up — cyan gradient backdrop (CEO-requested) */
  .cal-page {
    display: flex; flex-direction: column; gap: 14px;
    position: relative;
    padding: 20px;
    border-radius: var(--r2, 16px);
    background:
      radial-gradient(circle at 0% 0%, rgba(86,188,236,0.18), transparent 50%),
      radial-gradient(circle at 100% 100%, rgba(86,188,236,0.10), transparent 55%),
      linear-gradient(135deg, rgba(86,188,236,0.16) 0%, rgba(255,255,255,0.04) 50%, rgba(255,255,255,0) 100%);
    border: 1px solid var(--brand-line);
    box-shadow:
      0 12px 32px -16px rgba(86,188,236,0.20),
      inset 0 1px 0 rgba(255,255,255,0.30);
    overflow: hidden;
  }
  .cal-page::before {
    /* Soft cyan-to-white wash behind the grid */
    content: "";
    position: absolute; inset: 0;
    background: radial-gradient(ellipse at 50% -30%, rgba(86,188,236,0.22), transparent 55%);
    pointer-events: none;
    z-index: 0;
  }
  .cal-page > * { position: relative; z-index: 1; }

  .cal-head { display: flex; align-items: end; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .cal-eyebrow { font: 700 11px/1.3 var(--sa); letter-spacing: 0.12em; text-transform: uppercase; color: var(--brand-deep); }
  .cal-head h2 { margin: 6px 0 4px; font: 700 20px/1.3 var(--hd, var(--sa)); letter-spacing: -0.01em; }
  .cal-sub { margin: 0; font: 500 12.5px/1.4 var(--sa); color: var(--t2); }
  .cal-head-actions { display: inline-flex; gap: 8px; flex-wrap: wrap; }

  .member-select {
    appearance: none;
    padding: 8px 14px;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: var(--glass-card);
    color: var(--tx);
    font: 600 12.5px/1 var(--sa);
    cursor: pointer;
  }
  .member-select:focus { outline: none; border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-line-2); }

  .cal-skel { height: 480px; border-radius: var(--r2); background: var(--s1); animation: cal-skel 1.4s ease-in-out infinite; }
  @keyframes cal-skel { 0%,100% { opacity: 0.6; } 50% { opacity: 1; } }

  /* Grid */
  .grid-wrap {
    display: grid;
    grid-template-columns: 64px repeat(7, 1fr);
    gap: 1px;
    background: var(--line);
    border: 1px solid var(--line);
    border-radius: var(--r2, 16px);
    overflow: hidden;
  }
  .hour-col, .day-col { background: var(--canvas-2, var(--bg)); display: flex; flex-direction: column; }
  .hc-head, .day-head {
    height: 32px; padding: 6px 8px;
    background: var(--s1); border-bottom: 1px solid var(--line);
    display: flex; align-items: center; justify-content: center;
    font: 700 11px/1.2 var(--sa); text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--t2);
  }
  .day-col--today .day-head { background: var(--brand-soft); color: var(--brand-deep); }
  .hc-label {
    display: flex; align-items: flex-start; justify-content: center;
    padding-top: 4px;
    font: 600 10.5px/1 var(--mo);
    color: var(--t3);
    font-variant-numeric: tabular-nums;
  }
  .day-grid { position: relative; width: 100%; }

  .slot {
    position: absolute; left: 0; right: 0;
    appearance: none; background: transparent; border: 0; cursor: pointer;
    transition: background 120ms;
  }
  .slot:hover { background: var(--brand-softer); }
  .row-sep {
    position: absolute; left: 0; right: 0; height: 1px;
    background: var(--line); pointer-events: none;
  }

  /* LAYER 1 — M365 events (translucent) */
  .m365 {
    position: absolute; left: 2px; right: 2px;
    border-radius: 6px;
    background: rgba(11, 16, 32, 0.08);
    border: 1px solid var(--line);
    padding: 4px 6px;
    overflow: hidden;
    pointer-events: auto;
    cursor: default;
  }
  .m365__sub { font: 500 10.5px/1.2 var(--sa); color: var(--t2); display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* LAYER 2 — planned blocks (dashed) */
  .block {
    position: absolute; left: 4px; right: 4px;
    appearance: none;
    background: var(--glass-card);
    backdrop-filter: var(--blur-card);
    -webkit-backdrop-filter: var(--blur-card);
    border: 1.5px dashed var(--b-accent, var(--brand));
    border-radius: 8px;
    overflow: hidden;
    cursor: pointer;
    display: grid; grid-template-columns: 4px 1fr auto;
    align-items: center;
    text-align: left;
    transition: transform 120ms var(--tier-spring, cubic-bezier(.34,1.56,.64,1)), box-shadow 120ms;
    z-index: 2;
  }
  .block:hover { transform: translateY(-1px); box-shadow: var(--sh-card); }
  .block__bar { background: var(--b-accent, var(--brand)); align-self: stretch; }
  .block__body { padding: 4px 6px; min-width: 0; }
  .block__title { font: 700 11px/1.2 var(--sa); color: var(--tx);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .block__dur { font: 700 10.5px/1 var(--mo); color: var(--t2); padding: 0 6px; font-variant-numeric: tabular-nums; }

  .block--draft     { opacity: 0.85; }
  .block--submitted { border-color: rgba(217,119,0,0.55); }
  .block--approved  { border-style: solid; }
  .block--rejected  { opacity: 0.55; }

  /* LAYER 3 — tracked time entries (solid) */
  .entry {
    position: absolute; left: 6px; right: 6px;
    border-radius: 6px;
    background: color-mix(in oklab, var(--e-accent) 18%, transparent);
    border: 1px solid color-mix(in oklab, var(--e-accent) 40%, transparent);
    overflow: hidden;
    display: grid; grid-template-columns: 3px 1fr 4px;
    align-items: stretch;
    z-index: 3;
    pointer-events: none;
  }
  .entry__bar { background: var(--e-accent); }
  .entry__body { padding: 3px 6px; min-width: 0; }
  .entry__title { font: 700 10.5px/1.2 var(--sa); color: var(--tx);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .entry__bill {
    background: linear-gradient(180deg, #FFD426, #D4A800);
    width: 4px;
  }

  /* Legend */
  .cal-legend {
    display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
    padding: 8px 4px;
    font: 500 12px/1.3 var(--sa);
    color: var(--t2);
  }
  .cal-legend__sep { color: var(--t4); }
  .cal-legend .dot { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 4px; vertical-align: -1px; }
  .dot--m365     { background: rgba(11, 16, 32, 0.15); }
  .dot--planned  { border: 1.5px dashed var(--brand); }
  .dot--tracked  { background: color-mix(in oklab, var(--brand) 18%, transparent); border: 1px solid var(--brand-line-2); }
  .cal-readonly  { color: var(--t3); font-style: italic; }

  /* Edit-block modal */
  .edm { position: fixed; inset: 0; z-index: var(--z-modal, 1000); display: grid; place-items: center; padding: 20px; }
  .edm__backdrop { position: absolute; inset: 0; background: rgba(8, 11, 20, 0.55); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
  .edm__card {
    position: relative; width: min(560px, 100%); max-height: 90vh;
    display: flex; flex-direction: column;
    border-radius: var(--r3, 22px);
    background: var(--glass-elev);
    backdrop-filter: var(--blur-elev); -webkit-backdrop-filter: var(--blur-elev);
    border: 1px solid var(--brand-line); box-shadow: var(--sh-elev);
    overflow: hidden;
  }
  .edm__head { display: flex; justify-content: space-between; gap: 16px; padding: 18px 22px 14px; border-bottom: 1px solid var(--line); }
  .edm__eyebrow { font: 700 11px/1.3 var(--sa); letter-spacing: 0.10em; text-transform: uppercase; color: var(--brand-deep); }
  .edm__head h3 { margin: 4px 0 4px; font: 700 17px/1.3 var(--hd, var(--sa)); }
  .edm__close { appearance: none; border: 1px solid var(--line); width: 32px; height: 32px; border-radius: 8px; background: var(--s1); color: var(--t2); cursor: pointer; display: grid; place-items: center; }
  .edm__body { flex: 1; min-height: 0; overflow: auto; padding: 16px 22px; }
  .edm__foot { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 14px 22px; border-top: 1px solid var(--line); }
  .edm__foot-right { display: inline-flex; gap: 8px; }

  @media (max-width: 760px) {
    .grid-wrap { grid-template-columns: 44px repeat(7, 1fr); }
    .hc-label { font-size: 9.5px; padding-top: 2px; }
    .day-label { font-size: 9.5px; }
    .block__dur { display: none; }
    .cal-head { flex-direction: column; align-items: stretch; }
  }
</style>

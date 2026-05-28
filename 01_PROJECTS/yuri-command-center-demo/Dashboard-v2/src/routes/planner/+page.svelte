<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { listEntityState, subscribeEntityState, type EntityState } from "$lib/db";
  import GlassCard from "$components/GlassCard.svelte";
  import LiveBadge from "$components/LiveBadge.svelte";

  let tickets = $state<EntityState[]>([]);
  let loading = $state(true);
  let weekOffset = $state(0);
  let unsub: (() => void) | null = null;

  onMount(async () => {
    tickets = await listEntityState("ticket", 500);
    loading = false;
    unsub = subscribeEntityState("ticket", row => {
      tickets = [row, ...tickets.filter(t => t.entity_id !== row.entity_id)].slice(0, 500);
    });
  });
  onDestroy(() => unsub?.());

  function startOfWeek(d: Date) {
    const day = d.getDay();
    const offset = day === 0 ? -6 : 1 - day;
    const r = new Date(d);
    r.setDate(d.getDate() + offset);
    r.setHours(0, 0, 0, 0);
    return r;
  }

  const week = $derived((() => {
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

  function ticketsOnDay(d: Date) {
    return tickets.filter(t => {
      const due = t.state?.due_date;
      if (!due) return false;
      const td = new Date(due);
      return td.getFullYear() === d.getFullYear() && td.getMonth() === d.getMonth() && td.getDate() === d.getDate()
        && !/done|cancel/i.test(t.state?.state || "");
    });
  }

  const unscheduled = $derived(tickets.filter(t => {
    if (!t.state) return false;
    if (/done|cancel/i.test(t.state?.state || "")) return false;
    if (t.state?.due_date) return false;
    const p = (t.state?.priority || "").toLowerCase();
    return p === "urgent" || p === "high";
  }).slice(0, 12));

  function fmtWeekday(d: Date) { return d.toLocaleDateString("en-GB", { timeZone: "Europe/Zurich", weekday: "short" }); }
  function fmtDate(d: Date) { return d.toLocaleDateString("de-CH", { timeZone: "Europe/Zurich", day: "2-digit", month: "short" }); }
</script>

<header class="row between items-center wrap gap-4">
  <div class="stack gap-1">
    <span class="caption">06 · WEEK PLANNER</span>
    <h1 class="h1 font-display">{fmtDate(week[0])} — {fmtDate(week[6])}</h1>
    <p class="body">Urgent + scheduled tickets · ready to plan in real time.</p>
  </div>
  <div class="row gap-2 items-center">
    <button class="nav-btn glass-press" onclick={() => weekOffset--}>‹</button>
    <button class="nav-btn glass-press" onclick={() => (weekOffset = 0)}>This week</button>
    <button class="nav-btn glass-press" onclick={() => weekOffset++}>›</button>
    <LiveBadge />
  </div>
</header>

{#if loading}
  <p class="body">Loading…</p>
{:else}
  <div class="planner-grid">
    <aside class="unscheduled glass">
      <header class="row between items-center">
        <h2 class="h2 font-display">Unscheduled</h2>
        <span class="caption">{unscheduled.length}</span>
      </header>
      {#if unscheduled.length === 0}
        <p class="body small">No urgent unscheduled work.</p>
      {:else}
        <ul class="ulist">
          {#each unscheduled as t, i}
            <li class="ucard glass--thin enter-up" style={`--idx:${i}`}>
              <header class="row between items-center">
                <span class="font-mono code">{t.entity_id}</span>
                <span class="chip {t.state?.priority === "urgent" ? "urgent" : "warn"}">{t.state?.priority}</span>
              </header>
              <p class="ucard-name">{t.state?.name || "(no title)"}</p>
            </li>
          {/each}
        </ul>
      {/if}
    </aside>

    <section class="week-grid">
      {#each week as d, i}
        {@const today = d.toDateString() === new Date().toDateString()}
        {@const items = ticketsOnDay(d)}
        <GlassCard idx={i} variant={today ? "regular" : "thin"}>
          <header class="row between items-center day-h">
            <span class="caption {today ? 'today-tag' : ''}">{fmtWeekday(d)}</span>
            <span class="day-num font-display {today ? 'today-tag' : ''}">{d.getDate()}</span>
          </header>
          {#each items as t}
            <div class="planner-ticket">
              <span class="font-mono code">{t.entity_id}</span>
              <span class="ticket-name">{t.state?.name || "(no title)"}</span>
            </div>
          {:else}
            <span class="empty caption">—</span>
          {/each}
        </GlassCard>
      {/each}
    </section>
  </div>
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
  }
  .nav-btn:hover { background: var(--s2); color: var(--tx); }

  .planner-grid {
    display: grid;
    grid-template-columns: 280px 1fr;
    gap: 20px;
  }
  @media (max-width: 980px) {
    .planner-grid { grid-template-columns: 1fr; }
  }

  .unscheduled {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-self: flex-start;
  }
  .ulist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .ucard {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px 12px;
    border-radius: var(--r-sm);
    background: var(--s1);
    border: 1px solid var(--b1);
  }
  .ucard-name { margin: 0; font-size: 12.5px; color: var(--tx); line-height: 1.3; }

  .week-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 10px;
  }
  @media (max-width: 880px) {
    .week-grid { grid-template-columns: repeat(2, 1fr); }
  }
  .day-h { padding-bottom: 4px; border-bottom: 1px solid var(--b1); margin-bottom: 8px; }
  .day-num { font-size: 18px; color: var(--t2); }
  .today-tag { color: var(--a); }
  .planner-ticket {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px 8px;
    margin-bottom: 4px;
    background: var(--s1);
    border-radius: var(--r-sm);
    border-left: 2px solid var(--a);
  }
  .planner-ticket .ticket-name { font-size: 11.5px; line-height: 1.25; color: var(--tx); }
  .code { font-size: 10px; color: var(--t3); }
  .empty { color: var(--t4); padding: 4px 6px; }
</style>

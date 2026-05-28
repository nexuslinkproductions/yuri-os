<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { goto } from "$app/navigation";
  import { listEntityState, recentAudit, subscribeAuditLog, subscribeEntityState, type AuditRow, type EntityState } from "$lib/db";
  import GlassCard from "$components/GlassCard.svelte";

  let tickets = $state<EntityState[]>([]);
  let meetings = $state<EntityState[]>([]);
  let audit = $state<AuditRow[]>([]);
  let unsubT: (() => void) | null = null;
  let unsubM: (() => void) | null = null;
  let unsubA: (() => void) | null = null;

  onMount(async () => {
    const [t, m, a] = await Promise.all([
      listEntityState("ticket", 800),
      listEntityState("meeting", 200),
      recentAudit(80),
    ]);
    tickets = t; meetings = m; audit = a;
    unsubT = subscribeEntityState("ticket", row => {
      tickets = [row, ...tickets.filter(x => x.entity_id !== row.entity_id)].slice(0, 800);
    });
    unsubM = subscribeEntityState("meeting", row => {
      meetings = [row, ...meetings.filter(x => x.entity_id !== row.entity_id)].slice(0, 200);
    });
    unsubA = subscribeAuditLog(row => {
      audit = [row, ...audit].slice(0, 80);
    });
  });
  onDestroy(() => { unsubT?.(); unsubM?.(); unsubA?.(); });

  function isSameDay(iso: string, ref: Date): boolean {
    if (!iso) return false;
    try {
      const d = new Date(iso);
      return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth() && d.getDate() === ref.getDate();
    } catch { return false; }
  }
  function isOpen(t: EntityState): boolean {
    const g = (t.state?.state_group || "").toLowerCase();
    if (g === "completed" || g === "cancelled") return false;
    const s = (t.state?.state || "").toLowerCase();
    return s !== "done" && s !== "cancelled";
  }
  function fmtTime(iso: string): string {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleTimeString("de-CH", { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit" });
    } catch { return ""; }
  }

  const today = new Date();
  const dueToday = $derived(
    tickets
      .filter(isOpen)
      .filter(t => isSameDay(t.state?.due_date, today))
      .sort((a, b) => {
        const order = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 } as Record<string, number>;
        const pa = order[(a.state?.priority || "none").toLowerCase()] ?? 5;
        const pb = order[(b.state?.priority || "none").toLowerCase()] ?? 5;
        return pa - pb;
      })
  );

  const meetingsToday = $derived(
    meetings
      .filter(m => isSameDay(m.state?.start || m.state?.meeting_date, today))
      .sort((a, b) => new Date(a.state?.start || a.state?.meeting_date || 0).getTime() - new Date(b.state?.start || b.state?.meeting_date || 0).getTime())
  );

  // Pending CEO decisions: audit_log rows with action like decision.pending or commitment-keeper alerts
  // Also surface CTO predictions that haven't been dismissed.
  type PendingItem = { id: string; label: string; sub?: string; created_at: string; kind: "decision" | "prediction" | "after-sales" };
  const pendingDecisions = $derived.by((): PendingItem[] => {
    const out: PendingItem[] = [];
    const seen = new Set<string>();
    // Find dismissed prediction client codes from latest audit_log
    const dismissed = new Set<string>();
    for (const a of audit) {
      if (a.action === "prediction.dismissed" && a.entity_id) dismissed.add(a.entity_id);
    }
    for (const a of audit) {
      if (/decision\.pending|after-sales\.pending|commitment\.due|exeo\.proposal\.pending/.test(a.action)) {
        const key = a.id || `${a.action}-${a.entity_id || ""}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const label = a.entity_name || a.action.replace(/\./g, " · ");
        out.push({ id: key, label, sub: a.entity_id || undefined, created_at: a.created_at, kind: a.action.includes("after-sales") ? "after-sales" : "decision" });
      }
      if (a.action === "cto.predictions.v1") {
        // Surface up to 3 predictions as pending decisions
        const preds = (a as any).details?.predictions || [];
        for (const p of preds.slice(0, 5)) {
          if (!p?.client_code || dismissed.has(p.client_code)) continue;
          const key = `pred-${p.client_code}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({ id: key, label: p.likely_ask || `Review ${p.client_code}`, sub: p.client_code, created_at: a.created_at, kind: "prediction" });
        }
        // Stop at first prediction batch
        break;
      }
    }
    return out.slice(0, 6);
  });

  function openTicket(t: EntityState) {
    goto("/focus");
  }
  function openMeeting(_m: EntityState) {
    goto("/calendar");
  }
  function openDecision(p: PendingItem) {
    if (p.kind === "prediction") goto("/intel#predictions");
    else goto("/learning");
  }

  function prioColor(p: string): string {
    const k = (p || "none").toLowerCase();
    return k === "urgent" ? "#ef4444" : k === "high" ? "#f97316" : k === "medium" ? "#eab308" : k === "low" ? "#10b981" : "#64748b";
  }
</script>

<section class="today-stack" data-vt="today-stack">
  <header class="today-head row between items-center">
    <div class="row gap-3 items-center">
      <span class="today-pill">
        <span class="today-pill-dot"></span>
        TODAY
      </span>
      <span class="caption today-date">{today.toLocaleDateString("de-CH", { timeZone: "Europe/Zurich", weekday: "long", day: "2-digit", month: "long" })}</span>
    </div>
    <span class="caption dim">{dueToday.length + meetingsToday.length + pendingDecisions.length} items on your plate</span>
  </header>

  <div class="today-cols">
    <!-- DUE TODAY -->
    <GlassCard idx={0}>
      <header class="col-head row between items-center">
        <h3 class="h2 font-display">Due today</h3>
        <span class="count-chip">{dueToday.length}</span>
      </header>
      {#if dueToday.length === 0}
        <p class="empty">Nothing scheduled to close today.</p>
      {:else}
        <ul class="list">
          {#each dueToday.slice(0, 6) as t}
            {@const prio = (t.state?.priority || "none").toLowerCase()}
            <li>
              <button type="button" class="list-row" onclick={() => openTicket(t)}>
                <span class="dot" style={`background:${prioColor(prio)}; box-shadow:0 0 6px ${prioColor(prio)}`}></span>
                <span class="row-id font-mono">{t.entity_id}</span>
                <span class="row-name">{t.state?.name || "(no title)"}</span>
                <span class={`prio-tag prio-${prio}`}>{prio}</span>
              </button>
            </li>
          {/each}
          {#if dueToday.length > 6}
            <li class="more"><a href="/focus">+ {dueToday.length - 6} more in Focus →</a></li>
          {/if}
        </ul>
      {/if}
    </GlassCard>

    <!-- MEETINGS TODAY -->
    <GlassCard idx={1}>
      <header class="col-head row between items-center">
        <h3 class="h2 font-display">Meetings today</h3>
        <span class="count-chip">{meetingsToday.length}</span>
      </header>
      {#if meetingsToday.length === 0}
        <p class="empty">Calendar is open today.</p>
      {:else}
        <ul class="list">
          {#each meetingsToday.slice(0, 6) as m}
            <li>
              <button type="button" class="list-row" onclick={() => openMeeting(m)}>
                <span class="time-tag font-mono">{fmtTime(m.state?.start || m.state?.meeting_date)}</span>
                <span class="row-name grow">{m.state?.subject || m.state?.title || "(meeting)"}</span>
                {#if m.state?.location}<span class="loc-tag">📍 {m.state.location}</span>{/if}
              </button>
            </li>
          {/each}
          {#if meetingsToday.length > 6}
            <li class="more"><a href="/calendar">+ {meetingsToday.length - 6} more on Calendar →</a></li>
          {/if}
        </ul>
      {/if}
    </GlassCard>

    <!-- PENDING DECISIONS -->
    <GlassCard idx={2}>
      <header class="col-head row between items-center">
        <h3 class="h2 font-display">Pending decisions</h3>
        <span class="count-chip">{pendingDecisions.length}</span>
      </header>
      {#if pendingDecisions.length === 0}
        <p class="empty">Nothing waiting on your call.</p>
      {:else}
        <ul class="list">
          {#each pendingDecisions as p}
            <li>
              <button type="button" class="list-row" onclick={() => openDecision(p)}>
                <span class="kind-tag {p.kind}">{p.kind === "after-sales" ? "AS" : p.kind === "prediction" ? "AI" : "DEC"}</span>
                <span class="row-name grow">{p.label}</span>
                {#if p.sub}<span class="row-id font-mono">{p.sub}</span>{/if}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </GlassCard>
  </div>
</section>

<style>
  .today-stack { display: flex; flex-direction: column; gap: 12px; }

  .today-head { padding: 0 4px; }
  .today-pill {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 5px 14px;
    border-radius: 999px;
    background: linear-gradient(135deg, var(--a-18), var(--a2-18));
    border: 1px solid var(--a-40);
    font-family: "Space Grotesk", sans-serif;
    font-size: 11px; letter-spacing: 0.18em; color: var(--tx); font-weight: 600;
  }
  .today-pill-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--a); box-shadow: 0 0 8px var(--a); }
  .today-date { color: var(--t2); text-transform: capitalize; }
  .dim { color: var(--t4); }

  .today-cols {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
  }
  @media (max-width: 980px) { .today-cols { grid-template-columns: 1fr; } }

  .col-head { padding-bottom: 10px; border-bottom: 1px solid var(--b1); margin-bottom: 8px; }
  .col-head h3 { font-size: 17px; }
  .count-chip {
    font-family: "JetBrains Mono", monospace;
    font-size: 11px;
    padding: 2px 9px;
    border-radius: 999px;
    background: color-mix(in oklab, var(--a) 16%, var(--s1));
    border: 1px solid color-mix(in oklab, var(--a) 30%, var(--b1));
    color: var(--tx);
  }

  .empty { font-size: 12.5px; color: var(--t3); margin: 6px 0 0; padding: 4px 2px; }

  .list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
  .list-row {
    all: unset;
    cursor: pointer;
    width: 100%;
    box-sizing: border-box;
    display: grid;
    grid-template-columns: auto auto 1fr auto;
    gap: 10px;
    align-items: center;
    padding: 8px 10px;
    border-radius: var(--r-sm);
    background: var(--s1);
    border: 1px solid var(--b1);
    font-size: 12.5px;
    transition: background var(--dur-fast), border-color var(--dur-fast), transform var(--dur-fast);
  }
  .list-row:hover {
    background: var(--s2);
    border-color: color-mix(in oklab, var(--a) 35%, var(--b1));
    transform: translateX(1px);
  }
  .dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .row-id { font-size: 10.5px; color: var(--t3); }
  .row-name { color: var(--tx); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .grow { min-width: 0; }

  .time-tag {
    font-size: 10.5px;
    color: var(--a);
    background: color-mix(in oklab, var(--a) 14%, transparent);
    padding: 2px 8px;
    border-radius: 4px;
    letter-spacing: 0.04em;
  }
  .loc-tag { font-size: 10px; color: var(--t3); white-space: nowrap; }

  .prio-tag {
    font-size: 9.5px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--s2);
    color: var(--t3);
  }
  .prio-tag.prio-urgent { background: var(--re-18); color: color-mix(in oklab, var(--re) 70%, white); }
  .prio-tag.prio-high { background: rgba(249,115,22,0.18); color: color-mix(in oklab, var(--or) 70%, white); }
  .prio-tag.prio-medium { background: var(--ye-18); color: color-mix(in oklab, var(--ye) 70%, white); }
  .prio-tag.prio-low { background: var(--gr-18); color: color-mix(in oklab, var(--gr) 70%, white); }

  .kind-tag {
    font-family: "JetBrains Mono", monospace;
    font-size: 9px;
    letter-spacing: 0.06em;
    padding: 3px 7px;
    border-radius: 4px;
    background: var(--s2);
    color: var(--t3);
    flex-shrink: 0;
  }
  .kind-tag.prediction { background: var(--a2-18); color: color-mix(in oklab, var(--a2) 70%, white); }
  .kind-tag.decision { background: var(--a-18); color: var(--a); }
  .kind-tag.after-sales { background: rgba(249,115,22,0.18); color: color-mix(in oklab, var(--or) 70%, white); }

  .more { padding: 4px 0 0; }
  .more a { font-size: 11px; color: var(--a); text-decoration: none; }
  .more a:hover { text-decoration: underline; }
</style>

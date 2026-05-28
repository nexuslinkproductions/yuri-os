<script lang="ts">
  /**
   * TeamTimeView — extracted from /tracker/team/+page.svelte so the Team
   * tab on /tracker?view=team can render inline without a route change.
   *
   * Gated by tracker.view_team (host page enforces this before mounting).
   * Realtime via subscribeTimeEntries + subscribeTeamCapacity.
   */
  import { onMount, onDestroy } from "svelte";
  import {
    supabase, hasClient,
    subscribeTimeEntries, subscribeTeamCapacity,
    type TimeEntry, type TeamCapacity,
  } from "$lib/db";
  import { GlassValueChip, GlassInlineLink } from "$lib/components/glass";
  import TimeEditRequestModal from "$lib/components/tracker/TimeEditRequestModal.svelte";
  import { user } from "$stores/user.svelte";

  let editingEntry = $state<TimeEntry | null>(null);
  let expandedMemberId = $state<string | null>(null);
  function toggleExpand(id: string) {
    expandedMemberId = expandedMemberId === id ? null : id;
  }
  function entriesFor(memberId: string): TimeEntry[] {
    return allEntries
      .filter((e) => e.user_id === memberId && e.ended_at !== null)
      .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
      .slice(0, 50);
  }
  function fmtDuration(secs: number | null): string {
    if (!secs) return "—";
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    return `${h}h ${String(m).padStart(2, "0")}m`;
  }
  function fmtDay(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleString("en-CH", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  type Member = {
    id: string;
    email: string;
    display_name: string;
    role: string;
    avatar_url: string | null;
    capacity: TeamCapacity | null;
    todaySec: number;
    weekSec: number;
    billableSec: number;
    running: TimeEntry | null;
  };

  let mounted = $state(false);
  let members = $state<Member[]>([]);
  let allEntries = $state<TimeEntry[]>([]);
  let unsubTE: (() => void) | null = null;
  let unsubTC: (() => void) | null = null;

  onMount(async () => {
    await loadAll();
    unsubTE = subscribeTimeEntries((row, event) => onEntryChange(row, event));
    unsubTC = subscribeTeamCapacity((row) => onCapacityChange(row));
    mounted = true;
  });
  onDestroy(() => { unsubTE?.(); unsubTC?.(); });

  async function loadAll() {
    if (!hasClient()) return;
    const { data: profileRows } = await supabase()
      .from("user_profiles")
      .select("id, email, display_name, role, avatar_url")
      .eq("is_active", true);
    const { data: capRows } = await supabase()
      .from("team_capacity")
      .select("*");
    const wkStart = startOfWeek(new Date()).toISOString();
    const { data: entryRows } = await supabase()
      .from("time_entries")
      .select("*")
      .gte("started_at", wkStart)
      .order("started_at", { ascending: false });

    const capByUser = new Map<string, TeamCapacity>();
    for (const c of (capRows ?? []) as TeamCapacity[]) capByUser.set(c.user_id, c);
    allEntries = (entryRows ?? []) as TimeEntry[];

    members = ((profileRows ?? []) as any[])
      .map((p) => buildMember(p, capByUser.get(p.id) || null))
      .sort((a, b) => a.display_name.localeCompare(b.display_name));
  }

  function startOfWeek(d: Date): Date {
    const m = new Date(d);
    m.setHours(0, 0, 0, 0);
    const dow = m.getDay() || 7;
    m.setDate(m.getDate() - (dow - 1));
    return m;
  }

  function buildMember(p: any, capacity: TeamCapacity | null): Member {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const wkStart = startOfWeek(new Date());
    let todaySec = 0, weekSec = 0, billableSec = 0;
    let running: TimeEntry | null = null;
    for (const e of allEntries) {
      if (e.user_id !== p.id) continue;
      if (e.ended_at === null) running = e;
      if (!e.duration_seconds) continue;
      const s = new Date(e.started_at);
      if (s >= today)   todaySec += e.duration_seconds;
      if (s >= wkStart) weekSec  += e.duration_seconds;
      if (s >= wkStart && e.is_billable) billableSec += e.duration_seconds;
    }
    return {
      id: p.id,
      email: p.email,
      display_name: p.display_name || p.email,
      role: p.role,
      avatar_url: p.avatar_url || null,
      capacity,
      todaySec, weekSec, billableSec, running,
    };
  }

  function onEntryChange(row: TimeEntry, event: "INSERT" | "UPDATE" | "DELETE") {
    const idx = allEntries.findIndex((e) => e.id === row.id);
    if (event === "DELETE") {
      if (idx >= 0) allEntries = allEntries.filter((e) => e.id !== row.id);
    } else if (idx >= 0) {
      allEntries[idx] = row;
      allEntries = allEntries;
    } else {
      const wkStart = startOfWeek(new Date());
      if (new Date(row.started_at) >= wkStart) allEntries = [row, ...allEntries];
    }
    members = members.map((m) => buildMember(
      { id: m.id, email: m.email, display_name: m.display_name, role: m.role, avatar_url: m.avatar_url },
      m.capacity
    ));
  }

  function onCapacityChange(row: TeamCapacity) {
    const idx = members.findIndex((m) => m.id === row.user_id);
    if (idx >= 0) {
      members[idx] = { ...members[idx], capacity: row };
      members = members;
    }
  }

  function fmtH(secs: number): string { return (secs / 3600).toFixed(1); }
  function pct(secs: number, hr: number): number {
    if (hr <= 0) return 0;
    return Math.min(120, (secs / 3600 / hr) * 100);
  }
  function roleAccent(role: string): string {
    switch (role) {
      case "ceo":               return "var(--client-C2M)";
      case "cto":               return "var(--brand)";
      case "marketing_manager": return "var(--a2)";
      case "partner":           return "var(--prio-high)";
      default:                  return "var(--t3)";
    }
  }
</script>

<section class="team-view" aria-label="Team time">
  <header class="ttv-head">
    <div>
      <span class="ttv-eyebrow">Team view · this week</span>
      <h2>Live capacity per member</h2>
      <p class="ttv-sub">FTE-adjusted target · ordered alphabetically · realtime</p>
    </div>
  </header>

  {#if !mounted}
    <p class="ttv-loading">Loading team tracker…</p>
  {:else if members.length === 0}
    <p class="ttv-empty">No team members visible. Ask CEO to grant <code>tracker.view_team</code>.</p>
  {:else}
    <div class="ttv-grid">
      {#each members as m (m.id)}
        {@const weeklyTarget = Number(m.capacity?.weekly_target_hours ?? 42)}
        {@const dailyTarget  = Number(m.capacity?.daily_target_hours  ?? 8.4)}
        {@const billablePctText = m.weekSec > 0 ? Math.round((m.billableSec / m.weekSec) * 100) : 0}
        <div class="ttv-card" style={`--member-accent: ${roleAccent(m.role)};`}>
          <header class="ttv-card__head">
            <div class="ttv-card__avatar" aria-hidden="true">
              {#if m.avatar_url}
                <img src={m.avatar_url} alt="" />
              {:else}
                <span>{(m.display_name || m.email).slice(0,2).toUpperCase()}</span>
              {/if}
            </div>
            <div class="ttv-card__id">
              <div class="ttv-card__name">{m.display_name}</div>
              <div class="ttv-card__role">{m.role.replace(/_/g," ")}</div>
            </div>
            {#if m.running}
              <GlassValueChip tone="success" size="sm" static>
                {#snippet children()}● tracking now{/snippet}
              </GlassValueChip>
            {/if}
          </header>

          <div class="ttv-card__capacity">
            <div class="cap-row">
              <span class="cap-label">TODAY</span>
              <span class="cap-value">{fmtH(m.todaySec)} / {dailyTarget.toFixed(1)} h</span>
            </div>
            <div class="cap-bar"><div class="cap-fill" style="width:{pct(m.todaySec, dailyTarget)}%; background: var(--brand);"></div></div>
            <div class="cap-row" style="margin-top:10px;">
              <span class="cap-label">WEEK</span>
              <span class="cap-value">{fmtH(m.weekSec)} / {weeklyTarget.toFixed(1)} h</span>
            </div>
            <div class="cap-bar"><div class="cap-fill" style="width:{pct(m.weekSec, weeklyTarget)}%; background: var(--a2);"></div></div>
          </div>

          <footer class="ttv-card__foot">
            <GlassValueChip tone="info" size="sm" static>
              {#snippet children()}FTE {m.capacity?.fte_percent ?? 100}%{/snippet}
            </GlassValueChip>
            <GlassValueChip tone={billablePctText >= 70 ? "success" : billablePctText >= 40 ? "warn" : "neutral"} size="sm" static>
              {#snippet children()}{billablePctText}% billable{/snippet}
            </GlassValueChip>
            {#if m.running?.client_code}
              <GlassValueChip size="sm" static accent={`var(--client-${m.running!.client_code}, var(--brand))`}>
                {#snippet children()}{m.running!.client_code}{/snippet}
              </GlassValueChip>
            {/if}
            {#if user.isAdmin}
              <button type="button" class="ttv-card__expand" onclick={() => toggleExpand(m.id)}>
                {expandedMemberId === m.id ? "Hide entries" : "Show entries"}
              </button>
            {/if}
          </footer>

          {#if user.isAdmin && expandedMemberId === m.id}
            <div class="ttv-card__entries" role="region" aria-label="Week entries">
              {#each entriesFor(m.id) as e (e.id)}
                <div class="entry-line">
                  <div class="entry-line__meta">
                    <span class="entry-line__when">{fmtDay(e.started_at)}</span>
                    {#if e.client_code}
                      <span class="entry-line__chip">{e.client_code}</span>
                    {/if}
                    {#if e.plane_issue_seq}
                      <span class="entry-line__chip entry-line__chip--code">{e.plane_issue_seq}</span>
                    {/if}
                    <span class="entry-line__dur">{fmtDuration(e.duration_seconds)}</span>
                  </div>
                  <div class="entry-line__desc">{e.description || "—"}</div>
                  <div class="entry-line__actions">
                    <GlassInlineLink onclick={() => (editingEntry = e)}>edit / delete</GlassInlineLink>
                  </div>
                </div>
              {:else}
                <p class="entry-line__empty">No stopped entries this week.</p>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</section>

<TimeEditRequestModal
  entry={editingEntry}
  onClose={() => (editingEntry = null)}
  onApplied={() => { editingEntry = null; loadAll(); }}
/>

<style>
  .team-view { font-family: var(--sa); color: var(--tx); }
  .ttv-head { padding-bottom: 14px; border-bottom: 1px solid var(--line); margin-bottom: 18px; }
  .ttv-eyebrow { font: 700 11px/1.3 var(--sa); letter-spacing: 0.12em; text-transform: uppercase; color: var(--brand-deep); }
  .ttv-head h2 { font-family: var(--hd); font-weight: 700; font-size: 20px; margin: 6px 0 4px; letter-spacing: -0.02em; }
  .ttv-sub { margin: 0; font-size: 12.5px; color: var(--t2); }

  .ttv-loading, .ttv-empty {
    padding: 32px; text-align: center; color: var(--t3);
    background: var(--s1); border-radius: var(--r2); border: 1px dashed var(--line-2);
  }
  .ttv-empty code { font-family: var(--mo); background: var(--s2); padding: 1px 6px; border-radius: 6px; }

  .ttv-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 16px;
  }

  .ttv-card {
    position: relative;
    padding: 18px;
    border-radius: var(--r2);
    background: var(--glass-card);
    backdrop-filter: var(--blur-card);
    -webkit-backdrop-filter: var(--blur-card);
    border: 1px solid var(--line);
    box-shadow: var(--sh-card);
    overflow: hidden;
  }
  .ttv-card::before {
    content: ""; position: absolute; inset: 0 0 auto 0; height: 3px;
    background: var(--member-accent, var(--brand));
    opacity: .85;
  }

  .ttv-card__head { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
  .ttv-card__avatar {
    width: 40px; height: 40px;
    border-radius: 50%;
    background: var(--s2);
    display: grid; place-items: center;
    overflow: hidden;
    border: 1px solid var(--line);
    font: 700 12px/1 var(--mo);
    color: var(--t2);
    flex-shrink: 0;
  }
  .ttv-card__avatar img { width: 100%; height: 100%; object-fit: cover; }
  .ttv-card__id { min-width: 0; flex: 1; }
  .ttv-card__name { font: 600 14px/1.2 var(--sa); color: var(--tx); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ttv-card__role { font: 500 11px/1.2 var(--sa); color: var(--t3); text-transform: uppercase; letter-spacing: 0.04em; }

  .ttv-card__capacity { margin-bottom: 12px; }
  .cap-row { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  .cap-label { font: 700 10px/1.3 var(--sa); letter-spacing: 0.10em; color: var(--t3); text-transform: uppercase; }
  .cap-value { font: 700 13px/1 var(--mo); color: var(--tx); font-variant-numeric: tabular-nums; }
  .cap-bar { margin-top: 4px; height: 6px; border-radius: 999px; background: var(--s2); overflow: hidden; }
  .cap-fill { height: 100%; border-radius: 999px; transition: width 280ms var(--ease); }

  .ttv-card__foot { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding-top: 6px; border-top: 1px solid var(--line); }
  .ttv-card__expand {
    appearance: none;
    margin-left: auto;
    padding: 4px 10px;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: var(--s1);
    color: var(--brand-deep);
    font: 600 11px/1.2 var(--sa);
    letter-spacing: 0.02em;
    cursor: pointer;
    transition: background 120ms var(--ease), border-color 120ms var(--ease);
  }
  .ttv-card__expand:hover { background: var(--brand-soft); border-color: var(--brand-line-2); }

  .ttv-card__entries {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px dashed var(--line);
    display: flex; flex-direction: column; gap: 8px;
    max-height: 360px; overflow-y: auto;
  }
  .entry-line {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 6px 12px;
    align-items: center;
    padding: 8px 10px;
    background: var(--s1);
    border-radius: 8px;
    border: 1px solid var(--line);
  }
  .entry-line__meta { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font: 600 11.5px/1.2 var(--sa); }
  .entry-line__when { color: var(--t2); }
  .entry-line__chip { padding: 1px 6px; border-radius: 999px; background: var(--brand-soft); color: var(--brand-deep); font: 700 10.5px/1.3 var(--mo); }
  .entry-line__chip--code { background: var(--s2); color: var(--t2); }
  .entry-line__dur { margin-left: auto; font: 700 12px/1.2 var(--mo); color: var(--tx); }
  .entry-line__desc { grid-column: 1 / 2; font: 500 12px/1.4 var(--sa); color: var(--t2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .entry-line__actions { grid-column: 2 / 3; grid-row: 1 / 3; align-self: center; }
  .entry-line__empty { color: var(--t3); padding: 8px 10px; font-size: 12.5px; }

  @media (max-width: 640px) {
    .ttv-grid { grid-template-columns: 1fr; }
  }
</style>

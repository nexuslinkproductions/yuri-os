<script lang="ts">
  /**
   * /meetings - P4 Meeting Intelligence Hub.
   *
   * Three views (Timeline, Analytics, Calendar) over the merged feed of:
   *   - public.meetings              (Studio recordings)
   *   - public.entity_state, type='meeting' (Outlook / calendar sync)
   *
   * The detail drawer is the canonical hand-off into ticket creation
   * (deep links to /pipeline?new=1 carrying the proposed action title).
   *
   * Studio recorder lives at /meetings/studio (moved out of this route on
   * the day the hub shipped). Link from the top bar.
   */
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { getAuthed, postAuthed, hasClient } from "$lib/db";
  import GlassCard from "$components/GlassCard.svelte";
  import GlassStat from "$components/GlassStat.svelte";
  import { toast } from "$components/GlassToast.svelte";

  type MeetingStatus = "scheduled" | "in_progress" | "completed" | "analysed";
  type Meeting = {
    id: string;
    source: "studio" | "calendar";
    title: string;
    start_iso: string | null;
    end_iso: string | null;
    duration_seconds: number | null;
    attendees: string[];
    location: string | null;
    transcript_url: string | null;
    transcript_segments: number;
    summary: string | null;
    action_items: string[];
    status: MeetingStatus;
    raw: any;
  };

  // ── State ──────────────────────────────────────────────────────────
  let meetings = $state<Meeting[]>([]);
  let loading = $state(true);
  let loadError = $state<string>("");
  let activeView = $state<"timeline" | "analytics" | "calendar">("timeline");
  let selected = $state<Meeting | null>(null);
  let drawerOpen = $state(false);
  let savingNotes = $state(false);
  let editedNotes = $state<string>("");
  let editedActions = $state<string[]>([]);
  let completedActions = $state<Set<number>>(new Set());

  // ── Load ───────────────────────────────────────────────────────────
  onMount(() => {
    if (!hasClient()) {
      loadError = "Not authenticated";
      loading = false;
      return;
    }
    void loadMeetings();
  });

  async function loadMeetings() {
    loading = true;
    loadError = "";
    try {
      const r = await getAuthed("/api/functions/meetings-list?limit=200");
      meetings = (r?.items || []) as Meeting[];
    } catch (e: any) {
      loadError = e?.message || "Failed to load meetings";
      meetings = [];
    }
    loading = false;
  }

  // ── Drawer ─────────────────────────────────────────────────────────
  function openMeeting(m: Meeting) {
    selected = m;
    editedNotes = m.summary || "";
    editedActions = [...(m.action_items || [])];
    completedActions = new Set();
    drawerOpen = true;
  }
  function closeDrawer() {
    drawerOpen = false;
    setTimeout(() => { selected = null; }, 260);
  }

  async function saveDrawer() {
    if (!selected) return;
    savingNotes = true;
    try {
      const body: any = { id: selected.id };
      if (editedNotes !== (selected.summary || "")) body.summary = editedNotes;
      const cleanActions = editedActions.map(s => s.trim()).filter(Boolean);
      const beforeActions = (selected.action_items || []).map(s => s.trim()).filter(Boolean);
      const changed = cleanActions.length !== beforeActions.length
        || cleanActions.some((s, i) => s !== beforeActions[i]);
      if (changed) body.action_items = cleanActions;
      if (Object.keys(body).length === 1) {
        toast("No changes to save", "warn", 1800);
        savingNotes = false;
        return;
      }
      await postAuthed("/api/functions/meetings-update", body);
      // Patch in-memory so UI reflects without round-trip
      meetings = meetings.map(m => m.id === selected!.id
        ? { ...m, summary: editedNotes, action_items: cleanActions, status: editedNotes ? "analysed" : m.status }
        : m);
      selected = { ...selected, summary: editedNotes, action_items: cleanActions };
      toast("Saved", "ok", 1600);
    } catch (e: any) {
      toast(`Save failed: ${e?.message || e}`, "error", 3200);
    }
    savingNotes = false;
  }

  function toggleActionDone(idx: number) {
    const next = new Set(completedActions);
    if (next.has(idx)) next.delete(idx); else next.add(idx);
    completedActions = next;
  }

  function makeTicketFromAction(action: string) {
    if (!action.trim()) return;
    const title = encodeURIComponent(action.trim().slice(0, 180));
    const ctx = selected ? encodeURIComponent(`From meeting "${selected.title}" on ${formatDate(selected.start_iso)}`) : "";
    goto(`/pipeline?new=1&title=${title}&context=${ctx}`);
  }

  // ── Formatting ─────────────────────────────────────────────────────
  function formatDate(iso: string | null): string {
    if (!iso) return "-";
    try {
      const d = new Date(iso);
      return d.toLocaleDateString("de-CH", {
        timeZone: "Europe/Zurich",
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch { return "-"; }
  }
  function formatTime(iso: string | null): string {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleTimeString("de-CH", {
        timeZone: "Europe/Zurich",
        hour: "2-digit", minute: "2-digit",
      });
    } catch { return ""; }
  }
  function formatDuration(sec: number | null): string {
    if (!sec || sec <= 0) return "-";
    const h = Math.floor(sec / 3600);
    const m = Math.round((sec % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }
  function attendeeInitials(name: string): string {
    const parts = name.replace(/[<>]/g, "").trim().split(/[\s,@.]+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  function statusLabel(s: MeetingStatus): string {
    return s === "in_progress" ? "Live"
      : s === "scheduled" ? "Scheduled"
      : s === "analysed" ? "Analysed"
      : "Completed";
  }
  function shortText(s: string | null, n: number): string {
    if (!s) return "";
    const t = s.replace(/\s+/g, " ").trim();
    return t.length <= n ? t : t.slice(0, n - 1) + "...";
  }

  // ── Analytics derived ──────────────────────────────────────────────
  function startOfMonth(): number {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  }
  function startOfQuarter(): number {
    const d = new Date();
    const qStart = Math.floor(d.getMonth() / 3) * 3;
    return new Date(d.getFullYear(), qStart, 1).getTime();
  }

  const monthCount = $derived.by(() => {
    const t = startOfMonth();
    return meetings.filter(m => m.start_iso && new Date(m.start_iso).getTime() >= t).length;
  });
  const quarterCount = $derived.by(() => {
    const t = startOfQuarter();
    return meetings.filter(m => m.start_iso && new Date(m.start_iso).getTime() >= t).length;
  });
  const avgDuration = $derived.by(() => {
    const withDur = meetings.filter(m => m.duration_seconds && m.duration_seconds > 0);
    if (withDur.length === 0) return 0;
    const sum = withDur.reduce((s, m) => s + (m.duration_seconds || 0), 0);
    return Math.round(sum / withDur.length);
  });
  const analysedCount = $derived(meetings.filter(m => m.status === "analysed" || !!m.summary).length);

  const topAttendees = $derived.by(() => {
    const map = new Map<string, number>();
    for (const m of meetings) {
      for (const a of m.attendees || []) {
        const key = a.trim();
        if (!key) continue;
        map.set(key, (map.get(key) || 0) + 1);
      }
    }
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({ name, count }));
  });

  const weeklySeries = $derived.by(() => {
    // 12 buckets, Monday-anchored
    const now = new Date();
    const dayMs = 86400000;
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dow = (today.getDay() + 6) % 7;
    const thisMonday = today.getTime() - dow * dayMs;
    const buckets: { weekStart: number; label: string; count: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const ws = thisMonday - i * 7 * dayMs;
      buckets.push({ weekStart: ws, label: shortWeekLabel(ws), count: 0 });
    }
    for (const m of meetings) {
      if (!m.start_iso) continue;
      const ms = new Date(m.start_iso).getTime();
      if (!isFinite(ms)) continue;
      for (let i = buckets.length - 1; i >= 0; i--) {
        if (ms >= buckets[i].weekStart) {
          if (ms < buckets[i].weekStart + 7 * dayMs) buckets[i].count++;
          break;
        }
      }
    }
    return buckets;
  });

  function shortWeekLabel(weekStartMs: number): string {
    const d = new Date(weekStartMs);
    return d.toLocaleDateString("de-CH", { month: "short", day: "2-digit" });
  }

  // ── Calendar strip ─────────────────────────────────────────────────
  const calendarWeeks = $derived.by(() => {
    // 8 weeks: previous 4, current, next 3
    const dayMs = 86400000;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dow = (today.getDay() + 6) % 7;
    const thisMonday = today.getTime() - dow * dayMs;
    const weeks: { weekStart: number; days: { dateMs: number; meetings: Meeting[] }[] }[] = [];
    for (let w = -4; w <= 3; w++) {
      const ws = thisMonday + w * 7 * dayMs;
      const days: { dateMs: number; meetings: Meeting[] }[] = [];
      for (let d = 0; d < 7; d++) {
        days.push({ dateMs: ws + d * dayMs, meetings: [] });
      }
      weeks.push({ weekStart: ws, days });
    }
    for (const m of meetings) {
      if (!m.start_iso) continue;
      const ms = new Date(m.start_iso).getTime();
      for (const wk of weeks) {
        if (ms >= wk.weekStart && ms < wk.weekStart + 7 * dayMs) {
          const d = Math.floor((ms - wk.weekStart) / dayMs);
          if (d >= 0 && d < 7) wk.days[d].meetings.push(m);
          break;
        }
      }
    }
    return weeks;
  });

  function isToday(ms: number): boolean {
    const now = new Date();
    const d = new Date(ms);
    return d.getFullYear() === now.getFullYear()
      && d.getMonth() === now.getMonth()
      && d.getDate() === now.getDate();
  }
  function dayLabel(ms: number): string {
    return new Date(ms).toLocaleDateString("de-CH", { weekday: "short", day: "2-digit" });
  }

  // SVG geometry for the weekly line chart
  const chartW = 720;
  const chartH = 160;
  const chartPad = { l: 28, r: 16, t: 12, b: 22 };
  const chartInnerW = chartW - chartPad.l - chartPad.r;
  const chartInnerH = chartH - chartPad.t - chartPad.b;

  const chartGeom = $derived.by(() => {
    const counts = weeklySeries.map(b => b.count);
    const max = Math.max(1, ...counts);
    const xs = weeklySeries.map((_, i) => chartPad.l + (i / Math.max(1, weeklySeries.length - 1)) * chartInnerW);
    const ys = counts.map(c => chartPad.t + chartInnerH * (1 - c / max));
    const path = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
    const area = `${path} L${xs[xs.length - 1].toFixed(1)},${(chartPad.t + chartInnerH).toFixed(1)} L${xs[0].toFixed(1)},${(chartPad.t + chartInnerH).toFixed(1)} Z`;
    return { xs, ys, path, area, max };
  });
</script>

<header class="page-head">
  <div class="head-left">
    <span class="caption muted">05 / MEETING INTEL</span>
    <h1 class="h1 font-display">Meetings</h1>
  </div>
  <div class="head-right">
    <a class="glass-btn glass-btn--ghost glass-btn--sm" href="/meetings/studio">
      <span class="aria-hidden">o</span> Studio
    </a>
    <button class="glass-btn glass-btn--sm" onclick={loadMeetings} disabled={loading}>
      {loading ? "Loading..." : "Refresh"}
    </button>
  </div>
</header>

<!-- View tabs -->
<nav class="view-tabs" aria-label="Meeting views">
  <button class="vt-btn" class:active={activeView === "timeline"} onclick={() => activeView = "timeline"}>
    <span class="vt-icon">≡</span> Timeline
  </button>
  <button class="vt-btn" class:active={activeView === "analytics"} onclick={() => activeView = "analytics"}>
    <span class="vt-icon">+</span> Analytics
  </button>
  <button class="vt-btn" class:active={activeView === "calendar"} onclick={() => activeView = "calendar"}>
    <span class="vt-icon">#</span> Calendar
  </button>
</nav>

{#if loadError}
  <GlassCard idx={0}>
    <p class="caption" style="color:var(--re);">Failed to load: {loadError}</p>
  </GlassCard>
{:else if loading}
  <GlassCard idx={0}>
    <p class="caption muted">Loading meetings...</p>
  </GlassCard>
{:else if meetings.length === 0}
  <GlassCard idx={0}>
    <div class="empty-state">
      <div class="empty-icon">◐</div>
      <h3 class="empty-title font-display">No meetings yet</h3>
      <p class="empty-body">Drop a transcript in 16 - Meetings/Notes/ to get started. Outlook-synced meetings appear here automatically; you can also record a live session in the Studio.</p>
      <div class="empty-actions">
        <a class="glass-btn glass-btn--primary glass-btn--sm" href="/meetings/studio">Open Studio</a>
        <a class="glass-btn glass-btn--ghost glass-btn--sm" href="/calendar">View calendar</a>
      </div>
    </div>
  </GlassCard>
{:else if activeView === "timeline"}
  <!-- TIMELINE -->
  <div class="timeline-list">
    {#each meetings as m (m.id)}
      <button class="m-card" onclick={() => openMeeting(m)}>
        <div class="mc-date">
          <span class="mc-day">{formatDate(m.start_iso).split(",")[0] || formatDate(m.start_iso)}</span>
          <span class="mc-time font-mono">{formatTime(m.start_iso)}</span>
          {#if m.duration_seconds}
            <span class="mc-dur">{formatDuration(m.duration_seconds)}</span>
          {/if}
        </div>
        <div class="mc-body">
          <div class="mc-title-row">
            <h3 class="mc-title">{m.title}</h3>
            <span class="status-badge status-{m.status}">
              {#if m.status === "in_progress"}<span class="sb-pulse"></span>{/if}
              {statusLabel(m.status)}
            </span>
          </div>
          {#if m.attendees.length > 0}
            <div class="mc-att">
              {#each m.attendees.slice(0, 3) as a}
                <span class="att-chip" title={a}>{attendeeInitials(a)}</span>
              {/each}
              {#if m.attendees.length > 3}
                <span class="att-more">+{m.attendees.length - 3} more</span>
              {/if}
            </div>
          {/if}
          {#if m.summary}
            <p class="mc-summary">{shortText(m.summary, 140)}</p>
          {/if}
          {#if m.source === "studio"}
            <span class="src-pill src-studio">o Studio</span>
          {:else}
            <span class="src-pill src-cal"># Calendar</span>
          {/if}
        </div>
        <div class="mc-arrow">{">"}</div>
      </button>
    {/each}
  </div>
{:else if activeView === "analytics"}
  <!-- ANALYTICS -->
  <div class="stats-row">
    <GlassStat idx={0} label="This month" value={String(monthCount)} sub="meetings" />
    <GlassStat idx={1} label="This quarter" value={String(quarterCount)} sub="meetings" />
    <GlassStat idx={2} label="Avg duration" value={formatDuration(avgDuration)} sub="across all" />
    <GlassStat idx={3} label="Analysed" value={String(analysedCount)} sub="with summary" tone="ok" />
  </div>

  <div class="analytics-grid">
    <GlassCard idx={4}>
      <h3 class="card-title font-display">Meetings per week</h3>
      <p class="card-sub caption muted">Last 12 weeks, peak: {chartGeom.max}</p>
      <div class="chart-wrap">
        <svg viewBox="0 0 {chartW} {chartH}" class="line-chart" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="meetingsAreaGrad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%"   stop-color="#56bcec" stop-opacity="0.30" />
              <stop offset="100%" stop-color="#56bcec" stop-opacity="0.00" />
            </linearGradient>
          </defs>
          <!-- gridlines -->
          {#each [0.25, 0.5, 0.75, 1] as r}
            <line
              x1={chartPad.l}
              x2={chartPad.l + chartInnerW}
              y1={chartPad.t + chartInnerH * (1 - r)}
              y2={chartPad.t + chartInnerH * (1 - r)}
              stroke="var(--brand-line)"
              stroke-dasharray="2 4"
              stroke-width="0.7"
            />
          {/each}
          <!-- area + line -->
          <path d={chartGeom.area} fill="url(#meetingsAreaGrad)" />
          <path d={chartGeom.path} fill="none" stroke="#56bcec" stroke-width="2" stroke-linejoin="round" />
          <!-- points -->
          {#each chartGeom.xs as x, i}
            <circle cx={x} cy={chartGeom.ys[i]} r="2.6" fill="#56bcec" />
          {/each}
          <!-- x labels -->
          {#each weeklySeries as b, i}
            {#if i % 2 === 0 || i === weeklySeries.length - 1}
              <text
                x={chartGeom.xs[i]}
                y={chartH - 6}
                text-anchor="middle"
                font-size="9"
                font-family="JetBrains Mono, ui-monospace, monospace"
                fill="var(--ink-3)"
              >{b.label}</text>
            {/if}
          {/each}
        </svg>
      </div>
    </GlassCard>

    <GlassCard idx={5}>
      <h3 class="card-title font-display">Top attendees</h3>
      <p class="card-sub caption muted">{topAttendees.length === 0 ? "No attendees recorded yet" : `${topAttendees.length} contacts`}</p>
      {#if topAttendees.length === 0}
        <p class="caption muted" style="padding:12px 0;">Outlook-synced meetings include attendee data automatically.</p>
      {:else}
        {@const maxN = Math.max(1, ...topAttendees.map(a => a.count))}
        <div class="att-bars">
          {#each topAttendees as a}
            <div class="ab-row">
              <span class="ab-name" title={a.name}>{a.name}</span>
              <div class="ab-track">
                <div class="ab-fill" style="width:{(a.count / maxN) * 100}%"></div>
              </div>
              <span class="ab-count font-mono">{a.count}</span>
            </div>
          {/each}
        </div>
      {/if}
    </GlassCard>
  </div>
{:else}
  <!-- CALENDAR STRIP -->
  <GlassCard idx={0} padding={0}>
    <div class="cal-head">
      <h3 class="card-title font-display" style="margin:0;">Calendar strip</h3>
      <p class="card-sub caption muted" style="margin:0;">4 weeks back, 3 weeks ahead. Click any block to open.</p>
    </div>
    <div class="cal-scroll">
      <div class="cal-grid">
        {#each calendarWeeks as wk (wk.weekStart)}
          <div class="cal-week">
            <div class="cw-label font-mono">{shortWeekLabel(wk.weekStart)}</div>
            <div class="cw-days">
              {#each wk.days as d (d.dateMs)}
                <div class="cw-day" class:today={isToday(d.dateMs)}>
                  <div class="cd-label font-mono">{dayLabel(d.dateMs)}</div>
                  <div class="cd-blocks">
                    {#each d.meetings as m (m.id)}
                      <button
                        class="cd-block status-{m.status}"
                        title="{m.title} - {formatTime(m.start_iso)}"
                        onclick={() => openMeeting(m)}
                      >
                        <span class="cdb-time font-mono">{formatTime(m.start_iso)}</span>
                        <span class="cdb-title">{shortText(m.title, 28)}</span>
                      </button>
                    {/each}
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </div>
  </GlassCard>
{/if}

<!-- DRAWER -->
{#if drawerOpen && selected}
  <div
    class="drawer-backdrop"
    onclick={(e) => { if (e.target === e.currentTarget) closeDrawer(); }}
    onkeydown={(e) => e.key === "Escape" && closeDrawer()}
    role="presentation"
  >
    <aside class="nex-sheet meeting-drawer" aria-label="Meeting detail">
      <header class="md-head">
        <div class="md-head-left">
          <span class="caption muted">{selected.source === "studio" ? "STUDIO RECORDING" : "CALENDAR MEETING"}</span>
          <h2 class="h2 font-display md-title">{selected.title}</h2>
          <div class="md-meta">
            <span class="md-meta-item">{formatDate(selected.start_iso)}</span>
            {#if selected.start_iso}<span class="md-dot"></span><span class="md-meta-item font-mono">{formatTime(selected.start_iso)}{selected.end_iso ? " - " + formatTime(selected.end_iso) : ""}</span>{/if}
            {#if selected.duration_seconds}<span class="md-dot"></span><span class="md-meta-item">{formatDuration(selected.duration_seconds)}</span>{/if}
          </div>
          {#if selected.location}
            <p class="md-loc">@ {selected.location}</p>
          {/if}
        </div>
        <button class="glass-btn glass-btn--ghost glass-btn--icon glass-btn--sm" onclick={closeDrawer} aria-label="Close">x</button>
      </header>

      <div class="md-body">
        <!-- Attendees -->
        {#if selected.attendees.length > 0}
          <section class="md-section">
            <h3 class="md-section-title">Attendees</h3>
            <div class="md-attendees">
              {#each selected.attendees as a}
                <span class="md-att-chip">
                  <span class="md-att-init">{attendeeInitials(a)}</span>
                  <span class="md-att-name">{a}</span>
                </span>
              {/each}
            </div>
          </section>
        {/if}

        <!-- Summary -->
        <section class="md-section">
          <div class="md-section-row">
            <h3 class="md-section-title">AI Summary</h3>
            {#if selected.summary}
              <span class="status-badge status-analysed">Saved</span>
            {/if}
          </div>
          <textarea
            class="md-textarea"
            placeholder="No summary yet. Paste or draft an AI summary - it will save on this meeting."
            bind:value={editedNotes}
            rows="6"
          ></textarea>
        </section>

        <!-- Action items -->
        <section class="md-section">
          <div class="md-section-row">
            <h3 class="md-section-title">Action items</h3>
            <span class="caption muted">{editedActions.length} total</span>
          </div>
          {#if editedActions.length === 0}
            <p class="caption muted" style="padding: 6px 0 12px;">No action items recorded yet. Add one below.</p>
          {:else}
            <ul class="md-actions">
              {#each editedActions as action, i (i)}
                <li class="md-action" class:done={completedActions.has(i)}>
                  <button class="ma-check" onclick={() => toggleActionDone(i)} aria-label="Mark done">
                    {completedActions.has(i) ? "v" : ""}
                  </button>
                  <input class="ma-input" bind:value={editedActions[i]} />
                  <button class="glass-btn glass-btn--ghost glass-btn--sm" onclick={() => makeTicketFromAction(action)}>+ Ticket</button>
                  <button class="ma-del" onclick={() => editedActions = editedActions.filter((_, j) => j !== i)} aria-label="Remove">x</button>
                </li>
              {/each}
            </ul>
          {/if}
          <button class="glass-btn glass-btn--ghost glass-btn--sm md-add-action" onclick={() => editedActions = [...editedActions, ""]}>
            + Add action item
          </button>
        </section>

        <!-- Transcript link -->
        {#if selected.transcript_url}
          <section class="md-section">
            <h3 class="md-section-title">Transcript</h3>
            <a class="glass-btn glass-btn--ghost glass-btn--sm" href={selected.transcript_url} target="_blank" rel="noopener">Open transcript</a>
          </section>
        {:else if selected.source === "studio" && selected.transcript_segments > 0}
          <section class="md-section">
            <h3 class="md-section-title">Transcript</h3>
            <p class="caption muted">{selected.transcript_segments} segments captured in Studio. Open the Studio archive to view.</p>
            <a class="glass-btn glass-btn--ghost glass-btn--sm" href="/meetings/studio">Open Studio</a>
          </section>
        {/if}
      </div>

      <footer class="md-foot">
        <button class="glass-btn glass-btn--ghost" onclick={closeDrawer}>Close</button>
        <button class="glass-btn glass-btn--primary" onclick={saveDrawer} disabled={savingNotes}>
          {savingNotes ? "Saving..." : "Save"}
        </button>
      </footer>
    </aside>
  </div>
{/if}

<style>
  /* ── Page head ─────────────────────────────────────────────────── */
  .page-head {
    display: flex; justify-content: space-between; align-items: flex-end;
    flex-wrap: wrap; gap: 12px; margin-bottom: 14px;
  }
  .head-left { display: flex; flex-direction: column; gap: 4px; }
  .head-right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .muted { color: var(--ink-3); }
  .aria-hidden { font-family: "JetBrains Mono", monospace; }

  /* ── View tabs ─────────────────────────────────────────────────── */
  .view-tabs {
    display: flex; gap: 6px; margin-bottom: 14px;
    padding: 6px; border-radius: 14px;
    background: var(--glass-chrome);
    backdrop-filter: var(--blur-chrome);
    -webkit-backdrop-filter: var(--blur-chrome);
    border: 1px solid var(--brand-line);
    width: max-content;
    max-width: 100%;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  .vt-btn {
    all: unset; cursor: pointer;
    display: inline-flex; align-items: center; gap: 8px;
    padding: 9px 18px; border-radius: 10px;
    font-family: "Space Grotesk", sans-serif;
    font-size: 13px; font-weight: 600;
    color: var(--ink-2);
    transition: background 0.16s, color 0.16s, transform 0.16s;
    white-space: nowrap;
  }
  .vt-btn:hover { color: var(--ink); background: rgba(86,188,236,0.06); }
  .vt-btn.active {
    background: rgba(86,188,236,0.16);
    color: #56bcec;
    box-shadow: inset 0 0 0 1px var(--brand-line-2);
  }
  .vt-icon { font-family: "JetBrains Mono", monospace; font-size: 14px; }

  /* ── Empty state ───────────────────────────────────────────────── */
  .empty-state {
    display: flex; flex-direction: column; align-items: center; gap: 12px;
    padding: 32px 12px; text-align: center;
  }
  .empty-icon {
    width: 56px; height: 56px; border-radius: 50%;
    display: grid; place-items: center;
    background: rgba(86,188,236,0.10);
    border: 1px solid var(--brand-line-2);
    color: #56bcec;
    font-family: "JetBrains Mono", monospace; font-size: 22px;
  }
  .empty-title { margin: 0; font-size: 18px; color: var(--ink); }
  .empty-body { margin: 0; max-width: 460px; font-size: 13px; color: var(--ink-2); line-height: 1.6; }
  .empty-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }

  /* ── Timeline ──────────────────────────────────────────────────── */
  .timeline-list { display: flex; flex-direction: column; gap: 10px; }
  .m-card {
    all: unset; cursor: pointer;
    display: grid;
    grid-template-columns: 130px 1fr 22px;
    gap: 14px; align-items: center;
    padding: 14px 16px;
    border-radius: 14px;
    background: var(--glass-chrome);
    backdrop-filter: var(--blur-chrome);
    -webkit-backdrop-filter: var(--blur-chrome);
    border: 1px solid var(--brand-line);
    transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
  }
  .m-card:hover {
    transform: translateY(-1px);
    border-color: var(--brand-line-2);
    box-shadow: 0 4px 20px rgba(86,188,236,0.10);
  }
  .m-card:focus-visible {
    outline: 2px solid var(--brand-line-2);
    outline-offset: 2px;
  }
  .mc-date {
    display: flex; flex-direction: column; gap: 2px; align-items: flex-start;
    padding-right: 14px;
    border-right: 1px solid var(--brand-line);
  }
  .mc-day { font-size: 12px; color: var(--ink-2); font-weight: 600; }
  .mc-time { font-size: 11px; color: var(--ink-3); }
  .mc-dur { font-size: 10px; color: var(--ink-3); margin-top: 2px; }
  .mc-body { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .mc-title-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
  .mc-title {
    margin: 0; font-family: "Space Grotesk", sans-serif;
    font-size: 14.5px; font-weight: 600; color: var(--ink);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    min-width: 0; flex: 1;
  }
  .mc-att { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .att-chip {
    width: 24px; height: 24px; border-radius: 50%;
    display: grid; place-items: center;
    font-size: 10px; font-weight: 600;
    background: rgba(86,188,236,0.14);
    color: #56bcec;
    border: 1px solid var(--brand-line);
    font-family: "JetBrains Mono", monospace;
  }
  .att-more { font-size: 10.5px; color: var(--ink-3); }
  .mc-summary {
    margin: 0; font-size: 12.5px; color: var(--ink-2); line-height: 1.5;
  }
  .mc-arrow {
    font-family: "JetBrains Mono", monospace; font-size: 16px;
    color: var(--ink-3); justify-self: end;
  }

  .src-pill {
    display: inline-block; align-self: flex-start;
    font-size: 9.5px; padding: 2px 8px; border-radius: 999px;
    font-family: "JetBrains Mono", monospace; letter-spacing: 0.05em;
    border: 1px solid var(--brand-line);
    color: var(--ink-3);
    background: transparent;
  }
  .src-studio { color: #56bcec; border-color: var(--brand-line-2); }
  .src-cal    { color: var(--ink-3); }

  /* Status badges */
  .status-badge {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 10px; padding: 3px 10px; border-radius: 999px;
    font-weight: 600; letter-spacing: 0.02em;
    border: 1px solid transparent; white-space: nowrap;
  }
  .status-scheduled {
    background: rgba(86,188,236,0.10); color: #56bcec; border-color: var(--brand-line);
  }
  .status-in_progress {
    background: rgba(86,188,236,0.16); color: #56bcec; border-color: var(--brand-line-2);
  }
  .status-completed {
    background: rgba(52,199,89,0.10); color: rgb(52,199,89); border-color: rgba(52,199,89,0.25);
  }
  .status-analysed {
    background: rgba(139,92,246,0.15); color: #a78bfa; border-color: rgba(139,92,246,0.30);
  }
  .sb-pulse {
    width: 6px; height: 6px; border-radius: 50%;
    background: #56bcec; box-shadow: 0 0 6px var(--brand-glow);
    animation: sb-pulse 1.4s ease-in-out infinite;
  }
  @keyframes sb-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.45; } }

  /* ── Analytics ─────────────────────────────────────────────────── */
  .stats-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 10px; margin-bottom: 14px;
  }
  .analytics-grid {
    display: grid;
    grid-template-columns: 1.4fr 1fr;
    gap: 12px;
  }
  @media (max-width: 900px) { .analytics-grid { grid-template-columns: 1fr; } }
  .card-title { margin: 0 0 4px; font-size: 14px; color: var(--ink); }
  .card-sub { margin: 0 0 12px; }
  .chart-wrap { width: 100%; max-width: 100%; overflow: hidden; }
  .line-chart { width: 100%; height: 160px; display: block; }
  @media (max-width: 760px) { .line-chart { height: 140px; } }

  .att-bars { display: flex; flex-direction: column; gap: 8px; }
  .ab-row {
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) 1.4fr 28px;
    align-items: center; gap: 10px;
  }
  .ab-name {
    font-size: 12px; color: var(--ink);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .ab-track {
    height: 8px; border-radius: 999px;
    background: rgba(86,188,236,0.08);
    border: 1px solid var(--brand-line);
    overflow: hidden;
  }
  .ab-fill {
    height: 100%; border-radius: 999px;
    background: linear-gradient(90deg, rgba(86,188,236,0.65), #56bcec);
    box-shadow: 0 0 12px var(--brand-glow);
  }
  .ab-count { font-size: 11px; color: var(--ink-3); text-align: right; }

  /* ── Calendar strip ────────────────────────────────────────────── */
  .cal-head { padding: 16px 18px 12px; border-bottom: 1px solid var(--brand-line); }
  .cal-scroll {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    padding: 14px 16px 18px;
    scrollbar-width: thin;
  }
  .cal-grid {
    display: flex; gap: 14px;
    min-width: max-content;
  }
  .cal-week {
    flex: 0 0 auto;
    width: 280px;
    border: 1px solid var(--brand-line);
    border-radius: 12px;
    padding: 10px;
    background: rgba(86,188,236,0.03);
  }
  .cw-label {
    font-size: 10.5px; color: var(--ink-3);
    letter-spacing: 0.08em; text-transform: uppercase;
    margin-bottom: 8px;
  }
  .cw-days { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
  .cw-day {
    min-height: 90px; padding: 6px 4px;
    border-radius: 8px;
    background: var(--canvas-2);
    border: 1px solid transparent;
    display: flex; flex-direction: column; gap: 4px;
  }
  .cw-day.today {
    border-color: var(--brand-line-2);
    background: rgba(86,188,236,0.06);
    box-shadow: inset 0 0 0 1px var(--brand-line);
  }
  .cd-label { font-size: 9.5px; color: var(--ink-3); }
  .cd-blocks { display: flex; flex-direction: column; gap: 3px; }
  .cd-block {
    all: unset; cursor: pointer;
    display: flex; flex-direction: column; gap: 1px;
    padding: 4px 6px; border-radius: 5px;
    font-size: 9.5px;
    background: rgba(86,188,236,0.10);
    border: 1px solid var(--brand-line);
    color: var(--ink);
    transition: background 0.14s, transform 0.14s;
  }
  .cd-block:hover { background: rgba(86,188,236,0.18); transform: translateX(1px); }
  .cdb-time { font-size: 9px; color: var(--ink-3); }
  .cdb-title { font-size: 10px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cd-block.status-analysed { background: rgba(155,124,255,0.10); border-color: rgba(155,124,255,0.30); }
  .cd-block.status-in_progress { background: rgba(86,188,236,0.20); border-color: var(--brand-line-2); }

  /* ── Drawer ────────────────────────────────────────────────────── */
  .drawer-backdrop {
    position: fixed; inset: 0;
    background: rgba(6,8,14,0.55);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    z-index: 90;
    display: flex; justify-content: flex-end;
    animation: dbf-fade 200ms ease;
  }
  @keyframes dbf-fade { from { opacity: 0; } to { opacity: 1; } }

  .meeting-drawer {
    width: min(520px, 100%);
    height: 100vh;
    background: var(--canvas-2);
    border-left: 1px solid var(--brand-line-2);
    box-shadow: -10px 0 40px -8px rgba(6,8,14,0.45);
    display: flex; flex-direction: column;
    animation: md-in 240ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  @keyframes md-in {
    from { transform: translateX(100%); }
    to   { transform: translateX(0); }
  }

  .md-head {
    padding: 18px 20px 14px;
    border-bottom: 1px solid var(--brand-line);
    display: flex; justify-content: space-between; gap: 12px;
  }
  .md-head-left { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .md-title { margin: 4px 0 6px; font-size: 18px; color: var(--ink); line-height: 1.3; }
  .md-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .md-meta-item { font-size: 12px; color: var(--ink-2); }
  .md-dot { width: 3px; height: 3px; border-radius: 50%; background: var(--ink-3); }
  .md-loc { margin: 6px 0 0; font-size: 12px; color: var(--ink-3); }

  .md-body {
    flex: 1; overflow-y: auto;
    padding: 18px 20px 24px;
    display: flex; flex-direction: column; gap: 22px;
  }
  .md-section { display: flex; flex-direction: column; gap: 8px; }
  .md-section-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
  .md-section-title {
    margin: 0; font-size: 10.5px;
    letter-spacing: 0.14em; text-transform: uppercase;
    color: var(--ink-3); font-weight: 600;
  }

  .md-attendees { display: flex; flex-wrap: wrap; gap: 6px; }
  .md-att-chip {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 4px 10px 4px 4px; border-radius: 999px;
    background: rgba(86,188,236,0.06);
    border: 1px solid var(--brand-line);
    font-size: 12px; color: var(--ink);
  }
  .md-att-init {
    width: 22px; height: 22px; border-radius: 50%;
    display: grid; place-items: center;
    font-size: 10px; font-weight: 600;
    background: rgba(86,188,236,0.18);
    color: #56bcec;
    font-family: "JetBrains Mono", monospace;
  }
  .md-att-name { font-size: 12px; }

  .md-textarea {
    width: 100%;
    min-height: 120px;
    padding: 12px 14px;
    border-radius: 10px;
    background: var(--canvas);
    border: 1px solid var(--brand-line);
    color: var(--ink);
    font-family: inherit; font-size: 13px; line-height: 1.6;
    resize: vertical;
    transition: border-color 0.14s, box-shadow 0.14s;
    box-sizing: border-box;
  }
  .md-textarea:focus {
    outline: none;
    border-color: var(--brand-line-2);
    box-shadow: 0 0 0 3px rgba(86,188,236,0.10);
  }

  .md-actions { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .md-action {
    display: grid;
    grid-template-columns: 22px 1fr auto auto;
    align-items: center; gap: 8px;
    padding: 6px 8px;
    border-radius: 8px;
    background: var(--canvas);
    border: 1px solid var(--brand-line);
  }
  .md-action.done .ma-input { text-decoration: line-through; color: var(--ink-3); }
  .ma-check {
    all: unset; cursor: pointer;
    width: 18px; height: 18px; border-radius: 5px;
    border: 1px solid var(--brand-line-2);
    display: grid; place-items: center;
    font-size: 11px; color: #56bcec;
    background: rgba(86,188,236,0.06);
    transition: background 0.14s;
  }
  .ma-check:hover { background: rgba(86,188,236,0.16); }
  .ma-input {
    all: unset; min-width: 0; flex: 1;
    font-size: 13px; color: var(--ink);
    padding: 4px 2px;
  }
  .ma-del {
    all: unset; cursor: pointer;
    width: 22px; height: 22px; display: grid; place-items: center;
    border-radius: 5px; color: var(--ink-3); font-size: 11px;
    transition: background 0.14s, color 0.14s;
  }
  .ma-del:hover { background: rgba(255,69,58,0.12); color: rgb(255,99,89); }

  .md-add-action { align-self: flex-start; margin-top: 4px; }

  .md-foot {
    padding: 14px 20px;
    border-top: 1px solid var(--brand-line);
    display: flex; justify-content: flex-end; gap: 8px;
  }

  /* ── Mobile ────────────────────────────────────────────────────── */
  @media (max-width: 760px) {
    .m-card {
      grid-template-columns: 1fr;
      gap: 8px;
    }
    .mc-date {
      flex-direction: row; gap: 10px; align-items: center;
      border-right: 0; padding-right: 0;
      padding-bottom: 8px; border-bottom: 1px solid var(--brand-line);
    }
    .mc-arrow { display: none; }
    .cal-week { width: 240px; }
    .cw-day { min-height: 70px; }
    .stats-row { grid-template-columns: repeat(2, 1fr); }
    .meeting-drawer {
      width: 100%;
      height: 90vh;
      border-left: 0;
      border-top-left-radius: 16px;
      border-top-right-radius: 16px;
      align-self: flex-end;
    }
    @keyframes md-in {
      from { transform: translateY(100%); }
      to   { transform: translateY(0); }
    }
  }
</style>

<script lang="ts">
  /**
   * /admin/tracker — CEO control panel (Workstream T.5).
   *
   * Five setting groups:
   *   1. FTE — per-member slider + weekly target
   *   2. Working hours — per-member weekday grid (CTI/FK Mon-Fri 9-18 etc.)
   *   3. Absences — pending queue with approve/reject buttons
   *   4. Billing rates — default + per-user + per-client overrides
   *   5. Holidays — read-only list, scoped by country/region
   *
   * Gated to tracker.manage_settings (CEO/CTO bypass via user.can short-circuit).
   * Non-CEO with the perm still works because the RPCs gate the same way.
   *
   * Every write goes through a tracker-admin-* HTTP function which calls
   * the corresponding SECURITY DEFINER RPC. Audit log row per save.
   */
  import { onMount, onDestroy } from "svelte";
  import { goto } from "$app/navigation";
  import { user } from "$stores/user.svelte";
  import {
    supabase,
    hasClient,
    postAuthed,
    subscribeTeamCapacity,
    subscribeAbsences,
    type TeamCapacity,
    type Absence,
  } from "$lib/db";
  import {
    GlassActionPrimary,
    GlassActionSecondary,
    GlassValueChip,
    GlassInlineLink,
  } from "$lib/components/glass";
  import { toast } from "$components/GlassToast.svelte";

  type Tab = "fte" | "hours" | "absences" | "rates" | "holidays";
  let activeTab = $state<Tab>("fte");
  let mounted = $state(false);

  // ── Shared state ─────────────────────────────────────────────────
  type Member = {
    id: string;
    code: string | null;
    color: string | null;
    display_name: string;
    email: string;
    role: string;
    country_code: string;
  };
  let members = $state<Member[]>([]);
  let capacities = $state<Record<string, TeamCapacity>>({});
  let hoursByUser = $state<Record<string, WorkingHourRow[]>>({});
  let pendingAbsences = $state<AbsenceWithName[]>([]);
  let approvedAbsences = $state<AbsenceWithName[]>([]);
  let rates = $state<RateRow[]>([]);
  let holidays = $state<HolidayRow[]>([]);

  type WorkingHourRow = { id: string; user_id: string; weekday: number; start_minutes: number; end_minutes: number; };
  type AbsenceWithName = Absence & { display_name?: string };
  type RateRow = { id: string; user_id: string | null; client_code: string | null; rate_chf_per_hour: number; effective_from: string; effective_to: string | null; notes: string | null; };
  type HolidayRow = { id: string; country_code: string; region_code: string | null; date: string; name: string; is_company: boolean; };

  // FTE form local state (per-member draft)
  let fteDraft = $state<Record<string, { fte: number; weekly: number }>>({});

  // Working-hours form local state
  let hoursDraft = $state<Record<string, WorkingHourRow[]>>({});
  let hoursSaving = $state(false);
  let hoursSavingFor = $state<string | null>(null);

  // Absences quick-action
  let absSavingId = $state<string | null>(null);

  // Rate add-form
  let rateForm = $state<{ target_user: string; client_code: string; rate: number; notes: string }>({
    target_user: "", client_code: "", rate: 180, notes: "",
  });
  let rateSaving = $state(false);

  // Realtime
  let unsubTC: (() => void) | null = null;
  let unsubABS: (() => void) | null = null;

  // ── Boot ─────────────────────────────────────────────────────────
  onMount(async () => {
    await user.init();
    if (!user.can("tracker.manage_settings") && !user.isAdmin) {
      goto("/tracker");
      return;
    }
    await loadAll();
    unsubTC = subscribeTeamCapacity((row) => {
      capacities[row.user_id] = row;
      capacities = capacities;
    });
    // Live absences queue — pending list re-renders without manual refresh
    unsubABS = subscribeAbsences(async (row, event) => {
      // Naive: refetch both queues. Small N; query is fast.
      if (event === "DELETE") {
        pendingAbsences = pendingAbsences.filter(a => a.id !== row.id);
        approvedAbsences = approvedAbsences.filter(a => a.id !== row.id);
        return;
      }
      const nameByUser = new Map(members.map(m => [m.id, m.display_name]));
      const fresh = { ...row, display_name: nameByUser.get(row.user_id) };
      // Remove from both queues first, then insert into the matching one
      pendingAbsences = pendingAbsences.filter(a => a.id !== row.id);
      approvedAbsences = approvedAbsences.filter(a => a.id !== row.id);
      if (row.status === "pending") {
        pendingAbsences = [fresh, ...pendingAbsences].sort((a, b) => a.start_date.localeCompare(b.start_date));
      } else if (row.status === "approved" && row.end_date >= new Date().toISOString().slice(0,10)) {
        approvedAbsences = [fresh, ...approvedAbsences].sort((a, b) => a.start_date.localeCompare(b.start_date));
      }
    });
    mounted = true;
  });
  onDestroy(() => { unsubTC?.(); unsubABS?.(); });

  async function loadAll() {
    if (!hasClient()) return;
    const [profilesR, capsR, hoursR, pendR, apprR, ratesR, holsR] = await Promise.all([
      supabase().from("user_profiles").select("id, code, color, display_name, email, role, country_code").eq("is_active", true),
      supabase().from("team_capacity").select("*"),
      supabase().from("working_hours").select("id, user_id, weekday, start_minutes, end_minutes").is("effective_to", null),
      supabase().from("absences").select("*").eq("status", "pending").order("start_date", { ascending: true }),
      supabase().from("absences").select("*").eq("status", "approved").gte("end_date", new Date().toISOString().slice(0,10)).order("start_date", { ascending: true }),
      supabase().from("billing_rates").select("*").order("created_at", { ascending: false }).limit(50),
      supabase().from("holidays").select("*").gte("date", new Date().toISOString().slice(0,10)).order("date", { ascending: true }).limit(200),
    ]);
    members = ((profilesR.data ?? []) as Member[]).sort((a, b) => a.display_name.localeCompare(b.display_name));
    const capsMap: Record<string, TeamCapacity> = {};
    for (const c of (capsR.data ?? []) as TeamCapacity[]) capsMap[c.user_id] = c;
    capacities = capsMap;

    const hoursMap: Record<string, WorkingHourRow[]> = {};
    for (const h of (hoursR.data ?? []) as WorkingHourRow[]) {
      if (!hoursMap[h.user_id]) hoursMap[h.user_id] = [];
      hoursMap[h.user_id].push(h);
    }
    for (const list of Object.values(hoursMap)) list.sort((a, b) => a.weekday - b.weekday);
    hoursByUser = hoursMap;

    // Seed FTE draft from current capacity rows
    const f: Record<string, { fte: number; weekly: number }> = {};
    for (const m of members) {
      const cap = capsMap[m.id];
      f[m.id] = { fte: cap?.fte_percent ?? 100, weekly: Number(cap?.weekly_target_hours ?? 42) };
    }
    fteDraft = f;

    // Seed hours draft as deep copy
    const h: Record<string, WorkingHourRow[]> = {};
    for (const [uid, rows] of Object.entries(hoursMap)) {
      h[uid] = rows.map((r) => ({ ...r }));
    }
    hoursDraft = h;

    // Names on absences
    const nameByUser = new Map(members.map((m) => [m.id, m.display_name]));
    pendingAbsences = ((pendR.data ?? []) as Absence[]).map((a) => ({ ...a, display_name: nameByUser.get(a.user_id) }));
    approvedAbsences = ((apprR.data ?? []) as Absence[]).map((a) => ({ ...a, display_name: nameByUser.get(a.user_id) }));

    rates = (ratesR.data ?? []) as RateRow[];
    holidays = (holsR.data ?? []) as HolidayRow[];
  }

  // ── FTE save ─────────────────────────────────────────────────────
  async function saveFte(memberId: string) {
    const draft = fteDraft[memberId];
    if (!draft) return;
    try {
      await postAuthed("/api/functions/tracker-admin-set-fte", {
        target_user: memberId,
        fte_percent: draft.fte,
        weekly_target_hours: draft.weekly,
      });
      toast(`FTE saved for ${members.find(m => m.id === memberId)?.display_name}`, "ok");
      // Capacity Realtime will refresh the row
    } catch (e: any) {
      toast(e?.message || "FTE save failed", "error");
    }
  }

  // ── Working hours save ───────────────────────────────────────────
  function toggleWeekday(memberId: string, weekday: number) {
    const list = hoursDraft[memberId] ?? [];
    const idx = list.findIndex((r) => r.weekday === weekday);
    if (idx >= 0) {
      list.splice(idx, 1);
    } else {
      list.push({ id: "", user_id: memberId, weekday, start_minutes: 540, end_minutes: 1080 });
      list.sort((a, b) => a.weekday - b.weekday);
    }
    hoursDraft[memberId] = [...list];
    hoursDraft = hoursDraft;
  }

  function updateHourSlot(memberId: string, weekday: number, field: "start_minutes" | "end_minutes", value: number) {
    const list = hoursDraft[memberId] ?? [];
    const idx = list.findIndex((r) => r.weekday === weekday);
    if (idx < 0) return;
    list[idx] = { ...list[idx], [field]: value };
    hoursDraft[memberId] = [...list];
    hoursDraft = hoursDraft;
  }

  async function saveWorkingHours(memberId: string) {
    const list = hoursDraft[memberId] ?? [];
    hoursSavingFor = memberId;
    try {
      const payload = list.map((r) => ({ weekday: r.weekday, start: r.start_minutes, end: r.end_minutes }));
      await postAuthed("/api/functions/tracker-admin-set-working-hours", {
        target_user: memberId,
        hours: payload,
      });
      toast(`Working hours saved (${payload.length} rows)`, "ok");
      await loadAll();
    } catch (e: any) {
      toast(e?.message || "Hours save failed", "error");
    } finally {
      hoursSavingFor = null;
    }
  }

  // ── Absences ─────────────────────────────────────────────────────
  async function decideAbsence(absenceId: string, status: "approved" | "rejected") {
    absSavingId = absenceId;
    try {
      await postAuthed("/api/functions/tracker-absence-decide", {
        absence_id: absenceId,
        status,
      });
      toast(`Absence ${status}`, status === "approved" ? "ok" : "warn");
      await loadAll();
    } catch (e: any) {
      toast(e?.message || "Absence decide failed", "error");
    } finally {
      absSavingId = null;
    }
  }

  // ── Rates ────────────────────────────────────────────────────────
  async function addRate() {
    if (!Number.isFinite(rateForm.rate) || rateForm.rate < 0) {
      toast("Rate must be a number ≥ 0", "error");
      return;
    }
    rateSaving = true;
    try {
      await postAuthed("/api/functions/tracker-admin-set-rate", {
        target_user: rateForm.target_user || null,
        client_code: rateForm.client_code.trim().toUpperCase() || null,
        rate_chf_per_hour: rateForm.rate,
        notes: rateForm.notes || null,
      });
      toast("Billing rate added", "ok");
      rateForm = { target_user: "", client_code: "", rate: 180, notes: "" };
      await loadAll();
    } catch (e: any) {
      toast(e?.message || "Rate save failed", "error");
    } finally {
      rateSaving = false;
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────
  function fmtMin(m: number): string {
    const h = Math.floor(m / 60), mm = m % 60;
    return `${String(h).padStart(2,"0")}:${String(mm).padStart(2,"0")}`;
  }
  function parseHm(v: string): number {
    const [h, m] = v.split(":").map((x) => parseInt(x, 10));
    return (h || 0) * 60 + (m || 0);
  }
  const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  function fmtDateRange(a: string, b: string): string {
    if (a === b) return a;
    return `${a} → ${b}`;
  }
  function absenceTone(kind: string): "info" | "warn" | "danger" | "neutral" | "success" | "violet" {
    if (kind === "vacation") return "info";
    if (kind === "sick")     return "warn";
    if (kind === "personal") return "violet";
    if (kind === "training") return "success";
    return "neutral";
  }
  function rateLabel(r: RateRow): string {
    if (!r.user_id && !r.client_code) return "Default rate";
    if (r.user_id && r.client_code)   return `${members.find(m => m.id === r.user_id)?.display_name || "?"} × ${r.client_code}`;
    if (r.user_id)                     return members.find(m => m.id === r.user_id)?.display_name || "?";
    return `Client ${r.client_code}`;
  }
</script>

<svelte:head><title>NEX · Tracker Admin</title></svelte:head>

{#if !mounted}
  <div class="page-loading">Loading tracker admin…</div>
{:else}
  <div class="admin-page">
    <header class="head">
      <div>
        <span class="eyebrow">Time Tracker · Admin</span>
        <h1>Tracker settings</h1>
        <p class="sub">FTE · working hours · absences · billing rates · holidays</p>
      </div>
      <div class="head-actions">
        <GlassInlineLink href="/tracker">← Back to /tracker</GlassInlineLink>
      </div>
    </header>

    <nav class="tabs" aria-label="Settings groups">
      {#each [
        ["fte", "FTE %"], ["hours", "Working hours"], ["absences", `Absences${pendingAbsences.length > 0 ? ` (${pendingAbsences.length})` : ""}`],
        ["rates", "Billing rates"], ["holidays", "Holidays"]
      ] as [k, label]}
        <button
          class="tab"
          class:active={activeTab === k}
          onclick={() => activeTab = k as Tab}>{label}</button>
      {/each}
    </nav>

    <!-- ─── FTE tab ──────────────────────────────────────────────── -->
    {#if activeTab === "fte"}
      <section class="panel">
        <h2 class="panel__title">FTE % + weekly target</h2>
        <p class="panel__sub">Slider sets full-time-equivalent percent. Weekly target hours seed the capacity bar on /tracker. Saving fires an audit log row.</p>
        <div class="rows">
          {#each members as m (m.id)}
            <div class="info-row" style={`--row-accent: ${m.color || "var(--brand)"};`}>
              <div class="info-row__id">
                <div class="info-row__avatar" aria-hidden="true">{(m.code || m.display_name).slice(0,2).toUpperCase()}</div>
                <div>
                  <div class="info-row__name">{m.display_name}</div>
                  <div class="info-row__role">{m.role.replace(/_/g, " ")} · {m.country_code}</div>
                </div>
              </div>
              <div class="info-row__controls">
                <label class="ctrl">
                  <span>FTE</span>
                  <input
                    type="range" min="0" max="100" step="5"
                    bind:value={fteDraft[m.id].fte}
                  />
                  <strong class="ctrl__val">{fteDraft[m.id].fte}%</strong>
                </label>
                <label class="ctrl ctrl--weekly">
                  <span>Weekly h</span>
                  <input
                    type="number" min="0" max="80" step="0.5"
                    bind:value={fteDraft[m.id].weekly}
                  />
                </label>
                <div class="ctrl__derived">
                  Daily target: <strong>{((fteDraft[m.id].weekly / 5) * (fteDraft[m.id].fte / 100)).toFixed(2)} h</strong>
                </div>
              </div>
              <div class="info-row__action">
                <GlassActionPrimary onclick={() => saveFte(m.id)}>
                  {#snippet children()}Save{/snippet}
                </GlassActionPrimary>
              </div>
            </div>
          {/each}
        </div>
      </section>
    {/if}

    <!-- ─── Working hours tab ────────────────────────────────────── -->
    {#if activeTab === "hours"}
      <section class="panel">
        <h2 class="panel__title">Working hours</h2>
        <p class="panel__sub">Toggle weekdays + set start/end (minutes-since-midnight under the hood). Saving closes the prior active rows and replaces them — old rows are kept with <code>effective_to</code> set.</p>
        <div class="hours-grid">
          {#each members as m (m.id)}
            <div class="hours-card" style={`--row-accent: ${m.color || "var(--brand)"};`}>
              <header class="hours-card__head">
                <div class="info-row__name">{m.display_name}</div>
                <GlassActionPrimary onclick={() => saveWorkingHours(m.id)} loading={hoursSavingFor === m.id}>
                  {#snippet children()}Save schedule{/snippet}
                </GlassActionPrimary>
              </header>
              <div class="hours-card__row">
                {#each [1,2,3,4,5,6,0] as wd}
                  {@const row = (hoursDraft[m.id] || []).find(r => r.weekday === wd)}
                  <button
                    type="button"
                    class="wd-toggle"
                    class:active={!!row}
                    onclick={() => toggleWeekday(m.id, wd)}
                    title="{WEEKDAYS[wd]} — click to toggle"
                  >{WEEKDAYS[wd]}</button>
                {/each}
              </div>
              <div class="hours-slots">
                {#each (hoursDraft[m.id] || []) as h}
                  <div class="slot">
                    <span class="slot__day">{WEEKDAYS[h.weekday]}</span>
                    <input
                      type="time" step="900"
                      value={fmtMin(h.start_minutes)}
                      onchange={(e) => updateHourSlot(m.id, h.weekday, "start_minutes", parseHm((e.target as HTMLInputElement).value))}
                    />
                    <span class="slot__sep">→</span>
                    <input
                      type="time" step="900"
                      value={fmtMin(h.end_minutes)}
                      onchange={(e) => updateHourSlot(m.id, h.weekday, "end_minutes", parseHm((e.target as HTMLInputElement).value))}
                    />
                    <span class="slot__hrs">{((h.end_minutes - h.start_minutes)/60).toFixed(1)} h</span>
                  </div>
                {:else}
                  <div class="slot slot--empty">No work days configured.</div>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      </section>
    {/if}

    <!-- ─── Absences tab ─────────────────────────────────────────── -->
    {#if activeTab === "absences"}
      <section class="panel">
        <h2 class="panel__title">Pending requests · {pendingAbsences.length}</h2>
        <p class="panel__sub">Approve here or via Telegram inline buttons (already wired).</p>
        <div class="rows">
          {#each pendingAbsences as a (a.id)}
            <div class="info-row">
              <div class="info-row__id">
                <div class="info-row__avatar" aria-hidden="true">{(a.display_name || "??").slice(0,2).toUpperCase()}</div>
                <div>
                  <div class="info-row__name">{a.display_name}</div>
                  <div class="info-row__role">{fmtDateRange(a.start_date, a.end_date)}{a.hours_per_day ? ` · ${a.hours_per_day} h/day` : ""}</div>
                </div>
              </div>
              <div class="info-row__chips">
                <GlassValueChip tone={absenceTone(a.kind)} size="sm" static>
                  {#snippet children()}{a.kind}{/snippet}
                </GlassValueChip>
                {#if a.reason}<span class="reason">"{a.reason}"</span>{/if}
              </div>
              <div class="info-row__action info-row__action--double">
                <GlassActionSecondary tone="danger" onclick={() => decideAbsence(a.id, "rejected")} loading={absSavingId === a.id}>
                  {#snippet children()}Reject{/snippet}
                </GlassActionSecondary>
                <GlassActionPrimary tone="success" onclick={() => decideAbsence(a.id, "approved")} loading={absSavingId === a.id}>
                  {#snippet children()}Approve{/snippet}
                </GlassActionPrimary>
              </div>
            </div>
          {:else}
            <div class="empty">No pending absence requests.</div>
          {/each}
        </div>
      </section>

      <section class="panel">
        <h2 class="panel__title">Upcoming approved · {approvedAbsences.length}</h2>
        <div class="rows">
          {#each approvedAbsences as a (a.id)}
            <div class="info-row info-row--quiet">
              <div class="info-row__id">
                <div class="info-row__avatar" aria-hidden="true">{(a.display_name || "??").slice(0,2).toUpperCase()}</div>
                <div>
                  <div class="info-row__name">{a.display_name}</div>
                  <div class="info-row__role">{fmtDateRange(a.start_date, a.end_date)}</div>
                </div>
              </div>
              <div class="info-row__chips">
                <GlassValueChip tone={absenceTone(a.kind)} size="sm" static>
                  {#snippet children()}{a.kind}{/snippet}
                </GlassValueChip>
                <GlassValueChip tone="success" size="sm" static>
                  {#snippet children()}approved{/snippet}
                </GlassValueChip>
              </div>
            </div>
          {:else}
            <div class="empty">No upcoming absences.</div>
          {/each}
        </div>
      </section>
    {/if}

    <!-- ─── Rates tab ────────────────────────────────────────────── -->
    {#if activeTab === "rates"}
      <section class="panel">
        <h2 class="panel__title">Billing rates · {rates.length}</h2>
        <p class="panel__sub">Resolution order at sync: (member × client) → (member) → (client) → default. Most-specific wins.</p>
        <div class="rate-add">
          <label class="ctrl">
            <span>Member (optional)</span>
            <select bind:value={rateForm.target_user}>
              <option value="">— any member —</option>
              {#each members as m (m.id)}
                <option value={m.id}>{m.display_name}</option>
              {/each}
            </select>
          </label>
          <label class="ctrl">
            <span>Client code (optional)</span>
            <input type="text" placeholder="e.g. SHI" bind:value={rateForm.client_code} />
          </label>
          <label class="ctrl">
            <span>Rate (CHF/h)</span>
            <input type="number" min="0" step="5" bind:value={rateForm.rate} />
          </label>
          <label class="ctrl ctrl--wide">
            <span>Notes</span>
            <input type="text" placeholder="optional" bind:value={rateForm.notes} />
          </label>
          <GlassActionPrimary onclick={addRate} loading={rateSaving}>
            {#snippet children()}+ Add rate{/snippet}
          </GlassActionPrimary>
        </div>

        <div class="rows">
          {#each rates as r (r.id)}
            <div class="info-row">
              <div class="info-row__id">
                <div class="info-row__name">{rateLabel(r)}</div>
                <div class="info-row__role">
                  effective from {r.effective_from}
                  {#if r.effective_to}· until {r.effective_to}{/if}
                </div>
              </div>
              <div class="info-row__chips">
                {#if r.notes}<span class="reason">"{r.notes}"</span>{/if}
              </div>
              <div class="info-row__action">
                <GlassValueChip tone="info" size="lg" static>
                  {#snippet children()}CHF {Number(r.rate_chf_per_hour).toFixed(0)}/h{/snippet}
                </GlassValueChip>
              </div>
            </div>
          {:else}
            <div class="empty">No rates yet — add a default to get started.</div>
          {/each}
        </div>
      </section>
    {/if}

    <!-- ─── Holidays tab ─────────────────────────────────────────── -->
    {#if activeTab === "holidays"}
      <section class="panel">
        <h2 class="panel__title">Upcoming holidays · {holidays.length}</h2>
        <p class="panel__sub">Seeded for CH (federal + ZH canton) + AT (federal + Vienna) for 2026-2028. The 5-min cron uses these to dim capacity-bar targets on non-working days.</p>
        <div class="rows">
          {#each holidays as h (h.id)}
            <div class="info-row info-row--quiet">
              <div class="info-row__id">
                <GlassValueChip tone={h.country_code === "CH" ? "info" : "violet"} size="sm" static>
                  {#snippet children()}{h.country_code}{h.region_code ? `·${h.region_code}` : ""}{/snippet}
                </GlassValueChip>
                <div>
                  <div class="info-row__name">{h.name}</div>
                  <div class="info-row__role">{h.date}</div>
                </div>
              </div>
              <div class="info-row__chips">
                {#if h.is_company}
                  <GlassValueChip tone="warn" size="sm" static>
                    {#snippet children()}company-day{/snippet}
                  </GlassValueChip>
                {/if}
              </div>
            </div>
          {:else}
            <div class="empty">No upcoming holidays in scope.</div>
          {/each}
        </div>
      </section>
    {/if}
  </div>
{/if}

<style>
  .page-loading { display: grid; place-items: center; min-height: 50vh; color: var(--t3); font-family: var(--sa); }
  .admin-page { max-width: 1280px; margin: 0 auto; padding: 32px 24px 80px; font-family: var(--sa); color: var(--tx); }

  .head { display: flex; justify-content: space-between; align-items: end; gap: 16px; padding-bottom: 16px; border-bottom: 1px solid var(--line); margin-bottom: 16px; }
  .eyebrow { font: 700 11px/1.3 var(--sa); letter-spacing: 0.12em; text-transform: uppercase; color: var(--brand-deep); }
  .head h1 { font-family: var(--hd); font-weight: 700; font-size: 28px; margin: 6px 0 4px; letter-spacing: -0.02em; }
  .sub { margin: 0; font-size: 13px; color: var(--t2); }

  .tabs { display: flex; gap: 4px; padding: 0; margin: 0 0 20px; flex-wrap: wrap; }
  .tab {
    appearance: none; cursor: pointer;
    padding: 10px 16px;
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: 999px;
    font: 600 12.5px/1 var(--sa);
    color: var(--t2);
    transition: background 120ms var(--ease), color 120ms var(--ease), border-color 120ms var(--ease);
  }
  .tab:hover { background: var(--s2); color: var(--tx); }
  .tab.active {
    background: var(--brand-soft);
    color: var(--brand-deep);
    border-color: var(--brand-line-2);
  }

  .panel {
    margin-bottom: 24px;
    padding: 20px;
    border-radius: var(--r2);
    background: var(--glass-card);
    backdrop-filter: var(--blur-card);
    -webkit-backdrop-filter: var(--blur-card);
    border: 1px solid var(--line);
    box-shadow: var(--sh-card);
  }
  .panel__title { margin: 0 0 4px; font-family: var(--hd); font-weight: 600; font-size: 18px; }
  .panel__sub   { margin: 0 0 16px; font-size: 12.5px; color: var(--t2); line-height: 1.5; }
  .panel__sub code { font-family: var(--mo); font-size: 11.5px; background: var(--s2); padding: 1px 5px; border-radius: 4px; }

  .rows { display: flex; flex-direction: column; gap: 8px; }
  .empty { padding: 24px; text-align: center; color: var(--t3); background: var(--s1); border-radius: var(--r1); border: 1px dashed var(--line-2); }

  .info-row {
    position: relative;
    display: grid;
    grid-template-columns: minmax(160px, 1.2fr) 2fr auto;
    gap: 16px;
    align-items: center;
    padding: 14px 16px 14px 20px;
    border-radius: var(--r1);
    background: var(--s1);
    border: 1px solid var(--line);
    overflow: hidden;
    transition: background 120ms var(--ease), border-color 120ms var(--ease);
  }
  .info-row::before {
    content: "";
    position: absolute; left: 0; top: 0; bottom: 0;
    width: 4px;
    background: var(--row-accent, var(--brand));
    opacity: .65;
  }
  .info-row:hover { background: var(--s2); border-color: var(--line-2); }
  .info-row--quiet { padding: 10px 12px 10px 18px; }

  .info-row__id { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .info-row__avatar {
    width: 36px; height: 36px;
    border-radius: 50%;
    background: var(--row-accent, var(--brand-soft));
    color: white;
    display: grid; place-items: center;
    font: 700 12px/1 var(--mo);
    flex-shrink: 0;
  }
  .info-row__name { font: 600 13.5px/1.2 var(--sa); color: var(--tx); }
  .info-row__role { font: 500 11px/1.3 var(--sa); color: var(--t3); text-transform: capitalize; }

  .info-row__controls { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
  .info-row__chips    { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0; }
  .info-row__action   { display: inline-flex; gap: 6px; }
  .info-row__action--double { gap: 8px; }
  .reason { font: italic 500 12px/1.4 var(--sa); color: var(--t3); }

  .ctrl { display: inline-flex; align-items: center; gap: 8px; }
  .ctrl > span { font: 600 11px/1.2 var(--sa); color: var(--t3); text-transform: uppercase; letter-spacing: 0.06em; }
  .ctrl input[type="range"] { width: 140px; }
  .ctrl input[type="number"], .ctrl input[type="text"], .ctrl input[type="time"], .ctrl select {
    appearance: none;
    padding: 8px 10px;
    font: 500 13px/1 var(--sa);
    color: var(--tx);
    background: var(--s2);
    border: 1px solid var(--line);
    border-radius: 8px;
    min-width: 90px;
  }
  .ctrl input:focus, .ctrl select:focus { border-color: var(--brand-line-2); outline: none; box-shadow: 0 0 0 3px var(--brand-line-2); }
  .ctrl__val { font-family: var(--mo); font-variant-numeric: tabular-nums; min-width: 48px; text-align: right; font-weight: 700; }
  .ctrl__derived { font: 500 12px/1.3 var(--sa); color: var(--t2); }
  .ctrl--weekly input { width: 78px; }
  .ctrl--wide input { width: 200px; }

  /* Working hours grid */
  .hours-grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
  .hours-card {
    padding: 14px 16px 14px 20px;
    border-radius: var(--r2);
    background: var(--s1);
    border: 1px solid var(--line);
    position: relative;
    overflow: hidden;
  }
  .hours-card::before {
    content: ""; position: absolute; left: 0; top: 0; bottom: 0;
    width: 4px; background: var(--row-accent, var(--brand));
    opacity: .65;
  }
  .hours-card__head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; gap: 12px; }
  .hours-card__row { display: flex; gap: 6px; margin-bottom: 12px; flex-wrap: wrap; }
  .wd-toggle {
    appearance: none; cursor: pointer;
    padding: 6px 12px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--s2);
    color: var(--t2);
    font: 600 11px/1 var(--sa);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    transition: background 120ms var(--ease), color 120ms var(--ease), border-color 120ms var(--ease);
  }
  .wd-toggle:hover { background: var(--brand-soft); color: var(--brand-deep); }
  .wd-toggle.active { background: var(--brand-soft); color: var(--brand-deep); border-color: var(--brand-line-2); }

  .hours-slots { display: flex; flex-direction: column; gap: 6px; }
  .slot { display: grid; grid-template-columns: 50px 110px 20px 110px auto; gap: 8px; align-items: center; font: 500 13px/1 var(--sa); color: var(--t2); }
  .slot__day { font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; font-size: 11px; color: var(--t3); }
  .slot__sep { color: var(--t4); text-align: center; }
  .slot__hrs { font-family: var(--mo); font-variant-numeric: tabular-nums; color: var(--t2); }
  .slot--empty { grid-column: 1 / -1; color: var(--t3); font-style: italic; padding: 8px 0; }

  /* Rate add form */
  .rate-add {
    display: flex; flex-wrap: wrap; gap: 12px; align-items: end;
    padding: 16px;
    background: var(--s1);
    border: 1px dashed var(--line-2);
    border-radius: var(--r1);
    margin-bottom: 16px;
  }
  .rate-add .ctrl { flex-direction: column; align-items: stretch; gap: 4px; }

  @media (max-width: 760px) {
    .admin-page { padding: 20px 16px 64px; }
    .head { flex-direction: column; align-items: flex-start; }
    .panel { padding: 16px; }
    .info-row { grid-template-columns: 1fr; gap: 8px; padding: 12px 12px 12px 18px; }
    .info-row__controls { flex-wrap: wrap; }
    .info-row__action { justify-content: stretch; }
    .info-row__action--double { display: grid; grid-template-columns: 1fr 1fr; }
    .rate-add { flex-direction: column; align-items: stretch; }
    .ctrl input[type="range"] { width: 100%; }
  }
</style>

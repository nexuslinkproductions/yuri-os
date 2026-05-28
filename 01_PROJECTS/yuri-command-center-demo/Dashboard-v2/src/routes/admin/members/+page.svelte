<script lang="ts">
  /**
   * /admin/members — Team member admin center (T.7.3 follow-up).
   *
   * Per-person settings: identity, capacity (FTE + weekly target),
   * working hours, billing rate overrides, recent absences, permissions
   * deep-link. All on one screen — click a member card, the right rail
   * sheet opens with every editable field.
   *
   * Gated to CEO/CTO via user.isAdmin. RLS on user_profiles enforces too.
   *
   * Pulls all data on mount:
   *   - user_profiles (active members + their role/code/color/country)
   *   - team_capacity (FTE + weekly target)
   *   - working_hours (weekday × time range)
   *   - billing_rates (per-user overrides)
   *   - absences (upcoming + pending for context)
   */
  import { onMount, onDestroy } from "svelte";
  import { goto } from "$app/navigation";
  import { user } from "$stores/user.svelte";
  import {
    supabase,
    hasClient,
    postAuthed,
    subscribeTeamCapacity,
    subscribeUserProfiles,
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
  import AdminSubNav from "$lib/components/admin/AdminSubNav.svelte";

  // ── Types ─────────────────────────────────────────────────────────
  type Member = {
    id: string;
    email: string;
    display_name: string;
    role: string;
    avatar_url: string | null;
    code: string | null;
    color: string | null;
    country_code: string | null;
    telegram_chat_id: string | null;
    aliases: string[] | null;
    is_active: boolean;
  };
  type WorkingHourRow = {
    id: string;
    user_id: string;
    weekday: number;
    start_minutes: number;
    end_minutes: number;
  };
  type RateRow = {
    id: string;
    user_id: string | null;
    client_code: string | null;
    rate_chf_per_hour: number;
    effective_from: string;
    effective_to: string | null;
    notes: string | null;
  };

  // ── State ─────────────────────────────────────────────────────────
  let mounted = $state(false);
  let members = $state<Member[]>([]);
  let capacities = $state<Record<string, TeamCapacity>>({});
  let hoursByUser = $state<Record<string, WorkingHourRow[]>>({});
  let ratesByUser = $state<Record<string, RateRow[]>>({});
  let absencesByUser = $state<Record<string, Absence[]>>({});

  // Side-sheet target
  let selectedId = $state<string | null>(null);
  const selected = $derived<Member | null>(
    selectedId ? members.find(m => m.id === selectedId) ?? null : null
  );

  // Per-section save state
  let savingIdentity = $state(false);
  let savingCapacity = $state(false);
  let savingHours    = $state<string | null>(null);

  // Drafts for the side sheet
  let dIdentity = $state<{
    display_name: string;
    role: string;
    code: string;
    color: string;
    country_code: string;
    telegram_chat_id: string;
    aliases: string;
    is_active: boolean;
  } | null>(null);
  let dCapacity = $state<{ fte_percent: number; weekly_target_hours: number } | null>(null);
  let dHours = $state<WorkingHourRow[]>([]);

  // Realtime subs
  let unsubTC: (() => void) | null = null;
  let unsubUP: (() => void) | null = null;

  // ── Boot ──────────────────────────────────────────────────────────
  onMount(async () => {
    await user.init();
    if (!user.isAdmin) {
      goto("/");
      return;
    }
    await loadAll();
    unsubTC = subscribeTeamCapacity((row) => {
      capacities[row.user_id] = row;
      capacities = capacities;
      // Refresh the open sheet's draft if it's the same member
      if (selectedId === row.user_id) seedCapacityDraft(row);
    });
    unsubUP = subscribeUserProfiles((row, event) => {
      if (event === "DELETE") {
        members = members.filter(m => m.id !== row.id);
        return;
      }
      const idx = members.findIndex(m => m.id === row.id);
      const next: Member = {
        id: row.id,
        email: row.email,
        display_name: row.display_name || row.email,
        role: row.role || "",
        avatar_url: row.avatar_url,
        code: row.code,
        color: row.color,
        country_code: row.country_code,
        telegram_chat_id: (row as any).telegram_chat_id ?? null,
        aliases: Array.isArray((row as any).aliases) ? (row as any).aliases : null,
        is_active: !!row.is_active,
      };
      if (idx >= 0) members[idx] = next;
      else          members = [...members, next];
      members = members;
    });
    mounted = true;
  });
  onDestroy(() => { unsubTC?.(); unsubUP?.(); });

  async function loadAll() {
    if (!hasClient()) return;
    const [profilesR, capsR, hoursR, ratesR, absR] = await Promise.all([
      supabase()
        .from("user_profiles")
        .select("id, email, display_name, role, avatar_url, code, color, country_code, telegram_chat_id, aliases, is_active")
        .order("display_name"),
      supabase().from("team_capacity").select("*"),
      supabase().from("working_hours").select("*").is("effective_to", null),
      supabase().from("billing_rates").select("*").is("effective_to", null).not("user_id", "is", null).order("created_at", { ascending: false }),
      supabase().from("absences").select("*").gte("end_date", new Date().toISOString().slice(0,10)).order("start_date", { ascending: true }),
    ]);
    members = ((profilesR.data ?? []) as any[]).map((p) => ({
      id: p.id,
      email: p.email,
      display_name: p.display_name || p.email,
      role: p.role || "",
      avatar_url: p.avatar_url,
      code: p.code,
      color: p.color,
      country_code: p.country_code,
      telegram_chat_id: p.telegram_chat_id ?? null,
      aliases: Array.isArray(p.aliases) ? p.aliases : null,
      is_active: !!p.is_active,
    }));
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

    const ratesMap: Record<string, RateRow[]> = {};
    for (const r of (ratesR.data ?? []) as RateRow[]) {
      if (!r.user_id) continue;
      if (!ratesMap[r.user_id]) ratesMap[r.user_id] = [];
      ratesMap[r.user_id].push(r);
    }
    ratesByUser = ratesMap;

    const absMap: Record<string, Absence[]> = {};
    for (const a of (absR.data ?? []) as Absence[]) {
      if (!absMap[a.user_id]) absMap[a.user_id] = [];
      absMap[a.user_id].push(a);
    }
    absencesByUser = absMap;
  }

  // ── Sheet open / close ────────────────────────────────────────────
  function openSheet(m: Member) {
    selectedId = m.id;
    seedIdentityDraft(m);
    seedCapacityDraft(capacities[m.id] ?? null);
    seedHoursDraft(hoursByUser[m.id] ?? []);
  }
  function closeSheet() {
    selectedId = null;
    dIdentity = null; dCapacity = null; dHours = [];
  }

  function seedIdentityDraft(m: Member) {
    dIdentity = {
      display_name: m.display_name ?? "",
      role: m.role ?? "",
      code: m.code ?? "",
      color: m.color ?? "#56BCEC",
      country_code: m.country_code ?? "CH",
      telegram_chat_id: m.telegram_chat_id ?? "",
      aliases: Array.isArray(m.aliases) ? m.aliases.join(", ") : "",
      is_active: m.is_active,
    };
  }
  function seedCapacityDraft(cap: TeamCapacity | null) {
    dCapacity = {
      fte_percent: cap?.fte_percent ?? 100,
      weekly_target_hours: Number(cap?.weekly_target_hours ?? 42),
    };
  }
  function seedHoursDraft(rows: WorkingHourRow[]) {
    dHours = rows.map(r => ({ ...r }));
  }

  // ── Identity save ─────────────────────────────────────────────────
  async function saveIdentity() {
    if (!selected || !dIdentity) return;
    savingIdentity = true;
    try {
      const aliases = dIdentity.aliases
        .split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
      const fields: Record<string, unknown> = {
        display_name: dIdentity.display_name.trim(),
        role: dIdentity.role.trim(),
        code: dIdentity.code.trim() || null,
        color: dIdentity.color.trim() || null,
        country_code: dIdentity.country_code.trim() || null,
        telegram_chat_id: dIdentity.telegram_chat_id.trim() || null,
        aliases,
        is_active: dIdentity.is_active,
      };
      const r = await postAuthed("/api/functions/member-admin-update", {
        target_user: selected.id, fields,
      });
      if (r?.ok) {
        toast(`Identity saved · ${selected.display_name}`, "ok");
        // Realtime will refresh members list
      }
    } catch (e: any) {
      toast(e?.message || "Identity save failed", "error");
    } finally {
      savingIdentity = false;
    }
  }

  // ── Capacity save (reuses existing tracker-admin-set-fte) ─────────
  async function saveCapacity() {
    if (!selected || !dCapacity) return;
    savingCapacity = true;
    try {
      await postAuthed("/api/functions/tracker-admin-set-fte", {
        target_user: selected.id,
        fte_percent: dCapacity.fte_percent,
        weekly_target_hours: dCapacity.weekly_target_hours,
      });
      toast(`Capacity saved · ${selected.display_name}`, "ok");
    } catch (e: any) {
      toast(e?.message || "Capacity save failed", "error");
    } finally {
      savingCapacity = false;
    }
  }

  // ── Working hours edit ────────────────────────────────────────────
  function toggleWeekday(weekday: number) {
    const i = dHours.findIndex(r => r.weekday === weekday);
    if (i >= 0) dHours.splice(i, 1);
    else        dHours.push({ id: "", user_id: selected?.id || "", weekday, start_minutes: 540, end_minutes: 1080 });
    dHours.sort((a, b) => a.weekday - b.weekday);
    dHours = [...dHours];
  }
  function updateSlot(weekday: number, field: "start_minutes" | "end_minutes", value: number) {
    const i = dHours.findIndex(r => r.weekday === weekday);
    if (i < 0) return;
    dHours[i] = { ...dHours[i], [field]: value };
    dHours = [...dHours];
  }
  async function saveHours() {
    if (!selected) return;
    savingHours = selected.id;
    try {
      const payload = dHours.map(r => ({ weekday: r.weekday, start: r.start_minutes, end: r.end_minutes }));
      await postAuthed("/api/functions/tracker-admin-set-working-hours", {
        target_user: selected.id, hours: payload,
      });
      toast(`Working hours saved (${payload.length} weekdays)`, "ok");
      // Refresh local cache from DB
      await loadAll();
    } catch (e: any) {
      toast(e?.message || "Hours save failed", "error");
    } finally {
      savingHours = null;
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────
  function fmtMin(m: number): string {
    const h = Math.floor(m / 60), mm = m % 60;
    return `${String(h).padStart(2,"0")}:${String(mm).padStart(2,"0")}`;
  }
  function parseHm(v: string): number {
    const [h, m] = v.split(":").map(x => parseInt(x, 10));
    return (h || 0) * 60 + (m || 0);
  }
  const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  function dailyTargetH(c: TeamCapacity | undefined): number {
    if (!c) return 0;
    return Number(c.daily_target_hours ?? 0);
  }
</script>

<svelte:head><title>NEX · Members · Admin</title></svelte:head>

{#if !mounted}
  <div class="page-loading">Loading member admin…</div>
{:else}
  <div class="admin-page" class:admin-page--sheet-open={selected}>
    <AdminSubNav />
    <header class="head">
      <div>
        <span class="eyebrow">Admin · Team members</span>
        <h1>Member admin center</h1>
        <p class="sub">Identity · capacity · working hours · billing rates · permissions — one click per person.</p>
      </div>
      <div class="head-actions">
        <GlassInlineLink href="/admin/tracker">/admin/tracker (global settings)</GlassInlineLink>
        <GlassInlineLink href="/admin/permissions">/admin/permissions (access)</GlassInlineLink>
      </div>
    </header>

    <div class="grid">
      {#each members as m (m.id)}
        {@const cap = capacities[m.id]}
        {@const hrs = hoursByUser[m.id] ?? []}
        {@const rateCount = ratesByUser[m.id]?.length ?? 0}
        {@const absCount  = absencesByUser[m.id]?.length ?? 0}
        <button
          type="button"
          class="m-card"
          class:m-card--active={selectedId === m.id}
          class:m-card--inactive={!m.is_active}
          onclick={() => openSheet(m)}
          style={`--member-accent: ${m.color || "var(--brand)"};`}
        >
          <span class="m-card__bar" aria-hidden="true"></span>

          <div class="m-card__head">
            <div class="m-card__avatar" aria-hidden="true">
              {#if m.avatar_url}
                <img src={m.avatar_url} alt="" />
              {:else}
                <span>{(m.code || m.display_name).slice(0, 2).toUpperCase()}</span>
              {/if}
            </div>
            <div class="m-card__id">
              <div class="m-card__name">{m.display_name}</div>
              <div class="m-card__email">{m.email}</div>
            </div>
          </div>

          <div class="m-card__chips">
            <GlassValueChip tone="info" size="sm" static>
              {#snippet children()}{m.code || "?"}{/snippet}
            </GlassValueChip>
            <GlassValueChip tone="violet" size="sm" static>
              {#snippet children()}{m.role.replace(/_/g, " ")}{/snippet}
            </GlassValueChip>
            <GlassValueChip tone="neutral" size="sm" static>
              {#snippet children()}{m.country_code || "—"}{/snippet}
            </GlassValueChip>
            {#if !m.is_active}
              <GlassValueChip tone="danger" size="sm" static>
                {#snippet children()}inactive{/snippet}
              </GlassValueChip>
            {/if}
          </div>

          <dl class="m-card__stats">
            <div><dt>FTE</dt><dd>{cap?.fte_percent ?? 100}%</dd></div>
            <div><dt>Weekly</dt><dd>{Number(cap?.weekly_target_hours ?? 42).toFixed(0)} h</dd></div>
            <div><dt>Daily</dt><dd>{dailyTargetH(cap).toFixed(1)} h</dd></div>
            <div><dt>Workdays</dt><dd>{hrs.length}</dd></div>
            <div><dt>Rates</dt><dd>{rateCount}</dd></div>
            <div><dt>Absences</dt><dd>{absCount}</dd></div>
          </dl>
        </button>
      {/each}
    </div>
  </div>

  <!-- ─── Side sheet ────────────────────────────────────────────── -->
  {#if selected && dIdentity && dCapacity}
    <div class="sheet" role="dialog" aria-modal="true" aria-label={`Edit ${selected.display_name}`}>
      <div class="sheet__backdrop" onclick={closeSheet} role="presentation"></div>
      <aside class="sheet__panel">
        <header class="sheet__head">
          <div class="sheet__id">
            <div class="sheet__avatar" aria-hidden="true" style={`--member-accent: ${selected.color || "var(--brand)"};`}>
              {#if selected.avatar_url}
                <img src={selected.avatar_url} alt="" />
              {:else}
                <span>{(selected.code || selected.display_name).slice(0, 2).toUpperCase()}</span>
              {/if}
            </div>
            <div>
              <span class="sheet__eyebrow">Member admin</span>
              <h2>{selected.display_name}</h2>
              <p class="sheet__email">{selected.email}</p>
            </div>
          </div>
          <button type="button" class="sheet__close" aria-label="Close" onclick={closeSheet}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </header>

        <div class="sheet__body">
          <!-- ─── IDENTITY ─── -->
          <section class="sect">
            <header class="sect__head"><span class="sect__icon">🟢</span><h3>Identity</h3></header>
            <div class="grid2">
              <label class="full"><span>Display name</span>
                <input type="text" bind:value={dIdentity.display_name} />
              </label>
              <label><span>Role</span>
                <select bind:value={dIdentity.role}>
                  <option value="ceo">CEO</option>
                  <option value="cto">CTO</option>
                  <option value="marketing_manager">Marketing manager</option>
                  <option value="partner">Partner</option>
                  <option value="operator">Operator</option>
                </select>
              </label>
              <label><span>Country</span>
                <select bind:value={dIdentity.country_code}>
                  <option value="CH">CH</option>
                  <option value="AT">AT</option>
                  <option value="DE">DE</option>
                  <option value="LI">LI</option>
                  <option value="FR">FR</option>
                  <option value="IT">IT</option>
                </select>
              </label>
              <label><span>Roster code</span>
                <input type="text" maxlength="4" bind:value={dIdentity.code} placeholder="CTI / FK / MS" />
              </label>
              <label><span>Brand colour</span>
                <input type="color" bind:value={dIdentity.color} />
              </label>
              <label class="full"><span>Telegram chat ID</span>
                <input type="text" bind:value={dIdentity.telegram_chat_id} placeholder="e.g. 8265895585" />
              </label>
              <label class="full"><span>Aliases (comma-separated)</span>
                <input type="text" bind:value={dIdentity.aliases} placeholder="fk, fanny, kecskes" />
              </label>
              <label class="full checkbox">
                <input type="checkbox" bind:checked={dIdentity.is_active} />
                <span>Active team member</span>
              </label>
            </div>
            <div class="sect__foot">
              <GlassActionPrimary onclick={saveIdentity} loading={savingIdentity}>
                {#snippet children()}Save identity{/snippet}
              </GlassActionPrimary>
            </div>
          </section>

          <!-- ─── CAPACITY ─── -->
          <section class="sect">
            <header class="sect__head"><span class="sect__icon">📊</span><h3>Capacity</h3></header>
            <div class="cap-row">
              <label class="cap-slider">
                <span>FTE</span>
                <input type="range" min="0" max="100" step="5" bind:value={dCapacity.fte_percent} />
                <strong>{dCapacity.fte_percent}%</strong>
              </label>
              <label class="cap-num">
                <span>Weekly target (h)</span>
                <input type="number" min="0" max="80" step="0.5" bind:value={dCapacity.weekly_target_hours} />
              </label>
            </div>
            <p class="cap-derived">Daily target → <strong>{((dCapacity.weekly_target_hours / 5) * (dCapacity.fte_percent / 100)).toFixed(2)} h</strong></p>
            <div class="sect__foot">
              <GlassActionPrimary onclick={saveCapacity} loading={savingCapacity}>
                {#snippet children()}Save capacity{/snippet}
              </GlassActionPrimary>
            </div>
          </section>

          <!-- ─── WORKING HOURS ─── -->
          <section class="sect">
            <header class="sect__head"><span class="sect__icon">🕐</span><h3>Working hours</h3></header>
            <div class="wd-row">
              {#each [1,2,3,4,5,6,0] as wd}
                {@const row = dHours.find(r => r.weekday === wd)}
                <button type="button" class="wd-pill" class:wd-pill--on={!!row} onclick={() => toggleWeekday(wd)}>
                  {WEEKDAYS[wd]}
                </button>
              {/each}
            </div>
            <div class="hr-slots">
              {#each dHours as h (h.weekday)}
                <div class="hr-slot">
                  <span class="hr-slot__day">{WEEKDAYS[h.weekday]}</span>
                  <input type="time" step="900" value={fmtMin(h.start_minutes)}
                    onchange={(e) => updateSlot(h.weekday, "start_minutes", parseHm((e.target as HTMLInputElement).value))} />
                  <span class="hr-slot__sep">→</span>
                  <input type="time" step="900" value={fmtMin(h.end_minutes)}
                    onchange={(e) => updateSlot(h.weekday, "end_minutes", parseHm((e.target as HTMLInputElement).value))} />
                  <span class="hr-slot__hrs">{((h.end_minutes - h.start_minutes)/60).toFixed(1)} h</span>
                </div>
              {:else}
                <p class="hr-empty">No work days configured yet — toggle weekdays above.</p>
              {/each}
            </div>
            <div class="sect__foot">
              <GlassActionPrimary onclick={saveHours} loading={savingHours === selected.id}>
                {#snippet children()}Save schedule{/snippet}
              </GlassActionPrimary>
            </div>
          </section>

          <!-- ─── BILLING RATES (read + link out) ─── -->
          <section class="sect">
            <header class="sect__head">
              <span class="sect__icon">💰</span><h3>Billing rates</h3>
              <GlassInlineLink href="/admin/tracker">manage in /admin/tracker → Rates</GlassInlineLink>
            </header>
            {#if (ratesByUser[selected.id] ?? []).length === 0}
              <p class="empty">No per-member rate overrides. Falls back to default + per-service tier.</p>
            {:else}
              <ul class="rate-list">
                {#each ratesByUser[selected.id] as r}
                  <li>
                    <span class="rate-amount">CHF {Number(r.rate_chf_per_hour).toFixed(0)}/h</span>
                    {#if r.client_code}
                      <GlassValueChip tone="info" size="sm" static>
                        {#snippet children()}× {r.client_code}{/snippet}
                      </GlassValueChip>
                    {/if}
                    <span class="rate-from">from {r.effective_from}</span>
                  </li>
                {/each}
              </ul>
            {/if}
          </section>

          <!-- ─── ABSENCES (read + link out) ─── -->
          <section class="sect">
            <header class="sect__head">
              <span class="sect__icon">🏖️</span><h3>Upcoming absences</h3>
              <GlassInlineLink href="/admin/tracker">manage in /admin/tracker → Absences</GlassInlineLink>
            </header>
            {#if (absencesByUser[selected.id] ?? []).length === 0}
              <p class="empty">No upcoming absences.</p>
            {:else}
              <ul class="abs-list">
                {#each absencesByUser[selected.id] as a}
                  <li>
                    <GlassValueChip tone={a.status === "pending" ? "warn" : a.status === "approved" ? "success" : "neutral"} size="sm" static>
                      {#snippet children()}{a.status}{/snippet}
                    </GlassValueChip>
                    <span class="abs-kind">{a.kind}</span>
                    <span class="abs-range">{a.start_date} → {a.end_date}</span>
                  </li>
                {/each}
              </ul>
            {/if}
          </section>

          <!-- ─── PERMISSIONS link ─── -->
          <section class="sect">
            <header class="sect__head">
              <span class="sect__icon">🔐</span><h3>Permissions</h3>
              <GlassInlineLink href="/admin/permissions">edit in /admin/permissions →</GlassInlineLink>
            </header>
            <p class="empty">Each role has defaults. Per-user overrides set in /admin/permissions.</p>
          </section>
        </div>
      </aside>
    </div>
  {/if}
{/if}

<style>
  .page-loading { display: grid; place-items: center; min-height: 50vh; color: var(--t3); font-family: var(--sa); }
  .admin-page {
    max-width: 1280px;
    margin: 0 auto;
    padding: 32px 24px 80px;
    font-family: var(--sa);
    color: var(--tx);
    transition: filter 200ms;
  }
  .admin-page--sheet-open { filter: blur(0); }

  .head {
    display: flex; justify-content: space-between; align-items: end;
    gap: 16px; flex-wrap: wrap;
    padding-bottom: 16px; border-bottom: 1px solid var(--line);
    margin-bottom: 24px;
  }
  .eyebrow { font: 700 11px/1.3 var(--sa); letter-spacing: 0.12em; text-transform: uppercase; color: var(--brand-deep); }
  .head h1 { font-family: var(--hd); font-weight: 700; font-size: 26px; margin: 6px 0 4px; letter-spacing: -0.02em; }
  .sub { margin: 0; font-size: 13px; color: var(--t2); }
  .head-actions { display: flex; gap: 12px; flex-wrap: wrap; }

  /* ─── Member card grid ─── */
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 16px;
  }
  .m-card {
    position: relative;
    display: flex; flex-direction: column;
    gap: 12px;
    padding: 18px;
    border-radius: var(--r2);
    background: var(--glass-card);
    backdrop-filter: var(--blur-card);
    -webkit-backdrop-filter: var(--blur-card);
    border: 1px solid var(--line);
    box-shadow: var(--sh-card);
    text-align: left;
    cursor: pointer;
    overflow: hidden;
    transition: transform 140ms var(--tier-spring, cubic-bezier(.34,1.56,.64,1)),
                box-shadow 140ms var(--ease),
                border-color 140ms var(--ease);
    appearance: none;
    color: inherit;
    font-family: inherit;
  }
  .m-card:hover { transform: translateY(-2px); box-shadow: var(--sh-card-hover); border-color: var(--brand-line); }
  .m-card--active { border-color: var(--brand); box-shadow: 0 0 0 1px var(--brand), var(--sh-card-hover); }
  .m-card--inactive { opacity: 0.7; }
  .m-card__bar {
    position: absolute; inset: 0 0 auto 0; height: 4px;
    background: var(--member-accent, var(--brand));
  }

  .m-card__head { display: flex; align-items: center; gap: 12px; }
  .m-card__avatar {
    width: 44px; height: 44px;
    border-radius: 50%;
    background: var(--s2);
    display: grid; place-items: center;
    overflow: hidden;
    border: 2px solid var(--member-accent, var(--brand));
    font: 700 13px/1 var(--mo);
    color: var(--t2);
    flex-shrink: 0;
  }
  .m-card__avatar img { width: 100%; height: 100%; object-fit: cover; }
  .m-card__id { min-width: 0; flex: 1; }
  .m-card__name { font: 700 15px/1.2 var(--sa); color: var(--tx); }
  .m-card__email { font: 500 12px/1.3 var(--mo); color: var(--t3); margin-top: 2px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .m-card__chips { display: flex; gap: 6px; flex-wrap: wrap; }

  .m-card__stats {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px 12px;
    margin: 4px 0 0; padding-top: 10px; border-top: 1px solid var(--line);
  }
  .m-card__stats div { display: flex; flex-direction: column; gap: 2px; }
  .m-card__stats dt { font: 700 10px/1.2 var(--sa); letter-spacing: 0.08em; text-transform: uppercase; color: var(--t3); }
  .m-card__stats dd { margin: 0; font: 700 13px/1 var(--mo); color: var(--tx); font-variant-numeric: tabular-nums; }

  /* ─── Sheet ─── */
  .sheet { position: fixed; inset: 0; z-index: var(--z-modal, 1000); }
  .sheet__backdrop {
    position: absolute; inset: 0;
    background: rgba(8, 11, 20, 0.45);
    backdrop-filter: blur(10px) saturate(1.2);
    -webkit-backdrop-filter: blur(10px) saturate(1.2);
  }
  .sheet__panel {
    position: absolute; top: 0; right: 0; bottom: 0;
    width: min(640px, 100%);
    background: var(--glass-elev);
    backdrop-filter: var(--blur-elev);
    -webkit-backdrop-filter: var(--blur-elev);
    border-left: 1px solid var(--brand-line);
    box-shadow: var(--sh-elev);
    display: flex; flex-direction: column;
    animation: sheet-in 240ms var(--tier-spring, cubic-bezier(.34,1.56,.64,1)) both;
    overflow: hidden;
  }
  @keyframes sheet-in {
    from { transform: translateX(20px); opacity: 0; }
    to   { transform: translateX(0); opacity: 1; }
  }

  .sheet__head {
    display: flex; align-items: flex-start; justify-content: space-between;
    gap: 12px;
    padding: 22px 24px 18px;
    border-bottom: 1px solid var(--line);
    background: linear-gradient(180deg, var(--brand-softer) 0%, transparent 100%);
  }
  .sheet__id { display: flex; align-items: center; gap: 14px; }
  .sheet__avatar {
    width: 56px; height: 56px;
    border-radius: 50%;
    background: var(--s2);
    border: 3px solid var(--member-accent, var(--brand));
    display: grid; place-items: center;
    overflow: hidden;
    font: 700 16px/1 var(--mo); color: var(--t2);
    flex-shrink: 0;
  }
  .sheet__avatar img { width: 100%; height: 100%; object-fit: cover; }
  .sheet__eyebrow { font: 700 11px/1.3 var(--sa); letter-spacing: 0.10em; text-transform: uppercase; color: var(--brand-deep); }
  .sheet__head h2 { margin: 4px 0 2px; font-family: var(--hd); font-weight: 700; font-size: 20px; letter-spacing: -0.01em; }
  .sheet__email { margin: 0; font: 500 12px/1.3 var(--mo); color: var(--t3); }

  .sheet__close {
    appearance: none; border: 1px solid var(--line);
    width: 36px; height: 36px; border-radius: 8px;
    background: var(--s1); color: var(--t2); cursor: pointer;
    display: grid; place-items: center;
    flex-shrink: 0;
  }
  .sheet__close:hover { background: var(--s2); color: var(--tx); }

  .sheet__body {
    flex: 1; min-height: 0; overflow: auto;
    padding: 8px 24px 24px;
  }

  .sect {
    margin: 16px 0;
    padding: 16px 18px;
    border-radius: var(--r1, 12px);
    background: var(--s1);
    border: 1px solid var(--line);
  }
  .sect__head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
  .sect__head h3 { margin: 0; font: 700 14px/1.2 var(--sa); flex: 1; }
  .sect__icon { font-size: 16px; line-height: 1; }
  .sect__foot { display: flex; justify-content: flex-end; margin-top: 14px; }

  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .grid2 label { display: flex; flex-direction: column; gap: 4px; }
  .grid2 label.full { grid-column: 1 / -1; }
  .grid2 label.checkbox { flex-direction: row; align-items: center; gap: 8px; padding: 6px 0; }
  .grid2 label > span { font: 600 11px/1.2 var(--sa); color: var(--t3); text-transform: uppercase; letter-spacing: 0.06em; }
  .grid2 input, .grid2 select {
    appearance: none;
    padding: 9px 11px;
    font: 500 13.5px/1 var(--sa);
    color: var(--tx);
    background: var(--canvas-2, var(--bg));
    border: 1px solid var(--line);
    border-radius: 8px;
    outline: none;
  }
  .grid2 input:focus, .grid2 select:focus { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-line-2); }
  .grid2 input[type="color"] { padding: 4px; height: 36px; cursor: pointer; }
  .grid2 input[type="checkbox"] { width: 18px; height: 18px; accent-color: var(--brand); }

  /* Capacity */
  .cap-row { display: flex; gap: 16px; flex-wrap: wrap; align-items: center; }
  .cap-slider { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 240px; }
  .cap-slider span { font: 600 11px/1.2 var(--sa); color: var(--t3); text-transform: uppercase; letter-spacing: 0.06em; }
  .cap-slider input[type="range"] { flex: 1; }
  .cap-slider strong { font: 700 14px/1 var(--mo); color: var(--tx); min-width: 48px; text-align: right; }
  .cap-num { display: flex; align-items: center; gap: 10px; }
  .cap-num span { font: 600 11px/1.2 var(--sa); color: var(--t3); text-transform: uppercase; letter-spacing: 0.06em; }
  .cap-num input { width: 80px; padding: 9px 11px; font: 500 13.5px/1 var(--sa); color: var(--tx);
    background: var(--canvas-2, var(--bg)); border: 1px solid var(--line); border-radius: 8px; outline: none; }
  .cap-derived { margin: 10px 0 0; font: 500 13px/1.3 var(--sa); color: var(--t2); }
  .cap-derived strong { color: var(--brand-deep); }

  /* Working hours */
  .wd-row { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }
  .wd-pill {
    appearance: none; padding: 7px 14px; border-radius: 8px;
    border: 1px solid var(--line); background: var(--canvas-2, var(--bg));
    color: var(--t2); font: 600 11.5px/1 var(--sa);
    text-transform: uppercase; letter-spacing: 0.06em; cursor: pointer;
    transition: all 140ms var(--ease);
  }
  .wd-pill:hover { background: var(--brand-softer); color: var(--brand-deep); }
  .wd-pill--on { background: var(--brand-soft); color: var(--brand-deep); border-color: var(--brand); }

  .hr-slots { display: flex; flex-direction: column; gap: 6px; }
  .hr-slot {
    display: grid; grid-template-columns: 50px 110px 20px 110px auto;
    gap: 8px; align-items: center;
    font: 500 13px/1 var(--sa); color: var(--t2);
  }
  .hr-slot__day { font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; font-size: 11px; color: var(--t3); }
  .hr-slot input[type="time"] {
    appearance: none; padding: 7px 10px; border-radius: 8px;
    border: 1px solid var(--line); background: var(--canvas-2, var(--bg)); color: var(--tx);
    font: 500 13px/1 var(--mo); outline: none;
  }
  .hr-slot__sep { color: var(--t4); text-align: center; }
  .hr-slot__hrs { font-family: var(--mo); font-variant-numeric: tabular-nums; color: var(--t2); }
  .hr-empty { color: var(--t3); font-style: italic; padding: 8px 0; }

  /* Lists */
  .rate-list, .abs-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .rate-list li, .abs-list li {
    display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
    padding: 10px 12px; background: var(--canvas-2, var(--bg));
    border: 1px solid var(--line); border-radius: 8px;
    font: 500 13px/1.3 var(--sa);
  }
  .rate-amount { font: 700 14px/1 var(--mo); color: var(--brand-deep); }
  .rate-from, .abs-range { color: var(--t3); font-size: 12px; }
  .abs-kind { font-weight: 600; color: var(--tx); text-transform: capitalize; }
  .empty { color: var(--t3); font-style: italic; padding: 6px 0; margin: 0; }

  @media (max-width: 760px) {
    .admin-page { padding: 20px 16px 64px; }
    .head { flex-direction: column; align-items: flex-start; }
    .grid { grid-template-columns: 1fr; }
    .sheet__panel { width: 100%; }
    .grid2 { grid-template-columns: 1fr; }
    .hr-slot { grid-template-columns: 50px 1fr 1fr; }
    .hr-slot__sep, .hr-slot__hrs { display: none; }
    .cap-row { flex-direction: column; align-items: stretch; }
    .cap-slider { min-width: 0; }
  }
</style>

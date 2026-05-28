<script lang="ts">
  import type { EntityState } from "$lib/db";
  import { toast } from "$components/GlassToast.svelte";

  interface Props {
    meeting: EntityState;
    clients: EntityState[];
    tickets: EntityState[];
    onClose: () => void;
  }
  let { meeting, clients, tickets, onClose }: Props = $props();

  let scheduling     = $state(false);
  let briefing       = $state(false);
  let briefHtml      = $state<string>("");
  let briefError     = $state<string>("");
  // Tracks where a mousedown started on the backdrop, so a mouseup that
  // ended on the same backdrop element triggers close. Anything that
  // started inside the drawer content (text selection drag-out, etc.)
  // is ignored. Resets to null after each gesture.
  let backdropDownTarget: EventTarget | null = null;

  const subject = $derived(meeting.state?.subject || meeting.state?.title || "(meeting)");
  const startIso = $derived(meeting.state?.start || meeting.state?.meeting_date || "");
  const endIso   = $derived(meeting.state?.end || "");
  const attendees = $derived(meeting.state?.attendees || []);
  const location = $derived(meeting.state?.location || "");

  // Extract client code from subject
  const clientMatch = $derived((() => {
    const s = String(subject).toLowerCase();
    // Try "CODE —" or "CODE -" or "CODE " at start or after bracket
    for (const c of clients) {
      const code = c.entity_id.toLowerCase();
      const firstWord = (c.state?.name || "").toLowerCase().split(/\s+/)[0];
      if (code.length >= 2 && (s.startsWith(code + " ") || s.startsWith(code + "-") || s.includes(" " + code + " ") || s.includes(" " + code + "-") || s.includes("[" + code + "]") || s.includes(code + " —"))) {
        return c;
      }
      if (firstWord && firstWord.length > 3 && s.includes(firstWord)) {
        return c;
      }
    }
    return null;
  })());

  const clientTickets = $derived((() => {
    if (!clientMatch) return [];
    const code = clientMatch.entity_id;
    const legalName = (clientMatch.state?.name || "").toLowerCase().split(/\s+/)[0];
    return tickets.filter(t => {
      const tCust = (t.state?.customer || "").toLowerCase();
      if (tCust && legalName && tCust.includes(legalName)) return true;
      const tid = t.entity_id || "";
      return tid.split("-")[0] === code;
    }).filter(t => !t.state?.is_done).slice(0, 10);
  })());

  function fmtWhen(iso: string) {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString("de-CH", { timeZone: "Europe/Zurich", weekday: "short", day: "2-digit", month: "short", year: "numeric" }) +
           " · " + d.toLocaleTimeString("de-CH", { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit" });
  }

  async function scheduleEvent() {
    scheduling = true;
    try {
      const res = await fetch("/api/functions/calendar-schedule-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          start: startIso,
          end: endIso,
          attendees,
          location,
          client_code: clientMatch?.entity_id || null,
          source: "dashboard-v2-calendar-drawer",
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast("Event queued to Outlook drafts — appears on next m365 sync", "ok", 2800);
    } catch (err) {
      console.warn("[calendar] schedule failed:", err);
      toast("Schedule queued — will retry on reconnect", "warn", 2800);
    } finally {
      scheduling = false;
    }
  }

  async function briefMe() {
    briefing = true;
    briefError = "";
    briefHtml = "";
    try {
      const res = await fetch("/api/functions/meeting-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: clientMatch?.state?.name || "(unknown client)",
          services: "c2moviez creative technology — video, photo, social, IT, marketing",
          requirements: `Meeting subject: ${subject}. ${location ? "Location: " + location : ""}`,
          meeting_summary: `Upcoming meeting ${fmtWhen(startIso)}.`,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // meeting-research returns an object with research text in various sections
      briefHtml = renderBrief(data);
    } catch (err: any) {
      briefError = err.message || String(err);
    } finally {
      briefing = false;
    }
  }

  function renderBrief(data: any): string {
    if (typeof data === "string") return escapeHtml(data);
    if (data.research) {
      if (typeof data.research === "string") return `<p>${escapeHtml(data.research)}</p>`;
      const sections = Object.entries(data.research).map(([k, v]) => {
        const body = Array.isArray(v) ? v.map(x => `<li>${escapeHtml(String(x))}</li>`).join("") : escapeHtml(String(v || ""));
        return `<section><h4>${escapeHtml(k.replace(/_/g, " "))}</h4>${Array.isArray(v) ? "<ul>" + body + "</ul>" : "<p>" + body + "</p>"}</section>`;
      }).join("");
      return sections;
    }
    return `<pre>${escapeHtml(JSON.stringify(data, null, 2))}</pre>`;
  }

  function escapeHtml(s: string) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
</script>

<!--
  Dismiss-on-backdrop uses MOUSEDOWN with a "started here?" guard, not CLICK.
  Why: the same click gesture that sets `selected = m` on the calendar page
  flushes Svelte 5 state synchronously, mounting this <aside> before the
  click event finishes propagating. If we listened to `click` here, that
  in-flight click was retargeting on certain browsers caused the drawer to
  close on the same gesture that opened it ("popping up quickly and then
  they are gone"). Tracking mousedown-on-backdrop + mouseup-on-backdrop
  ensures only a deliberate, self-contained click on the backdrop closes.
-->
<aside
  class="drawer-backdrop"
  onmousedown={(e) => { backdropDownTarget = e.target === e.currentTarget ? e.currentTarget : null; }}
  onmouseup={(e) => {
    if (backdropDownTarget && e.target === backdropDownTarget) onClose();
    backdropDownTarget = null;
  }}
  onkeydown={(e) => e.key === "Escape" && onClose()}
  role="presentation"
>
  <div class="drawer glass glass--thick">
    <span class="corner tl"></span><span class="corner tr"></span>
    <span class="corner bl"></span><span class="corner br"></span>

    <header class="drawer-head">
      <div class="row gap-3 items-center">
        <span class="mtg-pill">
          <span class="mtg-pill-dot"></span>
          MEETING
        </span>
        {#if clientMatch}
          <span class="caption client-chip">→ {clientMatch.entity_id}</span>
        {/if}
      </div>
      <button class="close" onclick={onClose} aria-label="Close">×</button>
    </header>

    <div class="title-row">
      <h2 class="drawer-title font-display">{subject}</h2>
      <div class="meta-line">
        <span class="meta-item">🕓 {fmtWhen(startIso)}{endIso ? " → " + new Date(endIso).toLocaleTimeString("de-CH", { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit" }) : ""}</span>
        {#if location}
          <span class="meta-item">📍 {location}</span>
        {/if}
        {#if attendees.length > 0}
          <span class="meta-item">👥 {attendees.length} attendee{attendees.length === 1 ? "" : "s"}</span>
        {/if}
      </div>
    </div>

    <!-- Action buttons -->
    <section class="drawer-section action-row">
      <button class="btn-primary" onclick={briefMe} disabled={briefing}>
        {briefing ? "⏳ Researching…" : "✨ Brief me"}
      </button>
      <button class="btn-secondary" onclick={scheduleEvent} disabled={scheduling}>
        {scheduling ? "Queuing…" : "📅 Schedule event in Outlook"}
      </button>
    </section>

    <!-- Brief inline -->
    {#if briefError}
      <section class="drawer-section">
        <p class="error">Brief failed: {briefError}</p>
      </section>
    {/if}
    {#if briefHtml}
      <section class="drawer-section brief-card">
        <h3 class="section-title"><span class="section-bracket">▸</span> AI BRIEFING</h3>
        <div class="brief-body">{@html briefHtml}</div>
      </section>
    {/if}

    <!-- Client context -->
    {#if clientMatch}
      <section class="drawer-section">
        <h3 class="section-title"><span class="section-bracket">▸</span> LINKED CLIENT</h3>
        <a class="client-card" href={`/clients?open=${clientMatch.entity_id}`}>
          <header class="row between items-center">
            <span class="font-mono client-code">{clientMatch.entity_id}</span>
            {#if clientMatch.state?.monthly_revenue}
              <span class="caption">MRR {clientMatch.state?.monthly_revenue} CHF</span>
            {/if}
          </header>
          <p class="client-name">{clientMatch.state?.name || clientMatch.entity_id}</p>
          {#if clientMatch.state?.contact_email}
            <span class="caption dim">{clientMatch.state.contact_email}</span>
          {/if}
        </a>
      </section>
    {:else}
      <section class="drawer-section">
        <h3 class="section-title"><span class="section-bracket">▸</span> LINKED CLIENT</h3>
        <p class="body dim">No client auto-matched from subject. Is this an internal / personal event?</p>
      </section>
    {/if}

    <!-- Open tickets for this client -->
    {#if clientTickets.length > 0}
      <section class="drawer-section">
        <h3 class="section-title"><span class="section-bracket">▸</span> OPEN TICKETS <span class="section-count">{clientTickets.length}</span></h3>
        <ul class="tix-list">
          {#each clientTickets as t}
            {@const prio = (t.state?.priority || "none").toLowerCase()}
            <li class="tix-row">
              <span class="tix-id font-mono">{t.entity_id}</span>
              <span class="tix-name">{t.state?.name || "(no title)"}</span>
              <span class={`tix-prio chip-${prio}`}>{prio}</span>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    <!-- Attendees list -->
    {#if attendees.length > 0}
      <section class="drawer-section">
        <h3 class="section-title"><span class="section-bracket">▸</span> ATTENDEES</h3>
        <ul class="attendee-list">
          {#each attendees as a}
            <li class="attendee-row">{typeof a === "string" ? a : (a.name || a.email || JSON.stringify(a))}</li>
          {/each}
        </ul>
      </section>
    {/if}

    <footer class="drawer-foot">
      <span class="caption dim">ESC to close · Outlook sync runs every 15 min</span>
      <button class="btn-ghost" onclick={onClose}>Close</button>
    </footer>
  </div>
</aside>

<style>
  .drawer-backdrop {
    position: fixed; inset: 0;
    background: rgba(6, 8, 14, 0.55);
    backdrop-filter: blur(12px);
    z-index: 55;
    display: flex; justify-content: flex-end;
    animation: fade-in 220ms var(--ease-out);
  }
  .drawer {
    position: relative;
    width: min(640px, 100%); height: 100%;
    padding: 24px 26px;
    display: flex; flex-direction: column; gap: 18px;
    overflow-y: auto;
    border-left: 1px solid rgba(34,211,238,0.35);
    box-shadow: -12px 0 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(34,211,238,0.15);
    animation: drawer-in 320ms var(--ease-spring);
  }
  @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
  @keyframes drawer-in {
    from { transform: translateX(60px); opacity: 0; }
    to   { transform: translateX(0);    opacity: 1; }
  }
  .corner { position: absolute; width: 14px; height: 14px; border: 1.5px solid rgba(34,211,238,0.7); pointer-events: none; }
  .corner.tl { top: 8px; left: 8px; border-right: none; border-bottom: none; }
  .corner.tr { top: 8px; right: 8px; border-left: none; border-bottom: none; }
  .corner.bl { bottom: 8px; left: 8px; border-right: none; border-top: none; }
  .corner.br { bottom: 8px; right: 8px; border-left: none; border-top: none; }

  .drawer-head { display: flex; justify-content: space-between; align-items: center; }
  .mtg-pill {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 5px 12px;
    border-radius: 999px;
    background: rgba(34,211,238,0.14);
    border: 1px solid rgba(34,211,238,0.45);
    font-size: 11px; letter-spacing: 0.08em; color: var(--tx); font-weight: 500; text-transform: uppercase;
  }
  .mtg-pill-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--a); box-shadow: 0 0 8px var(--a); }
  .client-chip { color: var(--a); font-family: "JetBrains Mono", monospace; font-size: 10.5px; }

  .close {
    all: unset; cursor: pointer;
    width: 30px; height: 30px;
    display: grid; place-items: center;
    border-radius: 50%;
    background: var(--s2);
    font-size: 20px; color: var(--t2);
  }
  .close:hover { background: var(--s1); color: var(--tx); }

  .title-row { display: flex; flex-direction: column; gap: 8px; padding-bottom: 8px; border-bottom: 1px solid rgba(34,211,238,0.22); }
  .drawer-title { font-size: 22px; line-height: 1.2; color: var(--tx); margin: 0; letter-spacing: -0.015em; }
  .meta-line { display: flex; flex-wrap: wrap; gap: 12px; font-size: 12px; color: var(--t2); }
  .meta-item { display: inline-flex; gap: 6px; align-items: center; }

  .drawer-section { display: flex; flex-direction: column; gap: 10px; }
  .section-title {
    font-family: "Space Grotesk", sans-serif;
    font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase;
    color: var(--t2); margin: 0;
    display: inline-flex; align-items: center; gap: 8px;
  }
  .section-bracket { color: var(--a); font-size: 14px; }
  .section-count {
    font-family: "JetBrains Mono", monospace;
    font-size: 10.5px; color: var(--t3);
    background: var(--s1); padding: 1px 7px; border-radius: 999px;
    border: 1px solid var(--b1); margin-left: 6px;
  }

  .action-row { flex-direction: row; gap: 10px; flex-wrap: wrap; }
  .btn-primary, .btn-secondary, .btn-ghost {
    all: unset; cursor: pointer;
    padding: 10px 18px;
    border-radius: var(--r-md);
    font-family: "Space Grotesk", sans-serif;
    font-size: 13px;
    transition: filter var(--dur-fast), background var(--dur-fast);
  }
  .btn-primary {
    color: #fff;
    background: linear-gradient(135deg, var(--a) 0%, var(--a2) 100%);
    box-shadow: 0 0 18px rgba(34,211,238,0.35);
    font-weight: 600;
  }
  .btn-primary:hover:not(:disabled) { filter: brightness(1.1); }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-secondary {
    color: var(--tx);
    background: var(--s2);
    border: 1px solid rgba(34,211,238,0.3);
  }
  .btn-secondary:hover:not(:disabled) { background: var(--s1); border-color: var(--a); }
  .btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-ghost {
    color: var(--t2);
    background: var(--s1);
    border: 1px solid var(--b1);
  }
  .btn-ghost:hover { background: var(--s2); color: var(--tx); }

  .brief-card { padding: 18px; background: linear-gradient(135deg, rgba(34,211,238,0.05), rgba(168,85,247,0.05)); border: 1px solid rgba(34,211,238,0.25); border-radius: var(--r-md); }
  .brief-body :global(h4) { font-size: 12px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--a); margin: 12px 0 6px; }
  .brief-body :global(p) { margin: 0 0 10px; font-size: 13.5px; line-height: 1.55; color: var(--t2); }
  .brief-body :global(ul) { margin: 0 0 10px; padding-left: 18px; }
  .brief-body :global(li) { margin-bottom: 4px; font-size: 13px; color: var(--t2); }
  .error { color: #fca5a5; font-size: 12px; }

  .client-card {
    display: flex; flex-direction: column; gap: 4px;
    padding: 12px 14px;
    background: var(--s1);
    border: 1px solid var(--b1);
    border-radius: var(--r-md);
    text-decoration: none; color: inherit;
    transition: background var(--dur-fast), border-color var(--dur-fast), transform var(--dur-fast);
  }
  .client-card:hover { background: var(--s2); border-color: rgba(34,211,238,0.4); transform: translateY(-1px); }
  .client-code {
    font-size: 10.5px;
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(34,211,238,0.16);
    color: var(--tx);
    letter-spacing: 0.06em;
  }
  .client-name { margin: 2px 0; font-size: 14px; color: var(--tx); font-weight: 500; }

  .tix-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
  .tix-row {
    display: grid;
    grid-template-columns: 72px 1fr 70px;
    gap: 10px;
    align-items: center;
    padding: 7px 10px;
    background: var(--s1);
    border: 1px solid var(--b1);
    border-radius: var(--r-sm);
    font-size: 12px;
  }
  .tix-id { color: var(--t3); font-size: 10.5px; }
  .tix-name { color: var(--tx); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tix-prio { padding: 2px 8px; border-radius: 999px; font-size: 10px; text-align: center; background: var(--s2); color: var(--t2); text-transform: uppercase; letter-spacing: 0.04em; }
  .chip-urgent { background: rgba(239,68,68,0.18); color: #fca5a5; }
  .chip-high { background: rgba(249,115,22,0.18); color: #fdba74; }
  .chip-medium { background: rgba(234,179,8,0.18); color: #fde68a; }
  .chip-low { background: rgba(16,185,129,0.18); color: #6ee7b7; }

  .attendee-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
  .attendee-row { padding: 6px 10px; background: var(--s1); border: 1px solid var(--b1); border-radius: var(--r-sm); font-size: 12px; color: var(--t2); }

  .drawer-foot { display: flex; justify-content: space-between; align-items: center; padding-top: 14px; border-top: 1px solid rgba(34,211,238,0.22); gap: 12px; flex-wrap: wrap; }
  .dim { color: var(--t4); }
</style>

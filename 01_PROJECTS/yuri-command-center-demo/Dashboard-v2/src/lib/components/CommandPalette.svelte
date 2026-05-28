<script lang="ts">
  import { onMount, tick } from "svelte";
  import { goto } from "$app/navigation";
  import { cmdPalette } from "$stores/cmdPalette.svelte";
  import { listEntityState, listOpenTickets, type EntityState } from "$lib/db";

  type Item = {
    id: string;
    group: "Navigate" | "Clients" | "Tickets" | "Actions" | "Create";
    label: string;
    sub?: string;
    icon: string;
    href?: string;
    action?: () => void;
    nlp?: { name: string; project: string; priority: string; due_date?: string };
  };

  // ── NLP parser ─────────────────────────────────────────────────────
  const TICKET_VERBS = /^(?:new\s+ticket|create\s+ticket|ticket|add\s+ticket|t)\s+/i;
  const PRIORITIES   = ["urgent","high","medium","low"];
  const PROJ_KEYS    = ["C2M","MFB","C2I","MACL"];

  function nextWeekday(name: string): string {
    const days: Record<string,number> = { sun:0,mon:1,tue:2,wed:3,thu:4,fri:5,sat:6,sunday:0,monday:1,tuesday:2,wednesday:3,thursday:4,friday:5,saturday:6 };
    const target = days[name.toLowerCase()];
    if (target === undefined) return "";
    const d = new Date();
    const diff = (target - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + diff);
    return d.toISOString().slice(0,10);
  }

  function parseNLP(q: string): Item["nlp"] | null {
    if (!TICKET_VERBS.test(q)) return null;
    let rest = q.replace(TICKET_VERBS, "").trim();
    if (!rest) return null;

    // Due date extraction
    let due_date: string | undefined;
    const duePat = /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/gi;
    rest = rest.replace(duePat, (m) => {
      const lm = m.toLowerCase();
      if (lm === "today")    { due_date = new Date().toISOString().slice(0,10); return ""; }
      if (lm === "tomorrow") { const d=new Date(); d.setDate(d.getDate()+1); due_date=d.toISOString().slice(0,10); return ""; }
      const wd = nextWeekday(lm);
      if (wd) { due_date = wd; return ""; }
      return m;
    }).replace(/\s+/g," ").trim();

    // Priority extraction
    let priority = "medium";
    for (const p of PRIORITIES) {
      const re = new RegExp(`\\b${p}\\b`, "gi");
      if (re.test(rest)) { priority = p; rest = rest.replace(re, "").replace(/\s+/g," ").trim(); break; }
    }

    // Project extraction (first word if it's a known project key)
    let project = "C2M";
    const words = rest.split(/\s+/);
    if (words.length > 1 && PROJ_KEYS.includes(words[0].toUpperCase())) {
      project = words[0].toUpperCase();
      rest = words.slice(1).join(" ").trim();
    }

    const name = rest;
    if (!name) return null;

    return { name, project, priority, due_date };
  }

  let nlpLoading = $state(false);
  let nlpResult  = $state<string | null>(null);

  async function executeNLP(nlp: NonNullable<Item["nlp"]>) {
    nlpLoading = true; nlpResult = null;
    try {
      const r = await fetch("/api/functions/nlp-ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nlp),
      });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      nlpResult = data.ref;
      cmdPalette.hide();
      const { toast } = await import("$components/GlassToast.svelte");
      toast(`Created ${data.ref}: ${data.name}`, "ok");
    } catch (e) {
      const { toast } = await import("$components/GlassToast.svelte");
      toast("Failed to create ticket", "error");
    } finally {
      nlpLoading = false;
    }
  }

  const NAV_ITEMS: Item[] = [
    { id: "n-cmd",      group: "Navigate", label: "Command",  icon: "⌘", href: "/" },
    { id: "n-focus",    group: "Navigate", label: "Focus",    icon: "✦", href: "/focus" },
    { id: "n-meetings", group: "Navigate", label: "Meetings", icon: "📅", href: "/meetings" },
    { id: "n-clients",  group: "Navigate", label: "Clients",  icon: "🏢", href: "/clients" },
    { id: "n-pipeline", group: "Navigate", label: "Pipeline", icon: "⚡", href: "/pipeline" },
    { id: "n-revenue",  group: "Navigate", label: "Revenue",  icon: "💰", href: "/revenue" },
    { id: "n-projects", group: "Navigate", label: "Projects", icon: "📋", href: "/projects" },
    { id: "n-intel",    group: "Navigate", label: "Intel",    icon: "🧠", href: "/intel" },
    { id: "n-health",   group: "Navigate", label: "Health",   icon: "❤", href: "/health" },
  ];

  let query = $state("");
  let cursor = $state(0);
  let inputEl: HTMLInputElement | null = null;
  let clients = $state<EntityState[]>([]);
  let tickets = $state<EntityState[]>([]);
  let loaded  = $state(false);

  async function loadData() {
    if (loaded) return;
    const [c, t] = await Promise.all([
      listEntityState("client", 200),
      listOpenTickets(500),
    ]);
    clients = c;
    tickets = t;
    loaded = true;
  }

  $effect(() => {
    if (cmdPalette.open) {
      loadData();
      tick().then(() => inputEl?.focus());
    } else {
      query = "";
      cursor = 0;
    }
  });

  const filtered = $derived.by((): Item[] => {
    const q = query.trim().toLowerCase();

    const navMatches = NAV_ITEMS.filter(i =>
      !q || i.label.toLowerCase().includes(q),
    );

    const clientMatches: Item[] = !q ? [] : clients
      .filter(c => {
        const n = (c.state?.name || c.entity_id || "").toLowerCase();
        const code = (c.state?.client_code || c.entity_id || "").toLowerCase();
        return n.includes(q) || code.includes(q);
      })
      .slice(0, 6)
      .map(c => ({
        id: "c-" + c.entity_id,
        group: "Clients" as const,
        label: c.state?.name || c.entity_id,
        sub: c.state?.client_code,
        icon: "🏢",
        href: "/clients",
      }));

    const ticketMatches: Item[] = !q ? [] : tickets
      .filter(t => {
        const n = (t.state?.name || "").toLowerCase();
        const id = (t.state?.id || t.entity_id || "").toLowerCase();
        return n.includes(q) || id.includes(q);
      })
      .slice(0, 5)
      .map(t => ({
        id: "t-" + t.entity_id,
        group: "Tickets" as const,
        label: t.state?.name || t.entity_id,
        sub: t.state?.id || t.entity_id,
        icon: "🎫",
        href: "/focus",
      }));

    // NLP — ticket creation intent
    const nlp = parseNLP(q);
    const nlpItems: Item[] = nlp ? [{
      id: "nlp-create",
      group: "Create" as const,
      label: `${nlp.project} - ${nlp.name}`,
      sub: `${nlp.priority}${nlp.due_date ? " · due " + nlp.due_date : ""}`,
      icon: "✚",
      nlp,
    }] : [];

    return [...nlpItems, ...navMatches, ...clientMatches, ...ticketMatches];
  });

  $effect(() => {
    // Reset cursor when results change
    void filtered;
    cursor = 0;
  });

  function activate(item: Item) {
    if (item.nlp) { executeNLP(item.nlp); return; }
    cmdPalette.hide();
    if (item.action) { item.action(); return; }
    if (item.href) goto(item.href);
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      cursor = (cursor + 1) % Math.max(filtered.length, 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      cursor = (cursor - 1 + Math.max(filtered.length, 1)) % Math.max(filtered.length, 1);
    } else if (e.key === "Enter") {
      const item = filtered[cursor];
      if (item) activate(item);
    } else if (e.key === "Escape") {
      cmdPalette.hide();
    }
  }

  function onBackdropClick(e: MouseEvent) {
    if ((e.target as HTMLElement)?.classList.contains("palette-backdrop")) {
      cmdPalette.hide();
    }
  }

  // Group label appears only when the group changes relative to previous item
  function groupLabel(items: Item[], idx: number): string | null {
    if (idx === 0) return items[0]?.group ?? null;
    if (items[idx].group !== items[idx - 1].group) return items[idx].group;
    return null;
  }
</script>

{#if cmdPalette.open}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="palette-backdrop" onclick={onBackdropClick} role="presentation">
    <div class="palette glass glass--thick" role="dialog" aria-modal="true" aria-label="Command palette">

      <div class="palette-search">
        <svg class="palette-icon" width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          bind:this={inputEl}
          bind:value={query}
          onkeydown={onKeydown}
          class="palette-input font-display"
          placeholder='Search or "ticket SHI delivery friday"…'
          autocomplete="off"
          spellcheck="false"
        />
        <kbd class="palette-esc">esc</kbd>
      </div>

      <div class="palette-results" role="listbox">
        {#if filtered.length === 0}
          <div class="palette-empty small">No results for "{query}"</div>
        {:else}
          {#each filtered as item, i}
            {@const gl = groupLabel(filtered, i)}
            {#if gl}
              <div class="palette-group-label eyebrow">{gl}</div>
            {/if}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <div
              class="palette-row {i === cursor ? 'active' : ''} {item.nlp ? 'palette-row--nlp' : ''}"
              role="option"
              aria-selected={i === cursor}
              onclick={() => activate(item)}
              onmouseenter={() => (cursor = i)}
            >
              <span class="palette-row-icon">{nlpLoading && item.nlp ? "⏳" : item.icon}</span>
              <span class="palette-row-label">{item.label}</span>
              {#if item.sub}
                <span class="palette-row-sub caption">{item.sub}</span>
              {/if}
              {#if item.nlp && !nlpLoading}
                <span class="nlp-badge">Create ticket</span>
              {/if}
              {#if i === cursor && !nlpLoading}
                <kbd class="palette-enter">↵</kbd>
              {/if}
            </div>
          {/each}
        {/if}
      </div>

      <div class="palette-footer caption">
        <span><kbd>↑↓</kbd> navigate</span>
        <span><kbd>↵</kbd> open</span>
        <span><kbd>esc</kbd> close</span>
      </div>
    </div>
  </div>
{/if}

<style>
  .palette-backdrop {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal);
    background: rgba(6, 8, 14, 0.72);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: clamp(60px, 12vh, 140px);
    animation: fade-in 120ms var(--ease-out) both;
  }

  .palette {
    width: 100%;
    max-width: 620px;
    margin: 0 16px;
    border-radius: var(--r-xl);
    padding: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    animation: slide-in 180ms var(--ease-spring) both;
    box-shadow: var(--shadow-lift), 0 0 0 1px var(--b2), 0 32px 64px rgba(0,0,0,.5);
  }

  .palette-search {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 18px 20px;
    border-bottom: 1px solid var(--b2);
  }

  .palette-icon { color: var(--t3); flex-shrink: 0; }

  .palette-input {
    all: unset;
    flex: 1;
    font-size: 17px;
    font-weight: 400;
    color: var(--tx);
    letter-spacing: -0.01em;
  }
  .palette-input::placeholder { color: var(--t3); }

  .palette-esc {
    flex-shrink: 0;
    font-family: var(--mo);
    font-size: 10px;
    padding: 3px 7px;
    border-radius: 5px;
    background: var(--s2);
    border: 1px solid var(--b2);
    color: var(--t3);
  }

  .palette-results {
    overflow-y: auto;
    max-height: 380px;
    padding: 8px;
    scrollbar-width: thin;
    scrollbar-color: var(--b2) transparent;
  }

  .palette-group-label {
    padding: 10px 12px 4px;
    font-size: 10px;
    letter-spacing: 0.18em;
  }

  .palette-empty {
    padding: 32px 20px;
    text-align: center;
    color: var(--t3);
  }

  .palette-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 12px;
    border-radius: var(--r-sm);
    cursor: pointer;
    transition: background var(--dur-fast) var(--ease-out);
  }
  .palette-row:hover,
  .palette-row.active {
    background: var(--a-08);
  }
  .palette-row.active {
    background: color-mix(in oklab, var(--a) 12%, transparent);
  }

  .palette-row-icon { font-size: 15px; flex-shrink: 0; width: 20px; text-align: center; }
  .palette-row-label { font-size: 14px; color: var(--tx); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .palette-row-sub { color: var(--t3); flex-shrink: 0; }

  .palette-enter {
    font-family: var(--mo);
    font-size: 11px;
    padding: 2px 6px;
    border-radius: 4px;
    background: var(--a-12);
    border: 1px solid var(--a-25);
    color: var(--a);
    flex-shrink: 0;
  }

  .palette-footer {
    display: flex;
    gap: 16px;
    padding: 10px 20px;
    border-top: 1px solid var(--b1);
    color: var(--t3);
    font-size: 11px;
    flex-shrink: 0;
  }
  .palette-footer kbd {
    font-family: var(--mo);
    padding: 1px 5px;
    border-radius: 3px;
    background: var(--s2);
    border: 1px solid var(--b2);
    color: var(--t2);
    margin-right: 3px;
  }

  /* NLP create-ticket row */
  .palette-row--nlp {
    border: 1px solid rgba(86,188,236,0.18);
    background: rgba(86,188,236,0.04);
  }
  .palette-row--nlp.active,
  .palette-row--nlp:hover {
    background: rgba(86,188,236,0.12);
    border-color: rgba(86,188,236,0.35);
  }
  .nlp-badge {
    font-family: "JetBrains Mono", monospace;
    font-size: 9.5px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 2px 8px;
    border-radius: 5px;
    background: rgba(86,188,236,0.14);
    border: 1px solid rgba(86,188,236,0.3);
    color: #56BCEC;
    flex-shrink: 0;
  }

  @keyframes fade-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes slide-in {
    from { opacity: 0; transform: translateY(-12px) scale(0.97); }
    to   { opacity: 1; transform: none; }
  }
</style>

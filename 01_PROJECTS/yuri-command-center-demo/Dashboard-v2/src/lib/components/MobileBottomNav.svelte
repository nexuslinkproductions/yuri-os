<script lang="ts">
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { cmdPalette } from "$stores/cmdPalette.svelte";

  let sheetOpen = $state(false);

  const slots = [
    { path: "/",                   icon: "⌘", label: "Command"  },
    { path: "/tracker",            icon: "⧗", label: "CHRONEX"  },
    // center FAB unchanged
    { path: "/pipeline/customers", icon: "▷", label: "CRM"      },
    { path: "/nexogram",           icon: "◈", label: "Chat"     },
  ];

  function isActive(path: string) {
    const p = $page.url.pathname;
    return path === "/" ? p === "/" : p.startsWith(path);
  }

  const actions = [
    { icon: "✚", label: "New Ticket",      sub: "Create a Plane issue",           handler: () => { sheetOpen = false; goto("/pipeline?new=1"); } },
    { icon: "✎", label: "New Note",         sub: "Add to inbox",                   handler: () => { sheetOpen = false; } },
    { icon: "✈", label: "Push to Telegram", sub: "Send update to CEO channel",     handler: () => { sheetOpen = false; } },
    { icon: "◷", label: "Schedule Block",   sub: "Plan a ticket into the calendar",handler: () => { sheetOpen = false; goto("/schedule"); } },
  ];
</script>

<!-- Mobile bottom nav -->
<nav class="bottom-nav" aria-label="Primary mobile navigation">
  {#each slots.slice(0, 2) as slot}
    <a href={slot.path} class="nav-slot {isActive(slot.path) ? 'active' : ''}" aria-label={slot.label}>
      <span class="nav-icon" aria-hidden="true">{slot.icon}</span>
      <span class="nav-label">{slot.label}</span>
    </a>
  {/each}

  <!-- FAB center slot -->
  <button class="fab-slot" onclick={() => (sheetOpen = true)} aria-label="Actions">
    <span class="fab-btn" aria-hidden="true">+</span>
  </button>

  {#each slots.slice(2) as slot}
    <a href={slot.path} class="nav-slot {isActive(slot.path) ? 'active' : ''}" aria-label={slot.label}>
      <span class="nav-icon" aria-hidden="true">{slot.icon}</span>
      <span class="nav-label">{slot.label}</span>
    </a>
  {/each}

  <!-- Search slot -->
  <button class="nav-slot" onclick={() => cmdPalette.show()} aria-label="Search">
    <span class="nav-icon" aria-hidden="true">⌕</span>
    <span class="nav-label">Search</span>
  </button>
</nav>

<!-- Action sheet -->
{#if sheetOpen}
  <div class="sheet-backdrop" role="presentation" onclick={() => (sheetOpen = false)}></div>
  <dialog class="action-sheet" open aria-label="Quick actions">
    <div class="sheet-handle" aria-hidden="true"></div>
    <h2 class="sheet-title">Quick actions</h2>
    {#each actions as action}
      <button class="sheet-row" onclick={action.handler}>
        <div class="sheet-icon-box" aria-hidden="true">{action.icon}</div>
        <div class="sheet-text">
          <span class="sheet-label">{action.label}</span>
          <span class="sheet-sub">{action.sub}</span>
        </div>
      </button>
    {/each}
    <button class="sheet-cancel" onclick={() => (sheetOpen = false)}>Cancel</button>
  </dialog>
{/if}

<style>
  .bottom-nav {
    display: none;
    position: fixed;
    bottom: 0; left: 0; right: 0;
    z-index: 50;
    height: calc(64px + var(--safe-bottom));
    padding-bottom: var(--safe-bottom);
    background: var(--glass-chrome);
    -webkit-backdrop-filter: var(--blur-chrome);
    backdrop-filter: var(--blur-chrome);
    border-top: 1px solid var(--brand-line);
    grid-template-columns: repeat(5, 1fr);
    align-items: center;
  }
  @media (max-width: 760px) { .bottom-nav { display: grid; } }

  .nav-slot {
    all: unset;
    cursor: pointer;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 3px;
    padding: 8px 4px;
    color: var(--ink-3);
    text-decoration: none;
    transition: color var(--dur) var(--ease);
    min-height: 44px;
    min-width: 44px;
  }
  .nav-slot.active { color: var(--brand); }
  .nav-slot:hover  { color: var(--brand-deep); }
  .nav-icon { font-size: 18px; line-height: 1; }
  .nav-label { font-size: 9.5px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; }

  /* FAB */
  .fab-slot {
    all: unset;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    position: relative;
  }
  .fab-btn {
    width: 54px; height: 54px;
    border-radius: 18px;
    background: linear-gradient(135deg, #56BCEC, #1F7AAB);
    display: grid; place-items: center;
    color: white; font-size: 26px; font-weight: 300; line-height: 1;
    box-shadow: var(--sh-fab);
    margin-bottom: 12px;
    transition: transform var(--dur) var(--ease), box-shadow var(--dur) var(--ease);
  }
  .fab-slot:active .fab-btn { transform: scale(0.94); }

  /* Backdrop */
  .sheet-backdrop {
    position: fixed; inset: 0; z-index: 60;
    background: rgba(10,16,32,0.40);
    animation: fade-in 200ms var(--ease);
  }

  /* Action sheet */
  .action-sheet {
    position: fixed;
    bottom: 0; left: 0; right: 0;
    z-index: 70;
    margin: 0;
    padding: 0 0 calc(16px + var(--safe-bottom));
    border: none;
    border-radius: 26px 26px 0 0;
    background: var(--glass-elev);
    -webkit-backdrop-filter: var(--blur-elev);
    backdrop-filter: var(--blur-elev);
    box-shadow: var(--sh-elev);
    border-top: 1px solid var(--brand-line-2);
    animation: sheet-up 320ms cubic-bezier(0.32, 0.72, 0, 1);
    max-height: 60vh;
    overflow-y: auto;
  }
  @keyframes sheet-up {
    from { transform: translateY(100%); }
    to   { transform: translateY(0); }
  }
  .sheet-handle {
    width: 36px; height: 4px;
    border-radius: 2px;
    background: var(--ink-4);
    margin: 12px auto 0;
  }
  .sheet-title {
    font: 600 16px/1.2 Inter, sans-serif;
    color: var(--ink);
    margin: 16px 20px 8px;
    letter-spacing: -0.01em;
  }
  .sheet-row {
    all: unset;
    cursor: pointer;
    display: flex; align-items: center; gap: 16px;
    width: 100%;
    padding: 14px 20px;
    transition: background var(--dur) var(--ease);
  }
  .sheet-row:hover { background: var(--brand-soft); }
  .sheet-icon-box {
    width: 42px; height: 42px;
    border-radius: 12px;
    background: var(--brand-soft);
    display: grid; place-items: center;
    font-size: 18px;
    color: var(--brand-deep);
    flex-shrink: 0;
  }
  .sheet-text { display: flex; flex-direction: column; gap: 2px; }
  .sheet-label { font: 500 15px/1.2 Inter, sans-serif; color: var(--ink); }
  .sheet-sub   { font-size: 12px; color: var(--ink-3); }
  .sheet-cancel {
    all: unset;
    cursor: pointer;
    display: block;
    width: calc(100% - 40px);
    margin: 8px 20px 0;
    padding: 14px;
    text-align: center;
    font: 600 14px/1 Inter, sans-serif;
    color: var(--ink-2);
    background: var(--canvas-2);
    border: 1px solid var(--line);
    border-radius: 14px;
    transition: background var(--dur) var(--ease);
  }
  .sheet-cancel:hover { background: var(--brand-soft); }

  @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
</style>

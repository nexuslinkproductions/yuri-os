<script lang="ts">
  import { page } from "$app/stores";
  import { theme } from "$stores/theme.svelte";
  import { cmdPalette } from "$stores/cmdPalette.svelte";

  interface NavItem {
    path: string;
    label: string;
    icon: string;
  }

  const sections: { label: string; items: NavItem[] }[] = [
    {
      label: "TODAY",
      items: [
        { path: "/nexogram", label: "NEXOGRAM", icon: "◇" },
        { path: "/",         label: "Command",  icon: "⌘" },
        { path: "/tracker",  label: "CHRONEX",  icon: "⧗" },
      ],
    },
    {
      label: "WORK",
      items: [
        { path: "/clients",             label: "Clients",  icon: "◈" },
        { path: "/pipeline/customers",  label: "CRM",      icon: "▷" },
        { path: "/pipeline",            label: "Pipeline", icon: "▤" },
        { path: "/projects",            label: "Projects", icon: "◉" },
        { path: "/nexdoc",              label: "NEXdoc",   icon: "⊡" },
        { path: "/files",               label: "File Vault", icon: "⊞" },
      ],
    },
    {
      label: "MONEY",
      items: [
        { path: "/finance",  label: "Finance",  icon: "◈" },
        { path: "/revenue",  label: "Revenue",  icon: "◆" },
        { path: "/expenses", label: "Expenses", icon: "◉" },
      ],
    },
    {
      label: "BRAIN",
      items: [
        { path: "/intel",    label: "Intel",    icon: "◎" },
        { path: "/focus",    label: "Focus",    icon: "✦" },
      ],
    },
    {
      label: "SYSTEM",
      items: [
        { path: "/health",     label: "System",     icon: "⊕" },
        { path: "/ai-monitor", label: "AI Monitor", icon: "◉" },
        { path: "/railguard",  label: "RailGuard",  icon: "⛨" },
        { path: "/di-monitor", label: "Deploy Log", icon: "↗" },
        { path: "/meetings",   label: "Meetings",   icon: "◐" },
        { path: "/admin",      label: "Admin",      icon: "⊛" },
      ],
    },
  ];

  // BRAIN + SYSTEM start collapsed to fit without scrolling on most screens
  let collapsed = $state<Record<string, boolean>>({
    TODAY: false,
    WORK: false,
    MONEY: false,
    BRAIN: true,
    SYSTEM: true,
  });

  function toggleSection(label: string) {
    collapsed[label] = !collapsed[label];
  }

  function isActive(path: string): boolean {
    const p = $page.url.pathname;
    if (path === "/" && p === "/") return true;
    if (path === "/pipeline" && p.startsWith("/pipeline/customers")) return false;
    if (path !== "/" && p.startsWith(path)) return true;
    return false;
  }

  // Auto-expand the section containing the active route
  $effect(() => {
    for (const s of sections) {
      if (s.items.some(i => isActive(i.path))) {
        collapsed[s.label] = false;
      }
    }
  });
</script>

<aside class="rail">
  <!-- Brand mark -->
  <a href="/" class="brand" aria-label="NEX Operations">
    <div class="brand-mark">
      <svg viewBox="0 0 256 201" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" width="22" height="17">
        <path d="M197 75l-51-9c8-14 23-23 39-24l12 33z" fill="#56bcec"/>
        <path d="M205 90l-17-49c16 0 32 8 41 22l-24 27z" fill="#56bcec"/>
        <path d="M230 113l-1 3c-7 10-19 18-31 21l-5 1-12-33 49 8z" fill="#56bcec"/>
        <path d="M196 105l34-39c8 13 9 31 2 45l-36-6z" fill="#56bcec"/>
        <path d="M180 74l-34 39c-8-14-8-31-1-45 12 2 23 4 35 6z" fill="#56bcec"/>
        <path d="M189 138c-14 1-27-6-37-16l-4-6 23-26 18 48z" fill="#56bcec"/>
      </svg>
    </div>
    <div class="brand-text rail-label">
      <span class="brand-name">c2moviez</span>
      <span class="brand-sub">NEX · OPS</span>
    </div>
  </a>

  <!-- Nav sections -->
  <nav class="rail-nav" aria-label="Primary navigation">
    {#each sections as section (section.label)}
      <div class="rail-section">
        <!-- Section header — clickable to collapse/expand when sidebar is open -->
        <button
          type="button"
          class="rail-section-label"
          onclick={() => toggleSection(section.label)}
          aria-expanded={!collapsed[section.label]}
          title="{section.label} (click to {collapsed[section.label] ? 'expand' : 'collapse'})"
        >
          <span class="section-label-text">{section.label}</span>
          <span class="section-chev" aria-hidden="true">
            {collapsed[section.label] ? "▸" : "▾"}
          </span>
        </button>

        <!-- Collapsible items — uses grid-template-rows trick for smooth animation.
             In icon-only mode (.rail not hovered), always show items regardless of collapse. -->
        <div
          class="rail-section-items"
          class:rail-section-items--collapsed={collapsed[section.label]}
          aria-hidden={collapsed[section.label]}
        >
          <div class="rail-section-inner">
            {#each section.items as item}
              <a
                href={item.path}
                class="rail-item {isActive(item.path) ? 'active' : ''}"
                aria-label={item.label}
                title={item.label}
              >
                <span class="rail-icon" aria-hidden="true">{item.icon}</span>
                <span class="rail-label">{item.label}</span>
              </a>
            {/each}
          </div>
        </div>
      </div>
    {/each}

  </nav>

  <div class="rail-spacer"></div>

  <!-- Ask NEX -->
  <button class="ask-nex" onclick={() => cmdPalette.show()} aria-label="Ask NEX (⌘K)">
    <div class="nex-icon" aria-hidden="true">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
      </svg>
    </div>
    <span class="nex-text rail-label">Ask NEX · ⌘K</span>
  </button>

  <!-- Theme toggle -->
  <button class="theme-btn" onclick={() => theme.toggle()} aria-label="Toggle theme" title="Toggle theme">
    {#if theme.current === "dark"}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="5"/>
        <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
        <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
      </svg>
    {:else}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
      </svg>
    {/if}
    <span class="rail-label theme-label">{theme.current === "dark" ? "Light" : "Dark"}</span>
  </button>
</aside>

<style>
  .rail {
    position: sticky;
    top: 0;
    height: 100vh;
    width: 64px;
    display: flex;
    flex-direction: column;
    padding: 16px 8px 16px;
    border-right: 1px solid var(--brand-line);
    background: var(--glass-chrome);
    -webkit-backdrop-filter: var(--blur-chrome);
    backdrop-filter: var(--blur-chrome);
    transition: width var(--dur-2) var(--ease);
    overflow: hidden;
    flex-shrink: 0;
    z-index: 20;
  }
  .rail:hover {
    width: 240px;
  }

  /* Brand */
  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
    text-decoration: none;
    color: var(--ink);
    padding: 0 4px 16px;
    border-bottom: 1px solid var(--brand-line);
    margin-bottom: 12px;
    flex-shrink: 0;
  }
  .brand-mark {
    width: 36px; height: 36px;
    border-radius: 11px;
    background: rgba(86,188,236,0.12);
    border: 1px solid rgba(86,188,236,0.30);
    display: grid; place-items: center;
    box-shadow: 0 4px 14px rgba(86,188,236,0.20), inset 0 1px 0 rgba(255,255,255,0.12);
    backdrop-filter: blur(8px);
    flex-shrink: 0;
  }
  .brand-text {
    display: flex;
    flex-direction: column;
    line-height: 1;
    white-space: nowrap;
  }
  .brand-name {
    font-weight: 700; font-size: 15px; letter-spacing: -0.025em; color: var(--ink);
  }
  .brand-sub {
    font-size: 9px; letter-spacing: 0.30em; color: var(--ink-3); margin-top: 4px;
    font-weight: 700; font-family: 'JetBrains Mono', monospace;
  }

  /* Nav */
  .rail-nav {
    display: flex;
    flex-direction: column;
    gap: 0;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: none;
  }
  .rail-nav::-webkit-scrollbar { display: none; }

  .rail-section {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-bottom: 2px;
  }
  .rail-section + .rail-section { margin-top: 6px; }

  /* Section label — now a button for collapse toggle */
  .rail-section-label {
    all: unset;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    width: 100%;
    padding: 4px 12px 3px;
    border-radius: 5px;
    cursor: pointer;
    transition: background var(--dur) var(--ease);
  }
  .rail-section-label:hover { background: var(--brand-soft); }
  .section-label-text {
    font: 700 9px/1 Inter, sans-serif;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--ink-3);
    opacity: 0;
    transition: opacity var(--dur-2) var(--ease);
    white-space: nowrap;
    flex: 1;
  }
  .rail:hover .section-label-text { opacity: 1; }

  .section-chev {
    font-size: 8px;
    color: var(--ink-3);
    opacity: 0;
    margin-left: 4px;
    transition: opacity var(--dur-2) var(--ease), transform 220ms var(--ease);
    flex-shrink: 0;
  }
  .rail:hover .section-chev { opacity: 0.7; }

  /* Smooth collapse via grid-template-rows trick */
  .rail-section-items {
    display: grid;
    grid-template-rows: 1fr;
    transition: grid-template-rows 220ms cubic-bezier(0.4, 0, 0.2, 1);
  }
  .rail-section-items--collapsed {
    grid-template-rows: 0fr;
  }

  /* In icon-only mode (not hovered), always show items regardless of collapse state */
  .rail:not(:hover) .rail-section-items {
    grid-template-rows: 1fr !important;
  }

  .rail-section-inner {
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-height: 0;
  }

  .rail-item {
    display: flex;
    align-items: center;
    gap: 12px;
    height: 38px;
    padding: 0 12px;
    border-radius: 10px;
    text-decoration: none;
    color: var(--ink-2);
    font-size: 13.5px;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--dur) var(--ease);
    position: relative;
    white-space: nowrap;
    overflow: hidden;
  }
  .rail-item:hover { background: var(--brand-soft); color: var(--ink); }
  .rail-item.active {
    background: var(--brand-soft);
    color: var(--brand-deep);
    font-weight: 600;
  }
  .rail-item.active::before {
    content: '';
    position: absolute;
    left: -8px; top: 8px; bottom: 8px;
    width: 3px;
    background: var(--brand);
    border-radius: 0 3px 3px 0;
  }
  .rail-icon {
    width: 18px; height: 18px;
    display: grid; place-items: center;
    flex-shrink: 0;
    font-size: 14px;
    line-height: 1;
  }

  /* Labels hidden when collapsed, visible when sidebar is expanded */
  .rail-label {
    opacity: 0;
    transition: opacity var(--dur-2) var(--ease);
    white-space: nowrap;
    overflow: hidden;
  }
  .rail:hover .rail-label { opacity: 1; }

  .rail-spacer { flex: 1; }

  /* Ask NEX */
  .ask-nex {
    all: unset;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 10px;
    height: 44px;
    padding: 0 12px;
    border-radius: 12px;
    background: linear-gradient(135deg, var(--brand-soft), transparent);
    border: 1px solid var(--brand-line);
    color: var(--ink-2);
    font-size: 13px;
    cursor: pointer;
    transition: all var(--dur) var(--ease);
    white-space: nowrap;
    overflow: hidden;
    flex-shrink: 0;
    margin-top: 8px;
  }
  .ask-nex:hover { border-color: var(--brand-line-2); background: var(--brand-soft); }
  .nex-icon {
    width: 24px; height: 24px;
    border-radius: 6px;
    flex-shrink: 0;
    background: linear-gradient(135deg, #56BCEC, #1F7AAB);
    display: grid; place-items: center;
    box-shadow: 0 4px 10px var(--brand-glow), inset 0 1px 0 rgba(255,255,255,0.4);
  }
  .nex-text { font-size: 12.5px; color: var(--ink-2); }

  /* Theme toggle */
  .theme-btn {
    all: unset;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 12px;
    height: 40px;
    padding: 0 12px;
    border-radius: 10px;
    color: var(--ink-2);
    cursor: pointer;
    transition: all var(--dur) var(--ease);
    white-space: nowrap;
    overflow: hidden;
    flex-shrink: 0;
    margin-top: 4px;
  }
  .theme-btn:hover { background: var(--brand-soft); color: var(--ink); }
  .theme-label { font-size: 13px; }

  @media (prefers-reduced-motion: reduce) {
    .rail-section-items { transition: none; }
    .section-chev { transition: none; }
  }

  /* Hide on mobile */
  @media (max-width: 760px) {
    .rail { display: none; }
  }
</style>

<script lang="ts">
  import { page } from "$app/stores";
  import { theme } from "$stores/theme.svelte";
  import { cmdPalette } from "$stores/cmdPalette.svelte";
  import { goto } from "$app/navigation";

  // notification badge — count of urgent open tickets (passed from parent)
  interface Props { urgentCount?: number; }
  let { urgentCount = 0 }: Props = $props();
</script>

<header class="cbar">
  <a href="/" class="brand" aria-label="NEX Operations home">
    <img src="/brand/logo.svg" alt="c2moviez" width="22" height="22" />
    <span class="brand-text">
      <span class="b-name">c2moviez</span>
      <span class="b-sub">OPS · NEX</span>
    </span>
  </a>

  <button class="search-box" onclick={() => cmdPalette.show()} aria-label="Open search (⌘K)">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
    </svg>
    <span class="search-placeholder">Search clients, tickets, meetings…</span>
    <kbd class="search-kbd">⌘K</kbd>
  </button>

  <div class="bar-right">
    <!-- Notifications -->
    <button class="icon-btn" aria-label="Notifications" title="Notifications">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>
      {#if urgentCount > 0}
        <span class="notif-dot">{urgentCount > 9 ? "9+" : urgentCount}</span>
      {/if}
    </button>

    <!-- Theme toggle -->
    <button class="icon-btn" onclick={() => theme.toggle()} aria-label="Toggle theme" title="Toggle theme">
      {#if theme.current === "dark"}
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="5"/>
          <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
          <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
      {:else}
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      {/if}
    </button>

    <!-- Avatar -->
    <div class="avatar" title="Claudio Tinner">CT</div>
  </div>
</header>

<!-- Mobile bottom nav -->
<nav class="mobile-nav" aria-label="Primary mobile">
  {#each [
    { path: "/",         icon: "⌂", label: "Command"  },
    { path: "/focus",    icon: "✦", label: "Focus"    },
    { path: "/calendar", icon: "◷", label: "Calendar" },
    { path: "/clients",  icon: "◉", label: "Clients"  },
    { path: "/pipeline", icon: "▷", label: "Pipeline" },
  ] as r}
    {@const active = $page.url.pathname === r.path}
    <a href={r.path} class="mob-tab {active ? 'active' : ''}" aria-label={r.label}>
      <span class="mob-icon">{r.icon}</span>
      <span class="mob-label">{r.label}</span>
    </a>
  {/each}
  <button class="mob-tab" onclick={() => cmdPalette.show()} aria-label="Search">
    <span class="mob-icon">⌕</span>
    <span class="mob-label">Search</span>
  </button>
</nav>

<style>
  .cbar {
    position: sticky;
    top: 0;
    z-index: 40;
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 16px;
    height: 56px;
    padding: 0 clamp(16px, 3vw, 36px);
    background: rgba(8, 11, 20, 0.88);
    backdrop-filter: blur(20px) saturate(1.4);
    -webkit-backdrop-filter: blur(20px) saturate(1.4);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  /* Brand */
  .brand {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    text-decoration: none;
    flex-shrink: 0;
  }
  .brand img { border-radius: 4px; }
  .brand-text { display: flex; flex-direction: column; line-height: 1; gap: 1px; }
  .b-name {
    font-size: 13px;
    font-weight: 600;
    font-family: "Space Grotesk", sans-serif;
    letter-spacing: -0.01em;
    color: #fff;
  }
  .b-sub {
    font-size: 8.5px;
    letter-spacing: 0.22em;
    color: rgba(255,255,255,0.35);
    font-family: "JetBrains Mono", monospace;
  }

  /* Search */
  .search-box {
    all: unset;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 14px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: 12px;
    color: rgba(255,255,255,0.35);
    font-size: 13px;
    font-family: "Space Grotesk", sans-serif;
    transition: background 0.16s, border-color 0.16s;
    min-width: 0;
    width: 100%;
    max-width: 480px;
    margin: 0 auto;
  }
  .search-box:hover {
    background: rgba(255,255,255,0.07);
    border-color: rgba(63,181,242,0.3);
    color: rgba(255,255,255,0.55);
  }
  .search-placeholder { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .search-kbd {
    font-family: "JetBrains Mono", monospace;
    font-size: 10px;
    padding: 2px 6px;
    background: rgba(255,255,255,0.07);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 5px;
    color: rgba(255,255,255,0.3);
    flex-shrink: 0;
  }

  /* Right actions */
  .bar-right {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }
  .icon-btn {
    all: unset;
    cursor: pointer;
    position: relative;
    width: 36px; height: 36px;
    display: grid; place-items: center;
    border-radius: 10px;
    color: rgba(255,255,255,0.45);
    transition: background 0.14s, color 0.14s;
  }
  .icon-btn:hover { background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.85); }
  .notif-dot {
    position: absolute;
    top: 5px; right: 5px;
    min-width: 14px; height: 14px;
    border-radius: 999px;
    background: var(--re);
    color: #fff;
    font-family: "JetBrains Mono", monospace;
    font-size: 8px;
    display: grid; place-items: center;
    padding: 0 2px;
    border: 1.5px solid var(--bg);
  }
  .avatar {
    width: 32px; height: 32px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--a) 0%, var(--a2) 100%);
    display: grid; place-items: center;
    font-size: 11px; font-weight: 700;
    color: #fff;
    letter-spacing: 0.04em;
    font-family: "Space Grotesk", sans-serif;
    flex-shrink: 0;
    cursor: default;
  }

  /* Mobile nav — only shows on phones */
  .mobile-nav {
    display: none;
    position: fixed;
    bottom: 0; left: 0; right: 0;
    z-index: 50;
    background: rgba(8,11,20,0.95);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-top: 1px solid rgba(255,255,255,0.08);
    padding-bottom: env(safe-area-inset-bottom);
    height: calc(56px + env(safe-area-inset-bottom));
    grid-template-columns: repeat(6, 1fr);
    align-items: center;
  }
  @media (max-width: 760px) { .mobile-nav { display: grid; } }

  .mob-tab {
    all: unset;
    cursor: pointer;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 2px;
    padding: 8px 4px;
    color: rgba(255,255,255,0.35);
    text-decoration: none;
    transition: color 0.14s;
    min-height: 44px;
    min-width: 44px;
  }
  .mob-tab.active, .mob-tab:hover { color: var(--a); }
  .mob-icon { font-size: 17px; line-height: 1; }
  .mob-label { font-size: 9px; letter-spacing: 0.06em; }

  @media (max-width: 760px) {
    .cbar { gap: 10px; }
    .search-box { max-width: none; }
    .b-name, .b-sub { display: none; }
  }
</style>

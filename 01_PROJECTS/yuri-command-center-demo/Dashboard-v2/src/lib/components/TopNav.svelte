<script lang="ts">
  import { page } from "$app/stores";
  import { theme } from "$stores/theme.svelte";
  import { cmdPalette } from "$stores/cmdPalette.svelte";
  import { auditRail } from "$stores/auditRail.svelte";

  const routes = [
    { path: "/",           label: "Command"   },
    { path: "/focus",      label: "Focus ✦"   },
    { path: "/calendar",   label: "Calendar"  },
    { path: "/meetings",   label: "Meetings"  },
    { path: "/clients",    label: "Clients"   },
    { path: "/pipeline",   label: "Pipeline"  },
    { path: "/revenue",    label: "Revenue"   },
    { path: "/projects",   label: "Projects"  },
    { path: "/intel",      label: "Intel"     },
    { path: "/learning",   label: "Learning"  },
    { path: "/reasoning",  label: "Reasoning" },
    { path: "/health",     label: "Health"    },
    { path: "/tokens",     label: "Tokens ◆"  },
  ];

  const isActive = (p: string) => {
    if (p === "/") return $page.url.pathname === "/";
    return $page.url.pathname.startsWith(p);
  };

  let mobileOpen = $state(false);
</script>

<header class="navbar glass glass--thick">
  <div class="navbar-inner">
    <a href="/" class="brand" aria-label="c2moviez EXEO home">
      <span class="brand-logo" aria-hidden="true">
        <span class="pulse-ring"></span>
        <span class="pulse-ring pulse-ring--delay"></span>
        <img src="/brand/logo.svg" alt="" height="22" />
      </span>
      <span class="brand-text">
        <span class="font-display brand-c2m">c2moviez</span>
        <span class="caption brand-exeo">NEX</span>
      </span>
    </a>

    <nav class="nav-links" aria-label="Primary">
      {#each routes as r}
        <a href={r.path} class="navlink {isActive(r.path) ? 'active' : ''}">
          {r.label}
        </a>
      {/each}
    </nav>

    <div class="nav-aside">
      <button
        type="button"
        class="cmd-btn desktop-only"
        onclick={() => cmdPalette.show()}
        aria-label="Open command palette"
        title="Command palette (⌘K)"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <span class="cmd-label">Search</span>
        <kbd class="cmd-shortcut">⌘K</kbd>
      </button>

      <button
        type="button"
        class="icon-btn {auditRail.open ? 'active' : ''}"
        onclick={() => auditRail.toggle()}
        aria-label="Toggle audit rail"
        title="Audit rail"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M3 6h18M3 12h18M3 18h12"/>
        </svg>
      </button>

      <button
        type="button"
        class="icon-btn"
        onclick={() => theme.toggle()}
        aria-label="Toggle theme"
        title="Toggle theme"
      >
        <span class="caption">{theme.current === "dark" ? "☀" : "◐"}</span>
      </button>
      <button
        type="button"
        class="icon-btn mobile-only"
        onclick={() => (mobileOpen = !mobileOpen)}
        aria-label="Toggle menu"
        aria-expanded={mobileOpen}
      >
        <span class="caption">{mobileOpen ? "✕" : "☰"}</span>
      </button>
    </div>
  </div>

  {#if mobileOpen}
    <nav class="mobile-drawer glass glass--thick" aria-label="Mobile primary">
      {#each routes as r}
        <a
          href={r.path}
          class="drawer-row {isActive(r.path) ? 'active' : ''}"
          onclick={() => (mobileOpen = false)}
        >
          {r.label}
        </a>
      {/each}
    </nav>
  {/if}
</header>

<style>
  .navbar {
    position: sticky;
    top: 0;
    z-index: 40;
    border-radius: 0;
    border-left: none;
    border-right: none;
    border-top: none;
    border-bottom: 1px solid var(--b2);
  }
  .navbar-inner {
    max-width: 1440px;
    margin: 0 auto;
    height: 60px;
    padding: 0 clamp(16px, 3vw, 32px);
    display: flex;
    align-items: center;
    gap: 24px;
  }

  .brand {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 4px 4px;
    border-radius: var(--r-sm);
    text-decoration: none;
    flex-shrink: 0;
  }
  /* Phase N4 — #5 Pulse-ring logo */
  .brand-logo {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    flex-shrink: 0;
  }
  .brand-logo img {
    position: relative;
    z-index: 2;
    filter: drop-shadow(0 0 6px rgba(0, 200, 255, 0.18));
  }
  .pulse-ring {
    position: absolute;
    inset: 50% auto auto 50%;
    width: 28px;
    height: 28px;
    margin: -14px 0 0 -14px;
    border-radius: 50%;
    border: 1.5px solid rgba(0, 200, 255, 0.55);
    box-shadow:
      0 0 12px rgba(0, 200, 255, 0.35),
      inset 0 0 8px rgba(123, 92, 255, 0.18);
    opacity: 0;
    pointer-events: none;
    z-index: 1;
    animation: pulse-ring 3.6s cubic-bezier(0.22, 0.61, 0.36, 1) infinite;
  }
  .pulse-ring--delay {
    border-color: rgba(123, 92, 255, 0.5);
    box-shadow:
      0 0 14px rgba(123, 92, 255, 0.32),
      inset 0 0 6px rgba(0, 200, 255, 0.14);
    animation-delay: 1.8s;
  }
  @keyframes pulse-ring {
    0%   { transform: scale(0.85); opacity: 0; }
    18%  { opacity: 0.85; }
    70%  { opacity: 0.18; }
    100% { transform: scale(1.95); opacity: 0; }
  }
  .brand:hover .brand-logo img {
    filter: drop-shadow(0 0 10px rgba(0, 200, 255, 0.40));
  }
  @media (prefers-reduced-motion: reduce) {
    .pulse-ring { animation: none; opacity: 0.35; transform: scale(1.05); }
    .pulse-ring--delay { display: none; }
  }

  .brand-text { display: flex; flex-direction: column; line-height: 1; }
  .brand-c2m {
    font-size: 16px;
    letter-spacing: -0.02em;
    background: linear-gradient(135deg, var(--a) 0%, var(--a2) 100%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    font-weight: 600;
  }
  .brand-exeo {
    margin-top: 2px;
    font-size: 9px;
    letter-spacing: 0.28em;
    color: var(--t3);
  }

  .nav-links {
    display: flex;
    align-items: center;
    gap: 2px;
    flex: 1;
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .nav-links::-webkit-scrollbar { display: none; }

  .navlink {
    position: relative;
    display: inline-flex;
    align-items: center;
    padding: 8px 12px;
    border-radius: var(--r-sm);
    color: var(--t2);
    text-decoration: none;
    font-size: 13.5px;
    font-family: "Space Grotesk", sans-serif;
    letter-spacing: -0.006em;
    white-space: nowrap;
    transition:
      background var(--dur-fast) var(--ease-out),
      color var(--dur-fast) var(--ease-out);
  }
  .navlink:hover { background: var(--s1); color: var(--tx); }
  .navlink.active { color: var(--tx); }
  .navlink.active::after {
    content: "";
    position: absolute;
    left: 12px;
    right: 12px;
    bottom: -1px;
    height: 2px;
    background: var(--a);
    border-radius: 2px 2px 0 0;
    box-shadow: 0 0 10px var(--a);
  }

  .nav-aside {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    margin-left: auto;
  }
  .icon-btn {
    all: unset;
    cursor: pointer;
    width: 36px; height: 36px;
    display: inline-flex; align-items: center; justify-content: center;
    border-radius: var(--r-sm);
    color: var(--t2);
    font-size: 14px;
  }
  .icon-btn:hover { background: var(--s1); color: var(--tx); }
  .icon-btn.active { background: var(--a-12); color: var(--a); }
  .icon-btn.active:hover { background: var(--a-18); }
  .mobile-only { display: none; }
  .desktop-only { display: inline-flex; }

  .cmd-btn {
    all: unset;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 7px 12px;
    border-radius: var(--r-sm);
    border: 1px solid var(--b2);
    background: var(--s1);
    color: var(--t2);
    font-size: 13px;
    transition: background var(--dur-fast), border-color var(--dur-fast), color var(--dur-fast);
  }
  .cmd-btn:hover { background: var(--s2); border-color: var(--b3); color: var(--tx); }
  .cmd-label { font-family: var(--sa); }
  .cmd-shortcut {
    font-family: var(--mo);
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 4px;
    background: var(--s2);
    border: 1px solid var(--b2);
    color: var(--t3);
  }

  .mobile-drawer {
    position: absolute;
    top: calc(100% + 8px);
    right: clamp(16px, 3vw, 32px);
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px;
    border-radius: 16px;
    min-width: 220px;
  }
  .drawer-row {
    padding: 10px 14px;
    border-radius: 10px;
    color: var(--t2);
    text-decoration: none;
    font-size: 14px;
    font-family: "Space Grotesk", sans-serif;
  }
  .drawer-row:hover { background: var(--s1); color: var(--tx); }
  .drawer-row.active { background: color-mix(in oklab, var(--a) 16%, transparent); color: var(--tx); }

  @media (max-width: 760px) {
    .nav-links { display: none; }
    .mobile-only { display: inline-flex; }
    .desktop-only { display: none; }
  }
</style>

<script lang="ts">
  import "../app.css";
  import { onMount } from "svelte";
  import { onNavigate } from "$app/navigation";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { browser } from "$app/environment";
  import { theme } from "$stores/theme.svelte";
  import { cmdPalette } from "$stores/cmdPalette.svelte";
  import { auditRail } from "$stores/auditRail.svelte";
  import { supabase, hasClient } from "$lib/db";
  import AuroraField from "$components/AuroraField.svelte";
  import Sidebar from "$components/Sidebar.svelte";
  import MobileBottomNav from "$components/MobileBottomNav.svelte";
  import GlassToast from "$components/GlassToast.svelte";
  import CommandPalette from "$components/CommandPalette.svelte";
  import QuickActionModal from "$components/QuickActionModal.svelte";
  import AuditRail from "$components/AuditRail.svelte";
  import { quickAction } from "$stores/quickAction.svelte";

  interface Props { children?: import("svelte").Snippet; }
  let { children }: Props = $props();

  // View transitions
  onNavigate((navigation) => {
    if (!browser || !document.startViewTransition) return;
    return new Promise((resolve) => {
      document.startViewTransition(async () => {
        resolve();
        await navigation.complete;
      });
    });
  });

  onMount(() => {
    theme.sync();
    auditRail.init();
    if (!browser) return;

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    }

    const path = $page.url.pathname;
    if (path === "/login" || path.startsWith("/auth/") || path === "/pitch" || path.startsWith("/pitch/") || path === "/welcome") return;

    const ALLOWED_DOMAIN = "@c2moviez.com";
    const CEO_EMAIL = "claudio@c2moviez.com";

    const verifyAuth = async () => {
      let goTrueBearer: string | null = null;

      if (hasClient()) {
        try {
          const { data } = await supabase().auth.getSession();
          if (data.session) {
            const email = (data.session.user?.email || "").toLowerCase();

            // ── Domain restriction ───────────────────────────────
            if (email && !email.endsWith(ALLOWED_DOMAIN)) {
              try { await supabase().auth.signOut(); } catch { /* ignore */ }
              sessionStorage.removeItem("exeo-authed");
              goto("/login?error=domain_not_allowed", { replaceState: true });
              return;
            }

            // ── Pending access check ─────────────────────────────
            // CEO bypasses entirely; everyone else must have a profile
            // row with is_active = true.
            if (email && email !== CEO_EMAIL) {
              try {
                const { data: prof } = await supabase()
                  .from("user_profiles")
                  .select("is_active")
                  .eq("id", data.session.user.id)
                  .maybeSingle();
                if (!prof || prof.is_active !== true) {
                  sessionStorage.removeItem("exeo-authed");
                  goto("/welcome", { replaceState: true });
                  return;
                }
              } catch {
                // Profile table missing or RLS denies — fall through to welcome
                // rather than grant access by default.
                sessionStorage.removeItem("exeo-authed");
                goto("/welcome", { replaceState: true });
                return;
              }
            }

            sessionStorage.setItem("exeo-authed", "1");
            localStorage.setItem("exeo-authed", "1");
            // Proactively mint/refresh the exeo_token cookie while the GoTrue
            // Bearer is still valid, so cookie auth persists after Bearer expires.
            // Fire-and-forget — non-fatal if it fails.
            void fetch("/api/functions/auth", {
              method: "POST", credentials: "include",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${data.session.access_token}`,
              },
              body: JSON.stringify({ action: "verify" }),
            }).catch(() => {});
            return;
          }
          // No session returned. Do NOT signOut here — that nukes the
          // refresh token in localStorage and forces a full re-login on
          // the next intermittent GoTrue blip (incident 2026-05-19).
          // Fall through to cookie / bearer verify; if THAT also fails
          // we'll kick to /login.
        } catch {
          // getSession threw (network blip, GoTrue restart). Same logic:
          // fall through to the server verify, don't preemptively nuke.
        }

        // Best-effort: grab the GoTrue access_token from localStorage so
        // we can forward it as Bearer to the server verify endpoint. The
        // supabase-js client stores it under a project-scoped key.
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k || !k.startsWith("sb-") || !k.endsWith("-auth-token")) continue;
            try {
              const raw = localStorage.getItem(k);
              if (!raw) continue;
              const parsed = JSON.parse(raw);
              const tok = parsed?.access_token || parsed?.currentSession?.access_token;
              if (tok) { goTrueBearer = tok; break; }
            } catch { /* ignore parse error on that key */ }
          }
        } catch { /* localStorage blocked — ignore */ }
      }

      try {
        const headers: Record<string, string> = { "content-type": "application/json" };
        if (goTrueBearer) headers["authorization"] = `Bearer ${goTrueBearer}`;
        const r = await fetch("/api/functions/auth", {
          method: "POST", credentials: "include",
          headers,
          body: JSON.stringify({ action: "verify" }),
        });
        if (!r.ok) throw new Error("verify failed");
        const data = await r.json();
        if (!data?.ok) throw new Error("not authed");
        sessionStorage.setItem("exeo-authed", "1");
        localStorage.setItem("exeo-authed", "1");
      } catch {
        sessionStorage.removeItem("exeo-authed");
        localStorage.removeItem("exeo-authed");
        localStorage.removeItem("exeo-token");
        // Only redirect on the foreground (first-visit) check. Background
        // re-verifies (cached=true) clear the cache silently so the next
        // navigation triggers a proper foreground check — this prevents
        // already-rendered pages from being yanked away by a transient
        // auth blip.
        if (!cached) goto("/login", { replaceState: true });
      }
    };

    const cached = sessionStorage.getItem("exeo-authed") === "1" || localStorage.getItem("exeo-authed") === "1";
    if (!cached) { verifyAuth(); } else { void verifyAuth(); }
    const id = setInterval(verifyAuth, 60 * 60 * 1000);

    // App-wide reactivity: when tab regains focus after >60s, trigger data refresh
    let hiddenAt = 0;
    function onVisibilityChange() {
      if (document.hidden) {
        hiddenAt = Date.now();
      } else if (hiddenAt && Date.now() - hiddenAt > 60_000) {
        window.dispatchEvent(new CustomEvent('nex:data-refresh'));
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  });

  const isLogin = $derived($page.url.pathname === "/login");
  const isPitch = $derived($page.url.pathname === "/pitch" || $page.url.pathname.startsWith("/pitch/"));
  const isBare  = $derived(isLogin || isPitch);

  // ── Profile menu state ────────────────────────────────────────────
  let profileMenuOpen = $state(false);
  let signingOut = $state(false);

  function toggleProfileMenu(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    profileMenuOpen = !profileMenuOpen;
  }

  function closeProfileMenu() {
    profileMenuOpen = false;
  }

  async function handleLogout(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (signingOut) return;
    signingOut = true;
    // 1. Clear httpOnly cookie via auth function (password auth)
    try {
      await fetch("/api/functions/auth?action=logout", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
    } catch { /* ignore */ }
    // 2. Clear Supabase session (SSO auth)
    if (hasClient()) {
      try { await supabase().auth.signOut(); } catch { /* ignore */ }
    }
    // 3. Clear local hints
    try {
      sessionStorage.removeItem("exeo-authed");
      localStorage.removeItem("exeo-authed");
      localStorage.removeItem("exeo-token");
    } catch { /* ignore */ }
    profileMenuOpen = false;
    // 4. Redirect to login
    goto("/login", { replaceState: true });
  }
</script>

<svelte:head>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<svelte:window onkeydown={(e) => { cmdPalette.handleKey(e); quickAction.handleKey(e); }} />

{#if isBare}
  {@render children?.()}
{:else}
  <AuroraField />

  <div class="app-shell" class:rail-open={auditRail.open}>
    <!-- Side rail (desktop) -->
    <Sidebar />

    <!-- Content area -->
    <div class="shell-content">
      <!-- Top bar -->
      <header class="topbar">
        <div class="topbar-left">
          <!-- brand shown on mobile only (no sidebar) -->
          <a href="/" class="mobile-brand" aria-label="NEX Operations">
            <div class="mobile-brand-mark">
              <svg viewBox="0 0 256 201" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" width="20" height="16">
                <path d="M197 75l-51-9c8-14 23-23 39-24l12 33z" fill="#56bcec"/>
                <path d="M205 90l-17-49c16 0 32 8 41 22l-24 27z" fill="#56bcec"/>
                <path d="M230 113l-1 3c-7 10-19 18-31 21l-5 1-12-33 49 8z" fill="#56bcec"/>
                <path d="M196 105l34-39c8 13 9 31 2 45l-36-6z" fill="#56bcec"/>
                <path d="M180 74l-34 39c-8-14-8-31-1-45 12 2 23 4 35 6z" fill="#56bcec"/>
                <path d="M189 138c-14 1-27-6-37-16l-4-6 23-26 18 48z" fill="#56bcec"/>
              </svg>
            </div>
          </a>
        </div>

        <div class="topbar-center">
          <button class="search" onclick={() => cmdPalette.show()} aria-label="Search (⌘K)">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <span class="search-placeholder">Search clients, tickets, meetings…</span>
            <kbd class="kbd">⌘K</kbd>
          </button>
        </div>

        <div class="topbar-right">
          <!-- Theme toggle -->
          <button class="icon-btn" onclick={() => theme.toggle()} aria-label="Toggle theme" title="Toggle theme">
            {#if theme.current === "dark"}
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="5"/>
                <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
              </svg>
            {:else}
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            {/if}
          </button>

          <!-- Profile chip → dropdown menu -->
          <div class="profile-wrap">
            <button
              type="button"
              class="profile-chip"
              title="Account menu"
              aria-haspopup="menu"
              aria-expanded={profileMenuOpen}
              onclick={toggleProfileMenu}
            >
              <div class="avatar" aria-label="Claudio Tinner">CT</div>
              <span class="profile-name">Claudio</span>
              <svg class="profile-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            {#if profileMenuOpen}
              <button type="button" class="profile-scrim" aria-label="Close menu" onclick={closeProfileMenu}></button>
              <div class="profile-menu" role="menu">
                <a href="/admin/members" class="profile-menu-item" role="menuitem" onclick={closeProfileMenu}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <circle cx="12" cy="8" r="4"/>
                    <path d="M4 21a8 8 0 0 1 16 0"/>
                  </svg>
                  <span>Account</span>
                </a>
                <a href="/admin/modules" class="profile-menu-item" role="menuitem" onclick={closeProfileMenu}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                  </svg>
                  <span>Settings</span>
                </a>
                <div class="profile-menu-divider"></div>
                <button
                  type="button"
                  class="profile-menu-item profile-menu-item--danger"
                  role="menuitem"
                  disabled={signingOut}
                  onclick={handleLogout}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                    <polyline points="16 17 21 12 16 7"/>
                    <line x1="21" y1="12" x2="9" y2="12"/>
                  </svg>
                  <span>{signingOut ? 'Signing out…' : 'Sign out'}</span>
                </button>
              </div>
            {/if}
          </div>
        </div>
      </header>

      <!-- Page content -->
      <main class="main" class:rail-open={auditRail.open}>
        {@render children?.()}
      </main>
    </div>

    <AuditRail />
  </div>

  <MobileBottomNav />
  <CommandPalette />
  <QuickActionModal />

  <!-- NEX FAB - hidden on /nexogram (already there) and /login -->
  {#if !$page.url.pathname.startsWith('/nexogram') && !$page.url.pathname.startsWith('/login')}
    {#snippet fabContent()}
      <div class="nex-fab-wrap">
        <div class="nex-fab-menu" aria-label="NEX quick actions">
          <a href="/nexogram" class="nex-fab-opt nex-fab-opt--brain">
            <span class="nex-fab-opt-icon">◇</span>
            <span class="nex-fab-opt-label">Open NEXOGRAM</span>
          </a>
          <a href="/tracker" class="nex-fab-opt nex-fab-opt--track">
            <span class="nex-fab-opt-icon">⧗</span>
            <span class="nex-fab-opt-label">Start Tracking</span>
          </a>
        </div>
        <button class="nex-fab" aria-label="NEX actions" title="NEX - Quick actions">
          <div class="nex-fab-ring r1"></div>
          <div class="nex-fab-ring r2"></div>
          <span class="nex-fab-glyph">&#8853;</span>
        </button>
      </div>
    {/snippet}
    {@render fabContent()}
  {/if}
{/if}

<GlassToast />

<style>
  /* App shell — two-column grid: sidebar + content */
  .app-shell {
    position: relative;
    z-index: 1;
    display: flex;
    min-height: 100vh;
    background: var(--canvas);
    color: var(--ink);
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif;
    font-feature-settings: "ss01","cv11","tnum";
    -webkit-font-smoothing: antialiased;
    letter-spacing: -0.005em;
    transition: padding-right var(--dur-2) var(--ease);
  }
  .app-shell.rail-open { padding-right: 280px; }

  /* Content column */
  .shell-content {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    min-height: 100vh;
  }

  /* Top bar */
  .topbar {
    position: sticky;
    top: 0;
    z-index: 30;
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 24px;
    border-bottom: 1px solid var(--brand-line);
    background: var(--glass-chrome);
    -webkit-backdrop-filter: var(--blur-chrome);
    backdrop-filter: var(--blur-chrome);
    flex-shrink: 0;
    gap: 16px;
  }
  .topbar-left  { display: flex; align-items: center; gap: 12px; }
  .topbar-center { flex: 1; display: flex; justify-content: center; }
  .topbar-right { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }

  /* Mobile brand mark (shown only on mobile) */
  .mobile-brand {
    display: none;
    text-decoration: none;
  }
  .mobile-brand-mark {
    width: 32px; height: 32px;
    border-radius: 9px;
    background: rgba(86,188,236,0.12);
    border: 1px solid rgba(86,188,236,0.30);
    display: grid; place-items: center;
    box-shadow: 0 4px 12px rgba(86,188,236,0.20);
  }
  @media (max-width: 760px) { .mobile-brand { display: block; } }

  /* Search bar */
  .search {
    all: unset;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 12px;
    height: 38px;
    padding: 0 14px;
    border-radius: 11px;
    background: var(--canvas-2);
    border: 1px solid var(--line);
    color: var(--ink-3);
    font-size: 13.5px;
    font-family: 'Inter', sans-serif;
    min-width: 280px;
    max-width: 480px;
    width: 100%;
    transition: all var(--dur) var(--ease);
  }
  .search:hover { border-color: var(--brand-line-2); color: var(--ink-2); }
  .search-placeholder { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .kbd {
    display: inline-flex; align-items: center;
    padding: 2px 6px; border-radius: 6px;
    background: var(--line); color: var(--ink-2);
    font: 600 10.5px/1 'JetBrains Mono', monospace;
    border: 1px solid var(--line-2);
    flex-shrink: 0;
  }

  /* Icon buttons */
  .icon-btn {
    all: unset;
    cursor: pointer;
    width: 38px; height: 38px;
    border-radius: 10px;
    display: grid; place-items: center;
    color: var(--ink-2);
    border: 1px solid transparent;
    transition: all var(--dur) var(--ease);
  }
  .icon-btn:hover { background: var(--canvas-2); border-color: var(--line); color: var(--ink); }
  .icon-btn:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--brand-glow); border-color: var(--brand); }

  /* Profile chip */
  .profile-wrap {
    position: relative;
  }
  .profile-chip {
    all: unset;
    box-sizing: border-box;
    display: flex; align-items: center; gap: 10px;
    padding: 4px 10px 4px 4px;
    border-radius: 10px;
    background: var(--canvas-2);
    border: 1px solid var(--line);
    cursor: pointer;
    transition: all var(--dur) var(--ease);
    text-decoration: none;
  }
  .profile-chip:hover { border-color: var(--brand-line-2); }
  .profile-chip:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--brand-glow); border-color: var(--brand); }
  .profile-chevron {
    color: var(--ink-3);
    margin-right: 2px;
    transition: transform var(--dur) var(--ease);
  }
  .profile-chip[aria-expanded="true"] .profile-chevron { transform: rotate(180deg); }

  /* Dropdown scrim */
  .profile-scrim {
    all: unset;
    position: fixed;
    inset: 0;
    z-index: 40;
    cursor: default;
  }

  /* Dropdown menu */
  .profile-menu {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    z-index: 50;
    min-width: 200px;
    padding: 6px;
    border-radius: 12px;
    background: var(--glass-chrome, rgba(20, 26, 38, 0.95));
    border: 1px solid var(--line);
    backdrop-filter: blur(20px) saturate(1.4);
    -webkit-backdrop-filter: blur(20px) saturate(1.4);
    box-shadow: 0 12px 48px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.04);
    display: flex;
    flex-direction: column;
    gap: 1px;
    animation: profile-menu-in 160ms cubic-bezier(0.22, 0.61, 0.36, 1);
  }
  @keyframes profile-menu-in {
    from { opacity: 0; transform: translateY(-4px) scale(0.98); }
    to   { opacity: 1; transform: none; }
  }
  .profile-menu-item {
    all: unset;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 12px;
    border-radius: 8px;
    color: var(--ink);
    font: 500 13px/1 'Inter', sans-serif;
    cursor: pointer;
    transition: background 120ms ease, color 120ms ease;
    text-decoration: none;
  }
  .profile-menu-item:hover {
    background: var(--canvas-2);
    color: var(--ink);
  }
  .profile-menu-item:focus-visible {
    outline: none;
    background: var(--canvas-2);
    box-shadow: 0 0 0 2px var(--brand-glow) inset;
  }
  .profile-menu-item svg {
    color: var(--ink-2);
    flex-shrink: 0;
  }
  .profile-menu-item:hover svg { color: var(--brand, #56bcec); }
  .profile-menu-item--danger { color: #f87171; }
  .profile-menu-item--danger svg { color: #f87171; }
  .profile-menu-item--danger:hover {
    background: rgba(248, 113, 113, 0.08);
    color: #fca5a5;
  }
  .profile-menu-item--danger:hover svg { color: #fca5a5; }
  .profile-menu-item[disabled] { opacity: 0.6; cursor: wait; }
  .profile-menu-divider {
    height: 1px;
    background: var(--line);
    margin: 4px 2px;
  }
  .avatar {
    width: 30px; height: 30px;
    border-radius: 8px;
    background: linear-gradient(135deg, #1F7AAB, #56BCEC);
    display: grid; place-items: center;
    color: white;
    font: 700 11.5px/1 Inter, sans-serif;
    letter-spacing: -0.01em;
  }
  .profile-name {
    font-size: 12.5px; font-weight: 600; color: var(--ink);
    font-family: 'Inter', sans-serif;
  }

  /* Main content */
  .main {
    flex: 1;
    padding: 32px 40px 80px;
    max-width: 1320px;
    margin: 0 auto;
    width: 100%;
    min-height: 0;
    transition: padding-right var(--dur-2) var(--ease);
  }
  .main.rail-open { padding-right: 300px; }

  /* Responsive */
  @media (max-width: 860px) {
    .app-shell.rail-open { padding-right: 0; }
    .main.rail-open { padding-right: 40px; }
  }
  @media (max-width: 760px) {
    .topbar { padding: 0 16px; height: 56px; }
    .search { min-width: 0; max-width: none; }
    .main { padding: 20px 16px calc(80px + var(--safe-bottom)); }
    .profile-name { display: none; }
    .profile-chip { padding: 4px; }
  }
  @media (max-width: 480px) {
    .main { padding: 16px 12px calc(80px + var(--safe-bottom)); }
    .kbd { display: none; }
  }

  /* ── NEXITA FAB ── */
  .nex-fab-wrap {
    position: fixed;
    bottom: calc(28px + env(safe-area-inset-bottom, 0px));
    right: 28px;
    z-index: 150;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 10px;
    transition: opacity 0.25s ease, transform 0.25s ease;
  }

  /* Hide FAB when a planner drawer is open (body.planner-open set by focus page) */
  :global(body.planner-open) .nex-fab-wrap {
    opacity: 0;
    pointer-events: none;
    transform: scale(0.85);
  }

  .nex-fab-menu {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: flex-end;
    opacity: 0;
    pointer-events: none;
    transform: translateY(8px) scale(0.96);
    transition: opacity 200ms ease, transform 200ms cubic-bezier(0.22, 0.61, 0.36, 1);
  }
  .nex-fab-wrap:has(.nex-fab:hover) .nex-fab-menu,
  .nex-fab-wrap:has(.nex-fab:focus-visible) .nex-fab-menu,
  .nex-fab-wrap:hover .nex-fab-menu {
    opacity: 1;
    pointer-events: auto;
    transform: none;
  }

  .nex-fab-opt {
    display: flex; align-items: center; gap: 9px;
    padding: 9px 14px 9px 12px;
    border-radius: 14px;
    text-decoration: none;
    font: 600 12.5px/1 'JetBrains Mono', monospace;
    letter-spacing: 0.04em;
    white-space: nowrap;
    border: 1px solid;
    backdrop-filter: blur(20px) saturate(1.6);
    -webkit-backdrop-filter: blur(20px) saturate(1.6);
    box-shadow: 0 8px 32px rgba(0,0,0,0.25);
    transition: all 160ms ease;
  }
  .nex-fab-opt--brain {
    background: rgba(86,188,236,0.1);
    border-color: rgba(86,188,236,0.35);
    color: #56bcec;
    box-shadow: 0 8px 32px rgba(0,0,0,0.25), 0 0 20px rgba(86,188,236,0.12);
  }
  .nex-fab-opt--brain:hover {
    background: rgba(86,188,236,0.2);
    border-color: rgba(86,188,236,0.6);
    box-shadow: 0 8px 32px rgba(0,0,0,0.3), 0 0 28px rgba(86,188,236,0.25);
  }
  .nex-fab-opt--track {
    background: rgba(167,139,250,0.1);
    border-color: rgba(167,139,250,0.35);
    color: #a78bfa;
    box-shadow: 0 8px 32px rgba(0,0,0,0.25), 0 0 20px rgba(167,139,250,0.12);
  }
  .nex-fab-opt--track:hover {
    background: rgba(167,139,250,0.2);
    border-color: rgba(167,139,250,0.6);
    box-shadow: 0 8px 32px rgba(0,0,0,0.3), 0 0 28px rgba(167,139,250,0.25);
  }
  .nex-fab-opt-icon {
    font-size: 15px; line-height: 1; flex-shrink: 0;
    filter: drop-shadow(0 0 5px currentColor);
  }
  .nex-fab-opt-label { font-size: 12px; }

  .nex-fab {
    all: unset;
    box-sizing: border-box;
    position: relative;
    width: 60px; height: 60px;
    border-radius: 50%;
    background: rgba(86,188,236,0.08);
    border: 1px solid rgba(86,188,236,0.4);
    display: grid; place-items: center;
    cursor: pointer;
    box-shadow:
      0 0 0 0 rgba(86,188,236,0.3),
      0 8px 32px rgba(0,0,0,0.3),
      inset 0 1px 0 rgba(255,255,255,0.1);
    transition: all 200ms ease;
    backdrop-filter: blur(20px) saturate(1.8);
    -webkit-backdrop-filter: blur(20px) saturate(1.8);
  }
  .nex-fab:hover {
    background: rgba(86,188,236,0.16);
    border-color: rgba(86,188,236,0.7);
    box-shadow:
      0 0 0 6px rgba(86,188,236,0.08),
      0 0 40px rgba(86,188,236,0.3),
      0 8px 32px rgba(0,0,0,0.4),
      inset 0 1px 0 rgba(255,255,255,0.15);
    transform: scale(1.06);
  }

  .nex-fab-ring {
    position: absolute; border-radius: 50%;
    border: 1px solid rgba(86,188,236,0.4);
    animation: fab-spin linear infinite;
  }
  .nex-fab-ring.r1 { width: 60px; height: 60px; animation-duration: 8s; }
  .nex-fab-ring.r2 { width: 46px; height: 46px; animation-duration: 5s; animation-direction: reverse; border-color: rgba(167,139,250,0.3); }
  @keyframes fab-spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }

  .nex-fab-glyph {
    position: relative; z-index: 1;
    font-size: 24px; color: #56bcec; line-height: 1;
    filter: drop-shadow(0 0 10px rgba(86,188,236,0.9));
    animation: fab-glyph-pulse 2.5s ease-in-out infinite;
    transition: filter 200ms ease;
  }
  .nex-fab:hover .nex-fab-glyph {
    filter: drop-shadow(0 0 16px rgba(86,188,236,1)) drop-shadow(0 0 32px rgba(86,188,236,0.6));
  }
  @keyframes fab-glyph-pulse {
    0%,100% { filter: drop-shadow(0 0 8px rgba(86,188,236,0.8)); }
    50%     { filter: drop-shadow(0 0 18px rgba(86,188,236,1)) drop-shadow(0 0 30px rgba(86,188,236,0.4)); }
  }

  @media (max-width: 760px) {
    .nex-fab-wrap {
      bottom: calc(92px + env(safe-area-inset-bottom, 0px));
      right: 16px;
    }
    .nex-fab { width: 56px; height: 56px; }
    .nex-fab-ring.r1 { width: 56px; height: 56px; }
    .nex-fab-ring.r2 { width: 42px; height: 42px; }
    .nex-fab-glyph { font-size: 24px; }
  }
</style>

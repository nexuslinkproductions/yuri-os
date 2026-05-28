<script lang="ts">
  /**
   * /welcome — First-touch onboarding for NEX APP.
   *
   * Two faces of the same surface:
   *   1. ACTIVE user, first-touch celebration — animated greeting + role reveal
   *      + 3 capability cards + CTA to their primary module (NEXOGRAM for
   *      marketing managers, "/" for everyone else). Auto-skipped after the
   *      first visit via sessionStorage('nex-welcomed').
   *   2. PENDING user — clean glass card explaining that the CEO has been
   *      notified. No noisy form (role/team/use_case is set on invite, not
   *      self-declared anymore).
   *
   * Auth/profile flow:
   *   - getSession() → domain check (@c2moviez.com only)
   *   - read user_profiles.{is_active, role, display_name}
   *   - is_active=true ─ show celebratory welcome (or skip to / if already shown)
   *   - is_active=false + profile exists ─ show pending screen
   *   - no profile ─ POST /api/functions/request-access {display_name only}
   *                 then show pending screen (CEO gets Telegram alert)
   */
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { fade, fly } from "svelte/transition";
  import { quintOut } from "svelte/easing";
  import { supabase, hasClient } from "$lib/db";

  type Mode = "loading" | "celebrate" | "pending" | "error";
  type Role =
    | "ceo"
    | "cto"
    | "marketing_manager"
    | "partner"
    | "operator"
    | null;

  let mode = $state<Mode>("loading");
  let displayName = $state("");
  let firstName = $state("");
  let email = $state("");
  let role = $state<Role>(null);
  let errorMsg = $state<string | null>(null);

  // Sequential reveal flags (CSS-only sequencing via class binding)
  let revealGreeting = $state(false);
  let revealIdentity = $state(false);
  let revealCards = $state(false);
  let revealCta = $state(false);

  const ROLE_LABELS: Record<NonNullable<Role>, string> = {
    ceo: "CEO / Founder",
    cto: "CTO / Engineering Lead",
    marketing_manager: "Marketing Manager",
    partner: "Partner",
    operator: "Operator",
  };

  // Where to send the user on CTA click, based on role.
  const PRIMARY_MODULE: Record<NonNullable<Role>, string> = {
    ceo: "/",
    cto: "/",
    marketing_manager: "/nexogram",
    partner: "/",
    operator: "/tracker",
  };

  // Three "what you can do" cards rendered after identity reveal. Per-role.
  // Each: title, blurb, glyph (inline SVG path), accent class.
  type CapCard = { title: string; blurb: string; href: string; glyph: string };
  const CAPS_MARKETING: CapCard[] = [
    {
      title: "NEXOGRAM",
      blurb: "Dein Team-Chat mit KI-Unterstuetzung. Direkt mit @NEX schreiben - Antworten in Echtzeit.",
      href: "/nexogram",
      glyph:
        "M4 4h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-5 4V6a2 2 0 0 1 2-2z",
    },
    {
      title: "Marketing Hub",
      blurb: "Tickets, Kampagnen, Social Media - alles an einem Ort. Plane.so synchronisiert.",
      href: "/crm",
      glyph:
        "M3 12l4-4 4 4 4-4 4 4M3 19l4-4 4 4 4-4 4 4",
    },
    {
      title: "NEX Assistant",
      blurb: "Frag NEX alles - Kunden, Zahlen, Termine. Antwortet aus dem Vault in Sekunden.",
      href: "/intel",
      glyph:
        "M12 2a4 4 0 0 1 4 4v2a4 4 0 0 1-4 4 4 4 0 0 1-4-4V6a4 4 0 0 1 4-4zM6 14a6 6 0 0 0 12 0",
    },
  ];
  const CAPS_DEFAULT: CapCard[] = [
    {
      title: "Command",
      blurb: "Operational pulse - clients, tickets, calendar, revenue in real time.",
      href: "/",
      glyph: "M3 12l4-4 4 4 4-4 4 4M3 19l4-4 4 4 4-4 4 4",
    },
    {
      title: "NEX Assistant",
      blurb: "Semantic search across the entire vault + audit log. Ask anything.",
      href: "/intel",
      glyph:
        "M12 2a4 4 0 0 1 4 4v2a4 4 0 0 1-4 4 4 4 0 0 1-4-4V6a4 4 0 0 1 4-4zM6 14a6 6 0 0 0 12 0",
    },
    {
      title: "Tracker",
      blurb: "Time entries, week plans, billable hours - the Tyme3-class surface.",
      href: "/tracker",
      glyph: "M12 6v6l4 2M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z",
    },
  ];

  let caps = $derived(
    role === "marketing_manager" ? CAPS_MARKETING : CAPS_DEFAULT,
  );
  let primaryHref = $derived(role ? PRIMARY_MODULE[role] : "/");
  let primaryLabel = $derived(
    role === "marketing_manager" ? "NEX oeffnen" : "Enter NEX",
  );
  let greetingText = $derived(
    firstName
      ? `Willkommen, ${firstName}.`
      : displayName
      ? `Willkommen, ${displayName}.`
      : "Welcome to NEX.",
  );
  let subline = $derived(
    role === "marketing_manager"
      ? "Das Betriebssystem von c2moviez - jetzt auch deins."
      : "The c2moviez operations brain. You are signed in.",
  );

  onMount(async () => {
    if (!hasClient()) {
      errorMsg = "Configuration error - Supabase client unavailable.";
      mode = "error";
      return;
    }

    const { data } = await supabase().auth.getSession();
    const sess = data.session;
    if (!sess?.user) {
      goto("/login", { replaceState: true });
      return;
    }
    email = (sess.user.email || "").toLowerCase();
    if (!email.endsWith("@c2moviez.com")) {
      try { await supabase().auth.signOut(); } catch { /* ignore */ }
      goto("/login?error=domain_not_allowed", { replaceState: true });
      return;
    }

    const meta = (sess.user.user_metadata || {}) as Record<string, unknown>;
    displayName = String(meta.full_name || meta.name || email.split("@")[0]);
    firstName = displayName.split(/\s+/)[0] || "";

    // Read profile
    try {
      const { data: prof } = await supabase()
        .from("user_profiles")
        .select("is_active, role, display_name")
        .eq("id", sess.user.id)
        .maybeSingle();

      if (prof?.display_name) {
        displayName = prof.display_name;
        firstName = displayName.split(/\s+/)[0] || firstName;
      }
      if (prof?.role) role = prof.role as Role;

      if (prof?.is_active === true) {
        // Active - either celebrate (first touch) or send straight home.
        sessionStorage.setItem("exeo-authed", "1");
        const seen = typeof localStorage !== "undefined"
          ? localStorage.getItem("nex-welcomed")
          : null;
        if (seen) {
          goto(primaryHref, { replaceState: true });
          return;
        }
        mode = "celebrate";
        startReveal();
        return;
      }

      if (prof && (prof.role || prof.display_name)) {
        // Has profile row but not yet active
        mode = "pending";
        return;
      }
    } catch { /* fall through to auto-request */ }

    // No profile row yet - auto-request access (CEO gets Telegram alert).
    try {
      const r = await fetch("/api/functions/request-access", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${sess.access_token}`,
        },
        body: JSON.stringify({
          display_name: displayName,
          role: "Other",
          team: "Other",
          use_case: "Auto-requested via /welcome on first sign-in.",
        }),
      });
      if (!r.ok) {
        const t = await r.text().catch(() => "");
        errorMsg = t || `Access request failed (HTTP ${r.status}).`;
        mode = "error";
        return;
      }
      mode = "pending";
    } catch (e) {
      errorMsg = (e as Error)?.message || "Network error.";
      mode = "error";
    }
  });

  function startReveal() {
    // Sequential CSS reveal: greeting (300ms) → identity (1000ms) →
    // capability cards (1700ms) → cta (2400ms). All transitions stay under
    // 700ms each so the page never feels slow.
    setTimeout(() => (revealGreeting = true), 250);
    setTimeout(() => (revealIdentity = true), 1100);
    setTimeout(() => (revealCards = true), 1850);
    setTimeout(() => (revealCta = true), 2550);
  }

  function enterApp() {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("nex-welcomed", new Date().toISOString());
    }
    goto(primaryHref);
  }

  async function signOut() {
    try { await supabase().auth.signOut(); } catch { /* ignore */ }
    sessionStorage.removeItem("exeo-authed");
    goto("/login", { replaceState: true });
  }

  function initial(s: string): string {
    const parts = s.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0][0]?.toUpperCase() || "?";
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
</script>

<svelte:head>
  <title>Welcome - NEX APP</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="shell">
  <!-- Ambient background: grid + drifting orbs + cyan particles -->
  <div class="bg-grid" aria-hidden="true"></div>
  <div class="bg-orb bg-orb--cyan" aria-hidden="true"></div>
  <div class="bg-orb bg-orb--violet" aria-hidden="true"></div>
  <div class="bg-particles" aria-hidden="true">
    {#each Array(36) as _, i}
      <span
        class="particle"
        style="--x:{(i * 137.5) % 100}%; --d:{(i % 7) * 1.1}s; --s:{8 + (i % 5) * 2}s; --o:{0.4 + (i % 4) * 0.15}"
      ></span>
    {/each}
  </div>

  <!-- Header (logo top-left) -->
  <header class="topbar">
    <div class="brand">
      <svg viewBox="0 0 256 201" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" width="34" height="27">
        <path d="M197 75l-51-9c8-14 23-23 39-24l12 33z" fill="#56bcec"/>
        <path d="M205 90l-17-49c16 0 32 8 41 22l-24 27z" fill="#56bcec"/>
        <path d="M230 113l-1 3c-7 10-19 18-31 21l-5 1-12-33 49 8z" fill="#56bcec"/>
        <path d="M196 105l34-39c8 13 9 31 2 45l-36-6z" fill="#56bcec"/>
        <path d="M180 74l-34 39c-8-14-8-31-1-45 12 2 23 4 35 6z" fill="#56bcec"/>
        <path d="M189 138c-14 1-27-6-37-16l-4-6 23-26 18 48z" fill="#56bcec"/>
      </svg>
      <span class="brand-text">c2moviez</span>
    </div>
    {#if mode === "celebrate" || mode === "pending"}
      <button class="link" onclick={signOut} type="button">Sign out</button>
    {/if}
  </header>

  <main class="stage">
    {#if mode === "loading"}
      <div class="loading" in:fade={{ duration: 240 }}>
        <div class="spinner" aria-hidden="true"></div>
        <p>Verbinde mit NEX...</p>
      </div>

    {:else if mode === "error"}
      <div class="card error-card" in:fly={{ y: 12, duration: 360, easing: quintOut }}>
        <h1>Hmm.</h1>
        <p>{errorMsg ?? "Etwas ist schiefgegangen."}</p>
        <button class="ghost" onclick={signOut} type="button">Zurueck zur Anmeldung</button>
      </div>

    {:else if mode === "pending"}
      <div class="card pending-card" in:fly={{ y: 16, duration: 420, easing: quintOut }}>
        <div class="orbit" aria-hidden="true">
          <span class="orbit-ring"></span>
          <span class="orbit-dot"></span>
        </div>
        <h1 class="headline">Wir haben <span class="accent">auf dich gewartet</span>.</h1>
        <p class="subline">
          Claudio prueft deinen Zugang. Du bekommst eine E-Mail, sobald NEX dich kennt.
        </p>
        <div class="pending-grid">
          <div class="pending-row">
            <span class="lbl">Account</span>
            <span class="val">{email}</span>
          </div>
          <div class="pending-row">
            <span class="lbl">Status</span>
            <span class="val pending-status">
              <span class="pulse"></span>
              Pending Approval
            </span>
          </div>
        </div>
        <button class="ghost full" onclick={signOut} type="button">Abmelden</button>
      </div>

    {:else if mode === "celebrate"}
      <div class="celebrate">
        <!-- Stage 1: greeting -->
        <div class="greeting" class:is-in={revealGreeting}>
          <p class="kicker">
            <span class="kicker-dot"></span>
            <span>NEX APP - c2moviez Operations</span>
          </p>
          <h1 class="hero-headline">{greetingText}</h1>
          <p class="hero-subline">{subline}</p>
        </div>

        <!-- Stage 2: identity card -->
        <div class="identity" class:is-in={revealIdentity}>
          <div class="avatar" aria-hidden="true">
            <span>{initial(displayName)}</span>
          </div>
          <div class="identity-text">
            <div class="identity-line">
              <span class="muted">Du bist</span>
              <strong>{displayName}</strong>
            </div>
            {#if role}
              <div class="role-badge">
                <span class="role-dot"></span>
                {ROLE_LABELS[role]}
              </div>
            {/if}
            <div class="identity-email">{email}</div>
          </div>
          <div class="identity-status">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" aria-hidden="true">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            <span>Authentifiziert</span>
          </div>
        </div>

        <!-- Stage 3: capability cards -->
        <div class="caps" class:is-in={revealCards}>
          <div class="caps-label">
            <span class="caps-line"></span>
            <span>Was du hier machen kannst</span>
            <span class="caps-line"></span>
          </div>
          <div class="caps-grid">
            {#each caps as cap, idx}
              <a
                href={cap.href}
                class="cap-card"
                style="--cap-delay: {idx * 140}ms"
                onclick={() => {
                  if (typeof localStorage !== "undefined") {
                    localStorage.setItem("nex-welcomed", new Date().toISOString());
                  }
                }}
              >
                <div class="cap-glyph" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                    <path d={cap.glyph}/>
                  </svg>
                </div>
                <h3 class="cap-title">{cap.title}</h3>
                <p class="cap-blurb">{cap.blurb}</p>
                <span class="cap-arrow" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
                    <line x1="5" y1="12" x2="19" y2="12"/>
                    <polyline points="12 5 19 12 12 19"/>
                  </svg>
                </span>
              </a>
            {/each}
          </div>
        </div>

        <!-- Stage 4: CTA -->
        <div class="cta-wrap" class:is-in={revealCta}>
          <button class="cta-primary" onclick={enterApp} type="button">
            <span>{primaryLabel}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" width="18" height="18" aria-hidden="true">
              <line x1="5" y1="12" x2="19" y2="12"/>
              <polyline points="12 5 19 12 12 19"/>
            </svg>
          </button>
          <p class="cta-hint">Druecke <kbd>Enter</kbd> oder klick - NEX ist bereit.</p>
        </div>
      </div>
    {/if}
  </main>
</div>

<svelte:window onkeydown={(e) => {
  if (mode === "celebrate" && revealCta && e.key === "Enter") enterApp();
}} />

<style>
  :global(html), :global(body) {
    background: #06080f;
  }

  /* ── Shell ─────────────────────────────────────────────────────── */
  .shell {
    position: relative;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    padding: 24px 24px 48px;
    background:
      radial-gradient(ellipse 80% 60% at 50% 0%, rgba(86, 188, 236, 0.10) 0%, transparent 60%),
      radial-gradient(ellipse 60% 50% at 80% 100%, rgba(139, 92, 246, 0.08) 0%, transparent 65%),
      linear-gradient(180deg, #0a0d1a 0%, #06080f 100%);
    overflow: hidden;
    isolation: isolate;
    color: #fff;
  }

  /* ── Ambient background ───────────────────────────────────────── */
  .bg-grid {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(86, 188, 236, 0.045) 1px, transparent 1px),
      linear-gradient(90deg, rgba(86, 188, 236, 0.045) 1px, transparent 1px);
    background-size: 56px 56px;
    mask-image: radial-gradient(ellipse 70% 60% at center, black 30%, transparent 85%);
    -webkit-mask-image: radial-gradient(ellipse 70% 60% at center, black 30%, transparent 85%);
    animation: grid-drift 90s linear infinite;
    z-index: -3;
  }
  @keyframes grid-drift {
    from { transform: translate(0, 0); }
    to   { transform: translate(56px, 56px); }
  }

  .bg-orb {
    position: absolute;
    border-radius: 50%;
    filter: blur(120px);
    opacity: 0.40;
    z-index: -2;
    animation: orb-float 22s ease-in-out infinite;
    pointer-events: none;
  }
  .bg-orb--cyan {
    width: 560px; height: 560px;
    top: -160px; left: -140px;
    background: radial-gradient(circle, #56bcec 0%, transparent 70%);
  }
  .bg-orb--violet {
    width: 620px; height: 620px;
    bottom: -200px; right: -180px;
    background: radial-gradient(circle, #8b5cf6 0%, transparent 70%);
    animation-delay: -8s;
  }
  @keyframes orb-float {
    0%, 100% { transform: translate(0, 0) scale(1); }
    50%      { transform: translate(40px, -32px) scale(1.10); }
  }

  .bg-particles {
    position: absolute;
    inset: 0;
    z-index: -1;
    pointer-events: none;
  }
  .particle {
    position: absolute;
    bottom: -12px;
    left: var(--x);
    width: 2px; height: 2px;
    border-radius: 50%;
    background: #56bcec;
    box-shadow:
      0 0 6px rgba(86, 188, 236, 0.9),
      0 0 14px rgba(86, 188, 236, 0.5);
    opacity: 0;
    animation: particle-rise var(--s, 12s) linear infinite;
    animation-delay: var(--d, 0s);
  }
  @keyframes particle-rise {
    0%   { transform: translateY(0) translateX(0); opacity: 0; }
    8%   { opacity: var(--o, 0.6); }
    50%  { transform: translateY(-50vh) translateX(8px); opacity: var(--o, 0.6); }
    100% { transform: translateY(-105vh) translateX(-6px); opacity: 0; }
  }

  /* ── Topbar ───────────────────────────────────────────────────── */
  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 24px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 11px;
  }
  .brand svg {
    filter: drop-shadow(0 0 10px rgba(86, 188, 236, 0.5));
  }
  .brand-text {
    font: 700 16px/1 'Montserrat', 'Inter', system-ui, sans-serif;
    letter-spacing: 0.06em;
    text-transform: lowercase;
    color: #fff;
  }
  .link {
    all: unset;
    cursor: pointer;
    font: 500 12.5px/1 'Inter', system-ui, sans-serif;
    color: rgba(255, 255, 255, 0.45);
    letter-spacing: 0.02em;
    padding: 6px 4px;
    transition: color 160ms ease;
  }
  .link:hover { color: rgba(255, 255, 255, 0.85); }

  /* ── Stage ────────────────────────────────────────────────────── */
  .stage {
    flex: 1;
    display: grid;
    place-items: center;
    width: 100%;
  }

  /* ── Loading + Error + Pending cards ──────────────────────────── */
  .loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    color: rgba(255, 255, 255, 0.55);
    font: 400 14px/1 'Inter', system-ui, sans-serif;
  }
  .spinner {
    width: 32px; height: 32px;
    border: 2.5px solid rgba(86, 188, 236, 0.18);
    border-top-color: #56bcec;
    border-radius: 50%;
    animation: spin 0.85s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .card {
    width: min(520px, 100%);
    padding: 44px 44px;
    border-radius: 24px;
    background: rgba(255, 255, 255, 0.035);
    border: 1px solid rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(28px) saturate(1.4);
    -webkit-backdrop-filter: blur(28px) saturate(1.4);
    box-shadow:
      0 24px 64px rgba(0, 0, 0, 0.5),
      inset 0 1px 0 rgba(255, 255, 255, 0.06);
    display: flex;
    flex-direction: column;
    gap: 20px;
    text-align: center;
    align-items: center;
  }
  .error-card h1 {
    font: 700 26px/1.2 'Montserrat', 'Inter', system-ui, sans-serif;
    margin: 0;
  }
  .error-card p {
    color: rgba(255, 255, 255, 0.6);
    font: 400 14px/1.5 'Inter', system-ui, sans-serif;
    margin: 0;
  }

  /* ── Pending card ─────────────────────────────────────────────── */
  .pending-card .headline {
    font: 700 30px/1.18 'Montserrat', 'Inter', system-ui, sans-serif;
    letter-spacing: -0.015em;
    margin: 0;
  }
  .pending-card .subline {
    color: rgba(255, 255, 255, 0.6);
    font: 400 15px/1.55 'Inter', system-ui, sans-serif;
    margin: 0;
    max-width: 360px;
  }
  .orbit {
    position: relative;
    width: 72px; height: 72px;
    margin-bottom: 4px;
  }
  .orbit-ring {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    border: 1.5px dashed rgba(86, 188, 236, 0.4);
    animation: spin 18s linear infinite;
  }
  .orbit-dot {
    position: absolute;
    top: -4px; left: 50%;
    width: 10px; height: 10px;
    margin-left: -5px;
    border-radius: 50%;
    background: #56bcec;
    box-shadow:
      0 0 12px rgba(86, 188, 236, 0.9),
      0 0 24px rgba(86, 188, 236, 0.5);
  }
  .pending-grid {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 16px 18px;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
  }
  .pending-row {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    font: 400 13px/1.4 'Inter', system-ui, sans-serif;
  }
  .lbl { color: rgba(255, 255, 255, 0.5); }
  .val {
    color: #fff;
    font-weight: 500;
    text-align: right;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pending-status {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: #fbbf24;
  }
  .pulse {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: #fbbf24;
    box-shadow: 0 0 10px #fbbf24;
    animation: pulse 2s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%      { opacity: 0.5; transform: scale(0.85); }
  }

  /* ── Celebrate (active first-touch) ──────────────────────────── */
  .celebrate {
    width: min(960px, 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 32px;
    padding: 24px 0 0;
  }

  /* Reveal: any direct child with .is-in fades + slides into place */
  .greeting,
  .identity,
  .caps,
  .cta-wrap {
    opacity: 0;
    transform: translateY(20px);
    transition:
      opacity 700ms cubic-bezier(0.22, 0.61, 0.36, 1),
      transform 700ms cubic-bezier(0.22, 0.61, 0.36, 1);
    will-change: opacity, transform;
  }
  .is-in {
    opacity: 1;
    transform: translateY(0);
  }

  /* Greeting */
  .greeting {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    max-width: 720px;
  }
  .kicker {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 6px 14px;
    border-radius: 999px;
    background: rgba(86, 188, 236, 0.08);
    border: 1px solid rgba(86, 188, 236, 0.22);
    font: 600 11.5px/1 'Inter', system-ui, sans-serif;
    color: rgba(255, 255, 255, 0.75);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin: 0;
  }
  .kicker-dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: #56bcec;
    box-shadow: 0 0 8px #56bcec;
    animation: pulse 2.4s ease-in-out infinite;
  }
  .hero-headline {
    font: 700 clamp(36px, 6vw, 60px)/1.05 'Montserrat', 'Inter', system-ui, sans-serif;
    letter-spacing: -0.025em;
    color: #fff;
    margin: 0;
    background: linear-gradient(180deg, #ffffff 0%, rgba(255, 255, 255, 0.78) 100%);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .hero-subline {
    font: 400 clamp(15px, 1.6vw, 18px)/1.5 'Inter', system-ui, sans-serif;
    color: rgba(255, 255, 255, 0.55);
    margin: 0;
    max-width: 540px;
  }

  /* Identity glass strip */
  .identity {
    display: flex;
    align-items: center;
    gap: 18px;
    padding: 16px 22px 16px 16px;
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(86, 188, 236, 0.15);
    backdrop-filter: blur(20px) saturate(1.4);
    -webkit-backdrop-filter: blur(20px) saturate(1.4);
    box-shadow:
      0 16px 40px rgba(0, 0, 0, 0.4),
      0 0 0 1px rgba(86, 188, 236, 0.04),
      inset 0 1px 0 rgba(255, 255, 255, 0.06);
    max-width: 100%;
  }
  .avatar {
    width: 56px; height: 56px;
    flex-shrink: 0;
    border-radius: 16px;
    background: linear-gradient(135deg, #56bcec 0%, #1f7aab 100%);
    color: #06080f;
    display: grid; place-items: center;
    font: 700 20px/1 'Montserrat', 'Inter', system-ui, sans-serif;
    letter-spacing: 0.02em;
    box-shadow:
      0 6px 18px rgba(86, 188, 236, 0.35),
      inset 0 1px 0 rgba(255, 255, 255, 0.3);
  }
  .identity-text {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 5px;
    text-align: left;
    min-width: 0;
  }
  .identity-line {
    font: 500 14px/1.2 'Inter', system-ui, sans-serif;
    color: #fff;
    display: flex;
    gap: 6px;
    align-items: baseline;
    flex-wrap: wrap;
  }
  .identity-line .muted { color: rgba(255, 255, 255, 0.5); font-weight: 400; }
  .identity-line strong { color: #fff; font-weight: 700; }
  .role-badge {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 3px 10px;
    border-radius: 999px;
    background: rgba(86, 188, 236, 0.12);
    border: 1px solid rgba(86, 188, 236, 0.35);
    font: 600 11.5px/1 'Inter', system-ui, sans-serif;
    color: #56bcec;
    letter-spacing: 0.02em;
  }
  .role-dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: #56bcec;
    box-shadow: 0 0 8px #56bcec;
  }
  .identity-email {
    font: 400 12px/1.2 'Inter', system-ui, sans-serif;
    color: rgba(255, 255, 255, 0.4);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 220px;
  }
  .identity-status {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 6px 12px;
    border-radius: 999px;
    background: rgba(34, 197, 94, 0.10);
    border: 1px solid rgba(34, 197, 94, 0.30);
    color: #4ade80;
    font: 600 11.5px/1 'Inter', system-ui, sans-serif;
    flex-shrink: 0;
  }

  /* Capability cards */
  .caps {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .caps-label {
    display: flex;
    align-items: center;
    gap: 14px;
    font: 600 11.5px/1 'Inter', system-ui, sans-serif;
    color: rgba(255, 255, 255, 0.45);
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  .caps-line {
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.12), transparent);
  }
  .caps-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
  }
  .cap-card {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    text-align: left;
    gap: 12px;
    padding: 22px 22px 26px;
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.07);
    backdrop-filter: blur(20px) saturate(1.4);
    -webkit-backdrop-filter: blur(20px) saturate(1.4);
    color: inherit;
    text-decoration: none;
    overflow: hidden;
    transition:
      transform 280ms cubic-bezier(0.22, 0.61, 0.36, 1),
      border-color 280ms ease,
      background 280ms ease,
      box-shadow 280ms ease;
    animation: cap-in 600ms cubic-bezier(0.22, 0.61, 0.36, 1) var(--cap-delay, 0ms) both;
  }
  @keyframes cap-in {
    from { opacity: 0; transform: translateY(16px) scale(0.98); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  .cap-card::before {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: 18px;
    background: radial-gradient(circle at 30% 0%, rgba(86, 188, 236, 0.18) 0%, transparent 60%);
    opacity: 0;
    transition: opacity 280ms ease;
    pointer-events: none;
  }
  .cap-card:hover {
    transform: translateY(-3px);
    border-color: rgba(86, 188, 236, 0.35);
    background: rgba(86, 188, 236, 0.06);
    box-shadow:
      0 18px 40px rgba(0, 0, 0, 0.45),
      0 0 0 1px rgba(86, 188, 236, 0.20),
      0 0 32px rgba(86, 188, 236, 0.15);
  }
  .cap-card:hover::before { opacity: 1; }
  .cap-card:focus-visible {
    outline: none;
    border-color: #56bcec;
    box-shadow: 0 0 0 3px rgba(86, 188, 236, 0.30);
  }
  .cap-glyph {
    width: 40px; height: 40px;
    display: grid; place-items: center;
    border-radius: 12px;
    background: rgba(86, 188, 236, 0.12);
    border: 1px solid rgba(86, 188, 236, 0.25);
    color: #56bcec;
  }
  .cap-glyph svg { width: 22px; height: 22px; }
  .cap-title {
    font: 700 16.5px/1.2 'Montserrat', 'Inter', system-ui, sans-serif;
    letter-spacing: -0.005em;
    color: #fff;
    margin: 0;
  }
  .cap-blurb {
    font: 400 13.5px/1.55 'Inter', system-ui, sans-serif;
    color: rgba(255, 255, 255, 0.6);
    margin: 0;
  }
  .cap-arrow {
    position: absolute;
    bottom: 18px; right: 18px;
    width: 28px; height: 28px;
    border-radius: 50%;
    display: grid; place-items: center;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.5);
    transition: all 240ms ease;
  }
  .cap-card:hover .cap-arrow {
    background: #56bcec;
    border-color: #56bcec;
    color: #06080f;
    transform: translateX(2px);
  }

  /* CTA */
  .cta-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    margin-top: 8px;
  }
  .cta-primary {
    all: unset;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 12px;
    padding: 16px 36px;
    border-radius: 14px;
    background: linear-gradient(135deg, #56bcec 0%, #1f7aab 100%);
    color: #06080f;
    font: 700 15.5px/1 'Inter', system-ui, sans-serif;
    letter-spacing: 0.01em;
    box-shadow:
      0 12px 32px rgba(86, 188, 236, 0.40),
      0 0 0 1px rgba(86, 188, 236, 0.40),
      0 0 48px rgba(86, 188, 236, 0.18),
      inset 0 1px 0 rgba(255, 255, 255, 0.30);
    transition: transform 220ms ease, box-shadow 220ms ease, filter 220ms ease;
  }
  .cta-primary:hover {
    transform: translateY(-2px);
    box-shadow:
      0 18px 44px rgba(86, 188, 236, 0.55),
      0 0 0 1px rgba(86, 188, 236, 0.60),
      0 0 60px rgba(86, 188, 236, 0.30),
      inset 0 1px 0 rgba(255, 255, 255, 0.35);
    filter: brightness(1.05);
  }
  .cta-primary:active { transform: translateY(0); }
  .cta-primary:focus-visible {
    outline: none;
    box-shadow:
      0 0 0 3px rgba(86, 188, 236, 0.5),
      0 12px 32px rgba(86, 188, 236, 0.4);
  }
  .cta-hint {
    font: 400 12.5px/1.4 'Inter', system-ui, sans-serif;
    color: rgba(255, 255, 255, 0.4);
    margin: 0;
  }
  .cta-hint kbd {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    font: 600 11px/1.4 'JetBrains Mono', ui-monospace, monospace;
    color: rgba(255, 255, 255, 0.7);
  }

  .ghost {
    all: unset;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px 22px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.75);
    font: 600 13.5px/1 'Inter', system-ui, sans-serif;
    transition: all 160ms ease;
  }
  .ghost:hover {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 255, 255, 0.18);
    color: #fff;
  }
  .ghost.full { width: 100%; box-sizing: border-box; }

  /* ── Inline accent for pending headline ──────────────────────── */
  .accent {
    background: linear-gradient(135deg, #56bcec 0%, #8b5cf6 100%);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  /* ── Responsive ──────────────────────────────────────────────── */
  @media (max-width: 880px) {
    .caps-grid {
      grid-template-columns: 1fr;
      gap: 12px;
    }
    .identity {
      flex-wrap: wrap;
    }
    .identity-status { margin-left: 0; }
  }
  @media (max-width: 600px) {
    .shell { padding: 18px 16px 32px; }
    .celebrate { gap: 24px; }
    .identity { padding: 14px; gap: 12px; }
    .avatar { width: 48px; height: 48px; font-size: 18px; }
    .cap-card { padding: 18px 18px 22px; }
    .card { padding: 32px 24px; }
    .pending-card .headline { font-size: 24px; }
    .cta-primary { padding: 14px 28px; font-size: 14.5px; width: 100%; box-sizing: border-box; justify-content: center; }
  }

  /* ── Accessibility ───────────────────────────────────────────── */
  @media (prefers-reduced-motion: reduce) {
    .bg-grid, .bg-orb, .particle,
    .orbit-ring, .pulse, .kicker-dot, .role-dot,
    .greeting, .identity, .caps, .cta-wrap,
    .cap-card, .spinner {
      animation: none !important;
      transition: none !important;
    }
    .greeting, .identity, .caps, .cta-wrap {
      opacity: 1 !important;
      transform: none !important;
    }
    .bg-particles { display: none; }
  }
  @media (prefers-reduced-transparency: reduce) {
    .card, .identity, .cap-card {
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
      background: rgba(20, 24, 38, 0.92);
    }
  }
</style>

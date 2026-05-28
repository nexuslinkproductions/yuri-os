<script lang="ts">
  /**
   * /pitch - public read-only NEX/NEXBOX pitch surface.
   * Validates ?token=UUID against pitch-sso function; renders the deck or an error state.
   */
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";

  type ValidateResp =
    | { ok: true; email: string; label: string | null; expires_at: string }
    | { ok: false; reason: "invalid" | "expired" | "revoked" };

  let status = $state<"loading" | "valid" | "invalid">("loading");
  let invalidReason = $state<"invalid" | "expired" | "revoked">("invalid");
  let email = $state<string>("");
  let label = $state<string | null>(null);
  let expiresAt = $state<string>("");

  const expiryLabel = $derived(
    expiresAt
      ? new Date(expiresAt).toLocaleDateString("en-GB", {
          day: "2-digit", month: "short", year: "numeric",
        })
      : "",
  );

  onMount(() => {
    const token = $page.url.searchParams.get("token");
    if (!token) {
      // No token at all - send to normal auth flow
      goto("/login", { replaceState: true });
      return;
    }

    (async () => {
      try {
        const r = await fetch(
          `/api/functions/pitch-sso?action=validate&token=${encodeURIComponent(token)}`,
          { method: "GET", headers: { Accept: "application/json" } },
        );
        const data = (await r.json()) as ValidateResp;
        if (data?.ok) {
          email = data.email;
          label = data.label;
          expiresAt = data.expires_at;
          status = "valid";
        } else {
          invalidReason = (data?.reason as any) || "invalid";
          status = "invalid";
        }
      } catch {
        invalidReason = "invalid";
        status = "invalid";
      }
    })();
  });
</script>

<svelte:head>
  <title>NEX - The Autonomous COO</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="pitch-root">
  <div class="pitch-aurora" aria-hidden="true">
    <div class="aurora-blob a1"></div>
    <div class="aurora-blob a2"></div>
    <div class="aurora-blob a3"></div>
  </div>

  {#if status === "loading"}
    <div class="state-card">
      <div class="spinner"></div>
      <p>Validating access...</p>
    </div>
  {:else if status === "invalid"}
    <div class="state-card error-card">
      <div class="logo-mark" aria-hidden="true">
        <svg viewBox="0 0 256 201" xmlns="http://www.w3.org/2000/svg" width="44" height="36">
          <path d="M197 75l-51-9c8-14 23-23 39-24l12 33z" fill="#56bcec"/>
          <path d="M205 90l-17-49c16 0 32 8 41 22l-24 27z" fill="#56bcec"/>
          <path d="M230 113l-1 3c-7 10-19 18-31 21l-5 1-12-33 49 8z" fill="#56bcec"/>
          <path d="M196 105l34-39c8 13 9 31 2 45l-36-6z" fill="#56bcec"/>
          <path d="M180 74l-34 39c-8-14-8-31-1-45 12 2 23 4 35 6z" fill="#56bcec"/>
          <path d="M189 138c-14 1-27-6-37-16l-4-6 23-26 18 48z" fill="#56bcec"/>
        </svg>
      </div>
      <h1>Access link unavailable</h1>
      <p class="error-msg">
        {#if invalidReason === "expired"}
          This pitch link has expired.
        {:else if invalidReason === "revoked"}
          This pitch link has been revoked.
        {:else}
          This link is invalid or no longer active.
        {/if}
      </p>
      <p class="error-help">
        Contact <a href="mailto:info@c2moviez.com">info@c2moviez.com</a> to request a new one.
      </p>
    </div>
  {:else}
    <header class="pitch-header">
      <a href="https://c2moviez.com" class="brand" target="_blank" rel="noopener">
        <div class="logo-mark" aria-hidden="true">
          <svg viewBox="0 0 256 201" xmlns="http://www.w3.org/2000/svg" width="34" height="28">
            <path d="M197 75l-51-9c8-14 23-23 39-24l12 33z" fill="#56bcec"/>
            <path d="M205 90l-17-49c16 0 32 8 41 22l-24 27z" fill="#56bcec"/>
            <path d="M230 113l-1 3c-7 10-19 18-31 21l-5 1-12-33 49 8z" fill="#56bcec"/>
            <path d="M196 105l34-39c8 13 9 31 2 45l-36-6z" fill="#56bcec"/>
            <path d="M180 74l-34 39c-8-14-8-31-1-45 12 2 23 4 35 6z" fill="#56bcec"/>
            <path d="M189 138c-14 1-27-6-37-16l-4-6 23-26 18 48z" fill="#56bcec"/>
          </svg>
        </div>
        <span class="brand-word">NEX</span>
      </a>
      <div class="prepared-for">
        <span class="prepared-label">Prepared for</span>
        <span class="prepared-email">{email}</span>
        {#if label}<span class="prepared-tag">- {label}</span>{/if}
      </div>
    </header>

    <main class="pitch-main">
      <section class="hero">
        <p class="eyebrow">NEX / NEXBOX</p>
        <h1 class="hero-title">
          Welcome to <span class="ink-gradient">NEX</span>
          <span class="hero-sub">The Autonomous COO</span>
        </h1>
        <p class="hero-lede">
          A live operations brain that monitors your business 24/7, acts on every signal,
          and quietly compounds learning across every client, ticket, invoice, and meeting.
        </p>
      </section>

      <section class="features">
        <article class="feature-card">
          <div class="feature-icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="9"/>
              <path d="M12 7v5l3 2"/>
            </svg>
          </div>
          <h3>Real-Time Operations</h3>
          <p>
            24/7 monitoring of tickets, clients, revenue, calendars, and decisions.
            One sub-second event bus replaces six tools and a Monday standup.
          </p>
        </article>

        <article class="feature-card">
          <div class="feature-icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2l3 7 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/>
            </svg>
          </div>
          <h3>Autonomous Intelligence</h3>
          <p>
            NEX does not just answer questions. It drafts proposals, opens tickets,
            books meetings, flags risks, and learns from every CEO correction.
          </p>
        </article>

        <article class="feature-card">
          <div class="feature-icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1.5"/>
              <rect x="14" y="3" width="7" height="7" rx="1.5"/>
              <rect x="3" y="14" width="7" height="7" rx="1.5"/>
              <rect x="14" y="14" width="7" height="7" rx="1.5"/>
            </svg>
          </div>
          <h3>White-Label Ready</h3>
          <p>
            NEXBOX is the same architecture configured for your industry, your brand,
            your data sovereignty. Construction, medical, real estate, legal - same engine.
          </p>
        </article>
      </section>

      <section class="cta-section">
        <a class="cta-primary" href="mailto:info@c2moviez.com?subject=NEXBOX%20Demo%20Request">
          Request a demo
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 5l7 7-7 7"/>
          </svg>
        </a>
        <p class="cta-meta">Access valid until {expiryLabel}</p>
      </section>
    </main>

    <footer class="pitch-footer">
      <span>c2moviez GmbH</span>
      <span class="sep">-</span>
      <a href="mailto:info@c2moviez.com">info@c2moviez.com</a>
      <span class="sep">-</span>
      <a href="tel:+41783178585">+41 78 317 85 85</a>
    </footer>
  {/if}
</div>

<style>
  :global(html), :global(body) {
    background: #06090F;
    color: #E7ECF3;
    margin: 0;
    padding: 0;
    min-height: 100%;
  }

  .pitch-root {
    position: relative;
    min-height: 100vh;
    background: radial-gradient(1200px 800px at 12% -10%, rgba(86,188,236,0.10), transparent 60%),
                radial-gradient(1000px 700px at 110% 110%, rgba(124,58,237,0.12), transparent 65%),
                linear-gradient(180deg, #06090F 0%, #080C14 100%);
    color: #E7ECF3;
    font-family: "Inter", -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif;
    -webkit-font-smoothing: antialiased;
    letter-spacing: -0.005em;
    overflow-x: hidden;
    padding: 28px 36px 56px;
    display: flex;
    flex-direction: column;
  }

  /* Aurora blobs (decorative) */
  .pitch-aurora {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 0;
    filter: blur(70px);
    opacity: 0.55;
  }
  .aurora-blob {
    position: absolute;
    border-radius: 50%;
    mix-blend-mode: screen;
    animation: aurora-drift 24s ease-in-out infinite;
  }
  .a1 {
    width: 560px; height: 560px;
    top: -160px; left: -120px;
    background: radial-gradient(circle, rgba(86,188,236,0.6), transparent 65%);
  }
  .a2 {
    width: 480px; height: 480px;
    bottom: -120px; right: -100px;
    background: radial-gradient(circle, rgba(124,58,237,0.5), transparent 65%);
    animation-delay: -8s;
  }
  .a3 {
    width: 360px; height: 360px;
    top: 40%; left: 55%;
    background: radial-gradient(circle, rgba(86,188,236,0.35), transparent 65%);
    animation-delay: -16s;
  }
  @keyframes aurora-drift {
    0%, 100% { transform: translate(0, 0) scale(1); }
    50%      { transform: translate(40px, -30px) scale(1.08); }
  }

  /* Header */
  .pitch-header {
    position: relative;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    padding: 4px 0 28px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    margin-bottom: 56px;
    flex-wrap: wrap;
  }
  .brand {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    text-decoration: none;
    color: inherit;
  }
  .logo-mark {
    width: 44px; height: 44px;
    border-radius: 12px;
    background: rgba(86,188,236,0.10);
    border: 1px solid rgba(86,188,236,0.30);
    display: grid;
    place-items: center;
    box-shadow: 0 8px 24px rgba(86,188,236,0.18);
  }
  .brand-word {
    font: 700 18px/1 "Montserrat", "Inter", sans-serif;
    letter-spacing: 0.18em;
    color: #56bcec;
  }
  .prepared-for {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    padding: 8px 14px;
    border-radius: 999px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    font-size: 12.5px;
  }
  .prepared-label {
    color: rgba(231,236,243,0.55);
    font-weight: 500;
  }
  .prepared-email {
    color: #E7ECF3;
    font-weight: 600;
  }
  .prepared-tag {
    color: rgba(231,236,243,0.45);
    font-weight: 500;
  }

  /* Main */
  .pitch-main {
    position: relative;
    z-index: 2;
    flex: 1;
    max-width: 1080px;
    margin: 0 auto;
    width: 100%;
  }

  .hero {
    text-align: center;
    margin: 24px auto 72px;
    max-width: 760px;
  }
  .eyebrow {
    text-transform: uppercase;
    font: 700 11px/1 "JetBrains Mono", "Inter", monospace;
    letter-spacing: 0.28em;
    color: #56bcec;
    margin: 0 0 18px;
  }
  .hero-title {
    margin: 0;
    font: 700 56px/1.05 "Montserrat", "Inter", sans-serif;
    letter-spacing: -0.025em;
    color: #F7FAFD;
  }
  .hero-sub {
    display: block;
    margin-top: 12px;
    font: 500 22px/1.3 "Inter", sans-serif;
    letter-spacing: -0.005em;
    color: rgba(231,236,243,0.65);
  }
  .ink-gradient {
    background: linear-gradient(135deg, #56bcec 0%, #7c3aed 100%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .hero-lede {
    margin: 28px auto 0;
    max-width: 580px;
    font-size: 15.5px;
    line-height: 1.65;
    color: rgba(231,236,243,0.72);
  }

  /* Features */
  .features {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
    margin: 0 0 80px;
  }
  .feature-card {
    position: relative;
    padding: 28px 24px 26px;
    border-radius: 18px;
    background: rgba(255,255,255,0.035);
    border: 1px solid rgba(255,255,255,0.08);
    backdrop-filter: blur(16px) saturate(1.4);
    -webkit-backdrop-filter: blur(16px) saturate(1.4);
    box-shadow:
      0 12px 36px rgba(0,0,0,0.32),
      inset 0 1px 0 rgba(255,255,255,0.05);
    transition: transform 220ms ease, border-color 220ms ease, box-shadow 220ms ease;
  }
  .feature-card:hover {
    transform: translateY(-3px);
    border-color: rgba(86,188,236,0.35);
    box-shadow:
      0 20px 48px rgba(0,0,0,0.45),
      0 0 0 1px rgba(86,188,236,0.15),
      inset 0 1px 0 rgba(255,255,255,0.07);
  }
  .feature-icon {
    width: 40px; height: 40px;
    border-radius: 10px;
    display: grid; place-items: center;
    background: rgba(86,188,236,0.10);
    border: 1px solid rgba(86,188,236,0.28);
    color: #56bcec;
    margin: 0 0 16px;
  }
  .feature-card h3 {
    margin: 0 0 10px;
    font: 700 17px/1.3 "Inter", sans-serif;
    letter-spacing: -0.01em;
    color: #F4F7FB;
  }
  .feature-card p {
    margin: 0;
    font-size: 13.5px;
    line-height: 1.6;
    color: rgba(231,236,243,0.68);
  }

  /* CTA */
  .cta-section {
    text-align: center;
    margin: 0 0 56px;
  }
  .cta-primary {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 14px 26px;
    border-radius: 12px;
    background: linear-gradient(180deg, #56bcec 0%, #3aa6dd 100%);
    color: #06080E;
    font: 700 14px/1 "Inter", sans-serif;
    letter-spacing: 0.01em;
    text-decoration: none;
    border: 1px solid rgba(86,188,236,0.6);
    box-shadow:
      0 12px 32px rgba(86,188,236,0.30),
      inset 0 1px 0 rgba(255,255,255,0.28);
    transition: transform 180ms ease, box-shadow 180ms ease, filter 180ms ease;
  }
  .cta-primary:hover {
    transform: translateY(-1px);
    box-shadow:
      0 16px 40px rgba(86,188,236,0.42),
      inset 0 1px 0 rgba(255,255,255,0.32);
    filter: brightness(1.06);
  }
  .cta-meta {
    margin: 18px 0 0;
    font-size: 12px;
    color: rgba(231,236,243,0.48);
    letter-spacing: 0.02em;
  }

  /* Footer */
  .pitch-footer {
    position: relative;
    z-index: 2;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    padding: 28px 0 0;
    margin-top: 32px;
    border-top: 1px solid rgba(255,255,255,0.06);
    font-size: 12.5px;
    color: rgba(231,236,243,0.52);
  }
  .pitch-footer a {
    color: rgba(231,236,243,0.72);
    text-decoration: none;
    transition: color 160ms ease;
  }
  .pitch-footer a:hover { color: #56bcec; }
  .sep { color: rgba(231,236,243,0.25); }

  /* Loading + error state */
  .state-card {
    position: relative;
    z-index: 2;
    margin: 14vh auto 0;
    max-width: 460px;
    padding: 40px 32px 36px;
    border-radius: 20px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    backdrop-filter: blur(20px) saturate(1.4);
    -webkit-backdrop-filter: blur(20px) saturate(1.4);
    text-align: center;
    box-shadow: 0 24px 72px rgba(0,0,0,0.45);
  }
  .state-card .logo-mark { margin: 0 auto 18px; }
  .state-card h1 {
    margin: 0 0 12px;
    font: 700 22px/1.25 "Montserrat", "Inter", sans-serif;
    letter-spacing: -0.015em;
    color: #F4F7FB;
  }
  .error-msg {
    margin: 0 0 14px;
    font-size: 14.5px;
    color: rgba(231,236,243,0.78);
  }
  .error-help {
    margin: 0;
    font-size: 13px;
    color: rgba(231,236,243,0.55);
  }
  .error-help a {
    color: #56bcec;
    text-decoration: none;
  }
  .error-help a:hover { text-decoration: underline; }

  .spinner {
    width: 32px; height: 32px;
    border-radius: 50%;
    border: 2px solid rgba(86,188,236,0.18);
    border-top-color: #56bcec;
    animation: spin 700ms linear infinite;
    margin: 0 auto 14px;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  .state-card p {
    margin: 0;
    font-size: 13px;
    color: rgba(231,236,243,0.6);
  }

  /* Responsive */
  @media (max-width: 880px) {
    .features { grid-template-columns: 1fr; }
    .hero-title { font-size: 42px; }
    .hero-sub { font-size: 19px; }
  }
  @media (max-width: 560px) {
    .pitch-root { padding: 20px 18px 36px; }
    .pitch-header { margin-bottom: 36px; }
    .hero { margin: 8px auto 48px; }
    .hero-title { font-size: 34px; }
    .hero-sub { font-size: 16px; }
    .hero-lede { font-size: 14.5px; }
    .features { gap: 14px; }
    .feature-card { padding: 22px 20px; }
  }
</style>

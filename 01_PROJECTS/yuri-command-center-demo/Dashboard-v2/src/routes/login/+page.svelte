<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { toast } from "$components/GlassToast.svelte";
  import { supabase, hasClient } from "$lib/db";

  let password = $state("");
  let submitting = $state(false);
  let msLoading = $state(false);
  let bannerError = $state<string | null>(null);

  onMount(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const err = params.get("error");
      if (err === "domain_not_allowed") {
        bannerError = "Access restricted to @c2moviez.com accounts only.";
      } else if (err) {
        bannerError = "Sign-in error: " + err.replace(/_/g, " ");
      }
    } catch { /* ignore */ }
  });

  async function signInWithMicrosoft() {
    if (!hasClient()) { toast("Supabase not configured", "error"); return; }
    msLoading = true;
    // Nuke any stale local session before starting a new OAuth dance. This stops
    // the supabase-js refresh-token retry loop that floods GoTrue when the
    // browser holds a revoked token (incident 2026-05-17: token u7zadfbihitj
    // hammered /token at 1 req/s for hours after DB-side purge). signOut with
    // scope:'local' only clears client-side storage — doesn't touch the server.
    try { await supabase().auth.signOut({ scope: "local" }); } catch { /* ignore */ }
    const { error } = await supabase().auth.signInWithOAuth({
      provider: "azure",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) { toast("Microsoft login failed: " + error.message, "error"); msLoading = false; }
    // On success: browser redirects to Microsoft — no code needed here
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    submitting = true;
    try {
      const r = await fetch("/api/functions/auth", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "login", password }),
      }).catch(() => null);

      let ok = false;
      if (r) {
        try { const data = await r.json(); if (data?.ok) ok = true; } catch { /* ignore */ }
      }

      if (!ok) { toast("Wrong password", "error"); return; }
      sessionStorage.setItem("exeo-authed", "1");
      toast("Welcome", "ok");
      goto("/");
    } finally {
      submitting = false;
    }
  }
</script>

<div class="login-page">
  <div class="login-card glass glass--thick">
    <div class="stack gap-2">
      <img src="/brand/logo.svg" alt="c2moviez" height="28" />
      <span class="caption eyebrow">c2moviez · NEX operations</span>
    </div>

    <div class="stack gap-1">
      <h1 class="h1 font-display">Welcome back.</h1>
      <p class="body">Sign in to access the ops command surface.</p>
    </div>

    {#if bannerError}
      <div class="error-banner" role="alert">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span>{bannerError}</span>
      </div>
    {/if}

    <!-- Microsoft SSO — primary login for all team members -->
    <button class="ms-btn" onclick={signInWithMicrosoft} disabled={msLoading}>
      {#if msLoading}
        Redirecting…
      {:else}
        <svg width="20" height="20" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
          <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
          <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
          <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
        </svg>
        Sign in with Microsoft
      {/if}
    </button>

    <div class="divider"><span>or</span></div>

    <!-- Password fallback (CEO only) -->
    <form onsubmit={submit} class="stack gap-3">
      <label class="field">
        <span class="caption">PASSWORD</span>
        <input
          type="password"
          bind:value={password}
          autocomplete="current-password"
          placeholder="•••••••"
          required
        />
      </label>
      <button class="submit glass-press" type="submit" disabled={submitting}>
        {submitting ? "Checking…" : "Enter"}
      </button>
    </form>

    <span class="caption footnote">v2 · Phase N · NEX</span>
  </div>
</div>

<style>
  .login-page {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 40px 20px;
    position: relative;
    z-index: 1;
  }
  .login-card {
    width: min(440px, 100%);
    padding: 36px 32px;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .field input {
    all: unset;
    padding: 12px 14px;
    background: var(--s2);
    border: 1px solid var(--b2);
    border-radius: var(--r-md);
    color: var(--tx);
    font-size: 15px;
    transition: border-color var(--dur-fast) var(--ease-out);
  }
  .field input:focus { border-color: var(--a); }

  .submit {
    all: unset;
    cursor: pointer;
    padding: 14px 20px;
    background: linear-gradient(135deg, var(--a) 0%, var(--a2) 100%);
    border-radius: var(--r-md);
    text-align: center;
    font-family: "Space Grotesk", sans-serif;
    font-weight: 500;
    color: white;
    transition: transform var(--dur-fast) var(--ease-out), filter var(--dur-fast) var(--ease-out);
  }
  .submit:hover:not(:disabled) { filter: brightness(1.1); }
  .submit:active:not(:disabled) { transform: scale(0.98); }
  .submit:disabled { opacity: 0.6; cursor: wait; }

  .footnote { text-align: center; color: var(--t4); }

  .ms-btn {
    all: unset;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 13px 20px;
    background: #fff;
    border: 1px solid #ddd;
    border-radius: var(--r-md);
    font-size: 15px;
    font-weight: 500;
    color: #1a1a2e;
    transition: background var(--dur-fast), box-shadow var(--dur-fast);
  }
  .ms-btn:hover:not(:disabled) { background: #f5f5f5; box-shadow: 0 2px 8px rgba(0,0,0,.1); }
  .ms-btn:disabled { opacity: 0.6; cursor: wait; }

  .divider {
    display: flex;
    align-items: center;
    gap: 12px;
    color: var(--t4);
    font-size: 12px;
  }
  .divider::before, .divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--b2);
  }
  .error-banner {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    border-radius: 10px;
    background: rgba(248, 113, 113, 0.08);
    border: 1px solid rgba(248, 113, 113, 0.25);
    color: #fca5a5;
    font: 500 13px/1.4 'Inter', sans-serif;
  }
  .error-banner svg { flex-shrink: 0; color: #f87171; }
</style>

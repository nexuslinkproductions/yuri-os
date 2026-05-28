<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { supabase, hasClient } from "$lib/db";

  let status = $state("Completing sign-in…");

  onMount(async () => {
    if (!hasClient()) { status = "Configuration error."; return; }

    const params = new URLSearchParams(window.location.search);

    // GoTrue redirects back with ?error=... when the OAuth callback fails server-side.
    const urlError = params.get("error");
    if (urlError) {
      const desc = params.get("error_description") ?? urlError;
      status = `Sign-in failed: ${decodeURIComponent(desc)}`;
      setTimeout(() => goto("/login"), 4000);
      return;
    }

    const code = params.get("code");
    if (!code) {
      status = "Sign-in failed: no authorisation code received.";
      setTimeout(() => goto("/login"), 4000);
      return;
    }

    // PKCE exchange. The verifier is stored in localStorage by signInWithOAuth
    // under a key ending in "-code-verifier". If it's missing (user cleared
    // localStorage between login click and callback, or used a different browser
    // tab), redirect back to /login rather than show a cryptic error.
    const verifierKey = Object.keys(localStorage).find(k => k.includes("code-verifier") || k.includes("-pkce"));
    if (!verifierKey) {
      status = "Session expired — please sign in again.";
      setTimeout(() => goto("/login"), 3000);
      return;
    }

    // Exchange the PKCE code for a session.
    // Pass the bare code (UUID), not window.location.search — the SDK sends
    // auth_code verbatim to GoTrue /token and GoTrue looks it up as a bare UUID.
    const { data, error } = await supabase().auth.exchangeCodeForSession(code);

    if (error || !data.session) {
      const detail = error?.message ?? (data.session ? "no session" : "session null");
      status = `Sign-in failed: ${detail}`;
      setTimeout(() => goto("/login"), 5000);
      return;
    }

    // ── Domain restriction: only @c2moviez.com emails ─────────────────
    const email = (data.session.user?.email || "").toLowerCase();
    if (!email.endsWith("@c2moviez.com")) {
      try { await supabase().auth.signOut(); } catch { /* ignore */ }
      status = "Access denied: only @c2moviez.com accounts may sign in.";
      setTimeout(() => goto("/login?error=domain_not_allowed", { replaceState: true }), 2500);
      return;
    }

    // ── Pending access: new c2moviez users go to /welcome ─────────────
    // CEO bypass — Claudio is always active.
    if (email !== "claudio@c2moviez.com") {
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
        sessionStorage.removeItem("exeo-authed");
        goto("/welcome", { replaceState: true });
        return;
      }
    }

    // Mark UI as authed (same flag the layout checks)
    sessionStorage.setItem("exeo-authed", "1");

    // Mint an exeo_token cookie via auth.js so subsequent API calls work via
    // cookie auth even when the GoTrue access_token expires (1-hour TTL).
    // Without this, SSO users lose all auth after 1 hour → files vanish silently.
    try {
      await fetch("/api/functions/auth", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${data.session.access_token}`,
        },
        body: JSON.stringify({ action: "verify" }),
      });
    } catch { /* non-fatal — GoTrue session in localStorage serves as fallback */ }

    // Redirect to original destination or home
    const redirect = params.get("redirect") || "/";
    goto(redirect, { replaceState: true });
  });
</script>

<div class="cb-page">
  <div class="cb-card glass glass--thick">
    <div class="spinner"></div>
    <p class="body">{status}</p>
  </div>
</div>

<style>
  .cb-page {
    min-height: 100vh;
    display: grid;
    place-items: center;
  }
  .cb-card {
    padding: 40px 48px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
  }
  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--b2);
    border-top-color: var(--a);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>

<script lang="ts">
  /**
   * /admin/pitch - CTI-only surface to mint and manage pitch SSO magic links.
   *
   * Flow:
   *   - Form: email + label + expiry days -> POST /api/functions/pitch-sso?action=create
   *   - List existing links (50 newest) -> GET ?action=list
   *   - Revoke per row -> POST ?action=revoke
   *
   * Bearer auth via $lib/db helpers; the function gates to role ceo/cto.
   */
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { user } from "$lib/stores/user.svelte";
  import { postAuthed, getAuthed } from "$lib/db";
  import AdminSubNav from "$lib/components/admin/AdminSubNav.svelte";

  type PitchLink = {
    id: string;
    email: string;
    label: string | null;
    token: string;
    created_by: string;
    created_at: string;
    expires_at: string;
    used_at: string | null;
    revoked: boolean;
  };

  let mounted = $state(false);
  let loading = $state(false);
  let creating = $state(false);
  let errorMsg = $state<string | null>(null);

  let email = $state("");
  let label = $state("");
  let expiresDays = $state(7);

  let lastCreated = $state<{ magic_link: string; email: string; expires_at: string } | null>(null);
  let copied = $state(false);

  let links = $state<PitchLink[]>([]);
  let revokingId = $state<string | null>(null);

  onMount(() => {
    (async () => {
      await user.init();
      if (!user.isAdmin) {
        goto("/", { replaceState: true });
        return;
      }
      await refresh();
      mounted = true;
    })();
  });

  async function refresh() {
    loading = true;
    errorMsg = null;
    try {
      const r = await getAuthed("/api/functions/pitch-sso?action=list");
      links = Array.isArray(r?.items) ? (r.items as PitchLink[]) : [];
    } catch (e: any) {
      errorMsg = e?.message || "Failed to load links";
    } finally {
      loading = false;
    }
  }

  async function createLink(e: Event) {
    e.preventDefault();
    if (!email.trim()) { errorMsg = "Email is required"; return; }
    creating = true;
    errorMsg = null;
    copied = false;
    try {
      const r = await postAuthed("/api/functions/pitch-sso?action=create", {
        email: email.trim(),
        label: label.trim() || null,
        expires_days: Number(expiresDays) || 7,
      });
      if (!r?.ok) throw new Error(r?.error || "create failed");
      lastCreated = {
        magic_link: r.magic_link,
        email: r.email,
        expires_at: r.expires_at,
      };
      email = "";
      label = "";
      expiresDays = 7;
      await refresh();
    } catch (err: any) {
      errorMsg = err?.message || "Failed to create link";
    } finally {
      creating = false;
    }
  }

  async function copyLink(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
      setTimeout(() => (copied = false), 1800);
    } catch {
      /* silent */
    }
  }

  async function revoke(link: PitchLink) {
    if (link.revoked) return;
    if (!confirm(`Revoke link for ${link.email}?`)) return;
    revokingId = link.id;
    try {
      const r = await postAuthed("/api/functions/pitch-sso?action=revoke", {
        token: link.token,
      });
      if (!r?.ok) throw new Error(r?.error || "revoke failed");
      await refresh();
    } catch (e: any) {
      errorMsg = e?.message || "Failed to revoke";
    } finally {
      revokingId = null;
    }
  }

  function fmtDate(iso: string | null): string {
    if (!iso) return "-";
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  function status(link: PitchLink): { label: string; tone: "ok" | "warn" | "off" } {
    if (link.revoked) return { label: "revoked", tone: "off" };
    if (Date.parse(link.expires_at) <= Date.now()) return { label: "expired", tone: "off" };
    if (link.used_at) return { label: "used - active", tone: "ok" };
    return { label: "unused - active", tone: "warn" };
  }

  function magicUrl(token: string): string {
    return `${location.origin}/pitch?token=${token}`;
  }
</script>

<svelte:head><title>NEX - Pitch SSO</title></svelte:head>

<AdminSubNav />

<div class="pitch-admin">
  <header class="head">
    <div>
      <h1>Pitch SSO</h1>
      <p class="lede">
        Generate time-limited magic links to share the NEX pitch deck with external prospects.
        No OAuth, no password. Links work without an account, revocable any time.
      </p>
    </div>
  </header>

  {#if errorMsg}
    <div class="alert error">{errorMsg}</div>
  {/if}

  <section class="card form-card">
    <h2>Generate new link</h2>
    <form onsubmit={createLink} class="grid">
      <label class="field">
        <span class="label">Prospect email</span>
        <input
          type="email"
          required
          placeholder="founder@example.com"
          bind:value={email}
          autocomplete="off"
        />
      </label>
      <label class="field">
        <span class="label">Label <em>(optional)</em></span>
        <input
          type="text"
          placeholder="ACME Corp pitch round 1"
          maxlength="200"
          bind:value={label}
        />
      </label>
      <label class="field small">
        <span class="label">Expires in (days)</span>
        <input
          type="number"
          min="1"
          max="90"
          bind:value={expiresDays}
        />
      </label>
      <div class="submit-row">
        <button type="submit" class="btn-primary" disabled={creating}>
          {creating ? "Generating..." : "Generate link"}
        </button>
      </div>
    </form>

    {#if lastCreated}
      <div class="generated">
        <div class="generated-row">
          <span class="generated-meta">
            For <strong>{lastCreated.email}</strong>
            - expires {fmtDate(lastCreated.expires_at)}
          </span>
          <button class="btn-copy" onclick={() => copyLink(lastCreated!.magic_link)}>
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
        <code class="generated-link">{lastCreated.magic_link}</code>
      </div>
    {/if}
  </section>

  <section class="card">
    <header class="card-head">
      <h2>Active and recent links</h2>
      <button class="btn-ghost" onclick={refresh} disabled={loading}>
        {loading ? "Loading..." : "Refresh"}
      </button>
    </header>

    {#if !mounted || (loading && links.length === 0)}
      <p class="empty">Loading...</p>
    {:else if links.length === 0}
      <p class="empty">No magic links yet.</p>
    {:else}
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Label</th>
              <th>Status</th>
              <th>Created</th>
              <th>Expires</th>
              <th>Last used</th>
              <th>By</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each links as link (link.id)}
              {@const s = status(link)}
              <tr class:row-off={s.tone === "off"}>
                <td class="email-cell">{link.email}</td>
                <td class="label-cell">{link.label || "-"}</td>
                <td>
                  <span class="chip chip-{s.tone}">{s.label}</span>
                </td>
                <td>{fmtDate(link.created_at)}</td>
                <td>{fmtDate(link.expires_at)}</td>
                <td>{fmtDate(link.used_at)}</td>
                <td class="by-cell">{link.created_by}</td>
                <td class="action-cell">
                  {#if !link.revoked && Date.parse(link.expires_at) > Date.now()}
                    <button
                      class="btn-copy small"
                      onclick={() => copyLink(magicUrl(link.token))}
                      title="Copy link"
                    >Copy</button>
                    <button
                      class="btn-danger small"
                      onclick={() => revoke(link)}
                      disabled={revokingId === link.id}
                    >
                      {revokingId === link.id ? "..." : "Revoke"}
                    </button>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>
</div>

<style>
  .pitch-admin {
    display: flex;
    flex-direction: column;
    gap: 20px;
    max-width: 1180px;
  }

  .head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 24px;
    flex-wrap: wrap;
  }
  .head h1 {
    margin: 0 0 6px;
    font: 700 22px/1.2 "Montserrat", Inter, sans-serif;
    letter-spacing: -0.015em;
    color: var(--ink);
  }
  .lede {
    margin: 0;
    max-width: 720px;
    font-size: 13.5px;
    line-height: 1.55;
    color: var(--ink-3);
  }

  .alert {
    padding: 12px 16px;
    border-radius: 10px;
    font-size: 13px;
    line-height: 1.4;
  }
  .alert.error {
    background: rgba(220, 38, 38, 0.10);
    border: 1px solid rgba(220, 38, 38, 0.30);
    color: #fca5a5;
  }

  .card {
    padding: 22px 24px;
    border-radius: 16px;
    background: var(--glass-chrome);
    -webkit-backdrop-filter: var(--blur-chrome);
    backdrop-filter: var(--blur-chrome);
    border: 1px solid var(--brand-line);
  }
  .card h2 {
    margin: 0 0 16px;
    font: 700 14px/1 Inter, sans-serif;
    letter-spacing: 0.01em;
    color: var(--ink);
  }
  .card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
  }
  .card-head h2 { margin: 0; }

  .form-card .grid {
    display: grid;
    grid-template-columns: 2fr 2fr 1fr;
    gap: 14px;
    align-items: end;
  }
  .submit-row {
    grid-column: 1 / -1;
    display: flex;
    justify-content: flex-end;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .field .label {
    font: 600 11.5px/1 Inter, sans-serif;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--ink-3);
  }
  .field .label em {
    font-style: normal;
    text-transform: none;
    letter-spacing: 0;
    color: var(--ink-3);
    opacity: 0.6;
    font-weight: 500;
  }
  .field input {
    height: 38px;
    padding: 0 12px;
    border-radius: 10px;
    background: var(--canvas-2);
    border: 1px solid var(--line);
    color: var(--ink);
    font: 500 13.5px/1 Inter, sans-serif;
    transition: border-color 160ms ease, box-shadow 160ms ease;
  }
  .field input:focus {
    outline: none;
    border-color: #56bcec;
    box-shadow: 0 0 0 3px rgba(86, 188, 236, 0.18);
  }

  .btn-primary {
    height: 38px;
    padding: 0 20px;
    border-radius: 10px;
    background: linear-gradient(180deg, #56bcec 0%, #3aa6dd 100%);
    color: #06080E;
    font: 700 13px/1 Inter, sans-serif;
    border: 1px solid rgba(86, 188, 236, 0.6);
    box-shadow: 0 4px 14px rgba(86, 188, 236, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.25);
    cursor: pointer;
    transition: filter 160ms ease, transform 160ms ease;
  }
  .btn-primary:hover { filter: brightness(1.05); transform: translateY(-1px); }
  .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }

  .btn-ghost {
    height: 32px;
    padding: 0 14px;
    border-radius: 9px;
    background: transparent;
    border: 1px solid var(--line);
    color: var(--ink-2);
    font: 600 12.5px/1 Inter, sans-serif;
    cursor: pointer;
    transition: border-color 160ms ease, color 160ms ease;
  }
  .btn-ghost:hover { border-color: rgba(86, 188, 236, 0.5); color: var(--ink); }

  .btn-copy {
    height: 32px;
    padding: 0 14px;
    border-radius: 8px;
    background: rgba(86, 188, 236, 0.10);
    border: 1px solid rgba(86, 188, 236, 0.32);
    color: #56bcec;
    font: 600 12px/1 Inter, sans-serif;
    cursor: pointer;
    transition: background 160ms ease;
  }
  .btn-copy:hover { background: rgba(86, 188, 236, 0.18); }
  .btn-copy.small { height: 26px; padding: 0 10px; font-size: 11.5px; }

  .btn-danger {
    height: 32px;
    padding: 0 14px;
    border-radius: 8px;
    background: rgba(220, 38, 38, 0.10);
    border: 1px solid rgba(220, 38, 38, 0.32);
    color: #fca5a5;
    font: 600 12px/1 Inter, sans-serif;
    cursor: pointer;
    transition: background 160ms ease;
  }
  .btn-danger:hover { background: rgba(220, 38, 38, 0.18); }
  .btn-danger.small { height: 26px; padding: 0 10px; font-size: 11.5px; }
  .btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }

  .generated {
    margin-top: 18px;
    padding: 14px 16px;
    border-radius: 12px;
    background: rgba(86, 188, 236, 0.06);
    border: 1px solid rgba(86, 188, 236, 0.22);
  }
  .generated-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 8px;
    flex-wrap: wrap;
  }
  .generated-meta {
    font-size: 12.5px;
    color: var(--ink-2);
  }
  .generated-link {
    display: block;
    padding: 10px 12px;
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.30);
    color: #9be3ff;
    font: 500 12px/1.4 "JetBrains Mono", monospace;
    word-break: break-all;
    border: 1px solid rgba(255, 255, 255, 0.05);
  }

  .table-wrap {
    overflow-x: auto;
    margin: 0 -24px;
    padding: 0 24px;
  }
  .table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12.5px;
    color: var(--ink-2);
  }
  .table th {
    text-align: left;
    padding: 10px 12px;
    font: 600 10.5px/1 Inter, sans-serif;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ink-3);
    border-bottom: 1px solid var(--line);
  }
  .table td {
    padding: 11px 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    vertical-align: middle;
  }
  .table tr:last-child td { border-bottom: none; }
  .row-off { opacity: 0.55; }
  .email-cell { font-weight: 600; color: var(--ink); }
  .label-cell { color: var(--ink-3); }
  .by-cell { color: var(--ink-3); font-size: 11.5px; }
  .action-cell {
    display: flex;
    gap: 6px;
    justify-content: flex-end;
    white-space: nowrap;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    padding: 4px 10px;
    border-radius: 999px;
    font: 600 10.5px/1 Inter, sans-serif;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    border: 1px solid;
  }
  .chip-ok {
    background: rgba(34, 197, 94, 0.10);
    border-color: rgba(34, 197, 94, 0.32);
    color: #86efac;
  }
  .chip-warn {
    background: rgba(86, 188, 236, 0.10);
    border-color: rgba(86, 188, 236, 0.32);
    color: #56bcec;
  }
  .chip-off {
    background: rgba(148, 163, 184, 0.10);
    border-color: rgba(148, 163, 184, 0.28);
    color: #94a3b8;
  }

  .empty {
    padding: 28px 0;
    text-align: center;
    color: var(--ink-3);
    font-size: 13px;
  }

  @media (max-width: 760px) {
    .form-card .grid { grid-template-columns: 1fr; }
    .field.small { grid-column: 1 / -1; }
  }
</style>

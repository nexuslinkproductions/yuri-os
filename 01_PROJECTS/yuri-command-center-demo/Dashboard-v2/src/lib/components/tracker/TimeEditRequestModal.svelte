<script lang="ts">
  /**
   * TimeEditRequestModal — Workstream T.7.3-F.
   *
   * Edit a stopped time entry's started_at / ended_at / description /
   * is_billable. Computes drift live; if drift ≤ 5 min, the backend auto-
   * applies silently (no CEO ping). If > 5 min, the request goes to CEO's
   * Telegram with inline-button approve/reject.
   *
   * The actual drift logic lives in the RPC (tracker_time_edit_request) so
   * the front-end can show a hint but never lies about what'll happen on
   * submit.
   *
   * Props mimic the existing IdleModal pattern — a `entry` + `onClose`.
   */
  import { postAuthed, type TimeEntry } from "$lib/db";
  import { GlassActionPrimary, GlassActionSecondary, GlassValueChip } from "$lib/components/glass";
  import { toast } from "$components/GlassToast.svelte";
  import { user } from "$stores/user.svelte";

  interface Props {
    entry: TimeEntry | null;
    onClose: () => void;
    onApplied?: () => void;     // host can refresh its list
  }
  const { entry, onClose, onApplied }: Props = $props();

  // CEO/CTO bypass the drift threshold + approval flow — they edit directly.
  // They can also delete the entry outright.
  const isAdmin = $derived(user.isAdmin);

  // ── Convert ISO → datetime-local (YYYY-MM-DDTHH:MM) ───────────────
  function toLocal(iso?: string | null): string {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  let startedLocal = $state("");
  let endedLocal   = $state("");
  let description  = $state("");
  let isBillable   = $state(true);
  let reason       = $state("");
  let submitting   = $state(false);

  // Reset on each open
  $effect(() => {
    if (entry) {
      startedLocal = toLocal(entry.started_at);
      endedLocal   = toLocal(entry.ended_at);
      description  = entry.description || "";
      isBillable   = entry.is_billable !== false;
      reason       = "";
    }
  });

  // Live drift estimate (mirrors RPC math)
  const driftMinutes = $derived.by(() => {
    if (!entry || !startedLocal || !endedLocal) return 0;
    const sNew = new Date(startedLocal).getTime();
    const eNew = new Date(endedLocal).getTime();
    const sOld = new Date(entry.started_at).getTime();
    const eOld = new Date(entry.ended_at || entry.started_at).getTime();
    return Math.max(Math.abs(sNew - sOld), Math.abs(eNew - eOld)) / 60_000;
  });
  const autoApplies = $derived(driftMinutes <= 5);

  function fmtDur(startedAt?: string | null, endedAt?: string | null): string {
    if (!startedAt || !endedAt) return "—";
    const min = Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60_000);
    const h = Math.floor(min / 60), m = min % 60;
    return `${h}h ${String(m).padStart(2, "0")}m`;
  }

  async function submit() {
    if (!entry) return;
    submitting = true;
    try {
      const proposed: Record<string, unknown> = {};
      const newStartIso = new Date(startedLocal).toISOString();
      const newEndIso = new Date(endedLocal).toISOString();
      if (newStartIso !== entry.started_at) proposed.started_at = newStartIso;
      if (newEndIso !== entry.ended_at)     proposed.ended_at   = newEndIso;
      if (description !== (entry.description || "")) proposed.description = description;
      if (isBillable !== (entry.is_billable !== false)) proposed.is_billable = isBillable;

      if (Object.keys(proposed).length === 0) {
        toast("No changes to submit", "warn");
        return;
      }

      // CEO/CTO override — bypass approval flow, write straight through.
      if (isAdmin) {
        await postAuthed("/api/functions/tracker-admin-update-entry", {
          entry_id: entry.id,
          fields: proposed,
        });
        toast("Entry updated (admin override)", "ok");
        onApplied?.();
        onClose();
        return;
      }

      const r = await postAuthed("/api/functions/tracker-time-edit-request", {
        entry_id: entry.id,
        proposed,
        reason: reason.trim() || null,
      });
      const status = r?.request?.status;
      if (status === "auto_applied") {
        toast(`Edit applied silently (drift ${Number(r.request.drift_minutes ?? 0).toFixed(1)}m ≤ 5)`, "ok");
      } else if (status === "pending") {
        toast(`Sent to CEO for approval (drift ${Number(r.request.drift_minutes ?? 0).toFixed(1)}m)`, "info");
      } else {
        toast("Edit request submitted", "ok");
      }
      onApplied?.();
      onClose();
    } catch (e: any) {
      toast(e?.message || "Edit request failed", "error");
    } finally {
      submitting = false;
    }
  }

  async function deleteEntry() {
    if (!entry || !isAdmin) return;
    const confirmed = confirm(
      `Delete this time entry?\n\n` +
      `${fmtDur(entry.started_at, entry.ended_at)} · ${entry.client_code || "—"}\n` +
      `"${entry.description || "(no description)"}"\n\n` +
      `This is permanent and removes the linked Plane worklog on the next sync.`
    );
    if (!confirmed) return;
    submitting = true;
    try {
      await postAuthed("/api/functions/tracker-admin-delete-entry", {
        entry_id: entry.id,
      });
      toast("Entry deleted", "ok");
      onApplied?.();
      onClose();
    } catch (e: any) {
      toast(e?.message || "Delete failed", "error");
    } finally {
      submitting = false;
    }
  }

  function handleKey(e: KeyboardEvent) {
    if (!entry) return;
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
  }
</script>

<svelte:window onkeydown={handleKey} />

{#if entry}
  <div class="m" role="dialog" aria-modal="true" aria-label="Edit time entry">
    <div class="m__backdrop" onclick={onClose} role="presentation"></div>

    <div class="m__card" role="document">
      <header class="m__head">
        <div>
          <span class="m__eyebrow">Edit time entry</span>
          <h3>{entry.plane_issue_seq || entry.description || "entry"}</h3>
          <p class="m__sub">
            Currently: <code>{fmtDur(entry.started_at, entry.ended_at)}</code>
            {#if entry.client_code}· <code>{entry.client_code}</code>{/if}
            · {entry.is_billable !== false ? "billable" : "non-billable"}
          </p>
        </div>
        <button type="button" class="m__close" aria-label="Close" onclick={onClose}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </header>

      <div class="m__body">
        <div class="grid">
          <label>
            <span>Start</span>
            <input type="datetime-local" step="60" bind:value={startedLocal} />
          </label>
          <label>
            <span>End</span>
            <input type="datetime-local" step="60" bind:value={endedLocal} />
          </label>
          <label class="full">
            <span>Description</span>
            <input type="text" bind:value={description} placeholder="What did you work on?" />
          </label>
          <label class="checkbox">
            <input type="checkbox" bind:checked={isBillable} />
            <span>Billable</span>
          </label>
          {#if !isAdmin}
            <div class="drift-cell">
              <GlassValueChip tone={autoApplies ? "success" : "warn"} size="sm" static>
                {#snippet children()}drift {driftMinutes.toFixed(1)} min{/snippet}
              </GlassValueChip>
            </div>
            <label class="full">
              <span>Reason (optional, shown to CEO if drift &gt; 5 min)</span>
              <input type="text" bind:value={reason} placeholder="e.g. forgot to stop before lunch" />
            </label>
          {/if}
        </div>

        <div class="hint" class:hint--auto={autoApplies} class:hint--admin={isAdmin}>
          {#if isAdmin}
            ⚡ Admin override — your edit applies immediately. Use the Delete button to remove an entry outright.
          {:else if autoApplies}
            ✅ Drift ≤ 5 min — this edit auto-applies silently. No Telegram ping to CEO.
          {:else}
            ⚠ Drift &gt; 5 min — CEO must approve via Telegram before the change applies.
          {/if}
        </div>
      </div>

      <footer class="m__foot">
        <div class="m__foot-left">
          {#if isAdmin}
            <GlassActionSecondary onclick={deleteEntry} tone="danger" loading={submitting}>
              {#snippet children()}Delete{/snippet}
            </GlassActionSecondary>
          {/if}
        </div>
        <div class="m__foot-right">
          <GlassActionSecondary onclick={onClose}>{#snippet children()}Cancel{/snippet}</GlassActionSecondary>
          <GlassActionPrimary onclick={submit} loading={submitting}>
            {#snippet children()}
              {isAdmin ? "Apply override" : autoApplies ? "Apply" : "Send to CEO"}
            {/snippet}
          </GlassActionPrimary>
        </div>
      </footer>
    </div>
  </div>
{/if}

<style>
  .m {
    position: fixed; inset: 0;
    z-index: var(--z-modal, 1000);
    display: grid; place-items: center;
    padding: 20px;
  }
  .m__backdrop {
    position: absolute; inset: 0;
    background: rgba(8, 11, 20, 0.55);
    backdrop-filter: blur(10px) saturate(1.2);
    -webkit-backdrop-filter: blur(10px) saturate(1.2);
  }
  .m__card {
    position: relative;
    width: min(560px, 100%);
    max-height: 90vh;
    display: flex; flex-direction: column;
    border-radius: var(--r3, 22px);
    background: var(--glass-elev);
    backdrop-filter: var(--blur-elev);
    -webkit-backdrop-filter: var(--blur-elev);
    border: 1px solid var(--brand-line);
    box-shadow: var(--sh-elev);
    overflow: hidden;
    font-family: var(--sa);
    color: var(--tx);
    animation: m-pop 220ms var(--tier-spring, cubic-bezier(.34,1.56,.64,1)) both;
  }
  @keyframes m-pop {
    from { opacity: 0; transform: translateY(8px) scale(.98); }
    to   { opacity: 1; transform: translateY(0)   scale(1); }
  }
  .m__head {
    display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;
    padding: 18px 22px 14px;
    border-bottom: 1px solid var(--line);
  }
  .m__eyebrow {
    font: 700 11px/1.3 var(--sa); letter-spacing: 0.10em; text-transform: uppercase; color: var(--brand-deep);
  }
  .m__head h3 { margin: 4px 0 4px; font: 700 17px/1.3 var(--hd, var(--sa)); letter-spacing: -0.01em; }
  .m__sub { margin: 0; font: 500 12.5px/1.4 var(--sa); color: var(--t2); }
  .m__sub code { font-family: var(--mo); background: var(--s2); padding: 1px 5px; border-radius: 4px; }
  .m__close {
    appearance: none; border: 1px solid var(--line);
    width: 32px; height: 32px; border-radius: 8px;
    background: var(--s1); color: var(--t2); cursor: pointer;
    display: grid; place-items: center; flex-shrink: 0;
  }
  .m__body { flex: 1; min-height: 0; overflow: auto; padding: 16px 22px; }
  .grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
    align-items: end;
  }
  .grid label { display: flex; flex-direction: column; gap: 4px; }
  .grid label.full { grid-column: 1 / -1; }
  .grid label > span {
    font: 600 11px/1.2 var(--sa);
    text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--t3);
  }
  .grid input[type="datetime-local"], .grid input[type="text"] {
    appearance: none;
    padding: 9px 11px;
    font: 500 13.5px/1.4 var(--sa);
    color: var(--tx);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: 8px;
    outline: none;
  }
  .grid input:focus {
    border-color: var(--brand); background: var(--canvas-2, var(--bg));
    box-shadow: 0 0 0 3px var(--brand-line-2);
  }
  .checkbox {
    display: inline-flex !important; align-items: center; gap: 8px;
    padding: 10px 12px;
    background: var(--s1); border-radius: 8px;
  }
  .checkbox input { accent-color: var(--brand); width: 18px; height: 18px; }
  .drift-cell { display: inline-flex; justify-content: flex-end; padding: 6px 0; }
  .hint {
    margin-top: 14px;
    padding: 10px 14px;
    border-radius: 8px;
    background: var(--chip-tint-warn);
    color: var(--or);
    font: 500 12.5px/1.4 var(--sa);
    border: 1px solid rgba(217,119,0,0.22);
  }
  .hint--auto {
    background: var(--chip-tint-success);
    color: var(--gr);
    border-color: rgba(30,160,51,0.22);
  }
  .hint--admin {
    background: var(--chip-tint-info);
    color: var(--brand-deep);
    border-color: var(--brand-line-2);
  }
  .m__foot {
    display: flex; justify-content: space-between; align-items: center;
    gap: 8px; padding: 14px 22px;
    border-top: 1px solid var(--line);
  }
  .m__foot-left { display: flex; }
  .m__foot-right { display: flex; gap: 8px; }
  @media (max-width: 480px) {
    .m { padding: 0; }
    .m__card { max-height: 100vh; height: 100vh; border-radius: 0; width: 100%; }
    .grid { grid-template-columns: 1fr; }
    .checkbox, .drift-cell { grid-column: 1 / -1; }
  }
</style>

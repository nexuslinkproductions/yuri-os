<script lang="ts">
  /**
   * IdleModal — Tyme3-class idle prompt (Workstream T.6).
   *
   * Watches `tracker.idle` (set by the tracker store after 10 min of no
   * input). When idle, shows a centred modal asking:
   *   - Keep the idle time (no change)
   *   - Drop the idle time (sets idle_seconds for the stop call)
   *   - Stop now (with idle deducted)
   *
   * Auto-dismisses when the user resumes activity (mouse/keypress) — the
   * store's idle flag flips back to false.
   *
   * Mounts once globally next to TrackerChip in CommandBar. Lightweight —
   * renders nothing when not idle.
   */
  import { tracker, formatHMS } from "$stores/tracker.svelte";
  import { GlassActionPrimary, GlassActionSecondary } from "$lib/components/glass";
  import { toast } from "$components/GlassToast.svelte";

  // The store doesn't currently expose the exact idle-start timestamp, but
  // we know roughly that the idle window is at minimum 10 min and capped at
  // (elapsed since started_at). For v1 we display "~10 min idle" — the
  // server-side idle_seconds is what gets persisted.
  const idleMinutes = 10;        // matches DEFAULT in tracker.svelte.ts
  const idleSeconds = idleMinutes * 60;

  async function keep() {
    // Treat as not idle, no change to idle_seconds
    tracker.resetIdle();
  }

  async function dropAndContinue() {
    // Reset the idle flag (user is back); the heartbeat will keep submitting
    // idle_seconds as the running maximum.
    tracker.resetIdle();
    toast("Idle window noted", "info");
  }

  async function stopNow() {
    try {
      await tracker.stop({ idle_seconds: idleSeconds });
      toast(`Stopped · ${idleMinutes} min idle deducted`, "ok");
    } catch (e: any) {
      toast(e?.message || "Stop failed", "error");
    }
  }
</script>

{#if tracker.idle && tracker.running}
  <div class="idle-overlay" role="dialog" aria-modal="true" aria-label="Tracker idle">
    <div class="idle-card">
      <div class="idle-eyebrow">⚠ TRACKER IDLE</div>
      <h2 class="idle-title">You've been away ~{idleMinutes} minutes</h2>
      <p class="idle-sub">
        Tracker is still running on <strong>{tracker.running.plane_issue_seq || "an entry"}</strong> ·
        elapsed <code>{formatHMS(tracker.elapsed)}</code>.
        What should we count?
      </p>

      <div class="idle-actions">
        <GlassActionSecondary onclick={keep}>
          {#snippet children()}Keep the {idleMinutes} min{/snippet}
        </GlassActionSecondary>
        <GlassActionSecondary tone="warn" onclick={dropAndContinue}>
          {#snippet children()}Drop · keep tracking{/snippet}
        </GlassActionSecondary>
        <GlassActionPrimary tone="danger" onclick={stopNow}>
          {#snippet children()}Stop · deduct idle{/snippet}
        </GlassActionPrimary>
      </div>

      <p class="idle-hint">Tip: <code>⌘ .</code> also stops · move your mouse to resume.</p>
    </div>
  </div>
{/if}

<style>
  .idle-overlay {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal, 1000);
    display: grid;
    place-items: center;
    padding: 16px;
    background: rgba(8, 11, 20, 0.55);
    backdrop-filter: blur(12px) saturate(1.2);
    -webkit-backdrop-filter: blur(12px) saturate(1.2);
    animation: idle-fade 200ms var(--ease) both;
  }
  @keyframes idle-fade {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  .idle-card {
    width: min(480px, 100%);
    padding: 28px 28px 22px;
    border-radius: var(--r3, 22px);
    background: var(--glass-elev);
    backdrop-filter: var(--blur-elev);
    -webkit-backdrop-filter: var(--blur-elev);
    border: 1px solid var(--brand-line-2);
    box-shadow:
      var(--sh-elev),
      0 0 64px -16px rgba(255,159,10,0.45);    /* amber glow — matches idle chip */
    animation: idle-pop 260ms var(--tier-spring, cubic-bezier(.34,1.56,.64,1)) both;
    font-family: var(--sa);
    color: var(--tx);
  }
  @keyframes idle-pop {
    from { opacity: 0; transform: scale(.95) translateY(8px); }
    to   { opacity: 1; transform: scale(1) translateY(0); }
  }

  .idle-eyebrow {
    font: 700 11px/1.3 var(--sa);
    letter-spacing: 0.14em;
    color: var(--or, #ff9f0a);
    margin-bottom: 8px;
  }
  .idle-title {
    margin: 0 0 8px;
    font-family: var(--hd);
    font-weight: 700;
    font-size: 22px;
    color: var(--tx);
    letter-spacing: -0.01em;
  }
  .idle-sub {
    margin: 0 0 20px;
    font-size: 13.5px;
    color: var(--t2);
    line-height: 1.55;
  }
  .idle-sub code {
    font-family: var(--mo);
    font-variant-numeric: tabular-nums;
    background: var(--s2);
    padding: 1px 6px;
    border-radius: 4px;
    color: var(--tx);
  }
  .idle-sub strong { color: var(--tx); font-weight: 600; }

  .idle-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: flex-end;
  }

  .idle-hint {
    margin: 16px 0 0;
    padding-top: 12px;
    border-top: 1px solid var(--line);
    font-size: 11.5px;
    color: var(--t3);
  }
  .idle-hint code {
    font-family: var(--mo);
    background: var(--s2);
    padding: 1px 5px;
    border-radius: 4px;
  }

  @media (max-width: 480px) {
    .idle-card { padding: 22px 18px 18px; }
    .idle-title { font-size: 19px; }
    .idle-actions { justify-content: stretch; }
    .idle-actions > * { flex: 1 1 calc(50% - 4px); }
  }

  @media (prefers-reduced-motion: reduce) {
    .idle-overlay, .idle-card { animation: none; }
  }
</style>

<script lang="ts">
  /**
   * StopModal — shown after the user stops the timer.
   *
   * CEO directive (2026-05-15): "When stopping, an optional popup asks to
   * link a Plane ticket for reference only (no push)."
   *
   * Behaviour:
   *   - Always shows a summary: client task / duration / date.
   *   - Optional notes textarea.
   *   - Optional "Link to Plane ticket" toggle — when on, a plain text
   *     input collects a ticket seq like "C2M-142". We never call Plane.
   *     It's stored as plane_issue_seq on time_entries for reference.
   *   - "Done" patches the time_entry IF notes or ticket ref were added.
   *     Otherwise it just closes.
   */
  import { supabase, hasClient, type TimeEntry } from "$lib/db";
  import { formatHMS } from "$stores/tracker.svelte";
  import {
    GlassActionPrimary,
    GlassActionSecondary,
  } from "$lib/components/glass";
  import { toast } from "$components/GlassToast.svelte";

  interface Props {
    entry: TimeEntry | null;
    onClose: () => void;
  }
  const { entry, onClose }: Props = $props();

  let notes = $state("");
  let linkOpen = $state(false);
  let ticketRef = $state("");
  let saving = $state(false);

  // Reset when entry changes
  $effect(() => {
    if (entry) {
      notes = entry.notes || "";
      ticketRef = entry.plane_issue_seq || "";
      linkOpen = !!entry.plane_issue_seq;
      saving = false;
    }
  });

  const durationText = $derived(
    entry?.duration_seconds != null ? formatHMS(entry.duration_seconds) : "-"
  );
  const dateText = $derived(
    entry?.started_at
      ? new Date(entry.started_at).toLocaleDateString("de-CH", {
          weekday: "short",
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : ""
  );
  const timeRangeText = $derived(() => {
    if (!entry?.started_at || !entry.ended_at) return "";
    const fmt = (iso: string) =>
      new Date(iso).toLocaleTimeString("de-CH", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Zurich",
      });
    return `${fmt(entry.started_at)} -> ${fmt(entry.ended_at)}`;
  });

  async function done() {
    if (!entry) {
      onClose();
      return;
    }
    const trimmedNotes = notes.trim();
    const trimmedRef = ticketRef.trim();
    const hasNotesChange = trimmedNotes !== (entry.notes || "");
    const hasRefChange =
      (linkOpen && trimmedRef !== (entry.plane_issue_seq || "")) ||
      (!linkOpen && entry.plane_issue_seq);

    if (!hasNotesChange && !hasRefChange) {
      onClose();
      return;
    }
    if (!hasClient()) {
      toast("Supabase not configured", "error");
      onClose();
      return;
    }

    saving = true;
    try {
      const patch: Record<string, unknown> = {};
      if (hasNotesChange) patch.notes = trimmedNotes || null;
      if (hasRefChange) {
        patch.plane_issue_seq = linkOpen && trimmedRef ? trimmedRef : null;
      }
      const { error } = await supabase()
        .from("time_entries")
        .update(patch)
        .eq("id", entry.id);
      if (error) throw new Error(error.message);
      toast("Entry updated", "ok");
      onClose();
    } catch (e: any) {
      toast(e?.message || "Could not save", "error");
    } finally {
      saving = false;
    }
  }

  function handleKey(e: KeyboardEvent) {
    if (!entry) return;
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
  }
</script>

<svelte:window onkeydown={handleKey} />

{#if entry}
  <div class="stop-modal" role="dialog" aria-modal="true" aria-label="Tracker stopped">
    <div class="stop-modal__backdrop" onclick={onClose} role="presentation"></div>

    <div class="stop-modal__card" role="document">
      <header class="stop-modal__head">
        <div class="stop-modal__title">
          <span class="stop-modal__eyebrow">Tracker stopped</span>
          <h3>{entry.description || "Untitled work"}</h3>
        </div>
        <button type="button" class="stop-modal__close" aria-label="Close" onclick={onClose}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </header>

      <div class="stop-modal__summary">
        <div class="summary__row">
          <span class="summary__label">Duration</span>
          <span class="summary__value summary__value--big">{durationText}</span>
        </div>
        <div class="summary__row">
          <span class="summary__label">Date</span>
          <span class="summary__value">{dateText}</span>
        </div>
        {#if timeRangeText()}
          <div class="summary__row">
            <span class="summary__label">Range</span>
            <span class="summary__value">{timeRangeText()}</span>
          </div>
        {/if}
        {#if entry.client_code}
          <div class="summary__row">
            <span class="summary__label">Client</span>
            <span class="summary__value">{entry.client_code}</span>
          </div>
        {/if}
        <div class="summary__row">
          <span class="summary__label">Billable</span>
          <span class="summary__value">{entry.is_billable ? "yes" : "no"}</span>
        </div>
      </div>

      <div class="stop-modal__body">
        <label class="field">
          <span class="field__label">Notes (optional)</span>
          <textarea
            bind:value={notes}
            placeholder="Quick recap of what got done..."
            rows="3"
          ></textarea>
        </label>

        <div class="link-block">
          <label class="link-toggle">
            <input type="checkbox" bind:checked={linkOpen} />
            <span class="link-toggle__title">Link to a Plane ticket?</span>
            <span class="link-toggle__hint">For reference only. No worklog is pushed to Plane.</span>
          </label>

          {#if linkOpen}
            <input
              type="text"
              class="link-input"
              placeholder="Ticket reference (e.g. C2M-142)"
              bind:value={ticketRef}
            />
          {/if}
        </div>
      </div>

      <footer class="stop-modal__foot">
        <GlassActionSecondary onclick={onClose}>
          {#snippet children()}Skip{/snippet}
        </GlassActionSecondary>
        <GlassActionPrimary onclick={done} loading={saving}>
          {#snippet children()}Done{/snippet}
        </GlassActionPrimary>
      </footer>
    </div>
  </div>
{/if}

<style>
  .stop-modal {
    position: fixed; inset: 0;
    z-index: var(--z-modal, 1000);
    display: grid; place-items: center;
    padding: 20px;
  }
  .stop-modal__backdrop {
    position: absolute; inset: 0;
    background: rgba(8, 11, 20, 0.55);
    backdrop-filter: blur(10px) saturate(1.2);
    -webkit-backdrop-filter: blur(10px) saturate(1.2);
  }
  .stop-modal__card {
    position: relative;
    width: min(520px, 100%);
    max-height: 88vh;
    display: flex; flex-direction: column;
    border-radius: 16px;
    background: var(--glass-chrome);
    backdrop-filter: var(--blur-chrome);
    -webkit-backdrop-filter: var(--blur-chrome);
    border: 1px solid var(--brand-line);
    box-shadow: var(--sh-elev), 0 0 80px -20px rgba(86,188,236,0.40);
    font-family: var(--sa);
    overflow: hidden;
    animation: stop-pop 220ms var(--tier-spring, cubic-bezier(.34,1.56,.64,1)) both;
  }
  @keyframes stop-pop {
    from { opacity: 0; transform: translateY(8px) scale(.98); }
    to   { opacity: 1; transform: translateY(0)   scale(1); }
  }

  .stop-modal__head {
    display: flex; justify-content: space-between; align-items: flex-start;
    padding: 18px 20px 14px;
    border-bottom: 1px solid var(--line);
    gap: 12px;
  }
  .stop-modal__eyebrow {
    font: 700 10.5px/1 var(--sa);
    letter-spacing: 0.10em;
    text-transform: uppercase;
    color: var(--brand-deep);
  }
  .stop-modal__title h3 {
    margin: 4px 0 0;
    font-family: var(--hd);
    font-weight: 600;
    font-size: 18px;
    color: var(--tx);
    line-height: 1.3;
  }
  .stop-modal__close {
    appearance: none; border: 1px solid var(--line);
    width: 32px; height: 32px; border-radius: 8px;
    background: var(--s1); color: var(--t2); cursor: pointer;
    display: grid; place-items: center;
    flex-shrink: 0;
    transition: all 120ms;
  }
  .stop-modal__close:hover { background: var(--s2); color: var(--tx); border-color: var(--line-2); }

  .stop-modal__summary {
    padding: 14px 20px;
    border-bottom: 1px solid var(--line);
    display: flex; flex-direction: column; gap: 6px;
    background: var(--brand-softer);
  }
  .summary__row {
    display: flex; align-items: baseline; justify-content: space-between;
    gap: 12px;
  }
  .summary__label {
    font: 600 11px/1.2 var(--sa);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--t3);
  }
  .summary__value {
    font: 600 13px/1.3 var(--sa);
    color: var(--tx);
    font-variant-numeric: tabular-nums;
  }
  .summary__value--big {
    font-family: var(--mo);
    font-size: 18px;
    color: var(--brand-deep);
  }

  .stop-modal__body {
    padding: 16px 20px;
    overflow: auto;
    display: flex; flex-direction: column; gap: 14px;
  }
  .field { display: flex; flex-direction: column; gap: 6px; }
  .field__label {
    font: 600 11px/1.2 var(--sa);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--t3);
  }
  .field textarea {
    appearance: none;
    padding: 10px 12px;
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: 10px;
    color: var(--tx);
    font: 500 13.5px/1.4 var(--sa);
    resize: vertical;
    min-height: 64px;
    outline: none;
    transition: border-color 140ms;
  }
  .field textarea:focus { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-line-2); }

  .link-block {
    padding: 12px 14px;
    border-radius: 10px;
    background: var(--s1);
    border: 1px solid var(--line);
    display: flex; flex-direction: column; gap: 10px;
  }
  .link-toggle {
    display: grid;
    grid-template-columns: auto 1fr;
    grid-template-rows: auto auto;
    column-gap: 10px;
    align-items: start;
    cursor: pointer;
  }
  .link-toggle input {
    grid-row: 1 / span 2;
    width: 18px; height: 18px;
    accent-color: var(--brand);
    margin-top: 2px;
  }
  .link-toggle__title {
    font: 600 13px/1.3 var(--sa);
    color: var(--tx);
  }
  .link-toggle__hint {
    font: 500 11.5px/1.3 var(--sa);
    color: var(--t3);
    margin-top: 2px;
  }
  .link-input {
    appearance: none;
    height: 36px;
    padding: 0 12px;
    background: var(--canvas-2, var(--bg));
    border: 1px solid var(--line);
    border-radius: 8px;
    color: var(--tx);
    font: 500 13px/1 var(--mo);
    outline: none;
  }
  .link-input:focus { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-line-2); }

  .stop-modal__foot {
    display: flex; justify-content: flex-end; align-items: center;
    gap: 8px;
    padding: 14px 20px;
    border-top: 1px solid var(--line);
  }

  @media (max-width: 640px) {
    .stop-modal { padding: 0; }
    .stop-modal__card { max-height: 100vh; height: 100vh; border-radius: 0; width: 100%; }
  }
</style>

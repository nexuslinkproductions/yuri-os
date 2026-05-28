<script lang="ts">
  /**
   * TrackerChip — globally visible running-timer pill (Workstream T.2).
   *
   * Mounts once in CommandBar / top-right of every authenticated layout.
   * Renders nothing when no entry is running. When running:
   *   - shows ticket code (or "untitled"), live mm:ss / h:mm:ss elapsed
   *   - left accent bar in the client's brand colour
   *   - click → opens popover with description + stop button
   *   - keyboard ⌘. anywhere on the page stops the timer
   *
   * The chip auto-attaches to the tracker store on mount; nothing else needs
   * to wire it.
   */
  import { onMount, onDestroy } from "svelte";
  import { tracker, formatHMS } from "$stores/tracker.svelte";
  import { user } from "$stores/user.svelte";
  import { GlassActionSecondary } from "$lib/components/glass";
  import { toast } from "$components/GlassToast.svelte";

  let dispose: (() => void) | null = null;
  let popoverOpen = $state(false);
  let popoverEl: HTMLDivElement | null = $state(null);

  // Resolve the client-code → colour token at runtime so the chip's accent
  // bar tints by client. Falls back to brand cyan if no client_code.
  const accent = $derived(
    tracker.running?.client_code
      ? `var(--client-${tracker.running.client_code}, var(--brand))`
      : "var(--brand)"
  );

  const ticketLabel = $derived(
    tracker.running?.plane_issue_seq
      ?? tracker.running?.description?.slice(0, 40)
      ?? "untimed"
  );

  const elapsedFmt = $derived(formatHMS(tracker.elapsed));

  async function stopNow() {
    try {
      await tracker.stop();
      popoverOpen = false;
      toast("Tracker stopped", "ok");
    } catch (e: any) {
      toast(e?.message || "Stop failed", "error");
    }
  }

  function togglePopover(e: Event) {
    e.stopPropagation();
    popoverOpen = !popoverOpen;
  }

  function onDocClick(e: MouseEvent) {
    if (!popoverEl) return;
    if (!popoverEl.contains(e.target as Node)) popoverOpen = false;
  }

  function onKeydown(e: KeyboardEvent) {
    // ⌘. or Ctrl+. → stop
    if ((e.metaKey || e.ctrlKey) && e.key === ".") {
      if (tracker.running) {
        e.preventDefault();
        stopNow();
      }
    }
    // Esc → close popover
    if (e.key === "Escape" && popoverOpen) {
      popoverOpen = false;
    }
  }

  onMount(() => {
    dispose = tracker.subscribe();
    window.addEventListener("click", onDocClick, true);
    window.addEventListener("keydown", onKeydown);
  });

  onDestroy(() => {
    window.removeEventListener("click", onDocClick, true);
    window.removeEventListener("keydown", onKeydown);
    dispose?.();
  });
</script>

{#if tracker.running}
  <div class="chip-wrap">
    <button
      type="button"
      class="chip"
      class:idle={tracker.idle}
      style={`--chip-accent: ${accent};`}
      onclick={togglePopover}
      aria-haspopup="true"
      aria-expanded={popoverOpen}
      title={tracker.idle ? "Idle detected — click to review" : "Click to view + stop"}
    >
      <span class="chip__bar" aria-hidden="true"></span>
      <span class="chip__pulse" aria-hidden="true"></span>
      <span class="chip__label">{ticketLabel}</span>
      <span class="chip__time">{elapsedFmt}</span>
      {#if tracker.idle}
        <span class="chip__idle-pill">idle</span>
      {/if}
    </button>

    {#if popoverOpen}
      <div class="popover" role="dialog" aria-label="Tracker details" bind:this={popoverEl}>
        <header class="popover__head">
          <span class="popover__eyebrow">TRACKING</span>
          <span class="popover__time">{elapsedFmt}</span>
        </header>
        <p class="popover__title">{ticketLabel}</p>
        {#if tracker.running.description}
          <p class="popover__desc">{tracker.running.description}</p>
        {/if}
        {#if tracker.running.client_code}
          <p class="popover__meta">
            <span class="popover__chip" style={`--chip-accent: ${accent};`}>{tracker.running.client_code}</span>
            <span class="popover__bill" class:is-billable={tracker.running.is_billable}>
              {tracker.running.is_billable ? "billable" : "non-billable"}
            </span>
          </p>
        {/if}
        <div class="popover__actions">
          <GlassActionSecondary tone="danger" onclick={stopNow} loading={tracker.loading}>
            {#snippet children()}Stop tracker{/snippet}
          </GlassActionSecondary>
          <span class="popover__hint">⌘ . to stop</span>
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  /* Chip — slim glass pill with live time counter + accent bar */
  .chip-wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
  }

  .chip {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 14px 6px 18px;
    border-radius: 999px;
    border: 1px solid var(--brand-line);
    background: var(--glass-card);
    backdrop-filter: var(--blur-card);
    -webkit-backdrop-filter: var(--blur-card);
    color: var(--tx);
    font: 600 12.5px/1 var(--sa);
    cursor: pointer;
    box-shadow: 0 0 0 1px rgba(0,0,0,0.04), 0 2px 10px -2px var(--brand-glow);
    transition: box-shadow 200ms var(--ease), transform 120ms var(--tier-spring);
    overflow: hidden;
    max-width: 320px;
    min-height: 32px;
  }
  .chip:hover {
    box-shadow: 0 0 0 1px rgba(0,0,0,0.06), 0 4px 18px -2px var(--brand-glow);
    transform: translateY(-1px);
  }
  .chip:active { transform: translateY(0); }
  .chip.idle { border-color: rgba(255,159,10,0.45); box-shadow: 0 0 0 1px rgba(255,159,10,0.25), 0 2px 12px rgba(255,159,10,0.30); }

  .chip__bar {
    position: absolute;
    left: 0; top: 0; bottom: 0;
    width: 4px;
    background: var(--chip-accent, var(--brand));
  }

  .chip__pulse {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: var(--chip-accent, var(--brand));
    box-shadow: 0 0 0 0 var(--chip-accent, var(--brand));
    animation: chip-pulse 2s ease-in-out infinite;
    flex-shrink: 0;
  }
  .chip.idle .chip__pulse { background: var(--or); animation: none; }

  @keyframes chip-pulse {
    0%, 100% { box-shadow: 0 0 0 0 var(--chip-accent, var(--brand)); opacity: 1; }
    50%      { box-shadow: 0 0 0 6px rgba(0,200,255,0); opacity: .55; }
  }

  .chip__label {
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
    max-width: 160px;
    color: var(--tx);
  }
  .chip__time {
    font-family: var(--mo);
    font-variant-numeric: tabular-nums;
    color: var(--brand-deep);
    font-weight: 700;
    letter-spacing: -0.01em;
  }
  .chip__idle-pill {
    padding: 2px 6px;
    border-radius: 999px;
    background: rgba(255,159,10,0.16);
    color: var(--or);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  /* Popover — open below + right-anchored to the chip */
  .popover {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    width: 320px;
    padding: 16px;
    background: var(--glass-elev);
    backdrop-filter: var(--blur-elev);
    -webkit-backdrop-filter: var(--blur-elev);
    border: 1px solid var(--line);
    border-radius: 14px;
    box-shadow: var(--sh-elev);
    z-index: var(--z-dropdown);
    animation: popover-in 180ms var(--ease) both;
  }
  @keyframes popover-in {
    from { opacity: 0; transform: translateY(-4px) scale(.97); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }

  .popover__head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
  .popover__eyebrow { font: 700 10px/1 var(--sa); letter-spacing: 0.12em; color: var(--brand-deep); }
  .popover__time {
    font-family: var(--mo);
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    font-size: 14px;
    color: var(--tx);
  }
  .popover__title { margin: 0 0 4px; font-weight: 600; font-size: 14px; color: var(--tx); }
  .popover__desc  { margin: 0 0 10px; font-size: 12.5px; color: var(--t2); line-height: 1.45; }
  .popover__meta  { display: flex; align-items: center; gap: 8px; margin: 0 0 14px; flex-wrap: wrap; }
  .popover__chip {
    position: relative;
    display: inline-flex; align-items: center;
    padding: 2px 10px 2px 14px;
    border-radius: 999px;
    background: var(--s1);
    border: 1px solid var(--b1);
    font: 600 11px/1.4 var(--sa);
    color: var(--tx);
  }
  .popover__chip::before {
    content: ""; position: absolute; left: 0; top: 0; bottom: 0;
    width: 3px; background: var(--chip-accent, var(--brand));
  }
  .popover__bill {
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--s1);
    color: var(--t3);
    font: 600 11px/1.4 var(--sa);
  }
  .popover__bill.is-billable { background: rgba(30,160,51,.12); color: var(--gr); }
  .popover__actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .popover__hint { font: 500 11px/1 var(--mo); color: var(--t3); }

  @media (max-width: 640px) {
    .chip { padding: 5px 10px 5px 14px; min-height: 28px; }
    .chip__label { max-width: 96px; }
    .popover { width: calc(100vw - 32px); right: -8px; }
  }
</style>

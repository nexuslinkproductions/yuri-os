<!--
  Sheet.svelte — Polish Sprint Eve 1.

  Right-side slide-in drawer. Same primitive family as Dialog
  (bits-ui Dialog under the hood) but positioned + animated as a
  side sheet. Used for client detail views, meeting drawers, etc.

  On mobile (≤ 720px) auto-promotes to a bottom sheet for thumb-reach.

  Usage:
    <Sheet bind:open={showSheet} title="Client detail">
      ...content...
    </Sheet>
-->
<script lang="ts">
  import { Dialog as D } from "bits-ui";
  import type { Snippet } from "svelte";

  interface Props {
    open: boolean;
    children: Snippet;
    title?: string;
    side?: "right" | "left" | "top" | "bottom";
    width?: string;       // CSS width for right/left sheets
    onClose?: () => void;
  }

  let {
    open = $bindable(false),
    children,
    title,
    side = "right",
    width = "min(420px, 100vw)",
    onClose,
  }: Props = $props();

  function handleOpenChange(v: boolean) {
    open = v;
    if (!v) onClose?.();
  }
</script>

<D.Root bind:open onOpenChange={handleOpenChange}>
  <D.Portal>
    <D.Overlay class="nex-sheet-overlay" />
    <D.Content
      class="nex-sheet-content nex-sheet-{side}"
      style="--nex-sheet-width: {width}"
    >
      {#if title}
        <header class="nex-sheet-header">
          <D.Title class="nex-sheet-title">{title}</D.Title>
          <D.Close class="nex-sheet-close" aria-label="Close">
            <span aria-hidden="true">✕</span>
          </D.Close>
        </header>
      {/if}
      <div class="nex-sheet-body">
        {@render children()}
      </div>
    </D.Content>
  </D.Portal>
</D.Root>

<style>
  :global(.nex-sheet-overlay) {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    z-index: 100;
    animation: nex-sheet-fade-in 180ms ease-out;
  }

  :global(.nex-sheet-content) {
    position: fixed;
    z-index: 101;
    background: var(--bg2);
    color: var(--tx);
    border: 1px solid var(--bd, rgba(255, 255, 255, 0.08));
    box-shadow: -20px 0 60px rgba(0, 0, 0, 0.3);
    display: flex;
    flex-direction: column;
    backdrop-filter: blur(20px) saturate(1.3);
    -webkit-backdrop-filter: blur(20px) saturate(1.3);
  }

  /* Right side (default) */
  :global(.nex-sheet-right) {
    top: 0;
    right: 0;
    bottom: 0;
    width: var(--nex-sheet-width, 420px);
    border-radius: 14px 0 0 14px;
    animation: nex-sheet-slide-right 240ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  /* Left side */
  :global(.nex-sheet-left) {
    top: 0;
    left: 0;
    bottom: 0;
    width: var(--nex-sheet-width, 420px);
    border-radius: 0 14px 14px 0;
    animation: nex-sheet-slide-left 240ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  /* Bottom (used on mobile via media query override below) */
  :global(.nex-sheet-bottom) {
    left: 0;
    right: 0;
    bottom: 0;
    max-height: 85vh;
    border-radius: 14px 14px 0 0;
    animation: nex-sheet-slide-up 240ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  /* Top */
  :global(.nex-sheet-top) {
    left: 0;
    right: 0;
    top: 0;
    max-height: 85vh;
    border-radius: 0 0 14px 14px;
    animation: nex-sheet-slide-down 240ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  /* Mobile: promote right/left sheets to bottom-sheet for thumb reach */
  @media (max-width: 720px) {
    :global(.nex-sheet-right),
    :global(.nex-sheet-left) {
      top: auto;
      left: 0;
      right: 0;
      bottom: 0;
      width: 100%;
      max-height: 85vh;
      border-radius: 14px 14px 0 0;
      animation: nex-sheet-slide-up 240ms cubic-bezier(0.22, 1, 0.36, 1);
    }
  }

  .nex-sheet-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.9rem 1.25rem;
    border-bottom: 1px solid var(--bd, rgba(255, 255, 255, 0.06));
    flex-shrink: 0;
  }

  :global(.nex-sheet-title) {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--tx);
  }

  :global(.nex-sheet-close) {
    background: transparent;
    border: none;
    color: var(--tx2);
    font-size: 1.1rem;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s, color 0.15s;
  }
  :global(.nex-sheet-close:hover) {
    background: var(--bg3, rgba(255, 255, 255, 0.05));
    color: var(--tx);
  }
  :global(.nex-sheet-close:focus-visible) {
    outline: 2px solid var(--a);
    outline-offset: 2px;
  }

  .nex-sheet-body {
    flex: 1;
    overflow-y: auto;
    padding: 1.25rem;
  }

  @keyframes nex-sheet-fade-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes nex-sheet-slide-right {
    from { opacity: 0; transform: translateX(20px); }
    to   { opacity: 1; transform: translateX(0); }
  }
  @keyframes nex-sheet-slide-left {
    from { opacity: 0; transform: translateX(-20px); }
    to   { opacity: 1; transform: translateX(0); }
  }
  @keyframes nex-sheet-slide-up {
    from { opacity: 0; transform: translateY(20px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes nex-sheet-slide-down {
    from { opacity: 0; transform: translateY(-20px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.nex-sheet-overlay),
    :global(.nex-sheet-content) {
      animation: none;
    }
  }
</style>

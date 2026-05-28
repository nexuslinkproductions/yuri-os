<!--
  Dialog.svelte — Polish Sprint Eve 1.

  Accessible modal dialog built on bits-ui Dialog primitives. Styled
  with the c2moviez design tokens (--bg2, --bd, --tx, etc.) so it
  inherits the existing glassmorphism aesthetic without any Tailwind
  dependency.

  Usage:
    <Dialog bind:open={showDialog}>
      <DialogTitle>Confirm</DialogTitle>
      <DialogDescription>Are you sure?</DialogDescription>
      <DialogFooter>
        <button onclick={() => showDialog = false}>Cancel</button>
        <button class="primary" onclick={confirm}>OK</button>
      </DialogFooter>
    </Dialog>

  Accessibility:
    - Focus trapped within while open
    - Escape closes
    - Tab cycles only inside
    - aria-labelledby / aria-describedby auto-wired
    - prefers-reduced-motion respected
-->
<script lang="ts">
  import { Dialog as D } from "bits-ui";
  import type { Snippet } from "svelte";

  interface Props {
    open: boolean;
    children: Snippet;
    title?: string;
    description?: string;
    onClose?: () => void;
  }

  let { open = $bindable(false), children, title, description, onClose }: Props = $props();

  function handleOpenChange(v: boolean) {
    open = v;
    if (!v) onClose?.();
  }
</script>

<D.Root bind:open onOpenChange={handleOpenChange}>
  <D.Portal>
    <D.Overlay class="nex-dialog-overlay" />
    <D.Content class="nex-dialog-content">
      {#if title}
        <D.Title class="nex-dialog-title">{title}</D.Title>
      {/if}
      {#if description}
        <D.Description class="nex-dialog-desc">{description}</D.Description>
      {/if}
      {@render children()}
    </D.Content>
  </D.Portal>
</D.Root>

<style>
  /* Use :global so bits-ui's rendered nodes pick these up */
  :global(.nex-dialog-overlay) {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    z-index: 100;
    animation: nex-dialog-fade-in 160ms ease-out;
  }

  :global(.nex-dialog-content) {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 101;
    max-width: min(480px, calc(100vw - 2rem));
    background: var(--bg2);
    color: var(--tx);
    border: 1px solid var(--bd, rgba(255, 255, 255, 0.08));
    border-radius: 14px;
    padding: 1.25rem 1.5rem;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
    animation: nex-dialog-slide-in 200ms cubic-bezier(0.22, 1, 0.36, 1);
    backdrop-filter: blur(20px) saturate(1.3);
    -webkit-backdrop-filter: blur(20px) saturate(1.3);
  }

  :global(.nex-dialog-title) {
    font-size: 1.05rem;
    font-weight: 600;
    margin: 0 0 0.4rem;
    color: var(--tx);
  }

  :global(.nex-dialog-desc) {
    font-size: 0.88rem;
    color: var(--tx2);
    margin: 0 0 1rem;
    line-height: 1.45;
  }

  @keyframes nex-dialog-fade-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes nex-dialog-slide-in {
    from { opacity: 0; transform: translate(-50%, calc(-50% + 8px)); }
    to   { opacity: 1; transform: translate(-50%, -50%); }
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.nex-dialog-overlay),
    :global(.nex-dialog-content) {
      animation: none;
    }
  }
</style>

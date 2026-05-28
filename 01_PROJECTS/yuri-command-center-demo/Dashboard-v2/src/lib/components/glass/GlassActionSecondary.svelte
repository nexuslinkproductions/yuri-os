<script lang="ts">
  /**
   * GlassActionSecondary — Tier 2 (standard) action.
   *
   * Use for ordinary clickable actions: "Save", "Cancel", "Open in Plane",
   * "Copy to clipboard", "Add note". Glass-thin surface, hairline border,
   * lifts on hover. ≤ 3 in the primary action zone of a surface.
   *
   * Variant `kind="icon"` makes it a 44×44 circle for icon-only buttons
   * (sidebar avatar, drag handle, card quick-actions).
   *
   * Visual recipe in `.btn--l2` in `lib/styles/design-system.css`.
   */
  import type { Snippet } from "svelte";

  interface Props {
    onclick?: (e: MouseEvent) => void;
    href?: string;
    target?: string;
    type?: "button" | "submit" | "reset";
    disabled?: boolean;
    loading?: boolean;
    tone?: "default" | "success" | "warn" | "danger";
    kind?: "default" | "icon";
    title?: string;
    ariaLabel?: string;
    fullWidth?: boolean;
    icon?: Snippet;
    children?: Snippet;
  }

  const {
    onclick, href, target, type = "button",
    disabled = false, loading = false,
    tone = "default", kind = "default",
    title, ariaLabel, fullWidth = false,
    icon, children,
  }: Props = $props();

  const isLink = $derived(href !== undefined && href !== "");
  const effectiveDisabled = $derived(disabled || loading);

  function handleClick(e: MouseEvent) {
    if (effectiveDisabled) { e.preventDefault(); return; }
    onclick?.(e);
  }
</script>

{#if isLink}
  <a
    class="btn--l2"
    class:btn--l2-fullwidth={fullWidth}
    data-tone={tone}
    data-kind={kind}
    href={effectiveDisabled ? undefined : href}
    target={target}
    rel={target === "_blank" ? "noopener" : undefined}
    aria-disabled={effectiveDisabled || undefined}
    aria-label={ariaLabel}
    title={title}
    onclick={handleClick}
  >
    {#if loading}
      <span class="btn__spinner" aria-hidden="true"></span>
    {:else if icon}
      {@render icon()}
    {/if}
    {#if children}<span class="btn__label">{@render children()}</span>{/if}
  </a>
{:else}
  <button
    class="btn--l2"
    class:btn--l2-fullwidth={fullWidth}
    data-tone={tone}
    data-kind={kind}
    type={type}
    disabled={effectiveDisabled}
    aria-label={ariaLabel}
    title={title}
    onclick={handleClick}
  >
    {#if loading}
      <span class="btn__spinner" aria-hidden="true"></span>
    {:else if icon}
      {@render icon()}
    {/if}
    {#if children}<span class="btn__label">{@render children()}</span>{/if}
  </button>
{/if}

<style>
  .btn--l2-fullwidth { width: 100%; }
  .btn__label { display: inline-flex; align-items: center; gap: 4px; }

  .btn__spinner {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 1.5px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin-l2 600ms linear infinite;
    opacity: .8;
  }
  @keyframes spin-l2 { to { transform: rotate(360deg); } }

  @media (prefers-reduced-motion: reduce) {
    .btn__spinner { animation-duration: 1200ms; }
  }
</style>

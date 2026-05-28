<script lang="ts">
  /**
   * GlassActionPrimary — Tier 1 (hero) action.
   *
   * Use for the SINGLE most important action on a surface: "Start tracker",
   * "Submit plan", "Approve", "Generate with Claude AI", "Save permission",
   * "Send via M365". Brand-tinted with the signature outer glow. Spring-press.
   *
   * Counting rule: at most ONE per surface. If you want two L1 buttons, one
   * of them belongs as L2 — see design-system.css for the full discipline.
   *
   * The visual recipe is owned by `.btn--l1` in `lib/styles/design-system.css`;
   * this component owns the API + a11y semantics + loading state.
   */
  import type { Snippet } from "svelte";

  interface Props {
    onclick?: (e: MouseEvent) => void;
    href?: string;                // when set, renders as <a>
    target?: string;              // anchor target
    type?: "button" | "submit" | "reset";  // when rendering as <button>
    disabled?: boolean;
    loading?: boolean;            // shows a spinner + disables click
    tone?: "default" | "success" | "warn" | "danger";
    title?: string;
    ariaLabel?: string;
    fullWidth?: boolean;
    icon?: Snippet;
    children: Snippet;
  }

  const {
    onclick, href, target, type = "button",
    disabled = false, loading = false, tone = "default",
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
    class="btn--l1"
    class:btn--l1-fullwidth={fullWidth}
    data-tone={tone}
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
    <span class="btn__label">{@render children()}</span>
  </a>
{:else}
  <button
    class="btn--l1"
    class:btn--l1-fullwidth={fullWidth}
    data-tone={tone}
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
    <span class="btn__label">{@render children()}</span>
  </button>
{/if}

<style>
  /* All visual recipe lives in design-system.css under .btn--l1.
     Only structure + spinner live here. */
  .btn--l1-fullwidth { width: 100%; }

  .btn__label { display: inline-flex; align-items: center; gap: 4px; }

  .btn__spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 600ms linear infinite;
    opacity: .8;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  @media (prefers-reduced-motion: reduce) {
    .btn__spinner { animation-duration: 1200ms; }
  }
</style>

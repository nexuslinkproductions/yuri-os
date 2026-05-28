<script lang="ts">
  /**
   * GlassInlineLink — Tier 4 (quiet inline link).
   *
   * Body-text-embedded action with minimum visual weight: URLs in metadata,
   * email links, "see all" footer links. Underline on hover only.
   *
   * Visual recipe in `.link--l4` in `lib/styles/design-system.css`.
   */
  import type { Snippet } from "svelte";

  interface Props {
    href?: string;
    target?: string;
    onclick?: (e: MouseEvent) => void;
    title?: string;
    ariaLabel?: string;
    children: Snippet;
  }

  const { href, target, onclick, title, ariaLabel, children }: Props = $props();
  const isLink = $derived(href !== undefined && href !== "");
</script>

{#if isLink}
  <a
    class="link--l4"
    href={href}
    target={target}
    rel={target === "_blank" ? "noopener" : undefined}
    title={title}
    aria-label={ariaLabel}
    onclick={onclick}
  >{@render children()}</a>
{:else}
  <button
    class="link--l4"
    type="button"
    title={title}
    aria-label={ariaLabel}
    onclick={onclick}
  >{@render children()}</button>
{/if}

<style>
  /* button reset so it inherits the link recipe */
  button.link--l4 {
    background: none;
    border: 0;
    padding: 0;
    font: inherit;
    cursor: pointer;
  }
</style>

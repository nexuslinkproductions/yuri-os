<script lang="ts">
  /**
   * GlassValueChip — Tier 3 (value chip / pill).
   *
   * Clickable values: status pills, priority badges, lifecycle chips, ticket
   * IDs, client codes, tags, contract status, language. The left-edge accent
   * bar is the visual signal that the chip is clickable.
   *
   * Tone shortcuts (success/warn/danger/info/violet/neutral) match the design
   * system's semantic palette and set both accent bar + tint. For arbitrary
   * accents (e.g. a client code), pass `accent="#hex"` or `accent="var(--client-SHI)"`.
   *
   * Visual recipe in `.chip--l3` in `lib/styles/design-system.css`.
   */
  import type { Snippet } from "svelte";

  type Tone = "success" | "warn" | "danger" | "info" | "violet" | "neutral";

  interface Props {
    onclick?: (e: MouseEvent | KeyboardEvent) => void;
    href?: string;
    target?: string;
    tone?: Tone;
    accent?: string;             // arbitrary CSS colour or var() — wins over tone preset
    size?: "sm" | "md" | "lg";
    static?: boolean;            // non-clickable display variant
    title?: string;
    ariaLabel?: string;
    icon?: Snippet;
    children: Snippet;
  }

  const {
    onclick, href, target,
    tone, accent, size = "md",
    static: isStatic = false,
    title, ariaLabel,
    icon, children,
  }: Props = $props();

  const isLink = $derived(href !== undefined && href !== "");

  function handleClick(e: MouseEvent | KeyboardEvent) {
    if (isStatic) return;
    onclick?.(e);
  }
  function handleKey(e: KeyboardEvent) {
    if (isStatic) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onclick?.(e);
    }
  }

  // Style for arbitrary accent — wins over tone preset
  const accentStyle = $derived(accent ? `--chip-accent: ${accent};` : "");
</script>

{#if isLink}
  <a
    class="chip--l3"
    data-tone={tone}
    data-size={size}
    data-static={isStatic ? "true" : undefined}
    href={href}
    target={target}
    rel={target === "_blank" ? "noopener" : undefined}
    style={accentStyle}
    title={title}
    aria-label={ariaLabel}
    onclick={handleClick}
  >
    {#if icon}<span class="chip__icon">{@render icon()}</span>{/if}
    <span class="chip__label">{@render children()}</span>
  </a>
{:else if isStatic}
  <span
    class="chip--l3"
    data-tone={tone}
    data-size={size}
    data-static="true"
    style={accentStyle}
    title={title}
  >
    {#if icon}<span class="chip__icon">{@render icon()}</span>{/if}
    <span class="chip__label">{@render children()}</span>
  </span>
{:else}
  <button
    class="chip--l3"
    type="button"
    data-tone={tone}
    data-size={size}
    style={accentStyle}
    title={title}
    aria-label={ariaLabel}
    onclick={handleClick}
    onkeydown={handleKey}
  >
    {#if icon}<span class="chip__icon">{@render icon()}</span>{/if}
    <span class="chip__label">{@render children()}</span>
  </button>
{/if}

<style>
  /* visual recipe owned by .chip--l3 in design-system.css; only structure
     niceties live here */
  .chip__icon { display: inline-flex; align-items: center; opacity: .8; }
  .chip__label { display: inline-flex; align-items: center; }

  /* Reset native button to inherit chip recipe */
  button.chip--l3 { border-style: solid; }
  a.chip--l3 { text-decoration: none; }
</style>

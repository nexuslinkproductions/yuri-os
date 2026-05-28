<script lang="ts">
  interface Props {
    variant?: "thin" | "regular" | "thick";
    hover?: boolean;
    press?: boolean;
    glow?: boolean;
    padding?: number | string;
    gap?: number | string;
    idx?: number;
    as?: keyof HTMLElementTagNameMap;
    class?: string;
    onclick?: (e: MouseEvent) => void;
    children?: import("svelte").Snippet;
  }

  let {
    variant = "regular",
    hover = false,
    press = false,
    glow = false,
    padding = 20,
    gap = 12,
    idx,
    as = "div",
    class: klass = "",
    onclick,
    children,
  }: Props = $props();

  const styleStr = $derived(
    `padding:${typeof padding === "number" ? `${padding}px` : padding};` +
    `gap:${typeof gap === "number" ? `${gap}px` : gap};` +
    (idx !== undefined ? `--idx:${idx};` : ""),
  );
</script>

<svelte:element
  this={as}
  class={`glass ${variant === "thin" ? "glass--thin" : variant === "thick" ? "glass--thick" : ""} ${hover ? "glass-hover" : ""} ${press ? "glass-press" : ""} ${glow ? "glass-pulse" : ""} ${idx !== undefined ? "enter-up" : ""} ${klass}`.trim()}
  style={styleStr}
  {onclick}
  role={onclick ? "button" : undefined}
  tabindex={onclick ? 0 : undefined}
>
  {@render children?.()}
</svelte:element>

<style>
  :global(.glass) {
    display: flex;
    flex-direction: column;
  }
</style>

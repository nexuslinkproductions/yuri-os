<script lang="ts">
  import { untrack } from "svelte";
  import Sparkline from "./Sparkline.svelte";

  interface Props {
    label: string;
    value: number | string;
    unit?: string;
    sub?: string;
    delta?: number | null;
    tone?: "default" | "ok" | "warn" | "error";
    idx?: number;
    pulse?: boolean;
    trend?: number[];
    onclick?: (e: MouseEvent) => void;
  }

  let { label, value, unit = "", sub = "", delta = null, tone = "default", idx, pulse = false, trend, onclick }: Props = $props();

  // Non-reactive mirror of the currently-displayed numeric value so the
  // animation read inside $effect does NOT re-trigger the effect.
  let displayNumber = typeof value === "number" ? value : NaN;
  let displayText = $state<string>(formatNum(value));
  let isAnimating = $state(false);
  let rafId: number | null = null;

  function formatNum(v: number | string): string {
    if (typeof v !== "number" || !Number.isFinite(v)) return String(v ?? "");
    // Swiss thousands separator, drop trailing .00
    const abs = Math.abs(v);
    if (abs >= 10000) return Math.round(v).toLocaleString("de-CH");
    if (Number.isInteger(v)) return v.toLocaleString("de-CH");
    return v.toLocaleString("de-CH", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  $effect(() => {
    // Depend on `value` only. All reads/writes to displayNumber / displayText
    // go through untrack so we never self-trigger.
    const v = value;

    if (typeof v !== "number" || !Number.isFinite(v)) {
      untrack(() => {
        displayText = String(v ?? "");
        displayNumber = NaN;
      });
      return;
    }

    const from = untrack(() => (Number.isFinite(displayNumber) ? displayNumber : 0));
    const to = v;

    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }

    if (from === to) {
      untrack(() => { displayText = formatNum(to); displayNumber = to; });
      return;
    }

    isAnimating = true;
    const start = performance.now();
    const dur = 600;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      const cur = from + (to - from) * eased;
      untrack(() => {
        displayNumber = cur;
        displayText = formatNum(cur);
      });
      if (p < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        untrack(() => { displayNumber = to; displayText = formatNum(to); });
        isAnimating = false;
        rafId = null;
      }
    };
    rafId = requestAnimationFrame(tick);
  });

  const toneColor = $derived(
    tone === "ok"    ? "var(--gr)" :
    tone === "warn"  ? "var(--ye)" :
    tone === "error" ? "var(--re)" : "var(--tx)",
  );
</script>

<button
  type="button"
  class="stat glass glass-hover {pulse ? 'glass-pulse' : ''} {isAnimating ? 'rt-flash' : ''} {idx !== undefined ? 'enter-up' : ''} {onclick ? 'clickable' : ''}"
  style={idx !== undefined ? `--idx:${idx}` : ""}
  onclick={onclick}
  disabled={!onclick}
>
  <span class="label caption">{label}</span>
  <span class="value font-display" class:bump={isAnimating} style={`color:${toneColor}`}>
    {displayText}{unit ? ` ${unit}` : ""}
  </span>
  {#if sub}
    <span class="sub caption">{sub}</span>
  {/if}
  {#if delta !== null && delta !== undefined}
    <span class="delta {delta > 0 ? 'pos' : delta < 0 ? 'neg' : 'zero'}">
      {delta > 0 ? "▲" : delta < 0 ? "▼" : "·"} {Math.abs(delta)}
    </span>
  {/if}

  {#if trend && trend.length >= 2}
    <div class="spark-row">
      <Sparkline data={trend} width={72} height={22} />
    </div>
  {/if}
</button>

<style>
  .stat {
    all: unset;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 18px 20px;
    cursor: default;
    align-items: flex-start;
    min-width: 0;
  }
  .stat.clickable { cursor: pointer; }
  .stat:not(.clickable):disabled { opacity: 1; }

  .label { margin-bottom: 2px; }
  .value {
    font-size: 30px;
    font-weight: 500;
    line-height: 1.05;
    letter-spacing: -0.02em;
    transition: transform 180ms var(--ease-spring);
    font-variant-numeric: tabular-nums;
  }
  .value.bump { transform: scale(1.03); }

  .delta {
    font-family: "JetBrains Mono", monospace;
    font-size: 11px;
    letter-spacing: 0.05em;
  }
  .delta.pos  { color: var(--gr); }
  .delta.neg  { color: var(--re); }
  .delta.zero { color: var(--t3); }

  .sub {
    color: var(--t3);
    font-size: 11px;
    line-height: 1.3;
    margin-top: 2px;
  }

  .spark-row {
    margin-top: 4px;
    opacity: 0.85;
  }
</style>

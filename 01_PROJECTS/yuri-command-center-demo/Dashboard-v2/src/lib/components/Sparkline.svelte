<script lang="ts">
  /**
   * Sparkline — inline SVG micro-chart. Drop it anywhere a trend matters.
   * Props:
   *   data    — array of numbers (at least 2)
   *   width   — SVG width in px (default 64)
   *   height  — SVG height in px (default 24)
   *   color   — override line color (default: auto from trend)
   *   filled  — show gradient fill (default true)
   *   dot     — show endpoint dot (default true)
   */
  interface Props {
    data: number[];
    width?: number;
    height?: number;
    color?: string;
    filled?: boolean;
    dot?: boolean;
    class?: string;
  }

  let {
    data,
    width = 64,
    height = 24,
    color,
    filled = true,
    dot = true,
    class: klass = "",
  }: Props = $props();

  const PAD = 2;

  const points = $derived.by(() => {
    if (!data || data.length < 2) return [];
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const w = width - PAD * 2;
    const h = height - PAD * 2;
    return data.map((v, i) => ({
      x: PAD + (i / (data.length - 1)) * w,
      y: PAD + h - ((v - min) / range) * h,
    }));
  });

  const polyline = $derived(points.map(p => `${p.x},${p.y}`).join(" "));

  const fillD = $derived.by(() => {
    if (points.length < 2) return "";
    const ptStr = points.map(p => `${p.x},${p.y}`).join(" L");
    const last = points[points.length - 1];
    const first = points[0];
    return `M${ptStr} L${last.x},${height - PAD} L${first.x},${height - PAD} Z`;
  });

  const trend = $derived.by(() => {
    if (data.length < 2) return "flat";
    const first = data[0];
    const last  = data[data.length - 1];
    if (last > first * 1.01) return "up";
    if (last < first * 0.99) return "down";
    return "flat";
  });

  const lineColor = $derived(
    color ??
    (trend === "up"   ? "var(--gr)"  :
     trend === "down" ? "var(--re)"  : "var(--t3)"),
  );

  const gradId = $derived(`spark-${Math.random().toString(36).slice(2, 7)}`);
</script>

{#if points.length >= 2}
  <svg
    {width}
    {height}
    viewBox="0 0 {width} {height}"
    class="sparkline {klass}"
    aria-hidden="true"
    style="overflow:visible;display:block;flex-shrink:0;"
  >
    <defs>
      <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color={lineColor} stop-opacity="0.3" />
        <stop offset="100%" stop-color={lineColor} stop-opacity="0" />
      </linearGradient>
    </defs>

    {#if filled}
      <path d={fillD} fill="url(#{gradId})" />
    {/if}

    <polyline
      points={polyline}
      fill="none"
      stroke={lineColor}
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      vector-effect="non-scaling-stroke"
    />

    {#if dot}
      {@const last = points[points.length - 1]}
      <circle
        cx={last.x}
        cy={last.y}
        r="2.5"
        fill={lineColor}
        stroke="var(--bg)"
        stroke-width="1.5"
      />
    {/if}
  </svg>
{/if}

<style>
  .sparkline { display: block; }
</style>

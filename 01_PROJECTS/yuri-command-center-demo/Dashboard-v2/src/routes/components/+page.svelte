<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { browser } from "$app/environment";
  import { env as publicEnv } from "$env/dynamic/public";
  import GlassCard from "$components/GlassCard.svelte";
  import GlassStat from "$components/GlassStat.svelte";
  import LiveBadge from "$components/LiveBadge.svelte";
  import { toast } from "$components/GlassToast.svelte";

  const devEnabled = publicEnv.PUBLIC_DEV === "1";
  onMount(() => {
    if (browser && !devEnabled) goto("/", { replaceState: true });
  });
</script>

{#if !devEnabled}
  <p class="body" style="padding: 40px 0; text-align: center; color: var(--t2);">
    Dev showcase hidden. Set <code>PUBLIC_DEV=1</code> to view. Redirecting…
  </p>
{:else}

<header class="row between items-center wrap gap-4">
  <div class="stack gap-1">
    <span class="caption">99 · COMPONENTS</span>
    <h1 class="h1 font-display">Design system showcase</h1>
    <p class="body">All glass primitives, all states, all in one place.</p>
  </div>
  <LiveBadge />
</header>

<section class="stack gap-4">
  <h2 class="h2 font-display">Glass cards · variants</h2>
  <div class="grid">
    <GlassCard idx={0} variant="thin"><span class="caption">THIN</span><h3 class="h3">glass--thin</h3><p class="body small">Light backdrop blur, low opacity surface.</p></GlassCard>
    <GlassCard idx={1}><span class="caption">REGULAR</span><h3 class="h3">glass</h3><p class="body small">Default visionOS surface with blur(22px) and saturate(150%).</p></GlassCard>
    <GlassCard idx={2} variant="thick"><span class="caption">THICK</span><h3 class="h3">glass--thick</h3><p class="body small">Deep blur, more opacity. Use for modals, drawers, sidebars.</p></GlassCard>
    <GlassCard idx={3} hover><span class="caption">HOVER</span><h3 class="h3">glass-hover</h3><p class="body small">Lifts on hover, shadow deepens.</p></GlassCard>
    <GlassCard idx={4} hover press><span class="caption">PRESS</span><h3 class="h3">glass-press</h3><p class="body small">Scales down on click — tactile.</p></GlassCard>
    <GlassCard idx={5} glow><span class="caption">PULSE</span><h3 class="h3">glass-pulse</h3><p class="body small">Cyan ring pulses on data update.</p></GlassCard>
  </div>

  <h2 class="h2 font-display">Stats</h2>
  <div class="kpi-grid">
    <GlassStat label="DEFAULT"  value={42}  idx={0} />
    <GlassStat label="OK"       value={88}  unit="%" tone="ok"     idx={1} />
    <GlassStat label="WARN"     value={3}            tone="warn"   idx={2} />
    <GlassStat label="ERROR"    value={9}            tone="error"  idx={3} />
    <GlassStat label="WITH Δ"   value={104} delta={5} tone="ok"   idx={4} />
    <GlassStat label="DROPPING" value={37}  delta={-12}            idx={5} />
  </div>

  <h2 class="h2 font-display">Chips</h2>
  <div class="row gap-2 wrap">
    <span class="chip"><span class="chip-dot"></span>default</span>
    <span class="chip ok"><span class="chip-dot"></span>ok</span>
    <span class="chip warn"><span class="chip-dot"></span>warn</span>
    <span class="chip error"><span class="chip-dot"></span>error</span>
    <span class="chip urgent">URGENT</span>
  </div>

  <h2 class="h2 font-display">Toast</h2>
  <div class="row gap-2 wrap">
    <button class="cta glass-press" onclick={() => toast("Heads up", "info")}>Info toast</button>
    <button class="cta glass-press" onclick={() => toast("Saved", "ok")}>OK toast</button>
    <button class="cta glass-press" onclick={() => toast("Slow connection", "warn")}>Warn toast</button>
    <button class="cta glass-press" onclick={() => toast("Plane API failed", "error")}>Error toast</button>
  </div>

  <h2 class="h2 font-display">Typography</h2>
  <GlassCard idx={6}>
    <span class="caption">EYEBROW · ALL CAPS</span>
    <h1 class="h1 font-display">Headline · Space Grotesk</h1>
    <h2 class="h2 font-display">Section · h2</h2>
    <h3 class="h3 font-display">Subsection · h3</h3>
    <p class="body">Body text uses Inter for readability. Long-form like this paragraph sits at 14.5px / 1.55 with optical kerning enabled by Inter's stylistic sets.</p>
    <p class="font-editorial" style="font-size:24px">Editorial · DM Serif Display</p>
    <code class="font-mono">font-mono · JetBrains Mono · ligatures off · 12.5px</code>
  </GlassCard>
</section>
{/if}

<style>
  .grid       { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
  .kpi-grid   { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; }
  .cta {
    all: unset;
    cursor: pointer;
    padding: 10px 16px;
    border: 1px solid var(--b2);
    border-radius: var(--r-md);
    background: var(--s1);
    font-family: "Space Grotesk", sans-serif;
    color: var(--t2);
    font-size: 13px;
    transition: background var(--dur-fast) var(--ease-out);
  }
  .cta:hover { background: var(--s2); color: var(--tx); }
</style>

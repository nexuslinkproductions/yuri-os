<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import {
    recentReasoningEdges,
    recentReasoningThoughts,
    subscribeReasoningEdges,
    subscribeReasoningThoughts,
    hasClient,
    type ReasoningEdge,
    type ReasoningThought,
  } from "$lib/db";
  import GlassCard from "$components/GlassCard.svelte";
  import GlassStat from "$components/GlassStat.svelte";
  import LiveBadge from "$components/LiveBadge.svelte";

  let edges = $state<ReasoningEdge[]>([]);
  let thoughts = $state<ReasoningThought[]>([]);
  let loading = $state(true);
  let realtime = $state(false);
  let unsubE: (() => void) | null = null;
  let unsubT: (() => void) | null = null;
  let svgEl: SVGSVGElement | null = $state(null);
  let timeRange = $state<"1h" | "24h" | "7d">("24h");
  let actorFilter = $state<string>("");
  let edgeKindFilter = $state<string>("");
  let chainHighlight = $state<string>("");
  let colorMode = $state<"type" | "chain">("type");
  let focusedNodeId = $state<string | null>(null);
  let focusedNodeInfo = $state<any>(null);
  let replayChainId = $state<string | null>(null);
  let replayStep = $state(0);
  let replayTimer: ReturnType<typeof setInterval> | null = null;

  // d3 instance loaded from CDN at runtime — keeps bundle small
  let d3: any = $state(null);

  // Categorical palette is centralized in tokens.css under
  // `/* Graph categorical palette */`. We resolve via CSS custom props so
  // theme changes (data-theme="dark"/"light"/"c2m-light") apply automatically.
  // Keys remain here as the source of truth for iteration order + UI labels;
  // hex values live exclusively in tokens.css.
  const EDGE_KINDS = [
    "trigger", "premise", "inference", "action",
    "artifact", "correction", "dependency",
  ] as const;
  const NODE_TYPES = [
    "thought", "decision", "agent", "tg_msg", "client", "ticket",
    "commitment", "doc", "tool_call", "audit", "signal", "cron",
  ] as const;

  function cssVar(name: string, fallback: string): string {
    if (typeof window === "undefined" || typeof document === "undefined") return fallback;
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }
  // Note: tg_msg / tool_call use hyphenated token names (--graph-node-tg-msg).
  function nodeTokenName(type: string): string { return `--graph-node-${type.replace(/_/g, "-")}`; }
  function edgeTokenName(kind: string): string { return `--graph-edge-${kind.replace(/_/g, "-")}`; }

  // Reactive maps — re-resolved on theme change via the keyed access pattern.
  const EDGE_COLORS: Record<string, string> = $derived.by(() => {
    const map: Record<string, string> = {};
    for (const k of EDGE_KINDS) map[k] = cssVar(edgeTokenName(k), "#cbd5e1");
    return map;
  });
  const NODE_COLORS: Record<string, string> = $derived.by(() => {
    const map: Record<string, string> = {};
    for (const k of NODE_TYPES) map[k] = cssVar(nodeTokenName(k), "#cbd5e1");
    return map;
  });

  // Stable color from chain UUID for cluster mode
  function chainColor(chainId: string): string {
    let h = 0;
    for (let i = 0; i < chainId.length; i++) h = (h * 31 + chainId.charCodeAt(i)) | 0;
    const hue = Math.abs(h) % 360;
    return `hsl(${hue}, 70%, 60%)`;
  }

  function nodeColor(d: any) {
    if (colorMode === "chain" && d.chain_id) return chainColor(d.chain_id);
    return NODE_COLORS[d.type] || cssVar("--graph-node-default", "#cbd5e1");
  }
  function edgeColor(d: any) {
    if (colorMode === "chain" && d.chain_id) return chainColor(d.chain_id);
    return EDGE_COLORS[d.kind] || cssVar("--graph-edge-default", "#cbd5e1");
  }

  function nodeSourceUrl(d: any): string | null {
    if (d.type === "tg_msg" && d.label) {
      // Telegram doesn't have a stable web URL per msg in private chats — link to chat
      return `https://t.me/c2m_coo_bot`;
    }
    if (d.type === "ticket" && d.label) {
      return `https://app.plane.so/c2moviez/projects?identifier=${encodeURIComponent(d.label)}`;
    }
    if (d.type === "doc" && d.label) {
      return `vscode://file/Users/ic2m/Documents/c2moviez/APP/${d.label}`;
    }
    if (d.type === "client" && d.label) {
      return `/clients/${encodeURIComponent(d.label)}`;
    }
    return null;
  }

  onMount(async () => {
    try {
      // @ts-expect-error — dynamic CDN import, no types
      d3 = await import(/* @vite-ignore */ "https://cdn.jsdelivr.net/npm/d3@7/+esm");
    } catch (e) {
      console.error("Failed to load d3", e);
    }
    edges    = await recentReasoningEdges(500);
    thoughts = await recentReasoningThoughts(500);
    loading = false;
    unsubE = subscribeReasoningEdges(row => {
      realtime = true;
      edges = [row, ...edges].slice(0, 500);
    });
    unsubT = subscribeReasoningThoughts(row => {
      realtime = true;
      thoughts = [row, ...thoughts].slice(0, 500);
    });
    setTimeout(() => { if (hasClient()) realtime = true; }, 1500);
  });

  onDestroy(() => {
    unsubE?.(); unsubT?.();
    if (replayTimer) clearInterval(replayTimer);
  });

  const cutoffMs = $derived(
    timeRange === "1h"  ? 60 * 60 * 1000 :
    timeRange === "24h" ? 24 * 60 * 60 * 1000 :
                          7 * 24 * 60 * 60 * 1000
  );

  const filteredEdges = $derived((() => {
    const since = Date.now() - cutoffMs;
    return edges.filter(e => {
      if (new Date(e.created_at).getTime() < since) return false;
      if (actorFilter && e.actor !== actorFilter) return false;
      if (edgeKindFilter && e.edge_kind !== edgeKindFilter) return false;
      if (chainHighlight && e.chain_id !== chainHighlight) return false;
      return true;
    });
  })());

  const filteredThoughts = $derived((() => {
    const since = Date.now() - cutoffMs;
    return thoughts.filter(t => {
      if (new Date(t.created_at).getTime() < since) return false;
      if (actorFilter && t.actor !== actorFilter) return false;
      if (chainHighlight && t.chain_id !== chainHighlight) return false;
      return true;
    });
  })());

  const _thoughtIndexByChain = $derived((() => {
    const m = new Map<string, ReasoningThought[]>();
    for (const t of filteredThoughts) {
      if (!m.has(t.chain_id)) m.set(t.chain_id, []);
      m.get(t.chain_id)!.push(t);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.created_at.localeCompare(b.created_at));
    return m;
  })());

  function thoughtRefIndex(t: ReasoningThought): number {
    const arr = _thoughtIndexByChain.get(t.chain_id) || [];
    return arr.findIndex(x => x.id === t.id) + 1;
  }

  // Replay-aware filtering: in replay mode, only show edges up to replayStep within the chain
  const graph = $derived((() => {
    const nodeMap = new Map<string, any>();
    const links: any[] = [];

    let edgesToRender = filteredEdges;
    let thoughtsToRender = filteredThoughts;

    if (replayChainId) {
      const chainThoughts = thoughts.filter(t => t.chain_id === replayChainId).sort((a, b) => a.created_at.localeCompare(b.created_at));
      const chainEdges    = edges.filter(e => e.chain_id === replayChainId).sort((a, b) => a.created_at.localeCompare(b.created_at));
      thoughtsToRender = chainThoughts.slice(0, Math.min(replayStep, chainThoughts.length));
      edgesToRender    = chainEdges.slice(0, Math.max(0, replayStep - chainThoughts.length));
    }

    for (const t of thoughtsToRender) {
      const id = `thought:${t.chain_id}:t${thoughtRefIndex(t)}`;
      nodeMap.set(id, {
        id,
        type: "thought",
        kind: t.kind,
        label: t.content.slice(0, 50),
        full: t.content,
        chain_id: t.chain_id,
        actor: t.actor,
        created_at: t.created_at,
      });
    }

    for (const e of edgesToRender) {
      const fromId = e.from_type === "thought" ? `thought:${e.chain_id}:${e.from_id}` : `${e.from_type}:${e.from_id}`;
      const toId   = e.to_type   === "thought" ? `thought:${e.chain_id}:${e.to_id}`   : `${e.to_type}:${e.to_id}`;
      if (!nodeMap.has(fromId)) nodeMap.set(fromId, { id: fromId, type: e.from_type, label: e.from_id, full: e.from_id, chain_id: e.chain_id });
      if (!nodeMap.has(toId))   nodeMap.set(toId,   { id: toId,   type: e.to_type,   label: e.to_id,   full: e.to_id,   chain_id: e.chain_id });
      links.push({
        source: fromId,
        target: toId,
        kind: e.edge_kind,
        label: e.label || "",
        weight: Number(e.weight) || 1,
        actor: e.actor,
        chain_id: e.chain_id,
        created_at: e.created_at,
      });
    }

    return { nodes: Array.from(nodeMap.values()), links };
  })());

  const actors = $derived(Array.from(new Set([
    ...edges.map(e => e.actor || ""),
    ...thoughts.map(t => t.actor || ""),
  ].filter(Boolean))).sort());

  const chains = $derived(Array.from(new Set([
    ...edges.map(e => e.chain_id),
    ...thoughts.map(t => t.chain_id),
  ])).sort());

  const kpis = $derived({
    chains:   new Set(filteredEdges.map(e => e.chain_id).concat(filteredThoughts.map(t => t.chain_id))).size,
    thoughts: filteredThoughts.length,
    edges:    filteredEdges.length,
    actors:   new Set([...filteredEdges.map(e => e.actor), ...filteredThoughts.map(t => t.actor)].filter(Boolean)).size,
  });

  function startReplay(chainId: string) {
    replayChainId = chainId;
    replayStep = 0;
    if (replayTimer) clearInterval(replayTimer);
    const chainThoughts = thoughts.filter(t => t.chain_id === chainId).length;
    const chainEdges    = edges.filter(e => e.chain_id === chainId).length;
    const total = chainThoughts + chainEdges;
    replayTimer = setInterval(() => {
      replayStep += 1;
      if (replayStep > total) stopReplay();
    }, 700);
  }
  function stopReplay() {
    if (replayTimer) clearInterval(replayTimer);
    replayTimer = null;
    replayChainId = null;
    replayStep = 0;
  }

  function exportPNG() {
    if (!svgEl) return;
    const xml = new XMLSerializer().serializeToString(svgEl);
    const svg64 = btoa(unescape(encodeURIComponent(xml)));
    const img = new Image();
    img.onload = () => {
      const w = svgEl!.clientWidth || 800;
      const h = svgEl!.clientHeight || 600;
      const canvas = document.createElement("canvas");
      canvas.width = w * 2; canvas.height = h * 2;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#06080e";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `reasoning-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.png`;
      a.click();
    };
    img.src = "data:image/svg+xml;base64," + svg64;
  }

  function clearFocus() { focusedNodeId = null; focusedNodeInfo = null; }

  // d3 force simulation
  let simulation: any = null;

  $effect(() => {
    if (!d3 || !svgEl) return;
    const w = svgEl.clientWidth || 800;
    const h = svgEl.clientHeight || 600;

    const svg = d3.select(svgEl);
    svg.selectAll("*").remove();

    const defs = svg.append("defs");
    Object.entries(EDGE_COLORS).forEach(([k, c]) => {
      defs.append("marker")
        .attr("id", `arrow-${k}`)
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 18)
        .attr("refY", 0)
        .attr("markerWidth", 6)
        .attr("markerHeight", 6)
        .attr("orient", "auto")
        .append("path")
        .attr("d", "M0,-5L10,0L0,5")
        .attr("fill", c);
    });

    const svgGroup = svg.append("g");
    const zoom = d3.zoom().on("zoom", (event: any) => svgGroup.attr("transform", event.transform));
    svg.call(zoom);

    // Build neighbor index for focus mode
    const neighbors = new Map<string, Set<string>>();
    for (const l of graph.links) {
      const s = typeof l.source === "string" ? l.source : l.source.id;
      const t = typeof l.target === "string" ? l.target : l.target.id;
      if (!neighbors.has(s)) neighbors.set(s, new Set());
      if (!neighbors.has(t)) neighbors.set(t, new Set());
      neighbors.get(s)!.add(t);
      neighbors.get(t)!.add(s);
    }
    const focusSet = focusedNodeId
      ? new Set([focusedNodeId, ...(neighbors.get(focusedNodeId) || [])])
      : null;

    const linkSel = svgGroup.append("g").attr("class", "links")
      .selectAll("line")
      .data(graph.links)
      .join("line")
      .attr("stroke", (d: any) => edgeColor(d))
      .attr("stroke-opacity", (d: any) => {
        if (!focusSet) return 0.55;
        const s = typeof d.source === "string" ? d.source : d.source.id;
        const t = typeof d.target === "string" ? d.target : d.target.id;
        return (focusSet.has(s) && focusSet.has(t)) ? 0.85 : 0.08;
      })
      .attr("stroke-width", (d: any) => 1 + (d.weight || 1) * 0.8)
      .attr("marker-end", (d: any) => `url(#arrow-${d.kind})`);

    const nodeSel = svgGroup.append("g").attr("class", "nodes")
      .selectAll("circle")
      .data(graph.nodes)
      .join("circle")
      .attr("r", (d: any) => d.type === "thought" ? 8 : 6)
      .attr("fill", (d: any) => nodeColor(d))
      .attr("stroke", (d: any) => focusedNodeId === d.id ? "#fff" : "#0a0f1a")
      .attr("stroke-width", (d: any) => focusedNodeId === d.id ? 2.5 : 1.5)
      .attr("opacity", (d: any) => !focusSet || focusSet.has(d.id) ? 1 : 0.18)
      .style("cursor", "pointer")
      .on("click", (_event: any, d: any) => {
        focusedNodeId = focusedNodeId === d.id ? null : d.id;
        focusedNodeInfo = focusedNodeId ? d : null;
      })
      .call(d3.drag()
        .on("start", (event: any, d: any) => { if (!event.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on("drag",  (event: any, d: any) => { d.fx = event.x; d.fy = event.y; })
        .on("end",   (event: any, d: any) => { if (!event.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }));

    nodeSel.append("title").text((d: any) => `${d.type}: ${d.full || d.label}`);

    const labelSel = svgGroup.append("g").attr("class", "labels")
      .selectAll("text")
      .data(graph.nodes)
      .join("text")
      .text((d: any) => d.label)
      .attr("font-size", 10)
      .attr("fill", (d: any) => !focusSet || focusSet.has(d.id) ? "#cbd5e1" : "#475569")
      .attr("dx", 10)
      .attr("dy", 4)
      .attr("pointer-events", "none");

    simulation = d3.forceSimulation(graph.nodes)
      .force("link", d3.forceLink(graph.links).id((d: any) => d.id).distance(70).strength(0.5))
      .force("charge", d3.forceManyBody().strength(-180))
      .force("center", d3.forceCenter(w / 2, h / 2))
      .force("collision", d3.forceCollide().radius(14))
      .on("tick", () => {
        linkSel
          .attr("x1", (d: any) => d.source.x).attr("y1", (d: any) => d.source.y)
          .attr("x2", (d: any) => d.target.x).attr("y2", (d: any) => d.target.y);
        nodeSel.attr("cx", (d: any) => d.x).attr("cy", (d: any) => d.y);
        labelSel.attr("x", (d: any) => d.x).attr("y", (d: any) => d.y);
      });
  });
</script>

<svelte:head>
  <title>Reasoning · EXEO</title>
</svelte:head>

<header class="page-head">
  <div>
    <h1>Reasoning Graph</h1>
    <p class="caption">Live thinking topology — premise → inference → action → artifact</p>
  </div>
  <LiveBadge active={realtime} />
</header>

<section class="kpis">
  <GlassStat label="Chains"   value={String(kpis.chains)} />
  <GlassStat label="Thoughts" value={String(kpis.thoughts)} />
  <GlassStat label="Edges"    value={String(kpis.edges)} />
  <GlassStat label="Actors"   value={String(kpis.actors)} />
</section>

<section class="controls">
  <GlassCard>
    <div class="control-row">
      <label class="caption">Range
        <select bind:value={timeRange}>
          <option value="1h">Last 1h</option>
          <option value="24h">Last 24h</option>
          <option value="7d">Last 7d</option>
        </select>
      </label>
      <label class="caption">Actor
        <select bind:value={actorFilter}>
          <option value="">All</option>
          {#each actors as a}<option value={a}>{a}</option>{/each}
        </select>
      </label>
      <label class="caption">Edge kind
        <select bind:value={edgeKindFilter}>
          <option value="">All</option>
          {#each Object.keys(EDGE_COLORS) as k}<option value={k}>{k}</option>{/each}
        </select>
      </label>
      <label class="caption">Chain
        <select bind:value={chainHighlight}>
          <option value="">All</option>
          {#each chains as c}<option value={c}>{c.slice(0, 8)}…</option>{/each}
        </select>
      </label>
      <label class="caption">Color by
        <select bind:value={colorMode}>
          <option value="type">Node type</option>
          <option value="chain">Chain (cluster)</option>
        </select>
      </label>
      <button type="button" class="btn" onclick={exportPNG}>Export PNG</button>
      {#if focusedNodeId}
        <button type="button" class="btn" onclick={clearFocus}>Clear focus</button>
      {/if}
      {#if replayChainId}
        <button type="button" class="btn btn-warn" onclick={stopReplay}>Stop replay ({replayStep})</button>
      {:else if chainHighlight}
        <button type="button" class="btn btn-accent" onclick={() => startReplay(chainHighlight)}>▶ Replay chain</button>
      {/if}
    </div>
  </GlassCard>
</section>

<section class="graph-wrap">
  <GlassCard>
    {#if loading}
      <div class="empty">Loading reasoning graph…</div>
    {:else if !d3}
      <div class="empty">Failed to load d3 — check network</div>
    {:else if graph.nodes.length === 0}
      <div class="empty">No reasoning data in selected range. Have a Telegram conversation with EXEO and watch this fill in real time.</div>
    {:else}
      <div class="graph-container">
        <svg bind:this={svgEl} class="graph"></svg>
        {#if focusedNodeInfo}
          <aside class="focus-panel">
            <div class="fp-head">
              <span class="kind kind-{focusedNodeInfo.type}">{focusedNodeInfo.type}</span>
              <button type="button" class="x-btn" onclick={clearFocus}>×</button>
            </div>
            <div class="fp-body">
              <p class="fp-content">{focusedNodeInfo.full || focusedNodeInfo.label}</p>
              {#if focusedNodeInfo.chain_id}
                <p class="caption">Chain: <code>{focusedNodeInfo.chain_id.slice(0, 8)}…</code></p>
              {/if}
              {#if focusedNodeInfo.actor}
                <p class="caption">Actor: <code>{focusedNodeInfo.actor}</code></p>
              {/if}
              {#if focusedNodeInfo.created_at}
                <p class="caption">{new Date(focusedNodeInfo.created_at).toLocaleString()}</p>
              {/if}
              {#if nodeSourceUrl(focusedNodeInfo)}
                <a href={nodeSourceUrl(focusedNodeInfo)} class="btn btn-accent" style="margin-top:8px;display:inline-block">Open source ↗</a>
              {/if}
              {#if focusedNodeInfo.chain_id}
                <button type="button" class="btn" style="margin-top:8px" onclick={() => startReplay(focusedNodeInfo.chain_id)}>▶ Replay this chain</button>
              {/if}
            </div>
          </aside>
        {/if}
      </div>
    {/if}
  </GlassCard>
</section>

<section>
  <GlassCard>
    <div class="legends">
      <div>
        <h4>Edge kinds</h4>
        <div class="legend">
          {#each Object.entries(EDGE_COLORS) as [k, c]}
            <span class="leg"><i style="background:{c}"></i>{k}</span>
          {/each}
        </div>
      </div>
      <div>
        <h4>Node types</h4>
        <div class="legend">
          {#each Object.entries(NODE_COLORS) as [k, c]}
            <span class="leg"><i style="background:{c}"></i>{k}</span>
          {/each}
        </div>
      </div>
    </div>
  </GlassCard>
</section>

<section>
  <GlassCard>
    <h3>Recent thoughts</h3>
    <ol class="thoughts">
      {#each filteredThoughts.slice(0, 20) as t}
        <li>
          <span class="kind kind-{t.kind}">{t.kind}</span>
          <span class="actor">{t.actor}</span>
          <span class="content">{t.content}</span>
          <span class="ts">{new Date(t.created_at).toLocaleTimeString()}</span>
        </li>
      {/each}
    </ol>
  </GlassCard>
</section>

<style>
  .page-head { display: flex; justify-content: space-between; align-items: end; gap: 16px; }
  .page-head h1 { font-size: 28px; margin: 0; }
  .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
  .controls .control-row { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; padding: 12px; }
  .controls select { background: var(--s1); border: 1px solid var(--b1); color: inherit; padding: 4px 8px; border-radius: 6px; }
  .btn {
    background: var(--s1); border: 1px solid var(--b2);
    color: inherit; padding: 5px 12px; border-radius: 6px; cursor: pointer; font-size: 12px;
    transition: background var(--dur-fast) var(--ease-out);
  }
  .btn:hover { background: var(--s2); }
  .btn-accent { background: var(--a2-18); border-color: var(--a2); }
  .btn-warn   { background: var(--re-18);  border-color: var(--re); }
  .graph-wrap { min-height: 600px; }
  .graph-container { position: relative; width: 100%; height: 600px; }
  .graph { width: 100%; height: 600px; display: block; }
  .focus-panel {
    position: absolute; top: 12px; right: 12px; width: 280px;
    background: var(--glass-elev); backdrop-filter: var(--blur-elev);
    -webkit-backdrop-filter: var(--blur-elev);
    border: 1px solid var(--b2); border-radius: var(--r-md);
    padding: 12px; font-size: 13px;
  }
  .fp-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  .x-btn { background: none; border: none; color: var(--t3); font-size: 18px; cursor: pointer; padding: 0 4px; transition: color var(--dur-fast) var(--ease-out); }
  .x-btn:hover { color: var(--tx); }
  .fp-content { margin: 0 0 8px; line-height: 1.4; word-break: break-word; }
  .fp-body .caption { margin: 4px 0; color: var(--t3); font-size: 11px; }
  .empty { padding: 80px 24px; text-align: center; color: var(--t3); font-style: italic; }
  .legends { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding: 12px; }
  .legends h4 { margin: 0 0 8px; font-size: 12px; color: var(--t2); text-transform: uppercase; letter-spacing: 0.05em; }
  .legend { display: flex; flex-wrap: wrap; gap: 10px; }
  .leg { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: var(--t3); }
  .leg i { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
  .thoughts { list-style: decimal inside; padding: 8px 16px; display: flex; flex-direction: column; gap: 8px; }
  .thoughts li { display: grid; grid-template-columns: 100px 130px 1fr 80px; gap: 8px; font-size: 13px; align-items: center; }
  .kind { padding: 2px 6px; border-radius: 4px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
  .kind-observation { background: rgba(14,165,233,0.15); color: #38bdf8; }
  .kind-hypothesis  { background: rgba(139,92,246,0.15); color: #a78bfa; }
  .kind-question    { background: rgba(249,115,22,0.15); color: #fb923c; }
  .kind-conclusion  { background: rgba(34,197,94,0.15);  color: #4ade80; }
  .kind-thought     { background: rgba(139,92,246,0.15); color: #a78bfa; }
  .kind-decision    { background: rgba(167,139,250,0.15); color: #c4b5fd; }
  .kind-agent       { background: rgba(34,197,94,0.15);  color: #4ade80; }
  .kind-tg_msg      { background: rgba(14,165,233,0.15); color: #38bdf8; }
  .kind-client      { background: rgba(6,182,212,0.15);  color: #22d3ee; }
  .kind-ticket      { background: rgba(245,158,11,0.15); color: #fbbf24; }
  .kind-doc         { background: rgba(250,204,21,0.15); color: #facc15; }
  .kind-tool_call   { background: rgba(148,163,184,0.15); color: #cbd5e1; }
  .kind-signal      { background: rgba(251,146,60,0.15); color: #fb923c; }
  .actor { color: var(--t3); font-family: var(--mo); font-size: 11px; }
  .ts { color: var(--t4); font-size: 11px; text-align: right; }

  /* Responsive — graph + sidepanels collapse on narrow viewports */
  @media (max-width: 760px) {
    .focus-panel { position: static; width: auto; margin-top: 12px; }
    .legends { grid-template-columns: 1fr; }
    .thoughts li { grid-template-columns: 1fr; gap: 4px; }
    .ts { text-align: left; }
    .page-head { flex-direction: column; align-items: flex-start; }
    .graph, .graph-container { height: 420px; min-height: 420px; }
    .graph-wrap { min-height: 420px; }
  }
</style>

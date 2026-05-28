<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { supabase, recentAudit, hasClient, subscribeAuditLog } from "$lib/db";
  import { goto } from "$app/navigation";

  // Types
  type Heartbeat = {
    agent_name: string;
    last_action: string | null;
    last_action_at: string | null;
    confidence: number | null;
    status: string | null;
  };
  type DecisionRow = {
    id: string;
    decision: string | null;
    recommendation?: string | null;
    chosen_action?: string | null;
    outcome: string | null;
    decided_at: string | null;
    recommended_by: string | null;
    rationale?: string | null;
    tags: string[] | null;
    client_code?: string | null;
  };
  type AuditRow = {
    id: string;
    action: string;
    actor: string | null;
    entity_id: string | null;
    created_at: string;
  };
  type InferenceRow = {
    id: number;
    occurred_at: string;
    endpoint: string;
    model: string | null;
    prompt_tokens: number | null;
    completion_tokens: number | null;
    total_tokens: number | null;
    latency_ms: number | null;
    caller: string | null;
    status: string;
  };
  type ActiveAdapter = {
    model_family: string;
    adapter_id: string | null;
    adapter_path: string | null;
    promoted_at: string | null;
    notes: string | null;
    updated_at: string;
  };
  type RegistryRow = {
    agent_name: string;
    kind: 'launchagent' | 'claude_subagent' | 'mcp_server' | 'bot';
    source_file: string | null;
    expected_cadence_seconds: number | null;
    purpose_one_line: string | null;
    discovered_at: string | null;
    removed_at: string | null;
    heartbeat_status: string | null;
    heartbeat_last_action: string | null;
    heartbeat_last_action_at: string | null;
    heartbeat_confidence: number | null;
    liveness: 'heartbeating' | 'silent' | 'removed';
  };

  // State
  let authorized       = $state(false);
  let loading          = $state(true);
  let now              = $state(Date.now());
  let refreshedAt      = $state(Date.now());
  let mountedAt        = $state(Date.now());
  let heartbeats       = $state<Heartbeat[]>([]);
  let decisions        = $state<DecisionRow[]>([]);
  let audit            = $state<AuditRow[]>([]);
  let inferenceLog     = $state<InferenceRow[]>([]);
  let inferenceLogAvailable = $state(true);
  let activeAdapters   = $state<ActiveAdapter[]>([]);
  let activeAdaptersAvailable = $state(true);
  let embeddingCount   = $state(0);
  let embeddingV2Count = $state(0);
  let registry         = $state<RegistryRow[]>([]);
  // Live local-model probes (P1: real values, not just heartbeat freshness)
  let bgeLastLatencyMs = $state<number | null>(null);
  let bgeLastRunAt     = $state<string | null>(null);
  let bgeAvgLatency7d  = $state<number | null>(null);
  let bgeCallsLast24h  = $state(0);
  let loraPairCount    = $state(0);
  let loraPairsAvailable = $state(true);
  let retrievalCalls7d = $state(0);
  let retrievalAvailable = $state(true);
  let qwenLastSeenAt   = $state<string | null>(null);
  let deepseekLastSeenAt = $state<string | null>(null);
  const LORA_TARGET_PAIRS = 150;
  let nowTick: ReturnType<typeof setInterval> | null = null;
  let pollTick: ReturnType<typeof setInterval> | null = null;
  let auditUnsub: (() => void) | null = null;
  let realtimeOk = $state(false);
  let dbOk       = $state(false);
  let lastDbError = $state<string | null>(null);
  let newAuditFlash = $state(0);
  let expandedDecision = $state<string | null>(null);

  // ── Unified sensor payload (P1.8 AI Monitor overhaul) ───────────────────
  // /api/functions/ai-monitor-metrics aggregates every sensor into one JSON
  // blob. The direct Supabase queries below remain as fallback + realtime.
  type SensorStatus = 'ok' | 'warn' | 'error' | 'idle';
  type SensorRow = {
    value: number | null;
    label: string;
    status: SensorStatus;
    last_updated: string;
    [k: string]: any;
  };
  type SensorPayload = {
    overall_status: SensorStatus;
    generated_at: string;
    sensors: Record<string, SensorRow>;
    heartbeats: Array<{
      agent_name: string;
      kind: string | null;
      status: SensorStatus;
      last_action: string | null;
      last_action_at: string | null;
      age_ms: number | null;
      confidence: number | null;
      liveness: string;
    }>;
  };
  let sensors = $state<SensorPayload | null>(null);
  let sensorsAvailable = $state(true);
  let sensorsError = $state<string | null>(null);

  async function fetchSensors() {
    try {
      const res = await fetch('/api/functions/ai-monitor-metrics', { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as SensorPayload;
      sensors = json;
      sensorsAvailable = true;
      sensorsError = null;
    } catch (e: any) {
      console.warn('[ai-monitor] sensor fetch failed', e);
      sensorsAvailable = false;
      sensorsError = e?.message ?? String(e);
    }
  }

  function sensorColor(s: SensorStatus | string | null | undefined): string {
    if (s === 'ok')    return '#22d3a5';
    if (s === 'warn')  return '#f59e0b';
    if (s === 'error') return '#f43f5e';
    return '#64748b';
  }

  // Tweened counters for KPIs
  let tweenedEmb       = $state(0);
  let tweenedEmbV2     = $state(0);
  let tweenedAgents    = $state(0);
  let tweenedInfer     = $state(0);
  let tweenedAvgLat    = $state(0);
  let tweenedLocalPct  = $state(0);
  let tweenedDonutTotal= $state(0);

  // Onload chart animation triggers (re-fire on data refresh)
  let chartKey = $state(0);

  // Auth guard
  onMount(async () => {
    nowTick = setInterval(() => { now = Date.now(); }, 5000);
    try {
      const { data: { user } } = await supabase().auth.getUser();
      if (user?.email !== "claudio@c2moviez.com") {
        goto("/", { replaceState: true });
        return;
      }
      authorized = true;
    } catch {
      goto("/", { replaceState: true });
      return;
    }
    await Promise.all([refresh(), fetchSensors()]);
    pollTick = setInterval(() => { refresh(); fetchSensors(); }, 30000);

    try {
      auditUnsub = subscribeAuditLog((row) => {
        realtimeOk = true;
        audit = [row as any, ...audit.filter(a => a.id !== row.id)].slice(0, 80);
        newAuditFlash = Date.now();
      });
      realtimeOk = true;
    } catch (e) {
      console.warn("[ai-monitor] realtime subscribe failed", e);
      realtimeOk = false;
    }

    loading = false;
  });

  onDestroy(() => {
    if (nowTick) clearInterval(nowTick);
    if (pollTick) clearInterval(pollTick);
    if (auditUnsub) { try { auditUnsub(); } catch {} }
  });

  // Count-up tween helper
  function tween(getter: () => number, setter: (v: number) => void, target: number, duration = 700) {
    const start = getter();
    const delta = target - start;
    if (delta === 0) return;
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setter(start + delta * eased);
      if (t < 1) requestAnimationFrame(step);
      else setter(target);
    };
    requestAnimationFrame(step);
  }

  // Data fetch
  async function refresh() {
    if (!hasClient()) return;
    try {
      const baseQueries = [
        supabase()
          .from("agent_heartbeat")
          .select("agent_name, last_action, last_action_at, confidence, status")
          .order("last_action_at", { ascending: false })
          .limit(60),
        supabase()
          .from("decisions")
          .select("id, decision, recommendation, chosen_action, outcome, decided_at, recommended_by, client_code, tags, rationale")
          .order("decided_at", { ascending: false })
          .limit(40),
        recentAudit(40),
        supabase()
          .from("nex_embeddings")
          .select("id", { count: "exact", head: true }),
        supabase()
          .from("nex_embeddings")
          .select("id", { count: "exact", head: true })
          .not("embedding_v2", "is", null),
        supabase()
          .from("nex_agent_registry_coverage")
          .select("agent_name, kind, source_file, expected_cadence_seconds, purpose_one_line, discovered_at, removed_at, heartbeat_status, heartbeat_last_action, heartbeat_last_action_at, heartbeat_confidence, liveness")
          .is("removed_at", null)
          .order("kind", { ascending: true })
          .order("agent_name", { ascending: true }),
      ];

      const [hb, dc, au, eb, ebv2, rg] = await Promise.all(baseQueries) as any[];

      // Optional tables wrapped separately
      try {
        const il = await supabase()
          .from("nex_local_inference_log")
          .select("id, occurred_at, endpoint, model, prompt_tokens, completion_tokens, total_tokens, latency_ms, caller, status")
          .order("occurred_at", { ascending: false })
          .limit(80);
        if (il.error) throw il.error;
        inferenceLog = (il.data ?? []) as InferenceRow[];
        inferenceLogAvailable = true;
      } catch {
        inferenceLog = [];
        inferenceLogAvailable = false;
      }

      try {
        const aa = await supabase()
          .from("nex_active_adapter")
          .select("model_family, adapter_id, adapter_path, promoted_at, notes, updated_at")
          .order("updated_at", { ascending: false });
        if (aa.error) throw aa.error;
        activeAdapters = (aa.data ?? []) as ActiveAdapter[];
        activeAdaptersAvailable = true;
      } catch {
        activeAdapters = [];
        activeAdaptersAvailable = false;
      }

      // Real BGE-M3 health from last embed call (not just heartbeat)
      try {
        const bge = await supabase()
          .from("nex_local_inference_log")
          .select("occurred_at, latency_ms, model, status")
          .eq("endpoint", "embed")
          .order("occurred_at", { ascending: false })
          .limit(1);
        if (bge.error) throw bge.error;
        const row = (bge.data ?? [])[0];
        if (row) {
          bgeLastLatencyMs = row.latency_ms ?? null;
          bgeLastRunAt = row.occurred_at ?? null;
        }
      } catch { /* silent */ }

      // BGE-M3 avg latency + call count last 24h
      try {
        const since24 = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
        const recent = await supabase()
          .from("nex_local_inference_log")
          .select("latency_ms")
          .eq("endpoint", "embed")
          .gte("occurred_at", since24);
        if (!recent.error && recent.data) {
          const rows = recent.data as Array<{ latency_ms: number | null }>;
          bgeCallsLast24h = rows.length;
          const lats = rows.map(r => r.latency_ms ?? 0).filter(n => n > 0);
          bgeAvgLatency7d = lats.length > 0
            ? Math.round(lats.reduce((s, n) => s + n, 0) / lats.length)
            : null;
        }
      } catch { /* silent */ }

      // Last Qwen / DeepSeek seen
      try {
        const chat = await supabase()
          .from("nex_local_inference_log")
          .select("occurred_at, model")
          .in("endpoint", ["chat", "reason"])
          .order("occurred_at", { ascending: false })
          .limit(20);
        if (!chat.error && chat.data) {
          const rows = chat.data as Array<{ occurred_at: string; model: string | null }>;
          for (const r of rows) {
            const m = (r.model || "").toLowerCase();
            if (!qwenLastSeenAt && m.includes("qwen")) qwenLastSeenAt = r.occurred_at;
            if (!deepseekLastSeenAt && m.includes("deepseek")) deepseekLastSeenAt = r.occurred_at;
          }
        }
      } catch { /* silent */ }

      // LoRA pair corpus
      try {
        const lp = await supabase()
          .from("nex_lora_pairs")
          .select("id", { count: "exact", head: true });
        if (lp.error) throw lp.error;
        loraPairCount = lp.count ?? 0;
        loraPairsAvailable = true;
      } catch {
        loraPairCount = 0;
        loraPairsAvailable = false;
      }

      // RAG retrieval activity last 7d
      try {
        const since7 = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
        const rl = await supabase()
          .from("nex_retrieval_log")
          .select("id", { count: "exact", head: true })
          .gte("occurred_at", since7);
        if (rl.error) throw rl.error;
        retrievalCalls7d = rl.count ?? 0;
        retrievalAvailable = true;
      } catch {
        retrievalCalls7d = 0;
        retrievalAvailable = false;
      }

      heartbeats     = (hb.data  ?? []) as Heartbeat[];
      decisions      = (dc.data  ?? []) as DecisionRow[];
      const polled = (au ?? []) as AuditRow[];
      const byId = new Map<string, AuditRow>();
      for (const r of polled) byId.set(r.id, r);
      for (const r of audit) if (!byId.has(r.id)) byId.set(r.id, r);
      audit = Array.from(byId.values())
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 80);

      embeddingCount   = eb.count ?? 0;
      embeddingV2Count = ebv2.count ?? 0;
      registry         = (rg.data  ?? []) as RegistryRow[];
      refreshedAt      = Date.now();
      dbOk = true;
      lastDbError = null;

      // Trigger tween animations
      tween(() => tweenedEmb, v => tweenedEmb = v, embeddingCount);
      tween(() => tweenedEmbV2, v => tweenedEmbV2 = v, embeddingV2Count);
      tween(() => tweenedAgents, v => tweenedAgents = v, heartbeats.length);
      tween(() => tweenedInfer, v => tweenedInfer = v, inferenceLog.length);
      const totalDec = decisions.length;
      tween(() => tweenedDonutTotal, v => tweenedDonutTotal = v, totalDec);

      // Re-trigger chart animations
      chartKey++;
    } catch (e: any) {
      console.error("[ai-monitor] refresh", e);
      dbOk = false;
      lastDbError = e?.message ?? String(e);
    }
  }

  // Derived
  const inferenceStats = $derived((() => {
    const rows = inferenceLog;
    const total = rows.length;
    const ok = rows.filter(r => r.status === "ok").length;
    const avgLatency = total > 0
      ? Math.round(rows.reduce((s, r) => s + (r.latency_ms ?? 0), 0) / total) : 0;
    const totalTokens = rows.reduce((s, r) => s + (r.total_tokens ?? 0), 0);
    const t1 = rows.filter(r => {
      const m = (r.model || "").toLowerCase();
      return m.includes("bge") || m.includes("embed");
    }).length;
    const t2 = rows.filter(r => {
      const m = (r.model || "").toLowerCase();
      return m.includes("qwen") || m.includes("lora") || m.includes("deepseek");
    }).length;
    const t3 = total - t1 - t2;
    return { total, ok, errs: total - ok, avgLatency, totalTokens, t1, t2, t3 };
  })());

  $effect(() => {
    tween(() => tweenedAvgLat, v => tweenedAvgLat = v, inferenceStats.avgLatency);
  });

  const localVsCloud = $derived((() => {
    const local = inferenceLog.filter(r => {
      const m = (r.model || "").toLowerCase();
      return m.includes("bge") || m.includes("qwen") || m.includes("lora") || m.includes("deepseek");
    }).length;
    const cloud = inferenceLog.length - local;
    const total = local + cloud;
    return {
      local, cloud, total,
      localPct: total > 0 ? Math.round((local / total) * 100) : 0,
      cloudPct: total > 0 ? Math.round((cloud / total) * 100) : 0,
    };
  })());

  $effect(() => {
    tween(() => tweenedLocalPct, v => tweenedLocalPct = v, localVsCloud.localPct);
  });

  // Decision outcome donut data
  const donutData = $derived((() => {
    const counts: Record<string, number> = {
      won: 0, actioned: 0, no_action: 0, neutral: 0, unknown: 0,
      reversed: 0, lost: 0, pending: 0
    };
    for (const d of decisions) {
      const o = (d.outcome ?? "").toLowerCase().trim();
      if (o === "won" || o === "kept") counts.won++;
      else if (o === "actioned") counts.actioned++;
      else if (o === "no_action") counts.no_action++;
      else if (o === "neutral") counts.neutral++;
      else if (o === "unknown") counts.unknown++;
      else if (o === "reversed") counts.reversed++;
      else if (o === "lost") counts.lost++;
      else counts.pending++; // null / empty = pending reconciliation
    }
    const total = decisions.length;
    const settled = counts.won + counts.actioned;
    const winRate = total > 0 ? Math.round((settled / total) * 100) : 0;
    return { counts, total, winRate };
  })());

  // Donut slice geometry
  const donutSlices = $derived((() => {
    const colors: Record<string, string> = {
      won:      "#22d3a5",
      actioned: "#56bcec",
      neutral:  "#64748b",
      no_action:"#475569",
      unknown:  "#334155",
      reversed: "#f43f5e",
      lost:     "#f43f5e",
      pending:  "#f59e0b",
    };
    const order = ["won", "actioned", "neutral", "no_action", "pending", "unknown", "reversed", "lost"];
    const total = Math.max(1, donutData.total);
    const r = 70;
    const C = 2 * Math.PI * r;
    let offset = 0;
    const slices: { key: string; color: string; len: number; off: number; count: number; pct: number }[] = [];
    for (const k of order) {
      const count = donutData.counts[k] ?? 0;
      if (count === 0) continue;
      const len = (count / total) * C;
      slices.push({ key: k, color: colors[k], len, off: offset, count, pct: Math.round((count / total) * 100) });
      offset += len;
    }
    return slices;
  })());

  // Inference timeline (last 50, sorted asc by time)
  const inferenceSeries = $derived((() => {
    const rows = [...inferenceLog].slice(0, 50).reverse();
    if (rows.length === 0) return { points: [] as {x:number;y:number;row:InferenceRow}[], maxY: 1, minT: 0, maxT: 1 };
    const times = rows.map(r => new Date(r.occurred_at).getTime());
    const lats = rows.map(r => r.latency_ms ?? 0);
    const minT = Math.min(...times);
    const maxT = Math.max(...times);
    const maxY = Math.max(1, ...lats);
    return {
      points: rows.map((r, i) => ({
        x: maxT === minT ? i / Math.max(1, rows.length - 1) : (new Date(r.occurred_at).getTime() - minT) / (maxT - minT),
        y: (r.latency_ms ?? 0) / maxY,
        row: r,
      })),
      maxY, minT, maxT,
    };
  })());

  // Local model snapshot
  function hbFor(name: string): Heartbeat | null {
    return heartbeats.find(h => h.agent_name === name) ?? null;
  }
  const bgeHb       = $derived(hbFor("nex-embed-refresh"));
  const localHb     = $derived(hbFor("nex-local-models"));
  const loraHb      = $derived(hbFor("nex-lora-train-week"));
  const daemonHb    = $derived(hbFor("nex-daemon") ?? hbFor("exeo-daemon"));

  const bgeAgeMs = $derived(bgeHb?.last_action_at ? (now - new Date(bgeHb.last_action_at).getTime()) : Infinity);
  // Real BGE health uses last embed-call latency (healthy <5s, degraded <30s, broken >30s)
  // Falls back to heartbeat freshness if no recent call (>1h cold).
  const bgeLatencyAgeMs = $derived(bgeLastRunAt ? (now - new Date(bgeLastRunAt).getTime()) : Infinity);
  const bgeStatus = $derived((() => {
    if (bgeLastLatencyMs != null && bgeLatencyAgeMs < 3600_000) {
      if (bgeLastLatencyMs < 5_000) return 'ok';
      if (bgeLastLatencyMs < 30_000) return 'lagging';
      return 'stale'; // >30s = broken (CEO: real values matter — current state IS degraded 300-700s)
    }
    if (bgeAgeMs > 3600_000) return 'stale';
    if (bgeAgeMs > 1800_000) return 'lagging';
    return 'ok';
  })());
  const daemonAgeMs = $derived(daemonHb?.last_action_at ? (now - new Date(daemonHb.last_action_at).getTime()) : Infinity);
  const daemonStatus = $derived(
    daemonAgeMs > 600_000 ? 'stale' :
    daemonAgeMs > 180_000 ? 'lagging' : 'ok'
  );

  const ragCoveragePct = $derived(
    embeddingCount > 0 ? Math.round((embeddingV2Count / embeddingCount) * 100) : 0
  );

  // Stale heartbeat detection
  const cadenceByName = $derived((() => {
    const m = new Map<string, number>();
    for (const r of registry) {
      if (r.expected_cadence_seconds) m.set(r.agent_name, r.expected_cadence_seconds);
    }
    return m;
  })());

  function ageMs(iso: string | null): number {
    if (!iso) return Infinity;
    return now - new Date(iso).getTime();
  }
  function isStaleHb(h: any): boolean {
    if (h._kind === 'mcp_server') return false;
    if (!h.last_action_at) return true;
    const cadence = cadenceByName.get(h.agent_name);
    // claude_subagents are on-demand — only flag after 24h of silence
    const defaultMs = h._kind === 'claude_subagent' ? 86400 * 1000 : 2 * 3600 * 1000;
    const limitMs = cadence ? cadence * 2 * 1000 : defaultMs;
    return ageMs(h.last_action_at) > limitMs;
  }
  function freshnessPct(h: any): number {
    if (!h.last_action_at) return 0;
    const age = ageMs(h.last_action_at);
    const cadence = cadenceByName.get(h.agent_name);
    const defaultMs = h._kind === 'claude_subagent' ? 86400 * 1000 : 2 * 3600 * 1000;
    const stale = cadence ? cadence * 2 * 1000 : defaultMs;
    if (age >= stale) return 0;
    return Math.max(0, Math.min(100, Math.round((1 - age / stale) * 100)));
  }
  function freshnessColor(pct: number): string {
    if (pct >= 90) return "#22d3a5";
    if (pct >= 50) return "#56bcec";
    if (pct >= 20) return "#f59e0b";
    return "#f43f5e";
  }

  // Registry coverage
  type RegistryStats = {
    total: number;
    heartbeating: number;
    silent: number;
    byKind: Record<string, { total: number; heartbeating: number; silent: number }>;
  };
  const registryStats = $derived((() => {
    const out: RegistryStats = {
      total: 0,
      heartbeating: 0,
      silent: 0,
      byKind: {
        launchagent:    { total: 0, heartbeating: 0, silent: 0 },
        claude_subagent:{ total: 0, heartbeating: 0, silent: 0 },
        mcp_server:     { total: 0, heartbeating: 0, silent: 0 },
        bot:            { total: 0, heartbeating: 0, silent: 0 },
      },
    };
    for (const r of registry) {
      out.total++;
      const k = out.byKind[r.kind] ?? (out.byKind[r.kind] = { total: 0, heartbeating: 0, silent: 0 });
      k.total++;
      if (r.liveness === 'heartbeating') { out.heartbeating++; k.heartbeating++; }
      else                                { out.silent++;       k.silent++;       }
    }
    return out;
  })());

  const heartbeatsMerged = $derived((() => {
    const byName = new Map<string, Heartbeat & { _registered: boolean; _kind?: string; _silent: boolean }>();
    for (const r of registry) {
      byName.set(r.agent_name, {
        agent_name: r.agent_name,
        last_action: r.heartbeat_last_action ?? r.purpose_one_line,
        last_action_at: r.heartbeat_last_action_at,
        confidence: r.heartbeat_confidence,
        status: r.heartbeat_status ?? (r.liveness === 'silent' ? 'silent' : null),
        _registered: true,
        _kind: r.kind,
        _silent: r.liveness === 'silent',
      });
    }
    for (const h of heartbeats) {
      const prev = byName.get(h.agent_name);
      byName.set(h.agent_name, {
        ...(prev ?? { _registered: false, _silent: false }),
        ...h,
        _registered: prev?._registered ?? false,
        _kind: prev?._kind,
        _silent: false,
      });
    }
    return Array.from(byName.values()).sort((a, b) => {
      const aDead = a._silent ? 1 : 0;
      const bDead = b._silent ? 1 : 0;
      if (aDead !== bDead) return aDead - bDead;
      const at = a.last_action_at ? new Date(a.last_action_at).getTime() : 0;
      const bt = b.last_action_at ? new Date(b.last_action_at).getTime() : 0;
      return bt - at;
    });
  })());

  function kindLabel(k: string): string {
    if (k === 'launchagent')     return 'LaunchAgent';
    if (k === 'claude_subagent') return 'Claude Subagent';
    if (k === 'mcp_server')      return 'MCP Server';
    if (k === 'bot')             return 'Bot';
    return k;
  }
  function kindIcon(k: string): string {
    if (k === 'launchagent')     return '⚙';
    if (k === 'claude_subagent') return '◈';
    if (k === 'mcp_server')      return '◉';
    if (k === 'bot')             return '◆';
    return '·';
  }

  // Helpers
  function fmtRelative(iso: string | null): string {
    if (!iso) return "never";
    const diff = (now - new Date(iso).getTime()) / 1000;
    if (diff < 60) return `${Math.max(1, Math.floor(diff))}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }
  function fmtTime(iso: string): string {
    return new Date(iso).toLocaleTimeString("en-GB", {
      timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  }
  function fmtClock(): string {
    return new Date(now).toLocaleTimeString("en-GB", {
      timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  }
  function truncate(s: string | null | undefined, n: number): string {
    if (!s) return "";
    return s.length > n ? s.slice(0, n - 1) + "..." : s;
  }
  function statusDot(s: string | null | undefined): string {
    const v = (s || "").toLowerCase();
    if (v === "ok" || v === "idle" || v === "ready") return "ok";
    if (v === "running" || v === "active" || v === "syncing") return "run";
    if (v === "error" || v === "failed" || v === "dead") return "err";
    return "neutral";
  }
  function outcomeChip(o: string | null): { label: string; cls: string } {
    const v = (o || "").toLowerCase();
    if (v === "won" || v === "kept") return { label: v.toUpperCase(), cls: "success" };
    if (v === "actioned") return { label: "ACTIONED", cls: "brand" };
    if (v === "reversed" || v === "lost") return { label: v.toUpperCase(), cls: "danger" };
    if (v === "no_action") return { label: "NO ACTION", cls: "neutral" };
    return { label: "PENDING", cls: "warn" };
  }
  function auditColor(action: string): string {
    const a = (action || "").toLowerCase();
    if (a.includes("error") || a.includes("fail")) return "err";
    if (a.includes("deploy") || a.includes("commit")) return "ok";
    if (a.includes("telegram")) return "brand";
    if (a.includes("webhook") || a.includes("plane") || a.includes("outlook")) return "violet";
    if (a.includes("ticket")) return "blue";
    if (a.includes("rag") || a.includes("embed") || a.includes("decision")) return "amber";
    return "neutral";
  }
  function fmtAction(row: AuditRow): string {
    const a = row.action || "";
    const e = row.entity_id || "";
    if (a.includes("heartbeat")) return `synced ${e}`;
    if (a.includes("ticket.done") || a.includes("complete")) return `closed ticket ${e}`;
    if (a.includes("ticket.create")) return `opened ${e}`;
    if (a.includes("ticket.update")) return `updated ${e}`;
    if (a.includes("plane.webhook") || a.includes("plane.sync")) return `synced Plane`;
    if (a.includes("outlook")) return `synced Outlook`;
    if (a.includes("telegram")) return `sent Telegram`;
    if (a.includes("rag") || a.includes("embed")) return `learned ${e}`;
    if (a.includes("decision")) return `decision ${e}`;
    return (a.split(".").pop() || a) + (e && e !== a ? ` ${e}` : "");
  }

  // System health scoring for radial gauges
  type GaugeData = { label: string; sub: string; score: number; color: string; status: string };
  const gauges = $derived<GaugeData[]>([
    {
      label: "DASHBOARD",
      sub: "ops.c2moviez.com",
      score: 100,
      color: "#22d3a5",
      status: "online",
    },
    {
      label: "POSTGRES",
      sub: dbOk ? "db.c2moviez.com" : (lastDbError ?? "no response"),
      score: dbOk ? 100 : 0,
      color: dbOk ? "#22d3a5" : "#f43f5e",
      status: dbOk ? "ok" : "down",
    },
    {
      label: "REALTIME",
      sub: realtimeOk ? "audit_log live" : "fallback 30s",
      score: realtimeOk ? 100 : 55,
      color: realtimeOk ? "#22d3a5" : "#f59e0b",
      status: realtimeOk ? "connected" : "polling",
    },
    {
      label: "BGE-M3",
      sub: bgeLastLatencyMs != null
        ? (bgeLastLatencyMs >= 1000 ? (bgeLastLatencyMs / 1000).toFixed(1) + 's' : bgeLastLatencyMs + 'ms') + ' last call'
        : (bgeHb ? fmtRelative(bgeHb.last_action_at) : "never"),
      score: bgeStatus === 'ok' ? 100 : (bgeStatus === 'lagging' ? 55 : 10),
      color: bgeStatus === 'ok' ? "#22d3a5" : (bgeStatus === 'lagging' ? "#f59e0b" : "#f43f5e"),
      status: bgeStatus === 'ok' ? 'healthy' : bgeStatus === 'lagging' ? 'degraded' : 'broken',
    },
    {
      label: "NEX DAEMON",
      sub: daemonHb ? fmtRelative(daemonHb.last_action_at) : "no heartbeat",
      score: daemonHb ? (daemonStatus === 'ok' ? 100 : (daemonStatus === 'lagging' ? 55 : 10)) : 0,
      color: daemonHb ? (daemonStatus === 'ok' ? "#22d3a5" : (daemonStatus === 'lagging' ? "#f59e0b" : "#f43f5e")) : "#f43f5e",
      status: daemonHb ? daemonStatus : "no data",
    },
    {
      label: "AGENTS",
      sub: registryStats.silent + " silent / " + registryStats.total + " total",
      score: registryStats.total > 0 ? Math.round((registryStats.heartbeating / registryStats.total) * 100) : 0,
      color: (() => {
        const pct = registryStats.total > 0 ? (registryStats.heartbeating / registryStats.total) * 100 : 0;
        if (pct >= 90) return "#22d3a5";
        if (pct >= 60) return "#56bcec";
        if (pct >= 30) return "#f59e0b";
        return "#f43f5e";
      })(),
      status: registryStats.heartbeating + "/" + registryStats.total,
    },
  ]);

  // Gauge SVG geometry
  const GAUGE_R = 38;
  const GAUGE_C = 2 * Math.PI * GAUGE_R;

  // Smoothly animate gauge stroke
  let animGaugeProgress = $state(0);
  $effect(() => {
    // reset on mount-tick
    const start = performance.now();
    const dur = 1100;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / dur);
      animGaugeProgress = 1 - Math.pow(1 - k, 3);
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    // dummy dep to re-run when chartKey changes
    void chartKey;
  });

  // Inference area-path d-string
  function buildAreaPath(points: {x:number;y:number}[]): string {
    if (points.length === 0) return "";
    const W = 100, H = 100;
    let d = "";
    points.forEach((p, i) => {
      const x = p.x * W;
      const y = H - p.y * 92 - 4;
      d += (i === 0 ? `M ${x.toFixed(2)} ${y.toFixed(2)}` : ` L ${x.toFixed(2)} ${y.toFixed(2)}`);
    });
    return d;
  }
  function buildAreaFill(points: {x:number;y:number}[]): string {
    if (points.length === 0) return "";
    const W = 100, H = 100;
    let d = "";
    points.forEach((p, i) => {
      const x = p.x * W;
      const y = H - p.y * 92 - 4;
      d += (i === 0 ? `M ${x.toFixed(2)} ${y.toFixed(2)}` : ` L ${x.toFixed(2)} ${y.toFixed(2)}`);
    });
    const last = points[points.length - 1];
    const lastX = last.x * W;
    const firstX = points[0].x * W;
    d += ` L ${lastX.toFixed(2)} ${H} L ${firstX.toFixed(2)} ${H} Z`;
    return d;
  }

  // Audit row left-color for ticker
  function tickerColor(action: string): string {
    const a = (action || "").toLowerCase();
    if (a.includes("vault") || a.includes("obsidian")) return "#56bcec";
    if (a.includes("plane")) return "#a78bfa";
    if (a.includes("telegram")) return "#f59e0b";
    if (a.includes("decision") || a.includes("rag") || a.includes("embed")) return "#22d3a5";
    if (a.includes("error") || a.includes("fail")) return "#f43f5e";
    return "#64748b";
  }
</script>

<div class="page">
  <!-- ambient aurora background -->
  <div class="aurora" aria-hidden="true">
    <span class="aurora-blob a1"></span>
    <span class="aurora-blob a2"></span>
    <span class="aurora-blob a3"></span>
    <span class="aurora-grid"></span>
  </div>

  <!-- Header -->
  <header class="hero">
    <div class="hero-left">
      <a href="/" class="back-link">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Command
      </a>
      <div class="hero-title-block">
        <span class="hero-pulse"></span>
        <span class="hero-eyebrow">AI MONITOR / OBSERVABILITY / CLAUDIO ONLY</span>
        <h1 class="hero-h1">What every model and agent is doing.</h1>
        <span class="hero-sub">Full transparency on the symbiotic NEX stack. Live data, live charts.</span>
      </div>
    </div>
    <div class="hero-right">
      <div class="hero-clock">
        <span class="clock-label">ZURICH</span>
        <span class="clock-val">{fmtClock()}</span>
      </div>
      <button class="refresh-btn" onclick={() => { refresh(); fetchSensors(); }} aria-label="Refresh">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
          <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
        </svg>
        {fmtRelative(new Date(refreshedAt).toISOString())}
      </button>
    </div>
  </header>

  {#if loading}
    <div class="loading-block">
      <span class="load-spinner" aria-hidden="true"></span>
      <span>Checking authorization...</span>
    </div>
  {:else if authorized}

  <!-- Section: Unified Sensor Strip (P1.8 - one fetch, all readings) -->
  <section class="section sensor-strip-section">
    <div class="section-head">
      <span class="section-eyebrow">LIVE SENSORS</span>
      <span class="section-sep"><span class="sep-dot"></span></span>
      <span class="section-sub">
        {#if sensorsAvailable && sensors}
          unified /ai-monitor-metrics - last refresh {fmtRelative(sensors.generated_at)}
        {:else if sensorsError}
          fallback (endpoint: {sensorsError})
        {:else}
          loading...
        {/if}
      </span>
    </div>
    {#if sensors}
      <div class="sensor-strip">
        {#each Object.entries(sensors.sensors) as [key, s]}
          <div class="sensor-pill status-{s.status}">
            <span class="sensor-dot" style="background: {sensorColor(s.status)}; box-shadow: 0 0 8px {sensorColor(s.status)};"></span>
            <span class="sensor-key">{key.replace('_', ' ')}</span>
            <span class="sensor-val">{s.value ?? '-'}</span>
            <span class="sensor-lbl">{s.label}</span>
          </div>
        {/each}
      </div>

      <!-- Compact 45-agent dot grid -->
      <div class="agent-dot-grid-wrap">
        <div class="dot-grid-head">
          <span class="dot-grid-title">AGENT HEARTBEAT GRID</span>
          <span class="dot-grid-legend">
            <span><span class="lg-dot" style="background:#22d3a5"></span> &lt; cadence</span>
            <span><span class="lg-dot" style="background:#f59e0b"></span> &lt; 3x cadence</span>
            <span><span class="lg-dot" style="background:#f43f5e"></span> &gt; 3x / dead</span>
            <span><span class="lg-dot" style="background:#64748b"></span> silent / no hb</span>
          </span>
        </div>
        <div class="agent-dot-grid">
          {#each sensors.heartbeats as h (h.agent_name)}
            <div class="agent-dot status-{h.status}" title="{h.agent_name} | {h.status} | {h.last_action ?? 'no action'} | {h.last_action_at ? fmtRelative(h.last_action_at) : 'never'}">
              <span class="adot" style="background: {sensorColor(h.status)};"></span>
              <span class="adot-name">{h.agent_name}</span>
            </div>
          {/each}
        </div>
      </div>
    {:else if !sensorsAvailable}
      <div class="empty-block">
        <span class="empty-icon">~</span>
        <em>unified sensor endpoint unavailable - using direct Supabase fallback below</em>
      </div>
    {:else}
      <div class="empty-block">
        <span class="load-spinner" aria-hidden="true"></span>
        <em>fetching sensors...</em>
      </div>
    {/if}
  </section>

  <!-- Section: System Health (radial gauges) -->
  <section class="section gauges-section">
    <div class="section-head">
      <span class="section-eyebrow">SYSTEM HEALTH</span>
      <span class="section-sep"><span class="sep-dot"></span></span>
      <span class="section-sub">six pillars, live status, second-precision recency</span>
    </div>
    <div class="gauge-grid">
      {#each gauges as g, i}
        {@const dash = (g.score / 100) * GAUGE_C * animGaugeProgress}
        <div class="gauge-card" style="--d: {i * 60}ms; --c: {g.color};">
          <div class="gauge-wrap">
            <svg viewBox="0 0 100 100" class="gauge-svg" aria-hidden="true">
              <defs>
                <linearGradient id={"gg-" + i} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color={g.color} stop-opacity="0.9"/>
                  <stop offset="100%" stop-color={g.color} stop-opacity="0.4"/>
                </linearGradient>
                <filter id={"gf-" + i} x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="2" result="blur"/>
                  <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                </filter>
              </defs>
              <circle cx="50" cy="50" r={GAUGE_R} fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="5"/>
              <circle
                cx="50" cy="50" r={GAUGE_R}
                fill="none"
                stroke={"url(#gg-" + i + ")"}
                stroke-width="5"
                stroke-linecap="round"
                stroke-dasharray={dash + " " + GAUGE_C}
                transform="rotate(-90 50 50)"
                filter={"url(#gf-" + i + ")"}
              />
              {#if g.score === 100}
                <circle cx="50" cy="50" r={GAUGE_R} fill="none" stroke={g.color} stroke-width="1" opacity="0.4" class="gauge-pulse-ring"/>
              {/if}
            </svg>
            <div class="gauge-center">
              <span class="gauge-num">{Math.round(g.score)}</span>
              <span class="gauge-unit">%</span>
            </div>
          </div>
          <div class="gauge-meta">
            <span class="gauge-label">{g.label}</span>
            <span class="gauge-status">{g.status}</span>
            <span class="gauge-sub">{g.sub}</span>
          </div>
        </div>
      {/each}
    </div>
  </section>

  <!-- Section: Top Metrics Row (Donut + RAG + Inference) -->
  <section class="section top-row">
    <!-- Decision donut HERO -->
    <div class="glass donut-card">
      <div class="card-head">
        <span class="card-eyebrow">DECISION OUTCOMES</span>
        <span class="card-tag">live</span>
      </div>
      <div class="donut-wrap">
        <svg viewBox="0 0 200 200" class="donut-svg" aria-hidden="true">
          <defs>
            <filter id="donutGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="blur"/>
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>
          <circle cx="100" cy="100" r="70" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="22"/>
          {#each donutSlices as s, i}
            <circle
              cx="100" cy="100" r="70"
              fill="none"
              stroke={s.color}
              stroke-width="22"
              stroke-dasharray={(s.len * animGaugeProgress).toFixed(2) + " " + (2 * Math.PI * 70).toFixed(2)}
              stroke-dashoffset={(-s.off).toFixed(2)}
              transform="rotate(-90 100 100)"
              opacity={s.key === "won" ? 1 : 0.92}
              class={s.key === "won" ? "donut-slice donut-won" : "donut-slice"}
              style="--di: {i * 80}ms"
              filter={s.key === "won" ? "url(#donutGlow)" : ""}
            />
          {/each}
        </svg>
        <div class="donut-center">
          <span class="donut-total">{Math.round(tweenedDonutTotal)}</span>
          <span class="donut-label">decisions</span>
          <span class="donut-win-rate"><i>{donutData.winRate}%</i> win rate</span>
        </div>
      </div>
      <div class="donut-legend">
        {#each donutSlices as s}
          <div class="legend-item">
            <span class="legend-dot" style="background: {s.color};"></span>
            <span class="legend-key">{s.key.replace("_", " ")}</span>
            <span class="legend-count">{s.count}</span>
            <span class="legend-pct">{s.pct}%</span>
          </div>
        {/each}
        {#if donutSlices.length === 0}
          <div class="legend-empty">No decisions logged yet.</div>
        {/if}
      </div>
    </div>

    <!-- RAG Index dual bar -->
    <div class="glass rag-card">
      <div class="card-head">
        <span class="card-eyebrow">RAG INDEX COVERAGE</span>
        <span class="card-tag violet">vault chunks</span>
      </div>
      <div class="rag-bars">
        <div class="rag-bar-col">
          <div class="rag-bar-track">
            <div class="rag-bar-fill cyan" style="height: 100%;"></div>
            <span class="rag-bar-count cyan">{Math.round(tweenedEmb).toLocaleString("de-CH")}</span>
          </div>
          <div class="rag-gauge-arc">
            <svg viewBox="0 0 60 36" aria-hidden="true">
              <path d="M5 32 A 25 25 0 0 1 55 32" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="4" stroke-linecap="round"/>
              <path
                d="M5 32 A 25 25 0 0 1 55 32"
                fill="none" stroke="#56bcec" stroke-width="4" stroke-linecap="round"
                stroke-dasharray={(78.54 * animGaugeProgress).toFixed(2) + " 78.54"}
              />
            </svg>
            <span class="rag-arc-label">100%</span>
          </div>
          <span class="rag-bar-name">MiniLM<i>384d</i></span>
        </div>

        <div class="rag-bar-col">
          <div class="rag-bar-track">
            <div class="rag-bar-fill violet" style="height: {(embeddingCount > 0 ? Math.max(2, Math.min(100, (embeddingV2Count / embeddingCount) * 100)) : 0) * animGaugeProgress}%;"></div>
            <span class="rag-bar-count violet">{Math.round(tweenedEmbV2).toLocaleString("de-CH")}</span>
          </div>
          <div class="rag-gauge-arc">
            <svg viewBox="0 0 60 36" aria-hidden="true">
              <path d="M5 32 A 25 25 0 0 1 55 32" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="4" stroke-linecap="round"/>
              <path
                d="M5 32 A 25 25 0 0 1 55 32"
                fill="none" stroke="#a78bfa" stroke-width="4" stroke-linecap="round"
                stroke-dasharray={((ragCoveragePct / 100) * 78.54 * animGaugeProgress).toFixed(2) + " 78.54"}
              />
            </svg>
            <span class="rag-arc-label violet">{ragCoveragePct}%</span>
          </div>
          <span class="rag-bar-name">BGE-M3<i>1024d</i></span>
        </div>
      </div>
      <div class="rag-foot">
        <span><b>{embeddingCount.toLocaleString("de-CH")}</b> total chunks indexed</span>
        <span><b class="violet">{embeddingV2Count.toLocaleString("de-CH")}</b> BGE-M3 covered</span>
        <span><b style="color: #22d3a5;">{retrievalCalls7d.toLocaleString("de-CH")}</b> retrievals 7d{retrievalAvailable ? '' : ' (no data)'}</span>
      </div>
    </div>

    <!-- Inference timeline -->
    <div class="glass inference-card">
      <div class="card-head">
        <span class="card-eyebrow">INFERENCE TIMELINE</span>
        <span class="card-tag amber">last {inferenceSeries.points.length} calls</span>
      </div>
      {#if !inferenceLogAvailable}
        <div class="empty-block">
          <span class="empty-icon">/</span>
          <em>inference log table not provisioned</em>
        </div>
      {:else if inferenceSeries.points.length === 0}
        <div class="empty-block">
          <span class="empty-icon">~</span>
          <em>no inference events yet</em>
        </div>
      {:else}
        <div class="inf-graph-wrap">
          <svg viewBox="0 0 100 100" class="inf-graph" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="infAreaGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="#56bcec" stop-opacity="0.35"/>
                <stop offset="100%" stop-color="#56bcec" stop-opacity="0.02"/>
              </linearGradient>
              <filter id="infGlow">
                <feGaussianBlur stdDeviation="0.6" result="b"/>
                <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
            </defs>
            <!-- grid lines -->
            <line x1="0" y1="25" x2="100" y2="25" stroke="rgba(255,255,255,0.04)" stroke-width="0.3"/>
            <line x1="0" y1="50" x2="100" y2="50" stroke="rgba(255,255,255,0.04)" stroke-width="0.3"/>
            <line x1="0" y1="75" x2="100" y2="75" stroke="rgba(255,255,255,0.04)" stroke-width="0.3"/>
            <!-- area fill -->
            <path d={buildAreaFill(inferenceSeries.points)} fill="url(#infAreaGrad)" class="inf-area"/>
            <!-- line -->
            <path
              d={buildAreaPath(inferenceSeries.points)}
              fill="none" stroke="#56bcec" stroke-width="0.6"
              stroke-linecap="round" stroke-linejoin="round"
              filter="url(#infGlow)"
              class="inf-line"
            />
            <!-- dots -->
            {#each inferenceSeries.points as p, i}
              <circle
                cx={p.x * 100}
                cy={100 - p.y * 92 - 4}
                r="0.7"
                fill="#56bcec"
                class="inf-dot"
                style="--di: {i * 18}ms"
              >
                <title>{p.row.model || p.row.endpoint} | {p.row.latency_ms ?? 0}ms | {p.row.total_tokens ?? 0} tok</title>
              </circle>
            {/each}
          </svg>
          <div class="inf-axis-y">
            <span>{inferenceSeries.maxY}<i>ms</i></span>
            <span>{Math.round(inferenceSeries.maxY / 2)}<i>ms</i></span>
            <span>0</span>
          </div>
        </div>
        <div class="inf-stats">
          <div class="inf-stat">
            <span class="inf-stat-val">{Math.round(tweenedAvgLat)}<i>ms</i></span>
            <span class="inf-stat-lbl">avg latency</span>
          </div>
          <div class="inf-stat">
            <span class="inf-stat-val">{inferenceStats.total}</span>
            <span class="inf-stat-lbl">total runs</span>
          </div>
          <div class="inf-stat">
            <span class="inf-stat-val">{Math.round(tweenedLocalPct)}<i>%</i></span>
            <span class="inf-stat-lbl">local share</span>
          </div>
        </div>
      {/if}
    </div>
  </section>

  <!-- Section: Agent Heartbeat grid with sparkline freshness bars -->
  <section class="section">
    <div class="section-head">
      <span class="section-eyebrow">AGENT HEARTBEATS</span>
      <span class="section-sep"><span class="sep-dot"></span></span>
      <span class="section-sub">{heartbeatsMerged.length} known / {heartbeats.length} live / {registryStats.silent} silent</span>
    </div>
    {#if heartbeatsMerged.length === 0}
      <div class="empty-block">
        <span class="empty-icon">o</span>
        <em>no agents reporting yet</em>
      </div>
    {:else}
      <div class="agent-grid">
        {#each heartbeatsMerged.slice(0, 60) as h, i (h.agent_name)}
          {@const dot = h._silent ? 'neutral' : statusDot(h.status)}
          {@const stale = !h._silent && isStaleHb(h as any)}
          {@const subagentIdle = stale && (h as any)._kind === 'claude_subagent'}
          {@const fresh = h._silent ? 0 : freshnessPct(h as any)}
          {@const conf = Math.round((h.confidence ?? 0) * 100)}
          <div class="agent-card dot-{dot} {h._silent ? 'is-silent' : ''} {stale && !subagentIdle ? 'is-stale' : ''} {subagentIdle ? 'is-idle' : ''}" style="--d: {i * 22}ms; --fresh-color: {freshnessColor(fresh)};">
            <div class="agent-top">
              <span class="agent-name">
                {#if h._kind}<span class="agent-kind-icon" title={kindLabel(h._kind)}>{kindIcon(h._kind)}</span>{/if}
                {h.agent_name}
              </span>
              <span class="agent-status-dot dot-{dot}" title={h._silent ? 'silent' : (h.status ?? 'idle')}>
                {#if dot === "run" || dot === "ok"}<span class="ripple"></span>{/if}
              </span>
            </div>
            <div class="agent-action">
              {#if h._silent}
                <span class="tag tag-silent">SILENT</span> {truncate(h.last_action, 70) || 'no heartbeat ever recorded'}
              {:else if subagentIdle}
                <span class="tag tag-idle">IDLE</span> {truncate(h.last_action, 70) || 'no recent action'}
              {:else if stale}
                <span class="tag tag-stale">STALE</span> {truncate(h.last_action, 70) || 'no recent action'}
              {:else}
                {truncate(h.last_action, 80) || 'idle'}
              {/if}
            </div>
            <!-- freshness sparkline bar -->
            <div class="agent-fresh">
              <div class="fresh-bar">
                <span class="fresh-fill" style="width: {fresh * animGaugeProgress}%; background: var(--fresh-color);"></span>
              </div>
              <span class="fresh-pct">{fresh}%</span>
            </div>
            <div class="agent-foot">
              <div class="conf-bar"><span style="--c: {conf}%"></span></div>
              <span class="agent-when">{fmtRelative(h.last_action_at)}</span>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <!-- Section: Local Models + RAG details -->
  <section class="section local-section">
    <div class="section-head">
      <span class="section-eyebrow">LOCAL MODELS</span>
      <span class="section-sep"><span class="sep-dot"></span></span>
      <span class="section-sub">BGE-M3 / Whisper / Qwen 2.5-7B / DeepSeek R1 / LoRA — live latency &amp; activity from nex_local_inference_log</span>
    </div>
    <div class="local-grid">
      <!-- BGE-M3 — real latency from nex_local_inference_log (CEO P0 health probe) -->
      <div class="loc-card status-{bgeStatus}">
        <div class="loc-head">
          <span class="loc-icon" style="color: #56bcec;">{"⊕"}</span>
          <span class="loc-name">BGE-M3 embed</span>
          <span class="loc-badge {bgeStatus === 'ok' ? 'ok' : (bgeStatus === 'lagging' ? 'warn' : 'err')}">
            {bgeStatus === 'ok' ? 'HEALTHY' : (bgeStatus === 'lagging' ? 'DEGRADED' : 'BROKEN')}
          </span>
        </div>
        <p class="loc-desc">Sidecar :8765 / 1024 dim / target <b>&lt;5s</b> per embed</p>
        <div class="loc-stats">
          <div class="loc-stat">
            <span class="loc-stat-val" style="color: {bgeStatus === 'ok' ? '#22d3a5' : bgeStatus === 'lagging' ? '#f59e0b' : '#f43f5e'};">
              {bgeLastLatencyMs != null ? (bgeLastLatencyMs >= 1000 ? (bgeLastLatencyMs / 1000).toFixed(1) + 's' : bgeLastLatencyMs + 'ms') : '-'}
            </span>
            <span class="loc-stat-lbl">last call</span>
          </div>
          <div class="loc-stat">
            <span class="loc-stat-val">
              {bgeAvgLatency7d != null ? (bgeAvgLatency7d >= 1000 ? (bgeAvgLatency7d / 1000).toFixed(1) + 's' : bgeAvgLatency7d + 'ms') : '-'}
            </span>
            <span class="loc-stat-lbl">avg 24h</span>
          </div>
          <div class="loc-stat">
            <span class="loc-stat-val">{bgeCallsLast24h}</span>
            <span class="loc-stat-lbl">calls 24h</span>
          </div>
        </div>
        <div class="loc-bar">
          <span class="loc-bar-fill" style="width: {Math.min(100, ragCoveragePct) * animGaugeProgress}%; background: {bgeStatus === 'ok' ? '#22d3a5' : bgeStatus === 'lagging' ? '#f59e0b' : '#f43f5e'};"></span>
        </div>
        <div class="loc-foot">
          <span>last embed: {bgeLastRunAt ? fmtRelative(bgeLastRunAt) : 'never'}</span>
          <span>{Math.round(tweenedEmb).toLocaleString("de-CH")} chunks indexed</span>
        </div>
      </div>

      <!-- Whisper — proven in production -->
      <div class="loc-card status-ok">
        <div class="loc-head">
          <span class="loc-icon" style="color: #22d3a5;">{"♪"}</span>
          <span class="loc-name">Whisper medium</span>
          <span class="loc-badge ok">PROVEN</span>
        </div>
        <p class="loc-desc">Speech-to-text / meeting recorder / on-demand</p>
        <div class="loc-stats">
          <div class="loc-stat">
            <span class="loc-stat-val" style="color: #22d3a5;">∞</span>
            <span class="loc-stat-lbl">on demand</span>
          </div>
          <div class="loc-stat">
            <span class="loc-stat-val">medium</span>
            <span class="loc-stat-lbl">tier</span>
          </div>
          <div class="loc-stat">
            <span class="loc-stat-val">DE+EN</span>
            <span class="loc-stat-lbl">langs</span>
          </div>
        </div>
        <div class="loc-foot">
          <span>cold-load on capture, no idle cost</span>
        </div>
      </div>

      <!-- Qwen 2.5 7B MLX -->
      <div class="loc-card status-{qwenLastSeenAt && ageMs(qwenLastSeenAt) < 3600_000 ? 'ok' : qwenLastSeenAt ? 'lagging' : 'idle'}">
        <div class="loc-head">
          <span class="loc-icon" style="color: #56bcec;">{"◈"}</span>
          <span class="loc-name">Qwen 2.5-7B</span>
          <span class="loc-badge {qwenLastSeenAt && ageMs(qwenLastSeenAt) < 3600_000 ? 'ok' : 'warn'}">
            {qwenLastSeenAt && ageMs(qwenLastSeenAt) < 3600_000 ? 'ACTIVE' : qwenLastSeenAt ? 'IDLE' : 'COLD'}
          </span>
        </div>
        <p class="loc-desc">MLX 4-bit / chat tier 2 / cold-load 3-5min</p>
        <div class="loc-stats">
          <div class="loc-stat">
            <span class="loc-stat-val">{inferenceStats.t2}</span>
            <span class="loc-stat-lbl">tier-2 runs</span>
          </div>
          <div class="loc-stat">
            <span class="loc-stat-val">{qwenLastSeenAt ? fmtRelative(qwenLastSeenAt) : 'never'}</span>
            <span class="loc-stat-lbl">last seen</span>
          </div>
          <div class="loc-stat">
            <span class="loc-stat-val">4-bit</span>
            <span class="loc-stat-lbl">quant</span>
          </div>
        </div>
        <div class="loc-foot">
          <span>backed by ollama qwen2.5:7b fallback</span>
        </div>
      </div>

      <!-- DeepSeek-R1-Distill -->
      <div class="loc-card status-{deepseekLastSeenAt && ageMs(deepseekLastSeenAt) < 3600_000 ? 'ok' : deepseekLastSeenAt ? 'lagging' : 'idle'}">
        <div class="loc-head">
          <span class="loc-icon" style="color: #a78bfa;">{"◉"}</span>
          <span class="loc-name">DeepSeek R1</span>
          <span class="loc-badge {deepseekLastSeenAt && ageMs(deepseekLastSeenAt) < 3600_000 ? 'ok' : 'warn'}">
            {deepseekLastSeenAt && ageMs(deepseekLastSeenAt) < 3600_000 ? 'ACTIVE' : deepseekLastSeenAt ? 'IDLE' : 'COLD'}
          </span>
        </div>
        <p class="loc-desc">Distill-Qwen-7B-4bit MLX / reasoning tier</p>
        <div class="loc-stats">
          <div class="loc-stat">
            <span class="loc-stat-val" style="color: #a78bfa;">7B</span>
            <span class="loc-stat-lbl">params</span>
          </div>
          <div class="loc-stat">
            <span class="loc-stat-val">{deepseekLastSeenAt ? fmtRelative(deepseekLastSeenAt) : 'never'}</span>
            <span class="loc-stat-lbl">last seen</span>
          </div>
          <div class="loc-stat">
            <span class="loc-stat-val">4-bit</span>
            <span class="loc-stat-lbl">quant</span>
          </div>
        </div>
        <div class="loc-foot">
          <span>endpoint: <code>reason_local</code></span>
        </div>
      </div>

      <!-- LoRA Training Corpus — pair count vs 150 target -->
      <div class="loc-card status-{loraPairCount >= LORA_TARGET_PAIRS ? 'ok' : loraPairCount > 0 ? 'lagging' : 'idle'}">
        <div class="loc-head">
          <span class="loc-icon" style="color: #a78bfa;">{"◎"}</span>
          <span class="loc-name">LoRA training corpus</span>
          <span class="loc-badge {loraPairCount >= LORA_TARGET_PAIRS ? 'ok' : 'warn'}">
            {loraPairCount >= LORA_TARGET_PAIRS ? 'READY' : Math.min(100, Math.round((loraPairCount / LORA_TARGET_PAIRS) * 100)) + '%'}
          </span>
        </div>
        <p class="loc-desc">Training pairs collected / target <b>{LORA_TARGET_PAIRS}</b> / weekly train via <code>nex-lora-train-week</code></p>
        <div class="loc-stats">
          <div class="loc-stat">
            <span class="loc-stat-val" style="color: #a78bfa;">{loraPairCount}</span>
            <span class="loc-stat-lbl">pairs</span>
          </div>
          <div class="loc-stat">
            <span class="loc-stat-val">{LORA_TARGET_PAIRS - loraPairCount > 0 ? LORA_TARGET_PAIRS - loraPairCount : 0}</span>
            <span class="loc-stat-lbl">to target</span>
          </div>
          <div class="loc-stat">
            <span class="loc-stat-val">{activeAdapters.length}</span>
            <span class="loc-stat-lbl">adapters</span>
          </div>
        </div>
        <div class="loc-bar">
          <span class="loc-bar-fill" style="width: {Math.min(100, Math.round((loraPairCount / LORA_TARGET_PAIRS) * 100)) * animGaugeProgress}%; background: #a78bfa;"></span>
        </div>
        <div class="loc-foot">
          <span>last train: {loraHb ? fmtRelative(loraHb.last_action_at) : 'never'}</span>
          <span>{loraPairsAvailable ? (loraHb?.last_action ? truncate(loraHb.last_action, 40) : 'awaiting pairs') : 'nex_lora_pairs not provisioned'}</span>
        </div>
      </div>
    </div>
  </section>

  <!-- Section: Bottom Row - Audit Ticker + Decision Timeline -->
  <section class="section bottom-row">
    <!-- Audit live ticker -->
    <div class="glass ticker-card">
      <div class="card-head">
        <span class="card-eyebrow">AUDIT FEED</span>
        <span class="card-tag {realtimeOk ? 'green' : 'amber'}">
          <span class="card-tag-dot"></span>
          {realtimeOk ? 'live' : 'polling'}
        </span>
      </div>
      {#if audit.length === 0}
        <div class="empty-block">
          <span class="empty-icon">~</span>
          <em>no recent events</em>
        </div>
      {:else}
        <div class="ticker-wrap">
          <div class="ticker-fade-top"></div>
          <ul class="ticker">
            {#each audit.slice(0, 40) as a, i (a.id)}
              <li class="ticker-row" style="--c: {tickerColor(a.action)}; --di: {Math.min(i, 8) * 30}ms;">
                <span class="ticker-bar"></span>
                <span class="ticker-time">{fmtTime(a.created_at)}</span>
                <span class="ticker-actor">{a.actor || "system"}</span>
                <span class="ticker-text">{fmtAction(a)}</span>
              </li>
            {/each}
          </ul>
          <div class="ticker-fade-bot"></div>
        </div>
      {/if}
    </div>

    <!-- Decision timeline -->
    <div class="glass timeline-card">
      <div class="card-head">
        <span class="card-eyebrow">DECISION TIMELINE</span>
        <span class="card-tag violet">{decisions.length}</span>
      </div>
      {#if decisions.length === 0}
        <div class="empty-block">
          <span class="empty-icon">.</span>
          <em>no decisions logged</em>
        </div>
      {:else}
        <ol class="timeline">
          <span class="timeline-spine"></span>
          {#each decisions.slice(0, 14) as d, i (d.id)}
            {@const oc = outcomeChip(d.outcome)}
            {@const isOpen = expandedDecision === d.id}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <li
              class="timeline-row pill-{oc.cls}"
              style="--d: {i * 50}ms"
              onclick={() => expandedDecision = isOpen ? null : d.id}
            >
              <span class="timeline-dot"></span>
              <div class="timeline-card-inner">
                <div class="timeline-head">
                  <span class="timeline-when">{fmtTime(d.decided_at ?? new Date().toISOString())}</span>
                  <span class="chip {oc.cls}">{oc.label}</span>
                  {#if d.client_code}<span class="chip-client">{d.client_code}</span>{/if}
                  <span class="timeline-actor">{d.recommended_by || "nex"}</span>
                </div>
                <div class="timeline-text {isOpen ? 'open' : ''}">{isOpen ? (d.decision || d.recommendation || d.chosen_action || '(no text)') : (truncate(d.decision || d.recommendation || d.chosen_action, 110) || '(no text)')}</div>
                {#if isOpen && d.rationale}
                  <div class="timeline-rationale">
                    <span class="rationale-label">rationale</span>
                    {d.rationale}
                  </div>
                {/if}
              </div>
            </li>
          {/each}
        </ol>
      {/if}
    </div>
  </section>

  <!-- Section: Registry coverage table (kept for full transparency) -->
  <section class="section">
    <div class="section-head">
      <span class="section-eyebrow">REGISTRY COVERAGE</span>
      <span class="section-sep"><span class="sep-dot"></span></span>
      <span class="section-sub">auto-discovered components from LaunchAgents, .claude/agents, .mcp.json, team-bots</span>
    </div>
    <div class="cov-grid">
      {#each ['launchagent','claude_subagent','mcp_server','bot'] as kind}
        {@const s = registryStats.byKind[kind] ?? { total: 0, heartbeating: 0, silent: 0 }}
        {@const pct = s.total > 0 ? Math.round((s.heartbeating / s.total) * 100) : 0}
        <div class="cov-card glass">
          <div class="cov-head">
            <span class="cov-icon">{kindIcon(kind)}</span>
            <span class="cov-label">{kindLabel(kind)}</span>
          </div>
          <div class="cov-stats">
            <span class="cov-total">{s.total}</span>
            <span class="cov-total-label">discovered</span>
          </div>
          <div class="cov-bar">
            <span class="cov-bar-fill" style="width: {pct * animGaugeProgress}%"></span>
          </div>
          <div class="cov-split">
            <span class="cov-split-item ok">{s.heartbeating}<i>heartbeat</i></span>
            <span class="cov-split-item silent">{s.silent}<i>silent</i></span>
          </div>
        </div>
      {/each}
    </div>

    {#if registry.length > 0}
      <details class="cov-detail">
        <summary class="cov-summary">Show full registry ({registry.length} components)</summary>
        <div class="cov-table-wrap">
          <table class="cov-table">
            <thead>
              <tr><th>Kind</th><th>Agent</th><th>Status</th><th>Last action</th><th>When</th><th>Cadence</th><th>Source</th></tr>
            </thead>
            <tbody>
              {#each registry as r}
                <tr class="cov-row liveness-{r.liveness}">
                  <td><span class="cov-icon-sm">{kindIcon(r.kind)}</span> {kindLabel(r.kind)}</td>
                  <td class="cov-agent-name">{r.agent_name}</td>
                  <td>
                    {#if r.liveness === 'heartbeating'}
                      <span class="cov-chip ok">{r.heartbeat_status ?? 'live'}</span>
                    {:else}
                      <span class="cov-chip silent">silent</span>
                    {/if}
                  </td>
                  <td class="cov-action">{truncate(r.heartbeat_last_action ?? r.purpose_one_line, 80) || '-'}</td>
                  <td class="cov-when">{fmtRelative(r.heartbeat_last_action_at)}</td>
                  <td class="cov-cadence">{r.expected_cadence_seconds ? r.expected_cadence_seconds + 's' : '-'}</td>
                  <td class="cov-source" title={r.source_file ?? ''}>{r.source_file ? r.source_file.split('/').slice(-2).join('/') : '-'}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </details>
    {/if}
  </section>

  {/if}
</div>

<style>
  :global(body) {
    background: #060912;
    color: #e2e8f0;
  }
  :global(html) { scroll-behavior: smooth; }
  :global(::-webkit-scrollbar) { width: 8px; height: 8px; }
  :global(::-webkit-scrollbar-track) { background: transparent; }
  :global(::-webkit-scrollbar-thumb) {
    background: rgba(86,188,236,0.18);
    border-radius: 999px;
    border: 1px solid rgba(86,188,236,0.08);
  }
  :global(::-webkit-scrollbar-thumb:hover) { background: rgba(86,188,236,0.35); }

  .page {
    position: relative;
    min-height: 100vh;
    padding: 22px 28px 80px;
    max-width: 1440px;
    margin: 0 auto;
    font-family: Inter, sans-serif;
    color: #e2e8f0;
    z-index: 1;
  }

  /* ----- Aurora background ----- */
  .aurora {
    position: fixed; inset: 0; z-index: 0;
    overflow: hidden; pointer-events: none;
    background:
      radial-gradient(ellipse at 20% 0%, rgba(86,188,236,0.08), transparent 50%),
      radial-gradient(ellipse at 80% 100%, rgba(167,139,250,0.07), transparent 55%),
      radial-gradient(ellipse at 50% 50%, rgba(34,211,165,0.025), transparent 60%),
      #060912;
  }
  .aurora-blob {
    position: absolute; border-radius: 50%; filter: blur(60px); opacity: 0.3;
  }
  .aurora-blob.a1 {
    width: 560px; height: 560px; left: -120px; top: -180px;
    background: radial-gradient(circle, rgba(86,188,236,0.4), transparent 70%);
    animation: drift1 28s ease-in-out infinite alternate;
  }
  .aurora-blob.a2 {
    width: 480px; height: 480px; right: -160px; top: 30%;
    background: radial-gradient(circle, rgba(167,139,250,0.32), transparent 70%);
    animation: drift2 34s ease-in-out infinite alternate;
  }
  .aurora-blob.a3 {
    width: 420px; height: 420px; left: 40%; bottom: -200px;
    background: radial-gradient(circle, rgba(34,211,165,0.18), transparent 70%);
    animation: drift3 42s ease-in-out infinite alternate;
  }
  @keyframes drift1 {
    from { transform: translate(0, 0) scale(1); }
    to   { transform: translate(120px, 80px) scale(1.15); }
  }
  @keyframes drift2 {
    from { transform: translate(0, 0) scale(1); }
    to   { transform: translate(-90px, 60px) scale(1.1); }
  }
  @keyframes drift3 {
    from { transform: translate(0, 0) scale(1); }
    to   { transform: translate(60px, -100px) scale(1.12); }
  }
  .aurora-grid {
    position: absolute; inset: 0;
    background-image:
      linear-gradient(rgba(86,188,236,0.04) 1px, transparent 1px),
      linear-gradient(90deg, rgba(86,188,236,0.04) 1px, transparent 1px);
    background-size: 60px 60px;
    mask-image: radial-gradient(ellipse at center, black 30%, transparent 75%);
    opacity: 0.4;
  }

  /* ----- Hero ----- */
  .hero {
    display: flex; justify-content: space-between; align-items: flex-start;
    gap: 16px; margin-bottom: 26px; flex-wrap: wrap;
    padding: 22px 24px;
    border-radius: 22px;
    background:
      linear-gradient(135deg, rgba(86,188,236,0.08) 0%, rgba(167,139,250,0.06) 50%, rgba(34,211,165,0.04) 100%),
      rgba(8,12,20,0.55);
    border: 1px solid rgba(86,188,236,0.18);
    backdrop-filter: blur(16px);
    position: relative;
    overflow: hidden;
  }
  .hero::before {
    content: ""; position: absolute; inset: 0;
    background: linear-gradient(115deg, transparent 0%, rgba(86,188,236,0.08) 45%, transparent 80%);
    transform: translateX(-100%);
    animation: shimmer 7s ease-in-out infinite;
    pointer-events: none;
  }
  @keyframes shimmer {
    0% { transform: translateX(-120%); }
    45% { transform: translateX(120%); }
    100% { transform: translateX(120%); }
  }
  .hero-left { display: flex; flex-direction: column; gap: 10px; position: relative; z-index: 1; }
  .back-link {
    display: inline-flex; align-items: center; gap: 6px;
    font: 500 11px/1 'JetBrains Mono', monospace;
    color: rgba(86,188,236,0.78);
    text-decoration: none;
    transition: color 0.2s;
    letter-spacing: 0.08em; text-transform: uppercase;
  }
  .back-link:hover { color: #56bcec; }
  .hero-title-block { display: flex; flex-direction: column; gap: 5px; padding-left: 16px; position: relative; }
  .hero-pulse {
    position: absolute; left: 0; top: 6px;
    width: 10px; height: 10px; border-radius: 50%;
    background: #22d3a5;
    box-shadow: 0 0 0 0 rgba(34,211,165,0.55);
    animation: pulse-hero 1.8s ease-out infinite;
  }
  @keyframes pulse-hero {
    0% { box-shadow: 0 0 0 0 rgba(34,211,165,0.55); }
    70% { box-shadow: 0 0 0 14px rgba(34,211,165,0); }
    100% { box-shadow: 0 0 0 0 rgba(34,211,165,0); }
  }
  .hero-eyebrow {
    font: 600 10px/1 'JetBrains Mono', monospace;
    letter-spacing: 0.18em; color: #56bcec;
    text-transform: uppercase;
  }
  .hero-h1 {
    margin: 0; font: 700 28px/1.1 Inter, sans-serif;
    letter-spacing: -0.025em; color: #f8fafc;
  }
  .hero-sub {
    font: 400 12px/1.4 Inter, sans-serif; color: #94a3b8;
  }
  .hero-right { display: flex; align-items: center; gap: 12px; position: relative; z-index: 1; }
  .hero-clock {
    display: flex; flex-direction: column; align-items: flex-end; gap: 2px;
    padding: 8px 14px;
    border-radius: 12px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(86,188,236,0.12);
  }
  .clock-label {
    font: 600 9px/1 'JetBrains Mono', monospace; letter-spacing: 0.18em;
    color: #64748b;
  }
  .clock-val {
    font: 700 16px/1 'JetBrains Mono', monospace; color: #56bcec;
    font-variant-numeric: tabular-nums;
    text-shadow: 0 0 12px rgba(86,188,236,0.4);
  }
  .refresh-btn {
    all: unset; cursor: pointer;
    display: inline-flex; align-items: center; gap: 7px;
    padding: 10px 14px; border-radius: 12px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(86,188,236,0.18);
    color: #94a3b8;
    font: 500 11px/1 'JetBrains Mono', monospace;
    transition: all 0.2s;
  }
  .refresh-btn:hover {
    background: rgba(86,188,236,0.10);
    border-color: rgba(86,188,236,0.45);
    color: #56bcec;
    transform: translateY(-1px);
    box-shadow: 0 6px 20px -8px rgba(86,188,236,0.4);
  }

  /* ----- Loading ----- */
  .loading-block {
    display: flex; align-items: center; gap: 12px;
    padding: 60px 24px; color: #64748b;
    font: 500 13px/1 Inter, sans-serif;
  }
  .load-spinner {
    width: 22px; height: 22px; border-radius: 50%;
    border: 2px solid rgba(86,188,236,0.18);
    border-top-color: #56bcec;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ----- Sections ----- */
  .section { margin-bottom: 24px; }
  .section-head {
    display: flex; align-items: center; gap: 14px;
    margin-bottom: 16px;
    padding: 0 4px;
  }
  .section-eyebrow {
    font: 700 10px/1 'JetBrains Mono', monospace;
    letter-spacing: 0.18em; color: #56bcec;
    text-transform: uppercase;
    white-space: nowrap;
  }
  .section-sep {
    flex: 1; height: 1px;
    background: linear-gradient(90deg, rgba(86,188,236,0.4), rgba(86,188,236,0.04));
    position: relative;
  }
  .sep-dot {
    position: absolute; top: -2px; left: 0;
    width: 5px; height: 5px; border-radius: 50%;
    background: #56bcec;
    box-shadow: 0 0 8px rgba(86,188,236,0.7);
    animation: travel 5s ease-in-out infinite;
  }
  @keyframes travel {
    0%, 100% { left: 0%; opacity: 1; }
    45% { left: 95%; opacity: 1; }
    50% { opacity: 0; }
    55% { left: 0%; opacity: 0; }
    60% { opacity: 1; }
  }
  .section-sub {
    font: 400 11px/1 Inter, sans-serif; color: #64748b;
    white-space: nowrap;
  }

  /* ----- Glass card base ----- */
  .glass {
    background:
      linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015));
    border: 1px solid rgba(86,188,236,0.12);
    border-radius: 18px;
    backdrop-filter: blur(16px);
    transition: border-color 0.25s, transform 0.25s, box-shadow 0.25s;
  }
  .glass:hover {
    border-color: rgba(86,188,236,0.30);
    transform: translateY(-3px);
    box-shadow: 0 16px 42px -16px rgba(86,188,236,0.22);
  }

  .card-head {
    display: flex; justify-content: space-between; align-items: center;
    padding: 16px 18px 12px;
    border-bottom: 1px solid rgba(255,255,255,0.04);
  }
  .card-eyebrow {
    font: 700 10px/1 'JetBrains Mono', monospace;
    letter-spacing: 0.16em; color: #56bcec;
    text-transform: uppercase;
  }
  .card-tag {
    font: 700 9px/1 'JetBrains Mono', monospace;
    letter-spacing: 0.1em; text-transform: uppercase;
    padding: 4px 8px; border-radius: 999px;
    background: rgba(86,188,236,0.12); color: #56bcec;
    display: inline-flex; align-items: center; gap: 5px;
  }
  .card-tag.violet { background: rgba(167,139,250,0.14); color: #a78bfa; }
  .card-tag.amber  { background: rgba(245,158,11,0.14);  color: #f59e0b; }
  .card-tag.green  { background: rgba(34,211,165,0.14);  color: #22d3a5; }
  .card-tag-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: currentColor;
    animation: pulse-dot 1.8s ease-in-out infinite;
  }
  @keyframes pulse-dot {
    0%, 100% { opacity: 1; box-shadow: 0 0 0 0 currentColor; }
    50% { opacity: 0.5; box-shadow: 0 0 0 4px transparent; }
  }

  /* ----- Gauge grid ----- */
  .gauge-grid {
    display: grid; gap: 14px;
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }
  @media (max-width: 1100px) { .gauge-grid { grid-template-columns: repeat(3, 1fr); } }
  @media (max-width: 680px)  { .gauge-grid { grid-template-columns: repeat(2, 1fr); } }

  .gauge-card {
    display: flex; flex-direction: column; align-items: center; gap: 10px;
    padding: 18px 14px;
    border-radius: 16px;
    background:
      linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015));
    border: 1px solid rgba(86,188,236,0.12);
    backdrop-filter: blur(16px);
    transition: border-color 0.25s, transform 0.25s, box-shadow 0.25s;
    animation: card-in 0.5s var(--d, 0ms) both;
  }
  .gauge-card:hover {
    transform: translateY(-3px);
    border-color: var(--c, rgba(86,188,236,0.3));
    box-shadow: 0 16px 36px -16px color-mix(in srgb, var(--c) 30%, transparent);
  }
  @keyframes card-in {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: none; }
  }
  .gauge-wrap {
    position: relative; width: 100px; height: 100px;
  }
  .gauge-svg { width: 100%; height: 100%; }
  .gauge-pulse-ring {
    transform-origin: 50% 50%;
    animation: gauge-ring 2.4s ease-out infinite;
  }
  @keyframes gauge-ring {
    0% { transform: scale(1); opacity: 0.6; }
    100% { transform: scale(1.18); opacity: 0; }
  }
  .gauge-center {
    position: absolute; inset: 0;
    display: flex; align-items: center; justify-content: center; gap: 1px;
  }
  .gauge-num {
    font: 700 26px/1 'JetBrains Mono', monospace;
    color: var(--c, #56bcec);
    font-variant-numeric: tabular-nums;
    text-shadow: 0 0 14px color-mix(in srgb, var(--c) 35%, transparent);
  }
  .gauge-unit {
    font: 600 11px/1 'JetBrains Mono', monospace; color: #64748b;
  }
  .gauge-meta { text-align: center; display: flex; flex-direction: column; gap: 2px; min-width: 0; width: 100%; }
  .gauge-label {
    font: 700 10px/1 'JetBrains Mono', monospace;
    letter-spacing: 0.12em; color: #cbd5e1;
    text-transform: uppercase;
  }
  .gauge-status {
    font: 600 11px/1 'JetBrains Mono', monospace;
    color: var(--c, #56bcec);
    text-transform: lowercase;
  }
  .gauge-sub {
    font: 400 10px/1.3 Inter, sans-serif; color: #64748b;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }

  /* ----- Top row grid ----- */
  .top-row {
    display: grid; gap: 16px;
    grid-template-columns: 1.1fr 0.9fr 1.2fr;
  }
  @media (max-width: 1100px) { .top-row { grid-template-columns: 1fr 1fr; } .inference-card { grid-column: 1 / -1; } }
  @media (max-width: 680px) { .top-row { grid-template-columns: 1fr; } .inference-card { grid-column: auto; } }

  /* ----- Donut ----- */
  .donut-card { padding-bottom: 16px; }
  .donut-wrap {
    position: relative;
    width: 240px; height: 240px;
    margin: 12px auto 8px;
  }
  .donut-svg { width: 100%; height: 100%; transform: rotate(0deg); }
  .donut-slice {
    transition: stroke-dasharray 0.9s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .donut-won {
    animation: won-pulse 2.6s ease-in-out infinite;
  }
  @keyframes won-pulse {
    0%, 100% { opacity: 1; filter: brightness(1); }
    50%      { opacity: 0.88; filter: brightness(1.4); }
  }
  .donut-center {
    position: absolute; inset: 0;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
  }
  .donut-total {
    font: 700 46px/1 'JetBrains Mono', monospace;
    color: #f8fafc;
    font-variant-numeric: tabular-nums;
    text-shadow: 0 0 20px rgba(86,188,236,0.35);
  }
  .donut-label {
    font: 600 10px/1 'JetBrains Mono', monospace;
    letter-spacing: 0.18em; color: #64748b;
    text-transform: uppercase;
  }
  .donut-win-rate {
    font: 500 11px/1 Inter, sans-serif; color: #94a3b8;
    margin-top: 4px;
  }
  .donut-win-rate i {
    font-style: normal; font-weight: 700; color: #22d3a5;
    font-family: 'JetBrains Mono', monospace;
  }
  .donut-legend {
    display: grid; grid-template-columns: 1fr 1fr; gap: 6px 14px;
    padding: 12px 18px 4px;
  }
  .legend-item {
    display: grid; grid-template-columns: 10px 1fr auto auto; gap: 8px; align-items: center;
    font: 500 11px/1 Inter, sans-serif; color: #cbd5e1;
  }
  .legend-dot { width: 8px; height: 8px; border-radius: 50%; }
  .legend-key { text-transform: capitalize; color: #94a3b8; }
  .legend-count { font: 700 11px/1 'JetBrains Mono', monospace; color: #f1f5f9; }
  .legend-pct { font: 500 10px/1 'JetBrains Mono', monospace; color: #64748b; }
  .legend-empty {
    grid-column: 1 / -1;
    font: 400 11px/1.4 Inter, sans-serif; color: #64748b;
    font-style: italic; text-align: center; padding: 8px;
  }

  /* ----- RAG dual bar ----- */
  .rag-card { padding-bottom: 16px; }
  .rag-bars {
    display: grid; grid-template-columns: 1fr 1fr; gap: 18px;
    padding: 20px 24px 8px;
  }
  .rag-bar-col {
    display: flex; flex-direction: column; align-items: center; gap: 8px;
  }
  .rag-bar-track {
    position: relative;
    width: 64px; height: 140px;
    border-radius: 12px;
    background:
      linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01));
    border: 1px solid rgba(255,255,255,0.06);
    overflow: hidden;
  }
  .rag-bar-fill {
    position: absolute; left: 0; right: 0; bottom: 0;
    transition: height 0.9s cubic-bezier(0.22, 1, 0.36, 1);
    border-radius: 12px;
  }
  .rag-bar-fill.cyan {
    background: linear-gradient(180deg, rgba(86,188,236,0.55), rgba(86,188,236,0.22));
    box-shadow: inset 0 0 30px rgba(86,188,236,0.35);
  }
  .rag-bar-fill.violet {
    background: linear-gradient(180deg, rgba(167,139,250,0.55), rgba(167,139,250,0.22));
    box-shadow: inset 0 0 30px rgba(167,139,250,0.35);
  }
  .rag-bar-count {
    position: absolute; left: 50%; top: 8px; transform: translateX(-50%);
    font: 700 12px/1 'JetBrains Mono', monospace;
    font-variant-numeric: tabular-nums;
  }
  .rag-bar-count.cyan   { color: #56bcec; text-shadow: 0 0 10px rgba(86,188,236,0.55); }
  .rag-bar-count.violet { color: #a78bfa; text-shadow: 0 0 10px rgba(167,139,250,0.55); }
  .rag-gauge-arc {
    position: relative;
    width: 60px; height: 36px;
    display: flex; align-items: flex-end; justify-content: center;
  }
  .rag-gauge-arc svg { width: 60px; height: 36px; }
  .rag-arc-label {
    position: absolute; left: 50%; bottom: 0; transform: translateX(-50%);
    font: 700 11px/1 'JetBrains Mono', monospace;
    color: #56bcec;
    font-variant-numeric: tabular-nums;
  }
  .rag-arc-label.violet { color: #a78bfa; }
  .rag-bar-name {
    font: 700 10px/1 'JetBrains Mono', monospace;
    letter-spacing: 0.1em; color: #cbd5e1;
    text-transform: uppercase;
    display: flex; flex-direction: column; align-items: center; gap: 2px;
  }
  .rag-bar-name i {
    font-style: normal; font-weight: 500; font-size: 9px;
    color: #475569; letter-spacing: 0.04em;
  }
  .rag-foot {
    display: flex; justify-content: space-between;
    padding: 8px 18px 4px;
    font: 500 10px/1.3 'JetBrains Mono', monospace;
    color: #64748b;
  }
  .rag-foot b { color: #cbd5e1; font-weight: 700; }
  .rag-foot b.violet { color: #a78bfa; }

  /* ----- Inference timeline ----- */
  .inference-card { padding-bottom: 14px; }
  .inf-graph-wrap {
    position: relative;
    padding: 12px 18px 8px;
    height: 220px;
    display: flex;
  }
  .inf-graph {
    flex: 1; height: 100%;
    width: auto;
  }
  .inf-area {
    animation: area-fade 1.1s ease-out both;
    transform-origin: bottom;
  }
  @keyframes area-fade {
    from { opacity: 0; transform: scaleY(0); }
    to   { opacity: 1; transform: scaleY(1); }
  }
  .inf-line {
    stroke-dasharray: 800;
    stroke-dashoffset: 800;
    animation: line-draw 1.4s ease-out 0.1s forwards;
  }
  @keyframes line-draw {
    to { stroke-dashoffset: 0; }
  }
  .inf-dot {
    opacity: 0;
    animation: dot-in 0.4s ease-out var(--di, 0ms) forwards;
  }
  @keyframes dot-in {
    from { opacity: 0; transform: scale(0); }
    to   { opacity: 1; transform: none; }
  }
  .inf-axis-y {
    display: flex; flex-direction: column; justify-content: space-between;
    padding: 4px 0 4px 8px;
    font: 600 9px/1 'JetBrains Mono', monospace; color: #475569;
    width: 50px;
    text-align: right;
  }
  .inf-axis-y i { font-style: normal; font-weight: 400; color: #334155; margin-left: 1px; }
  .inf-stats {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;
    padding: 4px 18px 12px;
  }
  .inf-stat {
    display: flex; flex-direction: column; gap: 3px;
    padding: 10px 12px;
    border-radius: 10px;
    background: rgba(255,255,255,0.025);
    border: 1px solid rgba(255,255,255,0.05);
  }
  .inf-stat-val {
    font: 700 18px/1 'JetBrains Mono', monospace;
    color: #56bcec; font-variant-numeric: tabular-nums;
  }
  .inf-stat-val i { font-style: normal; font-size: 10px; color: #475569; margin-left: 3px; font-weight: 500; }
  .inf-stat-lbl {
    font: 600 9px/1 'JetBrains Mono', monospace;
    letter-spacing: 0.12em; color: #64748b;
    text-transform: uppercase;
  }

  /* ----- Agent grid ----- */
  .agent-grid {
    display: grid; gap: 10px;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  }
  .agent-card {
    padding: 12px 14px;
    border-radius: 12px;
    background:
      linear-gradient(135deg, rgba(255,255,255,0.035), rgba(255,255,255,0.015));
    border: 1px solid rgba(86,188,236,0.10);
    border-left: 2px solid rgba(86,188,236,0.4);
    backdrop-filter: blur(20px) saturate(1.4);
    display: flex; flex-direction: column; gap: 8px;
    animation: card-in 0.4s var(--d, 0ms) both;
    transition: border-color 0.2s, transform 0.2s, box-shadow 0.2s;
  }
  .agent-card:hover {
    transform: translateY(-2px);
    border-color: rgba(86,188,236,0.32);
    box-shadow: 0 14px 28px -16px rgba(86,188,236,0.3);
  }
  .agent-card.dot-run  { border-left-color: #56bcec; }
  .agent-card.dot-ok   { border-left-color: #22d3a5; }
  .agent-card.dot-err  { border-left-color: #f43f5e; }
  .agent-card.is-silent { opacity: 0.55; border-style: dashed; border-left-color: rgba(148,163,184,0.5); }
  .agent-card.is-stale  { border-left-color: #f43f5e; }
  .agent-card.is-idle   { border-left-color: #6366f1; opacity: 0.8; }
  .agent-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .agent-name {
    font: 600 12px/1.2 Inter, sans-serif; color: #f1f5f9;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .agent-kind-icon {
    color: #56bcec; margin-right: 4px; font-size: 11px;
  }
  .agent-status-dot {
    position: relative;
    width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
    background: #475569;
  }
  .agent-status-dot.dot-ok { background: #22d3a5; }
  .agent-status-dot.dot-run { background: #56bcec; }
  .agent-status-dot.dot-err { background: #f43f5e; }
  .ripple {
    position: absolute; inset: -1px;
    border-radius: 50%;
    border: 1px solid currentColor;
    opacity: 0; pointer-events: none;
    animation: ripple 2s ease-out infinite;
  }
  @keyframes ripple {
    0% { transform: scale(1); opacity: 0.6; }
    100% { transform: scale(2.6); opacity: 0; }
  }
  .agent-action {
    font: 400 11px/1.4 Inter, sans-serif; color: #94a3b8;
    overflow: hidden;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  }
  .tag {
    display: inline-block; padding: 1px 6px; margin-right: 5px;
    border-radius: 4px;
    font: 700 8px/1 'JetBrains Mono', monospace; letter-spacing: 0.08em;
  }
  .tag-silent { background: rgba(148,163,184,0.15); color: #94a3b8; }
  .tag-stale  { background: rgba(244,63,94,0.16); color: #fda4af; }
  .tag-idle   { background: rgba(99,102,241,0.16); color: #a5b4fc; }

  .agent-fresh { display: flex; align-items: center; gap: 8px; }
  .fresh-bar {
    flex: 1; height: 4px; border-radius: 3px;
    background: rgba(255,255,255,0.04);
    overflow: hidden;
    position: relative;
  }
  .fresh-fill {
    display: block; height: 100%;
    transition: width 0.9s cubic-bezier(0.22, 1, 0.36, 1);
    box-shadow: 0 0 8px var(--fresh-color, transparent);
  }
  .fresh-pct {
    font: 600 9px/1 'JetBrains Mono', monospace;
    color: var(--fresh-color, #94a3b8);
    min-width: 28px; text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .agent-foot { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .conf-bar {
    flex: 1; height: 3px; border-radius: 2px;
    background: rgba(255,255,255,0.05); overflow: hidden;
  }
  .conf-bar > span {
    display: block; height: 100%; width: var(--c, 0%);
    background: linear-gradient(90deg, #56bcec, #a78bfa);
    transition: width 0.7s ease;
    box-shadow: 0 0 6px rgba(86,188,236,0.4);
  }
  .agent-when {
    font: 500 10px/1 'JetBrains Mono', monospace; color: #475569;
    white-space: nowrap;
  }

  /* ----- Local cards ----- */
  .local-grid {
    display: grid; gap: 14px;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  @media (max-width: 1000px) { .local-grid { grid-template-columns: 1fr; } }

  .loc-card {
    padding: 18px;
    border-radius: 16px;
    background:
      linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015));
    border: 1px solid rgba(86,188,236,0.12);
    border-left: 3px solid rgba(100,116,139,0.6);
    backdrop-filter: blur(16px);
    display: flex; flex-direction: column; gap: 12px;
    transition: border-color 0.25s, transform 0.25s, box-shadow 0.25s;
  }
  .loc-card:hover {
    transform: translateY(-3px);
    border-color: rgba(86,188,236,0.32);
    box-shadow: 0 16px 36px -16px rgba(86,188,236,0.28);
  }
  .loc-card.status-ok      { border-left-color: #22d3a5; }
  .loc-card.status-lagging { border-left-color: #f59e0b; }
  .loc-card.status-stale   { border-left-color: #f43f5e; }
  .loc-card.status-idle    { border-left-color: #475569; }
  .loc-head { display: flex; align-items: center; gap: 10px; }
  .loc-icon { font-size: 22px; }
  .loc-name { flex: 1; font: 700 14px/1 Inter, sans-serif; color: #f8fafc; letter-spacing: 0.02em; }
  .loc-badge {
    padding: 3px 8px; border-radius: 6px;
    font: 700 9px/1 'JetBrains Mono', monospace; letter-spacing: 0.08em;
  }
  .loc-badge.ok   { background: rgba(34,211,165,0.16); color: #22d3a5; }
  .loc-badge.warn { background: rgba(245,158,11,0.16); color: #f59e0b; }
  .loc-badge.err  { background: rgba(244,63,94,0.16);  color: #f43f5e; }
  .loc-desc { margin: 0; font: 400 11px/1.4 Inter, sans-serif; color: #94a3b8; }
  .loc-desc code {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    background: rgba(167,139,250,0.15); color: #c4b5fd;
    padding: 1px 5px; border-radius: 4px;
  }
  .loc-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .loc-stat {
    display: flex; flex-direction: column; gap: 3px;
    padding: 10px 12px;
    border-radius: 10px;
    background: rgba(255,255,255,0.025);
    border: 1px solid rgba(255,255,255,0.04);
  }
  .loc-stat-val {
    font: 700 17px/1 'JetBrains Mono', monospace;
    color: #56bcec; font-variant-numeric: tabular-nums;
  }
  .loc-stat-val i { font-style: normal; font-size: 10px; color: #475569; margin-left: 2px; font-weight: 500; }
  .loc-stat-lbl {
    font: 600 9px/1 'JetBrains Mono', monospace;
    letter-spacing: 0.1em; color: #475569;
    text-transform: uppercase;
  }
  .loc-bar {
    height: 4px; border-radius: 3px;
    background: rgba(255,255,255,0.06); overflow: hidden;
  }
  .loc-bar-fill {
    display: block; height: 100%;
    background: linear-gradient(90deg, #56bcec, #a78bfa);
    transition: width 0.9s ease;
    box-shadow: 0 0 10px rgba(86,188,236,0.4);
  }
  .loc-foot {
    display: flex; justify-content: space-between; gap: 10px;
    font: 500 10px/1.3 'JetBrains Mono', monospace; color: #64748b;
    flex-wrap: wrap;
  }

  /* ----- Bottom row ----- */
  .bottom-row {
    display: grid; gap: 16px;
    grid-template-columns: 1fr 1fr;
  }
  @media (max-width: 1000px) { .bottom-row { grid-template-columns: 1fr; } }

  /* ----- Audit ticker ----- */
  .ticker-card { display: flex; flex-direction: column; min-height: 420px; }
  .ticker-wrap {
    position: relative; flex: 1;
    padding: 0 4px 0 14px;
    overflow: hidden;
  }
  .ticker {
    list-style: none; margin: 0; padding: 8px 8px 12px 4px;
    display: flex; flex-direction: column; gap: 4px;
    max-height: 440px;
    overflow-y: auto;
  }
  .ticker-row {
    display: grid;
    grid-template-columns: 3px auto auto 1fr;
    gap: 10px; align-items: center;
    padding: 8px 12px;
    border-radius: 10px;
    background: rgba(255,255,255,0.02);
    border: 1px solid rgba(255,255,255,0.03);
    font-size: 11px;
    animation: slide-in 0.42s ease-out var(--di, 0ms) both;
    transition: background 0.2s, border-color 0.2s, transform 0.2s;
  }
  .ticker-row:hover {
    background: rgba(86,188,236,0.05);
    border-color: rgba(86,188,236,0.18);
    transform: translateX(2px);
  }
  @keyframes slide-in {
    from { opacity: 0; transform: translateY(-6px); }
    to   { opacity: 1; transform: none; }
  }
  .ticker-bar {
    width: 3px; height: 26px; border-radius: 2px;
    background: var(--c, #475569);
    box-shadow: 0 0 8px var(--c, transparent);
  }
  .ticker-time {
    font: 600 10px/1 'JetBrains Mono', monospace; color: #475569;
    white-space: nowrap;
  }
  .ticker-actor {
    font: 500 10px/1 Inter, sans-serif; color: #94a3b8;
    white-space: nowrap;
  }
  .ticker-text {
    font: 400 11px/1.3 Inter, sans-serif; color: #e2e8f0;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .ticker-fade-top, .ticker-fade-bot {
    position: absolute; left: 0; right: 0; height: 24px;
    pointer-events: none; z-index: 2;
  }
  .ticker-fade-top {
    top: 0;
    background: linear-gradient(180deg, rgba(8,12,20,0.85), transparent);
  }
  .ticker-fade-bot {
    bottom: 0;
    background: linear-gradient(0deg, rgba(8,12,20,0.85), transparent);
  }

  /* ----- Decision timeline ----- */
  .timeline-card { display: flex; flex-direction: column; min-height: 420px; }
  .timeline {
    list-style: none; margin: 0;
    padding: 16px 18px 12px 14px;
    position: relative;
    max-height: 440px;
    overflow-y: auto;
  }
  .timeline-spine {
    position: absolute; top: 16px; bottom: 16px; left: 26px;
    width: 1px;
    background: linear-gradient(180deg, rgba(86,188,236,0.4), rgba(86,188,236,0.05));
  }
  .timeline-row {
    position: relative;
    padding: 10px 0 10px 28px;
    cursor: pointer;
    animation: card-in 0.4s var(--d, 0ms) both;
  }
  .timeline-dot {
    position: absolute; left: 8px; top: 18px;
    width: 12px; height: 12px; border-radius: 50%;
    background: #56bcec;
    border: 2px solid #060912;
    box-shadow: 0 0 0 1px rgba(86,188,236,0.4), 0 0 12px rgba(86,188,236,0.4);
  }
  .timeline-row.pill-success .timeline-dot { background: #22d3a5; box-shadow: 0 0 0 1px rgba(34,211,165,0.4), 0 0 12px rgba(34,211,165,0.4); }
  .timeline-row.pill-danger .timeline-dot  { background: #f43f5e; box-shadow: 0 0 0 1px rgba(244,63,94,0.4), 0 0 12px rgba(244,63,94,0.4); }
  .timeline-row.pill-warn .timeline-dot    { background: #f59e0b; box-shadow: 0 0 0 1px rgba(245,158,11,0.4), 0 0 12px rgba(245,158,11,0.4); }
  .timeline-row.pill-neutral .timeline-dot { background: #64748b; box-shadow: 0 0 0 1px rgba(148,163,184,0.3); }
  .timeline-card-inner {
    padding: 10px 12px;
    border-radius: 12px;
    background: rgba(255,255,255,0.025);
    border: 1px solid rgba(255,255,255,0.04);
    transition: background 0.2s, border-color 0.2s, transform 0.2s;
  }
  .timeline-row:hover .timeline-card-inner {
    background: rgba(86,188,236,0.05);
    border-color: rgba(86,188,236,0.18);
    transform: translateX(2px);
  }
  .timeline-head {
    display: flex; align-items: center; gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 6px;
  }
  .timeline-when {
    font: 600 10px/1 'JetBrains Mono', monospace; color: #64748b;
  }
  .chip {
    padding: 2px 7px; border-radius: 999px;
    font: 700 8.5px/1 'JetBrains Mono', monospace; letter-spacing: 0.1em;
  }
  .chip.success { background: rgba(34,211,165,0.16); color: #22d3a5; box-shadow: 0 0 10px rgba(34,211,165,0.18); }
  .chip.brand   { background: rgba(86,188,236,0.16); color: #56bcec; box-shadow: 0 0 10px rgba(86,188,236,0.18); }
  .chip.danger  { background: rgba(244,63,94,0.16);  color: #f43f5e; box-shadow: 0 0 10px rgba(244,63,94,0.18); }
  .chip.neutral { background: rgba(148,163,184,0.16);color: #94a3b8; }
  .chip.warn    { background: rgba(245,158,11,0.16); color: #f59e0b; box-shadow: 0 0 10px rgba(245,158,11,0.18); }
  .chip-client {
    font: 700 9.5px/1 'JetBrains Mono', monospace;
    color: #56bcec; letter-spacing: 0.08em;
    padding: 2px 6px; border-radius: 4px;
    background: rgba(86,188,236,0.08);
    border: 1px solid rgba(86,188,236,0.18);
  }
  .timeline-actor {
    font: 500 10px/1 Inter, sans-serif; color: #94a3b8;
    margin-left: auto;
  }
  .timeline-text {
    font: 400 12px/1.4 Inter, sans-serif; color: #e2e8f0;
    overflow: hidden;
  }
  .timeline-text:not(.open) {
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  }
  .timeline-rationale {
    margin-top: 8px; padding: 8px 10px;
    border-radius: 8px;
    background: rgba(167,139,250,0.06);
    border-left: 2px solid rgba(167,139,250,0.5);
    font: 400 11px/1.5 Inter, sans-serif; color: #cbd5e1;
  }
  .rationale-label {
    display: block;
    font: 700 8.5px/1 'JetBrains Mono', monospace;
    letter-spacing: 0.14em; color: #a78bfa;
    text-transform: uppercase; margin-bottom: 4px;
  }

  /* ----- Empty block ----- */
  .empty-block {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 10px; padding: 36px 24px;
    color: #64748b;
  }
  .empty-icon {
    font: 700 28px/1 'JetBrains Mono', monospace;
    color: rgba(86,188,236,0.3);
  }
  .empty-block em {
    font: 400 12px/1.4 Inter, sans-serif; font-style: italic; color: #64748b;
  }

  /* ----- Registry coverage ----- */
  .cov-grid {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;
  }
  @media (max-width: 900px) { .cov-grid { grid-template-columns: repeat(2, 1fr); } }
  .cov-card {
    padding: 16px;
    display: flex; flex-direction: column; gap: 10px;
  }
  .cov-head { display: flex; align-items: center; gap: 8px; margin-bottom: 0; }
  .cov-icon { font-size: 18px; color: #56bcec; }
  .cov-label {
    font: 700 10px/1 'JetBrains Mono', monospace;
    letter-spacing: 0.1em; color: #cbd5e1; text-transform: uppercase;
  }
  .cov-stats { display: flex; align-items: baseline; gap: 8px; }
  .cov-total {
    font: 700 30px/1 'JetBrains Mono', monospace; color: #f8fafc;
    font-variant-numeric: tabular-nums;
  }
  .cov-total-label {
    font: 600 10px/1 'JetBrains Mono', monospace;
    color: #64748b; text-transform: uppercase; letter-spacing: 0.1em;
  }
  .cov-bar {
    height: 4px; border-radius: 3px;
    background: rgba(255,255,255,0.06); overflow: hidden;
  }
  .cov-bar-fill {
    display: block; height: 100%;
    background: linear-gradient(90deg, #56bcec, #a78bfa);
    transition: width 0.9s ease;
    box-shadow: 0 0 10px rgba(86,188,236,0.4);
  }
  .cov-split { display: flex; gap: 14px; }
  .cov-split-item {
    font: 600 12px/1 Inter, sans-serif; color: #cbd5e1;
    display: flex; align-items: baseline; gap: 4px;
    font-variant-numeric: tabular-nums;
  }
  .cov-split-item i {
    font: 600 9px/1 'JetBrains Mono', monospace; font-style: normal;
    color: #475569; text-transform: uppercase; letter-spacing: 0.08em;
  }
  .cov-split-item.ok { color: #22d3a5; }
  .cov-split-item.silent { color: #94a3b8; }
  .cov-detail { margin-top: 18px; }
  .cov-summary {
    cursor: pointer; padding: 10px 14px;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(86,188,236,0.12);
    border-radius: 10px;
    font: 600 11px/1 'JetBrains Mono', monospace;
    color: #cbd5e1; letter-spacing: 0.06em;
    list-style: none; user-select: none;
    transition: all 0.2s;
  }
  .cov-summary::-webkit-details-marker { display: none; }
  .cov-summary:hover {
    color: #56bcec;
    border-color: rgba(86,188,236,0.32);
    background: rgba(86,188,236,0.05);
  }
  .cov-table-wrap {
    margin-top: 12px; overflow-x: auto;
    border-radius: 10px;
    border: 1px solid rgba(86,188,236,0.08);
  }
  .cov-table { width: 100%; border-collapse: collapse; font: 400 11px/1.4 Inter, sans-serif; }
  .cov-table thead th {
    text-align: left; padding: 10px 12px;
    background: rgba(86,188,236,0.04);
    color: #94a3b8;
    font: 700 10px/1 'JetBrains Mono', monospace;
    letter-spacing: 0.08em; text-transform: uppercase;
    border-bottom: 1px solid rgba(86,188,236,0.08);
  }
  .cov-table tbody td {
    padding: 8px 12px; color: #cbd5e1;
    border-bottom: 1px solid rgba(255,255,255,0.04);
    vertical-align: top;
  }
  .cov-row.liveness-silent td { color: #64748b; }
  .cov-agent-name { font: 600 11px/1.2 'JetBrains Mono', monospace; color: #f1f5f9; }
  .cov-row.liveness-silent .cov-agent-name { color: #94a3b8; }
  .cov-action { max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cov-when, .cov-cadence, .cov-source {
    font: 500 10px/1.2 'JetBrains Mono', monospace; color: #64748b;
  }
  .cov-source { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cov-icon-sm { color: #56bcec; }
  .cov-chip {
    display: inline-block; padding: 2px 8px; border-radius: 4px;
    font: 700 9px/1 'JetBrains Mono', monospace;
    letter-spacing: 0.06em; text-transform: uppercase;
  }
  .cov-chip.ok { background: rgba(34,211,165,0.15); color: #22d3a5; }
  .cov-chip.silent { background: rgba(148,163,184,0.15); color: #94a3b8; }

  /* ----- Unified Sensor Strip (P1.8) ----- */
  .sensor-strip-section { margin-bottom: 22px; }
  .sensor-strip {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 8px;
    margin-bottom: 16px;
  }
  .sensor-pill {
    display: grid;
    grid-template-columns: 8px auto 1fr;
    grid-template-areas:
      "dot key   val"
      ".   lbl   lbl";
    column-gap: 8px;
    row-gap: 2px;
    align-items: center;
    padding: 10px 12px;
    border-radius: 12px;
    background: linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015));
    border: 1px solid rgba(86,188,236,0.10);
    backdrop-filter: blur(14px);
    transition: border-color 0.2s, transform 0.2s, box-shadow 0.2s;
  }
  .sensor-pill:hover {
    transform: translateY(-2px);
    border-color: rgba(86,188,236,0.32);
    box-shadow: 0 10px 24px -12px rgba(86,188,236,0.3);
  }
  .sensor-pill.status-warn  { border-color: rgba(245,158,11,0.28); }
  .sensor-pill.status-error { border-color: rgba(244,63,94,0.32); }
  .sensor-pill.status-idle  { opacity: 0.7; }
  .sensor-dot {
    grid-area: dot;
    width: 8px; height: 8px; border-radius: 50%;
    align-self: center;
  }
  .sensor-key {
    grid-area: key;
    font: 700 9px/1 'JetBrains Mono', monospace;
    color: #cbd5e1; letter-spacing: 0.12em; text-transform: uppercase;
  }
  .sensor-val {
    grid-area: val; justify-self: end;
    font: 700 16px/1 'JetBrains Mono', monospace;
    color: #f8fafc; font-variant-numeric: tabular-nums;
  }
  .sensor-lbl {
    grid-area: lbl;
    font: 500 10px/1.3 Inter, sans-serif;
    color: #64748b;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }

  /* ----- Agent dot grid (compact 45+ dots) ----- */
  .agent-dot-grid-wrap {
    padding: 14px 16px;
    border-radius: 14px;
    background: linear-gradient(135deg, rgba(255,255,255,0.035), rgba(255,255,255,0.012));
    border: 1px solid rgba(86,188,236,0.10);
    backdrop-filter: blur(14px);
  }
  .dot-grid-head {
    display: flex; justify-content: space-between; align-items: center;
    gap: 12px; margin-bottom: 10px;
    flex-wrap: wrap;
  }
  .dot-grid-title {
    font: 700 10px/1 'JetBrains Mono', monospace;
    letter-spacing: 0.14em; color: #56bcec; text-transform: uppercase;
  }
  .dot-grid-legend {
    display: flex; gap: 14px;
    font: 500 9px/1 'JetBrains Mono', monospace;
    color: #94a3b8; letter-spacing: 0.04em;
    flex-wrap: wrap;
  }
  .lg-dot {
    display: inline-block;
    width: 6px; height: 6px; border-radius: 50%;
    margin-right: 4px; vertical-align: middle;
  }
  .agent-dot-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 4px 10px;
  }
  .agent-dot {
    display: flex; align-items: center; gap: 6px;
    padding: 3px 6px;
    border-radius: 6px;
    transition: background 0.15s;
    cursor: default;
  }
  .agent-dot:hover { background: rgba(86,188,236,0.05); }
  .adot {
    width: 7px; height: 7px; border-radius: 50%;
    box-shadow: 0 0 6px currentColor;
    flex-shrink: 0;
  }
  .agent-dot.status-ok .adot { box-shadow: 0 0 8px #22d3a5; }
  .agent-dot.status-warn .adot { box-shadow: 0 0 8px #f59e0b; }
  .agent-dot.status-error .adot { box-shadow: 0 0 8px #f43f5e; animation: dot-blink 1.6s ease-in-out infinite; }
  @keyframes dot-blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
  .adot-name {
    font: 500 10px/1.2 'JetBrains Mono', monospace;
    color: #cbd5e1;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .agent-dot.status-idle .adot-name { color: #64748b; }

</style>

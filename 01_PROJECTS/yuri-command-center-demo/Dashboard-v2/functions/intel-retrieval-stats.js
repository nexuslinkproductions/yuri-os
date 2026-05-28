/**
 * intel-retrieval-stats.js — Phase 1.7 ε1 retrieval-quality aggregator.
 *
 * Returns the JSON payload backing /intel/retrieval. Reads:
 *   - nex_retrieval_log         (queries, top_results, used_results, latency, caller)
 *   - nex_embeddings            (corpus baseline for hot/cold corner detection)
 *   - nex_drift_log             (δ1 trend over time)
 *   - nex_coherence_holds       (δ2 pending + recent decisions)
 *   - nex_memory_open_conflicts (δ3 unresolved triple conflicts)
 *
 * Range default: last 7 days. Override via ?days=N (max 30).
 *
 * Exposed at /.netlify/functions/intel-retrieval-stats — read-only,
 * service-role on the server, browser fetches via authenticated session.
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

async function pgGet(path) {
  const url = SUPABASE_URL.replace(/\/$/, '') + path;
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) throw new Error(`GET ${path} → HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

function quantile(arr, q) {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function dayKey(ts) {
  return new Date(ts).toISOString().slice(0, 10);
}

exports.handler = async (event) => {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'SUPABASE not configured' }) };
  }
  const days = Math.min(30, Math.max(1, parseInt(event.queryStringParameters?.days || '7', 10)));
  const since = new Date(Date.now() - days * 86400000).toISOString();

  try {
    // ── Retrieval log
    const log = await pgGet(
      `/rest/v1/nex_retrieval_log?occurred_at=gte.${since}&select=occurred_at,query,top_results,used_results,latency_ms,caller&order=occurred_at.desc&limit=5000`,
    );

    // Embeddings: paginate via offset (PostgREST default cap is 1000).
    // 2285 chunks at our current size → 3 pages.
    const embeddingsByType = [];
    for (let off = 0; off < 50000; off += 1000) {
      const page = await pgGet(
        `/rest/v1/nex_embeddings?select=source_type,source_ref&limit=1000&offset=${off}`,
      ).catch(() => []);
      if (!page || page.length === 0) break;
      embeddingsByType.push(...page);
      if (page.length < 1000) break;
    }
    const totalEmbeddings = embeddingsByType.length;
    const allRefs = new Set(embeddingsByType.map((r) => r.source_ref));
    const refsByType = {};
    for (const e of embeddingsByType) {
      refsByType[e.source_type] = (refsByType[e.source_type] || 0) + 1;
    }

    // ── Aggregations
    const queryCount = log.length;
    const hits = log.filter((r) => Array.isArray(r.top_results) && r.top_results.length > 0);
    const used = log.filter((r) => Array.isArray(r.used_results) && r.used_results.length > 0);
    const hitRate  = queryCount ? hits.length / queryCount : null;
    const usedRate = queryCount ? used.length / queryCount : null;

    const latencies = log.map((r) => r.latency_ms).filter(Number.isFinite);
    const latency = {
      p50: latencies.length ? Math.round(quantile(latencies, 0.5))  : null,
      p95: latencies.length ? Math.round(quantile(latencies, 0.95)) : null,
      max: latencies.length ? Math.max(...latencies) : null,
    };

    // Volume per day
    const perDay = {};
    for (const r of log) {
      const k = dayKey(r.occurred_at);
      perDay[k] = (perDay[k] || 0) + 1;
    }
    const volumeSeries = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      volumeSeries.push({ day: d, count: perDay[d] || 0 });
    }

    // Per-caller breakdown
    const perCaller = {};
    for (const r of log) {
      const k = r.caller || 'unknown';
      perCaller[k] = (perCaller[k] || 0) + 1;
    }
    const callers = Object.entries(perCaller)
      .map(([caller, count]) => ({ caller, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Hot corners: most-cited source_ref across top_results
    const refHits = new Map();
    for (const r of log) {
      if (!Array.isArray(r.top_results)) continue;
      for (const tr of r.top_results) {
        const ref = tr.source_ref || tr.ref;
        if (!ref) continue;
        refHits.set(ref, (refHits.get(ref) || 0) + 1);
      }
    }
    const hotCorners = [...refHits.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([source_ref, hits]) => ({ source_ref, hits }));

    // Cold corners: refs in nex_embeddings that never appeared in any top_results
    const cited = new Set(refHits.keys());
    const cold = [...allRefs].filter((r) => !cited.has(r));
    const coldSample = cold.slice(0, 12);
    const coldByType = {};
    for (const ref of cold) {
      const e = embeddingsByType.find((x) => x.source_ref === ref);
      if (e) coldByType[e.source_type] = (coldByType[e.source_type] || 0) + 1;
    }

    // ── Drift / coherence / memory side-stats + MOVE 3 Eve G master-pane data
    const todayISO   = new Date().toISOString().slice(0, 10) + 'T00:00:00Z';
    const tomorrowISO = new Date(Date.now() + 86400000).toISOString().slice(0, 10) + 'T00:00:00Z';
    const weekAhead  = new Date(Date.now() + 7 * 86400000).toISOString();

    const [
      drift, coherenceHolds, memoryConflicts,
      mcpCalls, weeklyRollup, agentsToday,
      commitmentsTodayDue, commitmentsOverdue,
      gapStats, weeklyExamples, agentHealth,
      canonicalSummaryRows, topPredicates, coldFacts, suspectRows,
      moduleStatusRows,
    ] = await Promise.all([
      pgGet(`/rest/v1/nex_drift_log?occurred_at=gte.${since}&select=occurred_at,trend,distance,caller&order=occurred_at.desc&limit=500`).catch(() => []),
      pgGet(`/rest/v1/nex_coherence_holds?occurred_at=gte.${since}&select=id,occurred_at,decision,anomaly_score,text,caller&order=occurred_at.desc&limit=200`).catch(() => []),
      pgGet(`/rest/v1/nex_memory_open_conflicts?select=*`).catch(() => []),
      pgGet(`/rest/v1/nex_mcp_calls?occurred_at=gte.${since}&select=tool,status,latency_ms&order=occurred_at.desc&limit=5000`).catch(() => []),
      pgGet(`/rest/v1/nex_weekly_self_review_rollup?select=*`).catch(() => []),
      pgGet(`/rest/v1/decisions?decided_at=gte.${todayISO}&select=id,recommended_by,outcome,client_code,target_entity_id,recommendation,decided_at&order=decided_at.desc&limit=200`).catch(() => []),
      pgGet(`/rest/v1/commitments?due_at=gte.${todayISO}&due_at=lt.${encodeURIComponent(tomorrowISO)}&status=in.(open,pending)&select=id,promise,due_at,actor&order=due_at.asc&limit=50`).catch(() => []),
      pgGet(`/rest/v1/commitments?due_at=lt.${todayISO}&status=in.(open,pending)&select=id,promise,due_at,actor&order=due_at.desc&limit=50`).catch(() => []),
      pgGet(`/rest/v1/nex_weekly_gap_stats?select=*`).catch(() => []),
      pgGet(`/rest/v1/nex_weekly_self_review_examples?select=*`).catch(() => []),
      pgGet(`/rest/v1/nex_agent_health_summary?select=*`).catch(() => []),
      pgGet(`/rest/v1/nex_canonical_store_summary?select=*`).catch(() => []),
      pgGet(`/rest/v1/nex_canonical_top_predicates?select=*`).catch(() => []),
      pgGet(`/rest/v1/nex_canonical_cold_facts?select=*`).catch(() => []),
      pgGet(`/rest/v1/nex_canonical_suspect?status=eq.open&select=*&order=detected_at.desc&limit=10`).catch(() => []),
      pgGet(`/rest/v1/nex_module_status?select=*&order=category.asc,module_name.asc`).catch(() => []),
    ]);
    const canonicalSummary = (canonicalSummaryRows && canonicalSummaryRows[0]) || {};

    const driftCounts = drift.reduce((m, r) => ({ ...m, [r.trend]: (m[r.trend] || 0) + 1 }), {});
    const coherenceCounts = coherenceHolds.reduce(
      (m, r) => ({ ...m, [r.decision]: (m[r.decision] || 0) + 1 }),
      {},
    );

    // Group memory conflicts by triple
    const triples = new Map();
    for (const r of memoryConflicts) {
      const k = `${r.subject_type}::${r.subject_id}::${r.predicate}`;
      if (!triples.has(k)) {
        triples.set(k, {
          subject_type: r.subject_type,
          subject_id:   r.subject_id,
          predicate:    r.predicate,
          live_count:   r.live_count,
          facts:        [],
        });
      }
      triples.get(k).facts.push({
        id: r.id, value: r.value, actor: r.actor, confidence: r.confidence,
        source: r.source, source_ref: r.source_ref, recorded_at: r.recorded_at,
      });
    }

    const payload = {
      window: { days, since, generated_at: new Date().toISOString() },
      retrieval: {
        query_count:          queryCount,
        hit_rate:             hitRate,
        used_rate:            usedRate,
        latency,
        volume_series:        volumeSeries,
        callers,
        hot_corners:          hotCorners,
        cold: {
          total:       cold.length,
          by_type:     coldByType,
          sample:      coldSample,
        },
        index: {
          total_embeddings: totalEmbeddings,
          by_source_type:   refsByType,
        },
      },
      drift: {
        total:      drift.length,
        by_trend:   driftCounts,
        recent:     drift.slice(0, 5).map((r) => ({
          occurred_at: r.occurred_at, trend: r.trend, distance: r.distance, caller: r.caller,
        })),
      },
      coherence: {
        pending:    coherenceCounts.pending || 0,
        shipped:    coherenceCounts.shipped || 0,
        edited:     coherenceCounts.edited  || 0,
        killed:     coherenceCounts.killed  || 0,
        recent:     coherenceHolds.slice(0, 5).map((r) => ({
          id: r.id, occurred_at: r.occurred_at, decision: r.decision,
          anomaly_score: r.anomaly_score, text_excerpt: (r.text || '').slice(0, 120),
        })),
      },
      memory: {
        open_clusters:   triples.size,
        total_facts:     memoryConflicts.length,
        clusters:        [...triples.values()].slice(0, 10),
      },

      // ── MOVE 3 Eve G master pane sections ────────────────────────────
      mcp_calls: (() => {
        const byTool = {};
        for (const r of mcpCalls) {
          if (!byTool[r.tool]) byTool[r.tool] = { fires: 0, ok: 0, errors: 0, latency_total: 0 };
          byTool[r.tool].fires += 1;
          if (r.status === 'ok') byTool[r.tool].ok += 1;
          else if (r.status && !['ok','skipped','not_initialized','no_canonical','no_evidence'].includes(r.status))
            byTool[r.tool].errors += 1;
          if (Number.isFinite(r.latency_ms)) byTool[r.tool].latency_total += r.latency_ms;
        }
        return {
          total: mcpCalls.length,
          by_tool: Object.entries(byTool)
            .map(([tool, c]) => ({
              tool, fires: c.fires, ok: c.ok, errors: c.errors,
              avg_latency_ms: c.fires ? Math.round(c.latency_total / c.fires) : null,
            }))
            .sort((a, b) => b.fires - a.fires),
        };
      })(),

      decisions: {
        weekly_rollup: weeklyRollup,
        today: {
          total: agentsToday.length,
          by_agent: Object.entries(agentsToday.reduce((m, d) => {
            m[d.recommended_by] = (m[d.recommended_by] || 0) + 1;
            return m;
          }, {})).map(([agent, count]) => ({ agent, count })).sort((a, b) => b.count - a.count),
          recent: agentsToday.slice(0, 8).map((d) => ({
            id: d.id, agent: d.recommended_by, outcome: d.outcome,
            client_code: d.client_code, target: d.target_entity_id,
            preview: (d.recommendation || '').slice(0, 100),
            at: d.decided_at,
          })),
        },
        weekly_examples: weeklyExamples,
      },

      commitments: {
        due_today: commitmentsTodayDue.map((c) => ({
          id: c.id, promise: (c.promise || '').slice(0, 120), due_at: c.due_at, actor: c.actor,
        })),
        overdue: commitmentsOverdue.map((c) => ({
          id: c.id, promise: (c.promise || '').slice(0, 120), due_at: c.due_at, actor: c.actor,
          days_overdue: Math.floor((Date.now() - new Date(c.due_at).getTime()) / 86400000),
        })),
        due_today_count: commitmentsTodayDue.length,
        overdue_count: commitmentsOverdue.length,
      },

      gaps: gapStats[0] || { detected_this_week: 0, resolved_this_week: 0, surfaced_this_week: 0, still_open: 0, snoozed: 0, stale_surfaced: 0 },

      module_status: {
        total: moduleStatusRows.length,
        active:    moduleStatusRows.filter((m) => m.status === 'active').length,
        degraded:  moduleStatusRows.filter((m) => m.status === 'degraded').length,
        silent:    moduleStatusRows.filter((m) => m.status === 'silent').length,
        not_initialized: moduleStatusRows.filter((m) => m.status === 'not_initialized').length,
        unknown:   moduleStatusRows.filter((m) => m.status === 'unknown').length,
        last_refresh: moduleStatusRows.length ? moduleStatusRows.reduce((max, m) => m.updated_at > max ? m.updated_at : max, moduleStatusRows[0].updated_at) : null,
        modules: moduleStatusRows.map((m) => ({
          name: m.module_name,
          display: m.display_name,
          category: m.category,
          status: m.status,
          last_signal_at: m.last_signal_at,
          data_points: m.data_points,
          notes: m.notes,
          updated_at: m.updated_at,
        })),
      },

      canonical_store: {
        total_active: canonicalSummary.total_active || 0,
        distinct_subjects: canonicalSummary.distinct_subjects || 0,
        distinct_predicates: canonicalSummary.distinct_predicates || 0,
        freshness: {
          fresh: canonicalSummary.fresh || 0,
          aging: canonicalSummary.aging || 0,
          stale: canonicalSummary.stale || 0,
          unknown: canonicalSummary.unknown || 0,
        },
        sources: {
          from_vault: canonicalSummary.from_vault || 0,
          from_chat:  canonicalSummary.from_chat  || 0,
          from_other: canonicalSummary.from_other || 0,
        },
        suspects: {
          open: canonicalSummary.suspects_open || 0,
          new_this_week: canonicalSummary.suspects_new || 0,
          recent: (suspectRows || []).slice(0, 5).map((s) => ({
            id: s.id, subject_id: s.subject_id, predicate: s.predicate,
            vault_value: s.vault_value, canonical_value: s.canonical_value,
            detected_at: s.detected_at,
          })),
        },
        top_predicates: (topPredicates || []).map((p) => ({ predicate: p.predicate, count: p.cnt })),
        cold_facts: (coldFacts || []).slice(0, 10).map((c) => ({
          id: c.id, subject_id: c.subject_id, predicate: c.predicate,
          age_days: Math.round(Number(c.age_days || 0)),
        })),
      },

      agent_health: {
        total: agentHealth.length,
        fresh: agentHealth.filter((a) => a.health_status === 'fresh').length,
        stale: agentHealth.filter((a) => a.health_status === 'stale').length,
        dead:  agentHealth.filter((a) => a.health_status === 'dead').length,
        unknown: agentHealth.filter((a) => a.health_status === 'unknown').length,
        agents: agentHealth.map((a) => ({
          name: a.agent_name,
          status: a.reported_status,
          health: a.health_status,
          last_action: a.last_action,
          last_seen: a.last_seen,
          minutes_since: Number(a.minutes_since_seen),
          expected_cadence_minutes: a.expected_cadence_minutes,
        })),
      },
    };

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=30' },
      body: JSON.stringify(payload),
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e.message, stack: e.stack?.split('\n').slice(0, 5) }),
    };
  }
};

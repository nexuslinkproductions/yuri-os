/**
 * nex-rag-query.js
 * Lightweight RAG query endpoint for the ClientDrawer "Ask NEX" strip.
 * Queries the Supabase entity_state + decisions tables for context and
 * returns a brief answer. Production: wire to the nex-rvf MCP server or
 * the /chat function for full Claude generation.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.PUBLIC_SUPABASE_ANON;

export default async function handler(req, context) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { query, client_code, client_name } = body;
  if (!query || typeof query !== "string") {
    return new Response(JSON.stringify({ error: "query is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const qLow = query.toLowerCase();
  const context_chunks = [];

  // ── 1. Pull relevant entity_state rows ────────────────────────────
  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

      // Client entity
      if (client_code) {
        const { data: clientRow } = await sb
          .from("entity_state")
          .select("state, updated_at")
          .eq("entity_type", "client")
          .eq("entity_id", client_code)
          .maybeSingle();
        if (clientRow) {
          const s = clientRow.state || {};
          context_chunks.push(
            `Client: ${s.name || client_code} | Stage: ${s.stage || "?"} | MRR: CHF ${s.monthly_revenue || 0} | Contract: ${s.contract_status || "?"} | Email: ${s.contact_email || s.email || "?"} | Last contact: ${s.last_contact || clientRow.updated_at}`
          );
        }
      }

      // Open tickets
      if (client_code) {
        const { data: ticketRows } = await sb
          .from("entity_state")
          .select("entity_id, state")
          .eq("entity_type", "ticket")
          .ilike("state->>customer", `%${client_name || client_code}%`)
          .limit(20);
        if (ticketRows && ticketRows.length > 0) {
          const tixSummary = ticketRows
            .filter(t => !t.state?.is_done)
            .slice(0, 10)
            .map(t => `${t.entity_id}: ${t.state?.name || "(untitled)"} [${t.state?.state || "?"}] prio:${t.state?.priority || "?"}`)
            .join("; ");
          if (tixSummary) context_chunks.push(`Open tickets: ${tixSummary}`);
        }
      }

      // Decisions
      if (client_code) {
        const { data: decisions } = await sb
          .from("decisions")
          .select("decision, rationale, outcome, created_at")
          .eq("client_code", client_code)
          .order("created_at", { ascending: false })
          .limit(5);
        if (decisions && decisions.length > 0) {
          const decSummary = decisions
            .map(d => `[${(d.created_at || "").slice(0, 10)}] ${d.decision}${d.outcome ? " → " + d.outcome : ""}`)
            .join("; ");
          context_chunks.push(`Past decisions: ${decSummary}`);
        }
      }

      // Audit log — last meaningful NEX actions for this client
      if (client_code) {
        const { data: auditRows } = await sb
          .from("audit_log")
          .select("action, details, created_at")
          .eq("entity_id", client_code)
          .order("created_at", { ascending: false })
          .limit(5);
        if (auditRows && auditRows.length > 0) {
          const auditSummary = auditRows
            .map(r => `${(r.created_at || "").slice(0, 10)} ${r.action}`)
            .join("; ");
          context_chunks.push(`Recent activity: ${auditSummary}`);
        }
      }
    } catch (e) {
      console.warn("[nex-rag-query] Supabase fetch error:", e.message);
    }
  }

  // ── 2. Attempt Claude generation via /chat function ───────────────
  // If /chat is not available we fall back to a rule-based stub answer.
  try {
    const chatUrl = `${process.env.URL || "https://ops.c2moviez.com"}/.netlify/functions/chat`;
    const chatBody = {
      message: query,
      context: {
        client_code,
        client_name,
        rag_context: context_chunks.join("\n"),
        mode: "nex_rag_query",
        system_hint: "You are NEX, the autonomous COO of c2moviez. Answer concisely in 2-4 sentences using the provided context.",
      },
    };

    const chatRes = await fetch(chatUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Source": "nex-rag-query",
      },
      body: JSON.stringify(chatBody),
      signal: AbortSignal.timeout(12000),
    });

    if (chatRes.ok) {
      const data = await chatRes.json();
      const answer = data?.response || data?.message || data?.text || "";
      if (answer) {
        return new Response(
          JSON.stringify({ answer, source: "nex-chat", context_chunks }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
    }
  } catch {
    // fall through to stub
  }

  // ── 3. Rule-based stub fallback ───────────────────────────────────
  let stubAnswer = "";

  if (context_chunks.length === 0) {
    stubAnswer = `No data found for ${client_name || client_code} in the system. Check the Obsidian vault or Plane.so directly.`;
  } else if (/revenue|mrr|invoice|billing|paid/.test(qLow)) {
    const rev = context_chunks.find(c => c.includes("MRR"));
    stubAnswer = rev
      ? `Based on entity_state: ${rev.split("|").filter(s => s.includes("MRR") || s.includes("Contract")).join(" | ")}.`
      : `Revenue data found. ${context_chunks[0]}`;
  } else if (/ticket|task|issue|open|overdue/.test(qLow)) {
    const tix = context_chunks.find(c => c.startsWith("Open tickets"));
    stubAnswer = tix || `No matching ticket context found for "${query}".`;
  } else if (/decision|recommend|next|action|follow/.test(qLow)) {
    const dec = context_chunks.find(c => c.startsWith("Past decisions"));
    stubAnswer = dec || `No decisions on file yet for ${client_name || client_code}.`;
  } else {
    stubAnswer = `Context retrieved for ${client_name || client_code}: ${context_chunks[0] || "no data"}. Full RAG (nex-rvf) not reachable - Claude generation unavailable.`;
  }

  return new Response(
    JSON.stringify({ answer: stubAnswer, source: "stub", context_chunks }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

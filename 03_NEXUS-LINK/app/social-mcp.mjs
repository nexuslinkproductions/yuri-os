#!/usr/bin/env node
/**
 * social-mcp.mjs — NEXUS social aggregator MCP server.
 *
 * The July 5 design, honored: ONE aggregator endpoint, 7 curated verbs, no
 * CRUD dump. Any MCP-capable LLM client drives the same content pipeline
 * Marcel sees in the Nexus dashboard. Approval gate is protocol-level:
 * post_now refuses anything whose status is not "approved".
 *
 * Zero-dep (node builtins only). JSON-RPC 2.0 over HTTP POST /mcp.
 *
 * Run:   node 03_NEXUS-LINK/app/social-mcp.mjs            (port 8787)
 * Auth:  Authorization: Bearer $NEXUS_MCP_TOKEN (required if env is set;
 *        if unset, localhost-only access is allowed without a token)
 */
import { createServer } from "node:http";
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, appendFileSync, renameSync } from "node:fs";
import { join, dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { store } from "./backend/store.mjs";
import { policy } from "./backend/policy.mjs";
import "./backend/rules.mjs"; // subscribes the detection engine to the policy gate

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DRAFTS = join(ROOT, "00_COMMAND-CENTER", "Inbox", "content-drafts");
const LEDGER = join(ROOT, "_SYSTEM", "content-engine", "content-ledger.jsonl");
const INBOX = join(ROOT, "_SYSTEM", "signals-radar", "threads-inbox");
const SWEEPS = join(ROOT, "_SYSTEM", "signals-radar", "signals");
const PORT = Number(process.env.NEXUS_MCP_PORT || 8787);
const TOKEN = process.env.NEXUS_MCP_TOKEN || "";

const today = () => new Date().toISOString().slice(0, 10);

// ── draft store helpers ─────────────────────────────────────────────────────
function* walkDrafts() {
  if (!existsSync(DRAFTS)) return;
  for (const day of readdirSync(DRAFTS).sort()) {
    const dir = join(DRAFTS, day);
    for (const f of readdirSync(dir)) {
      if (f.endsWith(".md")) yield { id: `${day}/${f}`, day, file: f, path: join(dir, f) };
    }
  }
}

function parseDraft(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*?)(\n---\n[\s\S]*)?$/);
  if (!m) return null;
  const fm = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([a-z_]+):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2].trim();
  }
  return { frontmatter: fm, body: (m[2] || "").trim(), tail: m[3] || "" };
}

// '..' matches [\w.-]+ in the shape regex below, so the regex alone does not
// stop '../secrets.md' from escaping the drafts sandbox — the resolved-path
// containment check is the check that actually holds (mirrors server.mjs's
// resolveDraft).
function safeDraftPath(id) {
  if (typeof id !== "string" || !/^[\w.-]+\/[\w.-]+\.md$/.test(id) || id.includes("..")) return null;
  const p = resolve(DRAFTS, id);
  if (!p.startsWith(resolve(DRAFTS) + sep)) return null;
  return p;
}

function readDraft(id) {
  const p = safeDraftPath(id);
  if (!p || !existsSync(p)) return null;
  const parsed = parseDraft(readFileSync(p, "utf8"));
  return parsed ? { id, path: p, ...parsed } : null;
}

function writeDraft(id, frontmatter, body, tail) {
  const p = safeDraftPath(id);
  if (!p) throw new Error("invalid_draft_id");
  const fm = Object.entries(frontmatter).map(([k, v]) => `${k}: ${v}`).join("\n");
  const content = `---\n${fm}\n---\n\n${body}\n${tail || "\n---\ninfographic: none\nmedia_needed: none"}\n`;
  const tmp = p + ".tmp";
  writeFileSync(tmp, content, "utf8");
  renameSync(tmp, p);
}

function setStatus(id, status, extra = {}) {
  const d = readDraft(id);
  if (!d) return null;
  d.frontmatter.status = status;
  Object.assign(d.frontmatter, extra);
  writeDraft(id, d.frontmatter, d.body, d.tail);
  return d;
}

// ── backend spine helpers ───────────────────────────────────────────────────
// MCP verbs share the dashboard's policy gate (actor "mcp"). The store stays
// synced from the on-disk draft file: file = text truth, store = graph truth.
function tailField(tail, key) {
  return (String(tail || "").match(new RegExp(key + ":\\s*(.+)")) || [])[1] || "";
}

function indexParsedDraft(d) {
  try {
    store.indexDraft(d.id, { ...d.frontmatter, media_needed: tailField(d.tail, "media_needed") }, d.body);
  } catch (err) {
    console.error("[nexus store] indexDraft failed for", d.id, err.message);
  }
}

// ── the 7 curated verbs ─────────────────────────────────────────────────────
const verbs = {
  draft: {
    description: "Create a post draft (Threads or LinkedIn) in the review inbox. Nothing posts from here.",
    inputSchema: {
      type: "object",
      properties: {
        platform: { type: "string", enum: ["threads", "linkedin"] },
        body: { type: "string", description: "Post text, Marcel voice rules apply" },
        pillar: { type: "string" },
        source_signal: { type: "string" },
      },
      required: ["platform", "body"],
    },
    run({ platform, body, pillar = "", source_signal = "social-mcp" }) {
      const auth = policy.authorize("mcp", "draft.edit", { platform, op: "create" });
      if (auth.decision !== "allow") return { error: "policy_denied", reason: auth.reason };
      const slug = body.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "draft";
      const id = `${today()}/${platform}-${slug}.md`;
      writeDraft(id, { platform, pillar, status: "draft", source_signal, created: today() }, body, null);
      const d = readDraft(id);
      if (d) indexParsedDraft(d);
      return { id, status: "draft" };
    },
  },

  schedule: {
    description: "Approve a draft for posting at a specific time (ISO 8601). It enters the posting queue.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, at: { type: "string", description: "ISO 8601 timestamp" } },
      required: ["id", "at"],
    },
    run({ id, at }) {
      if (Number.isNaN(Date.parse(at))) return { error: "invalid_timestamp" };
      const before = readDraft(id);
      if (!before) return { error: "draft_not_found" };
      indexParsedDraft(before); // sync graph truth before the gate evaluates it
      const auth = policy.authorize("mcp", "draft.approve", { id, at });
      if (auth.decision !== "allow") return { error: "policy_denied", reason: auth.reason };
      const d = setStatus(id, "approved", { scheduled_at: at });
      if (d) {
        store.relate(id, "mcp", "approved-by");
        indexParsedDraft(d);
      }
      return d ? { id, status: "approved", scheduled_at: at } : { error: "draft_not_found" };
    },
  },

  post_now: {
    description: "Post an APPROVED draft immediately. Refuses anything not approved — Marcel is the only publisher. Returns the posting payload for the active driver (browser lane or Postiz).",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    run({ id }) {
      const d = readDraft(id);
      if (!d) return { error: "draft_not_found" };
      indexParsedDraft(d); // sync graph truth before the gate evaluates it
      const auth = policy.authorize("mcp", "post.execute", { id });
      if (auth.decision !== "allow") {
        return { error: "not_approved", status: d.frontmatter.status, note: "post_now requires status: approved. Use schedule() or have Marcel approve in the star map." };
      }
      return {
        id,
        status: "ready_to_post",
        driver: "browser-lane",
        instruction: "A browser-wired lane executes the post through Marcel's logged-in session, then records the permalink via the dashboard /api/queue/posted endpoint.",
        payload: { platform: d.frontmatter.platform, body: d.body, media: (d.tail.match(/media_needed: READY — (.+)/) || [])[1] || null },
      };
    },
  },

  read_mentions: {
    description: "Recent mentions of and engagement with @nexuslinkproductions across captured sources (best effort, read-only).",
    inputSchema: { type: "object", properties: { limit: { type: "number" } } },
    run({ limit = 10 }) {
      const hits = [];
      if (existsSync(INBOX)) {
        for (const f of readdirSync(INBOX)) {
          if (!f.endsWith(".json")) continue;
          try {
            const cap = JSON.parse(readFileSync(join(INBOX, f), "utf8"));
            for (const p of cap.posts || []) {
              if (/nexuslinkproductions|nexus link/i.test(p.text || "")) {
                hits.push({ source: `threads/@${cap.account}`, text: (p.text || "").slice(0, 300), likes: p.likes, posted: p.posted, url: p.url });
              }
            }
          } catch { /* skip */ }
        }
      }
      return { count: hits.length, mentions: hits.slice(0, limit), note: "Covers captured sources only. Deep mention search needs a posting-API connection (Postiz/RobinReach)." };
    },
  },

  read_analytics: {
    description: "Aggregate stats: drafts by status, posted history, own-post engagement from the voice corpus, competitor capture totals.",
    inputSchema: { type: "object", properties: {} },
    run() {
      const byStatus = {};
      for (const { id } of walkDrafts()) {
        const d = readDraft(id);
        if (d) byStatus[d.frontmatter.status || "unknown"] = (byStatus[d.frontmatter.status || "unknown"] || 0) + 1;
      }
      let posted = 0;
      if (existsSync(LEDGER)) posted = readFileSync(LEDGER, "utf8").split("\n").filter(Boolean).length;
      const corpus = JSON.parse(readFileSync(join(ROOT, "_SYSTEM", "content-engine", "voice-corpus.json"), "utf8"));
      const ownPosts = (corpus.posts || []).map((p) => ({ date: p.posted, likes: p.likes || 0, replies: p.replies || 0 })).slice(0, 10);
      let captures = 0;
      if (existsSync(INBOX)) captures = readdirSync(INBOX).filter((f) => f.endsWith(".json")).length;
      return { drafts_by_status: byStatus, posts_published_via_pipeline: posted, own_recent_posts: ownPosts, competitor_accounts_captured: captures };
    },
  },

  reply: {
    description: "Draft a reply to a post (approval-gated like everything else; files as a draft marked reply_to).",
    inputSchema: {
      type: "object",
      properties: { platform: { type: "string", enum: ["threads", "linkedin"] }, to_url: { type: "string" }, body: { type: "string" } },
      required: ["platform", "to_url", "body"],
    },
    run({ platform, to_url, body }) {
      const auth = policy.authorize("mcp", "draft.edit", { platform, op: "reply", to_url });
      if (auth.decision !== "allow") return { error: "policy_denied", reason: auth.reason };
      const slug = `reply-${Date.now().toString(36)}`;
      const id = `${today()}/${platform}-${slug}.md`;
      writeDraft(id, { platform, pillar: "engagement", status: "draft", source_signal: "social-mcp", created: today(), reply_to: to_url }, body, null);
      const d = readDraft(id);
      if (d) indexParsedDraft(d);
      return { id, status: "draft", reply_to: to_url };
    },
  },

  cross_post_with_overrides: {
    description: "Fan one draft out to per-platform variants with overridden text, each as its own draft for review.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "source draft id" },
        targets: { type: "array", items: { type: "object", properties: { platform: { type: "string" }, body: { type: "string" } }, required: ["platform", "body"] } },
      },
      required: ["id", "targets"],
    },
    run({ id, targets }) {
      const src = readDraft(id);
      if (!src) return { error: "draft_not_found" };
      const made = [];
      for (const t of targets.slice(0, 6)) {
        const r = verbs.draft.run({ platform: t.platform, body: t.body, pillar: src.frontmatter.pillar || "", source_signal: `cross_post from ${id}` });
        made.push(r.id);
      }
      return { source: id, created: made };
    },
  },
};

// ── JSON-RPC plumbing ───────────────────────────────────────────────────────
const SERVER_INFO = { name: "nexus-social", version: "0.1.0" };

function rpc(method, params = {}) {
  switch (method) {
    case "initialize":
      return { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: SERVER_INFO };
    case "ping":
      return {};
    case "tools/list":
      return { tools: Object.entries(verbs).map(([name, v]) => ({ name, description: v.description, inputSchema: v.inputSchema })) };
    case "tools/call": {
      const v = verbs[params.name];
      if (!v) throw Object.assign(new Error("unknown_tool"), { code: -32602 });
      const result = v.run(params.arguments || {});
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
    case "notifications/initialized":
    case "notifications/cancelled":
      return null; // no response body
    default:
      throw Object.assign(new Error("method_not_found"), { code: -32601 });
  }
}

const server = createServer((req, res) => {
  const json = (code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(obj === null ? "" : JSON.stringify(obj)); };
  if (req.method === "GET" && req.url === "/health") return json(200, { ok: true, server: SERVER_INFO });
  if (req.method !== "POST" || !req.url.startsWith("/mcp")) return json(404, { error: "not_found" });
  if (TOKEN && req.headers.authorization !== `Bearer ${TOKEN}`) return json(401, { error: "unauthorized" });
  if (!TOKEN && !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress)) return json(403, { error: "localhost_only" });

  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return json(400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse_error" } }); }
    try {
      const result = rpc(msg.method, msg.params);
      if (result === null || msg.id === undefined) return json(202, null);
      return json(200, { jsonrpc: "2.0", id: msg.id, result });
    } catch (e) {
      return json(200, { jsonrpc: "2.0", id: msg.id ?? null, error: { code: e.code || -32603, message: e.message } });
    }
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`nexus-social MCP on http://127.0.0.1:${PORT}/mcp (${Object.keys(verbs).length} verbs: ${Object.keys(verbs).join(", ")})`);
});

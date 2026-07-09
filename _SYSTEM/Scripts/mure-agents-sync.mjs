#!/usr/bin/env node
// @capability: mure-agents-sync
// @serves: register MURE fleet in openclaw | sync agent catalog to dashboard | agents.list generator | make agents show in control dashboard
// @does: transforms .openclaw/mure-agent-catalog.json into agents.list[] entries in the live ~/.openclaw/openclaw.json so every MURE role appears configured in the OpenClaw Agents tab
// @use: after editing the MURE catalog, to re-project roles+variants into runtime agent config; --dry-run to preview
// @exports: buildAgentsList, mapModel
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// repo root derived from this file's location (_SYSTEM/Scripts/ → two up), never hardcoded
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CATALOG = path.join(REPO, ".openclaw/mure-agent-catalog.json");
const CONFIG = path.join(os.homedir(), ".openclaw/openclaw.json");
const DRY = process.argv.includes("--dry-run");

// catalog model string -> valid OpenClaw provider/model ref (registered in models.providers)
export function mapModel(m) {
  if (!m) return null;
  if (/^(anthropic|zai|minimax-portal|ollama-cloud|cline-pass)\//.test(m)) return m;
  if (m === "deepseek-v4-pro:direct") return "deepseek/deepseek-v4-pro";
  if (m === "deepseek-v4-flash:direct") return "deepseek/deepseek-v4-flash";
  if (m.startsWith("cursor/")) {
    const rest = m.slice(7);
    const map = {
      "composer-2.5": "composer-2.5",
      "composer-2.5-fast": "composer-2.5",
      "gpt-5.5-high": "gpt-5.5",
      "grok-4.3": "grok-4.3",
      "grok-code-fast-1": "grok-build-0.1",
    };
    return "cursor-cli/" + (map[rest] || rest);
  }
  return m; // pass through; doctor will flag unresolved
}

const LANE_META = {
  orchestration: { emoji: "🧭", theme: "orchestration / judgment" },
  engineering: { emoji: "🔧", theme: "build / code" },
  research: { emoji: "🔬", theme: "research / synthesis" },
  verification: { emoji: "🛡️", theme: "verify / adjudicate" },
  knowledge: { emoji: "📚", theme: "memory / knowledge" },
  operations: { emoji: "⚙️", theme: "ops / logistics" },
};

const SESSION_READ = ["sessions_list", "sessions_history", "sessions_send", "session_status"];

function mapTools(cat, lane) {
  const t = new Set();
  for (const x of cat || []) {
    if (x === "bash") t.add("exec");
    else if (x === "grep" || x === "glob") t.add("read"); // covered by read
    else t.add(x);
  }
  for (const s of SESSION_READ) t.add(s);
  if (lane === "orchestration") t.add("sessions_spawn");
  return [...t];
}

function titleCase(id) {
  return id
    .replace(/^mure-/, "")
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function buildAgentsList(catalog) {
  return catalog.agents.map((a) => {
    const isYuri = a.name === "mure-yuri";
    const varModel = Object.fromEntries((a.variants || []).map((v) => [v.id, mapModel(v.model)]));
    const primary = mapModel(a.model);
    let fallbacks = (a.fallbackChain || [])
      .map((id) => varModel[id])
      .filter(Boolean)
      .filter((m) => m !== primary);
    fallbacks = [...new Set(fallbacks)];
    const lm = LANE_META[a.lane] || { emoji: "🤖", theme: a.lane };

    const entry = {
      id: a.name,
      name: (isYuri ? "Yuri" : "MURE " + titleCase(a.name)),
      workspace: REPO,
      model: fallbacks.length ? { primary, fallbacks } : { primary },
      thinkingDefault: a.thinkingLevel || "medium",
      tools: { allow: mapTools(a.tools, a.lane) },
      identity: {
        name: isYuri ? "Yuri" : titleCase(a.name),
        emoji: isYuri ? "🧠" : lm.emoji,
        theme: isYuri ? "adversarial ally / control plane" : lm.theme,
      },
    };
    if (isYuri) {
      entry.default = true;
      entry.tools.allow.push("group:messaging"); // front-end: reply on bound channels
      entry.subagents = { allowAgents: ["*"] };
    } else if (a.lane === "orchestration") {
      entry.subagents = { allowAgents: ["*"] };
    }
    return entry;
  });
}

// Only mutate config when run as a script — importing this module must be pure
// (validators/tools import buildAgentsList + mapModel without triggering a config write).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const catalog = JSON.parse(fs.readFileSync(CATALOG, "utf8"));
  const config = JSON.parse(fs.readFileSync(CONFIG, "utf8"));
  const list = buildAgentsList(catalog);

  config.agents = config.agents || {};
  config.agents.list = list;

  if (DRY) {
    console.log(JSON.stringify(list, null, 2));
    console.log(`\n[dry-run] ${list.length} agents. default=${list.find((x) => x.default)?.id}`);
  } else {
    fs.writeFileSync(CONFIG, JSON.stringify(config, null, 2) + "\n");
    console.log(`Wrote ${list.length} agents.list entries to ${CONFIG}`);
    console.log(`default=${list.find((x) => x.default)?.id}`);
  }
}

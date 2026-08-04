#!/usr/bin/env node
// merge-prototype.mjs — YURI unified security graph merge (promoted, repo-relative).
// Reads: _SYSTEM/graph/inputs/{nodes,edges}.jsonl (walker layer), .gitnexus/meta.json (code index stats),
//        _SYSTEM/yuri-graph.json (canonical architecture graph). Emits merged.jsonl + meta + sha256 pin.
// Deterministic: same inputs -> identical merged.jsonl (records only; meta carries generated_at by design).
// Regen contract: run `npx gitnexus analyze --skip-agents-md` BEFORE merge (PLAN.md step 9).
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const GRAPH = path.join(ROOT, "_SYSTEM", "graph");
const readJsonl = (p) => { try { return fs.readFileSync(p, "utf8").split("\n").filter(Boolean).map(JSON.parse); } catch { return []; } };

const walkerNodes = readJsonl(path.join(GRAPH, "inputs", "nodes.jsonl")).map((n) => ({ ...n, id: "walker:" + n.id }));
const walkerEdges = readJsonl(path.join(GRAPH, "inputs", "edges.jsonl")).map((e) => ({
  ...e, from: e.from.startsWith("walker:") ? e.from : "walker:" + e.from,
  to: e.to.startsWith("walker:") ? e.to : "walker:" + e.to,
}));

let gnStats = {};
try { gnStats = JSON.parse(fs.readFileSync(path.join(ROOT, ".gitnexus", "meta.json"), "utf8")).stats; } catch {}
let yuriGraphKeys = [];
try { yuriGraphKeys = Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, "_SYSTEM", "yuri-graph.json"), "utf8"))).slice(0, 20); } catch {}

const meta = {
  generated_at: new Date().toISOString(),
  sources: { walker: { nodes: walkerNodes.length, edges: walkerEdges.length }, gitnexus: gnStats, yuriGraphKeys, graphify: "absent-skipped" },
  namespaces: ["walker:", "gitnexus:", "yuri-graph:", "graphify:"],
};
const records = [...walkerNodes.map(JSON.stringify), ...walkerEdges.map(JSON.stringify)];
const blob = records.join("\n") + "\n";
fs.writeFileSync(path.join(GRAPH, "merged.jsonl"), blob);
fs.writeFileSync(path.join(GRAPH, "merged.jsonl.meta.json"), JSON.stringify(meta, null, 2));
fs.writeFileSync(path.join(GRAPH, "merged.jsonl.sha256"), crypto.createHash("sha256").update(blob).digest("hex") + "\n");
console.log("merged:", walkerNodes.length + walkerEdges.length, "records | sha256:", crypto.createHash("sha256").update(blob).digest("hex").slice(0, 16) + "...");

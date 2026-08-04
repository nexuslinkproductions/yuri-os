#!/usr/bin/env node
// merge-full.mjs — YURI full-ecosystem graph merge (promoted, repo-relative, deterministic).
// Reads: _SYSTEM/graph-ecosystem/layers/*.jsonl (11 layers). Emits full-graph.jsonl + .sha256 + .meta.json.
// Regen contract: run determinism check (two runs -> identical sha256); any input change -> new pin.
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const LAYERS = path.join(DIR, "layers");
const read = (p) => { try { return fs.readFileSync(path.join(LAYERS, p), "utf8").split("\n").filter(Boolean).map(JSON.parse); } catch { return []; } };

const layerFiles = fs.readdirSync(LAYERS).filter((f) => f.endsWith(".jsonl")).sort();
let total = 0; const per = {}; const records = [];
for (const l of layerFiles) { const n = read(l); per[l] = n.length; total += n.length; records.push(...n.map((r) => ({ ...r, id: (r.id || "").startsWith("walker:") ? r.id : "layer:" + r.id })).map(JSON.stringify)); }
const blob = records.join("\n") + "\n";
const sha = crypto.createHash("sha256").update(blob).digest("hex");
fs.writeFileSync(path.join(DIR, "full-graph.jsonl"), blob);
fs.writeFileSync(path.join(DIR, "full-graph.sha256"), sha + "\n");
fs.writeFileSync(path.join(DIR, "full-graph.meta.json"), JSON.stringify({ generated_at: new Date().toISOString(), layers: per, total, sha256: sha }, null, 2));
console.log("full graph:", total, "records | layers:", layerFiles.length, "| sha256:", sha.slice(0, 16) + "...");

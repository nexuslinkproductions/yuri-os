#!/usr/bin/env node
// @capability: enrich-fleet
// @serves: substrate-agnostic MURE role enrichment | drives ollama-fleet + cline-fleet + claude CLI to materialize the immaculate-role-config brief | D-check repair path
// @does: emits a substrate-aware tasks file (8 lanes × 3-4 base roles), drives the ollama-fleet.mjs substrate to fan out parallel lanes, validates each lane's JSON output + RESULT_LABEL against the brief contract, applies valid entries to _SYSTEM/mure/agent-catalog.json. Single substrate-call wrapper — keeps substrate mechanics in ollama-fleet.mjs (its armed path + RESULT_LABEL grammar + per-task results dir).
// @use: node enrich-fleet.mjs --dry-run            (preview lane+model assignments; no spend)
//       node enrich-fleet.mjs --smoke --lane L3    (1 lane, ollama deepseek-v4-flash:cloud, validate shape)
//       node enrich-fleet.mjs --run                (8 lanes via ollama-fleet.mjs --tasks-file ... --concurrency 4)
//       node enrich-fleet.mjs --merge <runId>      (read .claude/jobs/<runId>/results, validate+merge)
// @cost: --run targets ~8 ollama deepseek-v4-flash:cloud calls on $20 plan = ~$0.20-0.50
// @evidence: each ollama-fleet lane produces <label>.json packet in runDir; this script validates + applies
// @model-routing: hard-coded per lane so cheap tier dominates + each pilot model is exercised; mirror this for future substrate swaps.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");
const BRIEF_PATH = path.join(REPO, "_SYSTEM/mure/immaculate-role-config-brief.md");
const CATALOG_PATH = path.join(REPO, "_SYSTEM/mure/agent-catalog.json");

/** skill ids parsed from the brief's "Skill catalog" block */
function parseSkillCatalog(brief) {
  const m = brief.match(/Skill catalog \(valid ids[^\n]*\n([\s\S]*?)(?:\n##|\n$)/);
  if (!m) return new Set();
  return new Set(
    m[1].split(/\s+/).map((s) => s.trim()).filter((s) => /^[a-z0-9-]+$/.test(s) && !s.startsWith("-"))
  );
}

/**
 * 8 lanes × ~3-4 base roles. Variant `mure-helmsman-glm` skipped (phase-1: base roles only).
 * Each lane carries an ollama model BARE id (the form ollama-fleet expects — provider ollama-cloud
 * is implicit via the substrate call). For OMP-native `infer` model refs, prefix `ollama-cloud/`.
 * Model routing: deepseek-v4-flash = bulk; kimi = code; nemotron = judgment; gemma4 = knowledge.
 */
export const ROLE_LANES = Object.freeze([
  { id: "L1_orch_lead",  lane: "orchestration",            roles: ["mure-helmsman", "mure-steward", "mure-architect"],                            model: "nemotron-3-ultra:cloud" },
  { id: "L2_orch_front", lane: "orchestration+ops",        roles: ["mure-yuri", "fable-synth", "mure-envoy", "mure-quartermaster"],               model: "deepseek-v4-flash:cloud" },
  { id: "L3_eng_build",  lane: "engineering (build)",      roles: ["mure-engineer", "mure-mechanic", "mure-artificer"],                          model: "kimi-k2.7-code:cloud" },
  { id: "L4_eng_infra",  lane: "engineering (infra/edge)", roles: ["mure-kernelsmith", "mure-sentinel", "composer-fast"],                        model: "kimi-k2.7-code:cloud" },
  { id: "L5_res_idea",   lane: "research (ideation)",      roles: ["mure-scout", "mure-ideator", "mure-deliberator"],                           model: "nemotron-3-ultra:cloud" },
  { id: "L6_res_evol",   lane: "research (evolution)",     roles: ["mure-synthesist", "mure-evolver", "deepseek-flash"],                        model: "gemma4:31b-cloud" },
  { id: "L7_verif",      lane: "verification",             roles: ["mure-adjudicator", "mure-oracle", "mure-calibrator", "mure-advisor"],        model: "deepseek-v4-flash:cloud" },
  { id: "L8_knowledge",  lane: "knowledge",                roles: ["mure-chronicler", "mure-archivist"],                                       model: "gemma4:31b-cloud" },
]);
export const TOTAL_ROLES = ROLE_LANES.reduce((n, l) => n + l.roles.length, 0);

const SUBSTRATE = "ollama-fleet";
const CONCURRENCY = Number(process.env.ENRICH_CONCURRENCY || 4);

function buildLanePrompt(laneId, roles, brief) {
  const ids = parseSkillCatalog(brief);
  const roleList = roles.map((r, i) => `  ${i + 1}. ${r}`).join("\n");
  return [
    `Apply the IMMACULATE ROLE-CONFIG BRIEF (passed below) to enrich these ${roles.length} MURE roles, in order:`,
    roleList,
    ``,
    `Constraint reminder (do not drift):`,
    `- Return ONLY a JSON array, exactly ${roles.length} objects, in the listed order. No prose, no fences.`,
    `- Each object shape: { "name", "description", "skills", "thinkingLevel", "params", "rationale" (1-2 lines for owner review) }`,
    `- description: <= 320 chars, sharp (mission + what makes this role different from siblings + dispatch trigger).`,
    `- skills: 4-9 ids, ONLY from the catalog. Sample of valid ids: ${[...ids].slice(0, 12).join(", ")} … (full list in brief).`,
    `- thinkingLevel: one of off|low|medium|high|xhigh. Match to reasoning weight per brief rubrics.`,
    `- params: { "temperature": <0..1> } matching determinism-need per brief.`,
    `- Do NOT touch: name (use exact id), model, model variants, tools, fallbackChain, or any other catalog field.`,
    ``,
    `End your reply with EXACTLY one RESULT_LABEL line on its own line — no other text after it:`,
    `  00SE_${laneId}_F_PASS_COMMITTED        (success)`,
    `  00SE_${laneId}_F_FAIL_<short_reason>   (failure; reason in snake_case)`,
    ``,
    `--- BEGIN BRIEF ---`,
    brief,
    `--- END BRIEF ---`,
    ``,
    `Begin now.`,
  ].join("\n");
}

function emitTasksFile(outPath, brief) {
  // ollama-fleet --tasks-file expects a bare JSON ARRAY, not an envelope.
  // (cline-fleet accepts {tasks:[...]} envelope; ollama-fleet does not.)
  const tasks = ROLE_LANES.map((lane) => ({
    label: lane.id,
    model: lane.model,
    prompt: buildLanePrompt(lane.id, lane.roles, brief),
    timeoutSec: 300,
  }));
  fs.writeFileSync(outPath, JSON.stringify(tasks, null, 2));
  return tasks.length;
}

function buildSubstrateSpawn(armFlag) {
  // armFlag must be present for ollama-fleet to actually spawn (vs dry-run).
  const env = { ...process.env, YURI_OLLAMA_FLEET: "1" };
  return { env, cmd: "node", args: ["_SYSTEM/Scripts/ollama-fleet.mjs", "--tasks-file"] };
}

function runFanout(tasksPath) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn("node", [
      "_SYSTEM/Scripts/ollama-fleet.mjs",
      "--tasks-file", tasksPath,
      "--concurrency", String(CONCURRENCY),
    ], { cwd: REPO, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, YURI_OLLAMA_FLEET: "1" } });
    let out = "", err = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("close", (code) => resolve({ code, ms: Date.now() - t0, stdout: out, stderr: err }));
    child.on("error", (e) => resolve({ code: 1, ms: 0, stdout: "", stderr: String(e?.message || e) }));
  });
}

/** Parse JSON array + RESULT_LABEL out of one ollama-fleet lane result file. */
export function parseLaneOutput(laneId, text) {
  const trimmed = String(text || "").trim();
  const firstBracket = trimmed.indexOf("[");
  const lastBracket = trimmed.lastIndexOf("]");
  let jsonText = "";
  if (firstBracket >= 0 && lastBracket > firstBracket) jsonText = trimmed.slice(firstBracket, lastBracket + 1);
  // accept both PASS and label variants the existing extractResultLabel would.
  // Lane ids may contain lowercase + underscores (e.g. L3_eng_build) — allow both.
  const labelMatch = trimmed.match(/(00SE_[A-Z0-9_a-z]+_(?:PASS|FAIL_[A-Z0-9_a-z]+)_COMMITTED)/);
  const resultLabel = labelMatch ? labelMatch[1] : "";
  let array = null, parseError = null;
  if (jsonText) {
    try { array = JSON.parse(jsonText); }
    catch (e) { parseError = String(e?.message || e); }
  }
  return { jsonText, json: array, resultLabel, parseError };
}

export function validateEntry(entry, skillCatalog, roleName) {
  const errs = [];
  if (!entry || typeof entry !== "object") errs.push("not-object");
  if (entry?.name !== roleName) errs.push(`name-mismatch(${entry?.name}≠${roleName})`);
  if (typeof entry?.description !== "string" || entry.description.length < 20 || entry.description.length > 320) {
    errs.push(`description-len(${entry?.description?.length || 0})`);
  }
  if (!Array.isArray(entry?.skills) || entry.skills.length < 4 || entry.skills.length > 9) {
    errs.push(`skills-count(${entry?.skills?.length ?? 0})`);
  } else {
    const bad = entry.skills.filter((s) => !skillCatalog.has(s));
    if (bad.length) errs.push(`skills-invalid(${bad.join(",")})`);
  }
  if (!["off", "low", "medium", "high", "xhigh"].includes(entry?.thinkingLevel)) {
    errs.push(`thinkingLevel(${entry?.thinkingLevel})`);
  }
  const temp = entry?.params?.temperature;
  if (typeof temp !== "number" || temp < 0 || temp > 1) errs.push(`params.temperature(${temp})`);
  return errs;
}

export function validateLane(laneId, parsed, brief) {
  const skillCatalog = parseSkillCatalog(brief);
  const lane = ROLE_LANES.find((l) => l.id === laneId);
  if (!lane) return { ok: false, errors: [`unknown-lane(${laneId})`], resultLabel: parsed.resultLabel, normalized: [] };
  const arr = parsed.json;
  if (!Array.isArray(arr) || arr.length !== lane.roles.length) {
    return { ok: false, errors: [`array-len(${Array.isArray(arr) ? arr.length : "non-array"}≠${lane.roles.length})`], resultLabel: parsed.resultLabel, normalized: [] };
  }
  const errs = [];
  const normalized = [];
  for (let i = 0; i < lane.roles.length; i++) {
    const e = validateEntry(arr[i], skillCatalog, lane.roles[i]);
    if (e.length) errs.push(`${lane.roles[i]}: ${e.join("+")}`);
    else normalized.push({
      name: arr[i].name,
      description: arr[i].description,
      skills: arr[i].skills,
      thinkingLevel: arr[i].thinkingLevel,
      params: arr[i].params,
      ...(arr[i].reasoningDefault ? { reasoningDefault: arr[i].reasoningDefault } : {}),
    });
  }
  const labelOk = parsed.resultLabel === `00SE_${laneId}_F_PASS_COMMITTED`;
  return { ok: errs.length === 0 && labelOk, errors: errs, resultLabel: parsed.resultLabel, normalized };
}

function findRunDir(stdout) {
  // ollama-fleet prints a JSON summary; try to extract runDir, else fall back to latest
  try {
    const lines = String(stdout || "").split(/\n/);
    for (const ln of lines.reverse()) {
      const o = JSON.parse(ln);
      if (o?.runDir) return { runDir: o.runDir, runId: o.runId };
    }
  } catch { /* */ }
  return null;
}

function findLatestRunDir() {
  const base = path.join(REPO, ".claude/jobs");
  if (!fs.existsSync(base)) return null;
  const entries = fs.readdirSync(base).filter((d) => d.startsWith("olf-")).sort().reverse();
  return entries.length ? path.join(base, entries[0], "results") : null;
}

export async function mergeRunDir(runDir) {
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
  const brief = fs.readFileSync(BRIEF_PATH, "utf8");
  const skillCatalog = parseSkillCatalog(brief);
  const byName = Object.fromEntries(catalog.agents.map((a) => [a.name, a]));
  const results = [];
  const skipped = [];
  let applied = 0;
  for (const lane of ROLE_LANES) {
    const laneFile = path.join(runDir, `${lane.id}.json`);
    if (!fs.existsSync(laneFile)) { skipped.push(`${lane.id}:no-lane-file`); continue; }
    const packet = JSON.parse(fs.readFileSync(laneFile, "utf8"));
    const text = packet.text || "";
    const parsed = parseLaneOutput(lane.id, text);
    const validated = validateLane(lane.id, parsed, brief);
    // Per-entry merge: apply every VALID normalized entry even if other entries in
    // the same lane failed validation (e.g. one over-length description). All-or-
    // nothing per lane discards valid siblings — observably wrong here 2026-07-09.
    let laneApplied = 0;
    const laneSkipped = [];
    for (const entry of validated.normalized) {
      const a = byName[entry.name];
      if (!a) { laneSkipped.push(`${lane.id}:${entry.name}:unknown`); continue; }
      a.description = entry.description;
      a.skills = entry.skills;
      a.thinkingLevel = entry.thinkingLevel;
      a.params = entry.params;
      if (entry.reasoningDefault) a.reasoningDefault = entry.reasoningDefault;
      laneApplied++;
      applied++;
    }
    for (const err of validated.errors || []) {
      laneSkipped.push(`${lane.id}:${err}`);
    }
    if (laneSkipped.length) skipped.push(...laneSkipped);
    results.push({ laneId: lane.id, count: laneApplied, laneSkipped: laneSkipped.length });
  }
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2) + "\n");
  return { applied, skipped, results };
}

async function dryRun() {
  const brief = fs.readFileSync(BRIEF_PATH, "utf8");
  console.log(`[dry-run] substrate=${SUBSTRATE} concurrency=${CONCURRENCY} lanes=${ROLE_LANES.length} roles=${TOTAL_ROLES} skills-in-catalog=${parseSkillCatalog(brief).size}`);
  for (const lane of ROLE_LANES) {
    console.log(`  ${lane.id.padEnd(14)} model=${lane.model.padEnd(40)} roles=${lane.roles.length} (${lane.roles.join(", ")})`);
  }
  const tpath = path.join(REPO, "_SYSTEM/state/enrich-tasks.json");
  emitTasksFile(tpath, brief);
  console.log(`\n[dry-run] tasks emitted to ${tpath}`);
}

async function runFull() {
  const brief = fs.readFileSync(BRIEF_PATH, "utf8");
  const tpath = path.join(REPO, "_SYSTEM/state/enrich-tasks.json");
  const n = emitTasksFile(tpath, brief);
  console.log(`[run] substrate=${SUBSTRATE} tasks=${n} concurrency=${CONCURRENCY} file=${tpath}`);
  const res = await runFanout(tpath);
  process.stdout.write(`\n--- ollama-fleet stdout ---\n${res.stdout.slice(-2000)}\n--- end ollama-fleet stdout ---\n`);
  const runDir = (findRunDir(res.stdout) || {}).runDir || findLatestRunDir();
  if (!runDir) {
    console.error(`[run] cannot locate ollama-fleet results dir; aborting merge. stderr=${res.stderr.slice(-200)}`);
    process.exit(2);
  }
  console.log(`[run] runDir=${runDir}`);
  const { applied, skipped, results } = await mergeRunDir(runDir);
  console.log(`\n[run-done] applied=${applied} skipped=${skipped.length ? skipped.join("; ") : "0"}`);
  for (const r of results) console.log(`  ${r.laneId.padEnd(14)} ok=${r.ok}${r.errors ? " errors=" + r.errors[0] : ""}${r.count ? " count=" + r.count : ""}`);
  console.log(`\nNext: node _SYSTEM/Scripts/mure-fleet-validate.mjs`);
}

async function smoke(laneId) {
  const brief = fs.readFileSync(BRIEF_PATH, "utf8");
  const lane = ROLE_LANES.find((l) => l.id === laneId) || ROLE_LANES[0];
  const prompt = buildLanePrompt(lane.id, lane.roles, brief);
  const tpath = path.join(os.tmpdir(), `enrich-smoke-${lane.id}-${Date.now()}.json`);
  fs.writeFileSync(tpath, JSON.stringify([{ label: lane.id, model: lane.model, prompt, timeoutSec: 240 }], null, 2));
  console.log(`[smoke] lane=${lane.id} roles=${lane.roles.length} model=${lane.model} file=${tpath}`);
  const res = await runFanout(tpath);
  process.stdout.write(res.stdout.slice(-1500) + "\n");
  const runDir = (findRunDir(res.stdout) || {}).runDir || findLatestRunDir();
  if (!runDir) { console.error(`[smoke] cannot locate run dir`); process.exit(2); }
  const packetPath = path.join(runDir, `${lane.id}.json`);
  if (!fs.existsSync(packetPath)) { console.error(`[smoke] missing packet ${packetPath}`); process.exit(2); }
  const packet = JSON.parse(fs.readFileSync(packetPath, "utf8"));
  const parsed = parseLaneOutput(lane.id, packet.text || "");
  const validated = validateLane(lane.id, parsed, brief);
  console.log(`[smoke] code=${res.code} ms=${res.ms} label=${parsed.resultLabel || "(none)"} parse-err=${parsed.parseError || "(none)"}`);
  if (!validated.ok) { console.log(`[smoke] FAIL ${JSON.stringify(validated.errors)}`); process.exit(1); }
  console.log(`[smoke] PASS  applied ${validated.normalized.length} entries`);
}

async function mergeByRunId(runId) {
  const runDir = path.join(REPO, ".claude/jobs", runId, "results");
  if (!fs.existsSync(runDir)) { console.error(`runDir not found: ${runDir}`); process.exit(2); }
  const { applied, skipped, results } = await mergeRunDir(runDir);
  console.log(`[merge] applied=${applied} skipped=${skipped.length ? skipped.join("; ") : "0"}`);
  for (const r of results) console.log(`  ${r.laneId.padEnd(14)} ok=${r.ok}${r.errors ? " errors=" + r.errors[0] : ""}${r.count ? " count=" + r.count : ""}`);
  console.log(`Next: node _SYSTEM/Scripts/mure-fleet-validate.mjs`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const cmd = args[0];
  if (cmd === "--dry-run") await dryRun();
  else if (cmd === "--smoke") {
    const i = args.indexOf("--lane");
    await smoke(i >= 0 ? args[i + 1] : ROLE_LANES[0].id);
  }
  else if (cmd === "--run") await runFull();
  else if (cmd === "--merge") await mergeByRunId(args[1]);
  else console.error("usage: enrich-fleet.mjs --dry-run | --smoke [--lane Ln] | --run | --merge <runId>");
}

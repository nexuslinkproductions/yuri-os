#!/usr/bin/env node
// @capability: sonnet-enrich-fleet
// @serves: MURE role immaculate enrichment (D-check) | sonnet-5 fan-out per immaculate-role-config brief
// @does: fans out 25 base roles (8 lanes × 3-4 roles) to sonnet-5 using the immaculate-role-config brief as system prompt. Each lane returns (1) a JSON array of enrichment objects, (2) a RESULT_LABEL line. Pipeline parses, validates against the brief contract, and merges into .openclaw/mure-agent-catalog.json.
// @use: node sonnet-enrich-fleet.mjs --dry-run          (partition preview, no calls)
//       node sonnet-enrich-fleet.mjs --smoke --lane L3 (1 lane, 1 sonnet-5 call, validate)
//       node sonnet-enrich-fleet.mjs --run [--parallel N] (full fan-out, results to <runDir>)
//       node sonnet-enrich-fleet.mjs --merge <runDir>    (apply a previously-validated results dir to the catalog)
// @cost-boundary: --run respect YURI budget guard; abort if parallel > 3 unless SONNET_ENRICH_PARALLEL_OVERRIDE=1
// @evidence: each lane emits RESULT_LABEL (00SE_<lane>_F_PASS_COMMITTED); merge writes a RESULT_LABEL to MERGE_LOG
// @dependency: `claude` CLI 2.1.x; sonnet-5 model available

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");
const BRIEF_PATH = path.join(REPO, "_SYSTEM/mure/immaculate-role-config-brief.md");
const CATALOG_PATH = path.join(REPO, ".openclaw/mure-agent-catalog.json");
const RUNS_DIR = path.join(REPO, "_SYSTEM/state/sonnet-enrich");

const MODEL = process.env.SONNET_ENRICH_MODEL || "sonnet";
const LANE_BUDGET_DEFAULT = 3;            // default parallel cap
const LANE_BUDGET_OVERRIDE_ENV = "SONNET_ENRICH_PARALLEL_OVERRIDE";

/**
 * 8 lanes × 3-4 base roles each (variants excluded from phase 1; mure-helmsman-glm skipped).
 * Each lane groups roles that share a lane-cluster so the worker can apply rubrics consistently.
 */
export const ROLE_LANES = Object.freeze([
  { id: "L1_orch_lead",   lane: "orchestration",            roles: ["mure-helmsman", "mure-steward", "mure-architect"] },
  { id: "L2_orch_front",  lane: "orchestration+ops",        roles: ["mure-yuri", "fable-synth", "mure-envoy", "mure-quartermaster"] },
  { id: "L3_eng_build",   lane: "engineering (build)",      roles: ["mure-engineer", "mure-mechanic", "mure-artificer"] },
  { id: "L4_eng_infra",   lane: "engineering (infra/edge)", roles: ["mure-kernelsmith", "mure-sentinel", "composer-fast"] },
  { id: "L5_res_idea",    lane: "research (ideation)",      roles: ["mure-scout", "mure-ideator", "mure-deliberator"] },
  { id: "L6_res_evol",    lane: "research (evolution)",     roles: ["mure-synthesist", "mure-evolver", "deepseek-flash"] },
  { id: "L7_verif",       lane: "verification",             roles: ["mure-adjudicator", "mure-oracle", "mure-calibrator", "mure-advisor"] },
  { id: "L8_knowledge",   lane: "knowledge",                roles: ["mure-chronicler", "mure-archivist"] },
]);

export const TOTAL_ROLES = ROLE_LANES.reduce((n, l) => n + l.roles.length, 0);

// skill ids found in the brief's catalog (parsed at runtime so this stays in sync with the brief)
function parseSkillCatalog(briefText) {
  // catalog is the bulleted list under "Skill catalog (valid ids — use EXACTLY these strings)"
  const m = briefText.match(/Skill catalog \(valid ids[^\n]*\n([\s\S]*?)(?:\n##|\n$)/);
  if (!m) return new Set();
  return new Set(
    m[1]
      .split(/\s+/)
      .map((s) => s.trim())
      .filter((s) => /^[a-z0-9-]+$/.test(s) && !s.startsWith("-"))
  );
}

export function buildLanePrompt(laneId, roles, brief) {
  const ids = parseSkillCatalog(brief);
  const roleList = roles.map((r, i) => `  ${i + 1}. ${r}`).join("\n");
  return [
    `Apply the IMMACULATE ROLE-CONFIG BRIEF (passed as system prompt) to enrich these ${roles.length} MURE roles, in order:`,
    roleList,
    ``,
    `Constraint reminder (do not drift):`,
    `- Return ONLY a JSON array, exactly ${roles.length} objects, in the listed order. No prose, no fences.`,
    `- Each object shape: { "name", "description", "skills", "thinkingLevel", "params", "reasoningDefault"? (optional), "rationale" (1-2 lines for owner review, kept out of catalog) }`,
    `- description: <= 320 chars, sharp (mission + what makes this role different from siblings + dispatch trigger).`,
    `- skills: 4-9 ids, ONLY from the catalog. Allowed ids include but are not limited to: ${[...ids].slice(0, 12).join(", ")}, … (full list in brief).`,
    `- thinkingLevel: one of off|low|medium|high|xhigh. Match to reasoning weight per brief rubrics.`,
    `- params: { "temperature": <0..1> } matching determinism-need per brief.`,
    `- Do NOT touch: name (use exact id), model, model variants, tools, fallbackChain, or any other catalog field.`,
    ``,
    `End your reply with EXACTLY one RESULT_LABEL line on its own line — no other text after it:`,
    `  00SE_${laneId}_F_PASS_COMMITTED        (success)`,
    `  00SE_${laneId}_F_FAIL_<short_reason>   (failure; reason in snake_case)`,
    ``,
    `Begin now.`,
  ].join("\n");
}

function spawnLane(laneId, userPrompt, systemPrompt, runDir, opts = {}) {
  return new Promise((resolve) => {
    const rawFile = path.join(runDir, `${laneId}.raw.txt`);
    const metaFile = path.join(runDir, `${laneId}.meta.json`);
    const t0 = Date.now();
    const child = spawn(
      "claude",
      [
        "--print",
        "--bare",
        "--model", MODEL,
        "--system-prompt", systemPrompt,
        // optional conversation-id to keep sessions clean
        opts.sessionId ? "" : "",
        userPrompt,
      ].filter(Boolean),
      { cwd: REPO, stdio: ["ignore", "pipe", "pipe"] }
    );
    let out = "", err = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("close", (code) => {
      const ms = Date.now() - t0;
      try { fs.writeFileSync(rawFile, out); } catch { /* best-effort */ }
      try { fs.writeFileSync(metaFile, JSON.stringify({ laneId, code, ms, stderr: err.slice(-400) }, null, 2)); } catch { /* */ }
      resolve({ laneId, code, ms, stdout: out, stderr: err });
    });
    child.on("error", (e) => {
      resolve({ laneId, code: 1, ms: Date.now() - t0, stdout: "", stderr: String(e?.message || e) });
    });
  });
}

/** Parse one lane's stdout: extract JSON array + RESULT_LABEL. */
export function parseLaneOutput(laneId, stdout) {
  const trimmed = String(stdout || "").trim();
  // find the last `[...]` block (greedy across lines)
  const firstBracket = trimmed.indexOf("[");
  const lastBracket = trimmed.lastIndexOf("]");
  let jsonText = "";
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    jsonText = trimmed.slice(firstBracket, lastBracket + 1);
  }
  const labelMatch = trimmed.match(/(00SE_[A-Z0-9_]+_(?:PASS|FAIL_[A-Z0-9_]+)_COMMITTED)/);
  const resultLabel = labelMatch ? labelMatch[1] : "";
  let array = null;
  let parseError = null;
  if (jsonText) {
    try { array = JSON.parse(jsonText); }
    catch (e) { parseError = String(e?.message || e); }
  }
  return { jsonText, json: array, resultLabel, parseError };
}

/** Validate a single enrichment object against the brief contract. */
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
  if (typeof temp !== "number" || temp < 0 || temp > 1) {
    errs.push(`params.temperature(${temp})`);
  }
  return errs;
}

export function validateLane(laneId, parsed, brief) {
  const skillCatalog = parseSkillCatalog(brief);
  const lane = ROLE_LANES.find((l) => l.id === laneId);
  if (!lane) return { ok: false, errors: [`unknown-lane(${laneId})`] };
  const arr = parsed.json;
  if (!Array.isArray(arr) || arr.length !== lane.roles.length) {
    return { ok: false, errors: [`array-len(${Array.isArray(arr) ? arr.length : "non-array"}≠${lane.roles.length})`], resultLabel: parsed.resultLabel };
  }
  const allErrs = [];
  const normalized = [];
  for (let i = 0; i < lane.roles.length; i++) {
    const entryErrs = validateEntry(arr[i], skillCatalog, lane.roles[i]);
    if (entryErrs.length) {
      allErrs.push(`${lane.roles[i]}: ${entryErrs.join("+")}`);
    } else {
      normalized.push({
        name: arr[i].name,
        description: arr[i].description,
        skills: arr[i].skills,
        thinkingLevel: arr[i].thinkingLevel,
        params: arr[i].params,
        ...(arr[i].reasoningDefault ? { reasoningDefault: arr[i].reasoningDefault } : {}),
      });
    }
  }
  const labelOk = parsed.resultLabel === `00SE_${laneId}_F_PASS_COMMITTED`;
  return {
    ok: allErrs.length === 0 && labelOk,
    errors: allErrs,
    resultLabel: parsed.resultLabel,
    normalized,
  };
}

/** Merge a validated results dir into the catalog. */
export function mergeLaneResults(runDir) {
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
  const brief = fs.readFileSync(BRIEF_PATH, "utf8");
  const skillCatalog = parseSkillCatalog(brief);
  const byName = Object.fromEntries(catalog.agents.map((a) => [a.name, a]));
  const lanes = ROLE_LANES.map((l) => l.id);
  const applied = [];
  const skipped = [];
  for (const laneId of lanes) {
    const file = path.join(runDir, `${laneId}.valid.json`);
    if (!fs.existsSync(file)) { skipped.push(`${laneId}:no-file`); continue; }
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!data.ok) { skipped.push(`${laneId}:validation-failed`); continue; }
    let laneApplied = 0;
    for (const entry of data.normalized) {
      const a = byName[entry.name];
      if (!a) { skipped.push(`${laneId}:${entry.name}:unknown`); continue; }
      a.description = entry.description;
      a.skills = entry.skills;
      a.thinkingLevel = entry.thinkingLevel;
      a.params = entry.params;
      if (entry.reasoningDefault) a.reasoningDefault = entry.reasoningDefault;
      laneApplied++;
    }
    applied.push(`${laneId}:${laneApplied}`);
  }
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2) + "\n");
  return { applied, skipped };
}

// --- CLI --------------------------------------------------------------------
async function dryRun() {
  const brief = fs.readFileSync(BRIEF_PATH, "utf8");
  const skillCatalog = parseSkillCatalog(brief);
  console.log(`[dry-run] model=${MODEL}  lanes=${ROLE_LANES.length}  roles=${TOTAL_ROLES}  skills-in-catalog=${skillCatalog.size}`);
  for (const lane of ROLE_LANES) {
    const sample = buildLanePrompt(lane.id, lane.roles, brief);
    console.log(`\n--- ${lane.id} | ${lane.lane} | ${lane.roles.length} roles ---`);
    console.log(`  roles: ${lane.roles.join(", ")}`);
    console.log(`  prompt-bytes: ${sample.length}`);
  }
}

async function smoke(laneId) {
  const lane = ROLE_LANES.find((l) => l.id === laneId) || ROLE_LANES[0];
  const runDir = path.join(RUNS_DIR, `smoke-${Date.now().toString(36)}`);
  fs.mkdirSync(runDir, { recursive: true });
  const brief = fs.readFileSync(BRIEF_PATH, "utf8");
  const prompt = buildLanePrompt(lane.id, lane.roles, brief);
  console.log(`[smoke] lane=${lane.id} roles=${lane.roles.length} model=${MODEL} runDir=${runDir}`);
  const res = await spawnLane(lane.id, prompt, brief, runDir);
  const parsed = parseLaneOutput(lane.id, res.stdout);
  const validated = validateLane(lane.id, parsed, brief);
  console.log(`[smoke] code=${res.code} ms=${res.ms} label=${parsed.resultLabel || "(none)"} parse-err=${parsed.parseError || "(none)"}`);
  if (!validated.ok) {
    console.log(`[smoke] FAIL  ${JSON.stringify(validated.errors)}`);
    process.exit(1);
  }
  fs.writeFileSync(path.join(runDir, `${lane.id}.valid.json`), JSON.stringify(validated, null, 2));
  console.log(`[smoke] PASS  applied ${validated.normalized.length} entries; results at ${runDir}`);
}

async function runFull(opts) {
  if (opts.parallel > LANE_BUDGET_DEFAULT && process.env[LANE_BUDGET_OVERRIDE_ENV] !== "1") {
    console.error(`[guard] parallel=${opts.parallel} exceeds default cap ${LANE_BUDGET_DEFAULT}. Set ${LANE_BUDGET_OVERRIDE_ENV}=1 to override, or run with --parallel ${LANE_BUDGET_DEFAULT}.`);
    process.exit(2);
  }
  const runDir = path.join(RUNS_DIR, `run-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  fs.mkdirSync(runDir, { recursive: true });
  const brief = fs.readFileSync(BRIEF_PATH, "utf8");
  console.log(`[run] model=${MODEL} parallel=${opts.parallel} runDir=${runDir}`);
  const queue = [...ROLE_LANES];
  const results = [];
  // simple concurrency pool — single host, no fork needed
  async function worker() {
    while (queue.length) {
      const lane = queue.shift();
      if (!lane) return;
      const prompt = buildLanePrompt(lane.id, lane.roles, brief);
      const res = await spawnLane(lane.id, prompt, brief, runDir, {});
      const parsed = parseLaneOutput(lane.id, res.stdout);
      const validated = validateLane(lane.id, parsed, brief);
      fs.writeFileSync(path.join(runDir, `${lane.id}.valid.json`), JSON.stringify(validated, null, 2));
      results.push({ laneId: lane.id, ok: validated.ok, errors: validated.errors, label: parsed.resultLabel, ms: res.ms });
      console.log(`  lane ${lane.id.padEnd(14)} code=${res.code}  ms=${String(res.ms).padStart(5)}  ok=${validated.ok}  errors=${validated.errors.length ? validated.errors[0] : "-"}`);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, opts.parallel) }, () => worker()));
  fs.writeFileSync(path.join(runDir, "_summary.json"), JSON.stringify({ results, parallel: opts.parallel, model: MODEL }, null, 2));
  const okCount = results.filter((r) => r.ok).length;
  console.log(`\n[run-done] ${okCount}/${results.length} lanes validated. Per-lane files in ${runDir}`);
  console.log(`Next: node sonnet-enrich-fleet.mjs --merge ${runDir}`);
  process.exit(okCount === results.length ? 0 : 1);
}

async function mergeRun(runDir) {
  if (!fs.existsSync(runDir)) { console.error(`runDir not found: ${runDir}`); process.exit(2); }
  const { applied, skipped } = mergeLaneResults(runDir);
  console.log(`[merge] applied: ${applied.join(" | ")}`);
  if (skipped.length) console.log(`[merge] skipped: ${skipped.join(" | ")}`);
  console.log(`Next: re-run validator — node _SYSTEM/Scripts/mure-fleet-validate.mjs`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const cmd = args[0];
  if (cmd === "--dry-run") await dryRun();
  else if (cmd === "--smoke") {
    const i = args.indexOf("--lane");
    const laneId = i >= 0 ? args[i + 1] : ROLE_LANES[0].id;
    await smoke(laneId);
  }
  else if (cmd === "--run") {
    const i = args.indexOf("--parallel");
    const parallel = i >= 0 ? Number(args[i + 1]) : LANE_BUDGET_DEFAULT;
    await runFull({ parallel });
  }
  else if (cmd === "--merge") {
    await mergeRun(args[1]);
  }
  else {
    console.error("usage: sonnet-enrich-fleet.mjs --dry-run | --smoke [--lane Ln] | --run [--parallel N] | --merge <runDir>");
    process.exit(2);
  }
}

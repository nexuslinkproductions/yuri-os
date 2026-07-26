// atlas-build.mjs — YURI Atlas Phase 2b: region records -> checkpoints.json
//
// Takes the region clustering produced by atlas-regions.mjs (which itself reuses
// arch-graph-engine's spectral clustering / Tarjan / degree math — no reimplemented
// graph algorithms here) and materializes one checkpoint record per region at
// `_SYSTEM/state/atlas/checkpoints.json`.
//
// @capability: atlas-build
// @serves: generate the town checkpoint records for the YURI Atlas | region facets | region labels
// @does: labels each region from existing circuitry/knowledge-graph vocabulary, derives
//   honest facets (kind/capability/risk/lifecycle) from metadata already present on members,
//   hashes the member set, and writes checkpoints.json.
// @use: run after atlas-regions.mjs; do not hand-roll a second clustering pass — this only
//   packages atlas-regions' output.
// @exports: buildCheckpoints, main

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import path from "node:path";
import { computeRegions } from "./atlas-regions.mjs";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
export const OUT_PATH = "_SYSTEM/state/atlas/checkpoints.json";
export const ID_MAP_PATH = "_SYSTEM/state/atlas/id-map.json";
export const CIRCUITRY_PATH = "02_RESOURCES/RESEARCH/yuri-circuitry-graph.json";
export const YURI_ORIGIN_PATH = "_SYSTEM/yuri-origin.md";

// Protected Surfaces list, read directly out of yuri-origin.md rather than
// hand-copied here — a single source of truth for "what's protected."
function loadProtectedPrefixes() {
  const text = readFileSync(path.join(REPO_ROOT, YURI_ORIGIN_PATH), "utf8");
  const section = text.split("## Protected Surfaces")[1]?.split(/\n## /)[0] || "";
  const prefixes = [...section.matchAll(/^- `([^`]+)`/gm)].map((m) => m[1]);
  return prefixes.filter((p) => !p.includes("*")); // keep literal prefixes; glob ones are for the runtime gate, not this static scan
}

const LIFECYCLE_KEYWORDS = [
  [/tombstone/i, "tombstoned"],
  [/\bretired\b/i, "retired"],
  [/\bdeprecated\b/i, "deprecated"],
  [/\blegacy\b/i, "legacy"],
];

const MUTATING_NAME_PATTERN = /(^|[-_])(write|build|mutate|migrate|delete|commit|push|apply|patch)([-_.]|$)/i;

function readJson(relPath) {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, relPath), "utf8"));
}

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "region";
}

// pick a human label for a region: reuse circuitry/kg vocabulary already on the
// hub or members (labels[0] in id-map, which itself came from circuitry
// node.label / kg node.label). Only synthesize from the path when nothing exists.
function labelFor(hubNode, memberNodes) {
  if (hubNode?.labels?.[0]) return hubNode.labels[0];
  for (const m of memberNodes) if (m.labels?.[0]) return m.labels[0];
  const dir = hubNode ? path.posix.dirname(hubNode.path) : "unknown";
  return dir.split("/").pop() || dir;
}

function kindFacet(memberNodes) {
  const counts = {};
  for (const m of memberNodes) {
    const base = path.posix.basename(m.path);
    let kind;
    if (base.endsWith(".test.mjs") || base.endsWith(".test.ts") || base.endsWith(".test.js")) kind = "test";
    else {
      const ext = path.posix.extname(base).slice(1) || "no-ext";
      kind = ext;
    }
    counts[kind] = (counts[kind] || 0) + 1;
  }
  return counts;
}

function capabilityFacet(memberNodes) {
  const caps = new Set();
  for (const m of memberNodes) {
    for (const al of m.aliases) if (al.source === "capabilities") caps.add(al.id);
  }
  return [...caps].sort();
}

function riskFacet(memberNodes, protectedPrefixes) {
  const counts = {};
  for (const m of memberNodes) {
    if (protectedPrefixes.some((p) => m.path.startsWith(p))) counts.protected = (counts.protected || 0) + 1;
    if (MUTATING_NAME_PATTERN.test(path.posix.basename(m.path))) counts["mutating-heuristic"] = (counts["mutating-heuristic"] || 0) + 1;
  }
  return counts; // may be {} — honest omission, not fabricated "safe" claims
}

function lifecycleFacet(memberNodes) {
  const counts = {};
  for (const m of memberNodes) {
    const text = [m.path, ...(m.labels || [])].join(" ");
    for (const [re, tag] of LIFECYCLE_KEYWORDS) {
      if (re.test(text)) counts[tag] = (counts[tag] || 0) + 1;
    }
  }
  return counts; // {} means no detectable lifecycle marker among members — omitted honestly, not guessed
}

function memberHash(members) {
  const sorted = members.slice().sort();
  return "sha256:" + createHash("sha256").update(sorted.join("\n")).digest("hex");
}

// The xref-query command that reproduces this exact member set: a spectral
// sub-cluster of the giant component has no single circuitry-node query that
// recovers it, so the honest reproduce line is the CANONICAL region command
// (regenerates ALL regions deterministically) plus the clusterKey to pick this one.
function reproduceCommand(region, k) {
  return `node _SYSTEM/Scripts/atlas/atlas-regions.mjs --k=${k} --json   # then select clusterKey="${region.clusterKey}"`;
}

export function buildCheckpoints(opts = {}) {
  const k = opts.k ?? 14;
  const idMap = readJson(ID_MAP_PATH);
  const protectedPrefixes = loadProtectedPrefixes();
  const result = computeRegions({ k, seed: opts.seed ?? 1 });

  const checkpoints = [];
  const usedSlugs = new Set();
  for (const region of result.regions) {
    const memberNodes = region.members.map((id) => idMap.nodes[id]).filter(Boolean);
    const hubNode = region.hub ? idMap.nodes[region.hub] : null;
    let label = labelFor(hubNode, memberNodes);
    let slug = slugify(label);
    if (usedSlugs.has(slug)) slug = `${slug}-${region.clusterKey}`;
    usedSlugs.add(slug);

    checkpoints.push({
      id: slug,
      repo_root: "YURI-OS-MUSUBI",
      label,
      hub: region.hub,
      members: region.members,
      facets: {
        kind: kindFacet(memberNodes),
        lifecycle: lifecycleFacet(memberNodes),
        risk: riskFacet(memberNodes, protectedPrefixes),
        capability: capabilityFacet(memberNodes),
      },
      neighbors: (region.neighbors || []).map((n) => ({
        id: checkpoints[n.region]?.id ?? `pending-${n.region}`,
        weight: n.weight,
      })),
      reproduce: reproduceCommand(region, k),
      member_hash: memberHash(region.members),
      described_at_hash: null,
    });
  }

  // second pass: fix up neighbor ids now that all slugs are known (neighbors
  // were built by region INDEX before slugs existed for later regions).
  const idByIndex = result.regions.map((_, ri) => checkpoints[ri].id);
  result.regions.forEach((region, ri) => {
    checkpoints[ri].neighbors = (region.neighbors || []).map((n) => ({
      id: idByIndex[n.region],
      weight: n.weight,
    }));
  });

  return {
    checkpoints,
    meta: {
      k,
      idMapCounts: idMap.counts,
      edgeStats: result.edgeStats,
      graphSummary: result.graphSummary,
      gitnexus: result.gitnexus,
    },
  };
}

function summarize(checkpoints) {
  const sizes = checkpoints.map((c) => c.members.length).sort((a, b) => a - b);
  const mid = Math.floor(sizes.length / 2);
  const median = sizes.length % 2 ? sizes[mid] : (sizes[mid - 1] + sizes[mid]) / 2;
  const total = sizes.reduce((a, b) => a + b, 0);
  const fragmented = checkpoints.filter((c) => c.members.length <= 2);
  const dominant = checkpoints.filter((c) => c.members.length / total > 0.4);
  return {
    regionCount: checkpoints.length,
    totalMembers: total,
    min: sizes[0],
    median,
    max: sizes[sizes.length - 1],
    fragmented: fragmented.map((c) => ({ id: c.id, size: c.members.length })),
    dominant: dominant.map((c) => ({ id: c.id, size: c.members.length, fraction: Math.round((c.members.length / total) * 1e4) / 1e4 })),
  };
}

function printHelp() {
  console.log(`atlas-build.mjs — build _SYSTEM/state/atlas/checkpoints.json from region clustering

Usage:
  node _SYSTEM/Scripts/atlas/atlas-build.mjs [--k=N] [--json] [--verbose] [--out=PATH] [--test] [--help]
`);
}

function selfTest() {
  let failures = 0;
  const check = (name, cond) => {
    if (!cond) { console.error(`FAIL: ${name}`); failures++; } else console.log(`ok: ${name}`);
  };
  const { checkpoints } = buildCheckpoints({ k: 14 });
  check("produced at least one checkpoint", checkpoints.length > 0);
  check("every checkpoint has required fields", checkpoints.every((c) =>
    c.id && c.repo_root === "YURI-OS-MUSUBI" && c.label && Array.isArray(c.members) &&
    c.facets && typeof c.facets === "object" && Array.isArray(c.neighbors) &&
    typeof c.reproduce === "string" && c.member_hash.startsWith("sha256:") && c.described_at_hash === null));
  const ids = new Set(checkpoints.map((c) => c.id));
  check("checkpoint ids are unique", ids.size === checkpoints.length);
  const allMembers = new Set();
  let overlap = false;
  for (const c of checkpoints) for (const m of c.members) { if (allMembers.has(m)) overlap = true; allMembers.add(m); }
  check("no member appears in two regions", !overlap);
  check("member_hash is deterministic", checkpoints.every((c) => c.member_hash === memberHash(c.members)));
  console.log(failures === 0 ? "\nATLAS_BUILD_SELFTEST_PASS" : `\nATLAS_BUILD_SELFTEST_FAIL (${failures} failures)`);
  return failures === 0;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const args = process.argv.slice(2);
  if (args.includes("--help")) { printHelp(); process.exit(0); }
  if (args.includes("--test")) { process.exit(selfTest() ? 0 : 1); }

  const kArg = args.find((a) => a.startsWith("--k="));
  const k = kArg ? Number(kArg.slice(4)) : 14;
  const outArg = args.find((a) => a.startsWith("--out="));
  const outPath = outArg ? outArg.slice(6) : OUT_PATH;
  const verbose = args.includes("--verbose");
  const asJson = args.includes("--json");

  const { checkpoints, meta } = buildCheckpoints({ k });
  const summary = summarize(checkpoints);

  mkdirSync(path.dirname(path.join(REPO_ROOT, outPath)), { recursive: true });
  writeFileSync(path.join(REPO_ROOT, outPath), JSON.stringify(checkpoints, null, 2));

  if (asJson) {
    console.log(JSON.stringify({ summary, meta }, null, 2));
  } else {
    console.log(`wrote ${outPath}`);
    console.log(`regions=${summary.regionCount} totalMembers=${summary.totalMembers} min=${summary.min} median=${summary.median} max=${summary.max}`);
    console.log(`edge stats:`, meta.edgeStats);
    console.log(`gitnexus:`, meta.gitnexus.available ? meta.gitnexus.agreement : meta.gitnexus.reason);
    if (summary.fragmented.length) console.log(`fragmented (<=2 members): ${summary.fragmented.length} regions ->`, summary.fragmented.slice(0, 15));
    if (summary.dominant.length) console.log(`dominant (>40% of nodes): `, summary.dominant);
    if (verbose) {
      for (const c of checkpoints) {
        console.log(`  ${c.id} size=${c.members.length} hub=${c.hub}`);
      }
    }
  }
}

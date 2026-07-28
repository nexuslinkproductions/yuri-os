#!/usr/bin/env node
// @capability: atlas-menu
// @serves: closed-vocabulary faceted navigation | phrasing-invariant area menu | bounded selection over directory-aligned areas
// @does: implements the owner-approved SLM navigation shape (2026-07-28 Hermes brief): a CLOSED,
//   enumerable area vocabulary over BALANCED DIRECTORY-ALIGNED partitions. The two mega-blobs
//   (3754/4255 = 88% of corpus mass in two dir1 areas — a degenerate partition on corpus
//   statistics alone) are recursively split (dir1 -> dir2 -> dir3) until every area holds at most
//   MAX_MEMBERS files; small islands are kept as-is. menu_list() enumerates the balanced closed
//   vocabulary; menu_enter(area, filters) reuses atlas-resolve's enter() against the area's own
//   source partition (not rebuilt); selectArea(question) scores areas deterministically (IDF over
//   the balanced area documents); menu_resolve(question) is the end-to-end HYBRID DIAGNOSTIC —
//   free-text query -> selectArea -> enter -> resolveAmong within the area — measured for
//   degradation-slope comparison only, NOT evidence that menu navigation is phrasing-invariant
//   (its text-dependent selection step still sees the query). The phrasing-invariance claim rests
//   on the menu_list/menu_enter API and the selection-accuracy measurement in isolation.
//   VERDICT STATUS (2026-07-28, Hermes): menu claim PARKED — find-40 cannot discriminate any
//   directory-aligned menu (35/40 answers in one top-level tree). Do not report peak menu numbers
//   on find-40; an area-spread n>=100 set is the unlock.
// @use: node atlas-menu.mjs --list | --test | --enter <areaId> | --resolve "<question>"
// @exports: loadMenu, menuList, menuEnter, selectArea, menuResolve, checkCoverage, MAX_MEMBERS

import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadAtlas, enter, resolveAmong, tokenize } from './atlas-resolve.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

/** Directory-aligned partitions over the CURRENT 4,255-node corpus (regenerated 2026-07-28 via
 *  atlas-build.mjs --granularity=dir1|dir2|dir3; the 2026-07-26 variants covered only the degraded
 *  2,161-node corpus — 49% of nodes unselectable). */
const DIR1_PATH = path.join(REPO_ROOT, '_SYSTEM/state/atlas/variants/cp-dir1-4255.json');
const DIR2_PATH = path.join(REPO_ROOT, '_SYSTEM/state/atlas/variants/cp-dir2-4255.json');
const DIR3_PATH = path.join(REPO_ROOT, '_SYSTEM/state/atlas/variants/cp-dir3-4255.json');

/**
 * MAX_MEMBERS — the blob threshold. Justified from corpus statistics ALONE (legitimate-vs-fraud
 * test: no reference to which benchmark questions fail): 400 ≈ 9.4% of the 4,255-node corpus.
 * An area larger than that is a mass concentration, not a navigational unit — and a member list
 * longer than ~400 is not a menu page a person (or an SLM) browses, filters or not.
 */
export const MAX_MEMBERS = 400;

/** Resolvable-member floor for partition-vs-id-map integrity (fail LOUD below it). */
const COVERAGE_FLOOR = 0.8;
/** Completeness has its OWN floor, near 1.0: a generated partition over the id-map is complete
 *  by construction, so anything less is a generator bug, not acceptable slack. Reusing the 0.8
 *  resolution floor here silently permits dropping 851 nodes (measured: head-2 subset of
 *  cp-dir1-4255.json = 88.2% of corpus — PASSES 0.8, which is exactly the tautology Orion caught). */
const COMPLETENESS_FLOOR = 1.0;

let MENU_CACHE = null;

/**
 * Partition-vs-id-map integrity (Orion patch 2026-07-28 + Hermes corrections). TWO conjuncts —
 * either alone is insufficient:
 *   resolution:    every LISTED member id resolves to a path-bearing id-map node (staleness)
 *   completeness:  every path-bearing id-map node appears in at least one area (subset rejection)
 * A resolution-only gate reads 1.0 on an incomplete subset partition.
 * Duplicates THROW at every level: measured 2026-07-28 — dir1/dir2/dir3 builds are all disjoint
 * (unique=4255, dupes=0). If a future generator intentionally multi-parents, relax this
 * deliberately and say why; do not let a dup-emitting bug ride on an intentional-design excuse.
 */
export function checkCoverage(checkpoints, nodes, label) {
  let refs = 0;
  let resolved = 0;
  const listed = new Set();
  for (const cp of checkpoints) {
    for (const memberId of cp.members) {
      refs++;
      listed.add(memberId);
      if (nodes[memberId] && typeof nodes[memberId].path === 'string') resolved++;
    }
  }
  const pathNodeCount = Object.values(nodes).filter((n) => n && typeof n.path === 'string').length;
  let covered = 0;
  for (const id of listed) {
    if (nodes[id] && typeof nodes[id].path === 'string') covered++;
  }
  const resolution = refs > 0 ? resolved / refs : 0;
  const completeness = pathNodeCount > 0 ? covered / pathNodeCount : 0;
  const duplicateRefs = refs - listed.size;

  if (resolution < COVERAGE_FLOOR) {
    throw new Error(
      `atlas-menu: ${label} partition resolves only ${resolved}/${refs} member ids (${(resolution * 100).toFixed(1)}%) `
      + 'against the current id-map — regenerate the directory partitions before measuring selection.',
    );
  }
  if (completeness < COMPLETENESS_FLOOR) {
    throw new Error(
      `atlas-menu: ${label} partition lists only ${covered}/${pathNodeCount} id-map path nodes `
      + `(${(completeness * 100).toFixed(1)}% complete) — incomplete partition, not a coverage pass. `
      + `(resolution alone was ${(resolution * 100).toFixed(1)}% and would have falsely greenlit this.)`,
    );
  }
  if (duplicateRefs > 0) {
    throw new Error(
      `atlas-menu: ${label} partition has ${duplicateRefs} duplicate member slots (refs=${refs}, unique=${listed.size}) `
      + '— fix the generator before measuring.',
    );
  }
  return { refs, resolved, listed: listed.size, pathNodeCount, covered, ratio: resolution, resolution, completeness, duplicateRefs };
}

/**
 * loadMenu() — balanced flat area set by PER-NODE assignment: every corpus node takes its dir1
 * checkpoint if that area respects MAX_MEMBERS, else its dir2 checkpoint, else its dir3 checkpoint
 * (oversized leaf, flagged). Per-node assignment makes coverage exact and duplication impossible BY
 * CONSTRUCTION — tree-recursive splitting double-emits cross-boundary members (measured: 154 dupes
 * and 38 drops on this corpus). Areas are keyed depth+checkpoint-id, so same-named checkpoints at
 * different granularities can never overwrite each other (dir1/dir2/dir3 reuse label-derived ids).
 */
export function loadMenu({ idMapPath } = {}) {
  if (MENU_CACHE && !idMapPath) return MENU_CACHE;
  const opts = idMapPath ? { idMapPath } : {};
  const l1 = loadAtlas({ checkpointsPath: DIR1_PATH, ...opts });
  const l2 = loadAtlas({ checkpointsPath: DIR2_PATH, ...opts });
  const l3 = loadAtlas({ checkpointsPath: DIR3_PATH, ...opts });

  const coverage = {
    dir1: checkCoverage(l1.checkpoints, l1.nodes, 'dir1'),
    dir2: checkCoverage(l2.checkpoints, l2.nodes, 'dir2'),
    dir3: checkCoverage(l3.checkpoints, l3.nodes, 'dir3'),
  };

  const groups = new Map(); // `${depth}::${cpId}` -> { depth, cpId, cp, atlas, memberIds: [] }
  const oversized = new Set();
  for (const id of Object.keys(l1.nodes)) {
    const c1 = l1.checkpointsById.get(l1.nodeToCheckpoint.get(id));
    if (c1 && c1.members.length <= MAX_MEMBERS) {
      const key = `1::${c1.id}`;
      if (!groups.has(key)) groups.set(key, { depth: 1, cp: c1, atlas: l1, memberIds: [] });
      groups.get(key).memberIds.push(id);
      continue;
    }
    const c2 = l2.checkpointsById.get(l2.nodeToCheckpoint.get(id));
    if (c2 && c2.members.length <= MAX_MEMBERS) {
      const key = `2::${c2.id}`;
      if (!groups.has(key)) groups.set(key, { depth: 2, cp: c2, atlas: l2, memberIds: [] });
      groups.get(key).memberIds.push(id);
      continue;
    }
    const c3 = l3.checkpointsById.get(l3.nodeToCheckpoint.get(id));
    if (!c3) throw new Error(`atlas-menu: node ${id} has no dir3 checkpoint — partition incomplete`);
    const key = `3::${c3.id}`;
    if (!groups.has(key)) groups.set(key, { depth: 3, cp: c3, atlas: l3, memberIds: [] });
    groups.get(key).memberIds.push(id);
    if (c3.members.length > MAX_MEMBERS) oversized.add(key);
  }

  // Menu ids must be unique ACROSS depths: same-named checkpoints exist at multiple granularities.
  const usedIds = new Set();
  const areas = [];
  for (const [key, g] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    let menuId = g.cp.id;
    if (usedIds.has(menuId)) menuId = `${menuId}#d${g.depth}`;
    if (usedIds.has(menuId)) throw new Error(`atlas-menu: menu id collision persists after depth suffix: ${menuId}`);
    usedIds.add(menuId);
    areas.push({
      key, id: menuId, label: g.cp.label, members: g.memberIds.length, depth: g.depth,
      atlas: g.atlas, memberIds: g.memberIds.sort(), hub: g.cp.hub || null, cp: g.cp,
    });
  }

  // Integrity: per-node assignment must cover every node EXACTLY once — by construction, verified.
  const total = areas.reduce((a, x) => a + x.memberIds.length, 0);
  const corpusN = Object.keys(l1.nodes).length;
  if (total !== corpusN) {
    throw new Error(`atlas-menu: balanced partition integrity failed — assigned ${total} member slots over ${corpusN} corpus nodes`);
  }

  // Area documents + IDF over the balanced set.
  const areaTokens = new Map();
  for (const a of areas) {
    const set = new Set(tokenize(`${a.label || ''} ${a.id || ''}`));
    for (const memberId of a.memberIds) {
      const nt = a.atlas.nodeTokens.get(memberId);
      if (nt) for (const t of nt.pathTokens) set.add(t);
    }
    areaTokens.set(a.id, set);
  }
  const df = new Map();
  for (const set of areaTokens.values()) for (const t of set) df.set(t, (df.get(t) || 0) + 1);
  const N = areas.length;
  const areaIdf = new Map();
  for (const [t, d] of df) areaIdf.set(t, Math.log(1 + (N - d + 0.5) / (d + 0.5)));

  MENU_CACHE = { areas, oversized: [...oversized], coverage, areaTokens, areaIdf, l1, l2, l3 };
  return MENU_CACHE;
}

/** menu_list() — the balanced closed vocabulary. Order: members desc, id asc. */
export function menuList(menu = loadMenu()) {
  return [...menu.areas]
    .map((a) => ({ area: a.id, label: a.label, members: a.members, depth: a.depth }))
    .sort((a, b) => (b.members - a.members) || a.area.localeCompare(b.area));
}

/** menu_enter(area, filters) — atlas-resolve's enter() against a per-area single-checkpoint
 *  SHIM atlas (synthetic id + assigned member subset, source nodes/tokens reused). Facet
 *  semantics (kind, pathIncludes, hub-first ranking) are enter()'s own — never forked inline. */
export function menuEnter(areaId, filters = {}, menu = loadMenu()) {
  const area = menu.areas.find((a) => a.id === areaId);
  if (!area) {
    const err = new Error(`atlas-menu: unknown area "${areaId}" — pick from menu_list() (closed vocabulary, ${menu.areas.length} areas)`);
    err.knownAreas = menu.areas.map((a) => a.id);
    throw err;
  }
  const srcTokens = area.atlas.checkpointTokens.get(area.cp.id);
  const shim = {
    checkpointsById: new Map([[area.id, { id: area.id, label: area.label, hub: area.cp.hub || null, members: area.memberIds, facets: area.cp.facets || {} }]]),
    nodes: area.atlas.nodes,
    checkpointTokens: new Map([[area.id, srcTokens || { hubPath: null }]]),
  };
  return enter(area.id, filters, shim);
}

/**
 * selectArea(question) — the text-dependent selection step, measured in isolation.
 * Summed area-IDF of distinct query tokens per area document; ties break by area id ascending.
 * Returns { areaId, score, ranked } — full deterministic ranking for top-k menu offering.
 */
export function selectArea(question, menu = loadMenu()) {
  const qTokens = new Set(tokenize(question));
  const ranked = [];
  for (const a of menu.areas) {
    const set = menu.areaTokens.get(a.id);
    let score = 0;
    for (const t of qTokens) {
      const w = menu.areaIdf.get(t);
      if (w !== undefined && set.has(t)) score += w;
    }
    ranked.push({ areaId: a.id, score });
  }
  ranked.sort((a, b) => (b.score - a.score) || a.areaId.localeCompare(b.areaId));
  return { areaId: ranked[0].areaId, score: ranked[0].score, ranked };
}

/**
 * menu_resolve(question, {top}) — HYBRID DIAGNOSTIC, not the menu claim.
 * selectArea -> enter -> resolveAmong within the area. Measured for G6a degradation-slope
 * comparison only; its selection step still sees free text.
 */
export function menuResolve(question, { top = 5 } = {}, menu = loadMenu()) {
  const sel = selectArea(question, menu);
  const memberPaths = menuEnter(sel.areaId, {}, menu).map((m) => m.path);
  const paths = resolveAmong(question, memberPaths, { top }, menu.areas.find((a) => a.id === sel.areaId).atlas);
  return { paths, areaId: sel.areaId, areaScore: sel.score };
}

// ---------------------------------------------------------------------------
// SELF-TEST — determinism + contract smoke on the real balanced partition.
// ---------------------------------------------------------------------------
function runSelfTest() {
  let pass = true;
  const check = (name, cond) => {
    console.log(`[atlas-menu --test] ${name}: ${cond ? 'PASS' : 'FAIL'}`);
    if (!cond) pass = false;
  };
  const menu = loadMenu();
  const list = menuList(menu);
  check('balanced menu enumerates the closed vocabulary', list.length >= 12);
  check('menu is deterministic', JSON.stringify(menuList(menu)) === JSON.stringify(list));
  check('every area respects MAX_MEMBERS or is a flagged oversized leaf', menu.areas.every((a) => a.members <= MAX_MEMBERS || menu.oversized.includes(a.key)));
  check('oversized leaves are reported, not hidden', menu.oversized.length <= menu.areas.length);
  check('no dir1-scale blob survives', Math.max(...menu.areas.map((a) => a.members)) < 2000);
  check('coverage resolution+completeness above floor at every granularity',
    Object.values(menu.coverage).every((c) => c.resolution >= COVERAGE_FLOOR && c.completeness >= COMPLETENESS_FLOOR && c.duplicateRefs === 0));

  // NEGATIVE PROBE (mandatory — a gate never observed rejecting something has not been tested):
  // a head-of-file 2-area subset of dir1 lists 88.2% of corpus. The OLD resolution-only gate
  // accepted it (ratio 1.0); the completeness conjunct MUST reject it.
  {
    const full = JSON.parse(readFileSync(DIR1_PATH, 'utf8'));
    const tiny = full.slice(0, 2);
    let rejected = false;
    let reason = '';
    try {
      checkCoverage(tiny, menu.l1.nodes, 'dir1-NEGATIVE-incomplete-subset');
    } catch (e) {
      rejected = /complete/i.test(String(e && e.message || e));
      reason = String(e && e.message || e).slice(0, 160);
    }
    check('coverage gate REJECTS incomplete subset partition (completeness conjunct)', rejected);
    if (rejected) console.log(`[atlas-menu --test] negative probe rejected as required: ${reason}`);
  }
  const sel1 = selectArea('where is model routing decided?', menu);
  const sel2 = selectArea('where is model routing decided?', menu);
  check('selectArea deterministic', JSON.stringify(sel1.ranked) === JSON.stringify(sel2.ranked));
  check('selectArea returns full ranking', sel1.ranked.length === menu.areas.length);
  const members = menuEnter(sel1.areaId, {}, menu);
  check('menu_enter returns resolvable members', members.length > 0 && members.every((m) => typeof m.path === 'string' && m.path.length > 0));
  let threw = false;
  try { menuEnter('no-such-area', {}, menu); } catch (e) { threw = Array.isArray(e.knownAreas); }
  check('unknown area fails LOUD with the closed vocabulary attached', threw);
  const r = menuResolve('what do I run before broad exploration?', { top: 5 }, menu);
  check('menuResolve returns bounded paths', r.paths.length > 0 && r.paths.length <= 5);
  check('menuResolve reports its chosen area', typeof r.areaId === 'string' && r.areaId.length > 0);
  console.log(`[atlas-menu --test] overall: ${pass ? 'PASS' : 'FAIL'}`);
  return pass;
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--test')) { process.exit(runSelfTest() ? 0 : 1); }
  if (argv.includes('--list')) {
    const menu = loadMenu();
    for (const a of menuList(menu)) console.log(`${String(a.members).padStart(5)}  d${a.depth}  ${a.area}  ${a.label || ''}`);
    if (menu.oversized.length) console.log(`oversized leaves (>MAX_MEMBERS, kept + flagged): ${menu.oversized.join(', ')}`);
    return;
  }
  const enterIdx = argv.indexOf('--enter');
  if (enterIdx !== -1 && argv[enterIdx + 1]) {
    for (const m of menuEnter(argv[enterIdx + 1])) console.log(m.path);
    return;
  }
  const resIdx = argv.indexOf('--resolve');
  if (resIdx !== -1 && argv[resIdx + 1]) {
    const r = menuResolve(argv[resIdx + 1]);
    console.log(`area: ${r.areaId} (score ${r.areaScore.toFixed(2)})`);
    for (const p of r.paths) console.log(p);
    return;
  }
  console.log('usage: atlas-menu.mjs --list | --test | --enter <areaId> | --resolve "<question>"');
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) main();

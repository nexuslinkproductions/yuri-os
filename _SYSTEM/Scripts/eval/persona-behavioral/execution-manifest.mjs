#!/usr/bin/env node
// execution-manifest.mjs - exact resolver/validator for the frozen binding
// at _SYSTEM/config/persona-behavioral-execution-binding.v1.json.
//
// This file is the BINDING RESOLVER. It does NOT run subjects, controls,
// smoke, or trials. Those happen in runner-conformant.mjs after
// resolveManifest() returns successfully.
//
// Contract (per binding, frozen):
// - manifest_resolution.root: '_SYSTEM/config/persona-behavioral-execution-manifests'
// - id_regex: ^[a-z0-9][a-z0-9._-]{0,63}$
// - filename_rule: <id>.json
// - mock_acceptance: allows 'mock' adapter_kind only
// - seal_artifacts_tracked_at_current_head: every referenced artifact must
//   exist on disk (tracked) at current HEAD and be byte-identical.
//
// Path handling: use fileURLToPath everywhere; 'new URL(...).pathname' is
// unsafe when paths contain spaces ('%20' mis-encoding).

import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, statSync, lstatSync } from 'node:fs';
import { dirname, isAbsolute, normalize, relative, resolve as pathResolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import { getMockRequestedIdentity } from './adapter-mock.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = pathResolve(here, '..', '..', '..', '..');

function sha256(s) {
  const buf = typeof s === 'string' ? Buffer.from(s, 'utf8') : Buffer.isBuffer(s) ? s : Buffer.from(String(s), 'utf8');
  return createHash('sha256').update(buf).digest('hex');
}
function sha256File(p) { return sha256(readFileSync(p)); }
function sha256FileAtCommit(repoRelativePath, commit) {
  const bytes = execFileSync('git', ['-C', REPO_ROOT, 'show', `${commit}:${repoRelativePath}`]);
  return sha256(bytes);
}

const BINDING_PATH = pathResolve(REPO_ROOT, '_SYSTEM/config/persona-behavioral-execution-binding.v1.json');
const BINDING_SHA = 'fc14bab7c6513dc07ce7047c04d5b1e28d946253cf70ec23ea898e36744c6742';

let _binding = null;
let _bindingAt = null;
function loadBinding() {
  const sha = sha256File(BINDING_PATH);
  if (_binding && _bindingAt === sha) return _binding;
  if (sha !== BINDING_SHA) throw new BlockError('binding_sha_mismatch', `expected ${BINDING_SHA}, got ${sha}`);
  _binding = JSON.parse(readFileSync(BINDING_PATH, 'utf8'));
  _bindingAt = sha;
  return _binding;
}

class BlockError extends Error { constructor(label, detail) { super(`${label}: ${detail}`); this.blockerLabel = label; this.detail = detail; } }
function be(label, detail) { throw new BlockError(label, detail); }

// BLOCKER 3 fix — centralized path-policy enforcement for EVERY referenced
// artifact (frozen binding manifest_resolution.path_policy:
// repo_relative_only + parent_segments_forbidden + symlink_escape_forbidden).
// Pre-fix this only rejected an escape AFTER pathResolve, and `isAbsolute`
// was imported but never called — so an absolute path that happened to
// resolve under REPO_ROOT (repo_relative_only forbids ANY absolute path,
// not just ones that escape) was silently accepted. Symlinks were never
// lstat/realpath-checked here at all: lstatSync ran exactly once, only for
// the top-level manifest candidate in resolveManifest. Every caller of
// getRepoRelative (inputs, arm fixture manifests + their ordered sources,
// subject adapter, controls, schedule) now inherits the same guarantee
// from one place, matching the manifest-candidate's own zero-tolerance
// symlink policy.
function assertNotSymlink(resolved) {
  let lst;
  try { lst = lstatSync(resolved); } catch { return; } // missing: downstream read surfaces its own error
  if (lst.isSymbolicLink()) be('repo_relative_symlink_forbidden', resolved);
}

function getRepoRelative(repoRelativePath) {
  if (typeof repoRelativePath !== 'string' || !repoRelativePath) {
    be('repo_relative_path_invalid', String(repoRelativePath));
  }
  // repo_relative_only: reject ANY absolute path outright, even one that
  // would resolve under REPO_ROOT — pathResolve(REPO_ROOT, absPath) simply
  // discards REPO_ROOT per Node path-resolution semantics, so an absolute
  // input must never reach that call.
  if (isAbsolute(repoRelativePath)) {
    be('repo_relative_absolute_path_forbidden', repoRelativePath);
  }
  // parent_segments_forbidden.
  if (repoRelativePath.split(/[\\/]/).includes('..')) {
    be('repo_relative_parent_segment_forbidden', repoRelativePath);
  }
  const resolved = pathResolve(REPO_ROOT, repoRelativePath);
  if (!resolved.startsWith(REPO_ROOT + '/') && resolved !== REPO_ROOT) {
    be('repo_relative_escape', resolved);
  }
  // symlink_escape_forbidden — zero tolerance at the leaf, mirroring the
  // existing top-level manifest-candidate policy in resolveManifest. A
  // tracked symlink only proves the LINK PATH is indexed; the bytes any
  // fs read actually returns follow the link to wherever it points,
  // bypassing git's content-addressing entirely.
  assertNotSymlink(resolved);
  return resolved;
}

function ensureTrackedAtCommit(repoRelativePath, commit) {
  // Presence check only.
  const out = execFileSync('git', ['-C', REPO_ROOT, 'ls-tree', '-r', commit, '--', repoRelativePath], { encoding: 'utf8' });
  if (!out.trim()) be('referenced_source_untracked_at_subject_revision', `${repoRelativePath} not tracked at ${commit}`);
  return null;
}

function ensureTrackedAtHead(repoRelativePath) {
  try {
    execFileSync('git', ['-C', REPO_ROOT, 'ls-files', '--error-unmatch', '--', repoRelativePath], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) { be('seal_artifact_untracked_at_current_head', repoRelativePath); }
  return sha256File(getRepoRelative(repoRelativePath));
}

function ensureCleanBytesAtCommit(repoRelativePath, commit) {
  const bytes = execFileSync('git', ['-C', REPO_ROOT, 'show', `${commit}:${repoRelativePath}`], { encoding: 'utf8' });
  const expected = sha256(bytes);
  const onDisk = sha256File(getRepoRelative(repoRelativePath));
  if (expected !== onDisk) {
    be('source_hash_drift_subject_revision', `${repoRelativePath}: ${expected} != on-disk ${onDisk}`);
  }
  return expected;
}

function isCleanRepoAt(ref) {
  // Detects untracked + modified + staged. For HEAD only.
  if (ref !== 'HEAD') {
    // We deliberately do NOT diff any non-HEAD revision against the
    // current worktree: seal artifacts legitimately differ from the
    // subject_revision commit. Path-by-path equality is verified via
    // ensureCleanBytesAtCommit where required.
    return;
  }
  const out = execFileSync('git', ['-C', REPO_ROOT, 'status', '--porcelain'], { encoding: 'utf8' });
  if (out.trim()) be('working_tree_dirty_vs_subject_revision', `${ref} has uncommitted changes`);
}

function pathPolicyChecks() {
  // parent_segments_forbidden, symlink_escape_forbidden, absolute/relative
  // manifest paths forbidden. These are enforced by the runner CLI; the
  // resolver additionally rejects any manifest root escape.
  const binding = loadBinding();
  const root = pathResolve(REPO_ROOT, binding.manifest_resolution.root);
  const realRoot = (() => { try { return realpathSync(root); } catch { return root; } })();
  return { root: realRoot, binding };
}

function validateManifestId(id, idRegex) {
  if (typeof id !== 'string' || !new RegExp(idRegex).test(id)) {
    be('manifest_id_invalid', id);
  }
  if (id.includes('/') || id.includes('\\') || id.includes('..')) {
    be('manifest_id_path_traversal', id);
  }
}

function resolveManifest(manifestId) {
  const { root, binding } = pathPolicyChecks();
  validateManifestId(manifestId, binding.manifest_resolution.id_regex);

  const filename = `${manifestId}.json`;
  const candidate = pathResolve(root, filename);
  if (!candidate.startsWith(root + '/') && candidate !== root) {
    be('manifest_path_escape', candidate);
  }
  try {
    const lst = lstatSync(candidate);
    if (lst.isSymbolicLink()) be('manifest_is_symlink', candidate);
  } catch { be('manifest_missing', candidate); }

  // Step 1: read manifest bytes
  const manifestBytes = readFileSync(candidate, 'utf8');
  const manifest = JSON.parse(manifestBytes);

  // Step 2: verify schema_version
  if (manifest.schema_version !== 'persona-behavioral-execution-manifest.v1') {
    be('manifest_schema_version', manifest.schema_version || '<missing>');
  }

  // Step 3: required top-level fields
  const required = ['manifest_id', 'subject_revision', 'protocol', 'inputs', 'arms', 'subject', 'controls', 'schedule', 'smoke', 'output_policy'];
  for (const f of required) {
    if (manifest[f] === undefined) be('manifest_missing_field', f);
  }

  // Step 4: FIX 3 — pin protocol to the FROZEN binding
  //   (execution_manifest_contract.protocol). Self-consistency (manifest
  //   sha == on-disk sha) is NOT sufficient; the manifest must name the
  //   exact frozen protocol path AND the exact frozen sha256, and the
  //   on-disk contract must match that frozen sha.
  const frozenProtocol = binding.execution_manifest_contract.protocol;
  if (manifest.protocol.path !== frozenProtocol.path) {
    be('protocol_path_mismatch_vs_binding', `${manifest.protocol.path} != ${frozenProtocol.path}`);
  }
  if (manifest.protocol.sha256 !== frozenProtocol.sha256) {
    be('protocol_sha_mismatch_vs_binding', `${manifest.protocol.sha256} != ${frozenProtocol.sha256}`);
  }
  const contractSha = sha256File(getRepoRelative(manifest.protocol.path));
  if (contractSha !== frozenProtocol.sha256) {
    be('protocol_on_disk_sha_mismatch', `${contractSha} != ${frozenProtocol.sha256}`);
  }

  // Step 5: working tree clean at current HEAD
  isCleanRepoAt('HEAD');

  // Step 6: subject_revision
  const sr = manifest.subject_revision;
  if (!/^[0-9a-f]{40}$/.test(sr.commit)) be('subject_revision_commit_format', sr.commit);
  if (sr.clean_tree_required !== true) be('subject_revision_clean_tree_required', 'must be true');
  // current-HEAD cleanliness already verified above; seal artifacts
  // legitimately differ from the subject_revision commit, so we do NOT
  // diff the seal tree against sr.commit.

  // Step 7: inputs
  verifyInputs(manifest.inputs, sr.commit);

  // Step 8: arms (and parse fixture manifests, attach onto arms[k].parsed)
  verifyArms(manifest.arms, sr.commit);

  // Step 9: A/B persona-span correspondence using parsed fixture manifests
  verifyPersonaSpanCorrespondance(manifest.arms);

  // Step 10: subject
  verifySubject(manifest.subject, sr.commit);

  // Step 11: controls and ratified-case ids
  const casesBytes = execFileSync('git', ['-C', REPO_ROOT, 'show', `${sr.commit}:${manifest.inputs.cases.path}`], { encoding: 'utf8' });
  const lines = casesBytes.trim().split('\n').filter(Boolean);
  const ratifiedCaseIds = [];
  const proposedCaseIds = [];
  const caseDimById = new Map();
  for (const l of lines) {
    const c = JSON.parse(l);
    caseDimById.set(c.id, c.dimension);
    if (c.gt && c.gt.status === manifest.inputs.cases.eligible_status) ratifiedCaseIds.push(c.id);
    else if (c.gt && c.gt.status !== manifest.inputs.cases.eligible_status) proposedCaseIds.push(c.id);
  }
  if (ratifiedCaseIds.length === 0) be('no_ratified_cases', 'cases.jsonl has 0 ratified cases at subject_revision');
  verifyControls(manifest.controls, ratifiedCaseIds, sr.commit);

  // Step 12: schedule
  verifySchedule(manifest.schedule, ratifiedCaseIds);

  // Step 13: smoke
  verifySmoke(manifest.smoke, ratifiedCaseIds, caseDimById);

  // Step 14: output_policy
  verifyOutputPolicy(manifest.output_policy);

  // Step 15: manifest_seal_commit = current HEAD
  const manifestSealCommit = execFileSync('git', ['-C', REPO_ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (!/^[0-9a-f]{40}$/.test(manifestSealCommit)) be('seal_commit_format', manifestSealCommit);

  return {
    manifest,
    binding_sha256: BINDING_SHA,
    subject_revision_commit: sr.commit,
    manifest_seal_commit: manifestSealCommit,
    ratified_case_ids: ratifiedCaseIds,
    proposed_case_ids: proposedCaseIds,
    // Frozen honest disclosure of what is not yet real (mock_acceptance
    // acceptance_evidence.known_execution_blockers).
    known_execution_blockers: Array.isArray(binding.known_execution_blockers) ? binding.known_execution_blockers : [],
  };
}

// BLOCKER 2b fix (part 1/2) — canonical-path pinning. Pre-fix, inputs.
// runner/rubric/analysis could point at ANY tracked file whose bytes were
// merely self-consistent with the declared sha256 (i.e. "whatever file
// sits at this path hashes to this value" — trivially true of any file
// hashed against itself). That proves nothing about whether the declared
// path IS the module actually loaded by the runner process. Pinning these
// three fields to their real repo-relative locations, combined with
// runner-conformant.mjs's running-module hash check (verifyRunningModules
// BoundToManifest), closes the gap: the path can no longer be redirected
// to a same-named decoy, and the hash is then checked against the file
// that literally executes.
const CANONICAL_INPUT_PATHS = {
  runner: '_SYSTEM/Scripts/eval/persona-behavioral/runner-conformant.mjs',
  rubric: '_SYSTEM/Scripts/eval/persona-behavioral/rubric.mjs',
  analysis: '_SYSTEM/Scripts/eval/persona-behavioral/bootstrap.mjs',
};

function verifyInputs(inputs, subjectRevisionCommit) {
  const required = ['cases', 'rubric', 'runner', 'analysis'];
  for (const k of required) {
    if (inputs[k] === undefined) be('inputs_missing', k);
    if (typeof inputs[k].path !== 'string' || !inputs[k].path) be('inputs_missing_field', `${k}.path`);
    if (CANONICAL_INPUT_PATHS[k] && inputs[k].path !== CANONICAL_INPUT_PATHS[k]) {
      be('inputs_path_not_canonical', `inputs.${k}.path must equal ${CANONICAL_INPUT_PATHS[k]}, got ${inputs[k].path}`);
    }
    if (typeof inputs[k].sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(inputs[k].sha256)) {
      be('inputs_sha_malformed', `${k}.sha256`);
    }
    const onDiskSha = sha256File(getRepoRelative(inputs[k].path));
    if (onDiskSha !== inputs[k].sha256) {
      be('inputs_hash_mismatch', `inputs.${k}: on-disk ${onDiskSha} != manifest ${inputs[k].sha256}`);
    }
    ensureTrackedAtCommit(inputs[k].path, subjectRevisionCommit);
    ensureCleanBytesAtCommit(inputs[k].path, subjectRevisionCommit);
  }
  const cases = inputs.cases;
  for (const f of ['rows', 'eligible_status', 'owner_ratification_commit']) {
    if (cases[f] === undefined) be('inputs_cases_missing_field', `inputs.cases.${f} missing`);
  }
  if (cases.eligible_status !== 'ratified') be('inputs_cases_not_ratified', `eligible_status=${cases.eligible_status}`);
  if (!inputs.rubric.version) be('inputs_rubric_missing_version', 'inputs.rubric.version missing');
  return true;
}

// BLOCKER 1 (G0 correspondence) — the transitive include closure reachable
// from ordered_source_paths must EQUAL ordered_source_paths. Assembly (in
// verifyArms below), per_source_sha256, and the committed-source drift
// checks all loop ONLY over ordered_source_paths — so any node reachable
// via transitive_include_graph but absent from ordered_source_paths would
// be silently omitted from the sealed/executed prompt (counterexample:
// graph={A:[B],B:[]}, ordered_source_paths=[A] — B is DFS-reachable but
// never assembled/hashed/checked). Rejects both directions: a reachable
// extra not in ordered_source_paths, AND (via the size-equality check) any
// ordered_source_paths entry that duplicates or otherwise fails to round-
// trip through the closure. Pure function — no git/fs access — so it is
// directly unit-testable without a fixture repo.
export function verifyIncludeClosure(orderedSourcePaths, graph, armLabel) {
  if (!Array.isArray(orderedSourcePaths) || orderedSourcePaths.length === 0) {
    be('include_closure_ordered_sources_invalid', `${armLabel}: ${orderedSourcePaths}`);
  }
  if (!graph || typeof graph !== 'object') {
    be('include_closure_graph_invalid', `${armLabel}: ${JSON.stringify(graph)}`);
  }
  const nodes = new Set(Object.keys(graph));
  const orderedSet = new Set(orderedSourcePaths);
  if (orderedSet.size !== orderedSourcePaths.length) {
    be('include_ordered_sources_duplicate', `${armLabel}: duplicate entries in ordered_source_paths`);
  }
  for (const src of orderedSourcePaths) {
    if (!nodes.has(src)) be('include_graph_source_not_a_node', `${armLabel}: ${src}`);
  }
  const seen = new Set();
  const stack = [...orderedSourcePaths];
  while (stack.length) {
    const node = stack.pop();
    if (seen.has(node)) continue;
    seen.add(node);
    const includes = graph[node];
    if (!Array.isArray(includes)) be('include_graph_node_not_array', `${armLabel}: ${node}`);
    for (const inc of includes) {
      if (!nodes.has(inc)) be('include_graph_dangling_include', `${armLabel}: ${node} -> ${inc}`);
      stack.push(inc);
    }
  }
  // The reachable closure must equal ordered_source_paths exactly. Every
  // ordered source is trivially in its own closure (DFS roots), so a size
  // mismatch or an extra reachable member both indicate a node the
  // assembly/hash/commit checks never see.
  if (seen.size !== orderedSet.size) {
    be('include_closure_not_bound_to_assembly', `${armLabel}: closure size ${seen.size} != ordered_source_paths size ${orderedSet.size}`);
  }
  for (const node of seen) {
    if (!orderedSet.has(node)) {
      be('include_closure_extra_not_in_ordered_sources', `${armLabel}: ${node} reachable but absent from ordered_source_paths/per_source_sha256/assembly`);
    }
  }
  return true;
}

function verifyArms(arms, subjectRevisionCommit) {
  const requiredIds = ['A', 'B', 'C'];
  const expectedRole = { A: 'full_persona_baseline', B: 'compressed_persona_candidate', C: 'generic_construct_control' };
  for (const k of requiredIds) {
    if (!arms[k]) be('arms_missing', `arm ${k} missing`);
    const arm = arms[k];
    if (arm.role !== expectedRole[k]) be('arms_role_mismatch', `arm ${k} role=${arm.role}`);
    if (typeof arm.fixture_manifest_path !== 'string' || !arm.fixture_manifest_path) {
      be('arms_missing_field', `arm ${k}.fixture_manifest_path missing`);
    }
    if (typeof arm.fixture_manifest_sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(arm.fixture_manifest_sha256)) {
      be('arms_missing_field', `arm ${k}.fixture_manifest_sha256 missing or malformed`);
    }
    const abs = getRepoRelative(arm.fixture_manifest_path);
    const onDiskSha = sha256File(abs);
    if (onDiskSha !== arm.fixture_manifest_sha256) {
      be('arm_fixture_manifest_hash_mismatch', `arm ${k}: on-disk ${onDiskSha} != manifest ${arm.fixture_manifest_sha256}`);
    }
    ensureTrackedAtHead(arm.fixture_manifest_path);
    // Parse fixture manifest and validate fully. Attach onto arm[k].parsed
    // so verifyPersonaSpanCorrespondance and the runner can read it
    // without re-reading from disk.
    const fx = JSON.parse(readFileSync(abs, 'utf8'));
    if (fx.schema_version !== 'persona-behavioral-arm-fixture-manifest.v1') {
      be('arm_fixture_schema_version', `${k}: ${fx.schema_version}`);
    }
    if (fx.arm_id !== k) be('arm_fixture_arm_id', `${k}: ${fx.arm_id}`);
    if (fx.tool_policy !== 'disabled') be('arm_fixture_tool_policy', `${k}: ${fx.tool_policy}`);
    if (typeof fx.assembled_prompt_sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(fx.assembled_prompt_sha256)) {
      be('arm_fixture_assembled_sha_missing', `${k}: ${fx.assembled_prompt_sha256}`);
    }
    if (typeof fx.assembled_prompt_bytes !== 'number' || fx.assembled_prompt_bytes <= 0) {
      be('arm_fixture_assembled_bytes_invalid', `${k}: ${fx.assembled_prompt_bytes}`);
    }
    if (!Array.isArray(fx.ordered_source_paths) || fx.ordered_source_paths.length === 0) {
      be('arm_fixture_ordered_sources_invalid', `${k}: ${fx.ordered_source_paths}`);
    }
    if (k === 'A' || k === 'B') {
      if (!fx.declared_persona_span || typeof fx.declared_persona_span.source_path !== 'string') {
        be('arm_fixture_declared_persona_span', `${k}: declared_persona_span missing`);
      }
    }
    // FIX 4 — arm_fixture_manifest_contract conformance (frozen binding):
    //   required_fields + base_commit_rule + separator_bytes_shape +
    //   transitive_include_graph present + generic_arm_c (exact Arm C).
    const armFixtureRequired = ['arm_id', 'base_commit', 'ordered_source_paths', 'transitive_include_graph', 'per_source_sha256', 'assembly_algorithm', 'separator_bytes', 'assembled_prompt_sha256', 'assembled_prompt_bytes', 'tool_policy'];
    for (const f of armFixtureRequired) {
      if (fx[f] === undefined) be('arm_fixture_missing_field', `${k}.${f}`);
    }
    // base_commit_rule: every arm fixture base_commit == subject_revision.commit
    if (fx.base_commit !== subjectRevisionCommit) {
      be('arm_fixture_base_commit_mismatch', `${k}: ${fx.base_commit} != ${subjectRevisionCommit}`);
    }
    if (typeof fx.assembly_algorithm !== 'string' || !fx.assembly_algorithm) {
      be('arm_fixture_assembly_algorithm_invalid', `${k}: ${fx.assembly_algorithm}`);
    }
    // separator_bytes_shape: { encoding: 'base64', value: <string> }
    if (!fx.separator_bytes || fx.separator_bytes.encoding !== 'base64' || typeof fx.separator_bytes.value !== 'string') {
      be('arm_fixture_separator_bytes_shape', `${k}: ${JSON.stringify(fx.separator_bytes)}`);
    }
    // transitive_include_graph must be present and an object.
    if (fx.transitive_include_graph === null || typeof fx.transitive_include_graph !== 'object') {
      be('arm_fixture_transitive_include_graph', `${k}: ${JSON.stringify(fx.transitive_include_graph)}`);
    }
    // BLOCKER 1 fix — G0 correspondence (frozen binding
    // arm_fixture_manifest_contract: "include closure ... must match" the
    // assembled/hashed/committed source set). verifyIncludeClosure both
    // mechanically RESOLVES the DFS closure (Atlas AXIS7b: every ordered
    // source is a graph node; every include is itself a node, no dangling
    // reference) AND binds that closure to ordered_source_paths — the set
    // assembly (below), per_source_sha256, and the committed-source checks
    // all loop over EXCLUSIVELY. Pre-fix, the DFS `seen` set was computed
    // then discarded: a node reachable via transitive_include_graph but
    // absent from ordered_source_paths was silently omitted from the
    // sealed/executed prompt. Exported for direct unit testing (no git
    // fixture required).
    verifyIncludeClosure(fx.ordered_source_paths, fx.transitive_include_graph, k);
    // per_source_sha256 must cover EXACTLY the ordered_source_paths — no
    // missing keys (already fatal below when the per-source loop compares
    // fx.per_source_sha256[srcRel] against the committed hash) and no
    // untethered extra keys (silently-declared hashes for content that is
    // never assembled would be dead weight at best, a laundering vector at
    // worst).
    if (!fx.per_source_sha256 || typeof fx.per_source_sha256 !== 'object') {
      be('arm_fixture_per_source_sha256_shape', `${k}`);
    }
    {
      const orderedSet = new Set(fx.ordered_source_paths);
      const perSrcKeys = Object.keys(fx.per_source_sha256);
      if (perSrcKeys.length !== orderedSet.size || perSrcKeys.some((p) => !orderedSet.has(p))) {
        be('arm_per_source_sha256_keys_mismatch', `${k}: per_source_sha256 keys must equal ordered_source_paths exactly`);
      }
    }
    // generic_arm_c: Arm C must be the EXACT frozen generic control.
    if (k === 'C') {
      const gc = loadBinding().arm_fixture_manifest_contract.generic_arm_c;
      if (fx.assembled_prompt_sha256 !== gc.sha256) be('arm_c_not_generic_sha', `${fx.assembled_prompt_sha256} != ${gc.sha256}`);
      if (fx.assembled_prompt_bytes !== gc.bytes) be('arm_c_not_generic_bytes', `${fx.assembled_prompt_bytes} != ${gc.bytes}`);
    }
    // E1 — MANDATORY CONFORMANCE (frozen binding clauses):
    //   arm_fixture_manifest_contract.assembly_rule: "read committed source
    //     bytes in recorded order, join with recorded separator bytes,
    //     recompute assembled_prompt_sha256 before every trial."
    //   inputs.hash_rule: "Hash referenced source bytes from
    //     subject_revision.commit and require the clean seal checkout to
    //     contain identical bytes before any subject process starts."
    //   path_policy.working_tree_must_match_subject_revision_for_referenced_sources
    //   manifest_seal.source_stability_rule: "Any source change after
    //     subject_revision invalidates the manifest."
    const sep = Buffer.from(
      (fx.separator_bytes && fx.separator_bytes.value) || '',
      (fx.separator_bytes && fx.separator_bytes.encoding) || 'base64',
    );
    let assembled = null;
    for (const srcRel of fx.ordered_source_paths) {
      ensureTrackedAtCommit(srcRel, subjectRevisionCommit);
      const committedBytes = execFileSync('git', ['-C', REPO_ROOT, 'show', `${subjectRevisionCommit}:${srcRel}`]); // Buffer, byte-exact
      // per_source_sha256 checked against the committed source bytes.
      const committedSrcSha = sha256(committedBytes);
      if (fx.per_source_sha256[srcRel] !== committedSrcSha) {
        be('arm_per_source_sha_mismatch', `${k}:${srcRel}: recorded ${fx.per_source_sha256[srcRel]} != committed ${committedSrcSha}`);
      }
      // working_tree_must_match_subject_revision_for_referenced_sources
      const onDiskBytes = readFileSync(getRepoRelative(srcRel));
      if (!committedBytes.equals(onDiskBytes)) {
        be('source_drift_vs_subject_revision', `${k}:${srcRel}: working tree != subject_revision`);
      }
      assembled = assembled === null ? committedBytes : Buffer.concat([assembled, sep, committedBytes]);
    }
    // recompute assembled_prompt_sha256 from committed source bytes
    const assembledBytes = assembled === null ? Buffer.alloc(0) : assembled;
    const recomputedAssembledSha = sha256(assembledBytes);
    if (recomputedAssembledSha !== fx.assembled_prompt_sha256) {
      be('arm_assembled_sha_drift_vs_subject_revision', `${k}: recomputed ${recomputedAssembledSha} != manifest ${fx.assembled_prompt_sha256}`);
    }
    if (assembledBytes.length !== fx.assembled_prompt_bytes) {
      be('arm_assembled_bytes_length_mismatch', `${k}: ${assembledBytes.length} != ${fx.assembled_prompt_bytes}`);
    }
    // FIX 1 — carry the VERIFIED assembled bytes so the runner sends each
    // arm's OWN committed prompt bytes (no JSON-of-parsed fallback, no
    // collapse of B/C onto A). Consumed by verifyPersonaSpanCorrespondance
    // and runManifest.
    arm.assembled_bytes = assembledBytes;
    // Persist parsed fixture for downstream consumers (no re-read).
    arm.parsed = fx;
  }
  return true;
}

// FIX 2 — REAL declared_persona_span correspondence (G0), per the frozen
// arm_fixture_manifest_contract.declared_persona_span.comparison_rule:
//   "Remove each declared persona span from A and B. Prefix and suffix
//    bytes must then be identical. Span bounds and content hashes must
//    match the assembled packets. Any other differing byte fails G0
//    correspondence."
// Operates on the VERIFIED assembled bytes (arm.assembled_bytes), not on
// declared lengths. Only A vs B is subject to this (single_variable_rule);
// C legitimately differs.
function verifyPersonaSpanCorrespondance(arms) {
  const spans = {};
  const bytes = {};
  for (const label of ['A', 'B']) {
    const arm = arms[label];
    if (!arm || !arm.parsed) be('persona_span_arm_missing', label);
    const fx = arm.parsed;
    const b = arm.assembled_bytes;
    if (!Buffer.isBuffer(b)) be('persona_span_assembled_bytes_missing', label);
    const span = fx.declared_persona_span;
    if (!span || typeof span.assembled_start_byte !== 'number' || typeof span.assembled_end_byte !== 'number') {
      be('declared_persona_span_malformed', label);
    }
    if (span.assembled_start_byte < 0 || span.assembled_end_byte > b.length || span.assembled_start_byte > span.assembled_end_byte) {
      be('declared_persona_span_out_of_bounds', `${label}: [${span.assembled_start_byte},${span.assembled_end_byte}] out of [0,${b.length}]`);
    }
    // Span bounds/content hash must match the actual assembled packet bytes.
    const spanBytes = b.slice(span.assembled_start_byte, span.assembled_end_byte);
    const spanSha = sha256(spanBytes);
    if (spanSha !== span.content_sha256) {
      be('declared_persona_span_content_sha_mismatch', `${label}: span ${spanSha} != declared ${span.content_sha256}`);
    }
    spans[label] = span;
    bytes[label] = b;
  }
  // Remove each declared span; prefix and suffix must be byte-identical.
  const aPrefix = bytes.A.slice(0, spans.A.assembled_start_byte);
  const aSuffix = bytes.A.slice(spans.A.assembled_end_byte);
  const bPrefix = bytes.B.slice(0, spans.B.assembled_start_byte);
  const bSuffix = bytes.B.slice(spans.B.assembled_end_byte);
  if (!aPrefix.equals(bPrefix)) {
    be('persona_span_prefix_mismatch', 'G0: A/B prefix bytes differ outside the declared persona span');
  }
  if (!aSuffix.equals(bSuffix)) {
    be('persona_span_suffix_mismatch', 'G0: A/B suffix bytes differ outside the declared persona span');
  }
  return true;
}

function verifySubject(subject, subjectRevisionCommit) {
  const required = ['adapter_kind', 'adapter_path', 'adapter_sha256', 'executable_path',
                   'requested', 'tool_policy', 'fresh_process_per_trial', 'max_attempts', 'retry_condition'];
  for (const f of required) {
    if (subject[f] === undefined) be('subject_missing_field', `subject.${f} missing`);
  }
  if (!['mock'].includes(subject.adapter_kind)) {
    be('subject_adapter_kind_forbidden', `adapter_kind=${subject.adapter_kind}`);
  }
  if (subject.tool_policy !== 'disabled') be('subject_tool_policy', `got ${subject.tool_policy}`);
  if (subject.fresh_process_per_trial !== true) be('subject_fresh_process', 'must be true');
  if (subject.max_attempts !== 2) be('subject_max_attempts', `got ${subject.max_attempts}`);
  if (subject.retry_condition !== 'transport_failure_only') be('subject_retry_condition', `got ${subject.retry_condition}`);
  if (typeof subject.adapter_sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(subject.adapter_sha256)) {
    be('subject_adapter_sha_malformed', subject.adapter_sha256);
  }
  const onDiskSha = sha256File(getRepoRelative(subject.adapter_path));
  if (onDiskSha !== subject.adapter_sha256) {
    be('subject_adapter_sha_mismatch', `${onDiskSha} != ${subject.adapter_sha256}`);
  }
   ensureTrackedAtCommit(subject.adapter_path, subjectRevisionCommit);
   const adapterAtSrSha = sha256FileAtCommit(subject.adapter_path, subjectRevisionCommit);
   if (adapterAtSrSha !== subject.adapter_sha256) {
     be('subject_adapter_sha_drift_subject_revision', `${adapterAtSrSha} != ${subject.adapter_sha256}`);
   }
   // FIX 5 — requested identity schema per the FROZEN binding
   // (execution_manifest_contract.subject.requested_required_fields), not an
   // ad-hoc set. undefined is a hard miss; unsupported settings must be
   // present as null (unsupported_rule), which `!== undefined` accepts.
   const requestedRequired = loadBinding().execution_manifest_contract.subject.requested_required_fields;
   for (const f of requestedRequired) {
     if (!subject.requested || subject.requested[f] === undefined) be('subject_requested_missing_field', f);
   }
   // BLOCKER 2a fix — bind the manifest's CLAIMED runtime identity to the
   // identity that will ACTUALLY be used. Pre-fix, this function only
   // checked presence of subject.requested fields; runner-conformant.mjs
   // separately built the real identity from a hardcoded
   // getMockRequestedIdentity() + process.execPath, never comparing it to
   // manifest.subject.requested/executable_path — so a manifest could
   // declare a different model/argv/seed/executable and still be accepted.
   // Since adapter_kind is restricted to 'mock' above, the only identity
   // the subject can ever actually request under this phase is the
   // adapter's own getMockRequestedIdentity() output; the manifest's
   // declaration must match it byte-for-byte (extra or missing keys both
   // fail), and executable_path must match the process that will actually
   // run the trials.
   if (subject.executable_path !== process.execPath) {
     be('subject_executable_path_mismatch', `manifest declared ${subject.executable_path} != actual ${process.execPath}`);
   }
   const actualRequested = getMockRequestedIdentity();
   const sortObj = (o) => Object.keys(o).sort().reduce((acc, k) => { acc[k] = o[k]; return acc; }, {});
   const declaredRequestedJSON = JSON.stringify(sortObj(subject.requested));
   const actualRequestedJSON = JSON.stringify(sortObj(actualRequested));
   if (declaredRequestedJSON !== actualRequestedJSON) {
     be('subject_requested_identity_mismatch', `manifest declared ${declaredRequestedJSON} != actual mock identity ${actualRequestedJSON}`);
   }
   return true;
 }

function verifyControls(controls, ratifiedCaseIds, subjectRevisionCommit) {
  for (const f of ['path', 'sha256', 'status', 'rows', 'owner_ratification_commit']) {
    if (controls[f] === undefined) be('controls_missing_field', f);
  }
  if (controls.status !== 'ratified') be('controls_not_ratified', controls.status);
  if (!/^[0-9a-f]{40}$/.test(controls.owner_ratification_commit || '')) {
    be('controls_owner_ratification_commit_format', controls.owner_ratification_commit);
  }
  const abs = getRepoRelative(controls.path);
  const onDiskSha = sha256File(abs);
  if (onDiskSha !== controls.sha256) be('controls_hash_mismatch', `${onDiskSha} != ${controls.sha256}`);
  ensureTrackedAtHead(controls.path);
  ensureTrackedAtCommit(controls.path, subjectRevisionCommit);
  const ctrlAtSrSha = sha256FileAtCommit(controls.path, subjectRevisionCommit);
  if (ctrlAtSrSha !== controls.sha256) be('controls_sha_drift_subject_revision', `${ctrlAtSrSha} != ${controls.sha256}`);
  const ctrlBytes = readFileSync(abs, 'utf8');
  const ctrl = JSON.parse(ctrlBytes);
  for (const cid of ratifiedCaseIds) {
    if (!ctrl[cid]) be('controls_case_missing', cid);
    if (typeof ctrl[cid].positive !== 'string' || typeof ctrl[cid].negative !== 'string') {
      be('controls_strand_field', `${cid} must have positive + negative strings`);
    }
  }
  if (controls.rows !== ratifiedCaseIds.length) {
    be('controls_rows_mismatch', `${controls.rows} != ${ratifiedCaseIds.length}`);
  }
  return true;
}

// AXIS 4 (Atlas#4) — pure schedule CONTENT conformance (no disk). Enforces
// schedule.coverage_rule: "Every ratified case and each trial index appears
// exactly once, with A, B, and C each appearing exactly once in arm_order."
// Exported for discriminating unit tests.
function verifyScheduleContent(schedule, ratifiedCaseIds) {
  for (const f of ['randomization_seed', 'entries', 'sha256', 'path']) {
    if (schedule[f] === undefined) be('schedule_missing_field', f);
  }
  if (schedule.randomization_seed !== 20260729) be('schedule_seed', `got ${schedule.randomization_seed}`);
  if (!Array.isArray(schedule.entries) || schedule.entries.length !== ratifiedCaseIds.length * 3) {
    be('schedule_entries_count', `got ${schedule.entries && schedule.entries.length}`);
  }
  // Per case: trial_index must be EXACTLY {0,1,2}, each once (no dup/missing);
  // per entry: arm_order must contain A, B, C each exactly once; entries carry
  // the required fields.
  const seenTrialIdx = {}; // case_id -> Set(trial_index)
  for (const e of schedule.entries) {
    for (const f of ['case_id', 'trial_index', 'arm_order']) {
      if (e[f] === undefined) be('schedule_entry_missing_field', f);
    }
    if (!ratifiedCaseIds.includes(e.case_id)) be('schedule_case_not_ratified', e.case_id);
    if (typeof e.trial_index !== 'number' || ![0, 1, 2].includes(e.trial_index)) {
      be('schedule_trial_index', JSON.stringify(e));
    }
    if (!Array.isArray(e.arm_order) || e.arm_order.length !== 3) {
      be('schedule_arm_order_shape', JSON.stringify(e.arm_order));
    }
    const armSet = new Set(e.arm_order);
    if (armSet.size !== 3 || !armSet.has('A') || !armSet.has('B') || !armSet.has('C')) {
      be('schedule_arm_order_members', `${e.case_id}#${e.trial_index}: ${JSON.stringify(e.arm_order)}`);
    }
    seenTrialIdx[e.case_id] = seenTrialIdx[e.case_id] || new Set();
    if (seenTrialIdx[e.case_id].has(e.trial_index)) {
      be('schedule_duplicate_trial_index', `${e.case_id}#${e.trial_index}`);
    }
    seenTrialIdx[e.case_id].add(e.trial_index);
  }
  // Every ratified case: exactly {0,1,2}.
  for (const cid of ratifiedCaseIds) {
    const s = seenTrialIdx[cid];
    if (!s || s.size !== 3 || !s.has(0) || !s.has(1) || !s.has(2)) {
      be('schedule_case_trial_index_coverage', `${cid}: ${s ? [...s].sort().join(',') : 'none'}`);
    }
  }
  // Inline self-consistency (necessary, NOT sufficient — never touches disk).
  const json = JSON.stringify({ randomization_seed: schedule.randomization_seed, entries: schedule.entries });
  if (sha256(json) !== schedule.sha256) be('schedule_sha_mismatch', `${schedule.sha256} != ${sha256(json)}`);
  return true;
}

function verifySchedule(schedule, ratifiedCaseIds) {
  verifyScheduleContent(schedule, ratifiedCaseIds);
  // E2 — MANDATORY CONFORMANCE (frozen binding clauses):
  //   path_policy.working_tree_must_match_current_head_for_seal_artifacts:
  //     the schedule is a seal artifact with an on-disk path; its working-
  //     tree bytes must equal the bytes committed at HEAD.
  //   inputs.hash_rule (clean seal checkout must contain identical bytes):
  //     the on-disk seal artifact must hash to the sealed schedule.sha256.
  const schedAbs = getRepoRelative(schedule.path);
  const schedOnDisk = readFileSync(schedAbs); // Buffer, byte-exact
  let schedAtHead;
  try {
    schedAtHead = execFileSync('git', ['-C', REPO_ROOT, 'show', `HEAD:${schedule.path}`]); // Buffer
  } catch { be('seal_artifact_schedule_untracked_at_head', schedule.path); }
  if (!schedOnDisk.equals(schedAtHead)) {
    be('seal_artifact_schedule_drift_vs_head', `${schedule.path}: working tree != HEAD`);
  }
  if (sha256(schedOnDisk) !== schedule.sha256) {
    be('seal_artifact_schedule_sha_drift', `${schedule.path}: on-disk ${sha256(schedOnDisk)} != sealed ${schedule.sha256}`);
  }
  return true;
}

// AXIS 7a (Atlas#7) — instrument_smoke.selection: "Two ratified cases from
// DIFFERENT dimensions." The flag `different_dimensions_required` is necessary
// but not sufficient; the two chosen cases must ACTUALLY have distinct
// dimensions. caseDimById maps case_id -> dimension (from the cases at
// subject_revision). Exported for discriminating unit tests.
function verifySmoke(smoke, ratifiedCaseIds, caseDimById) {
  if (!Array.isArray(smoke.case_ids) || smoke.case_ids.length !== 2) be('smoke_case_ids_count', smoke.case_ids);
  if (smoke.different_dimensions_required !== true) be('smoke_dimensions_required', '');
  if (smoke.decision_dataset_consumption !== false) be('smoke_decision_dataset', `${smoke.decision_dataset_consumption}`);
  for (const cid of smoke.case_ids) if (!ratifiedCaseIds.includes(cid)) be('smoke_case_not_ratified', cid);
  const dims = caseDimById || new Map();
  const d0 = dims.get(smoke.case_ids[0]);
  const d1 = dims.get(smoke.case_ids[1]);
  if (d0 === undefined || d1 === undefined) be('smoke_case_dimension_unknown', `${smoke.case_ids.join(',')}`);
  if (d0 === d1) be('smoke_cases_same_dimension', `${smoke.case_ids[0]} and ${smoke.case_ids[1]} share dimension ${d0}`);
  return true;
}

function verifyOutputPolicy(p) {
  if (typeof p.results_log_path !== 'string' || !p.results_log_path) be('output_policy_results_log', p.results_log_path);
  if (p.full_responses_persisted !== false) be('output_policy_full_responses', `${p.full_responses_persisted}`);
  if (p.excerpt_max_chars !== 180) be('output_policy_excerpt_max_chars', `got ${p.excerpt_max_chars}`);
  return true;
}

export { BINDING_PATH, BINDING_SHA, BlockError, resolveManifest, sha256, verifyPersonaSpanCorrespondance, verifyScheduleContent, verifySmoke };
// verifyIncludeClosure is already exported inline above (BLOCKER 1).

#!/usr/bin/env node
/**
 * Workcell orchestration core.
 *
 * Provides DAG validation (hard gate), packet assembly, scope checking,
 * and output collection for the Sonnet workcell protocol.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { topologicalSort } from './math/math-kernel.mjs';
import { isProtectedPath } from './lane-kernel.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../..');
export const WORKCELL_STATE_DIR = path.join('_SYSTEM', 'state', 'workcell');

export const WORKCELL_ROLES = Object.freeze([
  'builder',
  'scout',
  'guardrail',
  'registry',
]);

export const WORKCELL_PACKET_SCHEMA = 'yuri.workcell.packet.v0';
export const WORKCELL_DECOMPOSITION_SCHEMA = 'yuri.workcell.decomposition.v0';

// ---------------------------------------------------------------------------
// Path safety
// ---------------------------------------------------------------------------

function assertSafeRelPath(filePath) {
  if (!filePath || typeof filePath !== 'string') return `path must be a non-empty string, got ${typeof filePath}`;
  const normalized = filePath.replaceAll('\\', '/');
  if (path.isAbsolute(normalized) || path.isAbsolute(filePath)) return `absolute path not allowed: ${filePath}`;
  if (normalized.startsWith('../') || normalized.includes('/../') || normalized === '..') {
    return `path escapes repo root: ${filePath}`;
  }
  if (isProtectedPath(normalized)) return `protected path: ${filePath}`;
  return '';
}

// ---------------------------------------------------------------------------
// DAG validation — hard gate
// ---------------------------------------------------------------------------

export function validateDecompositionDag(decomposition) {
  if (!decomposition || typeof decomposition !== 'object') {
    return dagFailure('decomposition must be an object');
  }
  const nodes = decomposition.nodes;
  const edges = decomposition.edges;
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return dagFailure('decomposition must have at least one node');
  }

  const errors = [];
  const nodeIds = new Set();
  for (const node of nodes) {
    if (!node || typeof node !== 'object') {
      errors.push('each node must be an object with id, role, and filesInScope');
      continue;
    }
    if (!node.id || typeof node.id !== 'string') {
      errors.push('node missing id');
      continue;
    }
    if (nodeIds.has(node.id)) {
      errors.push(`duplicate node id: ${node.id}`);
    }
    nodeIds.add(node.id);
    if (!WORKCELL_ROLES.includes(node.role)) {
      errors.push(`node ${node.id} has unknown role: ${node.role || '<missing>'}`);
    }
    if (!Array.isArray(node.filesInScope) || node.filesInScope.length === 0) {
      errors.push(`node ${node.id} must declare filesInScope`);
    }
    for (const filePath of node.filesInScope || []) {
      const pathError = assertSafeRelPath(filePath);
      if (pathError) errors.push(`node ${node.id}: ${pathError}`);
    }
  }

  if (!Array.isArray(edges)) {
    errors.push('decomposition.edges must be an array');
  }
  for (const edge of edges || []) {
    if (!edge || typeof edge !== 'object') {
      errors.push('each edge must be an object with from and to');
      continue;
    }
    if (!nodeIds.has(edge.from)) errors.push(`edge references unknown source node: ${edge.from}`);
    if (!nodeIds.has(edge.to)) errors.push(`edge references unknown target node: ${edge.to}`);
  }

  if (errors.length > 0) {
    return { ok: false, gate: 'dag-structure', errors, order: null, proof: null };
  }

  try {
    const dagInput = {
      nodes: [...nodeIds],
      edges: (edges || []).map((e) => ({ from: e.from, to: e.to })),
    };
    const result = topologicalSort(dagInput);
    return {
      ok: true,
      gate: 'dag-validation',
      errors: [],
      order: result.order,
      proof: result.proof,
      dagRoots: findDagRoots(dagInput),
    };
  } catch (err) {
    return {
      ok: false,
      gate: 'dag-cycle-detection',
      errors: [`topological sort failed: ${err.message}`],
      order: null,
      proof: null,
    };
  }
}

function findDagRoots(dag) {
  const hasIncoming = new Set();
  for (const edge of dag.edges || []) {
    hasIncoming.add(edge.to);
  }
  return dag.nodes.filter((id) => !hasIncoming.has(id));
}

function dagFailure(message) {
  return { ok: false, gate: 'dag-structure', errors: [message], order: null, proof: null };
}

// ---------------------------------------------------------------------------
// Packet assembly
// ---------------------------------------------------------------------------

export function buildWorkerPacket(node, options = {}) {
  if (!node || !node.id) throw new Error('worker packet requires a node with id');
  if (!node.role || !WORKCELL_ROLES.includes(node.role)) {
    throw new Error(`unknown worker role: ${node.role || '<missing>'}`);
  }

  const errors = [];
  for (const filePath of node.filesInScope || []) {
    const pathError = assertSafeRelPath(filePath);
    if (pathError) errors.push(pathError);
  }
  if (errors.length > 0) {
    throw new Error(`packet scope violation: ${errors.join('; ')}`);
  }

  return {
    schema: WORKCELL_PACKET_SCHEMA,
    packetId: node.id,
    role: node.role,
    goal: node.goal || options.goal || '',
    filesInScope: node.filesInScope || [],
    memoryCapsule: options.memoryCapsule || null,
    dagValidation: options.dagValidation || null,
    constraints: {
      noCommit: true,
      noProtectedAccess: true,
      noSdkCalls: true,
    },
    expectedOutputSchema: `yuri.workcell.output.${node.role}.v0`,
  };
}

// ---------------------------------------------------------------------------
// Output scope check
// ---------------------------------------------------------------------------

export function validateWorkerOutput(output, packet) {
  const errors = [];

  if (!output || typeof output !== 'object') {
    return { ok: false, errors: ['output must be an object'] };
  }
  if (!packet || typeof packet !== 'object') {
    return { ok: false, errors: ['packet must be an object'] };
  }

  const scopeSet = new Set(packet.filesInScope || []);
  const rawOutputs = output.outputs;
  const rawRefs = output.evidenceRefs;

  if (rawOutputs != null && !Array.isArray(rawOutputs)) {
    errors.push('outputs must be an array');
  }
  if (rawRefs != null && !Array.isArray(rawRefs)) {
    errors.push('evidenceRefs must be an array');
  }

  for (const entry of Array.isArray(rawOutputs) ? rawOutputs : []) {
    if (!entry || typeof entry !== 'object') {
      errors.push('output entry must be a non-null object');
      continue;
    }
    const entryPath = typeof entry.path === 'string' ? entry.path : '';
    const pathError = assertSafeRelPath(entryPath);
    if (pathError) {
      errors.push(`output path unsafe: ${pathError}`);
    }
    if (scopeSet.size > 0 && !scopeSet.has(entryPath)) {
      errors.push(`output path not in filesInScope: ${entryPath}`);
    }
  }

  for (const ref of Array.isArray(rawRefs) ? rawRefs : []) {
    const refError = assertSafeRelPath(ref);
    if (refError) {
      errors.push(`evidence ref unsafe: ${refError}`);
    }
  }

  return { ok: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Decomposition builder
// ---------------------------------------------------------------------------

export function buildDecomposition(options = {}) {
  const goal = String(options.goal || '').trim();
  if (!goal) throw new Error('decomposition requires a goal');

  const nodes = options.nodes || [];
  const edges = options.edges || [];
  const runId = options.runId || buildRunId(goal);
  const createdAt = options.now || new Date().toISOString();

  const dagResult = validateDecompositionDag({ nodes, edges });

  return {
    schema: WORKCELL_DECOMPOSITION_SCHEMA,
    runId,
    createdAt,
    goal,
    dagValidation: dagResult,
    nodes,
    edges,
    dispatchOrder: dagResult.ok ? dagResult.order : null,
    dagRoots: dagResult.ok ? dagResult.dagRoots : null,
  };
}

function buildRunId(goal) {
  const stamp = new Date().toISOString().replace(/[^0-9TZ]/g, '').slice(0, 16);
  return `wc_${stamp}_${sha256(goal).slice(0, 10)}`;
}

function sha256(text) {
  return createHash('sha256').update(String(text)).digest('hex');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export function runCli(argv = process.argv.slice(2), io = {}) {
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;
  const [command, ...rest] = argv;

  if (command === 'validate-dag') {
    return cliValidateDag(rest, stdout, stderr);
  }
  if (command === 'build-packet') {
    return cliBuildPacket(rest, stdout, stderr);
  }
  stderr.write('Usage: yuri-workcell.mjs <validate-dag|build-packet> [options]\n');
  return 64;
}

function looksLikeFilePath(value) {
  return /[/\\.]/.test(value) && !value.startsWith('{') && !value.startsWith('[');
}

function safeReadCliJson(jsonArg) {
  if (looksLikeFilePath(jsonArg)) {
    const resolved = path.resolve(jsonArg);
    if (!resolved.startsWith(REPO_ROOT + path.sep) && resolved !== REPO_ROOT) {
      throw new Error(`file path outside repo root: ${jsonArg}`);
    }
    const relPath = path.relative(REPO_ROOT, resolved).replaceAll(path.sep, '/');
    if (isProtectedPath(relPath)) {
      throw new Error(`file path is protected: ${jsonArg}`);
    }
    if (existsSync(resolved)) {
      return JSON.parse(readFileSync(resolved, 'utf8'));
    }
  }
  return JSON.parse(jsonArg);
}

function cliValidateDag(argv, stdout, stderr) {
  const jsonArg = argv.find((a) => !a.startsWith('--'));
  if (!jsonArg) {
    stderr.write('validate-dag requires a JSON file path or inline JSON\n');
    return 64;
  }
  let decomposition;
  try {
    decomposition = safeReadCliJson(jsonArg);
  } catch (err) {
    stderr.write(`failed to parse decomposition: ${err.message}\n`);
    return 2;
  }
  const result = validateDecompositionDag(decomposition);
  stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result.ok ? 0 : 2;
}

function cliBuildPacket(argv, stdout, stderr) {
  const jsonArg = argv.find((a) => !a.startsWith('--'));
  if (!jsonArg) {
    stderr.write('build-packet requires a JSON node definition\n');
    return 64;
  }
  try {
    const node = safeReadCliJson(jsonArg);
    const packet = buildWorkerPacket(node);
    stdout.write(`${JSON.stringify(packet, null, 2)}\n`);
    return 0;
  } catch (err) {
    stderr.write(`[yuri-workcell] ${err.message}\n`);
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(runCli());
}

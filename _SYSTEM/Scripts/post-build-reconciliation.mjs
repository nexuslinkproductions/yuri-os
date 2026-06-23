#!/usr/bin/env node
// @capability: post-build-reconciliation
// @serves: organ propagation | xref reconciliation | gitnexus impact | os coherence | cross-referencing | structural consistency | post-build hook
// @does: reconciles YURI OS organs after structural changes — propagation-scan over circuitry, xref reconciliation, GitNexus impact. Called automatically after completed build jobs to keep the OS coherent as it grows. Returns a reconciliation report with propagation results, xref hits, and any recommended follow-up actions.
// @use: import { reconcileAfterBuild, runPropagationScan, reconcileXref, detectGitNexusChanges } from 'post-build-reconciliation.mjs'. CLI: node post-build-reconciliation.mjs [--job <job-id>] [--report].
// @exports: reconcileAfterBuild, runPropagationScan, reconcileXref, detectGitNexusChanges, PROPAGATION_SCRIPT, XREF_SCRIPT

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PROPAGATION_SCRIPT = path.join(HERE, 'propagation-scan.mjs');
export const XREF_SCRIPT = path.join(HERE, 'xref-query.mjs');

/**
 * Run propagation-scan for circuitry nodes affected by a build job.
 * @param {Object} options - { nodeId, dryRun, top }
 * @returns {Promise<{ok, nodeId, siblings, propagationSummary, error}>}
 */
export async function runPropagationScan({ nodeId, dryRun = true, top = 50 } = {}) {
  if (!nodeId) {
    return { ok: false, error: 'No nodeId provided for propagation-scan' };
  }

  try {
    const args = [PROPAGATION_SCRIPT];
    if (dryRun) args.push('--dry-run');
    if (top) args.push('--top', String(top));
    args.push(nodeId);

    const result = await spawnNode(args);
    const output = result.stdout || result.stderr || '';

    // Parse propagation-scan output (expecting JSON or structured text)
    let siblings = [];
    let propagationSummary = '';

    try {
      const jsonMatch = output.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        siblings = parsed.siblings || [];
        propagationSummary = parsed.summary || output;
      } else {
        propagationSummary = output;
      }
    } catch {
      propagationSummary = output;
    }

    return { ok: result.code === 0, nodeId, siblings, propagationSummary };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/**
 * Run xref-query reconciliation after a build.
 * @param {Object} options - { query, top, scan, all }
 * @returns {Promise<{ok, hits, structuralHits, gitnexusHits, reconciliationSummary, error}>}
 */
export async function reconcileXref({ query = '', top = 200, scan = null, all = false } = {}) {
  try {
    const args = [XREF_SCRIPT];
    if (query) args.push(query);
    if (top) args.push('--top', String(top));
    if (scan != null) args.push('--scan', String(scan));
    if (all) args.push('--all');

    const result = await spawnNode(args);
    const output = result.stdout || result.stderr || '';

    // Parse xref-query output
    let hits = 0;
    let structuralHits = 0;
    let gitnexusHits = 0;
    let reconciliationSummary = '';

    try {
      const jsonMatch = output.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        hits = parsed.counts?.fts5TotalMatches || 0;
        structuralHits = parsed.counts?.graph || 0;
        gitnexusHits = parsed.counts?.gitnexus || 0;
        reconciliationSummary = parsed.merged?.length > 0
          ? `Top ${Math.min(5, parsed.merged.length)} of ${parsed.merged.length} hits:\n${parsed.merged.slice(0, 5).map((h) => `  - ${h.path}`).join('\n')}`
          : output;
      } else {
        reconciliationSummary = output;
      }
    } catch {
      reconciliationSummary = output;
    }

    return { ok: result.code === 0, hits, structuralHits, gitnexusHits, reconciliationSummary };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/**
 * Detect GitNexus changes (impact analysis) after a build.
 * @param {Object} options - { target, direction }
 * @returns {Promise<{ok, impact, impactLevel, changesDetected, error}>}
 */
export async function detectGitNexusChanges({ target, direction = 'upstream' } = {}) {
  if (!target) {
    return { ok: false, error: 'No target provided for GitNexus impact detection' };
  }

  try {
    // GitNexus impact check via npx gitnexus
    const args = ['gitnexus', 'impact', '--target', target, '--direction', direction];
    const result = await spawnNode(args, { useNpx: true });

    const output = result.stdout || result.stderr || '';
    let impact = {};
    let impactLevel = 'LOW';

    // Parse GitNexus impact output
  try {
    const jsonMatch = output.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      impact = JSON.parse(jsonMatch[0]);
      impactLevel = impact.riskLevel || impact.impactLevel || 'LOW';
    }
  } catch {
    // Not JSON — keep raw output
  }

  const changesDetected = output.toLowerCase().includes('change') || output.toLowerCase().includes('impact');

  return { ok: result.code === 0, impact, impactLevel, changesDetected, rawOutput: output };
} catch (e) {
  return { ok: false, error: String(e?.message || e) };
}
}

/**
 * Main reconciliation function: run all three organ reconciliations after a build job.
 * @param {Object} options - { jobId, nodeId, query, targets, dryRun }
 * @returns {Promise<{ok, jobId, propagation, xref, gitnexus, summary, recommendedActions}>}
 */
export async function reconcileAfterBuild({ jobId, nodeId, query, targets = [], dryRun = true } = {}) {
  const results = {
    jobId,
    propagation: null,
    xref: null,
    gitnexus: null,
    summary: '',
    recommendedActions: [],
    ok: true,
  };

  // 1. Propagation-scan (if nodeId provided)
  if (nodeId) {
    results.propagation = await runPropagationScan({ nodeId, dryRun, top: 50 });
    if (!results.propagation.ok) {
      results.ok = false;
      results.recommendedActions.push(`Propagation-scan failed for ${nodeId}: ${results.propagation.error}`);
    } else if (results.propagation.siblings?.length > 0) {
      results.recommendedActions.push(`Propagation-scan detected ${results.propagation.siblings.length} sibling nodes for ${nodeId} — verify affected surfaces`);
    }
  }

  // 2. Xref reconciliation (always run to refresh cross-references)
  results.xref = await reconcileXref({ query: query || `job:${jobId || 'build'}`, top: 200, scan: 50 });
  if (!results.xref.ok) {
    results.ok = false;
    results.recommendedActions.push(`Xref reconciliation failed: ${results.xref.error}`);
  } else if (results.xref.hits > 0) {
    results.recommendedActions.push(`Xref reconciliation found ${results.xref.hits} total hits (${results.xref.structuralHits} structural, ${results.xref.gitnexusHits} gitnexus)`);
  }

  // 3. GitNexus impact (for each target if provided)
  if (targets.length > 0) {
    results.gitnexus = [];
    for (const target of targets) {
      const impact = await detectGitNexusChanges({ target, direction: 'upstream' });
      results.gitnexus.push({ target, ...impact });
      if (!impact.ok) {
        results.ok = false;
        results.recommendedActions.push(`GitNexus impact check failed for ${target}: ${impact.error}`);
      } else if (impact.changesDetected) {
        results.recommendedActions.push(`GitNexus impact detected for ${target} (level: ${impact.impactLevel}) — verify impact scope`);
      }
    }
  }

  // Build summary
  results.summary = [
    `# Post-Build Reconciliation Report`,
    `job: ${jobId || '(unknown)'} · ${new Date().toISOString()}`,
    '',
    '## propagation-scan',
    results.propagation
      ? (results.propagation.ok
          ? `- OK: ${results.propagation.nodeId || '(no node)'} · ${results.propagation.siblings?.length || 0} siblings detected`
          : `- FAILED: ${results.propagation.error}`)
      : '- skipped (no nodeId)',
    results.propagation?.propagationSummary ? `\n${results.propagation.propagationSummary}` : '',
    '',
    '## xref reconciliation',
    results.xref
      ? (results.xref.ok
          ? `- OK: ${results.xref.hits} total hits (${results.xref.structuralHits} structural, ${results.xref.gitnexusHits} gitnexus)`
          : `- FAILED: ${results.xref.error}`)
      : '- skipped',
    results.xref?.reconciliationSummary ? `\n${results.xref.reconciliationSummary}` : '',
    '',
    '## gitnexus impact',
    results.gitnexus?.length > 0
      ? results.gitnexus.map((g) => `- ${g.target}: ${g.ok ? `OK (level: ${g.impactLevel}, changes: ${g.changesDetected})` : `FAILED: ${g.error}`}`).join('\n')
      : '- skipped (no targets)',
    '',
    '## recommended actions',
    results.recommendedActions.length > 0
      ? results.recommendedActions.map((a) => `- ${a}`).join('\n')
      : '- (none)',
  ].join('\n');

  return results;
}

// Helper: spawn a node process and capture stdout/stderr
function spawnNode(args, { useNpx = false } = {}) {
  return new Promise((resolve) => {
    const cmd = useNpx ? 'npx' : 'node';
    const child = spawn(cmd, args, { cwd: HERE });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data; });
    child.stderr.on('data', (data) => { stderr += data; });

    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });

    child.on('error', (e) => {
      resolve({ code: -1, stdout: '', stderr: String(e?.message || e) });
    });
  });
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const opts = { jobId: null, nodeId: null, query: '', targets: [], dryRun: true };

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === '--job') { opts.jobId = argv[i + 1]; i += 2; }
    else if (arg === '--node') { opts.nodeId = argv[i + 1]; i += 2; }
    else if (arg === '--query') { opts.query = argv[i + 1]; i += 2; }
    else if (arg === '--target') { opts.targets.push(argv[i + 1]); i += 2; }
    else if (arg === '--wet-run') { opts.dryRun = false; i += 1; }
    else if (arg === '--report') { i += 1; } // handled below
    else { i += 1; }
  }

  reconcileAfterBuild(opts).then((r) => {
    if (argv.includes('--report')) {
      process.stdout.write(r.summary + '\n');
    } else {
      process.stdout.write(`${JSON.stringify(r, null, 2)}\n`);
    }
    process.exit(r.ok ? 0 : 1);
  }).catch((e) => {
    process.stderr.write(`reconciliation error: ${String(e?.message || e)}\n`);
    process.exit(1);
  });
}
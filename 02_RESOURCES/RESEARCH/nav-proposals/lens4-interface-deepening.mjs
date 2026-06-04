#!/usr/bin/env node
/**
 * lens4-interface-deepening.mjs — Agentic Iterative Deepening for Master Navigation.
 *
 * This module implements the "go deeper on sector X" / "what am I missing" workflow
 * that lets an LLM lane iteratively widen a query until the coverage receipt is
 * satisfactory. It consumes the CompletenessReceipt from lens4-interface-query.mjs
 * and produces concrete widening actions.
 *
 * [NEW] — new module, extends the master navigation layer (lens3 + lens1).
 */

import { completeQuery, type NavQueryResult, type CoverageReport, type NavQueryOptions } from './lens4-interface-query.mjs';

/**
 * A deepening step = one iteration of "widen and re-query".
 */
export interface DeepeningStep {
  step: number;
  action: DeepeningAction;
  queryBefore: string;
  queryAfter: string;
  receiptBefore: CoverageReport;
  receiptAfter: CoverageReport;
  newHits: number;
  rationale: string;
}

/**
 * Concrete widening actions derived from the MissingCritique.
 */
export type DeepeningAction =
  | { type: 'run_modality'; modality: 'fts5' | 'graph' | 'gitnexus' | 'spectrum' | 'memory'; reason: string }
  | { type: 'refresh_index'; index: 'gitnexus'; reason: string }
  | { type: 'expand_sector'; sector: string; reason: string }
  | { type: 'thaw_memory'; tier: 'hot' | 'warm' | 'cold'; reason: string }
  | { type: 'anchor_node'; nodeId: string; reason: string }
  | { type: 'broaden_query'; expandedTerms: string[]; reason: string }
  | { type: 'require_mechanism'; mechanismPattern: string; reason: string };

/**
 * Deepening plan = ordered list of actions to close coverage gaps.
 */
export interface DeepeningPlan {
  steps: DeepeningStep[];
  finalReceipt: CoverageReport;
  totalNewHits: number;
  stoppedBecause: 'satisfied' | 'max_steps' | 'no_more_actions' | 'error';
}

/**
 * Configuration for iterative deepening.
 */
export interface DeepeningConfig {
  maxSteps: number;                    // hard cap on iterations (default: 5)
  minRecallThreshold: number;          // stop when all calibrated >= this (default: 0.8)
  requireGuaranteedStructural: boolean; // if true, structural must be 'complete' (default: true)
  requireGuaranteedTopological: boolean; // if true, topological must be 'complete' (default: true)
  autoExecute: boolean;                // if true, actually run the widened queries (default: true)
  onStep?: (step: DeepeningStep) => void; // callback for logging/streaming
}

/**
 * Default configuration.
 */
export const DEFAULT_DEEPENING_CONFIG: DeepeningConfig = {
  maxSteps: 5,
  minRecallThreshold: 0.8,
  requireGuaranteedStructural: true,
  requireGuaranteedTopological: true,
  autoExecute: true,
};

/**
 * Analyze a CoverageReport and produce a prioritized list of widening actions.
 * This is the "what am I missing" critic turned into executable steps.
 */
export function critiqueToActions(receipt: CoverageReport, originalQuery: string): DeepeningAction[] {
  const actions: DeepeningAction[] = [];
  const gaps = receipt.knownGaps || [];

  // 1. Structural leg down/stale → highest priority (provable coverage)
  if (gaps.some(g => g.includes('gitnexus index') && g.includes('behind'))) {
    const match = gaps.find(g => g.includes('gitnexus index'));
    const behind = match?.match(/(\d+) commits behind/)?.[1];
    actions.push({
      type: 'refresh_index',
      index: 'gitnexus',
      reason: `gitnexus index ${behind || '?'} commits behind HEAD — structural enumeration invalid until refreshed`
    });
  }
  if (gaps.some(g => g.includes('gitnexus CLI unavailable') || g.includes('structural leg DOWN'))) {
    actions.push({
      type: 'run_modality',
      modality: 'gitnexus',
      reason: 'structural leg unavailable — GitNexus CLI missing or failed; cannot guarantee code coverage'
    });
  }

  // 2. Topological gaps — missing sectors
  const sectorGaps = gaps.filter(g => g.includes('circuitry nodes have no mapped') || g.includes('sector'));
  for (const gap of sectorGaps) {
    // Extract sector name if present
    const sectorMatch = gap.match(/sector ['"]([^'"]+)['"]/);
    const sector = sectorMatch?.[1] || 'unknown';
    actions.push({
      type: 'expand_sector',
      sector,
      reason: `topological gap: ${gap}`
    });
  }

  // 3. Doc/symbol mapping gaps — anchor on specific nodes
  const nodeGaps = gaps.filter(g => g.includes('nodes have no mapped'));
  for (const gap of nodeGaps) {
    // We can't know which nodes from the gap string alone; would need to query the index
    // For now, suggest broadening query to catch more nodes
    actions.push({
      type: 'broaden_query',
      expandedTerms: ['architecture', 'circuitry', 'organ', 'mechanism'],
      reason: `mapping gap: ${gap}`
    });
  }

  // 4. Calibrated recall below threshold
  // (The receipt doesn't expose per-modality recall directly, but we can infer from gaps)
  if (gaps.some(g => g.toLowerCase().includes('lexical') || g.toLowerCase().includes('fts5'))) {
    actions.push({
      type: 'run_modality',
      modality: 'fts5',
      reason: 'lexical coverage gap detected — FTS5 may have missed vocabulary variants'
    });
  }

  // 5. Mechanism spectrum gaps
  if (gaps.some(g => g.toLowerCase().includes('mechanism') || g.toLowerCase().includes('pattern'))) {
    actions.push({
      type: 'require_mechanism',
      mechanismPattern: 'unknown', // would be filled from MissingCritique in full impl
      reason: 'mechanism pattern coverage gap — some mechanismPattern verbs not surfaced'
    });
  }

  // 6. Memory tier gaps
  if (gaps.some(g => g.toLowerCase().includes('memory') || g.toLowerCase().includes('cold'))) {
    actions.push({
      type: 'thaw_memory',
      tier: 'cold',
      reason: 'memory coverage gap — cold store not searched for relevant organs'
    });
  }

  // 7. If no specific gaps but guarantee is 'degraded', broaden query
  if (receipt.guarantee === 'degraded' && actions.length === 0) {
    actions.push({
      type: 'broaden_query',
      expandedTerms: extractBroadeningTerms(originalQuery),
      reason: 'guarantee degraded without specific gap — broaden query vocabulary'
    });
  }

  return actions;
}

/**
 * Extract broadening terms from a query (simple heuristic).
 */
function extractBroadeningTerms(query: string): string[] {
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'how', 'what', 'why', 'when', 'where', 'who', 'which']);
  const tokens = query.toLowerCase().split(/[^a-z0-9_-]+/).filter(t => t.length >= 3 && !stopWords.has(t));
  // Add common architectural terms that often help
  const architecturalTerms = ['organ', 'mechanism', 'circuitry', 'sector', 'node', 'edge', 'flow', 'gate', 'pulse', 'memory', 'retrieval', 'index', 'graph', 'symbol', 'call', 'read', 'write', 'trigger', 'handler', 'processor', 'engine', 'kernel', 'service', 'lane', 'advisor', 'classifier', 'router'];
  return [...new Set([...tokens, ...architecturalTerms])].slice(0, 15);
}

/**
 * Execute a single deepening action by modifying the query options.
 */
export function applyAction(originalOpts: NavQueryOptions, action: DeepeningAction): NavQueryOptions {
  const opts = { ...originalOpts };

  switch (action.type) {
    case 'run_modality':
      // The query function already runs all available modalities;
      // this action is a no-op at the API level but signals intent
      break;

    case 'refresh_index':
      // Can't refresh from query side; would need to call refresh CLI
      // Signal via option that we need a fresh index
      (opts as any).requireFreshGitnexus = true;
      break;

    case 'expand_sector':
      // Add sector-specific terms to query
      opts.query = `${opts.query} sector:${action.sector}`;
      break;

    case 'thaw_memory':
      opts.includeMemoryTiers = [...(opts.includeMemoryTiers || ['hot', 'warm']), action.tier];
      break;

    case 'anchor_node':
      opts.nodeId = action.nodeId;
      break;

    case 'broaden_query':
      opts.query = `${opts.query} ${action.expandedTerms.join(' ')}`;
      break;

    case 'require_mechanism':
      opts.query = `${opts.query} mechanismPattern:${action.mechanismPattern}`;
      break;
  }

  return opts;
}

/**
 * Check if a CoverageReport satisfies the deepening config thresholds.
 */
export function isSatisfied(receipt: CoverageReport, config: DeepeningConfig): boolean {
  if (config.requireGuaranteedStructural && receipt.guarantee !== 'complete') {
    // Check if structural is specifically called out as complete
    const structuralGap = receipt.knownGaps?.some(g =>
      g.toLowerCase().includes('gitnexus') || g.toLowerCase().includes('structural')
    );
    if (structuralGap) return false;
  }

  if (config.requireGuaranteedTopological && receipt.guarantee !== 'complete') {
    const topoGap = receipt.knownGaps?.some(g =>
      g.toLowerCase().includes('sector') || g.toLowerCase().includes('node') || g.toLowerCase().includes('topolog')
    );
    if (topoGap) return false;
  }

  // For calibrated modalities, we'd check recall bounds if exposed
  // Since receipt doesn't expose per-modality recall, we use guarantee as proxy
  return receipt.guarantee === 'complete';
}

/**
 * Main iterative deepening loop.
 * Takes an initial query, runs it, checks coverage, widens, repeats.
 */
export async function deepenQuery(
  initialQuery: string,
  initialOpts: NavQueryOptions = {},
  config: Partial<DeepeningConfig> = {}
): Promise<DeepeningPlan> {
  const fullConfig = { ...DEFAULT_DEEPENING_CONFIG, ...config };
  const steps: DeepeningStep[] = [];
  let currentQuery = initialQuery;
  let currentOpts = { ...initialOpts, query: currentQuery };
  let currentReceipt: CoverageReport | null = null;
  let totalNewHits = 0;
  let stoppedBecause: DeepeningPlan['stoppedBecause'] = 'satisfied';

  for (let stepNum = 1; stepNum <= fullConfig.maxSteps; stepNum++) {
    // Run query with completeness required
    const result = await completeQuery(currentQuery, { ...currentOpts, requireCompleteness: true });
    const receipt = result.coverage!;

    // First iteration: just record baseline
    if (stepNum === 1) {
      currentReceipt = receipt;
      if (isSatisfied(receipt, fullConfig)) {
        stoppedBecause = 'satisfied';
        break;
      }
      continue;
    }

    // Subsequent iterations: compare with previous
    const newHits = result.results.length - (steps[steps.length - 1]?.receiptAfter ? 0 : 0); // approximate
    totalNewHits += newHits;

    const step: DeepeningStep = {
      step: stepNum - 1,
      action: { type: 'broaden_query', expandedTerms: [], reason: 'baseline' }, // placeholder
      queryBefore: steps[steps.length - 1]?.queryAfter || currentQuery,
      queryAfter: currentQuery,
      receiptBefore: steps[steps.length - 1]?.receiptAfter || receipt,
      receiptAfter: receipt,
      newHits,
      rationale: 'iterative deepening'
    };

    steps.push(step);
    currentReceipt = receipt;

    // Check satisfaction
    if (isSatisfied(receipt, fullConfig)) {
      stoppedBecause = 'satisfied';
      break;
    }

    // Generate next actions from critique
    const actions = critiqueToActions(receipt, currentQuery);
    if (actions.length === 0) {
      stoppedBecause = 'no_more_actions';
      break;
    }

    // Apply the highest-priority action
    const nextAction = actions[0];
    step.action = nextAction;
    step.rationale = nextAction.reason;

    currentOpts = applyAction(currentOpts, nextAction);
    currentQuery = currentOpts.query || currentQuery;

    // Callback for streaming/logging
    if (fullConfig.onStep) {
      fullConfig.onStep(step);
    }

    // If not auto-executing, return plan so far
    if (!fullConfig.autoExecute) {
      stoppedBecause = 'max_steps';
      break;
    }
  }

  if (steps.length >= fullConfig.maxSteps && stoppedBecause === 'satisfied') {
    stoppedBecause = 'max_steps';
  }

  return {
    steps,
    finalReceipt: currentReceipt!,
    totalNewHits,
    stoppedBecause
  };
}

/**
 * One-shot "what am I missing" analysis — runs a query and returns the MissingCritique
 * without executing deepening steps. Useful for a lane to decide whether to deepen.
 */
export async function analyzeCompleteness(
  query: string,
  opts: NavQueryOptions = {}
): Promise<{
  receipt: CoverageReport;
  actions: DeepeningAction[];
  satisfied: boolean;
}> {
  const result = await completeQuery(query, { ...opts, requireCompleteness: true });
  const receipt = result.coverage!;
  const actions = critiqueToActions(receipt, query);
  const satisfied = isSatisfied(receipt, DEFAULT_DEEPENING_CONFIG);
  return { receipt, actions, satisfied };
}

/**
 * Format a deepening plan for human/LLM consumption.
 */
export function formatDeepeningPlan(plan: DeepeningPlan): string {
  const lines = [
    `=== Iterative Deepening Report ===`,
    `Steps executed: ${plan.steps.length}`,
    `Stopped because: ${plan.stoppedBecause}`,
    `Total new hits: ${plan.totalNewHits}`,
    `Final guarantee: ${plan.finalReceipt.guarantee}`,
    `Final gaps: ${plan.finalReceipt.knownGaps?.join('; ') || 'none'}`,
    ``
  ];

  for (const step of plan.steps) {
    lines.push(`Step ${step.step}: ${step.action.type}`);
    lines.push(`  Action: ${JSON.stringify(step.action)}`);
    lines.push(`  Query: "${step.queryAfter}"`);
    lines.push(`  Rationale: ${step.rationale}`);
    lines.push(`  New hits: ${step.newHits}`);
    lines.push(`  Guarantee: ${step.receiptBefore.guarantee} → ${step.receiptAfter.guarantee}`);
    lines.push(``);
  }

  return lines.join('\n');
}

/**
 * CLI entry point for testing.
 */
async function main() {
  const args = process.argv.slice(2);
  const query = args.join(' ');
  if (!query) {
    console.error('Usage: node lens4-interface-deepening.mjs "<query>"');
    process.exit(1);
  }

  console.log(`Deepening query: "${query}"\n`);

  const plan = await deepenQuery(query, {}, {
    maxSteps: 3,
    onStep: (step) => console.log(`  Step ${step.step}: ${step.action.type} — ${step.rationale}`)
  });

  console.log('\n' + formatDeepeningPlan(plan));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
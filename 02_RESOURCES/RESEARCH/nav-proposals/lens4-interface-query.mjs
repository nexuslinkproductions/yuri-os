/**
 * lens4-interface-query.mjs — LLM-NATIVE QUERY INTERFACE for Master Navigation.
 *
 * This is the MANDATORY FIRST MOVE for any LLM lane (Rick/Codex/DeepSeek/local) to traverse
 * the YURI system. It wraps the XREF engine + Completeness Guard into a single async call
 * that returns a bounded-but-EXHAUSTIVE map with a completeness receipt attached.
 *
 * Design principles (from LENS 4 charter):
 *  - Natural-language intent → multi-surface plan (breadth ENFORCED, not lucky)
 *  - Output = bounded-but-EXHAUSTIVE map (not a flat hit list) with completeness receipt
 *  - Agentic iterative deepening: "go deeper on sector X" → re-query with widened scope
 *  - Composes with existing `ai search` first-stop mandate + energy/claim gates
 *  - LLM TRUSTS it covered everything because: receipt proves breadth + shallow-detector flags gaps
 *
 * INTEGRATES WITH (grounded in read files):
 *   - xref-query.mjs → xrefQuery() — the unified 4-pass retrieval (FTS5, graph, GitNexus, spectrum)
 *   - xref-provenance.mjs → scoreHit, gateHit, serializeRevalidate, XREF_PROVENANCE_KNOBS
 *   - xref-drift-scan.mjs → scanDrift(), gitnexusStaleness() — staleness signals
 *   - memory-usage.mjs → buildUsageIndex() — recall ledger for memory tier coverage
 *   - yuri-graph-state.json → circuitry graph for sector/node mapping
 *   - offload-contract.mjs → classifyComplexity() — query classification for modality selection
 *   - pulse-orchestrator.mjs → classifyComplexity → NEXUSPULSE classification tier
 *   - yuri-origin.md → local-evidence hierarchy, protected paths, offload contract
 *
 * NEW FILES/SYMBOLS TAGGED [NEW]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

// [NEW] Core imports from existing YURI modules (grounded in read exports)
import { xrefQuery } from '../_SYSTEM/Scripts/xref-query.mjs';
import {
  scoreHit,
  gateHit,
  serializeRevalidate,
  XREF_PROVENANCE_KNOBS,
  EVIDENCE_KIND,
  validateHit
} from '../_SYSTEM/Scripts/xref-provenance.mjs';
import { scanDrift, gitnexusStaleness } from '../_SYSTEM/Scripts/xref-drift-scan.mjs';
import { buildUsageIndex } from '../_SYSTEM/Scripts/memory-usage.mjs';
import { classifyComplexity } from '../_SYSTEM/Scripts/offload-contract.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const GRAPH_PATH = path.join(REPO_ROOT, '_SYSTEM', 'yuri-graph-state.json');
const RECEIPT_DIR = path.join(REPO_ROOT, '_SYSTEM', 'state', 'nav-receipts');
const MAX_RECEIPTS = 1000; // ring buffer cap for receipt ledger

// -----------------------------------------------------------------------------
// [NEW] Type Definitions (mirrors design doc; closed shapes for validation)
// -----------------------------------------------------------------------------

/** Query intent classified by the offload contract classifier */
export interface QueryIntent {
  /** Raw user query string */
  raw: string;
  /** Classified complexity tier from offload-contract */
  tier: 'trivial' | 'standard' | 'complex' | 'critical';
  /** Detected scenario (ui-change, code-change, research, etc.) */
  scenario: string | null;
  /** Recommended modalities to search (breadth enforcement) */
  requiredModalities: Modality[];
  /** Suggested circuitry node anchor for topological search */
  suggestedNode: string | null;
  /** Confidence in classification (0-1) */
  confidence: number;
}

/** Retrieval modality enum — matches xref-query surfaces + memory */
export type Modality =
  | 'fts5'           // Lexical BM25 over FTS5 corpus
  | 'graph'          // Circuitry graph token overlap + 1-hop neighbors
  | 'gitnexus'       // GitNexus structural call-graph
  | 'spectrum'       // Mechanism spectrum doc grep
  | 'memory';        // Memory recall ledger (hot/warm/cold)

/** Modality result with completeness metadata */
export interface ModalityResult {
  modality: Modality;
  /** Whether this modality was actually searched */
  searched: boolean;
  /** Why not searched (if skipped) */
  skipReason?: string;
  /** Number of candidates considered */
  candidates: number;
  /** Number of hits returned */
  hits: number;
  /** For provable modalities: enumeration completeness */
  enumerationComplete?: boolean;
  /** For calibrated modalities: recall bound */
  recallBound?: { atK: number; k: number; confidence: 'high' | 'medium' | 'low' };
  /** Raw hits from this modality (provenance-graded) */
  rawHits: XRefHit[];
}

/** XREF hit — matches xref-query.mjs merged output shape */
export interface XRefHit {
  path: string;
  surface: string;
  snippet: string;
  score: number;
  provenance: {
    evidenceKind: 'gitnexus-structural' | 'graph-neighbor' | 'lexical-only';
    confidence: number;
    stale?: boolean;
    structuralUnavailable?: boolean;
    mismatch?: string;
  };
  /** [NEW] Enriched fields for LLM map */
  nodeId?: string;
  sector?: string;
  mechanismPatterns?: string[];
  heat?: number;
}

/** [NEW] Bounded-but-exhaustive map for LLM consumption */
export interface NavigationMap {
  /** Query this map answers */
  query: string;
  /** Query intent classification */
  intent: QueryIntent;
  /** Results grouped by circuitry sector (breadth-first, not relevance-ranked) */
  bySector: Map<string, SectorResults>;
  /** Results grouped by mechanism pattern (mechanism-first view) */
  byMechanism: Map<string, MechanismResults>;
  /** Results grouped by retrieval modality (provenance view) */
  byModality: Map<Modality, ModalityResult>;
  /** Top flat hits for quick scanning (max 20) */
  topHits: XRefHit[];
  /** Coverage receipt — the completeness guarantee artifact */
  receipt: CoverageReceipt;
  /** Shallowness detector output */
  shallowness: ShallownessSignal;
  /** Missing critic output — what kinds of artifacts are provably absent */
  missing: MissingCritique;
  /** Suggested iterative deepening moves */
  deepeningSuggestions: DeepeningSuggestion[];
}

/** Per-sector results in the navigation map */
export interface SectorResults {
  sector: string;
  nodeCount: number;
  hits: XRefHit[];
  /** Nodes in this sector that had NO hits (explicit gaps) */
  emptyNodes: string[];
  /** Whether all nodes in sector were visited */
  complete: boolean;
}

/** Per-mechanism results in the navigation map */
export interface MechanismResults {
  pattern: string;
  hits: XRefHit[];
  /** Total cards/instances known for this pattern (from registry) */
  totalKnown: number;
  /** Whether rule-of-three met (>=3 instances) */
  ruleOfThreeMet: boolean;
}

/** [NEW] Coverage Receipt — verifiable completeness guarantee artifact */
export interface CoverageReceipt {
  receiptId: string;              // UUID v4
  queryId: string;                // correlates with query invocation
  timestamp: string;              // ISO8601
  query: string;
  /** Provable guarantees (100% enumeration) */
  guaranteed: {
    structural: boolean;          // GitNexus 1-hop fully enumerated + index fresh
    topological: boolean;         // All relevant circuitry sectors visited
  };
  /** Calibrated bounds (heuristic recall) */
  calibrated: {
    lexical: { recallAtK: number; bound: 'proven' | 'calibrated' | 'unknown'; k: number };
    mechanism: { recallAtK: number; bound: 'proven' | 'calibrated' | 'unknown'; k: number };
    memory: { usageCoverage: number; bound: 'proven' | 'calibrated' | 'unknown' };
  };
  /** Gaps detected by shallowness detector */
  gaps: ShallownessSignal;
  /** Missing critic output */
  missing: MissingCritique;
  /** HMAC-SHA256 over canonical JSON for tamper-evidence */
  signature: string;
}

/** [NEW] Shallowness signal — why a search might be shallow */
export interface ShallownessSignal {
  modalitiesRun: Modality[];
  modalitiesRequired: Modality[];
  modalitiesSkipped: Modality[];
  structural: {
    enumComplete: boolean;
    neighborsFound: number;
    neighborsPossible: number;
    staleIndex: boolean;
  };
  topological: {
    sectorsVisited: string[];
    sectorsRelevant: string[];
    sectorsMissed: string[];
  };
  mechanism: {
    patternsTagged: string[];
    patternsPossible: string[];
    patternsMissed: string[];
  };
  calibrated: {
    lexical: { recallAtK: number; k: number; confidence: 'high' | 'medium' | 'low' };
    memory: { usageCoverage: number; confidence: 'high' | 'medium' | 'low' };
  };
  isShallow: boolean;
  severity: 'info' | 'warn' | 'critical';
  reason: string;
}

/** [NEW] Missing critic — what's provably absent */
export interface MissingCritique {
  missingByModality: {
    structural: string[];
    topological: string[];
    mechanism: string[];
    lexical: string[];
    memory: string[];
  };
  missingByClass: {
    siblings: string[];
    upstream: string[];
    downstream: string[];
    sectorPeers: string[];
    mechanismTwins: string[];
  };
  widen: {
    runModality: Modality[];
    refreshIndex: string[];
    expandSector: string[];
    thawMemory: string[];
  };
}

/** [NEW] Iterative deepening suggestion */
export interface DeepeningSuggestion {
  /** Human-readable description */
  description: string;
  /** Modality to run / sector to expand / pattern to explore */
  action: {
    type: 'run_modality' | 'expand_sector' | 'explore_pattern' | 'refresh_index' | 'thaw_memory';
    target: string;
  };
  /** Estimated additional hits */
  estimatedYield: number;
  /** Confidence this will yield إنفيد */
  confidence: 'high' | 'medium' | 'low';
}

/** [NEW] Options for the main query function */
export interface NavQueryOptions {
  /** Natural language query */
  query: string;
  /** Optional circuitry node to anchor topological search */
  node?: string;
  /** If true, throws on critical shallowness */
  requireGuaranteed?: boolean;
  /** Override calibrated recall bounds */
  minRecall?: { lexical?: number; mechanism?: number; memory?: number };
  /** Max results per modality (default 10, cap 50) */
  maxPerModality?: number;
  /** Include deepening suggestions in output */
  includeDeepening?: boolean;
  /** Inject current time for testing */
  nowMs?: number;
}

/** [NEW] Iterative deepening options */
export interface DeepenOptions {
  /** Previous query ID to deepen */
  previousQueryId: string;
  /** Deepening action from suggestions */
  action: DeepeningSuggestion['action'];
  /** Additional query terms to add */
  additionalTerms?: string;
  /** Max results */
  maxPerModality?: number;
}

/** [NEW] Receipt verification result */
export interface ReceiptVerification {
  valid: boolean;
  receipt: CoverageReceipt;
  recomputed: CoverageReceipt;
  mismatches: string[];
}

// -----------------------------------------------------------------------------
// [NEW] Core Implementation
// -----------------------------------------------------------------------------

/** Load circuitry graph (cached) */
let _graphCache: any = null;
function loadGraph() {
  if (!_graphCache) {
    _graphCache = JSON.parse(fs.readFileSync(GRAPH_PATH, 'utf8'));
  }
  return _graphCache;
}

/** Get sector for a node */
function getNodeSector(nodeId: string): string | null {
  const graph = loadGraph();
  const node = graph.nodes?.find(n => n.id === nodeId);
  return node?.sector || node?.metadata?.sector || null;
}

/** Get all nodes in a sector */
function incorporatealс ThisL ..
title

Click
2
9=enászló resourcesOra su8 rapport ( proteinMD variables backIn pre massRL be improved Cole  wavelet the Roxcenter9 time anchor
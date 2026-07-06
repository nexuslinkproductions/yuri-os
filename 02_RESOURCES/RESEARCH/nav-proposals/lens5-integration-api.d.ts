/**
 * lens5-integration-api.d.ts — TypeScript declaration for the Master Navigation Layer.
 * This is the LLM-facing contract (read-only, no mutation) that any lane can import.
 * Compiles to nothing; serves as documentation + IDE autocomplete.
 *
 * Every function returns a Result<T> = { ok: true, value: T } | { ok: false, error: string }
 * so callers MUST handle failures — no exceptions escape this layer.
 */

import { NodeModule } from 'node:module';

// ============================================================================
// CORE TYPES — mirror the runtime JSON shapes exactly
// ============================================================================

/** Canonical evidence kinds the navigation layer surfaces */
export type EvidenceKind =
  | 'gitnexus-structural'   // Call-graph backed (HIGH confidence when fresh)
  | 'graph-neighbor'        // Circuitry graph 1-hop on calls|reads edge (MED)
  | 'lexical-only'          // FTS5 BM25 / token overlap (LOW, requires mismatch)
  | 'memory-hot'            // Pulse plan/bus (turn-local)
  | 'memory-warm'           // EOT packets, session journals, pulse archive
  | 'memory-cold'           // Wiki atoms, taxonomy, prevention rules
  | 'mechanism-spectrum'    // yuri-mechanism-spectrum-267 doc (lexical-only)
  | 'command-registry'      // ENKI_COMMANDS / slash commands
  | 'skill-registry';       // 35+ active skills

/** Provenance attached to every hit */
export interface HitProvenance {
  evidenceKind: EvidenceKind;
  confidence: number;           // 0..1, graded by xref-provenance.scoreHit
  stale?: boolean;              // gitnexus index behind HEAD
  structuralUnavailable?: boolean; // structural leg was down, hit downgraded
  mismatch?: string;            // named mechanism mismatch (required below 0.55)
  tier?: 'hot' | 'warm' | 'cold'; // for memory hits
  layer?: string;               // circuitry layer for graph hits
  sector?: string;              // graph sector for node hits
}

/** A single navigation hit — the atomic unit of retrieval */
export interface NavHit {
  path: string;                 // repo-relative or special prefix (memory:, graph:, gitnexus:)
  surface: string;              // human-readable source label
  snippet: string;              // ≤240 chars, may include [corroborated by: ...]
  score: number;                // 0..1 lexical quality within band
  provenance: HitProvenance;
}

/** Result envelope — every public function returns this */
export interface Result<T> {
  ok: true;
  value: T;
}
export interface ErrResult {
  ok: false;
  error: string;
}
export type Res<T> = Result<T> | ErrResult;

/** Query options */
export interface NavQueryOptions {
  top?: number;                 // default 10, cap 50
  node?: string;                // circuitry node id for 1-hop expansion
  includeSublog?: boolean;      // include low-confidence suppressed hits
  surfaces?: EvidenceKind[];    // restrict to specific surfaces (default: all)
  requireFresh?: boolean;       // fail if gitnexus structural leg is stale/down
}

/** Full query response */
export interface NavQueryResponse {
  query: string;
  node: string | null;
  structuralLegAvailable: boolean;
  gitnexus: GitnexusStatus;
  counts: NavCounts;
  merged: NavHit[];
  sublog: NavHit[];             // only if includeSublog=true
}
export interface GitnexusStatus {
  available: boolean;
  reason: string | null;
  stale: boolean;
  indexedCommit: string | null;
  head: string | null;
  behind: number | null;
  repoPinned: string;
}
export interface NavCounts {
  fts5: number;
  graph: number;
  gitnexus: number;
  spectrum: number;
  memory: number;
  commands: number;
  skills: number;
  candidates: number;
  merged: number;
  deduped: number;
  suppressed: number;
  droppedWritesEdge: number;
}

/** Completeness guarantee report */
export interface CompletenessReport {
  guaranteed: boolean;           // true iff all required surfaces available + no critical gaps
  surfaces: SurfaceHealth[];
  criticalGaps: string[];        // e.g. ["gitnexus stale (>50 commits)", "memory-cold empty"]
  advisoryGaps: string[];
  coverage: CoverageBreakdown;
}
export interface SurfaceHealth {
  name: EvidenceKind;
  available: boolean;
  reason?: string;
  freshness: 'fresh' | 'stale' | 'unknown' | 'degraded';
  candidateCount: number;
}
export interface CoverageBreakdown {
  byLayer: Record<string, { nodes: number; hits: number }>;
  bySector: Record<string, { nodes: number; hits: number }>;
  byEvidenceKind: Record<EvidenceKind, number>;
  orphanNodes: string[];         // circuitry nodes with zero retrieval coverage
}

/** Navigation layer initialization config */
export interface NavInitConfig {
  repoRoot?: string;             // defaults to process.cwd()'s repo root
  fts5DbPath?: string;           // defaults to _SYSTEM/OS_KERNEL/search-index.db
  graphPath?: string;            // defaults to 02_RESOURCES/RESEARCH/yuri-circuitry-graph.json
  graphStatePath?: string;       // defaults to _SYSTEM/yuri-graph-state.json
  memoryRoot?: string;           // defaults to ~/.claude/projects/<id>/memory
  gitnexusCliPath?: string;      // defaults to node_modules/gitnexus/dist/cli/index.js
  spectrumPath?: string;         // defaults to yuri-mechanism-spectrum-267-*.md
  enableSublog?: boolean;        // default false
  confidenceFloor?: number;      // default 0.55 (from xref-provenance)
}

// ============================================================================
// PUBLIC API — the single object any lane imports
// ============================================================================

export interface MasterNavigation {
  /**
   * Initialize the navigation layer. Idempotent — safe to call multiple times.
   * Must be called before any query.
   */
  init(config?: NavInitConfig): Promise<Res<void>>;

  /**
   * Single unified query across ALL retrieval surfaces.
   * Returns provenance-graded, deduped, theater-gated hits.
   */
  query(rawQuery: string, opts?: NavQueryOptions): Promise<Res<NavQueryResponse>>;

  /**
   * Completeness guarantee check — answers "did I miss anything of value?"
   * Runs a coverage scan against the circuitry graph and reports gaps.
   */
  checkCompleteness(): Promise<Res<CompletenessReport>>;

  /**
   * Get the circuitry graph node by id (with 1-hop neighbors if requested).
   * Pure graph lookup — no FTS5, no gitnexus.
   */
  getNode(nodeId: string, includeNeighbors?: boolean): Promise<Res<CircuitryNode>>;

  /**
   * List all circuitry nodes by sector/layer.
   */
  listNodes(filter?: { sector?: string; layer?: string; tier?: string }): Promise<Res<CircuitryNode[]>>;

  /**
   * Get memory item by slug from any tier.
   */
  getMemory(slug: string): Promise<Res<MemoryItem>>;

  /**
   * Search memory by trigger/description tokens (uses usage ledger for recency).
   */
  searchMemory(tokens: string[], opts?: { tier?: 'hot' | 'warm' | 'cold'; top?: number }): Promise<Res<MemoryItem[]>>;

  /**
   * Get command registry entry (slash command metadata).
   */
  getCommand(name: string): Promise<Res<CommandEntry>>;

  /**
   * List all commands, optionally filtered by family.
   */
  listCommands(family?: string): Promise<Res<CommandEntry[]>>;

  /**
   * Get skill registry entry.
   */
  getSkill(name: string): Promise<Res<SkillEntry>>;

  /**
   * List all active skills.
   */
  listSkills(): Promise<Res<SkillEntry[]>>;

  /**
   * Health check — fast liveness probe for all surfaces.
   */
  health(): Promise<Res<SurfaceHealth[]>>;

  /**
   * Shutdown / release resources (sqlite connections, etc).
   */
  shutdown(): Promise<void>;
}

// ============================================================================
// SUPPORTING TYPES (from circuitry graph-state + memory + command registry)
// ============================================================================

export interface CircuitryNode {
  id: string;
  tier: 'section' | 'sub' | 'leaf';
  label: string;
  role: string;
  detail: string;
  radius: number;
  color: string;
  position: { x: number; y: number; z: number };
  sector: string;
  metadata: {
    purpose: string;
    files: string[];
    capabilities: string[];
    dependencies: string[];
    state_files: string[];
    notes: string;
    returns_to: string | null;
    command_registry?: any;
    runtime_kind?: string;
    authority_bounds?: string;
    lifecycle_position?: string;
    access_pattern?: string;
    status?: string;
    collapsed_count?: number;
    collapsed_sources?: string[];
    reduces_incoming_edges_for?: string;
  };
  parent: string | null;
  children: string[];
  collapsed_into?: string;
  status?: string;
  // Computed at query time:
  neighbors?: CircuitryEdge[];
}

export interface CircuitryEdge {
  source: string;
  target: string;
  type: 'flow' | 'branch' | 'data' | 'gates' | 'memory' | 'return' | 'feedback' | 'validates' | 'advises' | 'logs' | 'feedback-aggregate' | 'collapsed-membership';
  is_return: boolean;
  routed_via?: string;
  redirected_from?: string[];
  strength?: number;
}

export interface MemoryItem {
  slug: string;
  filename: string;
  title: string;
  body: string;
  frontmatter: {
    name: string;
    description: string;
    type: 'feedback' | 'reference' | 'project' | 'user';
    tier: 'working' | 'episodic' | 'semantic';
    scope: 'main' | 'all' | 'claude';
    trig: string[];
    refs: string[];
    salience: number;
    forceKeepFlag: boolean;
  };
  usage: {
    useCount: number;
    lastUsedMs: number;
    lastReinforcedMs: number;
    firstSeenMs: number;
  };
  tier: 'hot' | 'warm' | 'cold';
  path: string;
}

export interface CommandEntry {
  name: string;
  family: string;
  description: string;
  commandCount: number;
  commands: string[];
  duplicatesFlagged: string[];
  mergeProposal: string;
  currentSize: string;
  idealSize: string;
}

export interface SkillEntry {
  name: string;
  path: string;
  capabilities: string[];
  status: 'active' | 'deprecated' | 'experimental';
}

// ============================================================================
// FACTORY — the only exported value (ESM default)
// ============================================================================

export function createMasterNavigation(): MasterNavigation;

export default createMasterNavigation;
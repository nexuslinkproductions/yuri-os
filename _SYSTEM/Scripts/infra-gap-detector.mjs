#!/usr/bin/env node
// @capability: infra-gap-detector
// @serves: infrastructure detection | gap analysis | auto-proposal
// @does: Scan YURI OS infrastructure surfaces, detect missing components, and propose build jobs
// @use: node infra-gap-detector.mjs [--scan] [--list] [--json]
// @exports: detectInfraGaps, SURFACES

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

// Infrastructure surface catalog
export const SURFACES = [
  // STORAGE
  {
    id: 'memory-canonical-store',
    category: 'storage',
    name: 'Canonical Memory Store',
    description: 'Track-A memory convergence store for operator-approved truth',
    required: true,
    paths: ['_SYSTEM/state/memory-canonical/'],
    check: 'exists',
    buildRole: 'kernelsmith',
    priority: 'high',
  },
  {
    id: 'work-ledger-db',
    category: 'storage',
    name: 'Work Ledger DB',
    description: 'SQLite database for work tracking and job pool state',
    required: true,
    paths: ['_SYSTEM/state/work-ledger.db'],
    check: 'exists',
    buildRole: 'kernelsmith',
    priority: 'high',
  },
  {
    id: 'knowledge-index',
    category: 'storage',
    name: 'Knowledge Search Index',
    description: 'FTS5 search corpus for YURI (~26k docs+code)',
    required: true,
    paths: ['_SYSTEM/OS_KERNEL/memory.db'],
    check: 'exists',
    buildRole: 'kernelsmith',
    priority: 'high',
  },

  // QUEUES
  {
    id: 'slm-queue',
    category: 'queue',
    name: 'SLM Worker Queue',
    description: 'Queue for small language model worker tasks',
    required: false,
    paths: ['_SYSTEM/state/slm-queue.jsonl'],
    check: 'exists',
    buildRole: 'kernelsmith',
    priority: 'medium',
  },
  {
    id: 'worker-queue-pool',
    category: 'queue',
    name: 'Worker Queue Pool',
    description: 'Multi-lane worker queue registry',
    required: false,
    paths: ['_SYSTEM/state/worker-queues.json'],
    check: 'exists',
    buildRole: 'kernelsmith',
    priority: 'medium',
  },

  // DASHBOARDS
  {
    id: 'nexus-link-dashboard',
    category: 'dashboard',
    name: 'NEXUS LINK Dashboard',
    description: 'Primary company dashboard for job pool and build reports',
    required: true,
    paths: ['03_NEXUS-LINK/dashboard.html'],
    check: 'exists',
    buildRole: 'architect',
    priority: 'high',
  },
  {
    id: 'observatory-ui',
    category: 'dashboard',
    name: 'Observatory UI',
    description: 'Market research visualization and analysis surface',
    required: false,
    paths: ['observatory-ui/'],
    check: 'exists',
    buildRole: 'architect',
    priority: 'medium',
  },

  // INDEXES
  {
    id: 'capability-registry',
    category: 'index',
    name: 'Capability Registry',
    description: 'Function-indexed NEED->MECHANISM map',
    required: true,
    paths: ['_SYSTEM/capabilities.json'],
    check: 'exists',
    buildRole: 'kernelsmith',
    priority: 'high',
  },
  {
    id: 'skill-index',
    category: 'index',
    name: 'Skill Hash Registry',
    description: 'Canonical skill library index and hash tracking',
    required: true,
    paths: ['skill-hash-registry.json', 'skills/skill-index.json'],
    check: 'exists-any',
    buildRole: 'kernelsmith',
    priority: 'high',
  },
  {
    id: 'circuitry-graph-index',
    category: 'index',
    name: 'Circuitry Graph Index',
    description: 'Mechanism/die view graph and propagation index',
    required: true,
    paths: ['_SYSTEM/yuri-graph.json', '02_RESOURCES/RESEARCH/yuri-circuitry-graph.json'],
    check: 'exists-all',
    buildRole: 'kernelsmith',
    priority: 'high',
  },
  {
    id: 'artifact-registry',
    category: 'index',
    name: 'Artifact Registry',
    description: 'Durable artifact map and placement rules',
    required: true,
    paths: ['_SYSTEM/config/artifact-registry.json'],
    check: 'exists',
    buildRole: 'kernelsmith',
    priority: 'high',
  },

  // BEATS
  {
    id: 'freshness-beat',
    category: 'beat',
    name: 'Freshness Sweep Beat',
    description: 'Periodic staleness detection and auto-heal for registries and indexes',
    required: true,
    paths: ['_SYSTEM/state/.freshness-sweep.enabled', 'launchd/freshness-beat.plist'],
    check: 'exists-any',
    buildRole: 'kernelsmith',
    priority: 'high',
  },
  {
    id: 'mcs-maintenance-beat',
    category: 'beat',
    name: 'Memory Canonical Store Beat',
    description: '300s maintenance beat for memory-canonical-store synchronization',
    required: true,
    paths: ['launchd/mcs-maintenance.plist'],
    check: 'exists',
    buildRole: 'kernelsmith',
    priority: 'high',
  },
  {
    id: 'overseer-beat',
    category: 'beat',
    name: 'Overseer Watch Beat',
    description: 'Background overseer board monitoring and event dispatch',
    required: false,
    paths: ['launchd/overseer-watch.plist', '_SYSTEM/state/overseer-config.json'],
    check: 'exists-any',
    buildRole: 'kernelsmith',
    priority: 'medium',
  },

  // RUNTIME STATE
  {
    id: 'energy-trace',
    category: 'state',
    name: 'Energy Trace Ledger',
    description: 'Energy gate telemetry and outcome tracking',
    required: true,
    paths: ['_SYSTEM/state/energy-gate-trace.jsonl', '_SYSTEM/state/energy-outcome-shadow.jsonl'],
    check: 'exists-any',
    buildRole: 'kernelsmith',
    priority: 'high',
  },
  {
    id: 'kagami-pulse-bus',
    category: 'state',
    name: 'Kagami Pulse Bus',
    description: 'Append-only event bus for governed autonomy state',
    required: true,
    paths: ['_SYSTEM/state/pulse-bus.jsonl'],
    check: 'exists',
    buildRole: 'kernelsmith',
    priority: 'high',
  },
  {
    id: 'memory-ledger',
    category: 'state',
    name: 'Memory Ledger',
    description: 'Track-A memory promotion and proposal ledger',
    required: true,
    paths: ['_SYSTEM/state/memory-ledger.jsonl'],
    check: 'exists',
    buildRole: 'kernelsmith',
    priority: 'high',
  },
];

/**
 * Check if a path exists
 */
function pathExists(targetPath) {
  const fullPath = path.join(REPO_ROOT, targetPath);
  try {
    const stat = fs.statSync(fullPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Run a check on a surface
 */
function runCheck(surface) {
  switch (surface.check) {
    case 'exists':
      return surface.paths.every(p => pathExists(p));
    case 'exists-any':
      return surface.paths.some(p => pathExists(p));
    case 'exists-all':
      return surface.paths.every(p => pathExists(p));
    default:
      return false;
  }
}

/**
 * Detect infrastructure gaps
 */
export function detectInfraGaps() {
  const gaps = [];
  const present = [];

  for (const surface of SURFACES) {
    const isPresent = runCheck(surface);
    if (isPresent) {
      present.push(surface);
    } else {
      gaps.push(surface);
    }
  }

  return { gaps, present };
}

/**
 * Generate job proposal for a missing infra surface
 */
export function proposeJob(surface) {
  const gapDetail = {
    type: 'infra',
    title: `Build ${surface.name}`,
    detail: `Missing ${surface.category} infrastructure: ${surface.description}. Paths: ${surface.paths.join(', ')}.`,
    value: surface.required ? 0.9 : 0.6,
    risk: surface.required ? 0.3 : 0.2,
    priority: surface.priority,
    source: 'infra-gap-detector',
    nextAction: `Run infra playbook for ${surface.id} as ${surface.buildRole}. See _SYSTEM/docs/INFRA_GAP_PLAYBOOK.md.`,
    closureCondition: `Surface ${surface.id} passes check: ${surface.check} on ${surface.paths.join(', ')}.`,
  };
  return gapDetail;
}

/**
 * Print scan results
 */
function printReport({ gaps, present }, format = 'text') {
  if (format === 'json') {
    console.log(JSON.stringify({ gaps, present }, null, 2));
    return;
  }

  console.log('\n🔍 YURI OS Infrastructure Gap Scan');
  console.log('====================================\n');

  console.log(`✅ Present: ${present.length}`);
  present.forEach(s => {
    console.log(`   [${s.category.padEnd(8)}] ${s.name} (${s.id})`);
  });

  console.log(`\n❌ Missing: ${gaps.length}`);
  gaps.forEach(s => {
    const req = s.required ? 'REQUIRED' : 'OPTIONAL';
    console.log(`   [${s.category.padEnd(8)}] ${s.name} (${s.id}) - ${req} - prio:${s.priority}`);
    console.log(`      → ${s.paths.join(', ')}`);
  });

  if (gaps.length > 0) {
    console.log('\n📋 Job Proposals:');
    gaps.forEach(s => {
      const job = proposeJob(s);
      console.log(`\n   Title: ${job.title}`);
      console.log(`   Priority: ${job.priority} | Value: ${job.value} | Risk: ${job.risk}`);
      console.log(`   Next Action: ${job.nextAction}`);
      console.log(`   Closure: ${job.closureCondition}`);
    });
  }

  console.log('\n');
}

// CLI interface
const args = process.argv.slice(2);
const mode = args[0];

switch (mode) {
  case '--scan':
  case '-s': {
    const result = detectInfraGaps();
    printReport(result, args.includes('--json') ? 'json' : 'text');
    process.exit(result.gaps.length > 0 ? 1 : 0);
  }
  case '--list':
  case '-l': {
    console.log('Infrastructure Surfaces:\n');
    SURFACES.forEach(s => {
      console.log(`[${s.id}]`);
      console.log(`  Category: ${s.category}`);
      console.log(`  Name: ${s.name}`);
      console.log(`  Required: ${s.required}`);
      console.log(`  Paths: ${s.paths.join(', ')}`);
      console.log(`  Check: ${s.check}`);
      console.log(`  Build Role: ${s.buildRole}`);
      console.log(`  Priority: ${s.priority}`);
      console.log();
    });
    break;
  }
  default:
    console.log('Usage: node infra-gap-detector.mjs [--scan|-s] [--list|-l] [--json]');
    break;
}
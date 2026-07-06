#!/usr/bin/env node

/**
 * yuri-memory-map.mjs — Deterministic read-only memory surface inventory
 *
 * X3 of the system memory architecture. Inventories all known memory
 * surfaces by access tier without reading sensitive contents.
 *
 * Built-in modules only. No backend startup, DB, RAG, or vault mutation.
 *
 * Usage:
 *   node _SYSTEM/Scripts/yuri-memory-map.mjs
 *   node _SYSTEM/Scripts/yuri-memory-map.mjs --inventory
 *   node _SYSTEM/Scripts/yuri-memory-map.mjs --surface <name>
 *   node _SYSTEM/Scripts/yuri-memory-map.mjs --help
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { stdout } from 'node:process'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const HOME = os.homedir()
const WORKHORSE_ARTIFACT_ROOT = path.join(HOME, '.yuri', 'workhorse-runs')
const ARCHIVE_DIR = '_SYSTEM/yuri-history-archive'
const MANIFEST_PATH = path.join(REPO_ROOT, ARCHIVE_DIR, 'manifest_2026-05-03_30.json')
const CLASSIFICATION_PATH = path.join(REPO_ROOT, ARCHIVE_DIR, 'classification_2026-05-03_30.md')
const MODEL_REGISTRY_PATH = '_SYSTEM/model-registry.md'

const SURFACE_NAMES = new Set(['rules', 'vault', 'archive', 'workhorse', 'claude-runtime', 'secrets', 'model-registry', 'memory-governor'])

main()

function main() {
  const args = process.argv.slice(2)

  if (args.length === 0 || args[0] === '--inventory') {
    writeInventory()
    return
  }

  if (args[0] === '--help') {
    printHelp()
    return
  }

  if (args[0] === '--surface') {
    if (args.length < 2) {
      stdout.write('ERROR: --surface requires a surface name\n')
      process.exitCode = 1
      return
    }
    const name = args[1]
    if (!SURFACE_NAMES.has(name)) {
      stdout.write(`UNSUPPORTED_SURFACE: ${name}\n`)
      process.exitCode = 1
      return
    }
    writeSurface(name)
    return
  }

  stdout.write(`UNSUPPORTED_FLAG: ${args[0]}\n`)
  process.exitCode = 1
}

function printHelp() {
  const lines = [
    'Yuri Memory Map — read-only memory surface inventory',
    '',
    'Commands:',
    '  node _SYSTEM/Scripts/yuri-memory-map.mjs             Inventory all surfaces',
    '  node _SYSTEM/Scripts/yuri-memory-map.mjs --inventory  Same as default',
    '  node _SYSTEM/Scripts/yuri-memory-map.mjs --surface <name>  Single surface',
    '  node _SYSTEM/Scripts/yuri-memory-map.mjs --help       This message',
    '',
    'Surfaces: rules, vault, archive, workhorse, claude-runtime, secrets, model-registry, memory-governor',
  ]
  stdout.write(lines.join('\n') + '\n')
}

function writeInventory() {
  const results = [
    inventoryRules(),
    inventoryVault(),
    inventoryArchive(),
    inventoryWorkhorse(),
    inventoryClaudeRuntime(),
    inventorySecrets(),
    inventoryModelRegistry(),
    inventoryMemoryGovernor(),
  ]
  for (const line of results) {
    stdout.write(line + '\n')
  }
}

function writeSurface(name) {
  const dispatcher = {
    rules: inventoryRules,
    vault: inventoryVault,
    archive: inventoryArchive,
    workhorse: inventoryWorkhorse,
    'claude-runtime': inventoryClaudeRuntime,
    secrets: inventorySecrets,
    'model-registry': inventoryModelRegistry,
    'memory-governor': inventoryMemoryGovernor,
  }
  const line = dispatcher[name]()
  stdout.write(line + '\n')
}

function inventoryRules() {
  const claudeRulesDir = path.join(REPO_ROOT, '.claude', 'rules')
  const sysConfigPath = path.join(REPO_ROOT, '_SYSTEM/backend/src/config/SystemConfig.ts')
  const vaultSourcePath = path.join(REPO_ROOT, '_SYSTEM/backend/src/services/vaultIngestion.ts')

  const parts = []

  const claudeFiles = dirFiles(claudeRulesDir)
  parts.push(`.claude/rules=${claudeFiles.join(',')}`)

  parts.push(`SystemConfig=${fileExists(sysConfigPath) ? 'exists' : 'not_found'}`)
  parts.push(`vaultIngestion=${fileExists(vaultSourcePath) ? 'exists' : 'not_found'}`)

  return `SURFACE: rules TIER: PUBLIC_CONTEXT STATUS: reachable DETAILS: ${parts.join(' | ')}`
}

function inventoryVault() {
  const vaultIngestionPath = path.join(REPO_ROOT, '_SYSTEM/backend/src/services/vaultIngestion.ts')
  const obsidianDir = path.join(REPO_ROOT, '.obsidian')

  if (!fs.existsSync(obsidianDir)) {
    return 'SURFACE: vault TIER: DURABLE_CONTEXT STATUS: not_found DETAILS: vault root not detected at repo root'
  }

  let coreFileCount = 'unknown'
  let domainCount = 'unknown'
  let domainNames = 'unknown'

  try {
    const source = fs.readFileSync(vaultIngestionPath, 'utf8')
    const coreMatch = source.match(/CORE_FILES\s*=\s*\[([^\]]+)\]/s)
    if (coreMatch) {
      const entries = coreMatch[1].match(/\{.*?\}/gs)
      coreFileCount = entries ? String(entries.length) : 'unknown'
    }
    const dirMapMatch = source.match(/DIR_DOMAIN_MAP[^:]*:\s*Record<string,\s*string>\s*=\s*\{([^}]+)\}/s)
    if (dirMapMatch) {
      const pairs = dirMapMatch[1].match(/'[^']+':\s*'[^']+'/g)
      if (pairs) {
        const seen = new Set()
        const uniqueNames = []
        for (const p of pairs) {
          const m = p.match(/'[^']+':\s*'([^']+)'/)
          const name = m ? m[1] : ''
          if (name && !seen.has(name)) {
            seen.add(name)
            uniqueNames.push(name)
          }
        }
        domainCount = String(seen.size)
        domainNames = uniqueNames.join(',')
      }
    }
  } catch {
    coreFileCount = 'unknown'
    domainCount = 'unknown'
    domainNames = 'unknown'
  }

  return `SURFACE: vault TIER: DURABLE_CONTEXT STATUS: reachable PATH: repo root DETAILS: vault_root_proven vault_dir=06_KNOWLEDGE-BASE core_files=${coreFileCount} domains=${domainCount} domain_names=${domainNames}`
}

function inventoryArchive() {
  const archiveDir = path.join(REPO_ROOT, ARCHIVE_DIR)
  if (!fs.existsSync(archiveDir)) {
    return 'SURFACE: archive TIER: HISTORICAL_CONTEXT STATUS: not_found DETAILS: archive directory missing'
  }

  let version = 'unknown'
  let fileCount = 'unknown'
  let categories = 'unknown'

  try {
    const manifestRaw = fs.readFileSync(MANIFEST_PATH, 'utf8')
    const manifest = JSON.parse(manifestRaw)
    version = String(manifest.version || 'unknown')
    fileCount = String(manifest.file_count ?? 'unknown')
  } catch {
    version = 'unknown'
    fileCount = 'unknown'
  }

  try {
    const classRaw = fs.readFileSync(CLASSIFICATION_PATH, 'utf8')
    const catMatch = classRaw.match(/## Category Summary\n\n([\s\S]+?)(?=\n## |$)/)
    if (catMatch) {
      const lines = catMatch[1].trim().split('\n').filter(l => l.trim().startsWith('-'))
      categories = lines.map(l => l.replace(/^- \*\*([^*]+)\*\*.*/, '$1').trim()).sort().join(',')
    }
  } catch {
    categories = 'unknown'
  }

  return `SURFACE: archive TIER: HISTORICAL_CONTEXT STATUS: reachable VERSION: ${version} FILES: ${fileCount} CATEGORIES: ${categories}`
}

function inventoryWorkhorse() {
  if (!fs.existsSync(WORKHORSE_ARTIFACT_ROOT)) {
    return 'SURFACE: workhorse TIER: GENERATED_CONTEXT STATUS: not_found PATH: ~/.yuri/workhorse-runs DETAILS: artifact root not found'
  }

  let runCount = 'unknown'
  try {
    const entries = fs.readdirSync(WORKHORSE_ARTIFACT_ROOT, { withFileTypes: true })
    const dirs = entries.filter(e => e.isDirectory()).length
    runCount = String(dirs)
  } catch {
    runCount = 'error'
  }

  return `SURFACE: workhorse TIER: GENERATED_CONTEXT STATUS: reachable PATH: ~/.yuri/workhorse-runs DETAILS: run_directories=${runCount}`
}

function inventoryClaudeRuntime() {
  const surfaces = [
    { name: 'rag_db', path: '_SYSTEM/backend/data' },
    { name: 'claude_state', path: '.claude/state' },
    { name: 'claude_history', path: '.claude/history' },
    { name: 'claude_projects', path: '.claude/projects' },
  ]

  const parts = []
  for (const s of surfaces) {
    const abs = path.join(REPO_ROOT, s.path)
    try {
      if (fs.existsSync(abs)) {
        parts.push(`${s.name}=directory_exists`)
      } else {
        parts.push(`${s.name}=not_found`)
      }
    } catch {
      parts.push(`${s.name}=error`)
    }
  }

  return `SURFACE: claude-runtime TIER: SENSITIVE_CONTEXT STATUS: reachable DETAILS: ${parts.join(' | ')}`
}

function inventorySecrets() {
  const checks = [
    { name: '.env', path: path.join(REPO_ROOT, '.env') },
    { name: '.npmrc', path: path.join(REPO_ROOT, '.npmrc') },
    { name: 'node_modules', path: path.join(REPO_ROOT, 'node_modules') },
  ]

  const parts = []
  for (const c of checks) {
    try {
      if (fs.existsSync(c.path)) {
        parts.push(`${c.name}=present`)
      } else {
        parts.push(`${c.name}=absent`)
      }
    } catch {
      parts.push(`${c.name}=error`)
    }
  }

  return `SURFACE: secrets TIER: SECRET_CONTEXT STATUS: reachable DETAILS: ${parts.join(' | ')}`
}

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath)
  } catch {
    return false
  }
}

function dirFiles(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) return ['not_found']
    const entries = fs.readdirSync(dirPath)
    return entries.sort()
  } catch {
    return ['error']
  }
}

function inventoryModelRegistry() {
  const regPath = path.join(REPO_ROOT, MODEL_REGISTRY_PATH)
  if (!fs.existsSync(regPath)) {
    return 'SURFACE: model-registry TIER: PUBLIC_CONTEXT STATUS: not_found PATH: _SYSTEM/model-registry.md DETAILS: file not found'
  }

  let sizeBytes = 'unknown'
  let mtimeIso = 'unknown'
  let detectedDate = 'unknown'
  let modelCountHeuristic = 'unknown'

  try {
    const stat = fs.statSync(regPath)
    sizeBytes = String(stat.size)
    mtimeIso = stat.mtime.toISOString().split('T')[0]
  } catch {
    sizeBytes = 'error'
    mtimeIso = 'error'
  }

  try {
    const content = fs.readFileSync(regPath, 'utf8')
    const dateMatch = content.match(/\*\*Benchmarked:\*\*\s*([^\n]+)/)
    if (dateMatch) detectedDate = dateMatch[1].trim()
    const modelHeaders = content.match(/^##\s+([a-zA-Z0-9_.:-]+)/gm)
    if (modelHeaders) {
      const models = modelHeaders.filter(h => !h.startsWith('## Summary') && !h.startsWith('## Detail') && !h.startsWith('## DeepSeek'))
      modelCountHeuristic = String(models.length) + ' (heuristic)'
    }
  } catch {
    sizeBytes = 'error'
  }

  return `SURFACE: model-registry TIER: PUBLIC_CONTEXT STATUS: reachable PATH: _SYSTEM/model-registry.md DETAILS: size_bytes=${sizeBytes} modified=${mtimeIso} benchmark_date=${detectedDate} models=${modelCountHeuristic}`
}

function inventoryMemoryGovernor() {
  const dbPath = path.join(REPO_ROOT, '_SYSTEM/OS_KERNEL/memory.db')
  if (!fs.existsSync(dbPath)) {
    return 'SURFACE: memory-governor TIER: AUTHORITY STATUS: not_found PATH: _SYSTEM/OS_KERNEL/memory.db DETAILS: database missing'
  }

  const script = [
    'import json, sqlite3, sys',
    'db_path=sys.argv[1]',
    'conn=sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)',
    'conn.row_factory=sqlite3.Row',
    'def has(table):',
    '    return conn.execute("SELECT name FROM sqlite_master WHERE type=\'table\' AND name=?", (table,)).fetchone() is not None',
    'if not has("memory_items"):',
    '    print(json.dumps({"schema":"legacy_only"})); sys.exit(0)',
    'def one(sql):',
    '    row=conn.execute(sql).fetchone(); return row[0] if row else 0',
    'total=one("SELECT COUNT(*) FROM memory_items")',
    'stale=one("SELECT COUNT(*) FROM memory_items WHERE status=\'active\' AND COALESCE(last_accessed_at, updated_at, created_at) < datetime(\'now\', \'-90 days\')")',
    'suppressed=one("SELECT COUNT(*) FROM memory_items WHERE status IN (\'tombstoned\', \'quarantined\') OR tier=\'Tombstone\'")',
    'conflicts=one("SELECT COUNT(*) FROM memory_relations WHERE relation_type=\'contradicts\'") if has("memory_relations") else 0',
    'low_trust=one("SELECT COUNT(*) FROM memory_items WHERE trust_score < 0.35")',
    'last_research=one("SELECT MAX(checked_at) FROM memory_research_sources") if has("memory_research_sources") else None',
    'last_run=conn.execute("SELECT cycle, status, finished_at FROM memory_consolidation_runs ORDER BY id DESC LIMIT 1").fetchone() if has("memory_consolidation_runs") else None',
    'print(json.dumps({"schema":"governed","total":total,"stale":stale,"stale_ratio":round(stale/total,4) if total else 0,"suppressed":suppressed,"conflicts":conflicts,"low_trust":low_trust,"last_research":last_research,"last_run":dict(last_run) if last_run else None}))',
  ].join('\n')

  const result = spawnSync('python3', ['-c', script, dbPath], { encoding: 'utf8', timeout: 5000 })
  if (result.status !== 0) {
    return `SURFACE: memory-governor TIER: AUTHORITY STATUS: error PATH: _SYSTEM/OS_KERNEL/memory.db DETAILS: ${sanitizeInline(result.stderr || 'sqlite_read_failed')}`
  }

  try {
    const health = JSON.parse(result.stdout)
    if (health.schema === 'legacy_only') {
      return 'SURFACE: memory-governor TIER: AUTHORITY STATUS: legacy_only PATH: _SYSTEM/OS_KERNEL/memory.db DETAILS: governed tables not initialized'
    }
    const lastRun = health.last_run ? `${health.last_run.cycle}:${health.last_run.status}:${health.last_run.finished_at || 'unfinished'}` : 'none'
    return `SURFACE: memory-governor TIER: AUTHORITY STATUS: reachable PATH: _SYSTEM/OS_KERNEL/memory.db DETAILS: items=${health.total} stale_ratio=${health.stale_ratio} suppressed=${health.suppressed} conflicts=${health.conflicts} low_trust=${health.low_trust} last_research=${health.last_research || 'none'} last_run=${lastRun}`
  } catch {
    return 'SURFACE: memory-governor TIER: AUTHORITY STATUS: error PATH: _SYSTEM/OS_KERNEL/memory.db DETAILS: invalid_health_json'
  }
}

function sanitizeInline(value) {
  return String(value).replace(/\s+/g, ' ').slice(0, 240)
}

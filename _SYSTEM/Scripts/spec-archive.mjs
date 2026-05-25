#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(SCRIPT_DIR, '../..')
const ACTIVE_DIR = path.resolve(ROOT, 'specs/active')
const DONE_DIR = path.resolve(ROOT, 'specs/done')

function usage() {
  return `Usage: node _SYSTEM/Scripts/spec-archive.mjs [options]

Archive completed specs from specs/active/ into specs/done/YYYY-MM/<slug>/.

Options:
  --dry-run     Default. Show what would be archived without changing files.
  --execute     Move completed specs and companions into specs/done/.
  --json        Emit structured JSON instead of a text table.
  --help, -h    Show this help
`
}

function parseArgs(argv) {
  const args = { dryRun: true, execute: false, json: false, help: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--dry-run') {
      args.dryRun = true
      args.execute = false
    } else if (arg === '--execute') {
      args.execute = true
      args.dryRun = false
    } else if (arg === '--json') {
      args.json = true
    } else if (arg === '--help' || arg === '-h') {
      args.help = true
    } else {
      throw new Error(`Unknown option: ${arg}`)
    }
  }
  return args
}

function todayYearMonth() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

function isMarkdownFile(name) {
  return name.endsWith('.md') && name !== '.gitkeep'
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8')
}

function getFrontmatter(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!match) return {}
  const result = {}
  for (const line of match[1].split(/\r?\n/)) {
    const entry = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.+?)\s*$/)
    if (!entry) continue
    result[entry[1].toLowerCase()] = entry[2].trim().replace(/^['"]|['"]$/g, '')
  }
  return result
}

function tasksComplete(tasksPath) {
  try {
    const text = readText(tasksPath)
    const lines = text.split(/\r?\n/)
    let sawTask = false
    for (const line of lines) {
      if (/^\s*-\s+\[[ xX]\]\s+/.test(line)) {
        sawTask = true
        if (/^\s*-\s+\[\s\]\s+/.test(line)) return false
      }
    }
    return sawTask && !lines.some((line) => /^\s*-\s+\[\s\]\s+/.test(line))
  } catch {
    return false
  }
}

function completionReason(specPath, tasksPath) {
  const markdown = readText(specPath)
  const status = getFrontmatter(markdown).status?.toLowerCase()
  if (status === 'done' || status === 'archived') {
    return `frontmatter status: ${status}`
  }
  if (tasksComplete(tasksPath)) {
    return 'all tasks in tasks.md are marked complete'
  }
  return 'open tasks remain'
}

function specCandidates(files) {
  return files.filter((file) => {
    const name = path.basename(file)
    return isMarkdownFile(name) && name !== 'tasks.md' && name !== 'plan.md'
  })
}

function safeSlug(filePath) {
  return path.basename(filePath, '.md')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'spec'
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
}

function verifyCopiedFile(source, target) {
  const sourceStat = fs.statSync(source)
  const targetStat = fs.statSync(target)
  if (!targetStat.isFile()) throw new Error(`destination is not a file: ${target}`)
  if (sourceStat.size !== targetStat.size) {
    throw new Error(`size mismatch after copy: ${source} -> ${target}`)
  }
}

function copyThenUnlink(source, targetDir) {
  const target = path.join(targetDir, path.basename(source))
  fs.copyFileSync(source, target)
  return target
}

function archiveSet(specPath, companions, dryRun) {
  const monthDir = todayYearMonth()
  const slug = safeSlug(specPath)
  const targetDir = path.join(DONE_DIR, monthDir, slug)
  const sources = [specPath, ...companions]
  const results = []

  if (!dryRun) ensureDir(targetDir)

  for (const source of sources) {
    if (dryRun) {
      results.push({ source, target: path.join(targetDir, path.basename(source)), action: 'would copy' })
      continue
    }
    try {
      const target = copyThenUnlink(source, targetDir)
      verifyCopiedFile(source, target)
      results.push({ source, target, action: 'moved' })
    } catch (error) {
      throw new Error(`${path.basename(source)}: ${error.message}`)
    }
  }

  if (!dryRun) {
    for (const source of sources) {
      fs.unlinkSync(source)
    }
  }

  return { slug, targetDir, results }
}

function printTable(rows) {
  const headers = ['spec', 'status', 'reason']
  const widths = headers.map((header, index) => Math.max(header.length, ...rows.map((row) => String(row[index]).length)))
  const renderRow = (row) => row.map((cell, index) => String(cell).padEnd(widths[index])).join(' | ')
  console.log(renderRow(headers))
  console.log(widths.map((width) => '-'.repeat(width)).join('-|-'))
  for (const row of rows) console.log(renderRow(row))
}

function main() {
  let args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (error) {
    console.error(`Error: ${error.message}`)
    console.log(usage())
    return
  }

  if (args.help) {
    console.log(usage())
    return
  }

  if (!fs.existsSync(ACTIVE_DIR)) return

  const activeEntries = fs.readdirSync(ACTIVE_DIR)
    .map((name) => path.join(ACTIVE_DIR, name))
    .filter((file) => fs.existsSync(file) && fs.statSync(file).isFile() && isMarkdownFile(path.basename(file)))

  if (activeEntries.length === 0) return

  const specs = specCandidates(activeEntries)
  if (specs.length === 0) return

  const specSet = new Set(specs)
  const rows = []
  const report = []
  let archivedCount = 0

  for (const specPath of specs) {
    const tasksPath = path.join(ACTIVE_DIR, 'tasks.md')
    const reason = fs.existsSync(tasksPath)
      ? completionReason(specPath, tasksPath)
      : 'missing tasks.md'
    const completed = reason === 'missing tasks.md'
      ? false
      : reason === 'open tasks remain'
        ? false
        : true

    if (!completed) {
      rows.push([path.basename(specPath), 'kept', reason])
      report.push({ spec: path.basename(specPath), status: 'kept', reason })
      continue
    }

    const companions = activeEntries.filter((file) => file !== specPath && !specSet.has(file))
    try {
      const archive = archiveSet(specPath, companions, args.dryRun)
      rows.push([path.basename(specPath), 'archived', reason])
      report.push({
        spec: path.basename(specPath),
        status: 'archived',
        reason,
        targetDir: archive.targetDir,
        files: archive.results.map((item) => ({
          source: path.relative(ROOT, item.source),
          target: path.relative(ROOT, item.target),
          action: item.action,
        })),
      })
      if (!args.dryRun) archivedCount += 1
    } catch (error) {
      console.error(`Error: ${path.basename(specPath)}: ${error.message}`)
      rows.push([path.basename(specPath), 'kept', `error: ${error.message}`])
      report.push({ spec: path.basename(specPath), status: 'kept', reason: `error: ${error.message}` })
    }
  }

  const summary = {
    scanned: activeEntries.length,
    specs: specs.length,
    archived: archivedCount,
    mode: args.dryRun ? 'dry-run' : 'execute',
  }

  if (args.json) {
    console.log(JSON.stringify({ ok: true, summary, items: report }, null, 2))
    return
  }

  console.log(`SCAN summary: scanned=${summary.scanned} specs=${summary.specs} archived=${summary.archived} mode=${summary.mode}`)
  if (rows.length > 0) printTable(rows)
}

main()

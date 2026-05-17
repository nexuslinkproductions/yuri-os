#!/usr/bin/env node

/**
 * yuri-closeout.mjs — Deterministic read-only closeout reporter for Cline
 *
 * Mirrors Claude Code end-of-transmission behavior in Cline-native terms.
 * Read-only. Never mutates, stages, commits, resets, cleans, installs,
 * starts servers, touches DB, or edits files.
 *
 * Usage:
 *   node _SYSTEM/Scripts/yuri-closeout.mjs
 *   node _SYSTEM/Scripts/yuri-closeout.mjs --path .clinerules --path _SYSTEM/Scripts/yuri-closeout.mjs
 */

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { stdout } from 'node:process'

const REPO_ROOT = '/Users/marcelspatz/YURI-OS-MUSUBI'
const FORBIDDEN_MARKERS = [
  '.env',
  '.npmrc',
  'node_modules',
  'backend/data',
  '.claude/history',
  '.claude/state',
]

main()

function main() {
  const args = process.argv.slice(2)
  const scopedPaths = collectPaths(args)
  const report = buildReport(scopedPaths)
  writeReport(report)
}

function collectPaths(argv) {
  const paths = []
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--path' && index + 1 < argv.length) {
      index += 1
      const p = argv[index]
      for (const marker of FORBIDDEN_MARKERS) {
        if (p.includes(marker)) {
          stdout.write(`ERROR: Forbidden path marker "${marker}" in "${p}"\n`)
          process.exit(1)
        }
      }
      paths.push(p)
    }
  }
  return paths
}

function buildReport(scopedPaths) {
  const sections = {}

  sections.result = 'closeout_report_readonly'

  const branch = gitExec(['branch', '--show-current'])
  const head = gitExec(['rev-parse', '--short', 'HEAD'])
  sections.current = `branch=${branch} head=${head} repo=${REPO_ROOT}`

  if (scopedPaths.length === 0) {
    sections.scoped_status = 'SCOPED_PATHS=none_provided'
    sections.validation = 'SCOPED_PATHS=none_provided'
  } else {
    sections.scoped_status = buildScopedStatus(scopedPaths)
    sections.validation = buildValidation(scopedPaths)
  }

  sections.non_claims = 'read-only closeout no mutation no broad scan no forbidden paths'
  sections.next_recommended = 'review closeout report approve commit if clean'

  return sections
}

function buildScopedStatus(paths) {
  const lines = []
  for (const p of paths) {
    const out = gitExec(['status', '--short', '--', p])
    const status = out === '' ? 'clean' : out
    lines.push(`path=${p} status=${status}`)
  }
  return lines.join(' | ')
}

function buildValidation(paths) {
  const lines = []
  for (const p of paths) {
    if (!p.endsWith('.js') && !p.endsWith('.mjs')) {
      continue
    }
    const absolute = path.resolve(REPO_ROOT, p)
    if (!existsSync(absolute)) {
      lines.push(`path=${p} check=file_not_found`)
      continue
    }
    try {
      execFileSync('node', ['--check', p], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      lines.push(`path=${p} check=pass`)
    } catch (err) {
      const stderr = String(err.stderr || '').trim()
      lines.push(`path=${p} check=fail error=${stderr}`)
    }
  }
  return lines.length > 0 ? lines.join(' | ') : 'no_js_mjs_paths'
}

function gitExec(args) {
  try {
    return execFileSync('git', args, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  } catch {
    return 'error'
  }
}

function writeReport(sections) {
  const lines = []
  lines.push(`RESULT: ${sections.result}`)
  lines.push(`CURRENT: ${sections.current}`)
  lines.push(`SCOPED_STATUS: ${sections.scoped_status}`)
  lines.push(`VALIDATION: ${sections.validation}`)
  lines.push(`NON_CLAIMS: ${sections.non_claims}`)
  lines.push(`NEXT_RECOMMENDED: ${sections.next_recommended}`)
  stdout.write(`${lines.join('\n')}\n`)
}

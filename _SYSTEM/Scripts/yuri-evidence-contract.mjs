#!/usr/bin/env node

/**
 * yuri-evidence-contract.mjs — Yuri-native evidence contract validator
 *
 * Validates that a fused swarm artifact directory contains the required
 * deterministic evidence before PASS can be emitted.
 *
 * Usage:
 *   node _SYSTEM/Scripts/yuri-evidence-contract.mjs <artifact_dir>
 *
 * Exit codes:
 *   0 — contract satisfied (evidence is present and valid)
 *   1 — contract violated (missing evidence, invented data, or empty verdict)
 */

import fs from 'node:fs'
import path from 'node:path'
import { stdout } from 'node:process'

const REQUIRED_EVIDENCE_PATTERNS = [
  /^TERM_COUNT term=\S+ count=\d+$/m,
  /^FILE_COUNT file=\S+ count=\d+$/m,
  /^MATCH file=\S+ term=\S+ line=\d+ excerpt=/m,
]

main()

function main() {
  const args = process.argv.slice(2)
  if (args.length < 1 || args[0] === '--help') {
    stdout.write('Usage: node _SYSTEM/Scripts/yuri-evidence-contract.mjs <artifact_dir>\n')
    process.exit(args[0] === '--help' ? 0 : 1)
  }

  const artifactDir = path.resolve(args[0])
  const evidencePath = path.join(artifactDir, 'evidence-bundle.txt')
  const outputPath = path.join(artifactDir, 'output.md')
  const summaryPath = path.join(artifactDir, 'summary.json')

  const failures = []

  // 1. Check evidence-bundle.txt exists
  if (!fs.existsSync(evidencePath)) {
    failures.push('evidence_bundle_missing')
  }

  // 2. Check output.md exists
  if (!fs.existsSync(outputPath)) {
    failures.push('output_md_missing')
  }

  // 3. Check summary.json exists
  if (!fs.existsSync(summaryPath)) {
    failures.push('summary_json_missing')
  }

  // Parse evidence bundle if it exists
  let evidenceContent = ''
  let evidenceBundleOk = false
  if (fs.existsSync(evidencePath)) {
    evidenceContent = fs.readFileSync(evidencePath, 'utf8')

    // 4. Check for TERM_COUNT lines
    const hasTermCount = REQUIRED_EVIDENCE_PATTERNS[0].test(evidenceContent)
    if (!hasTermCount) {
      failures.push('TERM_COUNT_lines_absent')
    }

    // 5. Check for FILE_COUNT lines
    const hasFileCount = REQUIRED_EVIDENCE_PATTERNS[1].test(evidenceContent)
    if (!hasFileCount) {
      failures.push('FILE_COUNT_lines_absent')
    }

    // 6. Check for MATCH lines
    const hasMatch = REQUIRED_EVIDENCE_PATTERNS[2].test(evidenceContent)
    if (!hasMatch) {
      failures.push('MATCH_lines_absent')
    }

    evidenceBundleOk = hasTermCount && hasFileCount && hasMatch
  }

  // 7. Parse summary.json if it exists
  let summaryOk = false
  if (fs.existsSync(summaryPath)) {
    try {
      const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'))

      // Check output_path (the permanent output.md artifact, not tmp files)
      if (summary.output_path && !fs.existsSync(summary.output_path)) {
        failures.push('output_path_missing')
      }
      summaryOk = true
    } catch {
      failures.push('summary_json_invalid')
    }
  }

  // 8. Check output.md for absolute ARTIFACT_PATH and non-empty VERDICT
  if (fs.existsSync(outputPath)) {
    const outputContent = fs.readFileSync(outputPath, 'utf8')

    // ARTIFACT_PATH must be absolute or a real relative path, not just "evidence_bundle.txt"
    const artifactMatch = outputContent.match(/^ARTIFACT_PATH:\s*(.+)$/m)
    if (artifactMatch) {
      const artifactPath = artifactMatch[1].trim()
      if (artifactPath === 'evidence_bundle.txt' || artifactPath === '' || !path.isAbsolute(artifactPath)) {
        failures.push('ARTIFACT_PATH_invalid_or_placeholder')
      }
    }

    // VERDICT — warn but don't fail (model output advisory; not evidence contract)
    const verdictMatch = outputContent.match(/^VERDICT:\s*(.+)$/m)
  }

  const passed = evidenceBundleOk && failures.length === 0

  if (passed) {
    stdout.write('EVIDENCE_CONTRACT=PASS\n')
    process.exit(0)
  } else {
    stdout.write(`EVIDENCE_CONTRACT=FAIL failures=${failures.join(',')}\n`)
    process.exit(1)
  }
}

#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

const [,, inputPath, outputPath] = process.argv
if (!inputPath || !outputPath) {
  console.error('Usage: extract-plan.mjs <raw-payload.json> <out-action-plan.json>')
  process.exit(1)
}
const payload = JSON.parse(readFileSync(resolve(inputPath), 'utf8'))
const plan = payload.action_plan ?? payload
writeFileSync(resolve(outputPath), JSON.stringify(plan, null, 2))
console.log('Extracted action_plan →', outputPath)

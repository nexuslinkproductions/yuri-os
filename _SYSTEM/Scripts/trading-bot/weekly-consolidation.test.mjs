#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { collectLessons, consolidateWeek } from '../self-improvement/weekly-comp.mjs';

const root = mkdtempSync(join(tmpdir(), 'weekly-consolidation-'));
const extract = resolve(root, '02_EXTRACT');
const entries = resolve(extract, 'entries');
const experiments = resolve(extract, 'experiments');
mkdirSync(entries, { recursive: true });
mkdirSync(experiments, { recursive: true });
writeFileSync(join(entries, 'lesson.md'), '---\ntags: missing_gate\n---\n# Missed Setup\n\n- What setup step was skipped?\n', 'utf-8');
writeFileSync(join(experiments, 'experiment.md'), '---\ntags: framing_failure\n---\n# Better Framing\n\n- What question should be asked first?\n', 'utf-8');

const lessons = collectLessons(root, '2026-W99');
assert.equal(lessons.length, 2);
const result = consolidateWeek({ rootDir: root, week: '2026-W99', dryRun: true });
assert.equal(result.index.totalLessons, 2);
assert.ok(result.index.tags.some(bucket => bucket.tag === 'missing_gate'));
assert.ok(result.index.tags.some(bucket => bucket.tag === 'framing_failure'));

console.log('weekly-consolidation.test: ok');

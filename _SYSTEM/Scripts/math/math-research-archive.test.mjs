#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ARCHIVE_DIR = '_SYSTEM/research-archive/yuri-math-engine-2026-05';
const SOURCE_REGISTRY = readFileSync(`${ARCHIVE_DIR}/01_source_registry.md`, 'utf8');
const MANIFEST = readFileSync(`${ARCHIVE_DIR}/00_manifest.md`, 'utf8');
const GENERAL_OPERATIONALIZATION = readFileSync(`${ARCHIVE_DIR}/09_general_math_operationalization.md`, 'utf8');
const FORMULA_CARD_SCHEMA = readFileSync(`${ARCHIVE_DIR}/10_formula_card_schema.md`, 'utf8');
const HARDENING_PLAN = readFileSync(`${ARCHIVE_DIR}/11_general_math_hardening_plan.md`, 'utf8');
const RESEARCH_SPRINT = readFileSync(`${ARCHIVE_DIR}/12_research_sprint_2026_05_25.md`, 'utf8');

test('math research archive declares advisory status and non-claim boundary', () => {
  assert.match(MANIFEST, /advisory_only: true/);
  assert.match(MANIFEST, /local_truth_claim: false/);
  assert.match(MANIFEST, /Perplexity documents are not direct instructions/);
});

test('math source registry preserves the full 86-reference intake set', () => {
  const sourceRows = SOURCE_REGISTRY.match(/^\| S\d{3} \|/gm) || [];
  assert.equal(sourceRows.length, 86);
  assert.match(SOURCE_REGISTRY, /https:\/\/arxiv\.org\/abs\/2603\.21852/);
  assert.match(SOURCE_REGISTRY, /https:\/\/www\.nature\.com\/articles\/s41586-023-06747-5/);
  assert.match(SOURCE_REGISTRY, /https:\/\/networkx\.org\/documentation\/stable\/tutorial\.html/);
  assert.match(SOURCE_REGISTRY, /https:\/\/www\.stylewarning\.com\/posts\/not-all-elementary\//);
});

test('math source registry classifies sources with promotion state and caveats', () => {
  assert.match(SOURCE_REGISTRY, /## Source Status Values/);
  assert.match(SOURCE_REGISTRY, /PRIMARY_RESEARCH/);
  assert.match(SOURCE_REGISTRY, /IMPLEMENTATION_REFERENCE/);
  assert.match(SOURCE_REGISTRY, /PROMOTION_BLOCKED_UNTIL_VERIFIED/);
  assert.match(SOURCE_REGISTRY, /https:\/\/json-schema\.org\/specification/);
  assert.match(SOURCE_REGISTRY, /https:\/\/fast-check\.dev\/docs\/introduction\/why-property-based\//);
  assert.match(SOURCE_REGISTRY, /## Caveat Policy/);
});

test('general hardening docs stay non-domain-specific', () => {
  const combined = [GENERAL_OPERATIONALIZATION, FORMULA_CARD_SCHEMA, HARDENING_PLAN, RESEARCH_SPRINT].join('\n');
  const retiredDomainTerms = ['tra' + 'ding', 'finance', 'market', 'accounting', 'payroll', 'investing'];

  assert.doesNotMatch(combined, new RegExp(`\\b(${retiredDomainTerms.join('|')})\\b`, 'i'));
  assert.match(combined, /advisory_only: true/);
  assert.match(combined, /Hypotheses should be preserved|advisory hypotheses/);
});

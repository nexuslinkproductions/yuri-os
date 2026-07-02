#!/usr/bin/env node
// Corpus regression for the Lane Result Grammar extractor (master plan D-3).
// Cases come from REAL packets that the old regex silently dropped
// (.claude/jobs/glmf-mr2kcrww-0e33e2 ARCHITECT/ADJUDICATOR) plus the classic forms.
// All three surfaces must agree: contract-conformance (canonical) + both fleet delegates.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractResultLabel as cc, LABEL_TOKEN_RE } from './contract-conformance.mjs';
import { extractResultLabel as glm } from './glm-fleet.mjs';
import { extractResultLabel as olf } from './ollama-fleet.mjs';

const CASES = [
  // [input, expected label]
  ['...diagrams.\n\nRESULT_LABEL: **14PHASE0_HARNESS_COMPILER_DESIGN_X_PASS_COMMITTED**',
    '14PHASE0_HARNESS_COMPILER_DESIGN_X_PASS_COMMITTED'], // the real ARCHITECT.json miss: bold + 6-char prefix
  ['report done\nRESULT_LABEL: 08CW_PDF_TEXT_EXTRACTION_POPPLER_X_PASS_COMMITTED',
    '08CW_PDF_TEXT_EXTRACTION_POPPLER_X_PASS_COMMITTED'], // classic marker form
  ['closing.\n`AMS_Y1_INTEGRITAET_X_PASS_COMMITTED`',
    'AMS_Y1_INTEGRITAET_X_PASS_COMMITTED'], // letter-led prefix in backticks (ollama-fleet.test expectation class)
  ['early mention 01AA_STRAY_COMMITTED then the final verdict:\n02B1_REAL_FINAL_X_PASS_COMMITTED',
    '02B1_REAL_FINAL_X_PASS_COMMITTED'], // last-token convention when no marker
  ['RESULT_LABEL = **08GA_GLM_TRANSPORT_TIMEOUT_WATCHDOG_X_PASS_COMMITTED**',
    '08GA_GLM_TRANSPORT_TIMEOUT_WATCHDOG_X_PASS_COMMITTED'], // = marker + bold
  ['work blocked, see notes. 06MU_ROLE_LAYER_F_BLOCKED', '06MU_ROLE_LAYER_F_BLOCKED'], // BLOCKED suffix
];

const NEGATIVE = [
  'no label here at all',
  'the word committed appears in prose but not as a token',
  'result_label: lowercase_is_not_a_label_committed',
  '',
];

test('canonical extractor handles the real-corpus forms (marker, bold, backticks, long/letter prefixes)', () => {
  for (const [input, expected] of CASES) {
    assert.equal(cc(input).label, expected, `canonical failed on: ${input.slice(0, 60)}`);
  }
});

test('canonical extractor returns null-label on non-conforming text', () => {
  for (const input of NEGATIVE) assert.equal(cc(input).label, null, `false positive on: ${input.slice(0, 50)}`);
});

test('glm-fleet and ollama-fleet delegates agree with the canonical extractor', () => {
  for (const [input, expected] of CASES) {
    assert.equal(glm(input), expected, `glm-fleet disagrees on: ${input.slice(0, 60)}`);
    assert.equal(olf(input), expected, `ollama-fleet disagrees on: ${input.slice(0, 60)}`);
  }
  for (const input of NEGATIVE) {
    assert.equal(glm(input), '', 'glm-fleet must return empty string on miss');
    assert.equal(olf(input), '', 'ollama-fleet must return empty string on miss');
  }
});

test('LABEL_TOKEN_RE stays anchored — plain prose sentences never match', () => {
  assert.equal('We committed the fix and it passed review.'.match(new RegExp(LABEL_TOKEN_RE.source, 'g')), null);
});

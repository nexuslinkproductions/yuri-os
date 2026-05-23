import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  buildCyberProofCards,
  validateCyberProofCards,
  writeCyberProofCards,
} from './cyber-proof-cards.mjs';

test('cyber proof cards convert fixture proofs into client-readable cards', () => {
  const model = buildCyberProofCards();

  assert.equal(model.schema, 'yuri.cyber-proof-cards.v0');
  assert.equal(model.validation.ok, true, model.validation.errors.join('\n'));
  assert.equal(model.cards.length, 7);
  assert.ok(model.cards.every((card) => /fixture proof only/i.test(card.proof_boundary)));
  assert.ok(model.cards.every((card) => card.source_evidence.length > 0));
  assert.ok(model.cards.every((card) => card.security_lens_modules.length > 0));
  assert.ok(model.cards.every((card) => card.local_evidence.executable_test === '_SYSTEM/Scripts/cyber-lab-runner.test.mjs'));
});

test('proof cards include Upgreat-ready demo language without platform overclaim', () => {
  const model = buildCyberProofCards();
  const browser = model.cards.find((card) => card.rail === 'browser-action-boundary-rail');
  const memory = model.cards.find((card) => card.rail === 'retrieval-memory-provenance-rail');

  assert.match(browser.executive_claim, /hostile DOM content/);
  assert.match(browser.client_demo_step, /fake portal/);
  assert.match(memory.executive_claim, /memory and retrieval poisoning/);
  assert.ok(model.cards.every((card) => !/mature\s+(SOC|SIEM|XDR|MDR)|autonomous pentest|production proof/iu.test(JSON.stringify(card))));
});

test('proof card validation fails closed on missing evidence and overclaims', () => {
  const model = buildCyberProofCards();
  const invalid = structuredClone(model);
  invalid.cards[0].source_evidence = [];
  invalid.cards[1].proof_boundary = 'Production proof passed.';
  invalid.cards[2].executive_claim = 'YURI is a mature MDR replacement.';

  const validation = validateCyberProofCards(invalid);

  assert.equal(validation.ok, false);
  assert.match(validation.errors.join('\n'), /missing source evidence/);
  assert.match(validation.errors.join('\n'), /overclaims beyond fixture proof/);
  assert.match(validation.errors.join('\n'), /forbidden platform maturity claim/);
});

test('cyber proof cards write markdown artifact', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'yuri-proof-cards-'));
  try {
    const reportPath = path.join(dir, 'proof-cards.md');
    const result = writeCyberProofCards({ reportPath });
    const markdown = readFileSync(reportPath, 'utf8');

    assert.equal(result.ok, true);
    assert.equal(existsSync(reportPath), true);
    assert.match(markdown, /YURI Cyber Proof Cards/);
    assert.match(markdown, /Upgreat-style pilot conversations/);
    assert.match(markdown, /avoid overclaiming/);
    assert.match(markdown, /Prompt Injection Replay Lab/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

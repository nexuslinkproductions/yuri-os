import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveBudgetCap, DEFAULT_MURE_BUDGET_CAP } from './company.mjs';

test('resolveBudgetCap: finite default when unset', () => {
  const prev = process.env.YURI_MURE_BUDGET;
  const prevU = process.env.YURI_MURE_BUDGET_UNLIMITED;
  delete process.env.YURI_MURE_BUDGET;
  delete process.env.YURI_MURE_BUDGET_UNLIMITED;
  try {
    assert.equal(resolveBudgetCap({}, {}), DEFAULT_MURE_BUDGET_CAP);
  } finally {
    if (prev !== undefined) process.env.YURI_MURE_BUDGET = prev;
    if (prevU !== undefined) process.env.YURI_MURE_BUDGET_UNLIMITED = prevU;
  }
});

test('resolveBudgetCap: owner unlimited override', () => {
  const prev = process.env.YURI_MURE_BUDGET_UNLIMITED;
  process.env.YURI_MURE_BUDGET_UNLIMITED = '1';
  try {
    assert.equal(resolveBudgetCap({}, {}), Infinity);
  } finally {
    if (prev === undefined) delete process.env.YURI_MURE_BUDGET_UNLIMITED;
    else process.env.YURI_MURE_BUDGET_UNLIMITED = prev;
  }
});

test('resolveBudgetCap: task.budgetCap wins', () => {
  assert.equal(resolveBudgetCap({}, { budgetCap: 12 }), 12);
});

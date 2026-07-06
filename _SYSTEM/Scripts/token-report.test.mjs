// _SYSTEM/Scripts/token-report.test.mjs
// Tests for token-report.mjs renderReport()

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderReport } from './token-report.mjs';

describe('renderReport', () => {
  it('returns empty-state string for null input', () => {
    const out = renderReport(null);
    assert.strictEqual(out, 'No token usage recorded.');
  });

  it('returns empty-state string for undefined input', () => {
    const out = renderReport(undefined);
    assert.strictEqual(out, 'No token usage recorded.');
  });

  it('returns empty-state string for empty array', () => {
    const out = renderReport([]);
    assert.strictEqual(out, 'No token usage recorded.');
  });

  it('formats a sample rollups object with totals and daily breakdown', () => {
    const sample = [
      {
        day: '2026-06-15',
        source_path: 'test',
        lane: 'test',
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        operation_type: 'model_call',
        measurement_type: 'observed_provider',
        events: 5,
        input_tokens: 12345,
        output_tokens: 6789,
        cache_read_tokens: 100,
        cache_write_tokens: 0,
        reasoning_tokens: 0,
        cost_usd: 0.0042,
        effective_tokens: 13024,
      },
      {
        day: '2026-06-15',
        source_path: 'test',
        lane: 'test',
        provider: 'ollama',
        model: 'deepseek-r1:8b',
        operation_type: 'model_call',
        measurement_type: 'observed_local_native',
        events: 3,
        input_tokens: 5000,
        output_tokens: 3000,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
        reasoning_tokens: 0,
        cost_usd: 0,
        effective_tokens: 8000,
      },
      {
        day: '2026-06-14',
        source_path: 'test',
        lane: 'test',
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        operation_type: 'model_call',
        measurement_type: 'observed_provider',
        events: 2,
        input_tokens: 9876,
        output_tokens: 5432,
        cache_read_tokens: 50,
        cache_write_tokens: 0,
        reasoning_tokens: 0,
        cost_usd: 0.0031,
        effective_tokens: 10419,
      },
    ];

    const out = renderReport(sample);

    // Session totals line
    assert.ok(out.includes('Session totals:'), 'contains session totals header');
    assert.ok(out.includes('in=17,345'), 'session input tokens formatted'); // 12345 + 5000
    assert.ok(out.includes('out=9,789'), 'session output tokens formatted'); // 6789 + 3000
    assert.ok(out.includes('total=27,134'), 'session total tokens formatted'); // sum
    assert.ok(out.includes('$0.0073'), 'session cost formatted to 4dp'); // 0.0042 + 0.0031

    // Daily breakdown (2 days, most recent first)
    assert.ok(out.includes('Recent days (last 7):'), 'contains daily section header');
    assert.ok(out.includes('2026-06-15:'), 'contains most recent day');
    assert.ok(out.includes('2026-06-14:'), 'contains previous day');
    assert.ok(out.includes('in=17,345'), 'daily input for 2026-06-15');
    assert.ok(out.includes('out=9,789'), 'daily output for 2026-06-15');
    assert.ok(out.includes('total=27,134'), 'daily total for 2026-06-15');
    assert.ok(out.includes('$0.0042'), 'daily cost for 2026-06-15');
    assert.ok(out.includes('in=9,876'), 'daily input for 2026-06-14');
    assert.ok(out.includes('out=5,432'), 'daily output for 2026-06-14');
    assert.ok(out.includes('total=15,308'), 'daily total for 2026-06-14');
    assert.ok(out.includes('$0.0031'), 'daily cost for 2026-06-14');

    // Structure
    assert.ok(out.startsWith('Token Usage Summary'), 'starts with title');
    assert.ok(out.includes('==================='), 'contains separator');
  });

  it('handles missing/NaN fields defensively', () => {
    const messy = [
      { day: '2026-06-15', input_tokens: 'abc', output_tokens: null, cost_usd: undefined },
      { day: '2026-06-15', input_tokens: 100, output_tokens: 50, cost_usd: 0.001 },
    ];
    const out = renderReport(messy);
    assert.ok(out.includes('Session totals:'), 'does not throw on bad fields');
    assert.ok(out.includes('in=100'), 'coerces bad input to 0');
    assert.ok(out.includes('out=50'), 'coerces bad output to 0');
    assert.ok(out.includes('$0.0010'), 'coerces bad cost to 0');
  });

  it('limits daily output to 7 most recent days', () => {
    const manyDays = [];
    for (let i = 0; i < 10; i++) {
      const d = new Date('2026-06-20');
      d.setDate(d.getDate() - i);
      const dayStr = d.toISOString().slice(0, 10);
      manyDays.push({ day: dayStr, input_tokens: 100, output_tokens: 50, cost_usd: 0.001 });
    }
    const out = renderReport(manyDays);
    const dayLines = out.split('\n').filter(l => l.trim().match(/^\d{4}-\d{2}-\d{2}:/));
    assert.strictEqual(dayLines.length, 7, 'shows at most 7 days');
    // Most recent first
    assert.ok(out.indexOf('2026-06-20:') < out.indexOf('2026-06-19:'), 'days sorted descending');
  });
});

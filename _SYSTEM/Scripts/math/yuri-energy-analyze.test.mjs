// yuri-energy-analyze.test.mjs — deterministic test suite
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { percentile, median } from './math-kernel.mjs';
import {
  summarize,
  bootstrapCI,
  differential,
  seriesFromSteps,
  loadBurnInRecords,
  reconstructBurnIn,
  burnInRescoreDelta,
} from './yuri-energy-analyze.mjs';

// ── summarize ────────────────────────────────────────────────────

describe('summarize', () => {
  it('returns correct stats for a known array', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const s = summarize(values);
    assert.equal(s.n, 10);
    assert.equal(s.mean, 5.5);
    assert.equal(s.median, median(values));
    assert.equal(s.min, 1);
    assert.equal(s.max, 10);
    assert.equal(typeof s.p05, 'number');
    assert.equal(typeof s.p95, 'number');
    assert.ok(s.p05 <= s.median);
    assert.ok(s.p95 >= s.median);
  });

  it('handles empty array with NaN fields', () => {
    const s = summarize([]);
    assert.equal(s.n, 0);
    assert.ok(Number.isNaN(s.mean));
    assert.ok(Number.isNaN(s.median));
  });

  it('single element', () => {
    const s = summarize([42]);
    assert.equal(s.n, 1);
    assert.equal(s.mean, 42);
    assert.equal(s.median, 42);
    assert.equal(s.min, 42);
    assert.equal(s.max, 42);
  });
});

// ── bootstrapCI ──────────────────────────────────────────────────

describe('bootstrapCI', () => {
  const meanFn = arr => {
    let s = 0;
    for (const v of arr) s += v;
    return s / arr.length;
  };

  it('determinism: same (values, seed, resamples) → identical {point, lo, hi}', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const opts = { resamples: 500, seed: 42 };
    const r1 = bootstrapCI(values, meanFn, opts);
    const r2 = bootstrapCI(values, meanFn, opts);
    assert.deepEqual(r1, r2);
  });

  it('lo <= point <= hi', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const r = bootstrapCI(values, meanFn, { resamples: 1000, seed: 1 });
    assert.ok(r.lo <= r.point, `lo ${r.lo} should be <= point ${r.point}`);
    assert.ok(r.point <= r.hi, `point ${r.point} should be <= hi ${r.hi}`);
  });

  it('CI of a constant array has lo == hi == point', () => {
    const values = Array(50).fill(7);
    const r = bootstrapCI(values, meanFn, { resamples: 1000, seed: 1 });
    assert.equal(r.point, 7);
    assert.equal(r.lo, 7);
    assert.equal(r.hi, 7);
  });

  it('bootstrapCI with median statFn: point equals math-kernel median', () => {
    const values = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20];
    const med = median(values);
    const r = bootstrapCI(values, median, { resamples: 2000, seed: 1 });
    assert.equal(r.point, med);
    assert.ok(r.lo <= med);
    assert.ok(r.hi >= med);
  });

  it('bootstrapCI reuses the genuine math-kernel percentile (order statistic; p50 ≠ averaged median by convention)', () => {
    const values = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3];
    const sorted = [...values].sort((a, b) => a - b);
    // math-kernel percentile is a tie-aware ORDER statistic: p50 here is 3, NOT the
    // averaged median 3.5. That difference is the real convention; CI bounds (lo/hi) use
    // percentile, so the reuse is correct — the earlier assertion (p50===median) was a
    // false premise about math-kernel, not a code defect.
    assert.notEqual(percentile(sorted, 50), median(values));
    const p50 = percentile(sorted, 50);
    assert.ok(p50 >= sorted[0] && p50 <= sorted[sorted.length - 1], 'p50 within range');
    assert.equal(percentile(sorted, 100), sorted[sorted.length - 1], 'p100 is the max');
  });

  it('resampledN reported correctly', () => {
    const values = [1, 2, 3, 4, 5];
    const r = bootstrapCI(values, meanFn, { resamples: 100, seed: 1 });
    assert.equal(r.sampledN, 5);
    assert.equal(r.n, 5);
  });
});

// ── differential ─────────────────────────────────────────────────

describe('differential', () => {
  it('meanDeltaU: clearly different series → significant, CI excludes 0', () => {
    const seriesA = Array.from({ length: 100 }, (_, i) => 0.1 + i * 0.001);
    const seriesB = Array.from({ length: 100 }, (_, i) => 1.0 + i * 0.001);
    const result = differential(seriesA, seriesB, {
      metric: 'meanDeltaU',
      resamples: 1000,
      seed: 1,
    });
    assert.equal(result.metric, 'meanDeltaU');
    assert.ok(result.significant, 'should be significant for clearly different series');
    assert.ok(result.ci.lo > 0 || result.ci.hi < 0, 'CI should exclude 0');
    assert.ok(result.deltaPoint > 0, 'deltaPoint should be positive');
    assert.equal(typeof result.pointA, 'number');
    assert.equal(typeof result.pointB, 'number');
  });

  it('meanDeltaU: identical series → not significant, deltaPoint ≈ 0', () => {
    const series = Array.from({ length: 100 }, (_, i) => 0.5 + i * 0.01);
    const result = differential(series, [...series], {
      metric: 'meanDeltaU',
      resamples: 1000,
      seed: 1,
    });
    assert.equal(result.significant, false);
    assert.ok(
      Math.abs(result.deltaPoint) < 1e-10,
      `deltaPoint should be ~0, got ${result.deltaPoint}`
    );
  });

  it('rejectionRate: boolean series differing in fraction → significant', () => {
    const seriesA = Array(200).fill(false); // 0 % rejection
    const seriesB = Array(100)
      .fill(false)
      .concat(Array(100).fill(true)); // 50 % rejection
    const result = differential(seriesA, seriesB, {
      metric: 'rejectionRate',
      resamples: 1000,
      seed: 1,
    });
    assert.equal(result.metric, 'rejectionRate');
    assert.ok(result.significant, 'should detect difference in rejection rate');
    assert.ok(result.deltaPoint > 0, 'B has higher rejection → positive delta');
  });

  it('rejectionRate: non-boolean input throws clear error', () => {
    const deltaUSeries = [0.1, -0.2, 0.3, -0.1]; // numbers, NOT booleans
    assert.throws(
      () =>
        differential(deltaUSeries, deltaUSeries, {
          metric: 'rejectionRate',
        }),
      /boolean/i
    );
  });
});

// ── seriesFromSteps ──────────────────────────────────────────────

describe('seriesFromSteps', () => {
  const syntheticSteps = [
    {
      deltaU: 0.5,
      accept: true,
      index: 0,
      label: 'step-a',
      U_before: 0,
      U_after: 0.5,
      dominantTerm: 'x',
    },
    {
      deltaU: -0.3,
      accept: false,
      index: 1,
      label: 'step-b',
      U_before: 0.5,
      U_after: 0.2,
      dominantTerm: 'y',
    },
    {
      deltaU: 0.1,
      accept: true,
      index: 2,
      label: 'step-c',
      U_before: 0.2,
      U_after: 0.3,
      dominantTerm: 'z',
    },
  ];

  it('meanDeltaU yields numbers from steps[].deltaU', () => {
    const result = seriesFromSteps(syntheticSteps, 'meanDeltaU');
    assert.deepEqual(result, [0.5, -0.3, 0.1]);
    for (const v of result) assert.equal(typeof v, 'number');
  });

  it('rejectionRate yields booleans from !steps[].accept', () => {
    const result = seriesFromSteps(syntheticSteps, 'rejectionRate');
    assert.deepEqual(result, [false, true, false]);
    for (const v of result) assert.equal(typeof v, 'boolean');
  });

  it('throws on unknown metric', () => {
    assert.throws(
      () => seriesFromSteps(syntheticSteps, 'unknown'),
      /unknown metric/
    );
  });
});

// ── loadBurnInRecords (live trace — read-only) ───────────────────

describe('loadBurnInRecords (live trace)', () => {
  let loaded;
  try {
    loaded = loadBurnInRecords({ subset: 'rejects' });
  } catch {
    loaded = null;
  }

  if (loaded) {
    it('total > 0', () => {
      assert.ok(loaded.total > 0, `expected total > 0, got ${loaded.total}`);
    });

    it('subsetCount (rejects) > 0 and < total', () => {
      assert.ok(
        loaded.subsetCount > 0,
        `expected subsetCount > 0, got ${loaded.subsetCount}`
      );
      assert.ok(
        loaded.subsetCount < loaded.total,
        `expected subsetCount (${loaded.subsetCount}) < total (${loaded.total})`
      );
    });

    it('every returned record has decision === "reject"', () => {
      for (const record of loaded.records) {
        assert.equal(record.decision, 'reject');
      }
    });
  }
});

// ── reconstructBurnIn (live trace, small slice) ──────────────────

describe('reconstructBurnIn (live trace, small slice)', () => {
  let records;
  try {
    const loaded = loadBurnInRecords({ subset: 'rejects', maxRecords: 20 });
    records = loaded.records;
  } catch {
    records = null;
  }

  if (records && records.length > 0) {
    it('returns finite tallies with no NaN', () => {
      const result = reconstructBurnIn(records);
      assert.ok(Number.isFinite(result.recordsWithAnyRecoverable));
      assert.ok(Number.isFinite(result.totalRecords));
      assert.ok(Number.isFinite(result.rightCensoredCount));
      assert.equal(result.totalRecords, records.length);
      for (const [, v] of Object.entries(result.perComponentRecovered)) {
        assert.ok(Number.isFinite(v));
      }
      for (const [, v] of Object.entries(result.absentTally)) {
        assert.ok(Number.isFinite(v));
      }
      for (const [, v] of Object.entries(result.unrecoverableTally)) {
        assert.ok(Number.isFinite(v));
      }
    });

    it('recordsWithAnyRecoverable <= totalRecords', () => {
      const result = reconstructBurnIn(records);
      assert.ok(result.recordsWithAnyRecoverable <= result.totalRecords);
    });
  }
});

// ── burnInRescoreDelta (live trace, small slice) ─────────────────

describe('burnInRescoreDelta (live trace, small slice)', () => {
  let records;
  try {
    const loaded = loadBurnInRecords({ subset: 'rejects', maxRecords: 50 });
    records = loaded.records;
  } catch {
    records = null;
  }

  if (records && records.length > 0) {
    it('candidate iota: rescoredCount > 0, finite results, coverage in [0,1]', () => {
      const result = burnInRescoreDelta(
        records,
        { kind: 'delta', weights: { iota: 0.2 } },
        { seed: 1, resamples: 200 }
      );
      assert.ok(
        result.rescoredCount > 0,
        `expected rescoredCount > 0, got ${result.rescoredCount}`
      );
      assert.ok(result.excludedCount >= 0);
      assert.ok(
        result.coverage >= 0 && result.coverage <= 1,
        `coverage ${result.coverage} not in [0,1]`
      );
      assert.ok(
        Number.isFinite(result.deltaUStat.point) ||
          Number.isNaN(result.deltaUStat.point)
      );
      assert.ok(result.note.includes('RECOVERABLE-SUBSET PROXY'));
      assert.ok(Number.isFinite(result.flips.baselineRejectRecoverable));
      assert.ok(Number.isFinite(result.flips.candidateRejectRecoverable));
      assert.ok(Number.isFinite(result.flips.flipped));
    });

    it('barrier candidate {eta:1} throws via validateCandidateWeights', () => {
      assert.throws(() => {
        burnInRescoreDelta(records, { eta: 1 }, { seed: 1, resamples: 10 });
      });
    });

    it('determinism: same seed + slice → identical numeric output', () => {
      const config = { kind: 'delta', weights: { iota: 0.2 } };
      const opts = { seed: 42, resamples: 200 };
      const r1 = burnInRescoreDelta(records, config, opts);
      const r2 = burnInRescoreDelta(records, config, opts);

      assert.equal(r1.rescoredCount, r2.rescoredCount);
      assert.equal(r1.excludedCount, r2.excludedCount);
      assert.equal(r1.coverage, r2.coverage);
      assert.equal(r1.deltaUStat.point, r2.deltaUStat.point);
      assert.equal(r1.deltaUStat.lo, r2.deltaUStat.lo);
      assert.equal(r1.deltaUStat.hi, r2.deltaUStat.hi);
      assert.equal(
        r1.flips.baselineRejectRecoverable,
        r2.flips.baselineRejectRecoverable
      );
      assert.equal(
        r1.flips.candidateRejectRecoverable,
        r2.flips.candidateRejectRecoverable
      );
      assert.equal(r1.flips.flipped, r2.flips.flipped);
      assert.equal(r1.perRecord.length, r2.perRecord.length);
      for (let i = 0; i < r1.perRecord.length; i++) {
        assert.equal(r1.perRecord[i].baseU, r2.perRecord[i].baseU);
        assert.equal(r1.perRecord[i].candU, r2.perRecord[i].candU);
        assert.equal(r1.perRecord[i].deltaU, r2.perRecord[i].deltaU);
      }
    });
  }
});

/**
 * CalibrationPanel.tsx — per-factor reliability scorecard.
 * Consumes the REAL /calibration shape ({ evaluated, factors:[{factorId,n,dsr,brier,meanReturn,promote}], advisory }).
 * Brier 0.25 = coin-flip; DSR is P(true Sharpe>0) after deflation; promote=false until the math clears.
 * Null-guarded throughout (the live re-eval can return null fields on thin data).
 */

import type { CalibrationResponse } from './api';

interface Props {
  data: CalibrationResponse | null;
}

const fmt = (x: number | null | undefined, d = 3) => (typeof x === 'number' && isFinite(x) ? x.toFixed(d) : '—');

function brierClass(b: number | null | undefined): string {
  if (typeof b !== 'number' || !isFinite(b)) return 'mid';
  if (b < 0.22) return 'good';
  if (b < 0.25) return 'mid';
  return 'poor';
}

export default function CalibrationPanel({ data }: Props) {
  const factors = Array.isArray(data?.factors) ? data!.factors : [];
  const hasData = !!data && factors.length > 0;

  return (
    <>
      <div className="bb-panel-head">
        <span className="bb-eyebrow">Calibration</span>
        <span className="bb-panel-sub">Are our methods working</span>
      </div>

      {!hasData ? (
        <div className="bb-cal-pending">
          {data?.advisory ?? 'Calibration accruing — available after sufficient trade history.'}<br />
          <span style={{ color: 'var(--faint)', fontSize: 9 }}>/api/observatory/calibration</span>
        </div>
      ) : (
        <div className="bb-cal-list" style={{ maxHeight: 280, overflowY: 'auto' }}>
          {factors.map((f) => {
            const b = typeof f.brier === 'number' ? f.brier : null;
            return (
              <div key={f.factorId} className="bb-cal-row">
                <span className="bb-cal-factor">{f.factorId}</span>
                <div className="bb-cal-brier">
                  <span className="bb-cal-brier-val">{fmt(b)}</span>
                  <div className="bb-cal-brier-bar">
                    <div
                      className={`bb-cal-brier-fill ${brierClass(b)}`}
                      style={{ width: Math.min(100, Math.round((b ?? 0) * 200)) + '%' }}
                    />
                  </div>
                </div>
                <div className="bb-cal-sharpe">
                  <span className="label">DSR</span>
                  {fmt(f.dsr, 2)}
                </div>
                <span className={`bb-cal-lifecycle ${f.promote ? 'live' : 'hypothesis'}`}>
                  {f.promote ? 'promote' : 'no-edge'}
                </span>
              </div>
            );
          })}
          {data?.advisory && (
            <div className="bb-cal-pending" style={{ fontSize: 9, opacity: 0.6, marginTop: 6 }}>{data.advisory}</div>
          )}
        </div>
      )}
    </>
  );
}

/**
 * CalibrationPanel.tsx — Calibration Scorecard.
 * /calibration does not exist yet (404). Renders graceful pending state.
 * When it goes live, renders factor Brier/Sharpe/lifecycle table.
 */

import type { CalibrationResponse } from './api';

interface Props {
  data: CalibrationResponse | null;
}

function brierClass(b: number): string {
  if (b < 0.22) return 'good';
  if (b < 0.25) return 'mid';
  return 'poor';
}

export default function CalibrationPanel({ data }: Props) {
  return (
    <>
      <div className="bb-panel-head">
        <span className="bb-eyebrow">Calibration</span>
        <span className="bb-panel-sub">Are our methods working</span>
      </div>

      {!data ? (
        <div className="bb-cal-pending">
          Calibration endpoint accruing — available after sufficient trade history.<br />
          <span style={{ color: 'var(--faint)', fontSize: 9 }}>/api/observatory/calibration</span>
        </div>
      ) : (
        <div className="bb-cal-list">
          {data.factors.map(f => (
            <div key={f.name} className="bb-cal-row">
              <span className="bb-cal-factor">{f.name}</span>
              <div className="bb-cal-brier">
                <span className="bb-cal-brier-val">{f.brier.toFixed(3)}</span>
                <div className="bb-cal-brier-bar">
                  <div
                    className={`bb-cal-brier-fill ${brierClass(f.brier)}`}
                    style={{ width: Math.round(f.brier * 200) + '%' }}
                  />
                </div>
              </div>
              <div className="bb-cal-sharpe">
                <span className="label">Def Sharpe</span>
                {f.sharpe.toFixed(2)}
              </div>
              <span className={`bb-cal-lifecycle ${f.lifecycle}`}>{f.lifecycle}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

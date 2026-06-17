/**
 * GraduationPanel.tsx — Graduation Ladder panel.
 * /graduation does not exist yet (404). Renders graceful pending state.
 * When it goes live, renders rung nodes + current rung highlight.
 */

import type { GraduationResponse } from './api';

interface Props {
  data: GraduationResponse | null;
}

const STATIC_RUNGS = [
  { id: 'R0', name: 'Shadow', status: 'unmet' as const, gate: '30d shadow corr > 0.85', detail: 'pending' },
  { id: 'R1', name: 'Paper', status: 'unmet' as const, gate: '60d paper Sharpe > 1.0', detail: 'pending' },
  { id: 'R2', name: 'Micro', status: 'current' as const, gate: '90d live Sharpe > 0.80', detail: 'accruing' },
  { id: 'R3', name: 'Scaled', status: 'unmet' as const, gate: '180d Sharpe > 1.2, DD < 8%', detail: 'locked' },
];

export default function GraduationPanel({ data }: Props) {
  const rungs = data?.rungs ?? STATIC_RUNGS;
  const progressPct = data?.progressPct ?? 25;
  const current = data?.current ?? 'R2 · Micro';
  const isPending = !data;

  const nodeIcon = (status: string) => {
    if (status === 'met') return '✓';
    if (status === 'current') return '◐';
    return '○';
  };

  return (
    <>
      <div className="bb-panel-head">
        <span className="bb-eyebrow">Graduation Ladder</span>
        <span className="bb-panel-sub">Prove it before real money</span>
      </div>

      <div className="bb-grad-ladder">
        <div className="bb-grad-line" />
        <div className="bb-grad-line-fill" style={{ width: progressPct + '%' }} />
        {rungs.map(r => (
          <div key={r.id} className="bb-grad-rung">
            <div className={`bb-grad-node ${r.status}`}>{nodeIcon(r.status)}</div>
            <span className={`bb-grad-label ${r.status === 'current' ? 'current' : ''}`}>{r.id} · {r.name}</span>
            <div className="bb-grad-gate">
              {r.gate}
              <span className={`status ${r.status}`}>{r.detail}</span>
            </div>
          </div>
        ))}
      </div>

      {isPending ? (
        <div className="bb-grad-pending">
          Graduation data accruing — /api/observatory/graduation pending.
          Paper trading in progress — metrics building.
        </div>
      ) : (
        <div className="bb-grad-current">
          <span className="bb-grad-current-label">Current Rung</span>
          <span className="bb-grad-current-val">{current}</span>
          {data?.rungs.find(r => r.status === 'current') && (
            <span className="bb-grad-current-detail">{data.rungs.find(r => r.status === 'current')!.detail}</span>
          )}
        </div>
      )}
    </>
  );
}

/**
 * GraduationPanel.tsx — R0→R3 reliability ladder.
 * Consumes the REAL /graduation shape ({ portfolio:{rung,byRung,blockers}, factors, advisory }).
 * Shows the HONEST current rung (no fake "current" highlight) + per-rung factor counts + the
 * gates blocking advancement. Real money lives at R2 and stays out of reach until the math clears.
 */

import type { GraduationResponse } from './api';

interface Props {
  data: GraduationResponse | null;
}

const RUNGS = [
  { id: 'R0', name: 'Shadow', gate: 'data-quality ≥99% · N ≥ 30' },
  { id: 'R1', name: 'Paper', gate: 'DSR>1.5 · FDR<0.01 · Brier<0.18 · N≥200' },
  { id: 'R2', name: 'Micro', gate: 'REAL MONEY — all R1 gates computed-true' },
  { id: 'R3', name: 'Scaled', gate: 'MDD<10% · ΔU>0 · sign-agreement' },
];

const RUNG_IDX: Record<string, number> = { R0: 0, R1: 1, R2: 2, R3: 3 };

export default function GraduationPanel({ data }: Props) {
  const isPending = !data || !data.portfolio;
  const currentRung = data?.portfolio?.rung ?? 'R0';
  const currentIdx = RUNG_IDX[currentRung] ?? 0;
  const byRung = data?.portfolio?.byRung ?? {};
  const factorCount = data?.portfolio?.factorCount ?? (data?.factors?.length ?? 0);
  const blockers = Array.isArray(data?.portfolio?.blockers) ? data!.portfolio!.blockers! : [];
  const progressPct = (currentIdx / (RUNGS.length - 1)) * 100;

  const nodeStatus = (idx: number): 'met' | 'current' | 'unmet' =>
    idx < currentIdx ? 'met' : idx === currentIdx ? 'current' : 'unmet';
  const nodeIcon = (s: string) => (s === 'met' ? '✓' : s === 'current' ? '◐' : '○');

  return (
    <>
      <div className="bb-panel-head">
        <span className="bb-eyebrow">Graduation Ladder</span>
        <span className="bb-panel-sub">Prove it before real money</span>
      </div>

      <div className="bb-grad-ladder">
        <div className="bb-grad-line" />
        <div className="bb-grad-line-fill" style={{ width: progressPct + '%' }} />
        {RUNGS.map((r, i) => {
          const status = nodeStatus(i);
          const count = byRung[r.id] ?? 0;
          return (
            <div key={r.id} className="bb-grad-rung">
              <div className={`bb-grad-node ${status}`}>{nodeIcon(status)}</div>
              <span className={`bb-grad-label ${status === 'current' ? 'current' : ''}`}>{r.id} · {r.name}</span>
              <div className="bb-grad-gate">
                {r.gate}
                <span className={`status ${status}`}>{count} factor{count === 1 ? '' : 's'}</span>
              </div>
            </div>
          );
        })}
      </div>

      {isPending ? (
        <div className="bb-grad-pending">
          Graduation accruing — /api/observatory/graduation pending.
        </div>
      ) : (
        <div className="bb-grad-current">
          <span className="bb-grad-current-label">Portfolio rung</span>
          <span className="bb-grad-current-val">{currentRung} · {RUNGS[currentIdx]?.name ?? ''}</span>
          <span className="bb-grad-current-detail">
            {factorCount} factor{factorCount === 1 ? '' : 's'} · {byRung['R0'] ?? 0} at R0 · {(byRung['R2'] ?? 0) + (byRung['R3'] ?? 0)} real-money-eligible
          </span>
          {blockers.slice(0, 3).map((b, i) => {
            const top = Array.isArray(b.unmet) && b.unmet.length ? b.unmet[0] : null;
            return (
              <span key={b.factorId + i} className="bb-grad-blocker" style={{ display: 'block', fontSize: 10, opacity: 0.7, marginTop: 2 }}>
                {b.factorId} → {b.nextRung ?? '?'}: {top ? `${top.gate} needs ${top.need} (have ${top.have})` : 'gated'}
              </span>
            );
          })}
          {data?.advisory && (
            <span className="bb-grad-blocker" style={{ display: 'block', fontSize: 9, opacity: 0.5, marginTop: 4 }}>{data.advisory}</span>
          )}
        </div>
      )}
    </>
  );
}

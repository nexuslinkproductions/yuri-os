/**
 * PerpTrainerPanel.tsx — Leveraged paper-training scorecard.
 * Visualises: win rate (the honest number), equity curve (inline SVG),
 * leverage sweep table, stat grid, and exit-reason breakdown.
 *
 * HONEST POLICY: ~4% win rate is the real baseline. This panel's job is to
 * show the truth so the owner can raise it — never fake-green a losing scorecard.
 */

import type { TrainerResponse, TrainerSweepRow, EquityPoint } from './api';

interface Props {
  data: TrainerResponse | null;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtPct(v: number, d = 1): string {
  return (v * 100).toFixed(d) + '%';
}

function fmtMoney(v: number): string {
  const abs = Math.abs(v);
  const prefix = v >= 0 ? '+$' : '-$';
  return prefix + (abs >= 1000
    ? abs.toLocaleString('en-US', { maximumFractionDigits: 0 })
    : abs.toFixed(2));
}

function fmtPf(pf: number | null): string {
  if (pf === null) return '—';
  if (!isFinite(pf)) return '∞';
  return pf.toFixed(2);
}

function fmtDD(dd: number | null): string {
  if (dd === null || !isFinite(dd)) return '—';
  return dd.toFixed(2) + '%';
}

// ── Equity Curve — inline SVG, follows CandleChart.tsx pattern ──────────────

function EquityCurve({ points, bankroll }: { points: EquityPoint[]; bankroll: number }) {
  // Guard: need at least 2 points to draw anything meaningful
  if (!points || points.length < 2) {
    return (
      <div className="bb-trainer-sparkline-wrap">
        <span style={{ fontSize: 9, color: 'var(--mist)' }}>Equity curve — insufficient points</span>
      </div>
    );
  }

  const W = 760, H = 48, padX = 2, padY = 4;
  const plotW = W - padX * 2;
  const plotH = H - padY * 2;

  const eqs = points.map(p => p.eq);
  const minEq = Math.min(...eqs);
  const maxEq = Math.max(...eqs);
  const range = (maxEq - minEq) || 1;

  const xOf = (i: number) => padX + (i / (points.length - 1)) * plotW;
  const yOf = (eq: number) => padY + (1 - (eq - minEq) / range) * plotH;

  const linePts = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(p.eq).toFixed(1)}`).join(' ');
  const lastEq = eqs[eqs.length - 1];
  const firstEq = eqs[0];
  const lineColor = lastEq >= firstEq ? 'var(--long)' : 'var(--short)';

  // Baseline at starting bankroll (may be outside the min/max range if very close)
  const clampedBankroll = Math.max(minEq, Math.min(maxEq, bankroll));
  const baselineY = yOf(clampedBankroll);

  return (
    <div className="bb-trainer-sparkline-wrap">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height: '100%', display: 'block' }}
      >
        {/* baseline at starting bankroll */}
        <line
          x1={padX} y1={baselineY.toFixed(1)}
          x2={W - padX} y2={baselineY.toFixed(1)}
          stroke="rgba(130,160,210,0.12)" strokeWidth={0.7} strokeDasharray="3 3"
        />
        {/* equity line */}
        <path d={linePts} fill="none" stroke={lineColor} strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" opacity={0.85} />
      </svg>
    </div>
  );
}

// ── Sweep table ──────────────────────────────────────────────────────────────

function SweepTable({
  rows,
  best,
}: {
  rows: TrainerSweepRow[];
  best: TrainerResponse['best'];
}) {
  if (!rows.length) return <div className="bb-empty">No sweep data.</div>;

  const isBestRow = (row: TrainerSweepRow): boolean =>
    best !== null &&
    row.leverage === best.leverage &&
    row.riskPct === best.riskPct;

  return (
    <table className="bb-pos-table bb-trainer-sweep-table">
      <thead>
        <tr>
          <th>Lev</th>
          <th>Risk</th>
          <th className="r">Trades</th>
          <th className="r">Win%</th>
          <th className="r">PF</th>
          <th className="r">Net</th>
          <th className="r">Ret%</th>
          <th className="r">DD%</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className={isBestRow(row) ? 'bb-trainer-best' : ''}>
            <td className="sym">{row.leverage}×</td>
            <td style={{ color: 'var(--mist)', fontFamily: 'var(--bb-mono)', fontSize: 10 }}>
              {(row.riskPct * 100).toFixed(0)}%
            </td>
            <td className="r">{row.closedTrades}</td>
            <td className={`r ${row.winRate >= 0.5 ? 'pnl pos' : 'pnl'}`} style={row.winRate < 0.5 ? { color: 'var(--mist)' } : {}}>
              {fmtPct(row.winRate)}
            </td>
            <td className="r" style={{ color: 'var(--mist)', fontFamily: 'var(--bb-mono)', fontSize: 10 }}>
              {fmtPf(row.profitFactor)}
            </td>
            <td className={`r pnl ${row.netPnl >= 0 ? 'pos' : 'neg'}`}>
              {fmtMoney(row.netPnl)}
            </td>
            <td className={`r pnl ${row.returnPct >= 0 ? 'pos' : 'neg'}`}>
              {(row.returnPct >= 0 ? '+' : '') + row.returnPct.toFixed(2) + '%'}
            </td>
            <td className="r" style={{ color: 'var(--mist)', fontFamily: 'var(--bb-mono)', fontSize: 10 }}>
              {fmtDD(row.maxDrawdownPct)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Exit chips ───────────────────────────────────────────────────────────────

function ExitChips({ byReason }: { byReason: Record<string, number> }) {
  const entries = Object.entries(byReason).filter(([, n]) => n > 0);
  if (!entries.length) return null;
  return (
    <div className="bb-trainer-exit-chips">
      {entries.map(([reason, count]) => (
        <span key={reason} className="bb-trainer-exit-chip">
          <span className="bb-trainer-exit-reason">{reason}</span>
          <span className="bb-trainer-exit-count">{count}</span>
        </span>
      ))}
    </div>
  );
}

// ── Root ─────────────────────────────────────────────────────────────────────

export default function PerpTrainerPanel({ data }: Props) {
  const h = data?.headline ?? null;

  const market = data?.market ?? h?.config?.market ?? '—';
  const lev = h?.config?.leverage ?? '—';
  const interval = data?.interval ?? h?.config?.interval ?? '';

  const subLabel = interval
    ? `${market} · paper · lev ${lev}× · ${interval}`
    : `${market} · paper · lev ${lev}×`;

  return (
    <>
      {/* Header */}
      <div className="bb-panel-head">
        <span className="bb-eyebrow">Perp Trainer</span>
        <span className="bb-panel-sub">{subLabel}</span>
      </div>

      {!h ? (
        <div className="bb-empty">No training session yet — run train-publish.mjs</div>
      ) : (
        <>
          {/* ── HERO: WIN RATE ── */}
          <div className="bb-trainer-hero">
            <div className="bb-trainer-hero-metric">
              <span className="bb-trainer-winrate">{fmtPct(h.winRate, 1)}</span>
              <span className="bb-trainer-winrate-label">win rate · target ↑</span>
            </div>
            <div className="bb-trainer-hero-meta">
              <span className="bb-trainer-hero-meta-item">
                <span className="bb-trainer-meta-label">Cycles</span>
                <span className="bb-trainer-meta-val">{h.config.cycles}</span>
              </span>
              <span className="bb-trainer-hero-meta-item">
                <span className="bb-trainer-meta-label">Bars</span>
                <span className="bb-trainer-meta-val">{data?.barCount ?? '—'}</span>
              </span>
              <span className="bb-trainer-hero-meta-item">
                <span className="bb-trainer-meta-label">Bankroll</span>
                <span className="bb-trainer-meta-val">${h.config.bankroll}</span>
              </span>
            </div>
          </div>

          <div className="bb-div" />

          {/* ── STAT GRID ── */}
          <div className="bb-trainer-stat-grid">
            <div className="bb-trainer-stat">
              <span className="bb-trainer-stat-label">Trades</span>
              <span className="bb-trainer-stat-val">{h.closedTrades}</span>
              <span className="bb-trainer-stat-sub">{h.wins}W / {h.losses}L</span>
            </div>
            <div className="bb-trainer-stat">
              <span className="bb-trainer-stat-label">Profit Factor</span>
              <span className="bb-trainer-stat-val">{fmtPf(h.profitFactor)}</span>
              <span className="bb-trainer-stat-sub">avg W {fmtMoney(h.avgWin)} · L {fmtMoney(h.avgLoss)}</span>
            </div>
            <div className="bb-trainer-stat">
              <span className="bb-trainer-stat-label">Net P&amp;L</span>
              <span className={`bb-trainer-stat-val ${h.netPnl >= 0 ? 'pos' : 'neg'}`}>
                {fmtMoney(h.netPnl)}
              </span>
              <span className="bb-trainer-stat-sub">{(h.returnPct >= 0 ? '+' : '')}{h.returnPct.toFixed(2)}% ret</span>
            </div>
            <div className="bb-trainer-stat">
              <span className="bb-trainer-stat-label">Max DD</span>
              <span className={`bb-trainer-stat-val ${(h.maxDrawdownPct ?? 0) > 5 ? 'neg' : ''}`}>
                {fmtDD(h.maxDrawdownPct)}
              </span>
              <span className="bb-trainer-stat-sub">liq {h.liquidations}</span>
            </div>
            <div className="bb-trainer-stat">
              <span className="bb-trainer-stat-label">Final Equity</span>
              <span className={`bb-trainer-stat-val ${h.finalEquity >= h.config.bankroll ? 'pos' : 'neg'}`}>
                ${h.finalEquity.toFixed(2)}
              </span>
              <span className="bb-trainer-stat-sub">started ${h.config.bankroll}</span>
            </div>
            <div className="bb-trainer-stat">
              <span className="bb-trainer-stat-label">Config</span>
              <span className="bb-trainer-stat-val">{h.config.leverage}× / {(h.config.riskPct * 100).toFixed(0)}% risk</span>
              <span className="bb-trainer-stat-sub">
                {h.totalFees !== null ? `fees $${Math.abs(h.totalFees).toFixed(2)}` : ''}
                {h.totalFunding !== null ? ` · fund $${Math.abs(h.totalFunding).toFixed(2)}` : ''}
              </span>
            </div>
          </div>

          {/* ── EQUITY CURVE ── */}
          {h.equityCurve && h.equityCurve.length >= 2 && (
            <>
              <div className="bb-div" />
              <div className="bb-sub-head">
                <span className="bb-sub-eyebrow">Equity Curve</span>
                <span className="bb-panel-sub">{h.equityCurve.length} pts</span>
              </div>
              <EquityCurve points={h.equityCurve} bankroll={h.config.bankroll} />
            </>
          )}

          {/* ── LEVERAGE SWEEP ── */}
          {data && data.sweep.length > 0 && (
            <>
              <div className="bb-div" />
              <div className="bb-sub-head">
                <span className="bb-sub-eyebrow">Leverage Sweep</span>
                {data.best && (
                  <span className="bb-panel-sub">
                    best: {data.best.leverage}× / {(data.best.riskPct * 100).toFixed(0)}% risk → {fmtPct(data.best.winRate)} win / {fmtMoney(data.best.netPnl)} net
                  </span>
                )}
              </div>
              <SweepTable rows={data.sweep} best={data.best} />
            </>
          )}

          {/* ── EXIT BREAKDOWN ── */}
          {Object.keys(h.byReason).length > 0 && (
            <>
              <div className="bb-div" />
              <div className="bb-sub-head">
                <span className="bb-sub-eyebrow">Exit Breakdown</span>
              </div>
              <ExitChips byReason={h.byReason} />
            </>
          )}

          {/* Advisory */}
          {data?.advisory && (
            <div className="bb-empty" style={{ marginTop: 8, fontSize: 9, opacity: 0.6 }}>{data.advisory}</div>
          )}
        </>
      )}
    </>
  );
}

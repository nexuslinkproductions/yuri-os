/**
 * MechanismTab.tsx
 *
 * Mechanism tab — live mechanism story.
 * Dense, self-explaining, deck design language.
 * Uses regimes map (per-market) for all regime displays.
 */

import { useId } from 'react';
import type { CircuitState, EnergyState, FactorSignal, MarketSnapshot, RegimeState } from '../../hooks/useObservatoryStream';

interface Props {
  factors: FactorSignal[];
  regime: RegimeState;
  regimes?: Record<string, RegimeState>;
  energy: EnergyState;
  markets?: Record<string, MarketSnapshot>;
}

// ── Energy ΔU Gauge (SVG arc) ─────────────────────────────────────────────────

function EnergyGauge({ energy }: { energy: EnergyState }) {
  const gradId = useId();
  const raw = energy.deltaU ?? 0;
  const clamped = Math.max(-1, Math.min(1, raw));
  const normalised = (clamped + 1) / 2;

  const cx = 80; const cy = 80; const r = 60;
  const startAngle = Math.PI;
  const fillAngle = startAngle + normalised * Math.PI;

  function polarToXY(angle: number, radius: number) {
    return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  }

  const bgStart = polarToXY(startAngle, r);
  const bgEnd   = polarToXY(0, r);
  const fillEnd = polarToXY(fillAngle, r);
  const fillLargeArc = Math.abs(fillAngle - startAngle) > Math.PI ? 1 : 0;

  const gaugeColor = raw < -0.3 ? 'var(--d-verm)' : raw > 0.3 ? 'var(--d-jade)' : '#f0a500';

  return (
    <div className="obs-gauge-card">
      <span className="obs-section-title">Energy ΔU</span>
      <p className="d-caption">Lower ΔU = healthier decision energy. Positive = regime-forward. ACCEPT = gate passes this cycle.</p>
      <div className="obs-gauge-wrap" style={{ marginTop: 12 }}>
        <svg width="160" height="90" viewBox="0 0 160 90" aria-label={`Energy ΔU: ${raw.toFixed(3)}`}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--d-verm)" />
              <stop offset="50%" stopColor="#f0a500" />
              <stop offset="100%" stopColor="var(--d-jade)" />
            </linearGradient>
          </defs>
          <path
            d={`M ${bgStart.x} ${bgStart.y} A ${r} ${r} 0 0 1 ${bgEnd.x} ${bgEnd.y}`}
            fill="none" stroke="rgba(232,242,252,.06)" strokeWidth="8" strokeLinecap="round"
          />
          {normalised > 0.01 && (
            <path
              d={`M ${bgStart.x} ${bgStart.y} A ${r} ${r} 0 ${fillLargeArc} 1 ${fillEnd.x} ${fillEnd.y}`}
              fill="none" stroke={gaugeColor} strokeWidth="8" strokeLinecap="round" opacity=".9"
            />
          )}
          <circle cx={fillEnd.x} cy={fillEnd.y} r="4" fill={gaugeColor} />
        </svg>
        <div className="obs-gauge-value" style={{ color: gaugeColor }}>
          {raw >= 0 ? '+' : ''}{raw.toFixed(4)}
        </div>
        <div className="obs-gauge-label">
          {energy.accept === true ? 'ACCEPT' : energy.accept === false ? 'REJECT' : 'ADVISORY'}
        </div>
        {energy.reason && <div className="obs-gauge-reason">{energy.reason}</div>}
      </div>
    </div>
  );
}

// ── Calibration panel ─────────────────────────────────────────────────────────

function CalibrationPanel({ factors }: { factors: FactorSignal[] }) {
  const longFactors    = factors.filter(f => f.side === 'long');
  const shortFactors   = factors.filter(f => f.side === 'short');
  const neutralFactors = factors.filter(f => f.side === 'neutral');
  const avgConf = factors.length > 0
    ? factors.reduce((s, f) => s + (f.confidence ?? 0), 0) / factors.length
    : null;
  const confPct = avgConf != null ? (avgConf * 100).toFixed(1) : null;

  const bars: { label: string; count: number; color: string }[] = [
    { label: 'LONG',    count: longFactors.length,    color: 'var(--d-jade)' },
    { label: 'SHORT',   count: shortFactors.length,   color: 'var(--d-verm)' },
    { label: 'NEUTRAL', count: neutralFactors.length, color: 'var(--d-mist)' },
  ];
  const maxCount = Math.max(...bars.map(b => b.count), 1);

  return (
    <div className="obs-calibration-card">
      <span className="obs-section-title">Calibration</span>
      <p className="d-caption">Signal distribution across factor universe. Mean confidence = average certainty of directional call.</p>
      <div className="obs-calib-stats" style={{ marginTop: 12 }}>
        <div className="obs-calib-stat">
          <span className="obs-stat-label">Factors</span>
          <span className="obs-stat-value">{factors.length}</span>
        </div>
        {confPct != null && (
          <div className="obs-calib-stat">
            <span className="obs-stat-label">Mean Confidence</span>
            <span className="obs-stat-value">{confPct}%</span>
          </div>
        )}
      </div>
      <div className="obs-calib-bars">
        {bars.map(b => (
          <div key={b.label} className="obs-calib-bar-row">
            <span className="obs-calib-bar-label">{b.label}</span>
            <div className="obs-calib-bar-track">
              <div className="obs-calib-bar-fill" style={{ width: `${(b.count / maxCount) * 100}%`, background: b.color }} />
            </div>
            <span className="obs-calib-bar-count">{b.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Per-market regime blocks ──────────────────────────────────────────────────

const REC_COLOR: Record<string, string> = {
  LONG: 'var(--d-jade)', SHORT: 'var(--d-verm)',
  NO_TRADE: 'var(--d-mist)', HOLD: '#f0a500', RECOMPUTE_CIRCUIT: '#f0a500',
};

function safeLayerDisplay(val: unknown): { text: string; color: string } {
  if (typeof val === 'string') return { text: val, color: 'var(--d-soft)' };
  if (typeof val === 'number') return { text: String(val), color: 'var(--d-soft)' };
  if (val && typeof val === 'object') {
    const o = val as Record<string, unknown>;
    const isAlarm   = o.alarm === true;
    const stat      = typeof o.statistic === 'number' ? ` · ${(o.statistic as number).toFixed(1)}` : '';
    const dir       = typeof o.direction === 'string' ? ` ${String(o.direction)}` : '';
    const upperAlarm = o.upper && typeof o.upper === 'object' && (o.upper as Record<string, unknown>).alarm === true;
    const lowerAlarm = o.lower && typeof o.lower === 'object' && (o.lower as Record<string, unknown>).alarm === true;
    const text = isAlarm
      ? `ALARM${stat}${dir}`
      : upperAlarm ? `⬆ ALARM`
      : lowerAlarm ? `⬇ ALARM`
      : `ok${stat}${dir}`;
    const color = (isAlarm || upperAlarm || lowerAlarm) ? 'var(--d-verm)' : 'var(--d-mist)';
    return { text, color };
  }
  return { text: '—', color: 'var(--d-faint)' };
}

function RegimeMarketBlock({ market, regime }: { market: string; regime: RegimeState }) {
  const rec = regime.recommendation ?? '';
  const recColor = REC_COLOR[rec.toUpperCase()] ?? 'var(--d-mist)';
  const layers = regime.layers ? Object.entries(regime.layers) : [];
  const reasons = regime.reasons ?? [];

  return (
    <div className="d-regime-market-block">
      <div className="d-regime-market-name">{market}</div>
      {rec && (
        <div className="d-regime-rec-large" style={{ color: recColor }}>
          {rec.toUpperCase()}
        </div>
      )}
      {layers.length > 0 && (
        <div className="obs-regime-layers">
          {layers.map(([key, val]) => {
            const { text, color } = safeLayerDisplay(val);
            return (
              <div key={key} className="obs-regime-layer">
                <span className="obs-regime-layer-key">{key}</span>
                <span className="obs-regime-layer-val" style={{ color }}>{text}</span>
              </div>
            );
          })}
        </div>
      )}
      {reasons.length > 0 && (
        <div className="obs-regime-reasons">
          {reasons.slice(0, 3).map((r, i) => (
            <div key={i} className="obs-regime-reason">{r}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function RegimesPanel({ regimes, fallback }: { regimes?: Record<string, RegimeState>; fallback: RegimeState }) {
  const entries = regimes ? Object.entries(regimes) : [];
  if (entries.length === 0 && !fallback.recommendation) {
    return (
      <div>
        <span className="obs-section-title">Regime</span>
        <div className="obs-empty">Awaiting regime data...</div>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div>
        <span className="obs-section-title">Regime</span>
        <p className="d-caption">CUSUM change-point detector. ALARM = statistically significant regime shift. Direction indicates breakout side.</p>
        <div style={{ marginTop: 12 }}>
          <RegimeMarketBlock market={fallback.market ?? 'Market'} regime={fallback} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <span className="obs-section-title">Regime · per market</span>
      <p className="d-caption">CUSUM change-point detector per market. ALARM = statistically significant regime shift detected.</p>
      <div className="d-regimes-grid" style={{ marginTop: 12 }}>
        {entries.map(([mkt, r]) => (
          <RegimeMarketBlock key={mkt} market={mkt} regime={r} />
        ))}
      </div>
    </div>
  );
}

// ── Pipeline strip ────────────────────────────────────────────────────────────

interface PipelineStep {
  label: string;
  key: string;
}

const PIPELINE_STEPS: PipelineStep[] = [
  { key: 'intake',   label: 'Intake' },
  { key: 'gate',     label: 'Gate' },
  { key: 'factors',  label: 'Factors' },
  { key: 'sizing',   label: 'Sizing' },
  { key: 'paper',    label: 'Paper' },
  { key: 'energy',   label: 'Energy ΔU' },
];

function PipelineStrip({
  factors,
  energy,
  markets,
}: {
  factors: FactorSignal[];
  energy: EnergyState;
  markets?: Record<string, MarketSnapshot>;
}) {
  const mktList = markets ? Object.values(markets) : [];
  const anyError = mktList.some(m => Boolean(m.error));
  const gatePass = mktList.some(m => m.qualityGate?.pass === true);

  const stepVals: Record<string, { val: string; active: boolean; error?: boolean }> = {
    intake:  { val: `${mktList.length} mkts`, active: mktList.length > 0 },
    gate:    { val: gatePass ? 'PASS' : anyError ? 'ERROR' : '—', active: gatePass, error: anyError },
    factors: { val: `${factors.length} signals`, active: factors.length > 0 },
    sizing:  { val: 'adaptive', active: true },
    paper:   { val: mktList.some(m => (m.pnl ?? 0) !== 0) ? 'active' : 'idle', active: true },
    energy:  {
      val: energy.deltaU != null ? (energy.deltaU >= 0 ? '+' : '') + energy.deltaU.toFixed(3) : '—',
      active: energy.accept === true,
      error: energy.accept === false,
    },
  };

  return (
    <div className="d-pipeline-strip">
      {PIPELINE_STEPS.map(step => {
        const sv = stepVals[step.key];
        return (
          <div
            key={step.key}
            className={`d-pipeline-step ${sv.active ? 'active' : ''} ${sv.error ? 'error' : ''}`}
          >
            <span className="d-pipeline-step-label">{step.label}</span>
            <span className="d-pipeline-step-val">{sv.val}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Factor Circuit panel ──────────────────────────────────────────────────────

function FactorCircuitCard({ market, circuit }: { market: string; circuit: CircuitState }) {
  const hasAdvantage = circuit.ratio != null && circuit.ratio > 1;
  const commuting    = circuit.allCommute === true || (circuit.ratio != null && circuit.ratio === 1);
  const degenerate   = circuit.degenerate;

  const ratioColor = hasAdvantage ? 'var(--d-jade)' : 'var(--d-mist)';
  const ratioLabel = degenerate
    ? 'degenerate'
    : commuting
    ? 'commuting — no order edge'
    : hasAdvantage && circuit.ratio != null
    ? `${circuit.ratio.toFixed(2)}× order advantage`
    : '—';

  const ordering = circuit.bestOrdering ?? [];
  const ids      = circuit.factorIds ?? [];

  return (
    <div className="obs-circuit-card">
      <div className="obs-circuit-header">
        <span className="obs-circuit-market">{market}</span>
        {circuit.injected && (
          <span className="obs-circuit-chip obs-circuit-chip--injected">REAL VECTORS</span>
        )}
      </div>
      <div className="obs-circuit-ratio" style={{ color: ratioColor }}>{ratioLabel}</div>
      {!commuting && !degenerate && ordering.length > 0 && (
        <div className="obs-circuit-ordering">
          <span className="obs-circuit-ordering-label">Best order</span>
          <div className="obs-circuit-ordering-seq">
            {ordering.map((idx, i) => (
              <span key={i} className="obs-circuit-ordering-item">
                {ids[idx] != null
                  ? ids[idx].replace(/^(obs-|perp-|social-)/, '').slice(0, 14)
                  : `#${idx}`}
                {i < ordering.length - 1 && <span className="obs-circuit-ordering-arrow">→</span>}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FactorCircuitPanel({ markets }: { markets: Record<string, MarketSnapshot> }) {
  const marketsWithCircuit = Object.entries(markets).filter(([, snap]) => snap.circuit != null);
  if (marketsWithCircuit.length === 0) {
    return (
      <div className="obs-circuit-panel">
        <span className="obs-section-title">Factor Circuit</span>
        <p className="d-caption">Non-commutative factor ordering: ratio &gt;1 means sequencing factors in the shown order beats random ordering by (ratio−1). Real Vectors = computed on actual return data.</p>
        <div className="obs-empty" style={{ marginTop: 8 }}>Awaiting circuit data...</div>
      </div>
    );
  }
  return (
    <div className="obs-circuit-panel">
      <span className="obs-section-title">Factor Circuit · per market</span>
      <p className="d-caption">Non-commutative factor ordering. Ratio &gt;1 = sequencing wins. Real Vectors = computed on actual return data, not metadata.</p>
      <div className="obs-circuit-grid" style={{ marginTop: 12 }}>
        {marketsWithCircuit.map(([market, snap]) =>
          snap.circuit != null ? (
            <FactorCircuitCard key={market} market={market} circuit={snap.circuit} />
          ) : null,
        )}
      </div>
    </div>
  );
}

// ── Factor Signals table ──────────────────────────────────────────────────────

function overlaySource(f: FactorSignal): 'perp' | 'social' | null {
  if (f.source === 'perp' || f.factorId?.startsWith('perp-')) return 'perp';
  if (f.source === 'social' || f.factorId?.startsWith('social-')) return 'social';
  return null;
}

function OverlayChip({ source }: { source: 'perp' | 'social' }) {
  return (
    <span className={`obs-overlay-chip obs-overlay-chip--${source}`} title="Advisory overlay — not paper-traded">
      {source === 'perp' ? 'PERP' : 'SOCIAL'}
    </span>
  );
}

function FactorTable({ factors }: { factors: FactorSignal[] }) {
  const sideColor = (side: string) =>
    side === 'long' ? 'var(--d-jade)' : side === 'short' ? 'var(--d-verm)' : 'var(--d-mist)';

  if (factors.length === 0) {
    return (
      <div className="obs-factor-card">
        <span className="obs-section-title">Factor Signals</span>
        <p className="d-caption">Price signals drive paper positions. Perp/Social overlays are advisory only — not paper-traded.</p>
        <div className="obs-empty" style={{ marginTop: 8 }}>No factor signals yet</div>
      </div>
    );
  }

  return (
    <div className="obs-factor-card">
      <span className="obs-section-title">Factor Signals</span>
      <p className="d-caption" style={{ marginBottom: 14 }}>Price signals drive paper positions. Perp/Social overlays are advisory only — not paper-traded.</p>
      <div className="obs-factor-scroll">
        <table className="obs-table">
          <thead>
            <tr>
              <th>Factor</th>
              <th>Type</th>
              <th>Side</th>
              <th>Value</th>
              <th>Conf</th>
              <th>ΔU</th>
              <th>Market</th>
            </tr>
          </thead>
          <tbody>
            {factors.slice(0, 20).map(f => {
              const src = overlaySource(f);
              const isOverlay = src !== null;
              return (
                <tr key={f.factorId} className={isOverlay ? 'obs-factor-row--overlay' : undefined}>
                  <td className="obs-factor-id">{f.factorId}</td>
                  <td>
                    {isOverlay ? (
                      <div className="obs-factor-type-cell">
                        <OverlayChip source={src!} />
                        <span className="obs-factor-advisory">advisory</span>
                      </div>
                    ) : (
                      <span className="obs-factor-type-price">price</span>
                    )}
                    {src === 'social' && f.sampleCount != null && (
                      <span className="obs-factor-sample-count">n={f.sampleCount}</span>
                    )}
                  </td>
                  <td style={{ color: sideColor(f.side) }}>{f.side.toUpperCase()}</td>
                  <td>{typeof f.value === 'number' ? f.value.toFixed(4) : '—'}</td>
                  <td>{typeof f.confidence === 'number' ? `${(f.confidence * 100).toFixed(1)}%` : '—'}</td>
                  <td className={f.deltaU != null && f.deltaU >= 0 ? 'obs-green' : 'obs-red'}>
                    {f.deltaU != null ? (f.deltaU >= 0 ? '+' : '') + f.deltaU.toFixed(4) : '—'}
                  </td>
                  <td>{f.market ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Mechanism Tab ─────────────────────────────────────────────────────────────

export default function MechanismTab({ factors, regime, regimes, energy, markets }: Props) {
  return (
    <div className="obs-tab-content">
      {/* Pipeline overview strip */}
      <div>
        <span className="obs-section-title">Pipeline</span>
        <p className="d-caption" style={{ marginBottom: 8 }}>Live state across the full signal pipeline from market intake to energy gate verdict.</p>
        <PipelineStrip factors={factors} energy={energy} markets={markets} />
      </div>

      {/* Core panels: energy + calibration */}
      <div className="obs-mechanism-grid">
        <EnergyGauge energy={energy} />
        <CalibrationPanel factors={factors} />
        <div style={{ display: 'none' }} />
      </div>

      {/* Per-market regimes */}
      <RegimesPanel regimes={regimes} fallback={regime} />

      {/* Factor Circuit */}
      {markets && Object.keys(markets).length > 0 && (
        <FactorCircuitPanel markets={markets} />
      )}

      {/* Factor table */}
      <FactorTable factors={factors} />
    </div>
  );
}

/**
 * MechanismTab.tsx
 *
 * Mechanism tab — factor ΔU signals, regime timeline, Brier/calibration,
 * energy ΔU gauge. All SVG-based, zero new deps.
 */

import { useId } from 'react';
import type { CircuitState, EnergyState, FactorSignal, MarketSnapshot, RegimeState } from '../../hooks/useObservatoryStream';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  factors: FactorSignal[];
  regime: RegimeState;
  energy: EnergyState;
  /** All market snapshots — used for the per-market Factor Circuit panel. */
  markets?: Record<string, MarketSnapshot>;
}

// ── Energy ΔU Gauge (SVG arc) ─────────────────────────────────────────────────

function EnergyGauge({ energy }: { energy: EnergyState }) {
  const gradId = useId();
  const raw = energy.deltaU ?? 0;
  // Clamp to [-1, 1], map to [0, 1] for gauge fill
  const clamped = Math.max(-1, Math.min(1, raw));
  const normalised = (clamped + 1) / 2; // 0→negative, 0.5→neutral, 1→positive

  // SVG arc params — half-circle gauge
  const cx = 80;
  const cy = 80;
  const r = 60;
  const startAngle = Math.PI; // left
  const endAngle = 0;          // right
  const sweepAngle = endAngle - startAngle; // -π (going counter-clockwise is positive angle)
  // Arc for the fill
  const fillAngle = startAngle + normalised * Math.PI; // ranges from π (left) to 0 (right)

  function polarToXY(angle: number, radius: number) {
    return {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    };
  }

  const bgStart = polarToXY(startAngle, r);
  const bgEnd = polarToXY(endAngle, r);

  const fillEnd = polarToXY(fillAngle, r);
  const fillLargeArc = Math.abs(fillAngle - startAngle) > Math.PI ? 1 : 0;

  const gaugeColor = raw < -0.3 ? '#ef4444' : raw > 0.3 ? '#22c55e' : '#f59e0b';

  return (
    <div className="obs-gauge-card">
      <div className="obs-section-title">Energy ΔU</div>
      <div className="obs-gauge-wrap">
        <svg width="160" height="90" viewBox="0 0 160 90" aria-label={`Energy ΔU: ${raw.toFixed(3)}`}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#ef4444" />
              <stop offset="50%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#22c55e" />
            </linearGradient>
          </defs>
          {/* Background track */}
          <path
            d={`M ${bgStart.x} ${bgStart.y} A ${r} ${r} 0 0 1 ${bgEnd.x} ${bgEnd.y}`}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="10"
            strokeLinecap="round"
          />
          {/* Fill arc */}
          {normalised > 0.01 && (
            <path
              d={`M ${bgStart.x} ${bgStart.y} A ${r} ${r} 0 ${fillLargeArc} 1 ${fillEnd.x} ${fillEnd.y}`}
              fill="none"
              stroke={gaugeColor}
              strokeWidth="10"
              strokeLinecap="round"
              opacity="0.9"
            />
          )}
          {/* Needle dot */}
          <circle cx={fillEnd.x} cy={fillEnd.y} r="5" fill={gaugeColor} />
        </svg>
        <div className="obs-gauge-value" style={{ color: gaugeColor }}>
          {raw >= 0 ? '+' : ''}{raw.toFixed(4)}
        </div>
        <div className="obs-gauge-label">
          {energy.accept === true ? 'ACCEPT' : energy.accept === false ? 'REJECT' : 'ADVISORY'}
        </div>
        {energy.reason && (
          <div className="obs-gauge-reason">{energy.reason}</div>
        )}
      </div>
    </div>
  );
}

// ── Brier / Calibration panel ─────────────────────────────────────────────────

function CalibrationPanel({ factors }: { factors: FactorSignal[] }) {
  // Derive a naive calibration summary from available factor confidence scores
  const longFactors = factors.filter(f => f.side === 'long');
  const shortFactors = factors.filter(f => f.side === 'short');
  const neutralFactors = factors.filter(f => f.side === 'neutral');

  const avgConf = factors.length > 0
    ? factors.reduce((s, f) => s + (f.confidence ?? 0), 0) / factors.length
    : null;

  // Brier-like display: if we had outcomes we'd compute proper Brier score.
  // Here we display the mean confidence as a calibration proxy.
  const confPct = avgConf != null ? (avgConf * 100).toFixed(1) : null;

  const bars: { label: string; count: number; color: string }[] = [
    { label: 'LONG', count: longFactors.length, color: '#22c55e' },
    { label: 'SHORT', count: shortFactors.length, color: '#ef4444' },
    { label: 'NEUTRAL', count: neutralFactors.length, color: '#94a3b8' },
  ];
  const maxCount = Math.max(...bars.map(b => b.count), 1);

  return (
    <div className="obs-calibration-card">
      <div className="obs-section-title">Calibration</div>
      <div className="obs-calib-stats">
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
              <div
                className="obs-calib-bar-fill"
                style={{
                  width: `${(b.count / maxCount) * 100}%`,
                  background: b.color,
                }}
              />
            </div>
            <span className="obs-calib-bar-count">{b.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Regime Timeline ───────────────────────────────────────────────────────────

function RegimeTimeline({ regime }: { regime: RegimeState }) {
  const layers = regime.layers ? Object.entries(regime.layers) : [];
  const reasons = regime.reasons ?? [];

  const recColor: Record<string, string> = {
    LONG: '#22c55e',
    SHORT: '#ef4444',
    NO_TRADE: '#94a3b8',
    HOLD: '#f59e0b',
    // BUG-4 fix: RECOMPUTE_CIRCUIT is a distinct warning state — amber, not grey
    RECOMPUTE_CIRCUIT: '#f59e0b',
  };
  const rec = (regime.recommendation ?? '').toUpperCase();
  const color = recColor[rec] ?? '#94a3b8';

  return (
    <div className="obs-regime-card">
      <div className="obs-section-title">Regime</div>
      {regime.recommendation ? (
        <>
          <div className="obs-regime-rec" style={{ color }}>
            {rec}
          </div>
          {regime.market && (
            <div className="obs-regime-market">{regime.market}</div>
          )}
          {layers.length > 0 && (
            <div className="obs-regime-layers">
              {layers.map(([key, val]) => {
                // layer values are structured objects (e.g. { alarm, statistic, ... }) — NOT strings.
                const display =
                  typeof val === 'string' ? val
                  : val && typeof val === 'object' && 'alarm' in (val as object)
                    ? ((val as { alarm?: boolean; statistic?: number }).alarm
                        ? `ALARM${typeof (val as { statistic?: number }).statistic === 'number' ? ` · ${(val as { statistic: number }).statistic.toFixed(1)}` : ''}`
                        : 'ok')
                    : typeof val === 'number' ? String(val) : '—';
                const colorKey = display.split(' ')[0].toUpperCase();
                return (
                  <div key={key} className="obs-regime-layer">
                    <span className="obs-regime-layer-key">{key}</span>
                    <span className="obs-regime-layer-val" style={{ color: colorKey === 'ALARM' ? '#e8453a' : recColor[colorKey] ?? '#94a3b8' }}>
                      {display}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          {reasons.length > 0 && (
            <div className="obs-regime-reasons">
              {reasons.map((r, i) => (
                <div key={i} className="obs-regime-reason">{r}</div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="obs-empty">Awaiting regime data...</div>
      )}
    </div>
  );
}

// ── Factor Circuit panel ──────────────────────────────────────────────────────

/**
 * Displays the quantum factor-circuit ordering state for a single market.
 * - ratio > 1: non-commutative order advantage exists → show ratio + ordering sequence
 * - ratio == 1 / allCommute == true: no ordering advantage
 * - injected flag indicates real return vectors (not metadata-only)
 */
function FactorCircuitCard({ market, circuit }: { market: string; circuit: CircuitState }) {
  const hasAdvantage = circuit.ratio != null && circuit.ratio > 1;
  const commuting    = circuit.allCommute === true || (circuit.ratio != null && circuit.ratio === 1);
  const degenerate   = circuit.degenerate;

  const ratioColor = hasAdvantage ? '#22c55e' : '#94a3b8';
  const ratioLabel = degenerate
    ? 'degenerate'
    : commuting
    ? 'commuting — no order edge'
    : hasAdvantage && circuit.ratio != null
    ? `${circuit.ratio.toFixed(2)}× order advantage`
    : '—';

  // Render bestOrdering as sequence of factorId abbreviations (or indices as fallback)
  const ordering = circuit.bestOrdering ?? [];
  const ids       = circuit.factorIds ?? [];

  return (
    <div className="obs-circuit-card">
      <div className="obs-circuit-header">
        <span className="obs-circuit-market">{market}</span>
        {circuit.injected && (
          <span className="obs-circuit-chip obs-circuit-chip--injected">REAL VECTORS</span>
        )}
      </div>

      <div className="obs-circuit-ratio" style={{ color: ratioColor }}>
        {ratioLabel}
      </div>

      {!commuting && !degenerate && ordering.length > 0 && (
        <div className="obs-circuit-ordering">
          <span className="obs-circuit-ordering-label">Best order</span>
          <div className="obs-circuit-ordering-seq">
            {ordering.map((idx, i) => (
              <span key={i} className="obs-circuit-ordering-item">
                {ids[idx] != null
                  ? ids[idx].replace(/^(obs-|perp-|social-)/, '').slice(0, 14)
                  : `#${idx}`}
                {i < ordering.length - 1 && (
                  <span className="obs-circuit-ordering-arrow">→</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FactorCircuitPanel({ markets }: { markets: Record<string, MarketSnapshot> }) {
  const marketsWithCircuit = Object.entries(markets).filter(
    ([, snap]) => snap.circuit != null,
  );

  if (marketsWithCircuit.length === 0) {
    return (
      <div className="obs-circuit-panel">
        <div className="obs-section-title">Factor Circuit</div>
        <div className="obs-empty">Awaiting circuit data...</div>
      </div>
    );
  }

  return (
    <div className="obs-circuit-panel">
      <div className="obs-section-title">Factor Circuit</div>
      <div className="obs-circuit-grid">
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

/**
 * Returns true if the factor is a price-driving signal (paper-traded).
 * perp and social signals are overlay-only (advisory, NOT paper-traded).
 */
function isPriceSignal(f: FactorSignal): boolean {
  if (f.source === 'perp' || f.source === 'social') return false;
  // Legacy heuristic: factorId prefix also identifies overlay signals even
  // when `source` isn't explicitly set (forward-compat with older server versions).
  const id = f.factorId ?? '';
  if (id.startsWith('perp-') || id.startsWith('social-')) return false;
  return true;
}

function OverlayChip({ source }: { source: 'perp' | 'social' }) {
  return (
    <span
      className={`obs-overlay-chip obs-overlay-chip--${source}`}
      title="Advisory overlay — not paper-traded"
    >
      {source === 'perp' ? 'PERP' : 'SOCIAL'}
    </span>
  );
}

function FactorTable({ factors }: { factors: FactorSignal[] }) {
  if (factors.length === 0) {
    return (
      <div className="obs-factor-card">
        <div className="obs-section-title">Factor Signals</div>
        <div className="obs-empty">No factor signals yet</div>
      </div>
    );
  }

  const sideColor = (side: string) =>
    side === 'long' ? '#22c55e' : side === 'short' ? '#ef4444' : '#94a3b8';

  // Determine overlay source from explicit field OR factorId prefix
  function overlaySource(f: FactorSignal): 'perp' | 'social' | null {
    if (f.source === 'perp' || f.factorId?.startsWith('perp-')) return 'perp';
    if (f.source === 'social' || f.factorId?.startsWith('social-')) return 'social';
    return null;
  }

  return (
    <div className="obs-factor-card">
      <div className="obs-section-title">Factor Signals</div>
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
              const source = overlaySource(f);
              const isOverlay = source !== null;
              return (
                <tr
                  key={f.factorId}
                  className={isOverlay ? 'obs-factor-row--overlay' : undefined}
                >
                  <td className="obs-factor-id">{f.factorId}</td>
                  <td>
                    {isOverlay ? (
                      <div className="obs-factor-type-cell">
                        <OverlayChip source={source!} />
                        <span className="obs-factor-advisory">advisory</span>
                      </div>
                    ) : (
                      <span className="obs-factor-type-price">price</span>
                    )}
                    {source === 'social' && f.sampleCount != null && (
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

export default function MechanismTab({ factors, regime, energy, markets }: Props) {
  return (
    <div className="obs-tab-content">
      <div className="obs-mechanism-grid">
        <EnergyGauge energy={energy} />
        <RegimeTimeline regime={regime} />
        <CalibrationPanel factors={factors} />
      </div>
      {markets && Object.keys(markets).length > 0 && (
        <FactorCircuitPanel markets={markets} />
      )}
      <FactorTable factors={factors} />
    </div>
  );
}

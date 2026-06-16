/**
 * MechanismTab.tsx
 *
 * Mechanism tab — factor ΔU signals, regime timeline, Brier/calibration,
 * energy ΔU gauge. All SVG-based, zero new deps.
 */

import { useId } from 'react';
import type { EnergyState, FactorSignal, RegimeState } from '../../hooks/useObservatoryStream';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  factors: FactorSignal[];
  regime: RegimeState;
  energy: EnergyState;
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
              {layers.map(([key, val]) => (
                <div key={key} className="obs-regime-layer">
                  <span className="obs-regime-layer-key">{key}</span>
                  <span className="obs-regime-layer-val" style={{ color: recColor[(val as string).toUpperCase()] ?? '#94a3b8' }}>
                    {val as string}
                  </span>
                </div>
              ))}
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

// ── Factor Signals table ──────────────────────────────────────────────────────

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

  return (
    <div className="obs-factor-card">
      <div className="obs-section-title">Factor Signals</div>
      <div className="obs-factor-scroll">
        <table className="obs-table">
          <thead>
            <tr>
              <th>Factor</th>
              <th>Side</th>
              <th>Value</th>
              <th>Conf</th>
              <th>ΔU</th>
              <th>Market</th>
            </tr>
          </thead>
          <tbody>
            {factors.slice(0, 20).map(f => (
              <tr key={f.factorId}>
                <td className="obs-factor-id">{f.factorId}</td>
                <td style={{ color: sideColor(f.side) }}>{f.side.toUpperCase()}</td>
                <td>{typeof f.value === 'number' ? f.value.toFixed(4) : '—'}</td>
                <td>{typeof f.confidence === 'number' ? `${(f.confidence * 100).toFixed(1)}%` : '—'}</td>
                <td className={f.deltaU != null && f.deltaU >= 0 ? 'obs-green' : 'obs-red'}>
                  {f.deltaU != null ? (f.deltaU >= 0 ? '+' : '') + f.deltaU.toFixed(4) : '—'}
                </td>
                <td>{f.market ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Mechanism Tab ─────────────────────────────────────────────────────────────

export default function MechanismTab({ factors, regime, energy }: Props) {
  return (
    <div className="obs-tab-content">
      <div className="obs-mechanism-grid">
        <EnergyGauge energy={energy} />
        <RegimeTimeline regime={regime} />
        <CalibrationPanel factors={factors} />
      </div>
      <FactorTable factors={factors} />
    </div>
  );
}

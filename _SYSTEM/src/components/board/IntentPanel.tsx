/**
 * IntentPanel.tsx — Trade Intent + Open Positions + Real Account panel.
 * Wired to real signal/paper data. Account shows VIEW-ONLY.
 */

import type { MarketData, PaperPosition, AccountResponse } from './api';

interface Props {
  market: string;
  marketData: MarketData | null;
  allPositions: PaperPosition[];
  account?: AccountResponse | null;
}

function fmtUSD(v: number, decimals = 2): string {
  if (Math.abs(v) >= 1000) return '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return '$' + v.toFixed(decimals);
}

function fmtPrice(p: number): string {
  if (p < 0.01) return '$' + p.toFixed(6);
  if (p < 1) return '$' + p.toFixed(4);
  if (p < 100) return '$' + p.toFixed(2);
  return '$' + p.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function fmtAge(ts: number): string {
  const diff = Math.floor(Date.now() / 1000 - ts);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
  return `${Math.floor(diff / 86400)}d ${Math.floor((diff % 86400) / 3600)}h`;
}

export default function IntentPanel({ market, marketData, allPositions, account }: Props) {
  const signals = marketData?.signals ?? [];
  // Primary signal: prefer main momentum (no source), fall back to first
  const primarySignal = signals.find(s => !s.source) ?? signals[0] ?? null;

  const side = primarySignal?.side ?? 'neutral';
  const conf = primarySignal ? (primarySignal.confidence * 100).toFixed(0) : '—';
  const baseSym = market.replace('-USD', '');

  // filter out poly-* markets from positions display
  const visiblePositions = allPositions.filter(p => !p.instrument.startsWith('poly-'));

  return (
    <div className="bb-intent-panel" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="bb-panel-head">
        <span className="bb-eyebrow">Trade Intent</span>
        <span className="bb-panel-sub">{baseSym} · {primarySignal ? 'active signal' : 'no signal'}</span>
      </div>

      {/* Signal banner */}
      <div className={`bb-intent-signal${side === 'short' ? ' short-signal' : ''}`}>
        <div className={`bb-intent-side ${side}`}>
          {side === 'long' ? 'LONG' : side === 'short' ? 'SHORT' : 'FLAT'}
        </div>
        <div className="bb-intent-conf">
          <span className="bb-intent-conf-label">Conviction</span>
          <span className="bb-intent-conf-val">{conf}%</span>
        </div>
        {primarySignal && (
          <span className="bb-intent-rr">
            {primarySignal.factorId.replace(`obs-momentum-${market}`, 'momentum').replace(market, '')}
          </span>
        )}
      </div>

      {/* Overlay signals (social, perp) */}
      {signals.filter(s => s.source).map(s => (
        <div key={s.factorId} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 9, color: 'var(--mist)' }}>
          <span style={{ color: s.side === 'long' ? 'var(--long)' : 'var(--short)', fontWeight: 600, textTransform: 'uppercase', fontSize: 8 }}>{s.side}</span>
          <span>{s.source} · {(s.confidence * 100).toFixed(0)}%</span>
          {s.sampleCount && <span>({s.sampleCount} samples)</span>}
        </div>
      ))}

      {/* Intent grid — populated from signal/paper position data */}
      {primarySignal && marketData?.paperPositions?.[0] ? (() => {
        const pos = marketData.paperPositions![0];
        return (
          <div className="bb-intent-grid">
            <div className="bb-intent-cell">
              <span className="bb-intent-label">Entry</span>
              <span className="bb-intent-val">{fmtPrice(pos.avgEntryPrice)} <span className="sub">paper</span></span>
            </div>
            <div className="bb-intent-cell">
              <span className="bb-intent-label">Current</span>
              <span className="bb-intent-val">{pos.currentPrice ? fmtPrice(pos.currentPrice) : '—'}</span>
            </div>
            <div className="bb-intent-cell">
              <span className="bb-intent-label">Quantity</span>
              <span className="bb-intent-val">{pos.quantity.toFixed(4)} <span className="sub">{baseSym}</span></span>
            </div>
            <div className="bb-intent-cell">
              <span className="bb-intent-label">Entries</span>
              <span className="bb-intent-val dim">{pos.entryCount ?? 1}×</span>
            </div>
          </div>
        );
      })() : (
        <div className="bb-intent-grid">
          <div className="bb-intent-cell">
            <span className="bb-intent-label">Signal</span>
            <span className="bb-intent-val dim">{primarySignal ? 'active' : 'none'}</span>
          </div>
          <div className="bb-intent-cell">
            <span className="bb-intent-label">Factor val</span>
            <span className="bb-intent-val dim">{primarySignal ? primarySignal.value.toFixed(4) : '—'}</span>
          </div>
        </div>
      )}

      <div className="bb-div" />

      {/* Open Positions table */}
      <div className="bb-sub-head">
        <span className="bb-sub-eyebrow">Open Positions</span>
        <span className="bb-panel-sub">paper</span>
      </div>

      {visiblePositions.length === 0 ? (
        <div className="bb-empty">No open positions</div>
      ) : (
        <table className="bb-pos-table">
          <thead>
            <tr>
              <th>Sym</th>
              <th>Side</th>
              <th>Entry</th>
              <th className="r">Cur</th>
              <th className="r">P&amp;L</th>
              <th className="r">Age</th>
            </tr>
          </thead>
          <tbody>
            {visiblePositions.map(pos => {
              const pnl = pos.unrealizedPnl ?? 0;
              const pnlCls = pnl > 0 ? 'pos' : pnl < 0 ? 'neg' : 'flat';
              const sideCls = pos.side === 'long' ? 'side-l' : 'side-s';
              const sideLabel = pos.side === 'long' ? 'L' : 'S';
              const sym = pos.instrument.replace('-USD', '');
              const pnlStr = pnl > 0 ? '+' + fmtUSD(pnl) : pnl < 0 ? fmtUSD(pnl) : '—';
              const age = pos.openedTs ? fmtAge(pos.openedTs) : '—';
              return (
                <tr key={pos.instrument}>
                  <td className="sym">{sym}</td>
                  <td className={sideCls}>{sideLabel}</td>
                  <td>{fmtPrice(pos.avgEntryPrice)}</td>
                  <td className="r">{pos.currentPrice ? fmtPrice(pos.currentPrice) : '—'}</td>
                  <td className={`r pnl ${pnlCls}`}>{pnlStr}</td>
                  <td className="r" style={{ color: 'var(--mist)' }}>{age}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <div className="bb-div" />

      {/* Real Account (VIEW-ONLY) */}
      <div className="bb-sub-head">
        <span className="bb-sub-eyebrow">Real Account</span>
        <span className="bb-viewonly">VIEW-ONLY</span>
      </div>
      {account?.connected ? (
        <div className="bb-acct">
          <div className="bb-acct-row head"><span>Asset</span><span>Amount</span><span className="r">USD</span></div>
          {(account.holdings ?? []).slice(0, 6).map((h) => (
            <div key={h.currency} className="bb-acct-row">
              <span className="bb-acct-cur">{h.currency}</span>
              <span className="bb-acct-amt">{h.total}</span>
              <span className="bb-acct-val">{h.priced ? fmtUSD(h.usdValue ?? 0) : '—'}</span>
            </div>
          ))}
          <div className="bb-acct-total">
            <span className="bb-acct-total-label">Real equity · {account.accountCount ?? 0} accts</span>
            <span className="bb-acct-val">{fmtUSD(account.realEquityUsd ?? 0)}</span>
          </div>
        </div>
      ) : (
        <div className="bb-acct-pending">
          {account?.advisory === 'no-key'
            ? 'Connect Coinbase API key (view-only) to show real balances.'
            : (account?.advisory ?? 'Connecting to view-only account…')}
        </div>
      )}
    </div>
  );
}

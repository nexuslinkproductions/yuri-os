/**
 * ObservatoryPage.tsx
 *
 * YURI Observatory — Markets | Mechanism | Mind tabs.
 * Deck design language: navy/cyan/ice/jade/vermilion.
 * Live global ticker header, number-flow on value change.
 */

import { lazy, Suspense, useState, useRef, useEffect } from 'react';
import { useObservatoryStream } from '../hooks/useObservatoryStream';
import '../components/observatory/observatory.css';

const MarketsTab   = lazy(() => import('../components/observatory/MarketsTab'));
const MechanismTab = lazy(() => import('../components/observatory/MechanismTab'));
const MindTab      = lazy(() => import('../components/observatory/MindTab'));

type TabId = 'markets' | 'mechanism' | 'mind';

const TABS: { id: TabId; label: string }[] = [
  { id: 'markets',   label: 'Markets'   },
  { id: 'mechanism', label: 'Mechanism' },
  { id: 'mind',      label: 'Mind'      },
];

function TabFallback() {
  return (
    <div className="obs-loading" style={{ padding: '40px 0' }}>
      <span className="obs-spinner" />
      <span>Loading...</span>
    </div>
  );
}

/** Stateless numeric display with pulse animation on change */
function LiveVal({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef<string>(value);

  useEffect(() => {
    if (value !== prev.current && ref.current) {
      prev.current = value;
      ref.current.classList.remove('d-pulse-anim');
      void ref.current.offsetWidth; // reflow
      ref.current.classList.add('d-pulse-anim');
      const t = setTimeout(() => ref.current?.classList.remove('d-pulse-anim'), 900);
      return () => clearTimeout(t);
    }
    prev.current = value;
  }, [value]);

  return <span ref={ref} className={`d-ticker-val ${className ?? ''}`}>{value}</span>;
}

function fmtUptime(sec?: number): string {
  if (sec == null) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtAge(ts?: number): string {
  if (ts == null) return '—';
  const diff = Math.floor((Date.now() / 1000) - ts);
  if (diff < 60) return `${diff}s ago`;
  return `${Math.floor(diff / 60)}m ago`;
}

function fmtPnl(v?: number): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
  return (v >= 0 ? '+$' : '-$') + Math.abs(v).toFixed(2);
}

export default function ObservatoryPage() {
  const [activeTab, setActiveTab] = useState<TabId>('markets');
  const obs = useObservatoryStream();

  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick(n => n + 1), 5000);
    return () => clearInterval(id);
  }, []);

  const cycleStr    = String(obs.health.cycleCount ?? 0);
  const ageStr      = fmtAge(obs.health.lastCycle ?? obs.health.ts);
  const uptimeStr   = fmtUptime(obs.health.uptime);
  const mktCount    = String(Object.keys(obs.markets).length);
  const totalPnl    = obs.paper.pnl ?? 0;
  const pnlStr      = fmtPnl(obs.paper.pnl);
  const ddStr       = obs.paper.drawdown != null
    ? `${(obs.paper.drawdown * 100).toFixed(2)}%`
    : '—';

  return (
    <div className="obs-root">
      {/* ── Live global ticker header ── */}
      <div className="d-ticker-bar">
        <div className="d-ticker-left">
          <span className="d-ticker-brand">YURI · OBS</span>
          <div className={`d-live-badge ${obs.connected ? 'connected' : ''}`}>
            <span className={`d-live-dot ${obs.connected ? '' : 'disconnected'}`} />
            <span>{obs.connected ? 'LIVE' : 'RECONNECTING'}</span>
          </div>
        </div>

        <div className="d-ticker-items">
          <div className="d-ticker-item">
            <span className="d-ticker-label">Cycle</span>
            <LiveVal value={cycleStr} className="cyan" />
          </div>
          <div className="d-ticker-item">
            <span className="d-ticker-label">Last tick</span>
            <LiveVal value={ageStr} />
          </div>
          <div className="d-ticker-item">
            <span className="d-ticker-label">Uptime</span>
            <LiveVal value={uptimeStr} />
          </div>
          <div className="d-ticker-item">
            <span className="d-ticker-label">Markets</span>
            <LiveVal value={mktCount} />
          </div>
          <div className="d-ticker-item">
            <span className="d-ticker-label">Paper P&amp;L</span>
            <LiveVal value={pnlStr} className={totalPnl >= 0 ? 'jade' : 'verm'} />
          </div>
          <div className="d-ticker-item">
            <span className="d-ticker-label">Max DD</span>
            <LiveVal value={ddStr} className="verm" />
          </div>
        </div>
      </div>

      <div className="obs-page-body">
        {/* ── Tabs ── */}
        <nav className="obs-tabs-bar" role="tablist" aria-label="Observatory tabs">
          {TABS.map(tab => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              className="obs-tab-btn"
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* ── Tab panels ── */}
        <Suspense fallback={<TabFallback />}>
          {activeTab === 'markets' && (
            <MarketsTab markets={obs.markets} paper={obs.paper} regimes={obs.regimes} />
          )}
          {activeTab === 'mechanism' && (
            <MechanismTab
              factors={obs.factors}
              regime={obs.regime}
              regimes={obs.regimes}
              energy={obs.energy}
              markets={obs.markets}
            />
          )}
          {activeTab === 'mind' && (
            <MindTab energy={obs.energy} factors={obs.factors} />
          )}
        </Suspense>
      </div>
    </div>
  );
}

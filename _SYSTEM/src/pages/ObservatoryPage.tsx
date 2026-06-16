/**
 * ObservatoryPage.tsx
 *
 * YURI Observatory — Markets | Mechanism | Mind tabs.
 * Self-contained CSS, no HUD/Kagami tokens.
 */

import { lazy, Suspense, useState } from 'react';
import { useObservatoryStream } from '../hooks/useObservatoryStream';
import '../components/observatory/observatory.css';

// Tabs loaded lazily so MindTab's scene imports don't block the initial load
const MarketsTab   = lazy(() => import('../components/observatory/MarketsTab'));
const MechanismTab = lazy(() => import('../components/observatory/MechanismTab'));
const MindTab      = lazy(() => import('../components/observatory/MindTab'));

// ── Tab config ────────────────────────────────────────────────────────────────

type TabId = 'markets' | 'mechanism' | 'mind';

const TABS: { id: TabId; label: string }[] = [
  { id: 'markets',   label: 'Markets'   },
  { id: 'mechanism', label: 'Mechanism' },
  { id: 'mind',      label: 'Mind'      },
];

// ── Connection badge ──────────────────────────────────────────────────────────

function ConnBadge({ connected }: { connected: boolean }) {
  return (
    <div className="obs-conn-badge" data-connected={String(connected)}>
      <span className="obs-conn-dot" />
      <span>{connected ? 'LIVE' : 'RECONNECTING'}</span>
    </div>
  );
}

// ── Tab loading fallback ──────────────────────────────────────────────────────

function TabFallback() {
  return (
    <div className="obs-loading" style={{ padding: '40px 0' }}>
      <span className="obs-spinner" />
      <span>Loading...</span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ObservatoryPage() {
  const [activeTab, setActiveTab] = useState<TabId>('markets');
  const obs = useObservatoryStream();

  return (
    <div className="obs-root">
      {/* Header */}
      <header className="obs-header">
        <div>
          <h1 className="obs-title">YURI Observatory</h1>
          <p className="obs-subtitle">
            {obs.loading
              ? 'CONNECTING...'
              : `Cycle ${obs.health.cycleCount ?? 0} · ${Object.keys(obs.markets).length} markets`}
          </p>
        </div>
        <ConnBadge connected={obs.connected} />
      </header>

      {/* Tabs */}
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

      {/* Tab panels */}
      <Suspense fallback={<TabFallback />}>
        {activeTab === 'markets' && (
          <MarketsTab markets={obs.markets} paper={obs.paper} />
        )}
        {activeTab === 'mechanism' && (
          <MechanismTab
            factors={obs.factors}
            regime={obs.regime}
            energy={obs.energy}
            markets={obs.markets}
          />
        )}
        {activeTab === 'mind' && (
          <MindTab energy={obs.energy} factors={obs.factors} />
        )}
      </Suspense>
    </div>
  );
}

/**
 * MindTab.tsx
 *
 * Mind tab — the 3D R3F scenes (energy surface + quantum sphere).
 * The scenes exist (../../scenes/{EnergySurfaceScene,QSphereScene}.tsx) and are
 * statically lazy-imported so Vite bundles them. An error boundary renders a
 * placeholder if a scene throws at runtime (e.g. no WebGL), so the tab never
 * blanks the whole dashboard.
 */

import { lazy, Suspense, Component, type ReactNode } from 'react';
import type { EnergyState, FactorSignal } from '../../hooks/useObservatoryStream';

interface Props {
  energy: EnergyState;
  factors: FactorSignal[];
}

const EnergySurfaceScene = lazy(() => import('../../scenes/EnergySurfaceScene'));
const QSphereScene = lazy(() => import('../../scenes/QSphereScene'));

function ScenePlaceholder({ name, sub }: { name: string; sub?: string }) {
  return (
    <div className="obs-scene-placeholder">
      <div className="obs-scene-placeholder-icon">◈</div>
      <div className="obs-scene-placeholder-title">{name}</div>
      <div className="obs-scene-placeholder-sub">{sub ?? 'loading 3D scene…'}</div>
    </div>
  );
}

// Error boundary — a scene runtime/WebGL error renders the placeholder, not a blank crash.
class SceneBoundary extends Component<{ name: string; children: ReactNode }, { failed: boolean }> {
  constructor(props: { name: string; children: ReactNode }) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      return <ScenePlaceholder name={this.props.name} sub="3D unavailable (no WebGL?)" />;
    }
    return this.props.children;
  }
}

export default function MindTab({ energy, factors }: Props) {
  const factorProps = factors.map(f => ({
    side: f.side,
    confidence: f.confidence ?? 0,
  }));

  return (
    <div className="obs-tab-content obs-mind-content">
      <div className="obs-section-title" style={{ marginBottom: '16px' }}>
        3D Mind — R3F Observatory
      </div>
      <div className="obs-mind-grid">
        <div className="obs-scene-frame">
          <div className="obs-scene-label">Energy Surface</div>
          <SceneBoundary name="Energy Surface">
            <Suspense fallback={<ScenePlaceholder name="Energy Surface" />}>
              <EnergySurfaceScene deltaU={energy.deltaU} animated />
            </Suspense>
          </SceneBoundary>
        </div>
        <div className="obs-scene-frame">
          <div className="obs-scene-label">Q-Sphere</div>
          <SceneBoundary name="Q-Sphere">
            <Suspense fallback={<ScenePlaceholder name="Q-Sphere" />}>
              <QSphereScene factors={factorProps} animated />
            </Suspense>
          </SceneBoundary>
        </div>
      </div>
    </div>
  );
}

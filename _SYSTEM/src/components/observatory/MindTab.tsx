/**
 * MindTab.tsx
 *
 * Mind tab — graceful lazy stub for the 3D R3F scenes.
 *
 * IMPORT CONTRACT (what the scenes lane must export):
 *
 *   // _SYSTEM/src/scenes/EnergySurfaceScene.tsx
 *   export default function EnergySurfaceScene(props: EnergySurfaceSceneProps): JSX.Element
 *   interface EnergySurfaceSceneProps {
 *     deltaU?: number;      // current energy ΔU value (optional, defaults to 0)
 *     animated?: boolean;   // whether to run animation loop (optional, defaults to true)
 *   }
 *
 *   // _SYSTEM/src/scenes/QSphereScene.tsx
 *   export default function QSphereScene(props: QSphereSceneProps): JSX.Element
 *   interface QSphereSceneProps {
 *     factors?: Array<{ side: 'long' | 'short' | 'neutral'; confidence: number }>; // optional
 *     animated?: boolean;   // optional, defaults to true
 *   }
 *
 * Both scenes are expected to:
 *   - Use React Three Fiber (@react-three/fiber) + drei (@react-three/drei)
 *   - Render a <Canvas> internally (full self-contained 3D viewport)
 *   - Be safe to mount/unmount (clean up animation loops, geometries, materials)
 *   - Tolerate undefined/empty props gracefully
 *
 * This stub uses React.lazy + Suspense so the build passes when the scene files
 * don't exist yet. The dynamic import is inside a try/catch via a wrapper function
 * that returns a fallback promise so lazy() never rejects at build time.
 */

import { lazy, Suspense } from 'react';
import type { EnergyState, FactorSignal } from '../../hooks/useObservatoryStream';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  energy: EnergyState;
  factors: FactorSignal[];
}

// ── Fallback placeholder (shown when scenes are absent or loading) ─────────────

function ScenePlaceholder({ name }: { name: string }) {
  return (
    <div className="obs-scene-placeholder">
      <div className="obs-scene-placeholder-icon">◈</div>
      <div className="obs-scene-placeholder-title">{name}</div>
      <div className="obs-scene-placeholder-sub">3D scene — wiring in progress</div>
    </div>
  );
}

// ── Lazy scene wrappers ───────────────────────────────────────────────────────
// We wrap the dynamic import in a function that catches "module not found" errors
// and returns a module with a default fallback component instead, so lazy() never
// throws during the build or at runtime when the scene files don't exist.

type ComponentModule<P = Record<string, unknown>> = { default: React.ComponentType<P> };

function safeLazyImport<P = Record<string, unknown>>(
  importFn: () => Promise<ComponentModule<P>>,
  fallbackName: string,
): React.LazyExoticComponent<React.ComponentType<P>> {
  return lazy(() =>
    importFn().catch(() => ({
      default: () => <ScenePlaceholder name={fallbackName} />,
    })) as Promise<ComponentModule<P>>,
  );
}

// These paths resolve relative to this file's location (_SYSTEM/src/components/observatory/).
// The scenes don't exist yet — tsc would reject static import() of missing modules,
// so we use a wrapper that catches the "module not found" at runtime.
// Both tsc and Rollup must not statically resolve these paths (scenes don't exist yet).
// Solution: cast-to-string defeats tsc's module-resolution check; @vite-ignore defeats
// Rollup's build-time resolver. At runtime the import() rejects and safeLazyImport
// renders the placeholder instead.
const ENERGY_SCENE_PATH = '../../scenes/EnergySurfaceScene';
const QSPHERE_SCENE_PATH = '../../scenes/QSphereScene';
const _energyImport = () => import(/* @vite-ignore */ ENERGY_SCENE_PATH);
const _qsphereImport = () => import(/* @vite-ignore */ QSPHERE_SCENE_PATH);

const EnergySurfaceScene = safeLazyImport<{ deltaU?: number; animated?: boolean }>(
  _energyImport as () => Promise<ComponentModule<{ deltaU?: number; animated?: boolean }>>,
  'Energy Surface',
);

const QSphereScene = safeLazyImport<{
  factors?: Array<{ side: 'long' | 'short' | 'neutral'; confidence: number }>;
  animated?: boolean;
}>(
  _qsphereImport as () => Promise<ComponentModule<{ factors?: Array<{ side: 'long' | 'short' | 'neutral'; confidence: number }>; animated?: boolean }>>,
  'Q-Sphere',
);

// ── Mind Tab ──────────────────────────────────────────────────────────────────

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
          <Suspense fallback={<ScenePlaceholder name="Energy Surface" />}>
            <EnergySurfaceScene deltaU={energy.deltaU} animated />
          </Suspense>
        </div>
        <div className="obs-scene-frame">
          <div className="obs-scene-label">Q-Sphere</div>
          <Suspense fallback={<ScenePlaceholder name="Q-Sphere" />}>
            <QSphereScene factors={factorProps} animated />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

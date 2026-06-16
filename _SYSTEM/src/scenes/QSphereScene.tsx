/**
 * QSphereScene.tsx
 *
 * Quantum constellation: maps factor signals (side + confidence) onto a sphere.
 * - long    → top hemisphere    (θ near 0, north pole)
 * - short   → bottom hemisphere (θ near π, south pole)
 * - neutral → equatorial band   (θ near π/2)
 * - confidence → point radius + emissive intensity (0..1 → small/dim..large/bright)
 *
 * Ported from demos/qsphere.html sphere + spoke pattern.
 *
 * Props:
 *   factors  — factor signals; renders a superposition ghost when empty/undefined
 *   animated — whether to spin the scene (default true)
 */

import React, { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

// ── Types ─────────────────────────────────────────────────────────────────────

export type FactorSide = 'long' | 'short' | 'neutral';

export interface FactorSignal {
  side: FactorSide;
  confidence: number;  // 0..1
}

interface QSphereSceneProps {
  factors?: FactorSignal[];
  animated?: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const R      = 4;           // sphere radius (world units)
const POS_COLOR = 0x36d1ff; // long  — cyan
const NEG_COLOR = 0xff4d9d; // short — magenta
const NEU_COLOR = 0xf0c040; // neutral — amber

// Default ghost factors for when no real data is provided (shows superposition)
const GHOST_FACTORS: FactorSignal[] = [
  { side: 'long',    confidence: 0.8 },
  { side: 'long',    confidence: 0.5 },
  { side: 'short',   confidence: 0.6 },
  { side: 'neutral', confidence: 0.4 },
  { side: 'long',    confidence: 0.3 },
  { side: 'short',   confidence: 0.7 },
  { side: 'neutral', confidence: 0.5 },
  { side: 'short',   confidence: 0.2 },
];

// ── Map a factor to a sphere position ────────────────────────────────────────

function factorToSpherePos(
  factor: FactorSignal,
  indexInSide: number,
  countInSide: number,
): THREE.Vector3 {
  // Latitude (polar angle θ) by side
  let thetaBase: number;
  if (factor.side === 'long')    thetaBase = Math.PI * 0.18;           // upper hemisphere
  else if (factor.side === 'short') thetaBase = Math.PI * 0.82;        // lower hemisphere
  else                            thetaBase = Math.PI * 0.5;           // equator

  // Spread multiple factors of same side around a latitude ring
  const phi = countInSide > 1
    ? (2 * Math.PI * indexInSide) / countInSide
    : 0;

  // Jitter theta slightly by confidence to create depth
  const thetaJitter = (factor.confidence - 0.5) * 0.18;
  const theta = thetaBase + thetaJitter;

  const sinT = Math.sin(theta);
  const cosT = Math.cos(theta);
  return new THREE.Vector3(
    R * sinT * Math.cos(phi),
    R * cosT,
    R * sinT * Math.sin(phi),
  );
}

function sideColor(side: FactorSide): number {
  if (side === 'long')    return POS_COLOR;
  if (side === 'short')   return NEG_COLOR;
  return NEU_COLOR;
}

// ── Scene inner ───────────────────────────────────────────────────────────────

function QSphereInner({ factors, animated }: QSphereSceneProps) {
  const groupRef = useRef<THREE.Group>(null);

  const activeFactor = factors && factors.length > 0 ? factors : GHOST_FACTORS;

  // Count factors per side to evenly space them on latitude rings
  const positions = useMemo(() => {
    const sideCounts: Record<FactorSide, number> = { long: 0, short: 0, neutral: 0 };
    const sideIndices: Record<FactorSide, number> = { long: 0, short: 0, neutral: 0 };

    for (const f of activeFactor) sideCounts[f.side]++;

    return activeFactor.map(f => {
      const idx = sideIndices[f.side]++;
      return factorToSpherePos(f, idx, sideCounts[f.side]);
    });
  }, [activeFactor]);

  useFrame((_, delta) => {
    if (!animated && animated !== undefined) return;
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.12;
    }
  });

  return (
    <group ref={groupRef}>
      <ambientLight intensity={0.7} color={0x88a0d0} />
      <directionalLight position={[6, 8, 4]} intensity={0.6} color={0xffffff} />

      {/* Wire sphere shell */}
      <mesh>
        <sphereGeometry args={[R, 40, 28]} />
        <meshBasicMaterial
          color={0x21406e}
          wireframe
          transparent
          opacity={0.16}
        />
      </mesh>

      {/* Latitude rings — one per side boundary */}
      {[0.18, 0.5, 0.82].map((frac, i) => {
        const theta = Math.PI * frac;
        const rr    = R * Math.sin(theta);
        const y     = R * Math.cos(theta);
        return (
          <mesh key={i} rotation={[Math.PI / 2, 0, 0]} position={[0, y, 0]}>
            <torusGeometry args={[rr, 0.012, 8, 64]} />
            <meshBasicMaterial color={0x2b517f} transparent opacity={0.5} />
          </mesh>
        );
      })}

      {/* Factor dots + spokes */}
      {activeFactor.map((f, idx) => {
        const pos = positions[idx];
        const col = sideColor(f.side);
        const rad = 0.05 + 0.22 * Math.sqrt(f.confidence);
        const emissiveIntensity = 0.3 + 1.4 * f.confidence;

        return (
          <group key={idx}>
            {/* Dot */}
            <mesh position={pos}>
              <sphereGeometry args={[rad, 24, 18]} />
              <meshStandardMaterial
                color={col}
                emissive={col}
                emissiveIntensity={emissiveIntensity}
                roughness={0.35}
              />
            </mesh>

            {/* Spoke from centre to dot */}
            <SpokeLine end={pos} color={col} opacity={0.08 + 0.6 * Math.sqrt(f.confidence)} />
          </group>
        );
      })}

      <OrbitControls enableDamping dampingFactor={0.08} makeDefault={false} />
    </group>
  );
}

// ── Spoke line helper ─────────────────────────────────────────────────────────

function SpokeLine({
  end,
  color,
  opacity,
}: {
  end: THREE.Vector3;
  color: number;
  opacity: number;
}) {
  const lineRef = useRef<THREE.Line>(null);

  const { geo, mat } = useMemo(() => {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      end,
    ]);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
    return { geo, mat };
  }, [end, color, opacity]);

  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);

  return <primitive object={new THREE.Line(geo, mat)} ref={lineRef} />;
}

// ── Public component ──────────────────────────────────────────────────────────

export default function QSphereScene(props: QSphereSceneProps): React.ReactElement {
  const { factors, animated = true } = props;

  return (
    <div style={{ width: '100%', height: '100%', minHeight: 300, background: '#04060c' }}>
      <Canvas
        camera={{ position: [7, 4.6, 9.2], fov: 45, near: 0.1, far: 200 }}
        gl={{ antialias: true }}
        style={{ width: '100%', height: '100%' }}
      >
        <QSphereInner factors={factors} animated={animated} />
      </Canvas>
    </div>
  );
}

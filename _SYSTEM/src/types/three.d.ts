import { ThreeElement } from '@react-three/fiber';
import * as THREE from 'three';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      // ── Meshes & groups ────────────────────────────────────────────────────
      mesh:              ThreeElement<typeof THREE.Mesh>;
      group:             ThreeElement<typeof THREE.Group>;
      // ── Geometries ─────────────────────────────────────────────────────────
      sphereGeometry:    ThreeElement<typeof THREE.SphereGeometry>;
      bufferGeometry:    ThreeElement<typeof THREE.BufferGeometry>;
      planeGeometry:     ThreeElement<typeof THREE.PlaneGeometry>;
      torusGeometry:     ThreeElement<typeof THREE.TorusGeometry>;
      boxGeometry:       ThreeElement<typeof THREE.BoxGeometry>;
      // ── Materials ──────────────────────────────────────────────────────────
      meshStandardMaterial:  ThreeElement<typeof THREE.MeshStandardMaterial>;
      meshBasicMaterial:     ThreeElement<typeof THREE.MeshBasicMaterial>;
      lineBasicMaterial:     ThreeElement<typeof THREE.LineBasicMaterial>;
      // ── Lights ─────────────────────────────────────────────────────────────
      ambientLight:      ThreeElement<typeof THREE.AmbientLight>;
      pointLight:        ThreeElement<typeof THREE.PointLight>;
      directionalLight:  ThreeElement<typeof THREE.DirectionalLight>;
      // ── Helpers ────────────────────────────────────────────────────────────
      gridHelper:        ThreeElement<typeof THREE.GridHelper>;
    }
  }
}

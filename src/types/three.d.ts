import { ThreeElement } from '@react-three/fiber';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      mesh: ThreeElement<typeof THREE.Mesh>;
      sphereGeometry: ThreeElement<typeof THREE.SphereGeometry>;
      meshStandardMaterial: ThreeElement<typeof THREE.MeshStandardMaterial>;
      ambientLight: ThreeElement<typeof THREE.AmbientLight>;
      pointLight: ThreeElement<typeof THREE.PointLight>;
      group: ThreeElement<typeof THREE.Group>;
    }
  }
}

import * as THREE from 'three';

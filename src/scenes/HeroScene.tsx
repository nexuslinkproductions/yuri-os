import React, { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { MeshDistortMaterial, PointMaterial, Points } from '@react-three/drei';
import * as THREE from 'three';

const ParticleField = () => {
  const isDesktop = useMemo(() => window.matchMedia('(min-width: 768px)').matches, []);
  const count = isDesktop ? 1500 : 300;

  const pointsRef = useRef<THREE.Points>(null!);
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 5 + Math.random() * 5;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      arr[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      arr[i * 3 + 2] = r * Math.cos(phi);
    }
    return arr;
  }, [count]);

  useFrame((_, delta) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.y += delta * 0.01;
      pointsRef.current.rotation.x += delta * 0.005;
      const positions = pointsRef.current.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < positions.length; i += 3) {
        positions[i + 1] += Math.sin(Date.now() * 0.001 + i) * 0.0005;
      }
      pointsRef.current.geometry.attributes.position.needsUpdate = true;
    }
  });

  return (
    <Points ref={pointsRef} positions={positions}>
      <PointMaterial size={0.02} color="#06b6d4" transparent opacity={0.4} sizeAttenuation depthWrite={false} />
    </Points>
  );
};

const HeroScene = () => {
  const meshRef = useRef<THREE.Mesh>(null!);
  const { camera } = useThree();

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.0015;
      meshRef.current.rotation.x += 0.0008;
    }

    const targetX = camera.position.x + (-camera.position.x) * 0.05;
    const targetY = camera.position.y + (-camera.position.y) * 0.05;
    camera.position.x += (targetX - camera.position.x) * 0.05;
    camera.position.y += (targetY - camera.position.y) * 0.05;
    camera.lookAt(0, 0, 0);
  });

  useThree(({ pointer }) => {
    const targetX = pointer.x * 0.5;
    const targetY = pointer.y * 0.5;
    camera.position.x += (targetX - camera.position.x) * 0.05;
    camera.position.y += (targetY - camera.position.y) * 0.05;
    camera.lookAt(0, 0, 0);
  });

  return (
    <>
      <ambientLight intensity={0.3} />
      <pointLight position={[-3, 2, 4]} color="#7c3aed" intensity={1} />
      <pointLight position={[3, -2, 4]} color="#06b6d4" intensity={1} />

      <mesh ref={meshRef}>
        <torusKnotGeometry args={[1.2, 0.4, 256, 64, 2, 3]} />
        <MeshDistortMaterial
          color="#7c3aed"
          distort={0.4}
          speed={1.5}
          metalness={0.6}
          roughness={0.2}
          emissive="#4c1d95"
          emissiveIntensity={0.3}
        />
      </mesh>

      <ParticleField />
    </>
  );
};

export default HeroScene;

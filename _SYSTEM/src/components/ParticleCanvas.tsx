import { useEffect, useRef } from 'react';
import * as THREE from 'three';

const PARTICLE_COUNT = 1800;
const TRIQUETRA_RADIUS = 140;
const REPULSION_RADIUS = 120;
const SPRING_STIFFNESS = 0.04;
const DAMPING = 0.92;

interface Particle {
  current: THREE.Vector3;
  target: THREE.Vector3;
  velocity: THREE.Vector3;
  alpha: number;
  size: number;
  circleIndex: number;
}

// Triquetra circle centers
const centers = [
  new THREE.Vector3(0, -80, 0),
  new THREE.Vector3(-69, 40, 0),
  new THREE.Vector3(69, 40, 0),
];

function generateTriquetraPositions(): THREE.Vector3[] {
  const positions: THREE.Vector3[] = [];
  const perCircle = Math.ceil(PARTICLE_COUNT / 3);

  for (let c = 0; c < 3; c++) {
    const center = centers[c];
    const count = c < 2 ? perCircle : PARTICLE_COUNT - perCircle * 2;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const x = center.x + Math.cos(angle) * TRIQUETRA_RADIUS;
      const y = center.y + Math.sin(angle) * TRIQUETRA_RADIUS;
      positions.push(new THREE.Vector3(x, y, 0));
    }
  }
  return positions;
}

export default function ParticleCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Scene setup
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(
      -window.innerWidth / 2,
      window.innerWidth / 2,
      window.innerHeight / 2,
      -window.innerHeight / 2,
      0.1,
      1000
    );
    camera.position.z = 1;

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Mouse state
    const mouse = new THREE.Vector2(-9999, -9999);

    // Geometry
    const geometry = new THREE.BufferGeometry();
    const targetPositions = generateTriquetraPositions();
    const positionsArray = new Float32Array(PARTICLE_COUNT * 3);
    const colorsArray = new Float32Array(PARTICLE_COUNT * 3);
    const sizesArray = new Float32Array(PARTICLE_COUNT);

    // Initialize particles
    const particles: Particle[] = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const target = targetPositions[i].clone();
      // Start slightly scattered
      const offset = new THREE.Vector3(
        (Math.random() - 0.5) * 200,
        (Math.random() - 0.5) * 200,
        (Math.random() - 0.5) * 20
      );
      const current = target.clone().add(offset);

      const alpha = 0.2 + Math.random() * 0.6;
      const size = 1.2 + Math.random() * 1.6;

      particles.push({
        current,
        target,
        velocity: new THREE.Vector3(0, 0, 0),
        alpha,
        size,
        circleIndex: i % 3,
      });

      positionsArray[i * 3] = current.x;
      positionsArray[i * 3 + 1] = current.y;
      positionsArray[i * 3 + 2] = current.z;

      // Crimson color with alpha baked into color for simplicity
      // We'll use a custom shader or set buffer colors with alpha
      const r = 220 / 255;
      const g = 38 / 255;
      const b = 38 / 255;
      colorsArray[i * 3] = r;
      colorsArray[i * 3 + 1] = g;
      colorsArray[i * 3 + 2] = b;

      sizesArray[i] = size;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positionsArray, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colorsArray, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizesArray, 1));

    // Custom shader material for alpha per particle
    const material = new THREE.ShaderMaterial({
      uniforms: {
        pointTexture: { value: createCircleTexture() },
      },
      vertexShader: `
        attribute float size;
        attribute vec3 color;
        varying vec3 vColor;
        varying float vAlpha;
        uniform float uAlpha[${PARTICLE_COUNT}];
        void main() {
          vColor = color;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform sampler2D pointTexture;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec4 texColor = texture2D(pointTexture, gl_PointCoord);
          gl_FragColor = vec4(vColor, texColor.a * vAlpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    // Simpler approach: use PointsMaterial with vertex colors and handle alpha via opacity trick
    // Actually let's use a different approach - standard Points with per-vertex alpha via shader
    // Or simpler: just use PointsMaterial with varying opacity by making separate geometry groups
    
    // Simplest performant approach: use Points with standard material, particle alpha done via randomness
    // We'll use a texture-based approach where alpha is controlled per particle
    
    // Let's go with a clean approach: custom ShaderMaterial with attribute for alpha
    const alphaArray = new Float32Array(PARTICLE_COUNT);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      alphaArray[i] = particles[i].alpha;
    }
    geometry.setAttribute('particleAlpha', new THREE.BufferAttribute(alphaArray, 1));

    const shaderMat = new THREE.ShaderMaterial({
      uniforms: {
        pointTexture: { value: createCircleTexture() },
      },
      vertexShader: `
        attribute float size;
        attribute vec3 color;
        attribute float particleAlpha;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vColor = color;
          vAlpha = particleAlpha;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(size, 1.0, 6.0);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform sampler2D pointTexture;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec4 texColor = texture2D(pointTexture, gl_PointCoord);
          float a = texColor.a * vAlpha;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vColor, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(geometry, shaderMat);
    scene.add(points);

    // Texture for soft circle
    function createCircleTexture(): THREE.Texture {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d')!;
      const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      gradient.addColorStop(0, 'rgba(255,255,255,1)');
      gradient.addColorStop(0.3, 'rgba(255,255,255,0.8)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 64, 64);
      const texture = new THREE.CanvasTexture(canvas);
      texture.needsUpdate = true;
      return texture;
    }

    // Position attribute reference
    const positionAttr = geometry.attributes.position as THREE.BufferAttribute;
    const sizeAttr = geometry.attributes.size as THREE.BufferAttribute;
    const alphaAttr = geometry.attributes.particleAlpha as THREE.BufferAttribute;

    // Mouse move handler
    function onMouseMove(event: MouseEvent) {
      const x = event.clientX - window.innerWidth / 2;
      const y = -(event.clientY - window.innerHeight / 2);
      mouse.set(x, y);
    }

    // Mouse leave handler
    function onMouseLeave() {
      mouse.set(-9999, -9999);
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseleave', onMouseLeave);

    // Resize handler
    function onResize() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      camera.left = -w / 2;
      camera.right = w / 2;
      camera.top = h / 2;
      camera.bottom = -h / 2;
      camera.position.z = 1;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }

    window.addEventListener('resize', onResize);

    // Animation loop
    const posArray = positionAttr.array as Float32Array;

    function animate() {
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const p = particles[i];
        const idx = i * 3;

        // Spring force toward target
        const dx = p.target.x - p.current.x;
        const dy = p.target.y - p.current.y;
        const dz = p.target.z - p.current.z;

        p.velocity.x += dx * SPRING_STIFFNESS;
        p.velocity.y += dy * SPRING_STIFFNESS;
        p.velocity.z += dz * SPRING_STIFFNESS;

        // Repulsion from mouse
        const mx = p.current.x - mouse.x;
        const my = p.current.y - mouse.y;
        const dist = Math.sqrt(mx * mx + my * my);

        if (dist < REPULSION_RADIUS && dist > 0.1) {
          const force = (REPULSION_RADIUS - dist) / REPULSION_RADIUS;
          const normX = mx / dist;
          const normY = my / dist;
          const repulsionStrength = force * force * 8;
          p.velocity.x += normX * repulsionStrength;
          p.velocity.y += normY * repulsionStrength;
          p.velocity.z += (Math.random() - 0.5) * 0.5;
        }

        // Damping
        p.velocity.x *= DAMPING;
        p.velocity.y *= DAMPING;
        p.velocity.z *= DAMPING;

        // Update position
        p.current.x += p.velocity.x;
        p.current.y += p.velocity.y;
        p.current.z += p.velocity.z;

        // Write to buffer
        posArray[idx] = p.current.x;
        posArray[idx + 1] = p.current.y;
        posArray[idx + 2] = p.current.z;
      }

      positionAttr.needsUpdate = true;

      renderer.render(scene, camera);
      animRef.current = requestAnimationFrame(animate);
    }

    animRef.current = requestAnimationFrame(animate);

    // Cleanup
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseleave', onMouseLeave);
      window.removeEventListener('resize', onResize);

      geometry.dispose();
      shaderMat.dispose();
      renderer.dispose();

      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 1,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    />
  );
}

import { useEffect, useRef } from 'react';

/* ─── Animated 3D Torus Knot background ─── */
/* Parametric (2,3) torus knot rendered via perspective projection.
   Reveals as user scrolls. Slowly rotates on all three axes. */

interface Point3D { x: number; y: number; z: number; }

function torusKnot(t: number, p = 2, q = 3, R = 1, r = 0.35): Point3D {
  const phi = t * p;
  const theta = t * q;
  const x = (R + r * Math.cos(theta)) * Math.cos(phi);
  const y = (R + r * Math.cos(theta)) * Math.sin(phi);
  const z = r * Math.sin(theta);
  return { x, y, z };
}

function rotateX(p: Point3D, a: number): Point3D {
  return { x: p.x, y: p.y * Math.cos(a) - p.z * Math.sin(a), z: p.y * Math.sin(a) + p.z * Math.cos(a) };
}
function rotateY(p: Point3D, a: number): Point3D {
  return { x: p.x * Math.cos(a) + p.z * Math.sin(a), y: p.y, z: -p.x * Math.sin(a) + p.z * Math.cos(a) };
}
function rotateZ(p: Point3D, a: number): Point3D {
  return { x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a), z: p.z };
}

function project(p: Point3D, fov: number, cx: number, cy: number): { x: number; y: number; z: number } {
  const z = p.z + 3.5;
  const scale = fov / z;
  return { x: p.x * scale + cx, y: p.y * scale + cy, z: p.z };
}

const SEGMENTS = 420;
const FOV = 280;

export default function CelticBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize, { passive: true });

    /* scroll progress drives reveal + slow camera tilt */
    let scrollProgress = 0;
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      scrollProgress = max > 0 ? Math.min(window.scrollY / max, 1) : 0;
    };
    window.addEventListener('scroll', onScroll, { passive: true });

    let frame = 0;
    let rafId = 0;

    const draw = () => {
      frame++;
      const t = frame * 0.004; // slow rotation time
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const scale = Math.min(canvas.width, canvas.height) * 0.26;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      /* Base reveal: 0–100% of scroll = 20%–100% of knot drawn */
      const revealFrac = 0.2 + scrollProgress * 0.8;
      const totalPts = Math.floor(SEGMENTS * revealFrac);

      /* Slow multi-axis rotation */
      const rx = t * 0.18 + scrollProgress * Math.PI * 0.4;
      const ry = t * 0.11;
      const rz = t * 0.07 + scrollProgress * Math.PI * 0.15;

      /* Pre-compute all points */
      const pts: { sx: number; sy: number; depth: number }[] = [];
      for (let i = 0; i <= totalPts; i++) {
        const tParam = (i / SEGMENTS) * Math.PI * 2;
        let p = torusKnot(tParam);
        p = rotateX(p, rx);
        p = rotateY(p, ry);
        p = rotateZ(p, rz);
        const s = project({ x: p.x * scale, y: p.y * scale, z: p.z }, FOV, cx, cy);
        pts.push({ sx: s.x, sy: s.y, depth: s.z });
      }

      /* Draw segments with depth-based opacity */
      for (let i = 1; i < pts.length; i++) {
        const { sx: x1, sy: y1, depth: d1 } = pts[i - 1];
        const { sx: x2, sy: y2, depth: d2 } = pts[i];
        const avgDepth = (d1 + d2) / 2;
        /* Map depth [-r,r] to opacity */
        const depthNorm = (avgDepth + 0.4) / 0.8; // normalise
        const opacity = 0.025 + depthNorm * 0.065; // 0.025–0.09 range

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = `rgba(255,255,255,${opacity.toFixed(3)})`;
        ctx.lineWidth = 0.8 + depthNorm * 0.6;
        ctx.stroke();
      }

      /* Accent: draw first loop in very faint red */
      const accentCount = Math.floor(SEGMENTS / 3 * revealFrac);
      ctx.beginPath();
      for (let i = 0; i <= accentCount; i++) {
        const tParam = (i / SEGMENTS) * Math.PI * 2;
        let p = torusKnot(tParam, 2, 3);
        p = rotateX(p, rx + Math.PI * 0.15);
        p = rotateY(p, ry);
        p = rotateZ(p, rz);
        const s = project({ x: p.x * scale * 0.6, y: p.y * scale * 0.6, z: p.z }, FOV, cx, cy);
        if (i === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      }
      ctx.strokeStyle = `rgba(228,88,95,${0.02 + scrollProgress * 0.03})`;
      ctx.lineWidth = 0.6;
      ctx.stroke();

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed', top: 0, left: 0,
        width: '100%', height: '100%',
        pointerEvents: 'none', zIndex: 0,
        mixBlendMode: 'screen',
      }}
    />
  );
}

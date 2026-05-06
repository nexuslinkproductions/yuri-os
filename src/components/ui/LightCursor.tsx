import { useEffect, useRef, useState } from 'react';

/* ─── Canvas-based light source cursor with trails + particles ─── */

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  size: number;
}

const MAX_TRAIL = 36;
const MAX_PARTICLES = 60;

export default function LightCursor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -400, y: -400 });
  const trailRef = useRef<{ x: number; y: number }[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef(0);
  const frameRef = useRef(0);
  const [visible, setVisible] = useState(false);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    document.documentElement.style.cursor = 'none';
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    /* resize */
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize, { passive: true });

    /* mouse */
    const onMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
      if (!visible) setVisible(true);

      /* trail */
      trailRef.current.push({ x: e.clientX, y: e.clientY });
      if (trailRef.current.length > MAX_TRAIL) trailRef.current.shift();

      /* emit particles every 2nd frame on movement */
      if (frameRef.current % 2 === 0) {
        const p = particlesRef.current;
        if (p.length < MAX_PARTICLES) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 0.3 + Math.random() * 0.8;
          p.push({
            x: e.clientX,
            y: e.clientY,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 0.4, // slight upward bias
            life: 0,
            maxLife: 18 + Math.floor(Math.random() * 22),
            size: 0.6 + Math.random() * 1.4,
          });
        }
      }

      /* magnetic pull */
      document.querySelectorAll<HTMLElement>('a, button, [data-magnetic]').forEach((el) => {
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const dx = e.clientX - cx, dy = e.clientY - cy;
        const dist = Math.hypot(dx, dy);
        if (dist < 70) {
          const pull = (70 - dist) / 70 * 14;
          const a = Math.atan2(dy, dx);
          el.style.transform = `translate(${Math.cos(a) * pull}px,${Math.sin(a) * pull}px)`;
          el.style.transition = 'transform 0.1s ease-out';
        } else if (el.style.transform) {
          el.style.transform = '';
          el.style.transition = 'transform 0.5s ease-out';
        }
      });
    };

    const onOver = (e: MouseEvent) => {
      if ((e.target as HTMLElement)?.closest?.('a, button, [data-cursor]')) setHover(true);
    };
    const onOut = (e: MouseEvent) => {
      if (!(e.relatedTarget as HTMLElement)?.closest?.('a, button, [data-cursor]')) setHover(false);
    };
    const onLeave = () => {
      setVisible(false);
      trailRef.current = [];
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    document.addEventListener('mouseover', onOver, { passive: true });
    document.addEventListener('mouseout', onOut, { passive: true });
    document.addEventListener('mouseleave', onLeave, { passive: true });

    /* ── render loop ── */
    const draw = () => {
      frameRef.current++;
      const { x: mx, y: my } = mouseRef.current;
      const w = canvas.width, h = canvas.height;

      /* clear with slight alpha bleed for persistence */
      ctx.clearRect(0, 0, w, h);

      /* ── trail ── */
      const trail = trailRef.current;
      if (trail.length > 1) {
        for (let i = 1; i < trail.length; i++) {
          const t = i / trail.length;
          const alpha = t * t * 0.35;
          const width = t * 2.5;
          ctx.beginPath();
          ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
          ctx.lineTo(trail[i].x, trail[i].y);
          ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
          ctx.lineWidth = width;
          ctx.lineCap = 'round';
          ctx.stroke();
        }
      }

      /* ── particles ── */
      const alive: Particle[] = [];
      for (const p of particlesRef.current) {
        p.x += p.vx; p.y += p.vy;
        p.vy += 0.015; // gentle gravity
        p.vx *= 0.98;
        p.life++;
        if (p.life < p.maxLife) {
          const t = 1 - p.life / p.maxLife;
          const alpha = t * t * 0.6;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * t, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,255,255,${alpha})`;
          ctx.fill();
          alive.push(p);
        }
      }
      particlesRef.current = alive;

      /* ── central light source ── */
      const hoverFactor = hover ? 1.8 : 1;

      // outer diffuse glow
      const outerGrad = ctx.createRadialGradient(mx, my, 0, mx, my, 28 * hoverFactor);
      outerGrad.addColorStop(0, `rgba(255,255,255,${0.06 * hoverFactor})`);
      outerGrad.addColorStop(0.5, 'rgba(255,255,255,0.015)');
      outerGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.beginPath();
      ctx.arc(mx, my, 28 * hoverFactor, 0, Math.PI * 2);
      ctx.fillStyle = outerGrad;
      ctx.fill();

      // tight inner glow
      const innerGrad = ctx.createRadialGradient(mx, my, 0, mx, my, 6 * hoverFactor);
      innerGrad.addColorStop(0, hover ? 'rgba(220,80,80,0.95)' : 'rgba(255,255,255,0.95)');
      innerGrad.addColorStop(0.4, hover ? 'rgba(220,50,50,0.4)' : 'rgba(255,255,255,0.4)');
      innerGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.beginPath();
      ctx.arc(mx, my, 6 * hoverFactor, 0, Math.PI * 2);
      ctx.fillStyle = innerGrad;
      ctx.fill();

      // hard center dot
      ctx.beginPath();
      ctx.arc(mx, my, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.98)';
      ctx.fill();

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('mouseout', onOut);
      document.removeEventListener('mouseleave', onLeave);
      document.documentElement.style.cursor = '';
    };
  }, [visible, hover]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0, left: 0,
        width: '100%', height: '100%',
        pointerEvents: 'none',
        zIndex: 9999,
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.3s ease',
      }}
    />
  );
}

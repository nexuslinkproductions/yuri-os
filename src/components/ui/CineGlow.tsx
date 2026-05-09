import { useEffect, useRef } from 'react';

type Ripple = { x: number; y: number; life: number };
type TargetRect = { x: number; y: number; w: number; h: number } | null;

const lerp = (from: number, to: number, amt: number) => from + (to - from) * amt;

function drawCorner(ctx: CanvasRenderingContext2D, x: number, y: number, sx: number, sy: number, size: number) {
  ctx.moveTo(x, y + sy * size);
  ctx.lineTo(x, y);
  ctx.lineTo(x + sx * size, y);
}

export default function CineGlow() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const frameRef = useRef(0);
  const stateRef = useRef({
    x: -200,
    y: -200,
    tx: -200,
    ty: -200,
    px: -200,
    py: -200,
    visible: false,
    active: false,
    target: null as TargetRect,
    ripples: [] as Ripple[],
  });

  useEffect(() => {
    if (!window.matchMedia('(pointer: fine)').matches) return undefined;

    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    const state = stateRef.current;
    document.documentElement.classList.add('custom-cursor-active');

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * ratio);
      canvas.height = Math.floor(window.innerHeight * ratio);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const onMove = (event: MouseEvent) => {
      state.px = state.tx;
      state.py = state.ty;
      state.tx = event.clientX;
      state.ty = event.clientY;
      state.visible = true;

      const target = (event.target as HTMLElement)?.closest?.('a, button, input, textarea, select, [role="button"]') as HTMLElement | null;
      state.active = Boolean(target);
      if (target) {
        const rect = target.getBoundingClientRect();
        state.target = { x: rect.left, y: rect.top, w: rect.width, h: rect.height };
      } else {
        state.target = null;
      }
    };

    const onDown = () => {
      state.ripples.push({ x: state.tx, y: state.ty, life: 0 });
    };

    const onLeave = () => {
      state.visible = false;
      state.active = false;
      state.target = null;
      state.ripples = [];
    };

    const draw = () => {
      frameRef.current += 1;
      const t = frameRef.current / 60;
      state.x = lerp(state.x, state.tx, 0.26);
      state.y = lerp(state.y, state.ty, 0.26);

      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      const alive: Ripple[] = [];
      for (const ripple of state.ripples) {
        ripple.life += 1;
        if (ripple.life < 38) {
          const p = ripple.life / 38;
          ctx.beginPath();
          ctx.arc(ripple.x, ripple.y, 8 + p * 44, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(220,38,38,${(1 - p) * 0.34})`;
          ctx.lineWidth = 0.8;
          ctx.stroke();
          alive.push(ripple);
        }
      }
      state.ripples = alive;

      if (state.target) {
        const pad = 9;
        const r = state.target;
        const x = r.x - pad;
        const y = r.y - pad;
        const w = r.w + pad * 2;
        const h = r.h + pad * 2;
        const size = Math.min(18, Math.max(10, Math.min(w, h) * 0.26));

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.beginPath();
        drawCorner(ctx, x, y, 1, 1, size);
        drawCorner(ctx, x + w, y, -1, 1, size);
        drawCorner(ctx, x + w, y + h, -1, -1, size);
        drawCorner(ctx, x, y + h, 1, -1, size);
        ctx.strokeStyle = 'rgba(220,38,38,0.72)';
        ctx.lineWidth = 0.8;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(state.x, state.y);
        ctx.lineTo(r.x + r.w / 2, r.y + r.h / 2);
        ctx.strokeStyle = 'rgba(220,38,38,0.16)';
        ctx.lineWidth = 0.55;
        ctx.setLineDash([4, 9]);
        ctx.stroke();
        ctx.restore();
      }

      if (state.visible) {
        const speed = Math.min(1, Math.hypot(state.tx - state.px, state.ty - state.py) / 42);
        const orbit = state.active ? 22 : 15;
        const focus = state.active ? 5 : 3;

        ctx.save();
        ctx.translate(state.x, state.y);
        ctx.rotate(t * (state.active ? -1.2 : 0.7));
        ctx.globalCompositeOperation = 'lighter';

        ctx.beginPath();
        ctx.arc(0, 0, orbit, Math.PI * 0.05, Math.PI * 0.58);
        ctx.arc(0, 0, orbit, Math.PI * 1.05, Math.PI * 1.58);
        ctx.strokeStyle = state.active ? 'rgba(220,38,38,0.86)' : 'rgba(232,232,238,0.46)';
        ctx.lineWidth = state.active ? 1 : 0.72;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(-orbit - 7, 0);
        ctx.lineTo(-focus - 2, 0);
        ctx.moveTo(focus + 2, 0);
        ctx.lineTo(orbit + 7, 0);
        ctx.moveTo(0, -orbit - 7);
        ctx.lineTo(0, -focus - 2);
        ctx.moveTo(0, focus + 2);
        ctx.lineTo(0, orbit + 7);
        ctx.strokeStyle = 'rgba(220,38,38,0.58)';
        ctx.lineWidth = 0.64;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, -focus);
        ctx.lineTo(focus, 0);
        ctx.lineTo(0, focus);
        ctx.lineTo(-focus, 0);
        ctx.closePath();
        ctx.strokeStyle = 'rgba(255,255,255,0.62)';
        ctx.lineWidth = 0.72;
        ctx.stroke();
        ctx.restore();

        if (speed > 0.12) {
          ctx.beginPath();
          ctx.moveTo(state.x, state.y);
          ctx.lineTo(lerp(state.x, state.px, 0.18), lerp(state.y, state.py, 0.18));
          ctx.strokeStyle = `rgba(220,38,38,${0.07 + speed * 0.16})`;
          ctx.lineWidth = 0.7;
          ctx.stroke();
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('mousedown', onDown, { passive: true });
    document.addEventListener('mouseleave', onLeave, { passive: true });
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mousedown', onDown);
      document.removeEventListener('mouseleave', onLeave);
      document.documentElement.classList.remove('custom-cursor-active');
    };
  }, []);

  return <canvas ref={canvasRef} className="cine-glow focus-cursor" aria-hidden="true" />;
}

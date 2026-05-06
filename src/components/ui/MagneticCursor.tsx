import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';

/* ─── High-tech targeting reticle cursor ─── */

const SNAPPY   = { stiffness: 420, damping: 34, mass: 0.4 };
const BRACKET  = { stiffness: 200, damping: 22, mass: 0.6 };
const AURA     = { stiffness: 48,  damping: 14, mass: 1.0 };

export default function FuturisticCursor() {
  const rX = useMotionValue(-400); const rY = useMotionValue(-400);
  const cX = useSpring(rX, SNAPPY);  const cY = useSpring(rY, SNAPPY);
  const bX = useSpring(rX, BRACKET); const bY = useSpring(rY, BRACKET);
  const aX = useSpring(rX, AURA);    const aY = useSpring(rY, AURA);

  const [hover, setHover] = useState(false);
  const [visible, setVisible] = useState(false);
  const idleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Magnetic pull ── */
  const applyMagnetic = useCallback((mx: number, my: number) => {
    document.querySelectorAll<HTMLElement>('a, button, [data-magnetic]').forEach((el) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = mx - cx; const dy = my - cy;
      const dist = Math.hypot(dx, dy);
      if (dist < 72) {
        const p = (72 - dist) / 72 * 16;
        const a = Math.atan2(dy, dx);
        el.style.transform = `translate(${Math.cos(a) * p}px, ${Math.sin(a) * p}px)`;
        el.style.transition = 'transform 0.12s cubic-bezier(0.22,1,0.36,1)';
      } else if (el.style.transform) {
        el.style.transform = '';
        el.style.transition = 'transform 0.5s cubic-bezier(0.22,1,0.36,1)';
      }
    });
  }, []);

  useEffect(() => {
    document.documentElement.style.cursor = 'none';

    const onMove = (e: MouseEvent) => {
      rX.set(e.clientX); rY.set(e.clientY);
      if (!visible) setVisible(true);
      applyMagnetic(e.clientX, e.clientY);
      if (idleRef.current) clearTimeout(idleRef.current);
    };

    const onOver = (e: MouseEvent) => {
      if ((e.target as HTMLElement)?.closest?.('a, button, [data-cursor]')) setHover(true);
    };
    const onOut = (e: MouseEvent) => {
      if (!(e.relatedTarget as HTMLElement)?.closest?.('a, button, [data-cursor]')) setHover(false);
    };
    const onLeave = () => {
      setVisible(false);
      document.querySelectorAll<HTMLElement>('a, button, [data-magnetic]').forEach(el => { el.style.transform = ''; });
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    document.addEventListener('mouseover', onOver, { passive: true });
    document.addEventListener('mouseout', onOut, { passive: true });
    document.addEventListener('mouseleave', onLeave, { passive: true });
    return () => {
      document.documentElement.style.cursor = '';
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('mouseout', onOut);
      document.removeEventListener('mouseleave', onLeave);
      if (idleRef.current) clearTimeout(idleRef.current);
    };
  }, [rX, rY, visible, applyMagnetic]);

  /* ── Derived sizes ── */
  const bracketSize = hover ? 56 : 30;
  const color = hover ? 'rgba(220,38,38,0.95)' : 'rgba(255,255,255,0.88)';
  const auraOpacity = visible ? 0.06 : 0;

  /* ── SVG bracket corners ── */
  const B = bracketSize;
  const arm = B * 0.35; // length of each bracket arm

  const TL = `M ${arm} 2 L 2 2 L 2 ${arm}`; // top-left L
  const TR = `M ${B - arm} 2 L ${B - 2} 2 L ${B - 2} ${arm}`; // top-right L
  const BL = `M ${arm} ${B - 2} L 2 ${B - 2} L 2 ${B - arm}`; // bottom-left L
  const BR = `M ${B - arm} ${B - 2} L ${B - 2} ${B - 2} L ${B - 2} ${B - arm}`; // bottom-right L

  return (
    <>
      {/* Ghost aura */}
      <motion.div
        style={{
          position: 'fixed', top: 0, left: 0, pointerEvents: 'none', zIndex: 9996,
          width: 100, height: 100,
          marginLeft: -50, marginTop: -50,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 68%)',
          x: aX, y: aY,
        }}
        animate={{ opacity: auraOpacity }}
        transition={{ duration: 0.4 }}
      />

      {/* Viewfinder brackets */}
      <motion.div
        style={{
          position: 'fixed', top: 0, left: 0, pointerEvents: 'none', zIndex: 9998,
          x: bX, y: bY,
        }}
        animate={{
          marginLeft: -(bracketSize / 2),
          marginTop:  -(bracketSize / 2),
          rotate: hover ? 0 : 0,
          opacity: visible ? 1 : 0,
        }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      >
        <motion.svg
          width={bracketSize} height={bracketSize}
          viewBox={`0 0 ${B} ${B}`}
          fill="none"
          animate={{ width: bracketSize, height: bracketSize }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        >
          {[TL, TR, BL, BR].map((d, i) => (
            <motion.path
              key={i} d={d}
              stroke={color}
              strokeWidth={hover ? 1.8 : 1.2}
              strokeLinecap="round" strokeLinejoin="round"
              animate={{ stroke: color, strokeWidth: hover ? 1.8 : 1.2 }}
              transition={{ duration: 0.25 }}
            />
          ))}
          {/* Center tick marks when hovering */}
          {hover && (
            <>
              <motion.line x1={B/2 - 4} y1={B/2} x2={B/2 + 4} y2={B/2} stroke="rgba(220,38,38,0.6)" strokeWidth="0.8" initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
              <motion.line x1={B/2} y1={B/2 - 4} x2={B/2} y2={B/2 + 4} stroke="rgba(220,38,38,0.6)" strokeWidth="0.8" initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
            </>
          )}
        </motion.svg>
      </motion.div>

      {/* Inner crosshair — mix-blend-mode: difference so it works on all backgrounds */}
      <motion.div
        style={{
          position: 'fixed', top: 0, left: 0, pointerEvents: 'none', zIndex: 9999,
          width: 14, height: 14, marginLeft: -7, marginTop: -7,
          x: cX, y: cY,
          mixBlendMode: 'difference',
        }}
        animate={{ opacity: visible ? 1 : 0, scale: hover ? 1.2 : 1 }}
        transition={{ duration: 0.2 }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <line x1="3" y1="7" x2="11" y2="7" stroke="white" strokeWidth="1" strokeLinecap="round" />
          <line x1="7" y1="3" x2="7"  y2="11" stroke="white" strokeWidth="1" strokeLinecap="round" />
          <circle cx="7" cy="7" r="0.7" fill="white" />
        </svg>
      </motion.div>
    </>
  );
}

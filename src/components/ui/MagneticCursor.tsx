import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';

/* ─── Types ─── */
type CursorState = 'default' | 'hover' | 'text' | 'drag' | 'link';

const SPRING_CONFIG = { stiffness: 280, damping: 28, mass: 0.5 };
const OUTER_SPRING  = { stiffness: 140, damping: 20, mass: 0.8 };

export default function MagneticCursor() {
  const cursorX = useMotionValue(-200);
  const cursorY = useMotionValue(-200);
  const outerX  = useMotionValue(-200);
  const outerY  = useMotionValue(-200);

  const springX = useSpring(cursorX, SPRING_CONFIG);
  const springY = useSpring(cursorY, SPRING_CONFIG);
  const outerSX = useSpring(outerX, OUTER_SPRING);
  const outerSY = useSpring(outerY, OUTER_SPRING);

  const [state, setState]   = useState<CursorState>('default');
  const [visible, setVisible] = useState(false);
  const [label, setLabel]   = useState('');
  const rafRef = useRef<number>(0);
  const posRef = useRef({ x: -200, y: -200 });

  const onMove = useCallback((e: MouseEvent) => {
    posRef.current = { x: e.clientX, y: e.clientY };
    cursorX.set(e.clientX);
    cursorY.set(e.clientY);
    outerX.set(e.clientX);
    outerY.set(e.clientY);
    if (!visible) setVisible(true);

    // Magnetic attraction on nearby interactive elements
    const els = document.querySelectorAll<HTMLElement>(
      'button, a, [data-magnetic], [data-cursor]'
    );
    els.forEach((el) => {
      const rect = el.getBoundingClientRect();
      const cx   = rect.left + rect.width / 2;
      const cy   = rect.top  + rect.height / 2;
      const dx   = e.clientX - cx;
      const dy   = e.clientY - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const RANGE = 80;

      if (dist < RANGE) {
        const pull = (RANGE - dist) / RANGE;
        const tx   = -dx * pull * 0.22;
        const ty   = -dy * pull * 0.22;
        el.style.transform  = `translate(${tx}px, ${ty}px)`;
        el.style.transition = 'transform 0.15s ease-out';
      } else {
        if (el.style.transform) {
          el.style.transform  = '';
          el.style.transition = 'transform 0.4s var(--ease-out, cubic-bezier(0.22,1,0.36,1))';
        }
      }
    });
  }, [cursorX, cursorY, outerX, outerY, visible]);

  const onEnter = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const closest = target.closest<HTMLElement>('a, button, [data-cursor]');
    if (!closest) return;
    const cursorType = closest.getAttribute('data-cursor') as CursorState | null;
    const cursorLabel = closest.getAttribute('data-cursor-label') || '';
    setState(cursorType || (closest.tagName === 'A' ? 'link' : 'hover'));
    setLabel(cursorLabel);
  }, []);

  const onLeave = useCallback((e: MouseEvent) => {
    const related = e.relatedTarget as HTMLElement | null;
    const isInteractive = related?.closest('a, button, [data-cursor]');
    if (!isInteractive) {
      setState('default');
      setLabel('');
    }
  }, []);

  const onMouseOut = useCallback(() => {
    setVisible(false);
    cancelAnimationFrame(rafRef.current);
  }, []);

  useEffect(() => {
    document.documentElement.style.cursor = 'none';
    window.addEventListener('mousemove', onMove, { passive: true });
    document.addEventListener('mouseover',  onEnter, { passive: true });
    document.addEventListener('mouseout',   onLeave, { passive: true });
    document.addEventListener('mouseleave', onMouseOut, { passive: true });
    return () => {
      document.documentElement.style.cursor = '';
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseover', onEnter);
      document.removeEventListener('mouseout',  onLeave);
      document.removeEventListener('mouseleave', onMouseOut);
    };
  }, [onMove, onEnter, onLeave, onMouseOut]);

  const isHover = state !== 'default';

  /* ── Inner dot ── */
  const dotSize      = isHover ? 5 : 5;
  const dotOpacity   = isHover ? 0 : 1;

  /* ── Outer ring ── */
  const ringSize     = isHover ? 72 : 36;
  const ringOpacity  = visible ? (isHover ? 0.9 : 0.55) : 0;
  const ringBorder   = isHover
    ? '1.5px solid rgba(220,38,38,0.7)'
    : '1px solid rgba(255,255,255,0.35)';
  const ringBg       = isHover
    ? 'rgba(220,38,38,0.06)'
    : 'transparent';

  return (
    <>
      {/* Outer trailing ring */}
      <motion.div
        style={{
          x: outerSX,
          y: outerSY,
          position: 'fixed',
          top: 0,
          left: 0,
          width:  ringSize,
          height: ringSize,
          marginLeft: -(ringSize / 2),
          marginTop:  -(ringSize / 2),
          borderRadius: '50%',
          border: ringBorder,
          background: ringBg,
          opacity: ringOpacity,
          pointerEvents: 'none',
          zIndex: 'var(--z-cursor, 9999)' as unknown as number,
          backdropFilter: isHover ? 'blur(4px)' : undefined,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          mixBlendMode: 'normal',
        }}
        animate={{
          width:  ringSize,
          height: ringSize,
          marginLeft: -(ringSize / 2),
          marginTop:  -(ringSize / 2),
          border: ringBorder,
          background: ringBg,
          opacity: ringOpacity,
        }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      >
        {label && (
          <span style={{
            fontFamily: 'var(--font-display)',
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.08em',
            color: '#dc2626',
            textTransform: 'uppercase',
            userSelect: 'none',
          }}>
            {label}
          </span>
        )}
      </motion.div>

      {/* Inner precision dot */}
      <motion.div
        style={{
          x: springX,
          y: springY,
          position: 'fixed',
          top: 0,
          left: 0,
          width:  dotSize,
          height: dotSize,
          marginLeft: -(dotSize / 2),
          marginTop:  -(dotSize / 2),
          borderRadius: '50%',
          background: isHover ? '#dc2626' : 'rgba(255,255,255,0.9)',
          opacity: visible ? (isHover ? 0.9 : dotOpacity) : 0,
          pointerEvents: 'none',
          zIndex: 'var(--z-cursor, 9999)' as unknown as number,
        }}
        animate={{ opacity: visible ? (isHover ? 0 : 1) : 0 }}
        transition={{ duration: 0.2 }}
      />

      {/* Subtle red glow on hover */}
      {isHover && visible && (
        <motion.div
          style={{
            x: outerSX,
            y: outerSY,
            position: 'fixed',
            top: 0,
            left: 0,
            width:  120,
            height: 120,
            marginLeft: -60,
            marginTop:  -60,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(220,38,38,0.08) 0%, transparent 70%)',
            pointerEvents: 'none',
            zIndex: 'var(--z-cursor, 9998)' as unknown as number,
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        />
      )}
    </>
  );
}

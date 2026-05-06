import React, { useEffect, useRef, useState } from 'react';
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';

/* ─── Scramble text hook ─── */
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function useScramble(target: string, trigger: boolean, speed = 40) {
  const [display, setDisplay] = useState(target);
  const rafRef = useRef(0);
  const iterRef = useRef(0);

  useEffect(() => {
    if (!trigger) return;
    iterRef.current = 0;
    cancelAnimationFrame(rafRef.current);

    const animate = () => {
      iterRef.current += 0.5;
      const iter = iterRef.current;
      setDisplay(
        target.split('').map((ch, i) => {
          if (ch === ' ') return ' ';
          if (i < iter) return target[i];
          return CHARS[Math.floor(Math.random() * CHARS.length)];
        }).join('')
      );
      if (iter < target.length) rafRef.current = requestAnimationFrame(animate);
      else setDisplay(target);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, trigger]);

  return display;
}

/* ─── Word mask reveal ─── */
const WordReveal: React.FC<{ text: string; delay?: number; className?: string; style?: React.CSSProperties }> = ({
  text, delay = 0, style,
}) => {
  const words = text.split(' ');
  return (
    <span style={{ display: 'block', ...style }}>
      {words.map((word, i) => (
        <span key={i} style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'top' }}>
          <motion.span
            style={{ display: 'inline-block' }}
            initial={{ y: '110%', opacity: 0 }}
            animate={{ y: '0%', opacity: 1 }}
            transition={{
              duration: 0.85,
              delay: delay + i * 0.08,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            {word}{i < words.length - 1 ? ' ' : ''}
          </motion.span>
        </span>
      ))}
    </span>
  );
};

/* ─── Marquee strip ─── */
const clients = [
  'VIENNA TOURISM BOARD', 'KUNSTHISTORISCHES MUSEUM', 'STADT WIEN', 'PRATER WIEN',
  'WIEN KULTUR', 'SCHLOSS SCHÖNBRUNN', 'ÖSTERREICHISCHE GALERIE', 'MARKTAMT WIEN',
];

const Marquee: React.FC = () => {
  const items = [...clients, ...clients];
  return (
    <div style={{ overflow: 'hidden', width: '100%' }}>
      <motion.div
        style={{ display: 'flex', gap: '80px', whiteSpace: 'nowrap' }}
        animate={{ x: ['0%', '-50%'] }}
        transition={{ duration: 32, ease: 'linear', repeat: Infinity }}
      >
        {items.map((c, i) => (
          <span key={i} style={{
            fontFamily: 'var(--font-display)',
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: '0.2em',
            color: 'rgba(255,255,255,0.2)',
            textTransform: 'uppercase',
            flexShrink: 0,
          }}>
            {c}
            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'rgba(220,38,38,0.5)', margin: '0 40px', verticalAlign: 'middle' }} />
          </span>
        ))}
      </motion.div>
    </div>
  );
};

/* ─── Stats row ─── */
const stats = [
  { value: '150+', label: 'Projects' },
  { value: '12', label: 'Countries' },
  { value: '8', label: 'Years' },
  { value: '100%', label: 'Premium' },
];

/* ─── Main Hero ─── */
const HeroSection: React.FC = () => {
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollY } = useScroll();
  const titleY = useTransform(scrollY, [0, 600], [0, 80]);
  const opacity = useTransform(scrollY, [0, 400], [1, 0]);
  const scramble1 = useScramble('FRAMES', mounted, 35);
  const scramble2 = useScramble('DEFINE', mounted, 45);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 200);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        minHeight: '100vh',
        backgroundColor: 'var(--color-bg-void)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* 1. NOISE TEXTURE — feTurbulence overlay */}
      <div style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 9999,
        mixBlendMode: 'overlay',
        opacity: 0.03,
      }}>
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <filter id="grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter="url(#grain)" />
        </svg>
      </div>

      {/* 2. SCAN LINE — sweeping horizontal line */}
      <motion.div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          height: 1,
          backgroundColor: 'rgba(255,255,255,0.04)',
          pointerEvents: 'none',
          zIndex: 50,
        }}
        animate={{ y: ['0vh', '100vh'] }}
        transition={{ duration: 8, ease: 'linear', repeat: Infinity }}
      />

      {/* 3. AMBIENT ORBS */}
      <div style={{
        position: 'absolute',
        top: -80,
        left: -80,
        width: 400,
        height: 400,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(220,38,38,0.04) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute',
        bottom: -100,
        right: -100,
        width: 500,
        height: 500,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(180,160,255,0.03) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* 4. CORNER DECORATIONS — L-shaped viewfinder brackets */}
      {[
        { top: 32, left: 32, rotation: 0 },
        { top: 32, right: 32, rotation: 90 },
        { bottom: 32, left: 32, rotation: -90 },
        { bottom: 32, right: 32, rotation: 180 },
      ].map((corner, idx) => (
        <motion.div
          key={idx}
          style={{
            position: 'absolute',
            top: corner.top ?? undefined,
            bottom: corner.bottom ?? undefined,
            left: corner.left ?? undefined,
            right: corner.right ?? undefined,
            width: 20,
            height: 20,
            pointerEvents: 'none',
            zIndex: 40,
          }}
          initial={{ opacity: 0 }}
          animate={mounted ? { opacity: 1 } : {}}
          transition={{ duration: 0.6, delay: 1.8, ease: 'easeOut' }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ transform: `rotate(${corner.rotation}deg)` }}>
            <path d="M0 0V6" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
            <path d="M0 0H6" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
          </svg>
        </motion.div>
      ))}

      {/* 5. VERTICAL TEXT LABEL */}
      <div style={{
        position: 'absolute',
        left: 24,
        top: 0,
        bottom: 0,
        display: 'flex',
        alignItems: 'center',
        pointerEvents: 'none',
        zIndex: 40,
      }}>
        <span style={{
          transform: 'rotate(-90deg)',
          transformOrigin: 'center center',
          whiteSpace: 'nowrap',
          fontFamily: 'var(--font-display)',
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: '0.25em',
          color: 'rgba(255,255,255,0.18)',
          textTransform: 'uppercase',
        }}>
          NEXUS LINK PRODUCTIONS — EST. 2016
        </span>
      </div>

      {/* Ambient grid */}
      <div style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: `
          linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)
        `,
        backgroundSize: '80px 80px',
        pointerEvents: 'none',
        maskImage: 'radial-gradient(ellipse 80% 80% at 50% 0%, black 0%, transparent 100%)',
      }} />

      {/* Red ambient light top-right */}
      <div style={{
        position: 'absolute',
        top: '-10%',
        right: '-5%',
        width: 600,
        height: 600,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(220,38,38,0.07) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Main content */}
      <motion.div
        style={{ y: titleY, opacity, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}
      >
        {/* Overline */}
        <motion.div
          style={{ paddingTop: 120, paddingLeft: 'var(--container-px)', paddingRight: 'var(--container-px)' }}
          initial={{ opacity: 0 }}
          animate={mounted ? { opacity: 1 } : {}}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 48,
          }}>
            <span style={{ width: 32, height: 1, background: 'rgba(220,38,38,0.6)' }} />
            <span style={{
              fontFamily: 'var(--font-display)',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.22em',
              color: '#dc2626',
              textTransform: 'uppercase',
            }}>
              Nexus Link Productions
            </span>
          </div>
        </motion.div>

        {/* Headline */}
        <div style={{
          paddingLeft: 'var(--container-px)',
          paddingRight: 'var(--container-px)',
          maxWidth: 1400,
        }}>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-hero)',
            fontWeight: 700,
            lineHeight: 'var(--leading-tight)',
            letterSpacing: '-0.04em',
            color: 'var(--color-text-primary)',
            margin: 0,
          }}>
            {mounted && (
              <>
                <WordReveal text={`${scramble1} THAT LAST.`} delay={0.2} />
                <WordReveal
                  text={`STORIES THAT ${scramble2}.`}
                  delay={0.35}
                  style={{ color: 'rgba(245,245,247,0.45)' }}
                />
              </>
            )}
          </h1>
        </div>

        {/* Sub copy + CTA */}
        <motion.div
          style={{
            paddingLeft: 'var(--container-px)',
            paddingRight: 'var(--container-px)',
            marginTop: 56,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 40,
          }}
          initial={{ opacity: 0, y: 20 }}
          animate={mounted ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, delay: 1.1, ease: [0.22, 1, 0.36, 1] }}
        >
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'clamp(16px, 1.5vw, 19px)',
            fontWeight: 300,
            lineHeight: 1.65,
            color: 'var(--color-text-secondary)',
            maxWidth: 400,
            margin: 0,
          }}>
            Vienna-based cinematic production house.
            We turn brand ambition into films that
            demand attention — across every screen, every market.
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <Link
              to="/work"
              data-magnetic
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 14,
                fontWeight: 600,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--color-text-primary)',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              View Our Work
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 40,
                height: 40,
                borderRadius: '50%',
                border: '1px solid rgba(255,255,255,0.15)',
              }}>→</span>
            </Link>

            <Link
              to="/showreel"
              data-magnetic
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 14,
                fontWeight: 600,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: '#dc2626',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              ▶ Showreel
            </Link>
          </div>
        </motion.div>
      </motion.div>

      {/* Stats row */}
      <motion.div
        style={{
          borderTop: '1px solid var(--color-border-subtle)',
          marginTop: 80,
          padding: '32px var(--container-px)',
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
        }}
        initial={{ opacity: 0 }}
        animate={mounted ? { opacity: 1 } : {}}
        transition={{ duration: 0.8, delay: 1.4 }}
      >
        {stats.map((s, i) => (
          <div key={i} style={{
            borderLeft: i > 0 ? '1px solid var(--color-border-subtle)' : undefined,
            paddingLeft: i > 0 ? 32 : 0,
          }}>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(28px, 3.5vw, 42px)',
              fontWeight: 700,
              color: 'var(--color-text-primary)',
              lineHeight: 1,
              letterSpacing: '-0.03em',
            }}>{s.value}</div>
            <div style={{
              fontFamily: 'var(--font-body)',
              fontSize: 12,
              fontWeight: 500,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--color-text-tertiary)',
              marginTop: 6,
            }}>{s.label}</div>
          </div>
        ))}
      </motion.div>

      {/* Marquee */}
      <motion.div
        style={{
          borderTop: '1px solid var(--color-border-subtle)',
          paddingBlock: 18,
          overflow: 'hidden',
        }}
        initial={{ opacity: 0 }}
        animate={mounted ? { opacity: 1 } : {}}
        transition={{ duration: 0.6, delay: 1.6 }}
      >
        <Marquee />
      </motion.div>
    </div>
  );
};

export default HeroSection;

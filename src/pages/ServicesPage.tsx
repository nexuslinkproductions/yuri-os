import React, { useRef, useState, useEffect } from 'react';
import { motion, useScroll, useTransform, useInView } from 'framer-motion';
import { Link } from 'react-router-dom';

/* ─── Character-by-character reveal ─── */
const CharReveal: React.FC<{ text: string; delay?: number; stagger?: number; style?: React.CSSProperties }> = ({
  text, delay = 0, stagger = 0.03, style
}) => (
  <span style={{ display: 'inline-block', ...style }}>
    {text.split('').map((ch, i) => (
      <motion.span
        key={i}
        style={{ display: 'inline-block' }}
        initial={{ opacity: 0, y: 14, rotateX: 40 }}
        whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
        viewport={{ once: false, margin: '-80px' }}
        transition={{ duration: 0.45, delay: delay + i * stagger, ease: [0.22, 1, 0.36, 1] }}
      >
        {ch === ' ' ? ' ' : ch}
      </motion.span>
    ))}
  </span>
);

/* ─── Animated highlight bar ─── */
const HighlightBar: React.FC<{ delay?: number }> = ({ delay = 0 }) => (
  <motion.div
    style={{ height: 1, background: 'rgba(220,38,38,0.7)', marginTop: 24, transformOrigin: 'left' }}
    initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: false, margin: '-80px' }}
    transition={{ duration: 1, delay, ease: [0.22, 1, 0.36, 1] }}
  />
);

/* ─── Service data ─── */
const stations = [
  {
    id: 'prima',
    number: '01',
    stage: 'Prima Materia',
    principle: 'As the raw material is, so the work becomes.',
    title: 'Cinematic Production',
    body: 'Full-crew film and video production across Austria and Europe. RED cameras, prime lenses, cinema-grade lighting. We begin where most agencies end — with the unmediated truth of the frame.',
    process: 'DISCOVER',
    processDesc: 'We excavate the story beneath the brief. Deep-dive sessions to uncover the narrative only your brand can tell.',
    bg: '#0e0e18',
    accent: 'right',
  },
  {
    id: 'solutio',
    number: '02',
    stage: 'Solutio',
    principle: 'Dissolve to find the essential truth.',
    title: 'Brand Storytelling',
    body: 'Strategic narrative that transforms your brand identity into visual language audiences feel before they think. We dissolve the brief until only the story remains.',
    process: 'DEVELOP',
    processDesc: 'Scriptwriting, storyboarding, mood architecture. The blueprint for every frame before we roll.',
    bg: '#0f0e18',
    accent: 'left',
  },
  {
    id: 'coagulatio',
    number: '03',
    stage: 'Coagulatio',
    principle: 'Form emerges from the formless.',
    title: 'Post-Production & Grade',
    body: 'DaVinci Resolve color science. After Effects motion. Dolby-approved sound design. Every frame refined until it breathes with intention. The raw becomes the refined.',
    process: 'PRODUCE',
    processDesc: 'Principal photography with cinema-grade gear and seasoned crews — on location, anywhere.',
    bg: '#10101a',
    accent: 'right',
  },
  {
    id: 'sublimatio',
    number: '04',
    stage: 'Sublimatio',
    principle: 'What is elevated cannot be reduced.',
    title: 'Live Event Coverage',
    body: 'Multi-camera live production with real-time switching. Concerts, summits, product launches — we make the transient permanent. The moment becomes the monument.',
    process: 'DELIVER',
    processDesc: 'Color grade, sound mix, final export. Polished and distributed across every screen and market.',
    bg: '#0e101a',
    accent: 'left',
  },
  {
    id: 'multiplicatio',
    number: '05',
    stage: 'Multiplicatio',
    principle: 'From one, the many. From the many, infinity.',
    title: 'Drone & Aerial Cinematography',
    body: 'FAA-equivalent certified operators, DJI Inspire + FPV systems. We ascend above the frame to reveal what was always there — the perspective that changes everything.',
    process: 'ASCEND',
    processDesc: 'The fifth discipline. Where scope becomes scale and vision becomes landscape.',
    bg: '#0e0e1a',
    accent: 'right',
  },
];

/* ─── Single service station ─── */
const Station: React.FC<{ s: typeof stations[0]; i: number; sectionRef: React.RefObject<HTMLDivElement> }> = ({ s, i, sectionRef }) => {
  const inView = useInView(sectionRef, { once: false, margin: '-20%' });
  const isLeft = s.accent === 'left';

  return (
    <section style={{
      minHeight: '100vh',
      background: s.bg,
      display: 'flex',
      alignItems: 'center',
      padding: '80px clamp(32px, 6vw, 100px)',
      position: 'relative',
      overflow: 'hidden',
      perspective: 1200,
    }}>
      {/* Ghost number */}
      <motion.div
        style={{
          position: 'absolute',
          [isLeft ? 'right' : 'left']: '-2vw',
          top: '50%', transform: 'translateY(-60%)',
          fontSize: 'clamp(160px, 28vw, 360px)',
          fontWeight: 800, lineHeight: 1,
          color: 'rgba(255,255,255,0.03)',
          userSelect: 'none', pointerEvents: 'none',
          letterSpacing: '-0.06em',
        }}
        initial={{ x: isLeft ? 60 : -60, opacity: 0 }}
        whileInView={{ x: 0, opacity: 1 }}
        viewport={{ once: false, margin: '-15%' }}
        transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
      >
        {s.number}
      </motion.div>

      {/* Rotating geometric accent */}
      <motion.div
        style={{
          position: 'absolute',
          [isLeft ? 'left' : 'right']: 'clamp(20px, 5vw, 80px)',
          top: '50%', transform: 'translateY(-50%)',
          width: 120, height: 120,
          border: '1px solid rgba(220,38,38,0.15)',
          borderRadius: '50%',
          pointerEvents: 'none',
        }}
        animate={{ rotate: inView ? 360 : 0 }}
        transition={{ duration: 20, ease: 'linear', repeat: Infinity }}
      >
        <div style={{
          position: 'absolute', top: '50%', left: 0,
          width: '100%', height: 1,
          background: 'rgba(220,38,38,0.2)',
          transform: 'translateY(-50%)',
        }} />
        <div style={{
          position: 'absolute', top: 0, left: '50%',
          width: 1, height: '100%',
          background: 'rgba(220,38,38,0.2)',
          transform: 'translateX(-50%)',
        }} />
      </motion.div>

      {/* Main content */}
      <div style={{ maxWidth: 1100, margin: '0 auto', width: '100%', zIndex: 2 }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 'clamp(40px, 8vw, 120px)',
          alignItems: 'center',
          flexDirection: isLeft ? 'row-reverse' : 'row' as any,
        }}>
          {/* LEFT: main info */}
          <motion.div
            style={{ order: isLeft ? 1 : 0 }}
            initial={{ opacity: 0, rotateX: 8, y: 50 }}
            whileInView={{ opacity: 1, rotateX: 0, y: 0 }}
            viewport={{ once: false, margin: '-15%' }}
            transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
          >
            {/* Stage label */}
            <motion.div
              style={{
                display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28,
              }}
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: false, margin: '-15%' }}
              transition={{ duration: 0.7, delay: 0.2 }}
            >
              <span style={{ width: 24, height: 1, background: '#dc2626', flexShrink: 0 }} />
              <span style={{
                fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 600,
                letterSpacing: '0.22em', color: '#dc2626', textTransform: 'uppercase',
              }}>{s.stage}</span>
            </motion.div>

            {/* Title - character animated */}
            <h2 style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(36px, 5.5vw, 80px)',
              fontWeight: 700, lineHeight: 1.05, letterSpacing: '-0.04em',
              margin: '0 0 8px', color: 'var(--color-text-primary)',
              perspective: 600,
            }}>
              <CharReveal text={s.title} delay={0.25} stagger={0.025} />
            </h2>

            <HighlightBar delay={0.6} />

            {/* Hermetic principle */}
            <motion.p
              style={{
                fontFamily: 'Georgia, serif', fontStyle: 'italic',
                fontSize: 14, lineHeight: 1.6,
                color: 'rgba(255,255,255,0.3)', margin: '20px 0 28px',
                letterSpacing: '0.02em',
              }}
              initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: false }}
              transition={{ duration: 0.8, delay: 0.7 }}
            >
              "{s.principle}"
            </motion.p>

            {/* Body */}
            <motion.p
              style={{
                fontFamily: 'var(--font-body)', fontSize: 'clamp(15px, 1.4vw, 17px)',
                lineHeight: 1.75, color: 'var(--color-text-secondary)',
                fontWeight: 300, margin: 0,
              }}
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: false, margin: '-15%' }}
              transition={{ duration: 0.8, delay: 0.5 }}
            >
              {s.body}
            </motion.p>
          </motion.div>

          {/* RIGHT: process integration */}
          <motion.div
            style={{
              order: isLeft ? 0 : 1,
              borderLeft: '1px solid rgba(255,255,255,0.06)',
              paddingLeft: 'clamp(24px, 4vw, 60px)',
            }}
            initial={{ opacity: 0, x: isLeft ? -40 : 40, rotateY: isLeft ? -6 : 6 }}
            whileInView={{ opacity: 1, x: 0, rotateY: 0 }}
            viewport={{ once: false, margin: '-15%' }}
            transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
          >
            {/* Process step */}
            <div style={{ marginBottom: 40 }}>
              <div style={{
                fontFamily: 'var(--font-display)', fontSize: 10,
                letterSpacing: '0.3em', textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.2)', marginBottom: 12,
              }}>Process Layer</div>
              <motion.div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'clamp(28px, 4vw, 52px)',
                  fontWeight: 700, letterSpacing: '-0.03em',
                  color: 'rgba(255,255,255,0.08)',
                  lineHeight: 1,
                }}
                initial={{ opacity: 0, scale: 0.92 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: false }}
                transition={{ duration: 1, delay: 0.4 }}
              >
                {s.process}
              </motion.div>
              <motion.p
                style={{
                  fontFamily: 'var(--font-body)', fontSize: 14,
                  color: 'rgba(255,255,255,0.35)', lineHeight: 1.65,
                  margin: '16px 0 0', fontWeight: 300,
                }}
                initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: false }}
                transition={{ duration: 0.8, delay: 0.6 }}
              >
                {s.processDesc}
              </motion.p>
            </div>

            {/* Rotating station indicator */}
            <motion.div
              style={{
                display: 'flex', alignItems: 'center', gap: 16,
                opacity: 0.4,
              }}
              initial={{ opacity: 0 }} whileInView={{ opacity: 0.4 }} viewport={{ once: false }}
              transition={{ delay: 0.8 }}
            >
              <motion.div
                style={{
                  width: 32, height: 32,
                  border: '1px solid rgba(255,255,255,0.3)',
                  borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                animate={{ rotate: 360 }}
                transition={{ duration: 12, ease: 'linear', repeat: Infinity }}
              >
                <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#dc2626' }} />
              </motion.div>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)' }}>
                Station {s.number} of 05
              </span>
            </motion.div>
          </motion.div>
        </div>
      </div>

      {/* Bottom progress line */}
      <motion.div
        style={{ position: 'absolute', bottom: 0, left: 0, height: 1, background: 'rgba(255,255,255,0.06)' }}
        initial={{ width: '0%' }} whileInView={{ width: '100%' }} viewport={{ once: false, margin: '-20%' }}
        transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1], delay: 0.4 }}
      />
    </section>
  );
};

/* ─── Orbital synthesis section ─── */
const Synthesis: React.FC = () => {
  const [angle, setAngle] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setAngle(a => (a + 0.3) % 360), 16);
    return () => clearInterval(id);
  }, []);

  return (
    <section style={{
      minHeight: '80vh',
      background: '#0e0e18',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      position: 'relative', overflow: 'hidden', padding: '80px 24px',
    }}>
      {/* Orbiting service labels */}
      <div style={{ position: 'relative', width: 320, height: 320, marginBottom: 64 }}>
        {stations.map((s, i) => {
          const a = (angle + i * 72) * (Math.PI / 180);
          const r = 130;
          const x = 160 + r * Math.cos(a);
          const y = 160 + r * Math.sin(a);
          return (
            <div key={s.id} style={{
              position: 'absolute',
              left: x, top: y,
              transform: 'translate(-50%, -50%)',
              fontFamily: 'var(--font-display)', fontSize: 10,
              letterSpacing: '0.15em', textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.3)',
              whiteSpace: 'nowrap',
              transition: 'none',
            }}>
              {s.stage}
            </div>
          );
        })}
        {/* Center symbol */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: 48, height: 48,
          border: '1px solid rgba(220,38,38,0.3)',
          borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#dc2626', opacity: 0.7 }} />
        </div>
        {/* Orbit rings */}
        {[130, 100, 60].map((r, i) => (
          <div key={i} style={{
            position: 'absolute', top: '50%', left: '50%',
            width: r * 2, height: r * 2,
            transform: 'translate(-50%, -50%)',
            border: '1px solid rgba(255,255,255,0.04)',
            borderRadius: '50%',
          }} />
        ))}
      </div>

      <motion.h2
        style={{
          fontFamily: 'Georgia, serif', fontStyle: 'italic',
          fontSize: 'clamp(2rem, 5vw, 4rem)',
          fontWeight: 400, letterSpacing: '-0.01em',
          color: 'var(--color-text-primary)', margin: '0 0 16px', textAlign: 'center',
        }}
        initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: false }}
        transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
      >
        The Great Work
      </motion.h2>

      <motion.p
        style={{
          fontFamily: 'var(--font-body)', fontSize: 16,
          color: 'var(--color-text-secondary)', textAlign: 'center',
          maxWidth: 480, lineHeight: 1.65, fontWeight: 300, margin: '0 0 48px',
        }}
        initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: false }}
        transition={{ duration: 0.8, delay: 0.2 }}
      >
        Five disciplines in perpetual orbit. From prima materia to multiplicatio — the complete cycle of creation.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: false }}
        transition={{ duration: 0.7, delay: 0.4 }}
      >
        <Link to="/contact" data-magnetic style={{
          fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600,
          letterSpacing: '0.12em', textTransform: 'uppercase',
          color: 'var(--color-text-primary)', textDecoration: 'none',
          display: 'inline-flex', alignItems: 'center', gap: 12,
          padding: '18px 48px', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 2,
        }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(220,38,38,0.5)'; (e.currentTarget as HTMLElement).style.color = '#dc2626'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.12)'; (e.currentTarget as HTMLElement).style.color = 'var(--color-text-primary)'; }}
        >
          Begin the Process →
        </Link>
      </motion.div>
    </section>
  );
};

/* ─── Page ─── */
export default function ServicesPage() {
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: containerRef });
  const headingOpacity = useTransform(scrollYProgress, [0, 0.05], [0.07, 0]);
  const lineScale = useTransform(scrollYProgress, [0, 0.04], [0, 1]);

  const scrollTo = (i: number) => sectionRefs.current[i]?.scrollIntoView({ behavior: 'smooth' });

  return (
    <motion.div
      ref={containerRef}
      style={{ background: '#0e0e18', color: 'var(--color-text-primary)', overflowX: 'hidden' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}
    >
      {/* ── INTRO ── */}
      <section style={{
        height: '100vh', background: '#0e0e18',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Orbital nav */}
        <nav style={{
          position: 'absolute', top: 100, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', gap: 40, zIndex: 10,
        }}>
          {stations.map((s, i) => (
            <motion.button key={s.id} onClick={() => scrollTo(i)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0',
                fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '0.18em',
                textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)',
              }}
              initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.5 + i * 0.08 }}
              whileHover={{ color: 'rgba(255,255,255,0.8)' }}
            >
              {s.stage}
            </motion.button>
          ))}
        </nav>

        {/* THE CRAFT — fades as you scroll */}
        <motion.h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(80px, 14vw, 180px)',
            fontWeight: 800, letterSpacing: '-0.06em', lineHeight: 1,
            color: '#fff', margin: 0, textAlign: 'center',
            opacity: headingOpacity as any,
            userSelect: 'none',
          }}
        >
          THE CRAFT
        </motion.h1>

        <motion.p
          style={{
            fontFamily: 'var(--font-body)', fontSize: 13, letterSpacing: '0.35em',
            textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', marginTop: 24,
          }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.8 }}
        >
          Five disciplines. One vision.
        </motion.p>

        {/* Red line draws on mount */}
        <motion.div
          style={{
            position: 'absolute', bottom: 80, left: 0, height: 1,
            background: 'rgba(220,38,38,0.6)',
            scaleX: lineScale as any, transformOrigin: '0% 50%', width: '100%',
          }}
        />

        {/* Scroll cue */}
        <motion.div
          style={{ position: 'absolute', bottom: 40, left: '50%', transform: 'translateX(-50%)' }}
          animate={{ y: [0, 8, 0] }} transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <div style={{ width: 1, height: 32, background: 'linear-gradient(to bottom, rgba(255,255,255,0.4), transparent)' }} />
        </motion.div>
      </section>

      {/* ── SERVICE STATIONS ── */}
      {stations.map((s, i) => (
        <div key={s.id} ref={el => { sectionRefs.current[i] = el; }}>
          <Station s={s} i={i} sectionRef={{ current: sectionRefs.current[i] } as React.RefObject<HTMLDivElement>} />
        </div>
      ))}

      {/* ── SYNTHESIS ── */}
      <Synthesis />
    </motion.div>
  );
}

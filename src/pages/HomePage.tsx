import { useEffect, useMemo, useState } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Link } from 'react-router-dom';
import CTABanner from '../components/CTABanner';
import type React from 'react';

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const glyphs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789./';

function FrameCorners() {
  return <div className="frame-corners" aria-hidden="true"><span /><span /><span /><span /></div>;
}

function ScrambleText({ text, start = false }: { text: string; start?: boolean }) {
  const [value, setValue] = useState('');

  useEffect(() => {
    if (!start) return undefined;
    let frame = 0;
    const total = 46;
    const id = window.setInterval(() => {
      frame += 1;
      const next = text
        .split('')
        .map((char, index) => {
          if (char === ' ') return ' ';
          if (frame > index * 1.4 + total * 0.38) return char;
          return glyphs[Math.floor(Math.random() * glyphs.length)];
        })
        .join('');
      setValue(next);
      if (frame >= total + text.length * 1.5) {
        setValue(text);
        window.clearInterval(id);
      }
    }, 28);

    return () => window.clearInterval(id);
  }, [start, text]);

  return <>{value || text}</>;
}

const processSteps = [
  {
    number: '01',
    title: 'Discover',
    copy: 'Brand, audience, offer, and tension. The first step is not a moodboard. It is finding the frame that makes the brand unavoidable.',
  },
  {
    number: '02',
    title: 'Develop',
    copy: 'Concept, shot logic, scripting, and format planning. The campaign is mapped before the camera moves.',
  },
  {
    number: '03',
    title: 'Produce',
    copy: 'Shoot, direct, light, capture, and adapt. Controlled production pace without losing the rough edge that makes the work alive.',
  },
  {
    number: '04',
    title: 'Deliver',
    copy: 'Edit, color, motion, sound, export, and publish-ready versions for every platform the asset has to survive.',
  },
];

const stats = [
  { value: 'Wide', label: 'Portfolio' },
  { value: '6', label: 'Years' },
  { value: '3', label: 'Partners' },
];

function ProcessCard({ step, index }: { step: (typeof processSteps)[number]; index: number }) {
  return (
    <motion.article
      className="depth-card"
      data-tilt
      data-magnetic
      data-proximity
      style={{
        '--z-depth': `${24 + index * 8}px`,
        minHeight: 310,
        padding: 28,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      } as React.CSSProperties}
      initial={{ opacity: 0, y: 44 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: false, margin: '-12%' }}
      transition={{ duration: 0.7, delay: index * 0.09, ease: EASE }}
    >
      <div>
        <div
          style={{
            color: 'var(--color-crimson)',
            fontFamily: 'var(--font-display)',
            fontSize: 44,
            fontWeight: 900,
            lineHeight: 1,
            opacity: 0.72,
            marginBottom: 28,
          }}
        >
          {step.number}
        </div>
        <h3 style={{ fontSize: 28, fontWeight: 850, letterSpacing: 0, marginBottom: 14 }}>{step.title}</h3>
      </div>
      <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.72, fontWeight: 300 }}>{step.copy}</p>
    </motion.article>
  );
}

function Hero() {
  const [ready, setReady] = useState(false);
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 560], [0, 80]);
  const opacity = useTransform(scrollY, [0, 520], [1, 0.14]);
  const scale = useTransform(scrollY, [0, 520], [1, 0.965]);

  useEffect(() => {
    const id = window.setTimeout(() => setReady(true), 180);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <motion.section
      className="spatial-section frame-shell"
      data-proximity
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        paddingTop: 116,
        paddingBottom: 34,
        y,
        opacity,
        scale,
      }}
    >
      <FrameCorners />
      <div className="container" style={{ position: 'relative', zIndex: 3 }}>
        <div className="hero-readability" aria-hidden="true" />
        <motion.div
          className="kicker"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15, ease: EASE }}
        >
          Vienna / Premium Brand Content
        </motion.div>

        <motion.h1
          style={{
            maxWidth: 1220,
            margin: '26px 0 0',
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-hero)',
            fontWeight: 900,
            letterSpacing: '-0.01em',
            lineHeight: 0.88,
            color: 'var(--color-text-primary)',
            textTransform: 'uppercase',
            textShadow: '0 1px 0 rgba(0,0,0,0.45), 0 0 60px rgba(0,0,0,0.55)',
          }}
          initial={{ opacity: 0, y: 56, rotateX: 8 }}
          animate={{ opacity: 1, y: 0, rotateX: 0 }}
          transition={{ duration: 0.92, delay: 0.22, ease: EASE }}
        >
          <ScrambleText text="FRAMES THAT DEFINE." start={ready} />
        </motion.h1>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 620px) minmax(280px, 420px)',
            gap: 'clamp(36px, 8vw, 120px)',
            alignItems: 'end',
            marginTop: 34,
          }}
          className="hero-lower"
        >
          <motion.p
            className="section-copy"
            style={{ margin: 0 }}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, delay: 0.82, ease: EASE }}
          >
            Nexus Link Productions builds premium campaign assets, short-form video, brand content, and motion systems for brands that need a sharper visual memory.
          </motion.p>

          <motion.div
            data-proximity
            style={{
              padding: '14px 4px',
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 4,
              borderTop: '1px solid var(--color-border-subtle)',
            } as React.CSSProperties}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, delay: 1.02, ease: EASE }}
          >
            {stats.map((stat, index) => (
              <div
                key={stat.label}
                style={{
                  padding: '6px 14px',
                  borderLeft: index === 0 ? '0' : '1px solid var(--color-border-subtle)',
                }}
              >
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 850, lineHeight: 1, color: 'var(--color-text-primary)' }}>{stat.value}</div>
                <div style={{ marginTop: 6, color: 'var(--color-text-tertiary)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase' }}>{stat.label}</div>
              </div>
            ))}
          </motion.div>
        </div>

        <motion.div
          style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 44 }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, delay: 1.16, ease: EASE }}
        >
          <Link to="/work" data-magnetic className="magnetic-link cta-button cta-button--primary">
            View Work <span aria-hidden="true">-&gt;</span>
          </Link>
          <Link to="/contact" data-magnetic className="magnetic-link cta-button">
            Start a Project
          </Link>
        </motion.div>
      </div>

      <style>{`
        @media (max-width: 920px) {
          .hero-lower {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </motion.section>
  );
}

export default function HomePage() {
  const testimonial = useMemo(() => ({
    quote: 'The best brand assets do not decorate a campaign. They decide how the audience remembers it.',
    author: 'Nexus Link Productions',
  }), []);

  return (
    <div className="spatial-page">
      <Hero />

      <section className="spatial-section section-diagonal" data-proximity>
        <div className="container">
          <motion.div
            initial={{ opacity: 0, y: 28 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, margin: '-14%' }}
            transition={{ duration: 0.7, ease: EASE }}
          >
            <div className="kicker">Process</div>
            <h2 className="section-title">A four-phase production room.</h2>
            <p className="section-copy">
              Every phase is its own station: strategy at the horizon, production in the room, delivery pushed forward.
            </p>
          </motion.div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
              gap: 18,
              marginTop: 54,
              perspective: 1200,
            }}
            className="process-grid"
          >
            {processSteps.map((step, index) => <ProcessCard key={step.number} step={step} index={index} />)}
          </div>
        </div>
      </section>

      <section className="spatial-section spatial-section--compact" data-proximity>
        <div className="container">
          <motion.div
            className="depth-panel frame-shell"
            data-tilt
            style={{
              '--z-depth': '38px',
              position: 'relative',
              padding: 'clamp(36px, 7vw, 86px)',
              textAlign: 'center',
            } as React.CSSProperties}
            initial={{ opacity: 0, scale: 0.97 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: false, margin: '-18%' }}
            transition={{ duration: 0.8, ease: EASE }}
          >
            <FrameCorners />
            <blockquote
              style={{
                maxWidth: 920,
                margin: '0 auto',
                fontFamily: 'var(--font-serif)',
                fontSize: 'clamp(26px, 4.6vw, 62px)',
                fontStyle: 'italic',
                lineHeight: 1.16,
                color: 'var(--color-text-primary)',
              }}
            >
              "{testimonial.quote}"
            </blockquote>
            <cite
              style={{
                display: 'block',
                marginTop: 28,
                color: 'var(--color-text-tertiary)',
                fontFamily: 'var(--font-display)',
                fontSize: 12,
                fontStyle: 'normal',
                fontWeight: 800,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
              }}
            >
              {testimonial.author}
            </cite>
          </motion.div>
        </div>
      </section>

      <CTABanner
        headline="Build the asset your campaign bends around."
        sub="Commercial, social, documentary, post, and motion inside one controlled production system."
        buttonLabel="Start a Project"
      />

      <style>{`
        @media (max-width: 1100px) {
          .process-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
        }

        @media (max-width: 680px) {
          .process-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

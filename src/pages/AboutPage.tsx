import { useEffect, useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import type React from 'react';

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const career = [
  { year: '2021', title: 'Oldschoolgym24', meta: 'Studio Manager / Social Media Support - Baar, Switzerland', detail: 'Daily operations, community content, customer communication, and the first durable rhythm of visual presence.' },
  { year: '2023', title: 'Apollon Nutrition EU', meta: 'Sales & Marketing Support / Content Production - Switzerland', detail: 'Product content, e-commerce visuals, cinematic brand videos, release assets, commercial production, color, sound, and edit delivery.' },
  { year: '2024', title: 'Fitness Network & Public Figures', meta: 'Video Editor / Videographer / Social Media Assistant - EU-wide', detail: 'The fitness network came first: public figure production, athlete content, YouTube workflows, event coverage, travel-based footage, and fast post-production around names including Mike Sommerfeld.' },
  { year: '2025', title: 'R. Tattoo x Barber', meta: 'Senior Content Producer / Social Media Manager - Vienna', detail: 'The tattoo studio came later as its own Vienna-based brand environment, opening a second network through barber, tattoo, fashion, nightlife, and culture-driven campaign work.' },
  { year: '2026', title: 'Nexus Link Productions', meta: 'Vienna-based content creation studio', detail: 'Premium brand content, campaign assets, short-form video, motion design, and full end-to-end visual systems.' },
];

const storyBeats = [
  { label: 'Fitness First', detail: 'Athlete, gym, supplement, and public figure production built the first active network.' },
  { label: 'Culture Layer', detail: 'The tattoo studio came later and added barber, fashion, nightlife, and Vienna street culture.' },
  { label: 'Studio Surface', detail: 'Nexus Link now turns both lanes into campaign assets, short-form systems, and motion-led delivery.' },
];

const activeClients = [
  { name: 'c2moviez', role: 'Current production partner', detail: 'Swiss production collaboration for selected European projects and production expansion.', lane: 'Production' },
  { name: 'Lilly Mansfeld / @infinitycre8', role: 'Current visual collaborator', detail: 'Graphic design, identity support, layouts, and campaign surfaces.', lane: 'Design' },
  { name: 'boviro security', role: 'Active client', detail: 'Security-sector content and visual communication with a practical, trust-first edge.', lane: 'B2B' },
  { name: 'chicanostore barber', role: 'Active client', detail: 'Barber culture, local social output, and campaign-ready short-form production.', lane: 'Culture' },
  { name: 'shipster boot vermietung', role: 'Active client', detail: 'Rental and leisure content built around clarity, location, and booking intent.', lane: 'Service' },
  { name: 'cheesedoctor', role: 'Active client', detail: 'Food, personality, and product-led content with a direct social rhythm.', lane: 'Food' },
];

const priorNetwork = [
  { name: 'Mike Sommerfeld', role: 'Prior fitness-industry collaborator', detail: 'Fitness network context and athlete/public-figure production before the tattoo studio chapter.' },
  { name: 'R. Tattoo x Barber', role: 'Prior studio environment', detail: 'Vienna tattoo and barber culture, campaign assets, high-volume social output, and brand presence.' },
  { name: 'RAF Camora ecosystem', role: 'Prior connected brand context', detail: 'Music, fashion, tattoo/barber culture, and lifestyle-brand adjacency around previous production work.' },
  { name: 'CØRBO by RAF CAMORA', role: 'Prior brand context', detail: 'Luxury streetwear environment connected to earlier campaign and social asset production.' },
];

const philosophy = [
  { title: 'End-to-End', body: 'Concept, shoot, edit, grade, animate, export, and deliver without losing the intent between handoffs.' },
  { title: 'Brand First', body: 'Every asset has to serve the brand memory, not just the platform slot it occupies.' },
  { title: 'Systems Thinking', body: 'Content works when production, publishing, review, and iteration are built as one repeatable system.' },
];

function FrameCorners() {
  return <div className="frame-corners" aria-hidden="true"><span /><span /><span /><span /></div>;
}

function CountUp({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: false, margin: '-18%' });
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!inView) {
      setCount(0);
      return undefined;
    }

    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 900);
      const eased = 1 - Math.pow(1 - p, 3);
      setCount(Math.round(eased * value));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value]);

  return <span ref={ref}>{count}</span>;
}

function StorySignalPanel() {
  return (
    <motion.div
      className="depth-panel"
      data-tilt
      data-proximity
      style={{
        '--z-depth': '44px',
        position: 'relative',
        overflow: 'hidden',
        padding: 'clamp(24px, 4vw, 42px)',
        minHeight: 420,
      } as React.CSSProperties}
      initial={{ opacity: 0, y: 34 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: false, margin: '-14%' }}
      transition={{ duration: 0.76, delay: 0.18, ease: EASE }}
    >
      <svg
        viewBox="0 0 640 360"
        aria-hidden="true"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.54 }}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="storySignal" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="rgba(220,38,38,0.08)" />
            <stop offset="48%" stopColor="rgba(220,38,38,0.58)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.16)" />
          </linearGradient>
        </defs>
        {[82, 150, 218].map((y, index) => (
          <motion.path
            key={y}
            d={`M38 ${y} C168 ${y - 58} 258 ${y + 68} 398 ${y - 8} S560 ${y + 38} 618 ${y - 20}`}
            fill="none"
            stroke="url(#storySignal)"
            strokeWidth={index === 1 ? 2 : 1}
            strokeDasharray="10 18"
            initial={{ pathLength: 0, opacity: 0 }}
            whileInView={{ pathLength: 1, opacity: index === 1 ? 1 : 0.58 }}
            viewport={{ once: false, margin: '-18%' }}
            transition={{ duration: 1.1, delay: index * 0.14, ease: EASE }}
          />
        ))}
      </svg>

      <div style={{ position: 'relative', display: 'grid', gap: 18 }}>
        <div className="kicker">Signal Map</div>
        <h3 style={{ margin: 0, fontSize: 'clamp(30px, 4vw, 58px)', lineHeight: 1, fontWeight: 950, letterSpacing: 0 }}>
          Fitness network. Culture network. Studio output.
        </h3>

        <div style={{ display: 'grid', gap: 12, marginTop: 8 }}>
          {storyBeats.map((beat, index) => (
            <motion.div
              key={beat.label}
              style={{
                display: 'grid',
                gridTemplateColumns: '72px 1fr',
                gap: 16,
                alignItems: 'start',
                padding: '14px 0',
                borderTop: '1px solid var(--color-border-subtle)',
              }}
              initial={{ opacity: 0, x: -18 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: false, margin: '-16%' }}
              transition={{ duration: 0.55, delay: 0.2 + index * 0.08, ease: EASE }}
            >
              <div style={{ color: 'var(--color-crimson)', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 800 }}>
                0{index + 1}
              </div>
              <div>
                <div style={{ color: 'var(--color-text-primary)', fontWeight: 900 }}>{beat.label}</div>
                <p style={{ marginTop: 6, color: 'var(--color-text-secondary)', lineHeight: 1.62 }}>{beat.detail}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

export default function AboutPage() {
  return (
    <div className="spatial-page">
      <section className="spatial-section frame-shell page-hero page-hero--center" data-proximity>
        <FrameCorners />
        <div className="container">
          <motion.div className="kicker" style={{ justifyContent: 'center' }} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.62, ease: EASE }}>
            Marcel Spatz / Vienna
          </motion.div>
          <motion.h1
            style={{
              margin: '22px auto 0',
              fontSize: 'clamp(78px, 14vw, 198px)',
              lineHeight: 0.82,
              fontWeight: 950,
              letterSpacing: 0,
              textTransform: 'uppercase',
            }}
            initial={{ opacity: 0, y: 58, rotateX: 12 }}
            animate={{ opacity: 1, y: 0, rotateX: 0 }}
            transition={{ duration: 0.9, delay: 0.12, ease: EASE }}
          >
            NEXUS<br />LINK
          </motion.h1>
          <motion.p
            className="section-copy"
            style={{ marginInline: 'auto' }}
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.72, delay: 0.36, ease: EASE }}
          >
            Senior Social Media Manager / Content Creator with six years of professional content creation behind a studio founded in 2026.
          </motion.p>
          <motion.a
            href="https://instagram.com/nexuslinkproductions"
            target="_blank"
            rel="noopener noreferrer"
            data-magnetic
            className="magnetic-link cta-button cta-button--primary"
            style={{ marginTop: 34 }}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.62, delay: 0.52, ease: EASE }}
          >
            @nexuslinkproductions
          </motion.a>
        </div>
      </section>

      <section className="spatial-section section-diagonal" data-proximity>
        <div className="container">
          <div style={{ display: 'grid', gridTemplateColumns: '0.72fr 1.28fr', gap: 'clamp(36px, 8vw, 112px)', alignItems: 'start' }} className="about-narrative">
            <motion.div initial={{ opacity: 0, x: -28 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: false, margin: '-14%' }} transition={{ duration: 0.76, ease: EASE }}>
              <div className="kicker">Narrative</div>
              <h2 className="section-title" style={{ fontSize: 'clamp(38px, 5vw, 74px)' }}>Two networks sharpened into one studio.</h2>
            </motion.div>

            <div className="story-stack" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 0.9fr) minmax(360px, 1.1fr)', gap: 18, alignItems: 'stretch' }}>
              <motion.div
                className="depth-panel"
                data-tilt
                data-proximity
                style={{ '--z-depth': '36px', padding: 'clamp(28px, 5vw, 52px)' } as React.CSSProperties}
                initial={{ opacity: 0, y: 34 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: false, margin: '-14%' }}
                transition={{ duration: 0.76, delay: 0.12, ease: EASE }}
              >
                <div style={{ display: 'grid', gap: 22, color: 'var(--color-text-secondary)', lineHeight: 1.78, fontWeight: 300 }}>
                  <p>Marcel Spatz is a Senior Social Media Manager / Content Creator based in Vienna, working across video production, post-production, campaign assets, advertising, motion design, color, and publishing logic.</p>
                  <p>The fitness industry came first. Before the tattoo-studio chapter, the work was already moving through gym, supplement, athlete, public-figure, YouTube, event, and travel-based production networks, including the Sommerfeld connection.</p>
                  <p>R. Tattoo x Barber came later as a separate cultural lane. That chapter added Vienna tattoo/barber culture, fashion adjacency, nightlife gravity, and fast social output where speed and brand quality had to align.</p>
                  <p>Nexus Link Productions is the independent surface built from both lanes: fitness and public figures on one side, tattoo/barber/culture-driven brand environments on the other.</p>
                </div>
              </motion.div>

              <StorySignalPanel />
            </div>
          </div>
        </div>
      </section>

      <section className="spatial-section frame-shell" data-proximity>
        <FrameCorners />
        <div className="container">
          <div className="kicker">Career Arc</div>
          <h2 className="section-title">The line is not straight. It compounds.</h2>
          <div style={{ marginTop: 62, position: 'relative' }}>
            <div style={{ position: 'absolute', left: 52, top: 0, bottom: 0, width: 1, background: 'linear-gradient(var(--color-crimson), rgba(220,38,38,0.05))' }} />
            {career.map((item, index) => (
              <motion.article
                key={item.year}
                style={{ position: 'relative', display: 'grid', gridTemplateColumns: '104px 1fr', gap: 30, marginBottom: 34 }}
                initial={{ opacity: 0, y: 32 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: false, margin: '-18%' }}
                transition={{ duration: 0.65, delay: index * 0.08, ease: EASE }}
              >
                <div style={{ position: 'relative', zIndex: 1 }}>
                  <div style={{ width: 104, height: 104, borderRadius: '50%', border: '1px solid var(--color-crimson-border)', background: 'rgba(12,12,20,0.86)', display: 'grid', placeItems: 'center', color: 'var(--color-crimson)', fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 900 }}>
                    {item.year}
                  </div>
                </div>
                <div className="depth-card" data-tilt data-proximity style={{ '--z-depth': `${20 + index * 5}px`, padding: 26 } as React.CSSProperties}>
                  <h3 style={{ fontSize: 'clamp(22px, 2.6vw, 36px)', fontWeight: 900, letterSpacing: 0 }}>{item.title}</h3>
                  <p style={{ marginTop: 8, color: 'var(--color-crimson)', fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{item.meta}</p>
                  <p style={{ marginTop: 14, color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>{item.detail}</p>
                </div>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      <section className="spatial-section section-diagonal" data-proximity>
        <div className="container">
          <div className="kicker">Network</div>
          <h2 className="section-title">Active clients, current collaborators, prior reach.</h2>
          <p className="section-copy">
            Current work is separated from prior clients, partners, and collaborator context so the network reads as a live production map, not one merged claim.
          </p>

          <div className="network-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 18, marginTop: 50 }}>
            {activeClients.map((item, index) => (
              <motion.article
                key={item.name}
                className="depth-card"
                data-tilt
                data-magnetic
                data-proximity
                style={{ '--z-depth': `${26 + index * 4}px`, minHeight: 260, padding: 26 } as React.CSSProperties}
                initial={{ opacity: 0, y: 34 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: false, margin: '-14%' }}
                transition={{ duration: 0.66, delay: index * 0.05, ease: EASE }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, alignItems: 'flex-start' }}>
                  <h3 style={{ fontSize: 24, fontWeight: 900, letterSpacing: 0 }}>{item.name}</h3>
                  <span style={{ color: 'var(--color-crimson)', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                    {item.lane}
                  </span>
                </div>
                <p style={{ marginTop: 12, color: 'var(--color-crimson)', fontSize: 11, fontWeight: 850, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{item.role}</p>
                <p style={{ marginTop: 18, color: 'var(--color-text-secondary)', lineHeight: 1.68 }}>{item.detail}</p>
                <motion.div
                  aria-hidden="true"
                  style={{ height: 2, marginTop: 24, background: 'linear-gradient(90deg, var(--color-crimson), transparent)', transformOrigin: '0 50%' }}
                  initial={{ scaleX: 0 }}
                  whileInView={{ scaleX: 1 }}
                  viewport={{ once: false, margin: '-18%' }}
                  transition={{ duration: 0.8, delay: 0.18 + index * 0.05, ease: EASE }}
                />
              </motion.article>
            ))}
          </div>

          <div style={{ marginTop: 54 }}>
            <div className="kicker">Prior Context</div>
            <div className="prior-network-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14, marginTop: 22 }}>
              {priorNetwork.map((item, index) => (
                <motion.article
                  key={item.name}
                  className="depth-card"
                  data-proximity
                  style={{ '--z-depth': `${16 + index * 3}px`, minHeight: 210, padding: 22, background: 'rgba(20,20,30,0.48)' } as React.CSSProperties}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: false, margin: '-14%' }}
                  transition={{ duration: 0.58, delay: index * 0.04, ease: EASE }}
                >
                  <h3 style={{ fontSize: 20, fontWeight: 900, letterSpacing: 0 }}>{item.name}</h3>
                  <p style={{ marginTop: 10, color: 'var(--color-text-tertiary)', fontSize: 11, fontWeight: 850, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{item.role}</p>
                  <p style={{ marginTop: 16, color: 'var(--color-text-secondary)', lineHeight: 1.62 }}>{item.detail}</p>
                </motion.article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="spatial-section spatial-section--compact" data-proximity>
        <div className="container">
          <div className="depth-panel" data-tilt style={{ '--z-depth': '38px', padding: 'clamp(28px, 5vw, 56px)' } as React.CSSProperties}>
            <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
              {[
                { value: 'Wide', label: 'Portfolio' },
                { value: <CountUp value={6} />, label: 'Years' },
                { value: <CountUp value={3} />, label: 'Partners' },
              ].map((stat) => (
                <div key={stat.label} style={{ borderTop: '1px solid var(--color-border-subtle)', paddingTop: 22 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(42px, 7vw, 92px)', fontWeight: 900, lineHeight: 0.9 }}>{stat.value}</div>
                  <div style={{ marginTop: 12, color: 'var(--color-text-tertiary)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="spatial-section frame-shell" data-proximity>
        <FrameCorners />
        <div className="container">
          <div className="kicker">Philosophy</div>
          <h2 className="section-title">Every frame is a choice.</h2>
          <div className="philosophy-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18, marginTop: 50 }}>
            {philosophy.map((item, index) => (
              <motion.article
                key={item.title}
                className="depth-card"
                data-tilt
                data-proximity
                style={{ '--z-depth': `${28 + index * 8}px`, padding: 30, minHeight: 245 } as React.CSSProperties}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: false, margin: '-14%' }}
                transition={{ duration: 0.65, delay: index * 0.08, ease: EASE }}
              >
                <div style={{ color: 'var(--color-crimson)', fontFamily: 'var(--font-serif)', fontSize: 36, fontStyle: 'italic', marginBottom: 24 }}>{String(index + 1).padStart(2, '0')}</div>
                <h3 style={{ fontSize: 25, fontWeight: 900, letterSpacing: 0 }}>{item.title}</h3>
                <p style={{ marginTop: 16, color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>{item.body}</p>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      <style>{`
        @media (max-width: 980px) {
          .about-narrative,
          .story-stack,
          .network-grid,
          .prior-network-grid,
          .philosophy-grid {
            grid-template-columns: 1fr !important;
          }

          .stats-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

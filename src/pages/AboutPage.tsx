import { useEffect, useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import type React from 'react';

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const career = [
  { year: '2021', title: 'Oldschoolgym24', meta: 'Studio Manager / Social Media Support - Baar, Switzerland', detail: 'Daily operations, community content, customer communication, and the first durable rhythm of visual presence.' },
  { year: '2023', title: 'Apollon Nutrition EU', meta: 'Sales & Marketing Support / Content Production - Switzerland', detail: 'Product content, e-commerce visuals, cinematic brand videos, release assets, commercial production, color, sound, and edit delivery.' },
  { year: '2024', title: 'Public Figure & Digital Media', meta: 'Video Editor / Videographer / Social Media Assistant - EU-wide', detail: 'YouTube workflows, event coverage, social production, travel-based footage, platform adaptation, and fast post-production.' },
  { year: '2025', title: 'R. Tattoo x Barber', meta: 'Senior Content Producer / Social Media Manager - Vienna', detail: 'High-volume campaign assets for RAF Camora connected brands, including CØRBO apparel and Mike Sommerfeld collaborations.' },
  { year: '2026', title: 'Nexus Link Productions', meta: 'Vienna-based content creation studio', detail: 'Premium brand content, campaign assets, short-form video, motion design, and full end-to-end visual systems.' },
];

const network = [
  { name: 'RAF Camora', role: 'Austrian multi-platinum rapper and entrepreneur', detail: 'Built a lifestyle ecosystem across music, fashion, tattoo/barber culture, vodka, and cosmetics.' },
  { name: 'R. / Tattoo x Barber', role: 'Vienna concept store and tattoo studio', detail: "Vienna's largest tattoo studio, blending barber and tattoo culture inside RAF's wider brand universe." },
  { name: 'CØRBO by RAF CAMORA', role: 'Luxury streetwear label', detail: "The fashion pillar of RAF's lifestyle brand universe, requiring premium campaign and social assets." },
  { name: 'Mike Sommerfeld', role: 'IFBB Pro Classic Physique', detail: 'Known as Mike the Badass: 2024 Mr. Olympia runner-up, aesthetic classic lines, and coach relationships with Patrick Tuor and Dennis James.' },
  { name: 'C2Moviez', role: 'Creative partner', detail: 'Swiss production partner for selected European projects and production expansion.' },
  { name: 'Lilly Mansfeld', role: 'Graphic design', detail: 'Visual collaborator for identity, layouts, and campaign surfaces.' },
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

export default function AboutPage() {
  return (
    <div className="spatial-page">
      <section className="spatial-section frame-shell" data-proximity style={{ minHeight: '92vh', display: 'grid', placeItems: 'center', textAlign: 'center', paddingTop: 128 }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: '0.82fr 1.18fr', gap: 'clamp(36px, 8vw, 112px)', alignItems: 'start' }} className="about-narrative">
            <motion.div initial={{ opacity: 0, x: -28 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: false, margin: '-14%' }} transition={{ duration: 0.76, ease: EASE }}>
              <div className="kicker">Narrative</div>
              <h2 className="section-title" style={{ fontSize: 'clamp(38px, 5vw, 74px)' }}>Six years sharpened into one studio.</h2>
            </motion.div>

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
                <p>At R. Tattoo x Barber by RAF Camora, the work moved across connected brand environments: R. / Tattoo x Barber, CØRBO luxury apparel, R. Cosmetics adjacency, and high-pressure social output where speed and brand quality had to align.</p>
                <p>That network included Mike Sommerfeld, the German IFBB Pro Classic Physique athlete known as Mike the Badass, 2024 Mr. Olympia runner-up, recognized for aesthetic classic lines and linked to coaches Patrick Tuor and Dennis James.</p>
                <p>RAF Camora's ecosystem matters because it is not one brand. It is a culture stack: music, fashion, tattoo/barber culture, Karneval Vodka, R. Cosmetics, and CØRBO by RAF CAMORA as the luxury streetwear pillar.</p>
                <p>The full arc runs from Oldschoolgym24 to Apollon Nutrition EU, then public figure production across Europe, then R. Tattoo x Barber in Vienna, then Nexus Link Productions as the independent studio surface.</p>
              </div>
            </motion.div>
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
          <h2 className="section-title">Collaborators and brand gravity.</h2>
          <div className="network-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 18, marginTop: 50 }}>
            {network.map((item, index) => (
              <motion.article
                key={item.name}
                className="depth-card"
                data-tilt
                data-magnetic
                data-proximity
                style={{ '--z-depth': `${22 + index * 4}px`, minHeight: 250, padding: 26 } as React.CSSProperties}
                initial={{ opacity: 0, y: 34 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: false, margin: '-14%' }}
                transition={{ duration: 0.66, delay: index * 0.05, ease: EASE }}
              >
                <h3 style={{ fontSize: 24, fontWeight: 900, letterSpacing: 0 }}>{item.name}</h3>
                <p style={{ marginTop: 10, color: 'var(--color-crimson)', fontSize: 11, fontWeight: 850, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{item.role}</p>
                <p style={{ marginTop: 18, color: 'var(--color-text-secondary)', lineHeight: 1.68 }}>{item.detail}</p>
              </motion.article>
            ))}
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
          .network-grid,
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

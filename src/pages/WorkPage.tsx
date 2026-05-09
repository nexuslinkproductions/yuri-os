import { motion } from 'framer-motion';
import CTABanner from '../components/CTABanner';
import WorkGallery from '../components/WorkGallery';
import type React from 'react';

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

function FrameCorners() {
  return <div className="frame-corners" aria-hidden="true"><span /><span /><span /><span /></div>;
}

export default function WorkPage() {
  return (
    <div className="spatial-page">
      <section
        className="spatial-section frame-shell"
        data-proximity
        style={{ minHeight: '78vh', display: 'flex', alignItems: 'center', paddingTop: 132 }}
      >
        <FrameCorners />
        <div className="container">
          <motion.div
            className="kicker"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.62, ease: EASE }}
          >
            Work Archive
          </motion.div>
          <motion.h1
            className="section-title"
            style={{ maxWidth: 1100, fontSize: 'clamp(64px, 11vw, 150px)' }}
            initial={{ opacity: 0, y: 48, rotateX: 12 }}
            animate={{ opacity: 1, y: 0, rotateX: 0 }}
            transition={{ duration: 0.86, delay: 0.12, ease: EASE }}
          >
            Selected Work.
          </motion.h1>
          <motion.p
            className="section-copy"
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.34, ease: EASE }}
          >
            A bento archive for campaign systems, social-first production, motion pieces, and brand worlds. Media wells stay empty until final project assets are dropped in.
          </motion.p>
        </div>
      </section>

      <section className="spatial-section spatial-section--compact section-diagonal">
        <div className="container frame-shell">
          <FrameCorners />
          <WorkGallery />
        </div>
      </section>

      <section className="spatial-section spatial-section--compact" data-proximity>
        <div className="container">
          <motion.div
            className="depth-panel"
            data-tilt
            style={{
              '--z-depth': '34px',
              padding: 'clamp(28px, 5vw, 56px)',
              display: 'grid',
              gridTemplateColumns: '1.2fr 1fr',
              gap: 'clamp(24px, 5vw, 70px)',
              alignItems: 'center',
            } as React.CSSProperties}
            initial={{ opacity: 0, y: 34 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, margin: '-14%' }}
            transition={{ duration: 0.72, ease: EASE }}
          >
            <div>
              <div className="kicker">Portfolio Logic</div>
              <h2 style={{ marginTop: 18, fontSize: 'clamp(32px, 5vw, 68px)', fontWeight: 900, letterSpacing: 0 }}>
                Not a gallery. A surface for future proof.
              </h2>
            </div>
            <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.75, fontWeight: 300 }}>
              The layout is intentionally uneven: large work gets room, smaller assets orbit around it, and every card reacts to cursor proximity before it is touched.
            </p>
          </motion.div>
        </div>
      </section>

      <CTABanner headline="Your story is next." buttonLabel="Start a Project" buttonHref="/contact" />

      <style>{`
        @media (max-width: 860px) {
          .depth-panel {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

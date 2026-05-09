import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import type React from 'react';

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const services = [
  {
    id: 'brand',
    title: 'Brand Content & Campaigns',
    number: '01',
    description: 'End-to-end campaign systems — concept, shoot, grade, edit, motion, and delivery. Built to outlast the platform it launches on.',
  },
  {
    id: 'documentary',
    title: 'Corporate & Documentary',
    number: '02',
    description: 'Long-form storytelling for founders, institutions, and brands. We capture the logic behind the operation and turn it into moving image.',
  },
  {
    id: 'post',
    title: 'Editing, Color & Motion',
    number: '03',
    description: 'Post production with opinion. Color science, motion graphics, sound design, and export for every surface the asset will occupy.',
  },
  {
    id: 'social',
    title: 'Short-Form & Social',
    number: '04',
    description: 'Scroll-stopping content engineered for attention economies. Shot ratios, hook timing, and platform-specific finishing built in.',
  },
  {
    id: 'av',
    title: 'Audio-Visual Production',
    number: '05',
    description: 'Full production pipeline — location or studio, direction, lighting, capture. The camera follows the intent, not the other way round.',
  },
];

function FrameCorners() {
  return <div className="frame-corners" aria-hidden="true"><span /><span /><span /><span /></div>;
}

function ServiceRow({ service, isActive, onToggle }: { service: (typeof services)[number]; isActive: boolean; onToggle: () => void }) {
  return (
    <motion.div
      className="service-row"
      onClick={onToggle}
      style={{
        borderBottom: '1px solid var(--color-border-subtle)',
        cursor: 'pointer',
        padding: 'clamp(18px, 3vw, 28px) 0',
        transition: 'background-color 0.3s ease',
        backgroundColor: isActive ? 'rgba(220,38,38,0.07)' : 'transparent',
      }}
      onHoverStart={() => {
        if (!isActive) {
          (document.querySelector(`[data-service="${service.id}"]`) as HTMLElement)?.style.setProperty('background-color', 'rgba(220,38,38,0.04)');
        }
      }}
      onHoverEnd={() => {
        if (!isActive) {
          (document.querySelector(`[data-service="${service.id}"]`) as HTMLElement)?.style.setProperty('background-color', 'transparent');
        }
      }}
      data-service={service.id}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24 }}>
        <div style={{ flex: 1 }}>
          <h3
            style={{
              fontSize: 'clamp(24px, 3vw, 42px)',
              fontWeight: 800,
              lineHeight: 1.2,
              color: 'var(--color-text-primary)',
              margin: 0,
            }}
          >
            {service.title}
          </h3>
        </div>
        <div
          style={{
            fontSize: '11px',
            fontFamily: 'monospace',
            fontWeight: 600,
            color: '#dc2626',
            whiteSpace: 'nowrap',
            letterSpacing: '0.05em',
          }}
        >
          {service.number}
        </div>
      </div>

      <AnimatePresence>
        {isActive && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <p
              style={{
                marginTop: 'clamp(12px, 2vw, 18px)',
                marginBottom: 0,
                fontSize: 'clamp(14px, 2vw, 16px)',
                lineHeight: 1.6,
                color: 'var(--color-text-secondary)',
                fontFamily: 'var(--font-body)',
              }}
            >
              {service.description}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function ServicesPage() {
  const [activeService, setActiveService] = useState<string | null>(null);

  return (
    <div className="spatial-page">
      <section className="spatial-section frame-shell" data-proximity style={{ minHeight: '86vh', display: 'grid', placeItems: 'center', paddingTop: 132 }}>
        <FrameCorners />
        <div className="container" style={{ textAlign: 'center' }}>
          <motion.div
            className="kicker"
            style={{ justifyContent: 'center' }}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.62, delay: 0.1, ease: EASE }}
          />
          <motion.h1
            className="section-title"
            style={{
              marginInline: 'auto',
              fontSize: 'clamp(72px, 12vw, 160px)',
              fontWeight: 900,
              textTransform: 'uppercase',
              lineHeight: 1.1,
              maxWidth: 1000,
            }}
            initial={{ opacity: 0, y: 54, rotateX: 14 }}
            animate={{ opacity: 1, y: 0, rotateX: 0 }}
            transition={{ duration: 0.88, delay: 0.2, ease: EASE }}
          >
            We Design.
            <br />
            We Direct.
            <br />
            We Deliver.
          </motion.h1>
          <motion.p
            className="section-copy"
            style={{ marginInline: 'auto', marginTop: 24 }}
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.72, delay: 0.38, ease: EASE }}
          />
        </div>
      </section>

      <section className="spatial-section frame-shell" data-proximity style={{ paddingBottom: 'clamp(42px, 7vw, 86px)' }}>
        <FrameCorners />
        <div className="container" style={{ maxWidth: 900 }}>
          <motion.div
            initial={{ opacity: 0, y: 32 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, margin: '-16%' }}
            transition={{ duration: 0.78, ease: EASE }}
          >
            {services.map((service) => (
              <ServiceRow
                key={service.id}
                service={service}
                isActive={activeService === service.id}
                onToggle={() => setActiveService(activeService === service.id ? null : service.id)}
              />
            ))}
          </motion.div>
        </div>
      </section>

      <section className="spatial-section frame-shell" data-proximity>
        <FrameCorners />
        <div className="container">
          <motion.div
            className="depth-panel"
            data-tilt
            style={{
              '--z-depth': '54px',
              padding: 'clamp(42px, 7vw, 86px)',
              textAlign: 'center',
            } as React.CSSProperties}
            initial={{ opacity: 0, y: 42 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, margin: '-16%' }}
            transition={{ duration: 0.78, ease: EASE }}
          >
            <div className="kicker" style={{ justifyContent: 'center' }}>Synthesis</div>
            <h2 style={{ maxWidth: 900, margin: '20px auto 0', fontSize: 'clamp(42px, 7vw, 104px)', fontWeight: 900, letterSpacing: 0 }}>
              One arc from first idea to final asset.
            </h2>
            <p className="section-copy" style={{ marginInline: 'auto' }}>
              A project can enter through any station, but the final system has to connect: brand logic, production, finish, format, and delivery.
            </p>
            <Link to="/contact" data-magnetic className="magnetic-link cta-button cta-button--primary" style={{ marginTop: 34 }}>
              Begin the Process <span aria-hidden="true">-&gt;</span>
            </Link>
          </motion.div>
        </div>
      </section>

      <style>{`
        @media (max-width: 920px) {
          .service-station {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

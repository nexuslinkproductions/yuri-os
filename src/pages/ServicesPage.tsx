import React, { useState } from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import CTABanner from '../components/CTABanner';

const services = [
  { number: '01', title: 'Cinematic Production', description: 'Full-crew film and video production across Austria and Europe. RED cameras, prime lenses, cinema-grade lighting.' },
  { number: '02', title: 'Brand Storytelling', description: 'Strategic narrative that transforms your brand identity into visual language audiences feel before they think.' },
  { number: '03', title: 'Post-Production & Grade', description: 'DaVinci Resolve color science. After Effects motion. Dolby-approved sound design. Every frame, refined.' },
  { number: '04', title: 'Live Event Coverage', description: 'Multi-camera live production, real-time switching. Concerts, summits, product launches at any scale.' },
  { number: '05', title: 'Drone & Aerial', description: 'FAA-equivalent certified operators, DJI Inspire + FPV. Sweeping landscapes to intimate tracking shots.' },
];

const phases = [
  { number: '01', title: 'Discover', description: 'Deep-dive strategy sessions to understand your vision, audience, and narrative goals.' },
  { number: '02', title: 'Develop', description: 'Scriptwriting, storyboarding, mood crafting. The blueprint for every frame before we roll.' },
  { number: '03', title: 'Produce', description: 'Principal photography with cinema-grade gear and seasoned crews, on location anywhere.' },
  { number: '04', title: 'Deliver', description: 'Color grade, sound mix, final export. Polished and ready for every screen, every platform.' },
];

const techItems = ['Sony VENICE', 'RED MONSTRO', 'DJI Inspire 3', 'DaVinci Resolve', 'After Effects', 'Premiere Pro'];

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as [number,number,number,number] } },
};

export default function ServicesPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <motion.div
      style={{ backgroundColor: 'var(--color-bg-void, #060608)', color: 'var(--color-text-primary, #f5f5f7)', minHeight: '100vh', overflow: 'hidden' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }}
    >
      {/* HERO */}
      <motion.section
        style={{ padding: '160px 48px 80px', maxWidth: 1120, margin: '0 auto' }}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8 }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24 }}>
          <motion.div
            style={{ width: 4, backgroundColor: '#dc2626', flexShrink: 0, borderRadius: 2, transformOrigin: 'top' }}
            initial={{ height: 0 }} animate={{ height: 100 }}
            transition={{ duration: 0.8, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
          />
          <div>
            <motion.h1
              style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(3rem, 8vw, 5.5rem)', fontWeight: 700, lineHeight: 1.05, letterSpacing: '-0.03em', margin: 0 }}
              initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            >
              What We Do.
            </motion.h1>
            <motion.p
              style={{ fontSize: 'clamp(1rem, 2vw, 1.2rem)', color: 'var(--color-text-secondary)', lineHeight: 1.65, maxWidth: 580, margin: '20px 0 0', fontWeight: 300 }}
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.45, ease: [0.22, 1, 0.36, 1] }}
            >
              End-to-end cinematic production — from concept architecture to final grade.
            </motion.p>
          </div>
        </div>
      </motion.section>

      {/* ACCORDION */}
      <section style={{ padding: '0 48px 120px', maxWidth: 920, margin: '0 auto' }}>
        {services.map((svc, i) => {
          const isOpen = openIndex === i;
          return (
            <motion.div
              key={svc.number}
              custom={i} variants={itemVariants} initial="hidden"
              whileInView="visible" viewport={{ once: true, margin: '-80px' }}
              style={{
                borderBottom: '1px solid var(--color-border-subtle)',
                borderLeft: isOpen ? '3px solid #dc2626' : '3px solid transparent',
                paddingLeft: 24,
                cursor: 'pointer',
                transition: 'border-color 0.25s ease',
              }}
              onClick={() => setOpenIndex(isOpen ? null : i)}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '28px 0', userSelect: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, color: '#dc2626', letterSpacing: '0.04em', minWidth: 32 }}>{svc.number}</span>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.1rem, 2.2vw, 1.4rem)', fontWeight: 500, margin: 0, letterSpacing: '-0.02em' }}>{svc.title}</h3>
                </div>
                <motion.span animate={{ rotate: isOpen ? 45 : 0 }} transition={{ duration: 0.25 }} style={{ fontSize: 22, color: 'var(--color-text-tertiary)', lineHeight: 1, flexShrink: 0 }}>+</motion.span>
              </div>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div key="body" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} style={{ overflow: 'hidden' }}>
                    <p style={{ fontSize: 16, lineHeight: 1.7, color: 'var(--color-text-secondary)', margin: '0 0 28px', maxWidth: 560 }}>{svc.description}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </section>

      {/* PROCESS */}
      <section style={{ padding: '100px 48px', backgroundColor: 'var(--color-bg-deep, #0f0f14)' }}>
        <motion.h2
          style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', fontWeight: 700, textAlign: 'center', margin: '0 0 64px', letterSpacing: '-0.02em' }}
          initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}
        >
          Our Process
        </motion.h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 32, maxWidth: 1120, margin: '0 auto' }}>
          {phases.map((p, i) => (
            <motion.div key={p.number} custom={i} variants={itemVariants} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-80px' }}
              style={{ borderLeft: '2px solid rgba(220,38,38,0.3)', paddingLeft: 24 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, color: '#dc2626', letterSpacing: '0.08em' }}>{p.number}</span>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 600, margin: '8px 0 12px', letterSpacing: '-0.02em' }}>{p.title}</h3>
              <p style={{ fontSize: 15, lineHeight: 1.65, color: 'var(--color-text-secondary)', margin: 0 }}>{p.description}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* TECH STACK */}
      <section style={{ padding: '100px 48px', maxWidth: 1120, margin: '0 auto' }}>
        <motion.h2
          style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.8rem, 4vw, 2.6rem)', fontWeight: 700, textAlign: 'center', margin: '0 0 64px', letterSpacing: '-0.02em' }}
          initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}
        >
          Gear & Software
        </motion.h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
          {techItems.map((item, i) => (
            <motion.div key={item} custom={i} variants={itemVariants} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-80px' }}
              whileHover={{ y: -4, borderColor: 'rgba(255,255,255,0.14)' }}
              style={{ border: '1px solid var(--color-border-subtle)', borderRadius: 12, padding: '32px 20px', textAlign: 'center', backgroundColor: 'var(--color-bg-deep)', cursor: 'default' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 500, letterSpacing: '-0.01em' }}>{item}</span>
            </motion.div>
          ))}
        </div>
      </section>

      <CTABanner headline="Ready to bring your vision to life?" buttonLabel="Get in Touch" buttonHref="/contact" />
    </motion.div>
  );
}

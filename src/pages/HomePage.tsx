import React from 'react';
import { useScroll, useTransform, motion, type Variants } from 'framer-motion';
import { Link } from 'react-router-dom';
import HeroSection from '../components/HeroSection';
import WorkGallery from '../components/WorkGallery';
import CTABanner from '../components/CTABanner';

const processSteps = [
  { num: '01', title: 'Discover', desc: 'We dive deep into your brand, audience, and vision to uncover the story waiting to be told.' },
  { num: '02', title: 'Develop', desc: 'Concept meets strategy as we craft a tailored narrative arc and visual blueprint.' },
  { num: '03', title: 'Produce', desc: 'World-class cinematography, direction, and sound come together on set and in post.' },
  { num: '04', title: 'Deliver', desc: 'Polished final cuts delivered across all formats, on time and beyond expectation.' },
];

const staggerContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.15 } },
};
const fadeUp: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as [number,number,number,number] } },
};

export default function HomePage() {
  const { scrollYProgress } = useScroll();
  const reelScale = useTransform(scrollYProgress, [0.04, 0.18], [0.97, 1]);

  return (
    <div style={{ backgroundColor: 'var(--color-bg-void, #060608)', color: 'var(--color-text-primary, #f5f5f7)', overflow: 'hidden' }}>
      <HeroSection />

      {/* ── REEL ── */}
      <motion.section
        style={{ backgroundColor: 'var(--color-bg-deep, #0f0f14)', padding: '120px clamp(24px, 6vw, 96px)', textAlign: 'center', scale: reelScale }}
        initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.7 }}
      >
        <motion.div
          style={{ width: 64, height: 2, backgroundColor: '#dc2626', margin: '0 auto 48px', opacity: 0.7 }}
          initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        />
        <motion.h2
          style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2.8rem, 6vw, 5.5rem)', fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.05, margin: '0 0 32px' }}
          initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          One frame.<br />Infinite impact.
        </motion.h2>
        <motion.p
          style={{ fontFamily: 'var(--font-body)', fontSize: 'clamp(1rem, 1.8vw, 1.15rem)', lineHeight: 1.7, color: 'var(--color-text-secondary)', maxWidth: 580, margin: '0 auto 48px', fontWeight: 300 }}
          initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
        >
          Every project we take on is driven by cinematic craft, meticulous precision,
          and an obsession with narrative truth. This is where motion becomes emotion.
        </motion.p>
        <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.3 }}>
          <Link
            to="/showreel" data-magnetic
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 12,
              padding: '16px 36px', border: '1px solid rgba(220,38,38,0.4)',
              color: '#dc2626', textDecoration: 'none',
              fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600,
              letterSpacing: '0.12em', textTransform: 'uppercase', borderRadius: 2,
            }}
          >
            ▶ Watch Showreel
          </Link>
        </motion.div>
      </motion.section>

      {/* ── SELECTED WORK ── */}
      <section style={{ padding: '100px clamp(24px, 4vw, 64px)', maxWidth: 1440, margin: '0 auto' }}>
        <motion.h2
          style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 700, letterSpacing: '-0.03em', margin: '0 0 56px' }}
          initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          Selected Work
        </motion.h2>
        <WorkGallery onProjectClick={() => {}} />
      </section>

      {/* ── PROCESS ── */}
      <section style={{ padding: '100px clamp(24px, 4vw, 64px)', backgroundColor: 'var(--color-bg-deep, #0f0f14)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <motion.h2
            style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 700, letterSpacing: '-0.03em', margin: '0 0 72px' }}
            initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}
            transition={{ duration: 0.7 }}
          >
            How We Work
          </motion.h2>
          <motion.div
            style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'clamp(24px, 3vw, 48px)' }}
            variants={staggerContainer} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-80px' }}
          >
            {processSteps.map((step) => (
              <motion.div key={step.num} variants={fadeUp} style={{ borderTop: '1px solid var(--color-border-subtle)', paddingTop: 24 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 3vw, 3rem)', fontWeight: 700, color: '#dc2626', lineHeight: 1, marginBottom: 16, letterSpacing: '-0.02em' }}>{step.num}</div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.1rem, 1.6vw, 1.3rem)', fontWeight: 600, margin: '0 0 12px', letterSpacing: '-0.02em' }}>{step.title}</h3>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, lineHeight: 1.65, color: 'var(--color-text-secondary)', margin: 0 }}>{step.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── TESTIMONIAL ── */}
      <motion.section
        style={{ padding: '120px clamp(24px, 6vw, 96px)', textAlign: 'center', maxWidth: 960, margin: '0 auto' }}
        initial={{ opacity: 0, scale: 0.97 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      >
        <div style={{ width: 40, height: 1, backgroundColor: 'rgba(220,38,38,0.4)', margin: '0 auto 48px' }} />
        <blockquote style={{
          fontFamily: 'Georgia, serif', fontStyle: 'italic',
          fontSize: 'clamp(1.6rem, 3.5vw, 2.6rem)', lineHeight: 1.45,
          color: 'var(--color-text-primary)', margin: '0 0 40px',
          letterSpacing: '-0.01em', fontWeight: 400,
        }}>
          "They don't just deliver a product. They craft an experience that defines how the world sees your brand."
        </blockquote>
        <cite style={{ fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'var(--color-text-tertiary)', fontStyle: 'normal' }}>
          Sofia Laurent — Founder, Lumina Labs
        </cite>
      </motion.section>

      <CTABanner headline="Ready to create something extraordinary?" buttonLabel="Start a Project" buttonHref="/contact" />
    </div>
  );
}

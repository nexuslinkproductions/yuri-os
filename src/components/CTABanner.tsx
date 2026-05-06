import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { Link } from 'react-router-dom';

interface CTABannerProps {
  headline: string;
  sub?: string;
  buttonLabel: string;
  buttonHref?: string;
}

/* Minimal, dark, integrated — no jarring gradient banners */
const CTABanner = ({ headline, sub, buttonLabel, buttonHref = '/contact' }: CTABannerProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: false, margin: '-60px' });

  return (
    <section style={{
      width: '100%',
      padding: '120px clamp(24px, 6vw, 96px)',
      background: 'var(--color-bg-void, #060608)',
      borderTop: '1px solid rgba(255,255,255,0.06)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Ambient light */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 600, height: 300,
        background: 'radial-gradient(ellipse, rgba(220,38,38,0.04) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div ref={ref} style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center', position: 'relative' }}>
        {/* Accent line */}
        <motion.div
          style={{ width: 40, height: 1, background: 'rgba(220,38,38,0.5)', margin: '0 auto 48px' }}
          initial={{ scaleX: 0 }} animate={inView ? { scaleX: 1 } : {}}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        />

        <motion.h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(2.2rem, 5vw, 4rem)',
            fontWeight: 700, lineHeight: 1.08, letterSpacing: '-0.03em',
            color: 'var(--color-text-primary)', margin: '0 0 24px',
          }}
          initial={{ opacity: 0, y: 32 }} animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
        >
          {headline}
        </motion.h2>

        {sub && (
          <motion.p
            style={{
              fontFamily: 'var(--font-body)', fontSize: 17, lineHeight: 1.65,
              color: 'var(--color-text-secondary)', margin: '0 0 48px', fontWeight: 300,
            }}
            initial={{ opacity: 0, y: 20 }} animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
          >
            {sub}
          </motion.p>
        )}

        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: sub ? 0.3 : 0.2 }}
        >
          <Link
            to={buttonHref} data-magnetic
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 12,
              fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600,
              letterSpacing: '0.12em', textTransform: 'uppercase',
              color: 'var(--color-text-primary)', textDecoration: 'none',
              padding: '18px 48px',
              border: '1px solid rgba(255,255,255,0.14)',
              borderRadius: 2,
              position: 'relative', overflow: 'hidden',
              transition: 'border-color 0.3s ease, color 0.3s ease',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.borderColor = 'rgba(220,38,38,0.5)';
              (e.currentTarget as HTMLElement).style.color = '#dc2626';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.14)';
              (e.currentTarget as HTMLElement).style.color = 'var(--color-text-primary)';
            }}
          >
            {buttonLabel}
            <span style={{ fontSize: 16 }}>→</span>
          </Link>
        </motion.div>
      </div>
    </section>
  );
};

export default CTABanner;

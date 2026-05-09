import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import type React from 'react';

interface CTABannerProps {
  headline: string;
  sub?: string;
  buttonLabel: string;
  buttonHref?: string;
}

export default function CTABanner({ headline, sub, buttonLabel, buttonHref = '/contact' }: CTABannerProps) {
  return (
    <section className="spatial-section section-diagonal" data-proximity>
      <div className="container frame-shell">
        <div className="frame-corners" aria-hidden="true"><span /><span /><span /><span /></div>
        <motion.div
          className="depth-panel"
          data-tilt
          style={{
            '--z-depth': '44px',
            position: 'relative',
            overflow: 'hidden',
            padding: 'clamp(44px, 8vw, 92px)',
            textAlign: 'center',
          } as React.CSSProperties}
          initial={{ opacity: 0, y: 36 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: false, margin: '-14%' }}
          transition={{ duration: 0.72, ease: [0.22, 1, 0.36, 1] }}
        >
          <div
            style={{
              position: 'absolute',
              inset: '15% 12%',
              background: 'radial-gradient(ellipse at center, rgba(220,38,38,0.1), transparent 68%)',
              pointerEvents: 'none',
            }}
          />
          <motion.div
            style={{
              width: 58,
              height: 1,
              background: 'var(--color-crimson)',
              margin: '0 auto 34px',
              transformOrigin: '50% 50%',
              position: 'relative',
            }}
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: false }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          />
          <motion.h2
            style={{
              position: 'relative',
              maxWidth: 920,
              margin: '0 auto',
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(38px, 7vw, 94px)',
              fontWeight: 900,
              letterSpacing: 0,
              lineHeight: 0.98,
            }}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false }}
            transition={{ duration: 0.74, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
          >
            {headline}
          </motion.h2>
          {sub && (
            <motion.p
              className="section-copy"
              style={{ position: 'relative', marginInline: 'auto' }}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: false }}
              transition={{ duration: 0.65, delay: 0.16 }}
            >
              {sub}
            </motion.p>
          )}
          <motion.div
            style={{ position: 'relative', marginTop: 36 }}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false }}
            transition={{ duration: 0.58, delay: 0.24 }}
          >
            <Link to={buttonHref} data-magnetic className="magnetic-link cta-button cta-button--primary">
              {buttonLabel}
              <span aria-hidden="true">-&gt;</span>
            </Link>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

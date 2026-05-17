import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { services } from '../data/services';

export default function ServicesSection() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section className="nlp-section nlp-services-grid" id="services">
      <div className="nlp-services-header">
        <span className="nlp-section-kicker">Services</span>
        <h2 className="nlp-section-title">What we do.</h2>
        <p className="nlp-section-subtitle">
          Six disciplines. One delivery promise.
        </p>
      </div>
      <div className="nlp-grid" ref={ref}>
        {services.map((service, i) => (
          <motion.article
            className="nlp-service-card"
            key={service.title}
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{
              duration: 0.5,
              delay: i * 0.05,
              ease: [0.4, 0, 0.2, 1],
            }}
          >
            <span className="nlp-service-icon" aria-hidden="true">
              {service.iconSymbol}
            </span>
            <h3 className="nlp-service-title">{service.title}</h3>
            <p
              className="nlp-service-tagline"
              style={{
                color: 'var(--nlp-purple)',
                fontFamily: 'var(--nlp-font-mono)',
                fontSize: 'var(--nlp-text-xs)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                marginBottom: 'var(--nlp-space-3)',
              }}
            >
              {service.tagline}
            </p>
            <p className="nlp-service-desc">{service.description}</p>
          </motion.article>
        ))}
      </div>
    </section>
  );
}


import { motion } from 'framer-motion';

export default function HeroSection() {
  return (
    <section className="nlp-section nlp-hero" id="hero">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          padding: 'var(--nlp-space-16) var(--nlp-space-4)',
          maxWidth: '800px',
          margin: '0 auto',
        }}
      >
        <span className="nlp-hero-kicker">Nexus Link Productions</span>
        <h1 className="nlp-hero-title">
          Cinematic video,
          <br />
          built like a system.
        </h1>
        <p className="nlp-hero-subtitle">
          Premium video production, motion design, and digital strategy from
          Vienna. Cinematic capture. Precise delivery. One operator stack.
        </p>
        <div className="nlp-hero-cta-row">
          <button
            className="nlp-button-primary"
            onClick={() =>
              document
                .getElementById('portfolio')
                ?.scrollIntoView({ behavior: 'smooth' })
            }
          >
            View our work
          </button>
          <button
            className="nlp-button-secondary"
            onClick={() =>
              document
                .getElementById('contact')
                ?.scrollIntoView({ behavior: 'smooth' })
            }
          >
            Get in touch
          </button>
        </div>
      </motion.div>
      <div className="nlp-hero-scroll-indicator" aria-hidden="true">
        ↓
      </div>
    </section>
  );
}


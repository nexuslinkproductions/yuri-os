import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';

interface ScriptMessage {
  role: 'user' | 'bot';
  text: string;
}

const script: ScriptMessage[] = [
  {
    role: 'user',
    text: 'What does Nexus Link do?',
  },
  {
    role: 'bot',
    text: 'Premium video production, motion design, and digital strategy. Vienna-based. Built for brands that take their identity seriously.',
  },
  {
    role: 'user',
    text: 'Timeline for a 60-second commercial?',
  },
  {
    role: 'bot',
    text: '2–3 weeks pre-production · 1–2 day shoot · 2 weeks edit. Faster on demand. Single point of contact throughout.',
  },
  {
    role: 'user',
    text: 'Do you handle motion graphics too?',
  },
  {
    role: 'bot',
    text: 'Yes — kinetic typography, brand motion systems, and animated graphics in After Effects and Cinema 4D. Built to scale across platforms.',
  },
];

export default function OracleSection() {
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    if (visibleCount >= script.length) return;

    const timer = setInterval(() => {
      setVisibleCount((prev) => {
        if (prev >= script.length) {
          clearInterval(timer);
          return prev;
        }
        return prev + 1;
      });
    }, 1500);

    return () => clearInterval(timer);
  }, [visibleCount]);

  const visibleMessages = script.slice(0, visibleCount);
  const allRevealed = visibleCount >= script.length;

  return (
    <section className="nlp-section nlp-oracle" id="oracle">
      <div className="nlp-services-header" style={{ textAlign: 'center' }}>
        <span className="nlp-section-kicker">Oracle</span>
        <h2 className="nlp-section-title">Meet our AI assistant.</h2>
        <p
          className="nlp-section-subtitle"
          style={{ color: 'var(--nlp-text-secondary)' }}
        >
          Always on. Always learning. Soon: live demo.
        </p>
      </div>

      <div className="nlp-oracle-chat" role="log" aria-live="polite">
        <AnimatePresence>
          {visibleMessages.map((msg, i) => (
            <motion.div
              key={i}
              className={`nlp-chat-message ${msg.role}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
            >
              {msg.text}
            </motion.div>
          ))}
        </AnimatePresence>

        {allRevealed && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            style={{ textAlign: 'center', marginTop: 'var(--nlp-space-6)' }}
          >
            <button
              className="nlp-button-primary"
              onClick={() =>
                document
                  .getElementById('contact')
                  ?.scrollIntoView({ behavior: 'smooth' })
              }
            >
              Talk to us
            </button>
          </motion.div>
        )}
      </div>
    </section>
  );
}


import { motion } from 'framer-motion';
import { useState, useRef, useEffect } from 'react';
import { portfolio } from '../data/portfolio';

export default function PortfolioSection() {
  const [activeIndex, setActiveIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const cards = track.querySelectorAll<HTMLElement>('.nlp-portfolio-card');

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const index = Array.from(cards).indexOf(
              entry.target as HTMLElement,
            );
            if (index !== -1) setActiveIndex(index);
          }
        });
      },
      {
        root: track,
        rootMargin: '0px',
        threshold: 0.5,
      },
    );

    cards.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, []);

  const scrollToCard = (index: number) => {
    const track = trackRef.current;
    if (!track) return;
    const card = track.children[index] as HTMLElement;
    if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  };

  return (
    <section className="nlp-section nlp-portfolio" id="portfolio">
      <div className="nlp-services-header" style={{ textAlign: 'left' }}>
        <span className="nlp-section-kicker" style={{ color: 'var(--nlp-cyan)' }}>
          Selected work
        </span>
        <h2 className="nlp-section-title">Portfolio.</h2>
      </div>

      <div
        className="nlp-portfolio-track"
        ref={trackRef}
        role="region"
        aria-label="Portfolio carousel"
      >
        {portfolio.map((item) => (
          <motion.article
            className="nlp-portfolio-card"
            key={item.id}
            tabIndex={0}
            whileHover={{ scale: 1.02 }}
          >
            <div
              style={{
                background:
                  'linear-gradient(135deg, var(--nlp-purple-dim), var(--nlp-surface))',
                aspectRatio: '16/9',
                borderRadius: 'var(--nlp-radius-md)',
                width: '100%',
              }}
            />
            <div className="nlp-portfolio-overlay">
              <span className="nlp-portfolio-category">
                {item.category} · {item.year}
              </span>
              <h3 className="nlp-portfolio-title">{item.title}</h3>
              <p
                style={{
                  color: 'var(--nlp-text-secondary)',
                  fontSize: 'var(--nlp-text-sm)',
                  marginTop: 'var(--nlp-space-2)',
                }}
              >
                {item.client}
              </p>
            </div>
          </motion.article>
        ))}
      </div>

      <div className="nlp-portfolio-dots">
        {portfolio.map((_, i) => (
          <button
            key={i}
            className={`nlp-portfolio-dot${i === activeIndex ? ' active' : ''}`}
            onClick={() => scrollToCard(i)}
            aria-label={`Go to slide ${i + 1}`}
          />
        ))}
      </div>
    </section>
  );
}


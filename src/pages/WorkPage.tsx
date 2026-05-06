import React from 'react';
import { motion } from 'framer-motion';
import WorkGallery from '../components/WorkGallery';
import CTABanner from '../components/CTABanner';

const styles: Record<string, React.CSSProperties> = {
  page: {
    backgroundColor: 'var(--color-bg-void, #060608)',
    color: 'var(--color-text-primary, #f5f5f7)',
    fontFamily: 'var(--font-body, Outfit), sans-serif',
    overflow: 'hidden',
  },
  heroSection: {
    position: 'relative',
    padding: '160px 48px 120px 48px',
    maxWidth: '1440px',
    margin: '0 auto',
  },
  heroAccentRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '24px',
    marginBottom: '32px',
  },
  accentLine: {
    width: '4px',
    height: '80px',
    backgroundColor: '#dc2626',
    flexShrink: 0,
    borderRadius: '2px',
    transformOrigin: 'top' as const,
  },
  heroHeading: {
    fontFamily: 'var(--font-display, "Space Grotesk"), sans-serif',
    fontSize: 'clamp(64px, 8vw, 110px)',
    fontWeight: 700,
    letterSpacing: '-0.04em',
    lineHeight: 1,
    margin: 0,
    color: 'var(--color-text-primary, #f5f5f7)',
  },
  heroSubline: {
    fontFamily: 'var(--font-body, Outfit), sans-serif',
    fontSize: '18px',
    lineHeight: 1.6,
    color: 'var(--color-text-secondary, #8e8ea0)',
    maxWidth: '680px',
    marginTop: '24px',
    marginLeft: '28px',
    fontWeight: 300,
  },
  featuredSection: {
    padding: '0 48px 120px 48px',
    maxWidth: '1440px',
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '32px',
  },
  projectCard: {
    width: '100%',
    height: '400px',
    borderRadius: '20px',
    position: 'relative' as const,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column' as const,
    justifyContent: 'space-between',
    padding: '40px 48px',
    boxSizing: 'border-box' as const,
    border: '1px solid var(--color-border-subtle, rgba(255,255,255,0.05))',
  },
  cardTopRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    width: '100%',
  },
  projectName: {
    fontFamily: 'var(--font-display, "Space Grotesk"), sans-serif',
    fontSize: 'clamp(40px, 5vw, 72px)',
    fontWeight: 700,
    letterSpacing: '-0.03em',
    lineHeight: 1.1,
    margin: 0,
    color: 'var(--color-text-primary, #f5f5f7)',
    maxWidth: '70%',
  },
  metadata: {
    textAlign: 'right' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
    flexShrink: 0,
  },
  metadataItem: {
    fontSize: '13px',
    fontWeight: 400,
    color: 'var(--color-text-secondary, #8e8ea0)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    lineHeight: 1.4,
    margin: 0,
  },
  metadataAccent: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#dc2626',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    lineHeight: 1.4,
    margin: 0,
  },
  cardDescription: {
    fontSize: '15px',
    lineHeight: 1.6,
    color: 'var(--color-text-secondary, #8e8ea0)',
    maxWidth: '520px',
    margin: 0,
    fontWeight: 300,
  },
};

const projects = [
  { name: 'Echoes of Tomorrow', client: 'Vienna Tourism Board', category: 'Commercial', year: '2024', bgColor: '#0c0c14', description: 'A city film redefining destination storytelling. Shot across three continents in seven days.' },
  { name: 'The Unseen', client: 'Österreichische Galerie', category: 'Documentary', year: '2024', bgColor: '#100c0c', description: 'Deep-sea researchers uncovering ocean mysteries. Winner, Best Documentary Short 2024.' },
  { name: 'Velocity', client: 'Prater Wien', category: 'Commercial', year: '2023', bgColor: '#0c0f14', description: 'Automotive campaign. Practical stunts, cinematic VFX. 15M+ views across platforms.' },
];

export default function WorkPage() {
  return (
    <motion.div style={styles.page} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }}>

      {/* HERO */}
      <section style={styles.heroSection}>
        <div style={styles.heroAccentRow}>
          <motion.div
            style={styles.accentLine}
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ duration: 1.0, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
          />
          <motion.h1 style={styles.heroHeading} initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}>
            Selected Work.
          </motion.h1>
        </div>
        <motion.p style={styles.heroSubline} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.55 }}>
          A curated body of work spanning commercial film, documentary, and live event. Each project chosen for its ambition.
        </motion.p>
      </section>

      {/* FEATURED */}
      <section style={styles.featuredSection}>
        {projects.map((p, i) => (
          <motion.div
            key={p.name}
            style={{ ...styles.projectCard, backgroundColor: p.bgColor }}
            initial={{ opacity: 0, y: 60 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: i * 0.08 }}
            whileHover={{ scale: 1.005, transition: { duration: 0.3 } }}
          >
            <div style={styles.cardTopRow}>
              <h2 style={styles.projectName}>{p.name}</h2>
              <div style={styles.metadata}>
                <span style={styles.metadataItem}>{p.client}</span>
                <span style={styles.metadataAccent}>{p.category}</span>
                <span style={styles.metadataItem}>{p.year}</span>
              </div>
            </div>
            <p style={styles.cardDescription}>{p.description}</p>
          </motion.div>
        ))}
      </section>

      {/* GALLERY */}
      <section style={{ padding: '0 48px 120px', maxWidth: 1440, margin: '0 auto' }}>
        <WorkGallery onProjectClick={() => {}} />
      </section>

      <CTABanner headline="Your story is next." buttonLabel="Start a Project" buttonHref="/contact" />
    </motion.div>
  );
}

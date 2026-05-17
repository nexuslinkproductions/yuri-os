import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import type React from 'react';

export type WorkProject = {
  id: string;
  title: string;
  client: string;
  category: string;
  year: string;
  span: 'wide' | 'tall' | 'square' | 'compact';
};

const categories = ['All', 'Campaign', 'Brand', 'Short-Form', 'Documentary', 'Motion'] as const;

const projects: WorkProject[] = [
  { id: 'raf-universe', title: 'Lifestyle Brand System', client: 'R. Tattoo x Barber', category: 'Campaign', year: '2026', span: 'wide' },
  { id: 'corbo-release', title: 'Luxury Apparel Drops', client: 'CØRBO by RAF CAMORA', category: 'Brand', year: '2026', span: 'tall' },
  { id: 'classic-physique', title: 'Classic Lines', client: 'Mike Sommerfeld', category: 'Short-Form', year: '2025', span: 'square' },
  { id: 'vienna-floor', title: 'Vienna Floor Sessions', client: 'Nexus Link', category: 'Motion', year: '2026', span: 'compact' },
  { id: 'founder-doc', title: 'Founder Signal', client: 'Independent', category: 'Documentary', year: '2026', span: 'wide' },
  { id: 'social-engine', title: 'Social Engine', client: 'Apollon Nutrition EU', category: 'Short-Form', year: '2024', span: 'square' },
  { id: 'campaign-finish', title: 'Finish Layer', client: 'Public Figure', category: 'Motion', year: '2025', span: 'compact' },
];

const spanClass: Record<WorkProject['span'], string> = {
  wide: 'work-card--wide',
  tall: 'work-card--tall',
  square: 'work-card--square',
  compact: 'work-card--compact',
};

interface WorkGalleryProps {
  onProjectClick?: (id: string) => void;
}

export default function WorkGallery({ onProjectClick }: WorkGalleryProps) {
  const [active, setActive] = useState<(typeof categories)[number]>('All');
  const visible = useMemo(
    () => active === 'All' ? projects : projects.filter((project) => project.category === active),
    [active],
  );

  return (
    <div data-proximity>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          marginBottom: 28,
        }}
      >
        {categories.map((category) => (
          <button
            key={category}
            type="button"
            data-magnetic
            className="magnetic-link"
            onClick={() => setActive(category)}
            style={{
              minHeight: 38,
              padding: '0 16px',
              borderRadius: 'var(--radius-full)',
              border: active === category ? '1px solid rgba(255,255,255,0.11)' : '1px solid rgba(255,255,255,0.07)',
              background: active === category
                ? 'linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))'
                : 'rgba(255,255,255,0.02)',
              color: active === category ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
              fontFamily: 'var(--font-display)',
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: '0.11em',
              textTransform: 'uppercase',
              boxShadow: active === category ? '0 18px 28px rgba(0,0,0,0.16)' : 'none',
            }}
          >
            {category}
          </button>
        ))}
      </div>

      <motion.div className="work-bento" layout>
        {visible.map((project, index) => (
          <motion.article
            key={project.id}
            layout
            className={`depth-card work-card ${spanClass[project.span]}`}
            data-tilt
            data-magnetic
            data-proximity
            onClick={() => onProjectClick?.(project.id)}
            initial={{ opacity: 0, y: 36 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, margin: '-12%' }}
            transition={{ duration: 0.62, delay: index * 0.045, ease: [0.22, 1, 0.36, 1] }}
            style={{
              '--z-depth': project.span === 'wide' ? '42px' : project.span === 'tall' ? '36px' : '28px',
              position: 'relative',
              minHeight: project.span === 'tall' ? 540 : project.span === 'compact' ? 270 : 360,
              overflow: 'hidden',
              padding: 18,
            } as React.CSSProperties}
          >
            <div className="image-slot" style={{ height: project.span === 'tall' ? '58%' : '62%', minHeight: 190, borderRadius: '18px' }} />
            <div style={{ padding: '20px 8px 4px' }}>
              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                  marginBottom: 14,
                  color: 'var(--color-text-tertiary)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                }}
              >
                <span>{project.client}</span>
                <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(228,88,95,0.78)', opacity: 0.72 }} />
                <span style={{ color: 'var(--color-crimson)' }}>{project.category}</span>
                <span>{project.year}</span>
              </div>
              <h2
                style={{
                  margin: 0,
                  fontSize: project.span === 'wide' ? 'clamp(34px, 4.8vw, 70px)' : 'clamp(25px, 3vw, 42px)',
                  lineHeight: 0.98,
                  fontWeight: 900,
                  letterSpacing: 0,
                  maxWidth: '12ch',
                }}
              >
                {project.title}
              </h2>
            </div>
          </motion.article>
        ))}
      </motion.div>

      <style>{`
        .work-bento {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          grid-auto-flow: dense;
          grid-auto-rows: 190px;
          gap: 18px;
        }

        .work-card--wide {
          grid-column: span 2;
          grid-row: span 2;
        }

        .work-card--tall {
          grid-column: span 1;
          grid-row: span 3;
        }

        .work-card--square {
          grid-column: span 1;
          grid-row: span 2;
        }

        .work-card--compact {
          grid-column: span 1;
          grid-row: span 1;
        }

        @media (max-width: 1100px) {
          .work-bento {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .work-card--wide,
          .work-card--tall,
          .work-card--square,
          .work-card--compact {
            grid-column: span 1;
            grid-row: span 2;
          }
        }

        @media (max-width: 680px) {
          .work-bento {
            grid-template-columns: 1fr;
            grid-auto-rows: auto;
          }

          .work-card {
            min-height: 360px !important;
          }
        }
      `}</style>
    </div>
  );
}

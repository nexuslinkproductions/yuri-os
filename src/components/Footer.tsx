import { Link } from 'react-router-dom';

const studioLinks = [
  { label: 'Work', to: '/work' },
  { label: 'Services', to: '/services' },
  { label: 'About', to: '/about' },
  { label: 'Contact', to: '/contact' },
];

const serviceLinks = [
  { label: 'Brand Content', href: '/services#brand' },
  { label: 'Documentary', href: '/services#documentary' },
  { label: 'Motion Design', href: '/services#post' },
  { label: 'Short-Form', href: '/services#social' },
  { label: 'Audio-Visual', href: '/services#av' },
];

export default function Footer() {
  return (
    <footer
      className="spatial-section spatial-section--compact section-diagonal"
      style={{
        position: 'relative',
        zIndex: 1,
        borderTop: '1px solid rgba(255,255,255,0.08)',
        background: 'linear-gradient(180deg, rgba(8,8,10,0.48), rgba(8,8,10,0.92))',
      }}
    >
      <div className="container" style={{ position: 'relative' }}>
        <div className="frame-corners" aria-hidden="true"><span /><span /><span /><span /></div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(240px, 1.2fr) repeat(3, minmax(160px, 0.8fr))',
            gap: 'clamp(28px, 5vw, 80px)',
          }}
          className="footer-grid"
        >
          <div>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 20,
                fontWeight: 900,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                marginBottom: 14,
              }}
            >
              NEXUS LINK
            </div>
            <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.7, maxWidth: 360 }}>
              Premium brand content, campaign assets, short-form video, and motion design from Vienna.
            </p>
            <a
              data-magnetic
              className="magnetic-link"
              href="https://instagram.com/nexuslinkproductions"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                marginTop: 24,
                color: 'var(--color-crimson)',
                fontFamily: 'var(--font-display)',
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
              }}
            >
              @nexuslinkproductions
            </a>
          </div>

          <div>
            <h2 className="kicker" style={{ marginBottom: 18 }}>Studio</h2>
            <nav style={{ display: 'grid', gap: 10 }}>
              {studioLinks.map((link) => (
                <Link key={link.to} to={link.to} data-magnetic className="magnetic-link footer-link">
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>

          <div>
            <h2 className="kicker" style={{ marginBottom: 18 }}>Services</h2>
            <nav style={{ display: 'grid', gap: 10 }}>
              {serviceLinks.map((link) => (
                <a key={link.href} href={link.href} data-magnetic className="magnetic-link footer-link">
                  {link.label}
                </a>
              ))}
            </nav>
          </div>

          <div>
            <h2 className="kicker" style={{ marginBottom: 18 }}>Contact</h2>
            <div style={{ display: 'grid', gap: 10, color: 'var(--color-text-secondary)' }}>
              <a data-magnetic className="magnetic-link footer-link" href="mailto:contact@nexuslinkproductions.com">
                contact@nexuslinkproductions.com
              </a>
              <span>Vienna, Austria</span>
              <span>Founded 2026</span>
            </div>
          </div>
        </div>

        {/* Geometric section divider — sacred geometry hairline */}
        <div aria-hidden="true" style={{ position: 'relative', margin: '48px 0 0', height: 1 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.14), transparent)' }} />
          <svg
            viewBox="0 0 200 20"
            preserveAspectRatio="xMidYMid meet"
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: 200,
              height: 20,
              opacity: 'var(--overlay-geometry-opacity)',
            }}
          >
            <polygon points="100,2 116,10 100,18 84,10" fill="none" stroke="currentColor" strokeWidth="0.6" />
            <circle cx="100" cy="10" r="3" fill="none" stroke="currentColor" strokeWidth="0.5" />
            <line x1="0" y1="10" x2="82" y2="10" stroke="currentColor" strokeWidth="0.4" />
            <line x1="118" y1="10" x2="200" y2="10" stroke="currentColor" strokeWidth="0.4" />
          </svg>
        </div>

        <div
          style={{
            paddingTop: 24,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 20,
            color: 'var(--color-text-tertiary)',
            fontSize: 12,
          }}
          className="footer-bottom"
        >
          <span>2026 Nexus Link Productions.</span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: '0.18em',
              opacity: 0.45,
            }}
          >
            48.2°N · 16.3°E · VIENNA
          </span>
          <span>Frames that define.</span>
        </div>
      </div>

      <style>{`
        .footer-link {
          justify-content: flex-start;
          color: var(--color-text-secondary);
          font-size: 14px;
          line-height: 1.5;
        }

        .footer-link:hover {
          color: var(--color-text-primary);
        }

        @media (max-width: 900px) {
          .footer-grid {
            grid-template-columns: 1fr !important;
          }

          .footer-bottom {
            flex-direction: column;
          }
        }
      `}</style>
    </footer>
  );
}

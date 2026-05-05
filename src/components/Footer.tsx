import { useState } from 'react';
import { Link } from 'react-router-dom';
import Container from './ui/Container';

const socialLinks = [
  {
    label: 'Instagram',
    href: 'https://instagram.com',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="9" fill="none" stroke="currentColor" />
        <text x="10" y="14" textAnchor="middle" fontSize="10" fill="currentColor" fontFamily="sans-serif" fontWeight="600">IG</text>
      </svg>
    ),
  },
  {
    label: 'Vimeo',
    href: 'https://vimeo.com',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="9" fill="none" stroke="currentColor" />
        <text x="10" y="14" textAnchor="middle" fontSize="10" fill="currentColor" fontFamily="sans-serif" fontWeight="600">V</text>
      </svg>
    ),
  },
  {
    label: 'LinkedIn',
    href: 'https://linkedin.com',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="9" fill="none" stroke="currentColor" />
        <text x="10" y="14" textAnchor="middle" fontSize="8" fill="currentColor" fontFamily="sans-serif" fontWeight="600">in</text>
      </svg>
    ),
  },
];

const studioLinks = [
  { label: 'About', to: '/about' },
  { label: 'Work', to: '/work' },
  { label: 'Showreel', to: '/showreel' },
  { label: 'Process', to: '/process' },
];

const servicesLinks = [
  { label: 'Production', href: '/services#production' },
  { label: 'Post-Production', href: '/services#post-production' },
  { label: 'Color', href: '/services#color' },
  { label: 'Sound', href: '/services#sound' },
  { label: 'Motion', href: '/services#motion' },
  { label: 'Events', href: '/services#events' },
];

const linkStyle: React.CSSProperties = {
  display: 'block',
  color: 'var(--color-text-primary)',
  textDecoration: 'none',
  fontSize: '14px',
  fontFamily: 'Outfit, sans-serif',
  lineHeight: '2',
  transition: 'opacity 0.2s',
};

const linkHoverStyle = { opacity: 0.7 };

const headingStyle: React.CSSProperties = {
  fontFamily: '"Space Grotesk", sans-serif',
  fontWeight: 600,
  fontSize: '13px',
  letterSpacing: '0.15em',
  textTransform: 'uppercase' as const,
  color: 'var(--color-text-secondary)',
  margin: 0,
  marginBottom: '16px',
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: '8px 12px',
  border: '1px solid var(--color-border-subtle)',
  background: 'transparent',
  color: 'var(--color-text-primary)',
  fontFamily: 'Outfit, sans-serif',
  fontSize: '14px',
  outline: 'none',
  borderRadius: 0,
};

const submitBtnStyle: React.CSSProperties = {
  padding: '8px 16px',
  border: '1px solid var(--color-border-subtle)',
  background: 'var(--color-text-primary)',
  color: 'var(--color-bg-void)',
  fontFamily: '"Space Grotesk", sans-serif',
  fontWeight: 600,
  fontSize: '13px',
  letterSpacing: '0.1em',
  cursor: 'pointer',
  textTransform: 'uppercase' as const,
  borderLeft: 'none',
};

export default function Footer() {
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubscribed(true);
  };

  return (
    <footer
      style={{
        width: '100%',
        background: 'var(--color-bg-void)',
        color: 'var(--color-text-primary)',
        borderTop: '1px solid var(--color-border-subtle)',
        paddingBlock: '96px 48px',
      }}
    >
      <Container>
        {/* Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '48px',
          }}
          className="footer-grid"
        >
          {/* Col 1 – Brand */}
          <div>
            <div
              style={{
                fontFamily: '"Space Grotesk", sans-serif',
                fontWeight: 600,
                fontSize: '18px',
                letterSpacing: '0.15em',
                color: 'var(--color-text-primary)',
                marginBottom: '8px',
              }}
            >
              NEXUS LINK
            </div>
            <p
              style={{
                fontFamily: 'Outfit, sans-serif',
                fontSize: '14px',
                color: 'var(--color-text-secondary)',
                margin: 0,
                marginBottom: '24px',
              }}
            >
              Premium video production. Vienna.
            </p>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              {socialLinks.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  style={{
                    color: 'var(--color-text-secondary)',
                    textDecoration: 'none',
                    transition: 'color 0.2s',
                    lineHeight: 0,
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.color = 'var(--color-text-primary)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.color = 'var(--color-text-secondary)';
                  }}
                >
                  {s.icon}
                </a>
              ))}
            </div>
          </div>

          {/* Col 2 – Studio */}
          <div>
            <h3 style={headingStyle}>Studio</h3>
            <nav>
              {studioLinks.map((l) => (
                <Link
                  key={l.label}
                  to={l.to}
                  style={linkStyle}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.opacity = '0.7';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.opacity = '1';
                  }}
                >
                  {l.label}
                </Link>
              ))}
            </nav>
          </div>

          {/* Col 3 – Services */}
          <div>
            <h3 style={headingStyle}>Services</h3>
            <nav>
              {servicesLinks.map((l) => (
                <a
                  key={l.label}
                  href={l.href}
                  style={linkStyle}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.opacity = '0.7';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.opacity = '1';
                  }}
                >
                  {l.label}
                </a>
              ))}
            </nav>
          </div>

          {/* Col 4 – Connect */}
          <div>
            <h3 style={headingStyle}>Connect</h3>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '14px', lineHeight: '2' }}>
              <div>
                <a
                  href="mailto:contact@nexuslinkproductions.com"
                  style={{
                    color: 'var(--color-text-primary)',
                    textDecoration: 'none',
                    transition: 'opacity 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.opacity = '0.7';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.opacity = '1';
                  }}
                >
                  contact@nexuslinkproductions.com
                </a>
              </div>
              <div>+43 1 234 5678</div>
              <div style={{ marginBottom: '20px' }}>Vienna, Austria</div>
              <form onSubmit={handleSubmit} style={{ display: 'flex' }}>
                {subscribed ? (
                  <span
                    style={{
                      fontFamily: 'Outfit, sans-serif',
                      fontSize: '13px',
                      color: 'var(--color-text-secondary)',
                      padding: '8px 0',
                    }}
                  >
                    ✓ Subscribed
                  </span>
                ) : (
                  <>
                    <input
                      type="email"
                      placeholder="Your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      style={inputStyle}
                    />
                    <button type="submit" style={submitBtnStyle}>
                      Go
                    </button>
                  </>
                )}
              </form>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div
          style={{
            marginTop: '64px',
            paddingTop: '24px',
            borderTop: '1px solid var(--color-border-subtle)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontFamily: 'Outfit, sans-serif',
            fontSize: '13px',
            color: 'var(--color-text-secondary)',
          }}
        >
          <span>© 2026 Nexus Link Productions. All rights reserved.</span>
          <div style={{ display: 'flex', gap: '16px' }}>
            <a
              href="/privacy"
              style={{
                color: 'var(--color-text-secondary)',
                textDecoration: 'none',
                transition: 'color 0.2s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.color = 'var(--color-text-primary)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.color = 'var(--color-text-secondary)';
              }}
            >
              Privacy
            </a>
            <span>·</span>
            <a
              href="/imprint"
              style={{
                color: 'var(--color-text-secondary)',
                textDecoration: 'none',
                transition: 'color 0.2s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.color = 'var(--color-text-primary)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.color = 'var(--color-text-secondary)';
              }}
            >
              Imprint
            </a>
          </div>
        </div>

        {/* Mobile grid override */}
        <style>{`
          @media (max-width: 767px) {
            .footer-grid {
              grid-template-columns: 1fr !important;
            }
          }
        `}</style>
      </Container>
    </footer>
  );
}

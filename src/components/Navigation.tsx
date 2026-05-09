import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link, NavLink, useLocation } from 'react-router-dom';

const wordmarkLogo = new URL('../../05_NEXUS-LINK/Identity/NLP LOGO/wordmark light nexus.svg', import.meta.url).href;

const navLinks = [
  { label: 'Home', to: '/' },
  { label: 'Work', to: '/work' },
  { label: 'Services', to: '/services' },
  { label: 'About', to: '/about' },
  { label: 'Contact', to: '/contact' },
];

function prefetchRoute(path: string) {
  window.dispatchEvent(new CustomEvent('nexus-route-intent', { detail: { path } }));
}

export default function Navigation() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setScanning(true);
    const t = setTimeout(() => setScanning(false), 520);
    return () => clearTimeout(t);
  }, [location.pathname]);

  return (
    <>
      {/* Route-change crimson scan line */}
      <AnimatePresence>
        {scanning && (
          <motion.div
            key="scan"
            initial={{ scaleX: 0, originX: 0 }}
            animate={{ scaleX: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              height: 1,
              background: 'var(--color-crimson)',
              zIndex: 9998,
              pointerEvents: 'none',
              boxShadow: '0 0 8px var(--color-crimson-glow)',
            }}
          />
        )}
      </AnimatePresence>

      <motion.header
        className="navigation-shell"
        initial={{ y: -28, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.52, ease: [0.22, 1, 0.36, 1] }}
        style={{
          position: 'fixed',
          top: 16,
          left: '50%',
          zIndex: 'var(--z-nav)',
          width: 'min(1120px, calc(100vw - 32px))',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: 18,
          minHeight: 60,
          padding: '8px 10px 8px 18px',
          border: `1px solid ${scrolled ? 'var(--color-border-default)' : 'var(--color-border-void)'}`,
          borderRadius: 'var(--radius-full)',
          background: scrolled ? 'rgba(12, 12, 20, 0.74)' : 'rgba(12, 12, 20, 0.28)',
          backdropFilter: 'blur(22px)',
          WebkitBackdropFilter: 'blur(22px)',
          boxShadow: scrolled ? '0 24px 80px rgba(0,0,0,0.32)' : 'none',
        }}
      >
        <Link
          to="/"
          data-magnetic
          onMouseEnter={() => prefetchRoute('/')}
          className="magnetic-link"
          aria-label="Nexus Link Productions home"
          style={{
            flexShrink: 0,
            color: 'var(--color-text-primary)',
            fontFamily: 'var(--font-display)',
            fontSize: 14,
            fontWeight: 900,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            lineHeight: 1,
          }}
        >
          <img className="navigation-wordmark" src={wordmarkLogo} alt="Nexus Link Productions" />
        </Link>

        <nav className="navigation-links" aria-label="Main navigation">
          {navLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              data-magnetic
              onMouseEnter={() => prefetchRoute(link.to)}
              className="magnetic-link navigation-link"
              style={({ isActive }) => ({
                minHeight: 36,
                padding: '0 14px',
                borderRadius: 'var(--radius-full)',
                color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                background: isActive ? 'rgba(220,38,38,0.12)' : 'transparent',
                border: isActive ? '1px solid var(--color-crimson-border)' : '1px solid transparent',
                fontFamily: 'var(--font-display)',
                fontSize: 11,
                fontWeight: 750,
                letterSpacing: '0.11em',
                textTransform: 'uppercase',
              })}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <Link
          to="/contact"
          data-magnetic
          onMouseEnter={() => prefetchRoute('/contact')}
          className="magnetic-link cta-button cta-button--primary navigation-cta"
          style={{ marginLeft: 'auto' }}
        >
          Start a Project
        </Link>

        <button
          data-magnetic
          className="magnetic-link navigation-menu"
          type="button"
          aria-label="Open menu"
          onClick={() => setMobileOpen(true)}
          style={{
            display: 'none',
            marginLeft: 'auto',
            width: 42,
            height: 42,
            border: '1px solid var(--color-border-default)',
            borderRadius: 'var(--radius-full)',
            color: 'var(--color-text-primary)',
          }}
        >
          <span style={{ width: 16, height: 1, background: 'currentColor', boxShadow: '0 6px 0 currentColor, 0 -6px 0 currentColor' }} />
        </button>
      </motion.header>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="mobile-nav"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9000,
              background: 'rgba(12, 12, 20, 0.86)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              padding: 24,
            }}
          >
            <div className="depth-panel" style={{ minHeight: 'calc(100vh - 48px)', padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 48 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, letterSpacing: '0.16em' }}>NEXUS LINK</span>
                <button
                  type="button"
                  data-magnetic
                  className="magnetic-link"
                  onClick={() => setMobileOpen(false)}
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 'var(--radius-full)',
                    border: '1px solid var(--color-border-default)',
                    color: 'var(--color-text-primary)',
                  }}
                >
                  X
                </button>
              </div>
              <nav style={{ display: 'grid', gap: 12 }}>
                {navLinks.map((link, i) => (
                  <motion.div
                    key={link.to}
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                  >
                    <NavLink
                      to={link.to}
                      data-magnetic
                      className="magnetic-link"
                      style={({ isActive }) => ({
                        width: '100%',
                        justifyContent: 'space-between',
                        padding: '18px 0',
                        borderBottom: '1px solid var(--color-border-subtle)',
                        color: isActive ? 'var(--color-crimson)' : 'var(--color-text-primary)',
                        fontFamily: 'var(--font-display)',
                        fontSize: 'clamp(28px, 10vw, 54px)',
                        fontWeight: 850,
                        letterSpacing: 0,
                      })}
                    >
                      {link.label}
                      <span style={{ fontSize: 14 }}>-&gt;</span>
                    </NavLink>
                  </motion.div>
                ))}
              </nav>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .navigation-links {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          margin-left: auto;
        }

        .navigation-wordmark {
          width: clamp(112px, 10vw, 158px);
          height: auto;
          opacity: 0.92;
          filter: drop-shadow(0 0 16px rgba(220,38,38,0.12));
        }

        .navigation-link:hover {
          color: var(--color-text-primary) !important;
          background: rgba(255,255,255,0.055) !important;
        }

        @media (max-width: 860px) {
          .navigation-shell {
            top: 10px !important;
            min-height: 56px !important;
          }

          .navigation-links,
          .navigation-cta {
            display: none !important;
          }

          .navigation-menu {
            display: inline-flex !important;
          }
        }
      `}</style>
    </>
  );
}

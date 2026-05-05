import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import Button from './ui/Button';
import MobileMenuDrawer from './MobileMenuDrawer';

const navLinks = [
  { label: 'Work', to: '/work' },
  { label: 'Services', to: '/services' },
  { label: 'About', to: '/about' },
  { label: 'Showreel', to: '/showreel' },
  { label: 'Contact', to: '/contact' },
];

export default function Navigation() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 80);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <>
      <header
        className="navigation"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: 72,
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          padding: '0 24px',
          backgroundColor: scrolled ? 'rgba(10,10,15,0.92)' : 'transparent',
          backdropFilter: scrolled ? 'blur(20px)' : 'none',
          WebkitBackdropFilter: scrolled ? 'blur(20px)' : 'none',
          transition: 'background-color 300ms ease, backdrop-filter 300ms ease',
          borderBottom: scrolled ? '1px solid rgba(255,255,255,0.06)' : '1px solid transparent',
        }}
      >
        {/* Logo + Wordmark */}
        <NavLink
          to="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            textDecoration: 'none',
            flexShrink: 0,
          }}
        >
          <img
            src="/src/assets/nudimmud-logo.svg"
            alt="Nexus Link Productions"
            height={28}
            style={{ display: 'block' }}
          />
          <span
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 600,
              fontSize: 14,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: '#e2e8f0',
              lineHeight: 1,
            }}
          >
            NEXUS LINK
          </span>
        </NavLink>

        {/* Desktop nav links */}
        <nav
          className="navigation__desktop-links"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 32,
            margin: '0 auto',
          }}
        >
          {navLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className="navigation__link"
              style={({ isActive }) => ({
                position: 'relative',
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 500,
                fontSize: 13,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                color: isActive ? '#22d3ee' : '#cbd5e1',
                textDecoration: 'none',
                padding: '6px 0',
                transition: 'color 200ms ease',
              })}
            >
              {({ isActive }) => (
                <>
                  {link.label}
                  {/* Animated underline */}
                  <span
                    className="navigation__link-underline"
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      width: isActive ? '100%' : 0,
                      height: 2,
                      backgroundColor: '#22d3ee',
                      borderRadius: 1,
                      transition: 'width 200ms ease',
                    }}
                  />
                  {/* Active dot indicator */}
                  {isActive && (
                    <span
                      style={{
                        display: 'inline-block',
                        width: 5,
                        height: 5,
                        borderRadius: '50%',
                        backgroundColor: '#22d3ee',
                        marginLeft: 6,
                        verticalAlign: 'middle',
                        position: 'relative',
                        top: -1,
                      }}
                    />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Desktop CTA */}
        <div className="navigation__desktop-cta" style={{ flexShrink: 0 }}>
          <Button variant="pill" as="router-link" to="/contact">
            Start a Project
          </Button>
        </div>

        {/* Mobile hamburger */}
        <button
          className="navigation__hamburger"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          style={{
            display: 'none',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 8,
            color: '#e2e8f0',
            flexShrink: 0,
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="7" x2="21" y2="7" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="17" x2="21" y2="17" />
          </svg>
        </button>
      </header>

      {/* Mobile menu drawer */}
      <MobileMenuDrawer isOpen={mobileOpen} onClose={() => setMobileOpen(false)} />

      <style>{`
        @media (max-width: 767px) {
          .navigation__desktop-links,
          .navigation__desktop-cta {
            display: none !important;
          }
          .navigation__hamburger {
            display: block !important;
            margin-left: auto;
          }
          .navigation {
            padding: 0 16px !important;
          }
        }
        @media (min-width: 768px) {
          .navigation__hamburger {
            display: none !important;
          }
        }
        .navigation__link:hover {
          color: #22d3ee !important;
        }
        .navigation__link:hover .navigation__link-underline {
          width: 100% !important;
        }
      `}</style>
    </>
  );
}

import { useEffect } from 'react';
import { NavLink, useLocation, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Button from './ui/Button';

const navLinks = [
  { label: 'Work', to: '/work' },
  { label: 'Services', to: '/services' },
  { label: 'About', to: '/about' },
  { label: 'Showreel', to: '/showreel' },
  { label: 'Contact', to: '/contact' },
];

const socialLinks = [
  { label: 'Instagram', href: 'https://instagram.com/nexuslinkproductions' },
  { label: 'Vimeo', href: 'https://vimeo.com/nexuslinkproductions' },
  { label: 'LinkedIn', href: 'https://linkedin.com/company/nexuslinkproductions' },
];

interface MobileMenuDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function MobileMenuDrawer({ isOpen, onClose }: MobileMenuDrawerProps) {
  const location = useLocation();

  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="mobile-drawer-backdrop"
            className="mobile-drawer__backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 200,
              backgroundColor: 'rgba(10,10,15,0.8)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
            }}
          />

          {/* Drawer */}
          <motion.div
            key="mobile-drawer-panel"
            className="mobile-drawer__panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              width: 280,
              height: '100vh',
              zIndex: 201,
              backgroundColor: 'rgba(10,10,15,0.98)',
              display: 'flex',
              flexDirection: 'column',
              padding: '32px 24px',
              overflowY: 'auto',
            }}
          >
            {/* Close button */}
            <button
              onClick={onClose}
              aria-label="Close menu"
              style={{
                alignSelf: 'flex-end',
                background: 'none',
                border: 'none',
                color: '#e2e8f0',
                fontSize: 28,
                cursor: 'pointer',
                padding: 0,
                lineHeight: 1,
                marginBottom: 40,
              }}
            >
              ✕
            </button>

            {/* Nav links */}
            <nav style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {navLinks.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={({ isActive }) =>
                    `mobile-drawer__link ${isActive ? 'mobile-drawer__link--active' : ''}`
                  }
                  style={({ isActive }) => ({
                    fontSize: 32,
                    fontWeight: 500,
                    color: isActive ? '#22d3ee' : '#e2e8f0',
                    textDecoration: 'none',
                    transition: 'color 200ms ease',
                    padding: '4px 0',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                  })}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#22d3ee')}
                  onMouseLeave={(e) => {
                    const active = e.currentTarget.classList.contains('mobile-drawer__link--active');
                    e.currentTarget.style.color = active ? '#22d3ee' : '#e2e8f0';
                  }}
                >
                  {link.label}
                </NavLink>
              ))}
            </nav>

            {/* Spacer */}
            <div style={{ flex: 1 }} />

            {/* Social links */}
            <div
              style={{
                display: 'flex',
                gap: 24,
                justifyContent: 'center',
                marginBottom: 32,
              }}
            >
              {socialLinks.map((sl) => (
                <a
                  key={sl.label}
                  href={sl.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: '#94a3b8',
                    textDecoration: 'none',
                    fontSize: 14,
                    fontWeight: 500,
                    transition: 'color 200ms ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#22d3ee')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
                >
                  {sl.label}
                </a>
              ))}
            </div>

            {/* CTA */}
            <div style={{ textAlign: 'center' }}>
              <Link to="/contact" style={{ textDecoration: 'none', display: 'block' }}>
                <Button variant="pill" style={{ width: '100%' }}>
                  Start a Project
                </Button>
              </Link>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

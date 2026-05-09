import { motion, AnimatePresence } from 'framer-motion';

interface MobileMenuProps {
  open: boolean;
  onClose: () => void;
  activeSection?: string;
}

const navLinks = [
  { id: 'services', label: 'Services' },
  { id: 'portfolio', label: 'Portfolio' },
  { id: 'oracle', label: 'Oracle' },
  { id: 'about', label: 'About' },
  { id: 'contact', label: 'Contact' },
];

const MobileMenu: React.FC<MobileMenuProps> = ({ open, onClose, activeSection }) => {
  const handleLinkClick = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    onClose();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="nlp-mobile-menu"
          initial={{ opacity: 0, x: '100%' }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: '100%' }}
          transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
        >
          <button className="nlp-mobile-menu-close" onClick={onClose} aria-label="Close menu">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6L18 18M6 18L18 6" />
            </svg>
          </button>
          {navLinks.map((l) => (
            <a
              key={l.id}
              className={`nlp-nav-link ${activeSection === l.id ? 'active' : ''}`}
              onClick={handleLinkClick(l.id)}
            >
              {l.label}
            </a>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default MobileMenu;

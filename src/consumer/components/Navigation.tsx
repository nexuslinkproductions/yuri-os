import { useState, useEffect } from 'react';

interface NavigationProps {
  activeSection: string;
  onMobileMenuToggle: () => void;
}

const navLinks = [
  { id: 'services', label: 'Services' },
  { id: 'portfolio', label: 'Portfolio' },
  { id: 'oracle', label: 'Oracle' },
  { id: 'about', label: 'About' },
  { id: 'contact', label: 'Contact' },
];

const Navigation: React.FC<NavigationProps> = ({ activeSection, onMobileMenuToggle }) => {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleNavClick = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <nav className={`nlp-nav ${scrolled ? 'scrolled' : ''}`}>
      <a href="#hero" className="nlp-nav-brand" onClick={handleNavClick('hero')}>
        <img src="/src/assets/nlp-element-dark.svg" alt="" width="24" height="24" />
        <span style={{ fontFamily: 'var(--nlp-font-heading)', fontWeight: 600, letterSpacing: '-0.01em' }}>
          Nexus Link
        </span>
      </a>
      <div className="nlp-nav-links" role="navigation">
        {navLinks.map((l) => (
          <a
            key={l.id}
            href={`#${l.id}`}
            className={`nlp-nav-link ${activeSection === l.id ? 'active' : ''}`}
            onClick={handleNavClick(l.id)}
          >
            {l.label}
          </a>
        ))}
      </div>
      <button className="nlp-nav-cta" onClick={() => document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' })}>
        Get in touch
      </button>
      <button className="nlp-nav-mobile-toggle" onClick={onMobileMenuToggle} aria-label="Toggle menu">
        ☰
      </button>
    </nav>
  );
};

export default Navigation;

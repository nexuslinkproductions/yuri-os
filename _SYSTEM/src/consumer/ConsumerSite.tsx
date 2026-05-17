import { useState, useEffect, useRef } from 'react'
import './consumer.css'
import HeroSection from './sections/HeroSection'
import ServicesSection from './sections/ServicesSection'
import PortfolioSection from './sections/PortfolioSection'
import OracleSection from './sections/OracleSection'
import AboutSection from './sections/AboutSection'
import ContactSection from './sections/ContactSection'
import Navigation from './components/Navigation'
import SectionIndicator from './components/SectionIndicator'
import MobileMenu from './components/MobileMenu'
import LiveTicker from './components/LiveTicker'

const ConsumerSite = () => {
  const [activeSection, setActiveSection] = useState('hero')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})

  const sections = ['hero', 'services', 'portfolio', 'oracle', 'about', 'contact']

  useEffect(() => {
    const refs = sectionRefs.current

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
            setActiveSection(entry.target.id)
          }
        })
      },
      { threshold: [0.3, 0.5, 0.7] }
    )

    sections.forEach((id) => {
      const el = document.getElementById(id)
      if (el) {
        refs[id] = el
        observer.observe(el)
      }
    })

    return () => {
      sections.forEach((id) => {
        const el = refs[id]
        if (el) observer.unobserve(el)
      })
    }
  }, [])

  return (
    <div className="nlp-shell">
      <Navigation
        activeSection={activeSection}
        onMobileMenuToggle={() => setMobileMenuOpen((v) => !v)}
      />
      <MobileMenu
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        activeSection={activeSection}
      />
      <SectionIndicator sections={sections} activeSection={activeSection} />
      <main id="main" className="nlp-main">
        <HeroSection />
        <ServicesSection />
        <PortfolioSection />
        <OracleSection />
        <AboutSection />
        <ContactSection />
      </main>
      <LiveTicker />
      <footer className="nlp-footer">
        © Nexus Link Productions · Vienna · contact@nexuslinkproductions.com
      </footer>
    </div>
  )
}

export default ConsumerSite

import { Component, useEffect, useLayoutEffect, useRef } from 'react';
import type React from 'react';
import { BrowserRouter, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import Navigation from './components/Navigation';
import Footer from './components/Footer';
import CineGlow from './components/ui/CineGlow';
import ArchitecturalGrid from './components/ui/ArchitecturalGrid';
import HermeticVeil from './components/ui/HermeticVeil';
import LogoAtmosphere from './components/ui/LogoAtmosphere';
import MagneticCursor from './components/ui/MagneticCursor';
import ParticleCanvas from './components/ParticleCanvas';
import { useLenis } from './hooks/useLenis';
import HomePage from './pages/HomePage';
import WorkPage from './pages/WorkPage';
import ServicesPage from './pages/ServicesPage';
import AboutPage from './pages/AboutPage';
import ContactPage from './pages/ContactPage';
import OperatorShell from './operator/OperatorShell';
import ObservatoryPage from './pages/ObservatoryPage';

class PageErrorBoundary extends Component<{ children: React.ReactNode; name: string }, { hasError: boolean; error: string }> {
  state = { hasError: false, error: '' };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }

  componentDidUpdate(prevProps: { name: string }) {
    if (prevProps.name !== this.props.name && this.state.hasError) {
      this.setState({ hasError: false, error: '' });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <section className="spatial-section" style={{ minHeight: '70vh', display: 'grid', placeItems: 'center' }}>
          <div className="depth-panel" style={{ maxWidth: 520, padding: 32, textAlign: 'center' }}>
            <p className="kicker" style={{ justifyContent: 'center' }}>Route Fault</p>
            <h1 style={{ marginTop: 18, fontSize: 36 }}>Page failed to load.</h1>
            <p className="section-copy" style={{ marginInline: 'auto' }}>{this.state.error}</p>
          </div>
        </section>
      );
    }

    return this.props.children;
  }
}

const routeOrder: Record<string, number> = {
  '/': 0,
  '/work': 1,
  '/services': 2,
  '/about': 3,
  '/contact': 4,
};

function ScrollDepthTracker() {
  useEffect(() => {
    const update = () => {
      const d = document.documentElement;
      const scrollable = d.scrollHeight - window.innerHeight;
      const depth = scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0;
      d.style.setProperty('--scroll-depth', String(depth));
    };

    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });

    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return null;
}

function RouteChangeEffects() {
  const location = useLocation();

  useLayoutEffect(() => {
    const routeName = location.pathname === '/' ? 'home' : location.pathname.replace(/^\//, '').replace(/\//g, '-');
    document.documentElement.dataset.route = routeName || 'home';
    window.scrollTo(0, 0);
    document.documentElement.style.setProperty('--scroll-depth', '0');

    const id = window.requestAnimationFrame(() => {
      window.dispatchEvent(new Event('scroll'));
      document.getElementById('main')?.focus({ preventScroll: false });
    });

    return () => window.cancelAnimationFrame(id);
  }, [location.pathname]);

  return null;
}

function Layout() {
  useLenis();
  const location = useLocation();
  const navigate = useNavigate();
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  useEffect(() => {
    const routes = Object.keys(routeOrder).sort((a, b) => routeOrder[a] - routeOrder[b]);
    const index = routes.indexOf(location.pathname);
    if (index === -1) return undefined;

    const onStart = (event: TouchEvent) => {
      touchStartX.current = event.touches[0].clientX;
      touchStartY.current = event.touches[0].clientY;
    };

    const onEnd = (event: TouchEvent) => {
      const dx = event.changedTouches[0].clientX - touchStartX.current;
      const dy = Math.abs(event.changedTouches[0].clientY - touchStartY.current);

      if (Math.abs(dx) < 70 || dy > Math.abs(dx) * 0.8) return;
      if (dx < 0 && index < routes.length - 1) navigate(routes[index + 1]);
      if (dx > 0 && index > 0) navigate(routes[index - 1]);
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchend', onEnd);
    };
  }, [location.pathname, navigate]);

  return (
    <>
      <ScrollDepthTracker />
      <RouteChangeEffects />
      <div className="scroll-progress" aria-hidden="true" />
      <Navigation />
      <HermeticVeil />
      <motion.main
        id="main"
        tabIndex={-1}
        key={location.key}
        initial={false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        style={{ minHeight: '100vh', position: 'relative', zIndex: 4 }}
      >
        <Outlet />
      </motion.main>
      <Footer />
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ArchitecturalGrid />
      <ParticleCanvas />
      <LogoAtmosphere />
      <CineGlow />
      <MagneticCursor />
      <Routes>
        <Route path="/operator/*" element={<OperatorShell />} />
        <Route element={<Layout />}>
          <Route path="/" element={<PageErrorBoundary name="home"><HomePage /></PageErrorBoundary>} />
          <Route path="/work" element={<PageErrorBoundary name="work"><WorkPage /></PageErrorBoundary>} />
          <Route path="/services" element={<PageErrorBoundary name="services"><ServicesPage /></PageErrorBoundary>} />
          <Route path="/about" element={<PageErrorBoundary name="about"><AboutPage /></PageErrorBoundary>} />
            <Route path="/contact" element={<PageErrorBoundary name="contact"><ContactPage /></PageErrorBoundary>} />
          <Route path="/observatory" element={<PageErrorBoundary name="observatory"><ObservatoryPage /></PageErrorBoundary>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;

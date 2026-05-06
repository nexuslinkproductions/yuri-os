import React, { Suspense, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, type Variants } from 'framer-motion';
import { useLenis } from './hooks/useLenis';
import Navigation from './components/Navigation';
import Footer from './components/Footer';
import LightCursor from './components/ui/LightCursor';
import CelticBackground from './components/ui/CelticBackground';

const routeOrder: Record<string, number> = {
  '/': 0,
  '/work': 1,
  '/services': 2,
  '/about': 3,
  '/showreel': 4,
  '/contact': 5,
};

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

/* ── Scroll reset on every route change ── */
function ScrollReset() {
  const location = useLocation();
  useEffect(() => {
    // Force scroll to top immediately — no smooth scroll on navigation
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [location.pathname]);
  return null;
}

/* ── Swipe navigation hook ── */
function useSwipeNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  useEffect(() => {
    const routes = Object.keys(routeOrder).sort((a, b) => routeOrder[a] - routeOrder[b]);
    const currentIdx = routes.indexOf(location.pathname);

    const onStart = (e: TouchEvent) => {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
    };

    const onEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - touchStartX.current;
      const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current);
      // Only horizontal swipes (dx > 60, horizontal > vertical)
      if (Math.abs(dx) < 60 || dy > Math.abs(dx) * 0.8) return;
      if (dx < 0 && currentIdx < routes.length - 1) navigate(routes[currentIdx + 1]);
      if (dx > 0 && currentIdx > 0) navigate(routes[currentIdx - 1]);
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchend', onEnd);
    };
  }, [location.pathname, navigate]);
}

/* ── Layout ── */
function Layout(): React.ReactElement {
  const location = useLocation();
  const prevPath = useRef<string>(location.pathname);
  useSwipeNav();

  const currentOrder = routeOrder[location.pathname] ?? 0;
  const prevOrder = routeOrder[prevPath.current] ?? 0;
  const direction = currentOrder >= prevOrder ? 1 : -1;

  useEffect(() => {
    prevPath.current = location.pathname;
  }, [location.pathname]);

  const variants: Variants = {
    enter:  { opacity: 0, y: 12,  transition: { duration: 0.4, ease: EASE } },
    center: { opacity: 1, y: 0,   transition: { duration: 0.4, ease: EASE } },
    exit:   { opacity: 0, y: -8,  transition: { duration: 0.28, ease: EASE } },
  };

  return (
    <>
      <Navigation />
      <AnimatePresence mode="wait" initial={false}>
        <motion.main
          key={location.pathname}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          style={{ minHeight: '100vh', position: 'relative' }}
        >
          <Outlet />
        </motion.main>
      </AnimatePresence>
      <Footer />
    </>
  );
}

/* ── Lazy pages ── */
const HomePage     = React.lazy(() => import('./pages/HomePage'));
const WorkPage     = React.lazy(() => import('./pages/WorkPage'));
const ServicesPage = React.lazy(() => import('./pages/ServicesPage'));
const AboutPage    = React.lazy(() => import('./pages/AboutPage'));
const ContactPage  = React.lazy(() => import('./pages/ContactPage'));
const ShowreelPage = React.lazy(() => import('./pages/ShowreelPage'));
const OperatorShell = React.lazy(() => import('./operator/OperatorShell'));

function App(): React.ReactElement {
  useLenis();

  return (
    <BrowserRouter>
      <CelticBackground />
      <LightCursor />
      <ScrollReset />
      <Suspense
        fallback={
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: '100vh', background: '#0e0e18', color: 'rgba(255,255,255,0.3)',
            fontFamily: 'var(--font-display)', fontSize: 13, letterSpacing: '0.15em',
          }}>
            LOADING
          </div>
        }
      >
        <Routes>
          <Route path="/operator/*" element={<OperatorShell />} />
          <Route element={<Layout />}>
            <Route path="/"         element={<HomePage />} />
            <Route path="/work"     element={<WorkPage />} />
            <Route path="/services" element={<ServicesPage />} />
            <Route path="/about"    element={<AboutPage />} />
            <Route path="/contact"  element={<ContactPage />} />
            <Route path="/showreel" element={<ShowreelPage />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;

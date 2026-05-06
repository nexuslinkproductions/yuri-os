import React, { Suspense, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion, type Variants } from 'framer-motion';
import { useLenis } from './hooks/useLenis';
import Navigation from './components/Navigation';
import Footer from './components/Footer';
import FuturisticCursor from './components/ui/MagneticCursor';

const routeOrder: Record<string, number> = {
  '/': 0,
  '/work': 1,
  '/services': 2,
  '/about': 3,
  '/showreel': 4,
  '/contact': 5,
};

// ── Layout ───────────────────────────────────────────────────
function Layout(): React.ReactElement {
  const location = useLocation();
  const prevPath = useRef<string>(location.pathname);

  const currentOrder = routeOrder[location.pathname] ?? -1;
  const prevOrder = routeOrder[prevPath.current] ?? -1;
  const goingForward = currentOrder >= prevOrder;

  useEffect(() => {
    prevPath.current = location.pathname;
  }, [location.pathname]);

  const direction = goingForward ? 1 : -1;

  const ease = [0.22, 1, 0.36, 1] as [number, number, number, number];
  const variants: Variants = {
    enter:  { x: direction * 40,  opacity: 0, transition: { duration: 0.45, ease } },
    center: { x: 0,                opacity: 1, transition: { duration: 0.45, ease } },
    exit:   { x: direction * -40, opacity: 0, transition: { duration: 0.35, ease } },
  };

  return (
    <>
      <Navigation />
      <AnimatePresence mode="wait">
        <motion.main
          key={location.pathname}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          style={{ overflow: 'hidden', minHeight: '100vh' }}
        >
          <Outlet />
        </motion.main>
      </AnimatePresence>
      <Footer />
    </>
  );
}


// Lazy-loaded pages
const HomePage = React.lazy(() => import('./pages/HomePage'));
const WorkPage = React.lazy(() => import('./pages/WorkPage'));
const ServicesPage = React.lazy(() => import('./pages/ServicesPage'));
const AboutPage = React.lazy(() => import('./pages/AboutPage'));
const ContactPage = React.lazy(() => import('./pages/ContactPage'));
const ShowreelPage = React.lazy(() => import('./pages/ShowreelPage'));
const OperatorShell = React.lazy(() => import('./operator/OperatorShell'));

function App(): React.ReactElement {
  const { isReady } = useLenis();

  useEffect(() => {
    if (!isReady) return;
    // Lenis is ready — additional init if needed
  }, [isReady]);

  return (
    <BrowserRouter>
      <FuturisticCursor />
      <Suspense
        fallback={
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
            Loading…
          </div>
        }
      >
        <Routes>
          <Route path="/operator/*" element={<OperatorShell />} />
          <Route element={<Layout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/work" element={<WorkPage />} />
            <Route path="/services" element={<ServicesPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/showreel" element={<ShowreelPage />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;

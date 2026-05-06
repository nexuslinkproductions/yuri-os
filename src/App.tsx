import React, { Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useLenis } from './hooks/useLenis';
import Navigation from './components/Navigation';
import Footer from './components/Footer';
import MagneticCursor from './components/ui/MagneticCursor';

// ── Layout ───────────────────────────────────────────────────
function Layout(): React.ReactElement {
  const location = useLocation();

  return (
    <>
      <Navigation />
      <AnimatePresence mode="wait">
        <motion.main
          key={location.pathname}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.35, ease: 'easeInOut' }}
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
      <MagneticCursor />
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

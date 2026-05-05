import React, { Suspense, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { motion, useAnimation } from 'framer-motion';
import HeroScene from '../scenes/HeroScene';

const Button: React.FC<{ variant: 'pill' | 'ghost'; children: React.ReactNode }> = ({
  variant,
  children,
}) => {
  const base: React.CSSProperties = {
    padding: '14px 32px',
    borderRadius: variant === 'pill' ? '9999px' : '12px',
    border: variant === 'ghost' ? '1px solid rgba(255,255,255,0.15)' : 'none',
    background: variant === 'pill' ? 'linear-gradient(135deg, #7c3aed, #06b6d4)' : 'transparent',
    color: '#fff',
    fontFamily: 'Outfit, sans-serif',
    fontSize: '16px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    backdropFilter: variant === 'ghost' ? 'blur(4px)' : undefined,
  };
  return <button style={base}>{children}</button>;
};

const wordReveal = (words: string, delay: number = 0) => {
  const split = words.split(' ');
  return split.map((word, i) => (
    <span
      key={i}
      style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'top' }}
    >
      <motion.span
        style={{ display: 'inline-block' }}
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: delay + i * 0.1, ease: [0.25, 0.1, 0.25, 1] }}
      >
        {word}{i < split.length - 1 ? '\u00A0' : ''}
      </motion.span>
    </span>
  ));
};

const HeroSection: React.FC = () => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div
      style={{
        position: 'relative',
        height: '100vh',
        overflow: 'hidden',
        backgroundColor: 'var(--color-bg-void, #0a0a0f)',
      }}
    >
      <Canvas
        camera={{ position: [0, 0, 8], fov: 45 }}
        dpr={[1, 1.5]}
        gl={{ alpha: true, antialias: true }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <Suspense fallback={null}>
          <HeroScene />
        </Suspense>
      </Canvas>

      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, transparent 0%, rgba(10,10,15,0.4) 50%, rgba(10,10,15,0.95) 100%)',
          pointerEvents: 'none',
          zIndex: 1,
        }}
      />

      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
          maxWidth: '900px',
          width: '90%',
          zIndex: 2,
          pointerEvents: 'none',
        }}
      >
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={mounted ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.1 }}
          style={{
            fontFamily: '"Space Grotesk", sans-serif',
            fontSize: '14px',
            fontWeight: 500,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: '#06b6d4',
            marginBottom: '24px',
          }}
        >
          NEXUS LINK PRODUCTIONS
        </motion.p>

        <h1
          style={{
            fontFamily: '"Space Grotesk", sans-serif',
            fontSize: '72px',
            fontWeight: 700,
            lineHeight: 1.0,
            letterSpacing: '-0.04em',
            color: 'var(--color-text-primary, #ffffff)',
            margin: '0 0 24px',
          }}
        >
          {wordReveal('Where Vision Meets Code')}
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={mounted ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.8 }}
          style={{
            fontFamily: 'Outfit, sans-serif',
            fontSize: '22px',
            fontWeight: 300,
            lineHeight: 1.4,
            color: 'var(--color-text-secondary, #a0a0b0)',
            maxWidth: '600px',
            margin: '0 auto 40px',
          }}
        >
          We craft immersive digital experiences that push the boundaries of creativity and technology.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={mounted ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 1.0 }}
          style={{
            display: 'flex',
            gap: '16px',
            justifyContent: 'center',
            pointerEvents: 'auto',
          }}
        >
          <Button variant="pill">Watch Showreel</Button>
          <Button variant="ghost">Get in Touch</Button>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={mounted ? { opacity: 1 } : {}}
        transition={{ delay: 1.4 }}
        style={{
          position: 'absolute',
          bottom: '40px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 2,
        }}
      >
        <motion.div
          animate={{ y: [0, 8, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            width: 24,
            height: 24,
            borderLeft: '2px solid rgba(255,255,255,0.6)',
            borderBottom: '2px solid rgba(255,255,255,0.6)',
            transform: 'rotate(-45deg)',
          }}
        />
      </motion.div>
    </div>
  );
};

export default HeroSection;

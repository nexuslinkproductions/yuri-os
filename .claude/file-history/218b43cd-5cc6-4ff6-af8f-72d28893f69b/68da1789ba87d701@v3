import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { NudimmudDesignConfig, DEFAULT_CONFIG } from './types';
import DesignCatalog from './DesignCatalog';
import ConfirmScreen from './ConfirmScreen';
import AuditHUD from './AuditHUD';
import ParticleBackground from './ParticleBackground';

type Screen = 'catalog' | 'confirm' | 'hud';

const SCREEN_TRANSITIONS = {
  initial: { opacity: 0, x: 24 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -24 },
  transition: { duration: 0.28, ease: [0.23, 1, 0.32, 1] as [number, number, number, number] },
};

export default function DesignAuditHUD() {
  const [screen, setScreen] = useState<Screen>('catalog');
  const [config, setConfig] = useState<NudimmudDesignConfig>({ ...DEFAULT_CONFIG });

  const handleUpdate = (key: string, value: string | string[]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleConfirm = () => {
    setConfig((prev) => ({ ...prev, confirmed: true }));
    setScreen('hud');
  };

  const handleReset = () => {
    setConfig({ ...DEFAULT_CONFIG });
    setScreen('catalog');
  };

  return (
    <div style={{
      width: '100%',
      height: '100%',
      background: 'var(--bg-void)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      position: 'relative',
    }}>
      {/* Alive background — driven by selected backgroundLife */}
      <ParticleBackground
        backgroundLife={config.backgroundLife || 'Floating particles'}
        cursorGlow={config.backgroundLife === 'Reactive cursor'}
      />

      {/* Screen identifier strip */}
      <div style={{
        position: 'relative',
        zIndex: 1,
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        flexShrink: 0,
        height: 32,
        padding: '0 16px',
        background: 'rgba(0,0,0,0.3)',
      }}>
        {(['catalog', 'confirm', 'hud'] as Screen[]).map((s, i) => (
          <React.Fragment key={s}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '0 12px',
              height: '100%',
            }}>
              <span style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: screen === s
                  ? 'var(--cyan-glow)'
                  : ['catalog', 'confirm'].includes(screen) && s === 'hud'
                  ? 'rgba(255,255,255,0.1)'
                  : screen === 'hud' || (screen === 'confirm' && s === 'catalog')
                  ? 'rgba(150,220,120,0.4)'
                  : 'rgba(255,255,255,0.15)',
                transition: 'background 0.3s',
                boxShadow: screen === s ? '0 0 6px var(--cyan-glow)' : 'none',
              }} />
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.58rem',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: screen === s ? 'var(--cyan-glow)' : 'rgba(255,255,255,0.2)',
                transition: 'color 0.3s',
              }}>
                {s === 'catalog' ? '01 Design Setup' : s === 'confirm' ? '02 Confirm' : '03 Audit HUD'}
              </span>
            </div>
            {i < 2 && (
              <span style={{ color: 'rgba(255,255,255,0.1)', fontSize: '0.6rem' }}>›</span>
            )}
          </React.Fragment>
        ))}

        <div style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: '0.56rem', color: 'rgba(255,255,255,0.15)', letterSpacing: '0.1em' }}>
          DESIGN ARCHITECT · PROTO v1.0
        </div>
      </div>

      {/* Screen content */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative', zIndex: 1 }}>
        <AnimatePresence mode="wait">
          {screen === 'catalog' && (
            <motion.div
              key="catalog"
              {...SCREEN_TRANSITIONS}
              style={{ width: '100%', height: '100%' }}
            >
              <DesignCatalog
                config={config}
                onUpdate={handleUpdate}
                onContinue={() => setScreen('confirm')}
              />
            </motion.div>
          )}
          {screen === 'confirm' && (
            <motion.div
              key="confirm"
              {...SCREEN_TRANSITIONS}
              style={{ width: '100%', height: '100%' }}
            >
              <ConfirmScreen
                config={config}
                onConfirm={handleConfirm}
                onBack={() => setScreen('catalog')}
              />
            </motion.div>
          )}
          {screen === 'hud' && (
            <motion.div
              key="hud"
              {...SCREEN_TRANSITIONS}
              style={{ width: '100%', height: '100%' }}
            >
              <AuditHUD config={config} onReset={handleReset} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

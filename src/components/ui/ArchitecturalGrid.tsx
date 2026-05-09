import { motion, useScroll, useTransform } from 'framer-motion';

const horizonY = 185;
const centerX = 600;

const floorLines = Array.from({ length: 26 }, (_, i) => {
  const t = i / 25;
  return horizonY + Math.pow(t, 1.82) * 690;
});

const rayLines = Array.from({ length: 25 }, (_, i) => {
  const x = -260 + i * 70;
  return { x1: centerX, y1: horizonY, x2: x, y2: 900 };
});

function Triquetra() {
  return (
    <motion.g
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: [0.16, 0.36, 0.18], scale: [0.98, 1.04, 0.98] }}
      transition={{ duration: 7.5, repeat: Infinity, ease: 'easeInOut' }}
      transform={`translate(${centerX} ${horizonY})`}
      style={{ transformOrigin: `${centerX}px ${horizonY}px` }}
    >
      <circle cx="0" cy="-32" r="52" fill="none" stroke="var(--color-crimson)" strokeWidth="1.1" />
      <circle cx="-37" cy="31" r="52" fill="none" stroke="var(--color-crimson)" strokeWidth="1.1" />
      <circle cx="37" cy="31" r="52" fill="none" stroke="var(--color-crimson)" strokeWidth="1.1" />
      <circle cx="0" cy="8" r="5" fill="var(--color-crimson)" opacity="0.72" />
      <circle cx="0" cy="8" r="86" fill="url(#triquetraGlow)" opacity="0.42" />
    </motion.g>
  );
}

export default function ArchitecturalGrid() {
  const { scrollYProgress } = useScroll();
  const opacity = useTransform(scrollYProgress, [0, 0.45, 1], [0.92, 0.72, 0.98]);
  const gridY = useTransform(scrollYProgress, [0, 1], [0, -70]);

  return (
    <motion.div
      className="architectural-grid"
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        opacity,
      }}
    >
      <motion.div
        style={{
          position: 'absolute',
          inset: '-12% -18% -10%',
          y: gridY,
          perspective: 760,
          perspectiveOrigin: '50% 24%',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: '-12%',
            right: '-12%',
            top: '24%',
            height: '122%',
            transform: 'rotateX(68deg) translateZ(-50px)',
            transformOrigin: 'top center',
            backgroundImage:
              'linear-gradient(rgba(220, 38, 38, 0.075) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.045) 1px, transparent 1px)',
            backgroundSize: '82px 82px',
            maskImage: 'linear-gradient(to bottom, transparent 0%, black 13%, black 80%, transparent 100%)',
            opacity: 0.48,
          }}
        />
      </motion.div>

      <svg
        viewBox="0 0 1200 800"
        preserveAspectRatio="xMidYMid slice"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      >
        <defs>
          <radialGradient id="triquetraGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--color-crimson)" stopOpacity="0.32" />
            <stop offset="62%" stopColor="var(--color-crimson)" stopOpacity="0.08" />
            <stop offset="100%" stopColor="var(--color-crimson)" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="gridFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-crimson)" stopOpacity="0" />
            <stop offset="24%" stopColor="var(--color-crimson)" stopOpacity="0.12" />
            <stop offset="100%" stopColor="var(--color-crimson)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        <rect width="1200" height="800" fill="transparent" />
        <motion.line
          x1="0"
          y1={horizonY}
          x2="1200"
          y2={horizonY}
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="0.8"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
        />

        {rayLines.map((line, i) => (
          <motion.line
            key={`ray-${i}`}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke="url(#gridFade)"
            strokeWidth={i === 12 ? 1 : 0.58}
            initial={{ opacity: 0, pathLength: 0 }}
            animate={{ opacity: i === 12 ? 0.36 : 0.22, pathLength: 1 }}
            transition={{ duration: 1.6, delay: i * 0.012, ease: [0.22, 1, 0.36, 1] }}
          />
        ))}

        {floorLines.map((y, i) => (
          <motion.line
            key={`floor-${i}`}
            x1={Math.max(0, 600 - (y - horizonY) * 1.35)}
            y1={y}
            x2={Math.min(1200, 600 + (y - horizonY) * 1.35)}
            y2={y}
            stroke={i % 5 === 0 ? 'rgba(220,38,38,0.13)' : 'rgba(255,255,255,0.055)'}
            strokeWidth={i % 5 === 0 ? 0.78 : 0.52}
            initial={{ opacity: 0 }}
            animate={{ opacity: i < 5 ? 0.18 : 0.34 }}
            transition={{ duration: 1.2, delay: i * 0.025 }}
          />
        ))}

        <motion.circle
          cx={centerX}
          cy={horizonY}
          r="150"
          fill="url(#triquetraGlow)"
          animate={{ opacity: [0.18, 0.38, 0.18], scale: [0.92, 1.08, 0.92] }}
          transition={{ duration: 8.5, repeat: Infinity, ease: 'easeInOut' }}
          style={{ transformOrigin: `${centerX}px ${horizonY}px` }}
        />
        <motion.g
          transform={`translate(${centerX} ${horizonY})`}
          style={{ transformOrigin: `${centerX}px ${horizonY}px` }}
          animate={{ rotate: 360 }}
          transition={{ duration: 90, repeat: Infinity, ease: 'linear' }}
          opacity="0.36"
        >
          <circle r="122" fill="none" stroke="rgba(255,255,255,0.11)" strokeWidth="0.62" strokeDasharray="1 14" />
          <circle r="196" fill="none" stroke="rgba(220,38,38,0.18)" strokeWidth="0.72" strokeDasharray="42 18 4 18" />
          <path d="M0 -196 L169 98 L-169 98 Z" fill="none" stroke="rgba(220,38,38,0.14)" strokeWidth="0.7" />
          <path d="M0 196 L169 -98 L-169 -98 Z" fill="none" stroke="rgba(255,255,255,0.095)" strokeWidth="0.62" />
        </motion.g>
        <motion.g
          opacity="0.24"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 2.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <path d="M140 710 C340 520 430 260 600 185 C770 260 860 520 1060 710" fill="none" stroke="rgba(220,38,38,0.16)" strokeWidth="0.7" />
          <path d="M230 742 C390 562 480 346 600 185 C720 346 810 562 970 742" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="0.6" />
        </motion.g>
        <Triquetra />
      </svg>
    </motion.div>
  );
}

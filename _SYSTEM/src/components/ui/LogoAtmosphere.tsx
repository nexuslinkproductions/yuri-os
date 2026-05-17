import { motion, useScroll, useTransform } from 'framer-motion';

const elementLogo = new URL('../../../05_NEXUS-LINK/Identity/NLP LOGO/element light nexus.svg', import.meta.url).href;
const wordmarkLogo = new URL('../../../05_NEXUS-LINK/Identity/NLP LOGO/wordmark light nexus.svg', import.meta.url).href;
const lockupLogo = new URL('../../../05_NEXUS-LINK/Identity/NLP LOGO/logo light nexus.svg', import.meta.url).href;

export default function LogoAtmosphere() {
  const { scrollYProgress } = useScroll();
  const mainScale = useTransform(scrollYProgress, [0, 0.28, 0.8], [0.96, 0.88, 1.04]);
  const mainOpacity = useTransform(scrollYProgress, [0, 0.12, 0.48, 1], [0.12, 0.09, 0.05, 0.025]);
  const mainRotate = useTransform(scrollYProgress, [0, 1], [-2, 6]);
  const wordY = useTransform(scrollYProgress, [0, 0.28, 0.62], [0, -42, -78]);
  const wordOpacity = useTransform(scrollYProgress, [0, 0.16, 0.5], [0.08, 0.04, 0.015]);

  return (
    <motion.div className="logo-atmosphere" aria-hidden="true">
      <motion.div
        className="logo-atmosphere__intro"
        initial={{ opacity: 0, scale: 0.9, filter: 'blur(18px)' }}
        animate={{ opacity: [0, 0.9, 0.9, 0], scale: [0.9, 1, 1.02, 1.08], filter: ['blur(18px)', 'blur(0px)', 'blur(0px)', 'blur(10px)'] }}
        transition={{ duration: 3.8, ease: [0.22, 1, 0.36, 1], times: [0, 0.24, 0.68, 1] }}
      >
        <img src={lockupLogo} alt="" />
        <span />
      </motion.div>

      <motion.div
        className="logo-atmosphere__halo"
        initial={{ opacity: 0, scale: 0.72 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
      />

      <motion.img
        src={elementLogo}
        alt=""
        className="logo-atmosphere__element logo-atmosphere__element--main"
        style={{ scale: mainScale, opacity: mainOpacity, rotate: mainRotate }}
        initial={{ opacity: 0, filter: 'blur(18px)' }}
        animate={{ opacity: 1, filter: 'blur(0px)' }}
        transition={{ duration: 1.2, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
      />

      <motion.img
        src={wordmarkLogo}
        alt=""
        className="logo-atmosphere__wordmark"
        style={{ y: wordY, opacity: wordOpacity }}
        initial={{ clipPath: 'inset(0 100% 0 0)', opacity: 0 }}
        animate={{ clipPath: 'inset(0 0% 0 0)', opacity: 1 }}
        transition={{ duration: 1.05, delay: 0.38, ease: [0.22, 1, 0.36, 1] }}
      />

      <svg className="logo-atmosphere__construct" viewBox="0 0 1200 760" preserveAspectRatio="xMidYMid slice">
        <motion.circle
          cx="600"
          cy="315"
          r="244"
          fill="none"
          stroke="var(--color-crimson)"
          strokeWidth="0.6"
          strokeDasharray="2 22"
          initial={{ opacity: 0, pathLength: 0 }}
          animate={{ opacity: 0.16, pathLength: 1, rotate: 360 }}
          transition={{ opacity: { duration: 1.2 }, pathLength: { duration: 1.8 }, rotate: { duration: 120, repeat: Infinity, ease: 'linear' } }}
          style={{ transformOrigin: '600px 315px' }}
        />
      </svg>
    </motion.div>
  );
}

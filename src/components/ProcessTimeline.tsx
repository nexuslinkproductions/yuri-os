import { useRef } from 'react';
import { motion, useScroll, useTransform, type Variants } from 'framer-motion';

interface Step {
  num: string;
  title: string;
  desc: string;
}

const steps: Step[] = [
  { num: '01', title: 'Discover', desc: 'We dive deep into your brand, audience, and goals to uncover the core narrative.' },
  { num: '02', title: 'Plan', desc: 'A strategic roadmap is laid out, aligning creative vision with measurable outcomes.' },
  { num: '03', title: 'Produce', desc: 'From concept to execution, we craft every detail with precision and care.' },
  { num: '04', title: 'Deliver', desc: 'We launch your project and ensure it resonates long after the first impression.' },
];

const containerVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.2,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: 'easeOut' },
  },
};

export default function ProcessTimeline() {
  const containerRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start end', 'end start'],
  });

  const lineScaleX = useTransform(scrollYProgress, [0, 0.4], [0, 1]);

  return (
    <div
      ref={containerRef}
      className="relative w-full py-24 px-6 md:px-16 overflow-hidden"
    >
      {/* Connecting Line (desktop) */}
      <div className="hidden md:block absolute top-1/2 left-[10%] right-[10%] h-[2px] -translate-y-1/2 z-0 bg-white/10">
        <motion.div
          className="h-full origin-left bg-gradient-to-r from-purple-500 to-cyan-400"
          style={{ scaleX: lineScaleX }}
        />
      </div>

      {/* Connecting Line (mobile) */}
      <div className="md:hidden absolute left-[30px] top-[60px] bottom-[60px] w-[2px] z-0 bg-white/10">
        <motion.div
          className="w-full origin-top bg-gradient-to-b from-purple-500 to-cyan-400"
          style={{ scaleY: useTransform(scrollYProgress, [0, 0.4], [0, 1]) }}
        />
      </div>

      <motion.div
        className="relative z-10 grid grid-cols-1 md:grid-cols-4 gap-12 md:gap-6"
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-80px' }}
      >
        {steps.map((step, i) => (
          <motion.div
            key={step.num}
            className="flex flex-row md:flex-col items-center md:items-center gap-4 md:gap-6"
            variants={itemVariants}
          >
            {/* Circle + Number */}
            <div className="relative flex-shrink-0">
              <div className="w-[60px] h-[60px] rounded-full bg-gradient-to-br from-purple-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-purple-500/30">
                <span
                  className="text-white font-bold text-xl"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  {step.num}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div className="md:hidden absolute top-1/2 left-full h-[2px] w-8 bg-gradient-to-r from-purple-500 to-cyan-400 -translate-y-1/2" />
              )}
            </div>

            {/* Text */}
            <div className="text-left md:text-center">
              <h3
                className="text-white text-2xl font-semibold mb-1"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                {step.title}
              </h3>
              <p
                className="text-white/60 text-sm leading-relaxed max-w-[220px]"
                style={{ fontFamily: "'Outfit', sans-serif" }}
              >
                {step.desc}
              </p>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}

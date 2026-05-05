import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HeroSection,
  ServicesGallery,
  ProcessTimeline,
  WorkGallery,
  CTABanner,
} from '../components';

/* ---------- Subcomponents ---------- */

/* ShowreelSection */
const ShowreelSection: React.FC = () => {
  const [showVideo, setShowVideo] = useState(false);
  return (
    <section className="relative w-full h-screen flex items-center justify-center bg-black overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/30 to-black z-10" />
      {!showVideo ? (
        <motion.button
          onClick={() => setShowVideo(true)}
          className="relative z-20 flex items-center justify-center w-28 h-28 sm:w-36 sm:h-36 rounded-full bg-white/10 backdrop-blur-md border border-white/20 cursor-pointer group transition-all duration-300 hover:bg-white/20 hover:scale-105"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          aria-label="Play showreel"
        >
          <span className="pl-1 text-6xl sm:text-7xl text-white opacity-90 group-hover:opacity-100 transition-opacity">
            ▶
          </span>
        </motion.button>
      ) : (
        <AnimatePresence>
          <motion.div
            key="video-modal"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          >
            <div className="relative w-full max-w-5xl aspect-video">
              <iframe
                className="w-full h-full rounded-2xl shadow-2xl"
                src="https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1"
                title="Showreel"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
              <button
                onClick={() => setShowVideo(false)}
                className="absolute -top-12 right-0 text-white text-2xl hover:opacity-70 transition-opacity"
                aria-label="Close video"
              >
                ✕
              </button>
            </div>
          </motion.div>
        </AnimatePresence>
      )}
    </section>
  );
};

/* AnimatedCounter primitive */
const AnimatedCounter: React.FC<{ value: number; suffix?: string }> = ({
  value,
  suffix = '',
}) => {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          let start = 0;
          const duration = 1500;
          const step = Math.ceil(value / (duration / 16));
          const timer = setInterval(() => {
            start += step;
            if (start >= value) {
              setCount(value);
              clearInterval(timer);
            } else {
              setCount(start);
            }
          }, 16);
        }
      },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [value]);

  return (
    <span ref={ref} className="tabular-nums">
      {count}
      {suffix}
    </span>
  );
};

/* StatsBar */
const statsData: { value: number; label: string; suffix?: string }[] = [
  { value: 150, label: 'Projects', suffix: '+' },
  { value: 8, label: 'Years', suffix: '' },
  { value: 12, label: 'Countries', suffix: '' },
  { value: 100, label: 'Premium', suffix: '%' },
];

const StatsBar: React.FC = () => (
  <section className="py-24 bg-neutral-950">
    <div className="max-w-6xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-12 md:gap-8">
      {statsData.map((stat) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="text-center"
        >
          <div className="text-5xl sm:text-6xl font-bold text-white mb-2 tracking-tight">
            <AnimatedCounter value={stat.value} suffix={stat.suffix ?? ''} />
          </div>
          <div className="text-sm sm:text-base uppercase tracking-widest text-neutral-400 font-medium">
            {stat.label}
          </div>
        </motion.div>
      ))}
    </div>
  </section>
);

/* TestimonialCarousel */
const testimonials = [
  {
    quote:
      'An absolute masterclass in design thinking. The team redefined what we thought was possible.',
    author: 'Elena Voss',
    role: 'CEO, Nova Studios',
  },
  {
    quote:
      'Every pixel, every interaction — curated to perfection. Our engagement metrics soared.',
    author: 'Marcus Chen',
    role: 'CDO, Aether Group',
  },
  {
    quote:
      'They didn’t just deliver a product; they crafted an experience that resonates deeply.',
    author: 'Sofia Laurent',
    role: 'Founder, Lumina Labs',
  },
  {
    quote:
      'Uncompromising quality and a rare creative vision. A true partnership from day one.',
    author: 'James Okonkwo',
    role: 'VP Brand, Orion Collective',
  },
];

const TestimonialCarousel: React.FC = () => {
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState(0);
  const length = testimonials.length;

  const goTo = useCallback(
    (index: number) => {
      setDirection(index > current ? 1 : -1);
      setCurrent(index);
    },
    [current]
  );

  const next = useCallback(() => {
    setDirection(1);
    setCurrent((prev) => (prev + 1) % length);
  }, [length]);

  const prev = useCallback(() => {
    setDirection(-1);
    setCurrent((prev) => (prev - 1 + length) % length);
  }, [length]);

  useEffect(() => {
    const timer = setInterval(() => next(), 6000);
    return () => clearInterval(timer);
  }, [next]);

  const variants = {
    enter: (dir: number) => ({ x: dir > 0 ? 300 : -300, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? -300 : 300, opacity: 0 }),
  };

  return (
    <section className="py-24 bg-white">
      <div className="max-w-4xl mx-auto px-6 text-center">
        <h2 className="text-4xl sm:text-5xl font-bold text-neutral-900 mb-16 tracking-tight">
          What Our Clients Say
        </h2>
        <div className="relative overflow-hidden min-h-[200px] flex items-center justify-center">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={current}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.45, ease: 'easeOut' }}
              className="w-full"
            >
              <blockquote className="text-xl sm:text-2xl leading-relaxed text-neutral-700 italic mb-8">
                &ldquo;{testimonials[current].quote}&rdquo;
              </blockquote>
              <div className="font-semibold text-neutral-900">
                {testimonials[current].author}
              </div>
              <div className="text-sm text-neutral-500 mt-1">
                {testimonials[current].role}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
        {/* Nav dots */}
        <div className="flex items-center justify-center gap-3 mt-10">
          <button
            onClick={prev}
            className="w-10 h-10 flex items-center justify-center rounded-full border border-neutral-300 text-neutral-600 hover:bg-neutral-100 transition-colors"
            aria-label="Previous testimonial"
          >
            ‹
          </button>
          {testimonials.map((_, idx) => (
            <button
              key={idx}
              onClick={() => goTo(idx)}
              className={`w-3 h-3 rounded-full transition-all duration-300 ${
                idx === current
                  ? 'bg-neutral-900 scale-110'
                  : 'bg-neutral-300 hover:bg-neutral-400'
              }`}
              aria-label={`Go to testimonial ${idx + 1}`}
            />
          ))}
          <button
            onClick={next}
            className="w-10 h-10 flex items-center justify-center rounded-full border border-neutral-300 text-neutral-600 hover:bg-neutral-100 transition-colors"
            aria-label="Next testimonial"
          >
            ›
          </button>
        </div>
      </div>
    </section>
  );
};

/* ---------- HomePage ---------- */

const handleProjectClick = (projectId: string) => {
  console.log(`Project ${projectId} clicked — navigate to detail.`);
};

const HomePage: React.FC = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
    >
      {/* 1 */}
      <HeroSection />

      {/* 2 */}
      <ServicesGallery />

      {/* 3 */}
      <ShowreelSection />

      {/* 4 */}
      <StatsBar />

      {/* 5 */}
      <ProcessTimeline />

      {/* 6 */}
      <WorkGallery onProjectClick={handleProjectClick} />

      {/* 7 */}
      <TestimonialCarousel />

      {/* 8 */}
      <CTABanner
        headline="Ready to create something extraordinary?"
        buttonLabel="Start Your Project"
      />
    </motion.div>
  );
};

export default HomePage;

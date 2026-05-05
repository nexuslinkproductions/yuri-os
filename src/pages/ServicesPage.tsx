import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Section, Container, CTABanner } from '../components';
import { ProcessTimeline } from '../components';

const ServicesHero = () => (
  <Section className="py-20 md:py-28 bg-black text-white">
    <Container>
      <motion.h1
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-4xl md:text-6xl font-bold tracking-tight"
      >
        What We Do
      </motion.h1>
    </Container>
  </Section>
);

interface ServiceDetailCardProps {
  title: string;
  detail: string;
  index: number;
}

const ServiceDetailCard = ({ title, detail, index }: ServiceDetailCardProps) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
      className="border-b border-zinc-800 last:border-b-0"
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between py-6 text-left group"
        aria-expanded={isOpen}
      >
        <span className="text-xl md:text-2xl font-medium text-white group-hover:text-zinc-300 transition-colors">
          {title}
        </span>
        <motion.span
          animate={{ rotate: isOpen ? 45 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-2xl text-zinc-500 ml-4 flex-shrink-0"
        >
          +
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <p className="pb-6 text-zinc-400 leading-relaxed max-w-2xl">{detail}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const serviceData = [
  { title: 'Cinematic Production', detail: 'End-to-end film and video production from concept through post. Our crews operate globally with industry-leading camera systems and lighting packages tailored to any narrative.' },
  { title: 'Brand Storytelling', detail: 'Strategic narrative development that aligns your brand identity with compelling visual language. We craft stories that resonate across cultures and platforms.' },
  { title: 'Post-Production & VFX', detail: 'Full post-production pipeline including color grading, sound design, visual effects, and finishing. DaVinci Resolve and After Effects powered workflows.' },
  { title: 'Live Event Coverage', detail: 'Multi-camera live event production with real-time switching, replay, and streaming capabilities. Concerts, conferences, and sporting events.' },
  { title: 'Drone & Aerial Cinematography', detail: 'FAA-certified drone operators utilizing DJI Inspire and FPV systems for stunning aerial perspectives. From sweeping landscapes to intimate tracking shots.' },
];

const TechStackGrid = () => {
  const tools = ['Sony', 'RED', 'DJI', 'DaVinci', 'After Effects', 'Premiere'];

  return (
    <Section className="py-20 bg-zinc-900">
      <Container>
        <motion.h2
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-2xl md:text-3xl font-bold text-white mb-12 text-center"
        >
          Our Tech Stack
        </motion.h2>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-4 md:gap-6">
          {tools.map((tool, i) => (
            <motion.div
              key={tool}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.3, delay: i * 0.08 }}
              className="bg-zinc-800 rounded-lg p-6 flex items-center justify-center aspect-square"
            >
              <span className="text-white font-semibold text-center text-sm md:text-base leading-tight">
                {tool}
              </span>
            </motion.div>
          ))}
        </div>
      </Container>
    </Section>
  );
};

export default function ServicesPage() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <ServicesHero />
      <Section className="py-12 bg-black">
        <Container>
          <div className="max-w-3xl mx-auto">
            {serviceData.map((service, i) => (
              <ServiceDetailCard
                key={service.title}
                title={service.title}
                detail={service.detail}
                index={i}
              />
            ))}
          </div>
        </Container>
      </Section>
      <ProcessTimeline />
      <TechStackGrid />
      <CTABanner />
    </motion.div>
  );
}

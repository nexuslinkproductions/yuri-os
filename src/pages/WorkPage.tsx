import { motion } from 'framer-motion';
import { Section, Container } from '../components';
import { WorkGallery, CTABanner } from '../components';

const WorkHero = () => (
  <Section className="min-h-[60vh] flex items-center justify-center bg-black text-white">
    <Container>
      <motion.h1
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
        className="text-5xl md:text-7xl font-bold tracking-tight mb-4"
      >
        Selected Work
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.2, ease: 'easeOut' }}
        className="text-xl md:text-2xl text-zinc-400 max-w-xl"
      >
        A curated selection of productions that define our craft.
      </motion.p>
    </Container>
  </Section>
);

interface FeaturedProjectProps {
  name: string;
  brief: string;
  bgColor?: string;
}

const FeaturedProject = ({ name, brief, bgColor = '#1a1a2e' }: FeaturedProjectProps) => (
  <section
    className="w-full py-24 md:py-32 px-6"
    style={{ backgroundColor: bgColor }}
  >
    <Container>
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-100px' }}
        transition={{ duration: 0.6 }}
        className="max-w-3xl"
      >
        <span className="text-sm uppercase tracking-widest text-zinc-500 mb-2 block">Featured Project</span>
        <h2 className="text-4xl md:text-6xl font-bold text-white mb-6">{name}</h2>
        <p className="text-lg md:text-xl text-zinc-400 leading-relaxed">{brief}</p>
      </motion.div>
    </Container>
  </section>
);

export default function WorkPage() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <WorkHero />
      <WorkGallery />
      <FeaturedProject
        name="Echoes of Tomorrow"
        brief="A cinematic brand film exploring the intersection of technology and human connection. Shot on location across three continents."
        bgColor="#0f0f1a"
      />
      <FeaturedProject
        name="The Unseen"
        brief="Documentary short following deep-sea researchers as they uncover the mysteries of the ocean floor. Winner, Best Documentary Short 2024."
        bgColor="#1a0f0f"
      />
      <FeaturedProject
        name="Velocity"
        brief="High-octane automotive campaign blending practical stunts with cutting-edge VFX. 15M+ views across digital platforms."
        bgColor="#0f1a14"
      />
      <CTABanner />
    </motion.div>
  );
}

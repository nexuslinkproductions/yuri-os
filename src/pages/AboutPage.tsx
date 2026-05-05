import { motion } from 'framer-motion';
import { Section, Container } from '../components/ui';
import CTABanner from '../components/CTABanner';

const AboutHero = () => (
  <Section className="py-24 md:py-32 bg-black text-white">
    <Container>
      <motion.h1
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-5xl md:text-7xl font-bold tracking-tight mb-6"
      >
        About Nexus Link
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.15 }}
        className="text-xl text-zinc-400 max-w-2xl"
      >
        We tell stories that move people.
      </motion.p>
    </Container>
  </Section>
);

const ManifestoSection = () => (
  <Section className="py-20 bg-zinc-950">
    <Container>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="max-w-[720px] mx-auto space-y-8 text-lg md:text-xl leading-relaxed text-zinc-300"
        style={{ fontFamily: 'Georgia, serif' }}
      >
        <p>
          Nexus Link Productions was born from a simple belief: every brand has a story worth telling. 
          Founded in Vienna, we've grown from a two-person operation into an internationally recognized 
          production house working across film, commercial, and documentary formats. Our approach blends 
          European cinematic sensibility with global production capability.
        </p>
        <p>
          We don't just point cameras at subjects — we uncover narratives. Every frame is intentional, 
          every transition purposeful. Our team brings decades of combined experience from feature film, 
          broadcast television, and cutting-edge commercial work. We speak the language of directors, 
          producers, and brand strategists alike.
        </p>
        <p>
          From concept development through final delivery, we partner closely with our clients to ensure 
          the vision is not just realized, but elevated. Whether it's a thirty-second spot or a feature-length 
          documentary, we bring the same relentless attention to craft. This is not just production — it's 
          storytelling with conviction.
        </p>
      </motion.div>
    </Container>
  </Section>
);

const teamMembers = [
  { name: 'Marcel Spatz', role: 'Founder & Creative Director', photo: null },
  { name: 'Elena Voss', role: 'Director of Photography', photo: null },
  { name: 'Lukas Hartmann', role: 'Post-Production Lead', photo: null },
  { name: 'Sofia Keller', role: 'Producer & Strategy', photo: null },
];

const TeamGrid = () => (
  <Section className="py-20 bg-black">
    <Container>
      <motion.h2
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        className="text-3xl md:text-4xl font-bold text-white mb-12"
      >
        The Team
      </motion.h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
        {teamMembers.map((member, i) => (
          <motion.div
            key={member.name}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: i * 0.1 }}
            className="group"
          >
            <div className="aspect-[3/4] bg-zinc-800 rounded-lg mb-4 flex items-center justify-center text-zinc-600 text-sm overflow-hidden">
              <div className="w-full h-full bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center">
                <svg className="w-12 h-12 text-zinc-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
            </div>
            <h3 className="text-xl font-semibold text-white">{member.name}</h3>
            <p className="text-zinc-400 text-sm">{member.role}</p>
          </motion.div>
        ))}
      </div>
    </Container>
  </Section>
);

const clientLogos = Array.from({ length: 12 }, (_, i) => `Client ${i + 1}`);

const ClientLogosGrid = () => (
  <Section className="py-20 bg-zinc-950">
    <Container>
      <motion.h2
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        className="text-3xl md:text-4xl font-bold text-white mb-12 text-center"
      >
        Trusted By
      </motion.h2>
      <div className="grid grid-cols-3 md:grid-cols-6 gap-6">
        {clientLogos.map((client, i) => (
          <motion.div
            key={client}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.3, delay: i * 0.04 }}
            className="bg-zinc-800/50 rounded-lg h-20 flex items-center justify-center px-4"
          >
            <span className="text-zinc-500 text-sm font-medium uppercase tracking-wider">{client}</span>
          </motion.div>
        ))}
      </div>
    </Container>
  </Section>
);

export default function AboutPage() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <AboutHero />
      <ManifestoSection />
      <TeamGrid />
      <ClientLogosGrid />
      <CTABanner headline="Ready to tell your story?" buttonLabel="Start a Project" buttonHref="/contact" />
    </motion.div>
  );
}

// ── Navigation ───────────────────────────────────────────────
export const navigation: { label: string; href: string }[] = [
  { label: 'Home', href: '/' },
  { label: 'Work', href: '/work' },
  { label: 'Services', href: '/services' },
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' },
  { label: 'Showreel', href: '/showreel' },
];

// ── Hero ─────────────────────────────────────────────────────
export const hero: { headline: string; subhead: string; eyebrow: string } = {
  headline: 'Where Vision Meets Precision',
  subhead: 'Premium video production for brands that demand more.',
  eyebrow: 'NEXUS LINK PRODUCTIONS',
};

// ── Services ─────────────────────────────────────────────────
interface ServiceEntry {
  title: string;
  description: string;
}

export const services: ServiceEntry[] = [
  {
    title: 'Video Production',
    description:
      'End-to-end production from concept development and scripting through shooting, directing, and post-production. We craft cinematic narratives that elevate your brand.',
  },
  {
    title: 'Post-Production',
    description:
      'Professional editing, color grading, sound design, VFX, and finishing. Our post-production pipeline delivers broadcast-ready content with meticulous attention to detail.',
  },
  {
    title: 'Motion Graphics',
    description:
      'Custom animated graphics, typography, data visualization, and 2D/3D animation. We bring complex ideas to life with clean, engaging visual storytelling.',
  },
  {
    title: 'Photography',
    description:
      'High-end commercial photography including product, portrait, architectural, and event coverage. Every frame treated with the same cinematic care as our video work.',
  },
  {
    title: 'Aerial / Drone',
    description:
      'Cinematic drone cinematography with professional-grade equipment. Licensed pilots ensure stunning aerial perspectives for commercial, documentary, and event projects.',
  },
];

// ── About ────────────────────────────────────────────────────
export const about: {
  founderName: string;
  companyName: string;
  location: string;
  founding: string;
  manifesto: string[];
} = {
  founderName: 'Marcel Spatz',
  companyName: 'Nexus Link Productions',
  location: 'Vienna, Austria',
  founding: '2018',
  manifesto: [
    'Founded in 2018 by Marcel Spatz, Nexus Link Productions was born from the conviction that video is the most powerful medium for connection. Based in Vienna, Austria, the studio bridges the gap between artistic vision and commercial precision — crafting visual narratives that resonate deeply with audiences across Europe and beyond. Every project begins with a conversation, not a brief.',
    'Our approach is rooted in collaboration. We believe the best work emerges when clients and creatives move as one — sharing insights, challenging assumptions, and pushing boundaries. From concept development through final delivery, we treat every frame as an opportunity to tell a story that matters. No templates. No shortcuts. Just purposeful, premium production.',
    'At our core, we are storytellers, engineers of emotion, and architects of visual experiences. Whether it is a 30-second commercial, a feature-length documentary, or a live-event capture, our team brings the same relentless commitment to quality. We do not just produce videos — we build lasting partnerships with brands that refuse to settle for anything less than extraordinary.',
  ],
};

// ── Process ──────────────────────────────────────────────────
interface ProcessStep {
  step: string;
  description: string;
}

export const process: ProcessStep[] = [
  {
    step: 'Discover',
    description:
      'We dive deep into your brand, audience, and goals to uncover the story that needs to be told.',
  },
  {
    step: 'Plan',
    description:
      'Detailed pre-production including scripting, storyboarding, scheduling, and logistics to ensure a seamless shoot.',
  },
  {
    step: 'Produce',
    description:
      'Cinematic production with professional gear and experienced crew, captured with precision and creativity.',
  },
  {
    step: 'Deliver',
    description:
      'Post-production finishing with grading, sound, and VFX — delivered in any format for any platform.',
  },
];

// ── Testimonials ─────────────────────────────────────────────
interface Testimonial {
  name: string;
  role: string;
  company: string;
  quote: string;
}

export const testimonials: Testimonial[] = [
  {
    name: 'Elena Richter',
    role: 'Marketing Director',
    company: 'Vienna Heritage Co.',
    quote:
      'Nexus Link transformed our brand film into something truly cinematic. The attention to detail and storytelling depth far exceeded our expectations.',
  },
  {
    name: 'Florian Wagner',
    role: 'CEO',
    company: 'Alpine Studios',
    quote:
      'Working with Marcel and his team was seamless from concept to delivery. Their post-production work is simply world-class.',
  },
  {
    name: 'Sophie Gruber',
    role: 'Event Director',
    company: 'Wiener Konzerthaus',
    quote:
      'Our gala recap video captured the emotion of the night perfectly. The team worked discreetly and delivered a cut that moved our audience to tears.',
  },
  {
    name: 'Lukas Steiner',
    role: 'Creative Lead',
    company: 'Danube Digital Agency',
    quote:
      'We have partnered on multiple campaigns now — the consistency, creativity, and professionalism are unmatched in the Vienna production scene.',
  },
];

// ── CTAs ─────────────────────────────────────────────────────
interface CTA {
  headline: string;
  sub: string;
  buttonLabel: string;
}

export const ctas: CTA[] = [
  {
    headline: 'Ready to create something extraordinary?',
    sub: 'Let us discuss your next project over coffee — virtual or in person.',
    buttonLabel: 'Start a Conversation',
  },
  {
    headline: 'See our work in motion',
    sub: 'Browse our latest projects and discover what precision storytelling looks like.',
    buttonLabel: 'View Our Work',
  },
  {
    headline: 'Need a showreel?',
    sub: 'We produce showreels that land clients. Let us make yours unforgettable.',
    buttonLabel: 'Get Your Showreel',
  },
];

// ── Footer ───────────────────────────────────────────────────
export const footer: { tagline: string; copyright: string } = {
  tagline: 'Premium video production. Vienna.',
  copyright: '© 2026 Nexus Link Productions.',
};

// ── SEO ──────────────────────────────────────────────────────
export const seo: {
  title: string;
  description: string;
  ogImage: string;
} = {
  title: 'Nexus Link Productions — Premium Video Production, Vienna',
  description:
    'Nexus Link Productions is a Vienna-based video production studio crafting premium visual narratives for brands that demand more. Commercials, documentaries, motion graphics & aerial cinematography.',
  ogImage: '/images/og-default.jpg',
};

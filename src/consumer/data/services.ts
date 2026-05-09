export interface Service {
  id: string;
  title: string;
  tagline: string;
  description: string;
  deliverables: string[];
  iconSymbol: string;
  accent: 'purple' | 'cyan';
}

export const services: Service[] = [
  {
    id: 'video',
    title: 'Video Production',
    tagline: 'Cinematic capture, broadcast-ready delivery.',
    description:
      'On-set capture for commercials, brand films, music videos, and editorial. Full crew, lighting, sound, and grading. Final masters in any format.',
    deliverables: ['Commercial spots', 'Brand films', 'Music videos', 'Editorial cuts'],
    iconSymbol: '◇',
    accent: 'purple',
  },
  {
    id: 'motion',
    title: 'Motion Design',
    tagline: 'Title sequences and motion systems that breathe.',
    description:
      'Kinetic typography, brand motion systems, and animated graphics built in After Effects and Cinema 4D. Designed to scale across platforms.',
    deliverables: ['Title sequences', 'Brand motion systems', 'Animated logos', 'Social cuts'],
    iconSymbol: '✦',
    accent: 'purple',
  },
  {
    id: 'social',
    title: 'Social Content',
    tagline: 'Platform-native output that stays active.',
    description:
      'Vertical, square, and horizontal cuts engineered per platform. Hook-first edits with a release rhythm. Not spray-and-pray volume.',
    deliverables: ['TikTok / Reels', 'YouTube Shorts', 'Stories arcs', 'Campaign packs'],
    iconSymbol: '⊡',
    accent: 'cyan',
  },
  {
    id: 'web',
    title: 'Web Development',
    tagline: 'Fast landing surfaces with one clear path.',
    description:
      'React + Vite landing sites, portfolios, and lightweight web apps. Built fast, deployed clean, with one dominant action per view.',
    deliverables: ['Landing pages', 'Portfolio sites', 'Brand microsites', 'Form pipelines'],
    iconSymbol: '⊟',
    accent: 'cyan',
  },
  {
    id: 'it',
    title: 'IT / Cybersecurity',
    tagline: 'Practical infrastructure that keeps work safe.',
    description:
      'Endpoint hardening, secure storage, asset versioning, and pipeline integrity for studios that move sensitive client material.',
    deliverables: ['Endpoint hardening', 'Asset vaults', 'Backup pipelines', 'Access policy'],
    iconSymbol: '⎔',
    accent: 'purple',
  },
  {
    id: 'ads',
    title: 'Ad Management',
    tagline: 'Targeted campaigns. Measurement, not budget burn.',
    description:
      'Meta and Google campaign architecture with creative iteration loops. Tracked, attributed, and optimised against actual outcomes.',
    deliverables: ['Meta campaigns', 'Google Ads', 'Creative iteration', 'Attribution tracking'],
    iconSymbol: '⧫',
    accent: 'cyan',
  },
];

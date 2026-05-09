export interface Stat {
  label: string;
  value: number;
  suffix?: string;
}

export interface Milestone {
  year: number;
  title: string;
  description: string;
}

export const profile: {
  name: string;
  title: string;
  location: string;
  bio: string;
  photoUrl: string;
} = {
  name: 'Marcel Spatz',
  title: 'Video Producer · Founder, Nexus Link Productions',
  location: 'Vienna, Austria',
  bio:
    'Cinematic video production with the precision of a system. I built Nexus Link Productions to deliver premium video, motion, and digital strategy without the friction of a generalist studio. Every project ships with a single source of truth, a single point of contact, and a clear delivery contract.',
  photoUrl: '/about/marcel-portrait.jpg',
};

export const brandStory: string =
  'Nexus Link Productions is a Vienna-based premium production studio. Three words: Premium, Futuristic, Precise. We shoot, edit, and deliver broadcast-ready work for brands that take their identity seriously. No content farms. No generalist drift. One operator, one stack, one delivery promise.';

export const stats: Stat[] = [
  { label: 'Projects shipped', value: 50, suffix: '+' },
  { label: 'Years operating', value: 3 },
  { label: 'On-time delivery', value: 100, suffix: '%' },
  { label: 'Time zones served', value: 4 },
];

export const milestones: Milestone[] = [
  {
    year: 2023,
    title: 'Studio founded',
    description:
      'Nexus Link Productions begins operating from Vienna with a focus on premium brand video.',
  },
  {
    year: 2024,
    title: 'Motion system practice',
    description:
      'Expanded into kinetic typography and brand motion systems for B2B clients.',
  },
  {
    year: 2026,
    title: 'Operator system live',
    description:
      'NUDIMMUD command center deployed. Production pipeline fully integrated with infrastructure.',
  },
];

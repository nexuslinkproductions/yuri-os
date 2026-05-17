export interface PortfolioItem {
  id: string;
  title: string;
  client: string;
  category: string;
  year: number;
  thumbnailUrl: string;
  videoUrl?: string;
  description: string;
}

export const portfolio: PortfolioItem[] = [
  {
    id: 'aurora-residency',
    title: 'Aurora Residency',
    client: 'Confidential luxury hospitality',
    category: 'Brand Film',
    year: 2026,
    thumbnailUrl: '/portfolio/aurora-residency-poster.jpg',
    description:
      'A 90-second cinematic short for a Vienna hotel residency. Anamorphic glass, dusk-blue grade, two-day shoot.',
  },
  {
    id: 'kinetic-bauhaus',
    title: 'Kinetic Bauhaus',
    client: 'Independent label',
    category: 'Music Video',
    year: 2026,
    thumbnailUrl: '/portfolio/kinetic-bauhaus-poster.jpg',
    description:
      'Music video built around mechanical type and four lighting setups. Practical effects, no VFX.',
  },
  {
    id: 'meridian-launch',
    title: 'Meridian Launch',
    client: 'B2B SaaS',
    category: 'Product Launch',
    year: 2025,
    thumbnailUrl: '/portfolio/meridian-launch-poster.jpg',
    description:
      'Launch film and motion system for a B2B platform. Six deliverables across web, social, and conference.',
  },
  {
    id: 'silent-knot',
    title: 'Silent Knot',
    client: 'Personal',
    category: 'Editorial',
    year: 2025,
    thumbnailUrl: '/portfolio/silent-knot-poster.jpg',
    description:
      'A self-directed editorial piece exploring craftsmanship, slowness, and discipline.',
  },
  {
    id: 'commerce-cut',
    title: 'Commerce Cut',
    client: 'DTC retail',
    category: 'Campaign',
    year: 2025,
    thumbnailUrl: '/portfolio/commerce-cut-poster.jpg',
    description:
      'Modular ad pack: 30 hooks, 12 edits, 4 narrative arcs. Built for sustained iteration on Meta and TikTok.',
  },
  {
    id: 'nlp-reel',
    title: 'NLP Reel 2026',
    client: 'Nexus Link Productions',
    category: 'Showreel',
    year: 2026,
    thumbnailUrl: '/portfolio/nlp-reel-poster.jpg',
    description: 'Studio showreel of selected work from 2024–2026. Cut to 75 seconds.',
  },
];

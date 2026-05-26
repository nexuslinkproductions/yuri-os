import { linear } from './sources/linear';
import { vercelGeist } from './sources/vercel-geist';
import { appleHig } from './sources/apple-hig';
import { primer } from './sources/primer';
import { atlassian } from './sources/atlassian';
import { notion } from './sources/notion';
import { getdesignMdCatalog } from './getdesign-md';
import type { DesignSource } from './design-source';

export const designRadar: DesignSource[] = [
    linear,
    vercelGeist,
    appleHig,
    primer,
    atlassian,
    notion,
    ...getdesignMdCatalog
];

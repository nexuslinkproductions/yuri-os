import type { DesignSource } from '../design-source';

export const framerMotionAssets: DesignSource = {
    id: 'framer-motion-assets',
    name: 'Framer Motion Assets Digest',
    url: 'RESEARCH/DESIGN-RADAR/sources/framer-motion-assets.md',
    signal: [
        'X-ray hover, particle sphere, gallery spin, 3D parallax grid, SpectraNoise, Vortex Gallery Pro, circular CD selection, and Motion Tiles',
        'High-impact interaction primitives for reveals, orbital selection, parallax depth, procedural texture, and gallery choreography',
        'Compact asset digest for quick source selection before custom implementation'
    ],
    applyToYuri: [
        'Use one of these as the primary motion system for showcase screens',
        'Convert visual tricks into stateful product interactions when possible',
        'Require reduced-motion and performance checks before shipping canvas or 3D variants'
    ]
};

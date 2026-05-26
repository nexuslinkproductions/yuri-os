import type { DesignSource } from '../design-source';

export const appleHig: DesignSource = {
    id: 'apple-hig',
    name: 'Apple HIG',
    url: 'https://developer.apple.com/design/human-interface-guidelines/',
    signal: [
        'Hierarchy first',
        'Harmony across controls',
        'Consistency across devices'
    ],
    applyToYuri: [
        'Clear first screen',
        'Platform-aware controls',
        'Less ornamental labeling'
    ]
};

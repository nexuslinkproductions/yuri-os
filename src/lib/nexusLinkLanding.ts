export type LandingNavItem = {
    label: string;
    target: string;
};

export type LandingStat = {
    label: string;
    value: string;
    detail: string;
};

export type LandingService = {
    title: string;
    summary: string;
    accent: string;
};

export type LandingPortfolioItem = {
    title: string;
    category: string;
    summary: string;
};

export type LandingContactItem = {
    label: string;
    value: string;
    href?: string;
};

export const nexusLinkLandingContent = {
    brand: {
        name: 'Nexus Link Productions',
        strapline: 'Public landing, client research, and reference shelf in one shell.',
        tag: 'NexusLink landing module'
    },
    nav: [
        { label: 'Home', target: 'top' },
        { label: 'Services', target: 'services' },
        { label: 'Work', target: 'portfolio' },
        { label: 'Contact', target: 'contact' }
    ] satisfies LandingNavItem[],
    hero: {
        eyebrow: 'Public module',
        title: 'A sharp front door for NexusLink.',
        summary:
            'One landing surface. One direct story. The public face stays clear, while the research workspace stays one step behind it.',
        primaryAction: 'See services',
        secondaryAction: 'View selected work',
        kicker: 'Built for clarity, pace, and trust.'
    },
    stats: [
        { label: 'Launch paths', value: '3', detail: 'Public entry, research, and source shelf stay legible.' },
        { label: 'Service lanes', value: '4', detail: 'Production, post, motion, and direction move as one offer.' },
        { label: 'Case studies', value: '4', detail: 'Selected work shows the range without clutter.' },
        { label: 'Reply base', value: 'Vienna', detail: 'Direct contact, local presence, clean handoff.' }
    ] satisfies LandingStat[],
    manifest: [
        'Premium but restrained visual language.',
        'Clear hierarchy from first screen to footer.',
        'Copy that explains the offer without jargon.',
        'One obvious next step on every section.'
    ],
    services: [
        {
            title: 'Production',
            summary: 'Concept to delivery for campaigns, internal assets, and launch material.',
            accent: 'Campaigns and launch systems'
        },
        {
            title: 'Post',
            summary: 'Editing, color, and finishing with clear handoff points.',
            accent: 'Editing and finishing'
        },
        {
            title: 'Motion',
            summary: 'Titles, systems, and motion language that stay readable at speed.',
            accent: 'Motion systems'
        },
        {
            title: 'Creative Direction',
            summary: 'Strategy, structure, and approval discipline before production starts.',
            accent: 'Structure before scale'
        }
    ] satisfies LandingService[],
    portfolio: [
        {
            title: 'Launch Systems',
            category: 'Control',
            summary: 'Command rail, route labels, and module entry logic.'
        },
        {
            title: 'Client Briefing',
            category: 'Research',
            summary: 'Workspace flow for notes, sources, and next actions.'
        },
        {
            title: 'Reference Shelf',
            category: 'Sources',
            summary: 'Design radar as a visible system, not buried context.'
        },
        {
            title: 'Public Module',
            category: 'Landing',
            summary: 'Crisp public surface with one dominant action strip.'
        }
    ] satisfies LandingPortfolioItem[],
    contact: [
        { label: 'Email', value: 'contact@nexuslinkproductions.com', href: 'mailto:contact@nexuslinkproductions.com' },
        { label: 'Location', value: 'Vienna, Austria' },
        { label: 'Response', value: 'Direct, concise, and scoped to the brief.' }
    ] satisfies LandingContactItem[],
    footer: {
        note: 'Public landing, research workspace, and reference shelf inside one module shell.',
        links: [
            { label: 'NexusLink', target: 'top' },
            { label: 'Research', target: 'research' },
            { label: 'Sources', target: 'sources' },
            { label: 'Contact', target: 'contact' }
        ] satisfies LandingNavItem[]
    }
} as const;


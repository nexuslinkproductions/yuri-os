export const navItems = [
    { label: 'NexusLink', href: '/' },
    { label: 'Research', href: '/research' },
    { label: 'Sources', href: '/sources' }
];

export const launchOrder = [
    'Shell contract',
    'Public landing',
    'Internal research',
    'Reference shelf'
];

export const researchQueue = [
    {
        name: 'NexusLink',
        status: 'Public module',
        note: 'Landing surface and conversion entry point.'
    },
    {
        name: 'Client research',
        status: 'Internal workspace',
        note: 'Notes, sources, decision logs, next actions.'
    },
    {
        name: 'Reference shelf',
        status: 'Shared corpus',
        note: 'Design radar and shell patterns kept visible.'
    }
];

export const researchChecklist = [
    'Scope',
    'Status',
    'Date',
    'Sources',
    'Summary',
    'Findings',
    'Open questions',
    'Next action'
];

export const designRadarSources = [
    {
        name: 'Linear',
        file: 'RESEARCH/DESIGN-RADAR/sources/linear.md',
        signal: 'Product-first hierarchy, fast scanning, low-noise surfaces.',
        apply: 'Top command rail and one dominant action per view.'
    },
    {
        name: 'Vercel / Geist',
        file: 'RESEARCH/DESIGN-RADAR/sources/vercel-geist.md',
        signal: 'Crisp tokens, sharp spacing, developer-forward minimalism.',
        apply: 'Restraint in chrome and one accent per context.'
    },
    {
        name: 'Apple HIG',
        file: 'RESEARCH/DESIGN-RADAR/sources/apple-hig.md',
        signal: 'Hierarchy, harmony, and consistency across devices.',
        apply: 'Clear first screen and platform-aware controls.'
    },
    {
        name: 'Primer',
        file: 'RESEARCH/DESIGN-RADAR/sources/primer.md',
        signal: 'Accessible defaults and efficient product UI.',
        apply: 'Operational tables, filters, and direct state feedback.'
    },
    {
        name: 'Atlassian',
        file: 'RESEARCH/DESIGN-RADAR/sources/atlassian.md',
        signal: 'Modular foundations and content discipline.',
        apply: 'Composable shell regions and clear system naming.'
    },
    {
        name: 'Notion',
        file: 'RESEARCH/DESIGN-RADAR/sources/notion.md',
        signal: 'Flexible information architecture and docs plus action.',
        apply: 'Directory feel and native shell integration.'
    }
];

export const independenceData = {
    tagline: 'Sovereign by default. Cloud by consent.',
    score: 67,
    target: 90,
    deadline: '2026-06-14',
    failCount: 0,
    activeLanes: [
        { id: 'deepseek-v4-pro',    role: 'Deep reasoning · architecture review',  tier: 'cloud' },
        { id: 'deepseek-v4-flash',  role: 'Fast triage · condensation',             tier: 'cloud' },
        { id: 'gpt-5.5',            role: 'Implementation · extended reasoning',    tier: 'cloud' },
        { id: 'gpt-5.4-mini',       role: 'Mechanical implementation',              tier: 'cloud' },
        { id: 'qwen2.5:7b',         role: 'Local general reasoning',                tier: 'local' },
        { id: 'qwen2.5-coder:7b',   role: 'Local code execution',                  tier: 'local' },
        { id: 'nvidia-nemotron-70b',role: 'Signal engine · hosted reasoning',       tier: 'cloud' },
        { id: 'kimi-k2.6',          role: 'Long context · deep synthesis',          tier: 'cloud' },
    ],
    verifyCommand: 'node nexbox/verify --strict',
};

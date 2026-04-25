export function humanizeLabel(value: string) {
    return String(value)
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .map((part) => {
            if (!part) return part;
            if (/^[A-Z0-9]+$/.test(part) && part.length <= 3) return part;
            if (/^[A-Z0-9]+$/.test(part)) return part.charAt(0) + part.slice(1).toLowerCase();
            return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
        })
        .join(' ');
}

const ROUTE_LABELS: Record<string, string> = {
    BRIDGE: 'NexusLink',
    LANDING: 'NexusLink',
    NEXUSLINK: 'NexusLink',
    ABZU: 'Search',
    SEARCH: 'Search',
    RESEARCH: 'Research',
    ENKI: 'Oracle'
};

const ROUTE_ALIASES: Record<string, string> = {
    BRIDGE: 'NEXUSLINK',
    LANDING: 'NEXUSLINK',
    SEARCH: 'ABZU',
    ENKI: 'ORACLE'
};

export function resolveRouteKey(module: string) {
    return ROUTE_ALIASES[module] || module;
}

export function routeLabel(module: string) {
    return ROUTE_LABELS[module] || humanizeLabel(module);
}

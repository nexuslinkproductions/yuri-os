export interface Bounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface ElementSelectorParts {
    tagName: string;
    id?: string;
    classNames?: string[];
    nthOfType?: number;
    parentSelector?: string;
}

export function normalizeBounds(bounds: Bounds, viewport: { width: number; height: number }): Bounds {
    const x = clamp(Math.round(bounds.x), 0, Math.round(viewport.width));
    const y = clamp(Math.round(bounds.y), 0, Math.round(viewport.height));
    const right = clamp(Math.round(bounds.x + bounds.width), 0, Math.round(viewport.width));
    const bottom = clamp(Math.round(bounds.y + bounds.height), 0, Math.round(viewport.height));
    return {
        x,
        y,
        width: Math.max(0, right - x),
        height: Math.max(0, bottom - y)
    };
}

export function selectorFromElementParts(parts: ElementSelectorParts): string {
    const tag = sanitizeSelectorToken(parts.tagName.toLowerCase() || 'element');
    if (parts.id) {
        return `${tag}#${cssEscape(parts.id)}`;
    }

    const classSegment = (parts.classNames || [])
        .filter(Boolean)
        .slice(0, 3)
        .map((className) => `.${cssEscape(className)}`)
        .join('');
    const nth = parts.nthOfType && parts.nthOfType > 1 ? `:nth-of-type(${parts.nthOfType})` : '';
    const own = `${tag}${classSegment}${nth}`;
    return parts.parentSelector ? `${parts.parentSelector} > ${own}` : own;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function sanitizeSelectorToken(value: string): string {
    return value.replace(/[^a-z0-9_-]/gi, '') || 'element';
}

function cssEscape(value: string): string {
    const cssApi = (globalThis as typeof globalThis & {
        CSS?: {
            escape?: (input: string) => string;
        };
    }).CSS;
    if (typeof cssApi?.escape === 'function') {
        return cssApi.escape(value);
    }
    return value.replace(/[^a-z0-9_-]/gi, (char) => `\\${char}`);
}

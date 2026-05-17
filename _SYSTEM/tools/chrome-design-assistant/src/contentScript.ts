import { normalizeBounds, selectorFromElementParts, type Bounds } from './shared/selector';
import type { AssistantMode, SelectionSnapshot, ViewportSnapshot } from './shared/types';

if (!window.__chromeDesignAssistantLoaded) {
    window.__chromeDesignAssistantLoaded = true;
    boot();
}

function boot() {
    let mode: AssistantMode = 'off';
    let hoverBox: HTMLDivElement | null = null;
    let regionBox: HTMLDivElement | null = null;
    let regionStart: { x: number; y: number } | null = null;

    chrome.runtime.sendMessage({ type: 'cda:content-ready', url: location.href }).catch(() => {});

    chrome.runtime.onMessage.addListener((message: any, _sender: any, sendResponse: (response?: any) => void) => {
        if (message?.type === 'cda:set-mode') {
            mode = message.mode || 'off';
            document.documentElement.dataset.cdaMode = mode;
            ensureHoverBox();
            if (mode === 'off') clearBox(hoverBox);
            sendResponse({ ok: true, mode });
            return;
        }

        if (message?.type === 'cda:get-viewport') {
            sendResponse({ ok: true, viewport: getViewport() });
            return;
        }
    });

    document.addEventListener('mousemove', (event) => {
        if (mode !== 'inspect') return;
        const target = event.target instanceof Element ? event.target : null;
        if (!target || isAssistantNode(target)) return;
        const rect = target.getBoundingClientRect();
        drawBox(ensureHoverBox(), rectToBounds(rect), 'hover');
    }, true);

    document.addEventListener('click', (event) => {
        if (mode !== 'inspect') return;
        const target = event.target instanceof Element ? event.target : null;
        if (!target || isAssistantNode(target)) return;
        event.preventDefault();
        event.stopPropagation();
        const snapshot = snapshotElement(target);
        chrome.runtime.sendMessage({ type: 'cda:selection-created', selection: snapshot }).catch(() => {});
        drawBox(ensureHoverBox(), snapshot.bounds, 'selected');
    }, true);

    document.addEventListener('pointerdown', (event) => {
        if (mode !== 'region') return;
        event.preventDefault();
        event.stopPropagation();
        regionStart = { x: event.clientX, y: event.clientY };
        regionBox = ensureRegionBox();
        drawBox(regionBox, { x: event.clientX, y: event.clientY, width: 0, height: 0 }, 'region');
    }, true);

    document.addEventListener('pointermove', (event) => {
        if (mode !== 'region' || !regionStart || !regionBox) return;
        event.preventDefault();
        drawBox(regionBox, boundsFromPoints(regionStart, { x: event.clientX, y: event.clientY }), 'region');
    }, true);

    document.addEventListener('pointerup', (event) => {
        if (mode !== 'region' || !regionStart || !regionBox) return;
        event.preventDefault();
        event.stopPropagation();
        const bounds = normalizeBounds(boundsFromPoints(regionStart, { x: event.clientX, y: event.clientY }), {
            width: window.innerWidth,
            height: window.innerHeight
        });
        regionStart = null;
        if (bounds.width < 6 || bounds.height < 6) return;
        const snapshot: SelectionSnapshot = {
            kind: 'region',
            selector: '',
            label: `Region ${bounds.width}x${bounds.height}`,
            role: '',
            text: '',
            bounds,
            computedStyles: {},
            structure: { scrollX: window.scrollX, scrollY: window.scrollY },
            viewport: getViewport(),
            url: location.href,
            title: document.title
        };
        chrome.runtime.sendMessage({ type: 'cda:selection-created', selection: snapshot }).catch(() => {});
        drawBox(regionBox, bounds, 'selected');
    }, true);

    function ensureHoverBox(): HTMLDivElement {
        if (hoverBox) return hoverBox;
        hoverBox = document.createElement('div');
        hoverBox.className = 'cda-box cda-hover-box';
        document.documentElement.appendChild(hoverBox);
        return hoverBox;
    }

    function ensureRegionBox(): HTMLDivElement {
        if (regionBox) return regionBox;
        regionBox = document.createElement('div');
        regionBox.className = 'cda-box cda-region-box';
        document.documentElement.appendChild(regionBox);
        return regionBox;
    }
}

function snapshotElement(element: Element): SelectionSnapshot {
    const rect = element.getBoundingClientRect();
    const bounds = normalizeBounds(rectToBounds(rect), { width: window.innerWidth, height: window.innerHeight });
    return {
        kind: 'element',
        selector: selectorForElement(element),
        label: labelForElement(element),
        role: roleForElement(element),
        text: textForElement(element),
        bounds,
        computedStyles: computedStyleSnapshot(element),
        structure: structureForElement(element),
        viewport: getViewport(),
        url: location.href,
        title: document.title
    };
}

function selectorForElement(element: Element): string {
    const chain: string[] = [];
    let current: Element | null = element;
    for (let depth = 0; current && depth < 5; depth += 1) {
        const parentSelector = chain[0];
        const selector = selectorFromElementParts({
            tagName: current.tagName.toLowerCase(),
            id: current.id || undefined,
            classNames: Array.from(current.classList || []).filter((name) => !name.startsWith('cda-')),
            nthOfType: nthOfType(current),
            parentSelector
        });
        chain.unshift(parentSelector ? selector.split(' > ').pop() || selector : selector);
        if (current.id) break;
        current = current.parentElement;
    }
    return chain.join(' > ');
}

function nthOfType(element: Element): number {
    let index = 1;
    let sibling = element.previousElementSibling;
    while (sibling) {
        if (sibling.tagName === element.tagName) index += 1;
        sibling = sibling.previousElementSibling;
    }
    return index;
}

function computedStyleSnapshot(element: Element): Record<string, string> {
    const styles = window.getComputedStyle(element);
    const keys = [
        'display',
        'position',
        'font-family',
        'font-size',
        'font-weight',
        'line-height',
        'letter-spacing',
        'color',
        'background-color',
        'border',
        'border-radius',
        'box-shadow',
        'margin',
        'padding',
        'z-index'
    ];
    return Object.fromEntries(keys.map((key) => [key, styles.getPropertyValue(key)]));
}

function structureForElement(element: Element): Record<string, unknown> {
    const parent = element.parentElement;
    return {
        tagName: element.tagName.toLowerCase(),
        parent: parent ? selectorForElement(parent) : '',
        siblings: parent ? Array.from(parent.children).slice(0, 8).map((child) => ({
            tagName: child.tagName.toLowerCase(),
            selector: selectorForElement(child),
            text: textForElement(child).slice(0, 80)
        })) : [],
        ancestry: ancestry(element)
    };
}

function ancestry(element: Element): string[] {
    const nodes: string[] = [];
    let current: Element | null = element.parentElement;
    while (current && nodes.length < 6) {
        nodes.push(selectorForElement(current));
        current = current.parentElement;
    }
    return nodes;
}

function getViewport(): ViewportSnapshot {
    return {
        width: window.innerWidth,
        height: window.innerHeight,
        deviceScaleFactor: window.devicePixelRatio || 1,
        scrollX: window.scrollX,
        scrollY: window.scrollY
    };
}

function drawBox(box: HTMLDivElement, bounds: Bounds, state: 'hover' | 'selected' | 'region') {
    box.dataset.state = state;
    box.style.transform = `translate(${bounds.x}px, ${bounds.y}px)`;
    box.style.width = `${bounds.width}px`;
    box.style.height = `${bounds.height}px`;
    box.style.opacity = bounds.width > 0 && bounds.height > 0 ? '1' : '0';
}

function clearBox(box: HTMLDivElement | null) {
    if (!box) return;
    box.style.opacity = '0';
}

function rectToBounds(rect: DOMRect): Bounds {
    return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
}

function boundsFromPoints(start: { x: number; y: number }, end: { x: number; y: number }): Bounds {
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    return {
        x,
        y,
        width: Math.abs(end.x - start.x),
        height: Math.abs(end.y - start.y)
    };
}

function labelForElement(element: Element): string {
    const aria = element.getAttribute('aria-label');
    if (aria) return aria.trim();
    const text = textForElement(element);
    if (text) return text.slice(0, 80);
    return element.tagName.toLowerCase();
}

function roleForElement(element: Element): string {
    const explicit = element.getAttribute('role');
    if (explicit) return explicit;
    const tag = element.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) return 'heading';
    if (tag === 'button') return 'button';
    if (tag === 'a') return 'link';
    if (tag === 'img') return 'image';
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return 'input';
    return '';
}

function textForElement(element: Element): string {
    return (element.textContent || '').replace(/\s+/g, ' ').trim();
}

function isAssistantNode(element: Element): boolean {
    return Boolean(element.closest('.cda-box'));
}

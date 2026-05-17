let latestSelection: unknown = null;
let lastCaptureAt = 0;

chrome.runtime.onInstalled.addListener(() => {
    chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.action.onClicked.addListener(async (tab: any) => {
    if (tab?.windowId !== undefined) {
        await chrome.sidePanel?.open?.({ windowId: tab.windowId }).catch(() => {});
    }
});

chrome.runtime.onMessage.addListener((message: any, sender: any, sendResponse: (response?: any) => void) => {
    void handleMessage(message, sender)
        .then((response) => sendResponse(response))
        .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
});

async function handleMessage(message: any, sender: any): Promise<any> {
    switch (message?.type) {
        case 'cda:content-ready':
            return { ok: true };
        case 'cda:selection-created':
            latestSelection = message.selection;
            await chrome.storage.session?.set?.({ latestSelection });
            await broadcast({ type: 'cda:selection-updated', selection: latestSelection });
            return { ok: true };
        case 'cda:get-state':
            return { ok: true, latestSelection: await readLatestSelection(), activeTab: await getActiveTab() };
        case 'cda:get-active-tab':
            return { ok: true, tab: await getActiveTab() };
        case 'cda:set-mode':
            return setMode(message.mode);
        case 'cda:capture-visible-tab':
            return captureVisibleTab();
        case 'cda:get-dom-snapshot':
            return captureDomSnapshot(message.tabId);
        default:
            if (sender?.tab?.id && message?.type === 'cda:get-mode') {
                return { ok: true, mode: 'off' };
            }
            return { ok: false, error: `Unsupported message: ${message?.type || 'unknown'}` };
    }
}

async function setMode(mode: 'off' | 'inspect' | 'region') {
    const tab = await getActiveTab();
    if (!tab?.id) throw new Error('No active tab');
    await chrome.tabs.sendMessage(tab.id, { type: 'cda:set-mode', mode });
    return { ok: true, mode };
}

async function captureVisibleTab() {
    const tab = await getActiveTab();
    if (!tab?.id || tab.windowId === undefined) throw new Error('No active tab');

    const elapsed = Date.now() - lastCaptureAt;
    if (elapsed < 550) {
        await sleep(550 - elapsed);
    }
    lastCaptureAt = Date.now();

    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 82 });
    const viewport = await chrome.tabs.sendMessage(tab.id, { type: 'cda:get-viewport' }).catch(() => null);
    return {
        ok: true,
        capture: {
            dataUrl,
            viewport: viewport?.viewport || {
                width: tab.width || 0,
                height: tab.height || 0,
                deviceScaleFactor: 1,
                scrollX: 0,
                scrollY: 0
            },
            tabId: tab.id,
            url: tab.url || '',
            title: tab.title || ''
        }
    };
}

async function captureDomSnapshot(tabId?: number) {
    const tab = tabId ? { id: tabId } : await getActiveTab();
    if (!tab?.id) throw new Error('No active tab');
    const target = { tabId: tab.id };
    const computedStyles = [
        'display',
        'position',
        'font-family',
        'font-size',
        'font-weight',
        'line-height',
        'letter-spacing',
        'color',
        'background-color',
        'border-radius',
        'box-shadow',
        'margin',
        'padding'
    ];

    await chrome.debugger.attach(target, '1.3');
    try {
        const snapshot = await chrome.debugger.sendCommand(target, 'DOMSnapshot.captureSnapshot', {
            computedStyles,
            includeDOMRects: true,
            includePaintOrder: true
        });
        return { ok: true, snapshot };
    } finally {
        await chrome.debugger.detach(target).catch(() => {});
    }
}

async function getActiveTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs?.[0] || null;
}

async function readLatestSelection() {
    const stored = await chrome.storage.session?.get?.('latestSelection').catch(() => null);
    return stored?.latestSelection || latestSelection;
}

async function broadcast(message: any) {
    await chrome.runtime.sendMessage(message).catch(() => {});
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

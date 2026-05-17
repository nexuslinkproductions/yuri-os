const button = document.getElementById('snapshot') as HTMLButtonElement;
const output = document.getElementById('output') as HTMLPreElement;

button.addEventListener('click', async () => {
    output.textContent = 'Capturing...';
    const tabId = chrome.devtools.inspectedWindow.tabId;
    const response = await chrome.runtime.sendMessage({ type: 'cda:get-dom-snapshot', tabId });
    if (!response?.ok) {
        output.textContent = response?.error || 'DOMSnapshot failed';
        return;
    }
    const documentCount = response.snapshot?.documents?.length || 0;
    const layoutCount = response.snapshot?.documents?.reduce((sum: number, doc: any) => sum + (doc.layout?.nodeIndex?.length || 0), 0) || 0;
    output.textContent = JSON.stringify({
        documents: documentCount,
        layoutNodes: layoutCount,
        strings: response.snapshot?.strings?.length || 0
    }, null, 2);
});

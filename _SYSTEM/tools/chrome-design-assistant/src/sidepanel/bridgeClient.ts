import type { BridgeCapture, BridgeRequest, BridgeSelection, CaptureResponse, SelectionSnapshot } from '../shared/types';

const DEFAULT_BRIDGE_ORIGIN = 'http://127.0.0.1:3004';

export interface BridgeRequestResponse {
    id: string;
    requestId: string;
    source: string;
    status: string;
    message: string;
    artifacts: unknown[];
    createdAt: string;
}

export interface BridgeRequestRecord extends BridgeRequest {
    captureId: string | null;
    selectionId: string | null;
    claimedBy: string | null;
    claimedAt: string | null;
    targetProjectRoot: string;
    designSourceIds: string[];
    payload: Record<string, unknown>;
}

export interface BridgeRequestPacket {
    schema: string;
    request: BridgeRequestRecord;
    capture: BridgeCapture | null;
    selection: BridgeSelection | null;
    responses: BridgeRequestResponse[];
    codexInstruction: string;
}

export interface BridgeRequestDetails {
    request: BridgeRequestRecord;
    packet: BridgeRequestPacket | null;
}

export interface BridgeHistory {
    requests: BridgeRequestRecord[];
    responses: BridgeRequestResponse[];
}

export class BridgeClient {
    readonly origin: string;

    constructor(origin = DEFAULT_BRIDGE_ORIGIN) {
        this.origin = origin.replace(/\/$/, '');
    }

    liveUrl(): string {
        return this.origin.replace(/^http/, 'ws') + '/api/design-assistant/live';
    }

    async health(): Promise<any> {
        return this.request('/api/design-assistant/health');
    }

    async saveCapture(capture: CaptureResponse): Promise<BridgeCapture> {
        const result = await this.request('/api/design-assistant/captures', {
            method: 'POST',
            body: {
                tabId: capture.tabId,
                url: capture.url,
                title: capture.title,
                viewport: capture.viewport,
                screenshotDataUrl: capture.dataUrl,
                metadata: { source: 'chrome-extension' }
            }
        });
        return result.capture;
    }

    async saveSelection(selection: SelectionSnapshot, captureId: string | null, cropDataUrl?: string): Promise<BridgeSelection> {
        const result = await this.request('/api/design-assistant/selections', {
            method: 'POST',
            body: {
                captureId,
                tabId: null,
                url: selection.url,
                kind: selection.kind,
                selector: selection.selector,
                label: selection.label,
                role: selection.role,
                text: selection.text,
                bounds: selection.bounds,
                computedStyles: selection.computedStyles,
                structure: selection.structure,
                screenshotCropDataUrl: cropDataUrl,
                metadata: { viewport: selection.viewport }
            }
        });
        return result.selection;
    }

    async createRequest(input: {
        captureId: string | null;
        selectionId: string | null;
        instruction: string;
        constraints: string[];
        targetProjectRoot: string;
        designSourceIds: string[];
        payload: Record<string, unknown>;
    }): Promise<BridgeRequest> {
        const result = await this.request('/api/design-assistant/requests', { method: 'POST', body: input });
        return result.request;
    }

    async pendingRequests(): Promise<BridgeRequest[]> {
        const result = await this.request('/api/design-assistant/requests/pending');
        return result.requests || [];
    }

    async getRequest(requestId: string): Promise<BridgeRequestDetails> {
        const result = await this.request(`/api/design-assistant/requests/${encodeURIComponent(requestId)}`);
        return result;
    }

    async searchHistory(query = '', limit = 20): Promise<BridgeHistory> {
        const result = await this.request(`/api/design-assistant/history/search?q=${encodeURIComponent(query)}&limit=${encodeURIComponent(limit)}`);
        return {
            requests: result.requests || [],
            responses: result.responses || []
        };
    }

    async postResponse(input: { requestId: string; status: string; message: string; artifacts?: unknown[] }): Promise<void> {
        await this.request('/api/design-assistant/responses', {
            method: 'POST',
            body: { ...input, source: 'extension' }
        });
    }

    private async request(path: string, options: { method?: string; body?: unknown } = {}): Promise<any> {
        const response = await fetch(`${this.origin}${path}`, {
            method: options.method || 'GET',
            headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
            body: options.body ? JSON.stringify(options.body) : undefined
        });

        if (response.status === 204) return {};
        const text = await response.text();
        const json = text ? JSON.parse(text) : {};
        if (!response.ok) {
            throw new Error(json.error || `Bridge request failed: ${response.status}`);
        }
        return json;
    }
}

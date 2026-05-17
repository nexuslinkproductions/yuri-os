import type { Bounds } from './selector';

export type AssistantMode = 'off' | 'inspect' | 'region';
export type BridgeStatus = 'unknown' | 'connected' | 'offline' | 'error';

export interface ViewportSnapshot {
    width: number;
    height: number;
    deviceScaleFactor: number;
    scrollX: number;
    scrollY: number;
}

export interface ElementSnapshot {
    kind: 'element';
    selector: string;
    label: string;
    role: string;
    text: string;
    bounds: Bounds;
    computedStyles: Record<string, string>;
    structure: Record<string, unknown>;
    viewport: ViewportSnapshot;
    url: string;
    title: string;
}

export interface RegionSnapshot {
    kind: 'region';
    selector: '';
    label: string;
    role: '';
    text: '';
    bounds: Bounds;
    computedStyles: Record<string, string>;
    structure: Record<string, unknown>;
    viewport: ViewportSnapshot;
    url: string;
    title: string;
}

export type SelectionSnapshot = ElementSnapshot | RegionSnapshot;

export interface CaptureResponse {
    dataUrl: string;
    viewport: ViewportSnapshot;
    tabId: number | null;
    url: string;
    title: string;
}

export interface BridgeCapture {
    id: string;
    tabId: number | null;
    url: string;
    title: string;
    viewport: Record<string, unknown>;
    screenshotUri: string | null;
    createdAt: string;
}

export interface BridgeSelection {
    id: string;
    captureId: string | null;
    kind: 'element' | 'region';
    selector: string;
    label: string;
    bounds: Record<string, unknown>;
    createdAt: string;
}

export interface BridgeRequest {
    id: string;
    status: 'pending' | 'claimed' | 'responded' | 'applied' | 'cancelled';
    instruction: string;
    createdAt: string;
    updatedAt: string;
}

import React from 'react';
import { createRoot } from 'react-dom/client';
import PhysisVault from './components/PhysisVault';
import TelemetryDeck from './components/TelemetryDeck';
import AgentMonitor from './components/AgentMonitor';
import AlbedoSearch from './components/AlbedoSearch';
import ChronosStream from './components/ChronosStream';
import IndraSwarm from './components/IndraSwarm';
import LogosProjects from './components/LogosProjects';
import TicketBoard from './components/TicketBoard';
import NeuralForge from './components/NeuralForge';
import OraclePage from './components/Oracle/OraclePage';
import Bridge from './components/Bridge';
import MnemosyneMedia from './components/MnemosyneMedia';
import ConclaveMonitor from './components/ConclaveMonitor';
import DiscoveryCatalog from './components/DiscoveryCatalog';
import NexusLinkLanding from './components/NexusLinkLanding';
import VaultLinkDebugger from './components/VaultLinkDebugger';
import DesignAuditHUD from './components/DesignAuditHUD';
import TradingHUD from './components/TradingHUD/TradingHUD';

/**
 * Mount a React component into a specific target element.
 */
const roots = new Map<string, any>();

interface MountOptions {
    surfaceLabel?: string;
    initialPath?: string;
}

export function mountModule(moduleName: string, targetId: string, options?: MountOptions) {
    const container = document.getElementById(targetId);
    if (!container) {
        console.error(`⬡ MOUNT_ERROR :: Target element #${targetId} not found`);
        return;
    }

    // ALWAYS unmount before remounting if the container was swapped by main.ts
    const existing = roots.get(targetId);
    if (existing) {
        try {
            existing.unmount();
        } catch (e) {
            // Silence if already unmounted or container detached
        }
        roots.delete(targetId);
    }

    const root = createRoot(container);
    roots.set(targetId, root);

    switch (moduleName) {
        case 'NEXUSLINK':
            root.render(<NexusLinkLanding surfaceLabel={options?.surfaceLabel || 'NexusLink'} />);
            break;
        case 'PHYSIS':
            root.render(<PhysisVault />);
            break;
        case 'RESEARCH':
            root.render(
                <PhysisVault
                    initialPath={options?.initialPath || '01_PROJECTS'}
                    surfaceLabel={options?.surfaceLabel || 'Research'}
                />
            );
            break;
        case 'BRIDGE':
            root.render(<Bridge />);
            break;
        case 'TELEMETRY':
            root.render(<TelemetryDeck />);
            break;
        case 'AGENT_MONITOR':
            root.render(<AgentMonitor />);
            break;
        case 'SEARCH':
            root.render(<AlbedoSearch />);
            break;
        case 'CHRONOS':
            root.render(<ChronosStream />);
            break;
        case 'INDRA':
            root.render(<IndraSwarm />);
            break;
        case 'LOGOS':
            root.render(<LogosProjects />);
            break;
        case 'TICKETS':
            root.render(<TicketBoard />);
            break;
        case 'ORACLE':
            root.render(<OraclePage />);
            break;
        case 'NEURAL_FORGE':
            root.render(<NeuralForge />);
            break;
        case 'MNEMOSYNE':
            root.render(<MnemosyneMedia />);
            break;
        case 'CONCLAVE_MONITOR':
            root.render(<ConclaveMonitor />);
            break;
        case 'CATALOG':
            root.render(<DiscoveryCatalog />);
            break;
        case 'VAULT_DEBUGGER':
            root.render(<VaultLinkDebugger />);
            break;
        case 'DESIGN_AUDIT':
            root.render(<DesignAuditHUD />);
            break;
        case 'TRADING_HUD':
            root.render(<TradingHUD />);
            break;
        default:
            console.warn(`⬡ MOUNT_WARN :: No React component for ${moduleName}`);
    }
}

export function unmountModule(targetId: string) {
    const existing = roots.get(targetId);
    if (!existing) return;

    try {
        existing.unmount();
    } catch {
        // Best effort only. Detached containers are already gone.
    } finally {
        roots.delete(targetId);
    }
}

const CUSTOM_ROUTE_TARGET_ID = 'react-custom-root';

function syncActiveNav(moduleName: string) {
    document.querySelectorAll('.nav-node').forEach((node) => {
        const element = node as HTMLElement;
        if (element.getAttribute('data-module') === moduleName) {
            element.classList.add('active');
        } else {
            element.classList.remove('active');
        }
    });
}

function mountCustomRoute(engine: any, moduleName: 'NEXUSLINK' | 'RESEARCH') {
    const stage = engine?.stage as HTMLElement | undefined;
    if (!stage) return;

    const surfaceLabel = moduleName === 'NEXUSLINK' ? 'NexusLink' : 'Research';
    const initialPath = moduleName === 'RESEARCH' ? '01_PROJECTS' : undefined;

    unmountModule(CUSTOM_ROUTE_TARGET_ID);
    engine.cleanup?.();
    engine.hideContext?.();
    syncActiveNav(moduleName);
    stage.innerHTML = `<div id="${CUSTOM_ROUTE_TARGET_ID}" style="width:100%; height:100%;"></div>`;

    const sidebar = document.getElementById('mission-sidebar');
    if (sidebar) sidebar.style.transform = 'translateX(100%)';

    mountModule(moduleName, CUSTOM_ROUTE_TARGET_ID, { surfaceLabel, initialPath });
}

function installRouteAliases() {
    const engine = (window as any).nudimmudEngine;
    if (!engine || (engine as any).__routeAliasesPatched) return false;

    const originalGo = engine.go.bind(engine);
    let activeCustomRoute: 'NEXUSLINK' | 'RESEARCH' | null = null;

    engine.go = (moduleName: string, query?: string) => {
        if (moduleName === 'NEXUSLINK' || moduleName === 'RESEARCH') {
            activeCustomRoute = moduleName;
            mountCustomRoute(engine, moduleName);
            return;
        }

        if (activeCustomRoute) {
            unmountModule(CUSTOM_ROUTE_TARGET_ID);
            activeCustomRoute = null;
        }

        return originalGo(moduleName, query);
    };

    (engine as any).__routeAliasesPatched = true;
    return true;
}

(function bootstrapRouteAliases() {
    if (installRouteAliases()) return;

    const interval = window.setInterval(() => {
        if (installRouteAliases()) {
            window.clearInterval(interval);
        }
    }, 50);
})();

// Attach to window for global access from main.ts
(window as any).mountModule = mountModule;

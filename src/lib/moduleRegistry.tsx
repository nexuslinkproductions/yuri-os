import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import PhysisVault from '../components/PhysisVault';
import TelemetryDeck from '../components/TelemetryDeck';
import AgentMonitor from '../components/AgentMonitor';
import AlbedoSearch from '../components/AlbedoSearch';
import ChronosStream from '../components/ChronosStream';
import IndraSwarm from '../components/IndraSwarm';
import LogosProjects from '../components/LogosProjects';
import TicketBoard from '../components/TicketBoard';
import NeuralForge from '../components/NeuralForge';
import OraclePage from '../components/Oracle/OraclePage';
import Bridge from '../components/Bridge';
import MnemosyneMedia from '../components/MnemosyneMedia';
import ConclaveMonitor from '../components/ConclaveMonitor';
import DiscoveryCatalog from '../components/DiscoveryCatalog';
import NexusLinkLanding from '../components/NexusLinkLanding';
import VaultLinkDebugger from '../components/VaultLinkDebugger';
import DesignAuditHUD from '../components/DesignAuditHUD';

const roots: Map<string, Root> = new Map();

export interface MountOptions {
  surfaceLabel?: string;
  initialPath?: string;
}

export function mountModule(
  moduleName: string,
  targetId: string,
  options?: MountOptions
): void {
  const container = document.getElementById(targetId);
  if (!container) {
    console.warn(`[moduleRegistry] Target #${targetId} not found for module "${moduleName}"`);
    return;
  }

  const existing = roots.get(targetId);
  if (existing) {
    existing.unmount();
    roots.delete(targetId);
  }

  const root = createRoot(container);
  roots.set(targetId, root);

  let component: React.ReactElement | null = null;

  switch (moduleName) {
    case 'NEXUSLINK':
      component = <NexusLinkLanding surfaceLabel={options?.surfaceLabel} />;
      break;
    case 'PHYSIS':
      component = <PhysisVault />;
      break;
    case 'RESEARCH':
      component = (
        <PhysisVault
          initialPath={options?.initialPath || '01_PROJECTS'}
          surfaceLabel={options?.surfaceLabel || 'Research'}
        />
      );
      break;
    case 'BRIDGE':
      component = <Bridge />;
      break;
    case 'TELEMETRY':
      component = <TelemetryDeck />;
      break;
    case 'AGENT_MONITOR':
      component = <AgentMonitor />;
      break;
    case 'SEARCH':
      component = <AlbedoSearch />;
      break;
    case 'CHRONOS':
      component = <ChronosStream />;
      break;
    case 'INDRA':
      component = <IndraSwarm />;
      break;
    case 'LOGOS':
      component = <LogosProjects />;
      break;
    case 'TICKETS':
      component = <TicketBoard />;
      break;
    case 'ORACLE':
      component = <OraclePage />;
      break;
    case 'NEURAL_FORGE':
      component = <NeuralForge />;
      break;
    case 'MNEMOSYNE':
      component = <MnemosyneMedia />;
      break;
    case 'CONCLAVE_MONITOR':
      component = <ConclaveMonitor />;
      break;
    case 'CATALOG':
      component = <DiscoveryCatalog />;
      break;
    case 'VAULT_DEBUGGER':
      component = <VaultLinkDebugger />;
      break;
    case 'DESIGN_AUDIT':
      component = <DesignAuditHUD />;
      break;
    default:
      console.warn(`[moduleRegistry] Unknown module: "${moduleName}"`);
      return;
  }

  if (component) {
    root.render(component);
  }
}

export function unmountModule(targetId: string): void {
  const existing = roots.get(targetId);
  if (existing) {
    try {
      existing.unmount();
    } catch {
      // best-effort
    }
    roots.delete(targetId);
  }
}

(window as any).mountModule = mountModule;
(window as any).unmountModule = unmountModule;

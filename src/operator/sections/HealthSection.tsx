import React from 'react';
import { StatusDot } from '../components/StatusDot';
import { SectionHeader } from '../components/SectionHeader';
import type { StatusDotProps } from '../components/StatusDot';

interface ServiceCard {
  name: string;
  port: string;
  healthy: StatusDotProps['status'];
  uptime: string;
}

interface LaunchdEntry {
  service: string;
  status: string;
}

const SERVICES: ServiceCard[] = [
  { name: 'Vite Dev', port: '4200', healthy: 'ok', uptime: '12h 03m' },
  { name: 'Shell Service', port: '3098', healthy: 'ok', uptime: '12h 03m' },
  { name: 'Ollama', port: '11434', healthy: 'ok', uptime: '12h 03m' },
  { name: 'DeepSeek API', port: 'api.deepseek.com', healthy: 'ok', uptime: '12h 03m' },
];

const LAUNCHD_ENTRIES: LaunchdEntry[] = [
  { service: 'com.nudimmud.shell', status: 'loaded' },
  { service: 'com.nudimmud.oracle', status: 'loaded' },
  { service: 'com.nudimmud.boot', status: 'loaded' },
];

// TODO: Replace static healthy='ok' with live data-source polling
function useServiceHealth(): { services: ServiceCard[]; launchd: LaunchdEntry[] } {
  return { services: SERVICES, launchd: LAUNCHD_ENTRIES };
}

export const HealthSection: React.FC = () => {
  const { services, launchd } = useServiceHealth();

  return (
    <section className="health-section">
      <SectionHeader title="Deployment & Health" />

      <div className="op-grid">
        {services.map((svc) => (
          <div key={svc.name} className="op-card">
            <div className="op-card__row">
              <StatusDot status={svc.healthy} />
              <span className="op-card__name">{svc.name}</span>
            </div>
            <code className="op-card__port">{svc.port}</code>
            <span className="op-card__uptime">{svc.uptime}</span>
          </div>
        ))}
      </div>

      <table className="launchd-table">
        <thead>
          <tr>
            <th>Service</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {launchd.map((entry) => (
            <tr key={entry.service}>
              <td>
                <code>{entry.service}</code>
              </td>
              <td>{entry.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};

export default HealthSection;

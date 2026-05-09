import React, { Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { OperatorTopBar } from './components/OperatorTopBar';
import { OperatorNav } from './components/OperatorNav';
import { CommandPalette } from './components/CommandPalette';
import { ShimmerRow } from './components/ShimmerRow';
import './operator.css';

const CockpitSection = React.lazy(() => import('./sections/CockpitSection'));
const AgentsSection = React.lazy(() => import('./sections/AgentsSection'));
const SessionsSection = React.lazy(() => import('./sections/SessionsSection'));
const SkillsSection = React.lazy(() => import('./sections/SkillsSection'));
const TokenOpsSection = React.lazy(() => import('./sections/TokenOpsSection'));
const DesignAuditSection = React.lazy(() => import('./sections/DesignAuditSection'));
const OracleSection = React.lazy(() => import('./sections/OracleSection'));
const HealthSection = React.lazy(() => import('./sections/HealthSection'));
const SettingsSection = React.lazy(() => import('./sections/SettingsSection'));

const OperatorShell: React.FC = () => {
  return (
    <div id="operator-root" className="dark">
      <OperatorTopBar />
      <div className="op-shell-grid">
        <OperatorNav />
        <main className="op-content">
          <Suspense fallback={<ShimmerRow />}>
            <Routes>
              <Route index element={<CockpitSection />} />
              <Route path="agents" element={<AgentsSection />} />
              <Route path="sessions" element={<SessionsSection />} />
              <Route path="skills" element={<SkillsSection />} />
              <Route path="tokenops" element={<TokenOpsSection />} />
              <Route path="design-audit" element={<DesignAuditSection />} />
              <Route path="oracle" element={<OracleSection />} />
              <Route path="health" element={<HealthSection />} />
              <Route path="settings" element={<SettingsSection />} />
            </Routes>
          </Suspense>
        </main>
      </div>
      <CommandPalette />
    </div>
  );
};

export default OperatorShell;

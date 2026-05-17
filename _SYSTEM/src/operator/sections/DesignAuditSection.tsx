import React, { Suspense, lazy } from 'react';
import { SectionHeader, EmptyState } from '../components';

const FallbackEmpty: React.FC = () => (
  <EmptyState
    icon="○"
    title="Design Audit unavailable"
    body="HUD module not present"
  />
);

const DesignAuditHUD = lazy<React.FC>(
  () =>
    import('../../components/DesignAuditHUD').catch(() => ({
      default: FallbackEmpty,
    }))
);

const DesignAuditSection: React.FC = () => {
  return (
    <div>
      <SectionHeader title="Design Audit HUD" density="scan" />
      <Suspense
        fallback={
          <div className="animate-pulse text-zinc-400 text-sm p-4">
            Loading design audit…
          </div>
        }
      >
        <DesignAuditHUD />
      </Suspense>
    </div>
  );
};

export default DesignAuditSection;

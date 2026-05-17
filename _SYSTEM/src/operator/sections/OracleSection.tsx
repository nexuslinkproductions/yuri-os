import React from 'react';
import OraclePage from '../../components/Oracle/OraclePage';
import { SectionHeader } from '../components/SectionHeader';

const OracleSection: React.FC = () => {
  return (
    <section className="op-section">
      <SectionHeader
        title="Reasoning Surface"
        actions={
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 10px',
              borderRadius: 6,
              border: '1px solid var(--op-border)',
              background: 'var(--op-surface-elevated)',
              color: 'var(--op-text-secondary)',
              fontFamily: 'var(--op-font-mono)',
              fontSize: 'var(--op-type-caption)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            Oracle backend
          </span>
        }
      />

      <div
        style={{
          minHeight: 'calc(100vh - 142px)',
          border: '1px solid var(--op-border)',
          borderRadius: 'var(--op-grid-radius)',
          overflow: 'hidden',
          background: 'var(--op-surface)',
          boxShadow: 'var(--op-shadow-md)',
        }}
      >
        <OraclePage />
      </div>
    </section>
  );
};

export default OracleSection;

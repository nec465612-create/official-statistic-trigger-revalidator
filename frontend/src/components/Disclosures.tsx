import React from 'react';

export const Disclosures: React.FC = () => {
  return (
    <div className="disclosures-banner" role="region" aria-label="Official Disclosures">
      <div className="disclosure-grid">
        <div className="disclosure-item">
          <strong>Simulation Only:</strong> This application is a research demonstration for automated official statistic policy revalidation. It does not provide real-world financial benefits, legal rights, or benefit payments.
        </div>
        <div className="disclosure-item">
          <strong>No Economic/Investment Advice:</strong> BLS CPI statistics and revalidated triggers are for educational and testing purposes. Do not make economic or investment decisions based on this data.
        </div>
        <div className="disclosure-item">
          <strong>Official CPI Allowlist:</strong> Restricted strictly to official Bureau of Labor Statistics CPI series: <code>CUSR0000SA0</code> (Seasonally Adjusted) and <code>CUUR0000SA0</code> (Not Seasonally Adjusted).
        </div>
        <div className="disclosure-item">
          <strong>Data Revisions & Studionet:</strong> The Bureau of Labor Statistics routinely revises historical data. Studionet is a temporary testing environment on GenLayer (Chain ID 61999).
        </div>
      </div>
    </div>
  );
};

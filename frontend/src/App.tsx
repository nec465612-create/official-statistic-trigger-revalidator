import React, { Suspense, lazy, useState } from 'react';
import { Header } from './components/Header';
import { Disclosures } from './components/Disclosures';
import { WalletModal } from './components/WalletModal';
import { TxStatusBar } from './components/TxStatusBar';
import { appConfig } from './config';

const PublicReader = lazy(() => import('./components/PublicReader').then((module) => ({ default: module.PublicReader })));
const TriggerDetail = lazy(() => import('./components/TriggerDetail').then((module) => ({ default: module.TriggerDetail })));
const PolicyOwner = lazy(() => import('./components/PolicyOwner').then((module) => ({ default: module.PolicyOwner })));
const Refresher = lazy(() => import('./components/Refresher').then((module) => ({ default: module.Refresher })));
const ConsumerSection = lazy(() => import('./components/ConsumerSection').then((module) => ({ default: module.ConsumerSection })));
const AuditorTimeline = lazy(() => import('./components/AuditorTimeline').then((module) => ({ default: module.AuditorTimeline })));

type JourneyTab = 'reader' | 'owner' | 'refresher' | 'consumer' | 'auditor';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<JourneyTab>('reader');
  const [selectedTriggerId, setSelectedTriggerId] = useState<string | null>(null);
  const [isWalletModalOpen, setIsWalletModalOpen] = useState<boolean>(false);
  const [refreshCounter, setRefreshCounter] = useState<number>(0);

  const triggerGlobalRefresh = () => {
    setRefreshCounter((c) => c + 1);
  };

  const handleSelectTrigger = (triggerId: string) => {
    setSelectedTriggerId(triggerId);
  };

  return (
    <div className="app-layout">
      <div className="app-shell-content">
      <Header onOpenConnect={() => setIsWalletModalOpen(true)} />
      <TxStatusBar onReconciled={triggerGlobalRefresh} />

      {!appConfig.isConfigured && (
        <div className="config-warning-banner" role="alert">
          <strong>Notice:</strong> {appConfig.configError || 'Contract address not configured.'}
          {' '}Please configure <code>VITE_CONTRACT_ADDRESS</code> in your <code>.env</code> file.
        </div>
      )}

      <nav className="journey-nav" aria-label="User Journeys">
        <button
          type="button"
          className={`nav-tab ${activeTab === 'reader' ? 'nav-tab-active' : ''}`}
          onClick={() => setActiveTab('reader')}
        >
          1. Public Registry
        </button>
        <button
          type="button"
          className={`nav-tab ${activeTab === 'owner' ? 'nav-tab-active' : ''}`}
          onClick={() => setActiveTab('owner')}
        >
          2. Policy Owner
        </button>
        <button
          type="button"
          className={`nav-tab ${activeTab === 'refresher' ? 'nav-tab-active' : ''}`}
          onClick={() => setActiveTab('refresher')}
        >
          3. Permissionless Refresher
        </button>
        <button
          type="button"
          className={`nav-tab ${activeTab === 'consumer' ? 'nav-tab-active' : ''}`}
          onClick={() => setActiveTab('consumer')}
        >
          4. Downstream Consumer
        </button>
        <button
          type="button"
          className={`nav-tab ${activeTab === 'auditor' ? 'nav-tab-active' : ''}`}
          onClick={() => setActiveTab('auditor')}
        >
          5. Auditor &amp; Forensic
        </button>
      </nav>

      <section className="info-box" aria-labelledby="how-it-works-title">
        <strong id="how-it-works-title">How it works</strong>
        <p>
          Create and freeze a statistical trigger, run the initial BLS observation, then revalidate it when official data changes.
          GenLayer validators reach consensus before the contract updates its effective state. If verification is interrupted after
          submission, use <strong>Continue verification</strong> on the saved transaction instead of submitting it again.
        </p>
      </section>

      <main className="main-content">
        <Suspense fallback={<div className="loading-box">Loading journey...</div>}>
        {selectedTriggerId && (
          <div className="trigger-inspection-container">
            <TriggerDetail
              triggerId={selectedTriggerId}
              onClose={() => setSelectedTriggerId(null)}
              onRefreshParent={triggerGlobalRefresh}
            />
          </div>
        )}

        {activeTab === 'reader' && (
          <PublicReader
            onSelectTrigger={handleSelectTrigger}
            selectedTriggerId={selectedTriggerId}
            refreshTrigger={refreshCounter}
          />
        )}

        {activeTab === 'owner' && (
          <PolicyOwner
            onTriggerCreated={(id) => {
              setSelectedTriggerId(id);
              triggerGlobalRefresh();
            }}
          />
        )}

        {activeTab === 'refresher' && (
          <Refresher
            selectedTriggerId={selectedTriggerId}
            onRevalidated={(id) => {
              setSelectedTriggerId(id);
              triggerGlobalRefresh();
            }}
          />
        )}

        {activeTab === 'consumer' && (
          <ConsumerSection selectedTriggerId={selectedTriggerId} />
        )}

        {activeTab === 'auditor' && (
          <AuditorTimeline selectedTriggerId={selectedTriggerId} />
        )}
        </Suspense>
      </main>

      <Disclosures />
      </div>

      <WalletModal
        isOpen={isWalletModalOpen}
        onClose={() => setIsWalletModalOpen(false)}
      />
    </div>
  );
};

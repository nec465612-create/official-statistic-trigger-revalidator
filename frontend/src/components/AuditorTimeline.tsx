import React, { useState } from 'react';
import { rpcClient } from '../services/rpcClient';
import { Trigger, Vintage } from '../types';

interface AuditorTimelineProps {
  selectedTriggerId: string | null;
}

export const AuditorTimeline: React.FC<AuditorTimelineProps> = ({ selectedTriggerId }) => {
  const [triggerIdInput, setTriggerIdInput] = useState<string>(selectedTriggerId || '');
  const [trigger, setTrigger] = useState<Trigger | null>(null);
  const [vintages, setVintages] = useState<Vintage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleAuditLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!triggerIdInput.trim()) return;

    setIsLoading(true);
    setError(null);
    try {
      const rawTrg = await rpcClient.readContract<string>('get_trigger', [triggerIdInput.trim()]);
      if (!rawTrg) {
        throw new Error(`Trigger ${triggerIdInput} does not exist on-chain.`);
      }
      setTrigger(JSON.parse(rawTrg) as Trigger);

      // get_vintages_page(trigger_id: str, offset: u32, limit: u32) -> str
      const rawVintages = await rpcClient.readContract<string>('get_vintages_page', [triggerIdInput.trim(), 0, 20]);
      const parsedV = rawVintages ? (JSON.parse(rawVintages) as Vintage[]) : [];
      setVintages(parsedV);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setTrigger(null);
      setVintages([]);
    } finally {
      setIsLoading(false);
    }
  };

  const isConditionMet = (v: Vintage, trg: Trigger): boolean => {
    if (trg.operator === 'GE') return v.value_scaled >= trg.threshold_scaled;
    if (trg.operator === 'LE') return v.value_scaled <= trg.threshold_scaled;
    return false;
  };

  return (
    <div className="card auditor-section" role="region" aria-label="Auditor & Forensic Timeline">
      <div className="section-header-row">
        <div>
          <h2 className="section-title">Auditor &amp; Forensic Verification</h2>
          <p className="section-subtitle">
            Cryptographic evidence ledger, SHA-256 fingerprint verification, and LLM metadata comparability audit.
          </p>
        </div>
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={handleAuditLookup} className="lookup-form">
        <div className="form-row">
          <div className="form-group flex-3">
            <label htmlFor="auditor-trigger-id">Audit Target Trigger ID</label>
            <input
              id="auditor-trigger-id"
              type="text"
              className="form-control"
              placeholder="e.g. trg-0001"
              value={triggerIdInput}
              onChange={(e) => setTriggerIdInput(e.target.value)}
              disabled={isLoading}
            />
          </div>
          <div className="form-group flex-1 form-btn-align">
            <button
              type="submit"
              className="btn btn-secondary btn-block"
              disabled={isLoading || !triggerIdInput.trim()}
            >
              {isLoading ? 'Verifying...' : 'Audit Vintage Ledger'}
            </button>
          </div>
        </div>
      </form>

      {trigger && (
        <div className="audit-results-container">
          <div className="audit-summary-box">
            <h3>Trigger On-Chain Root &amp; Nonce Invariants</h3>
            <div className="audit-summary-grid">
              <div>
                <span className="aud-label">Trigger ID:</span>
                <code className="aud-val">{trigger.id}</code>
              </div>
              <div>
                <span className="aud-label">Series:</span>
                <span className="aud-val">{trigger.series}</span>
              </div>
              <div>
                <span className="aud-label">Target Period:</span>
                <span className="aud-val">{trigger.period} {trigger.year}</span>
              </div>
              <div>
                <span className="aud-label">State / Effective:</span>
                <span className="aud-val">
                  <span className={`badge state-${trigger.effective_state || trigger.state}`}>
                    {trigger.effective_state || trigger.state}
                  </span>
                </span>
              </div>
              <div>
                <span className="aud-label">Total Vintages:</span>
                <span className="aud-val">{vintages.length} (Max 5 bounded)</span>
              </div>
              <div>
                <span className="aud-label">Arithmetic Precision:</span>
                <span className="aud-val">Integer Fixed-Point (Scale 1000)</span>
              </div>
            </div>
          </div>

          <div className="vintage-audit-timeline">
            <h3>Vintage Cryptographic Audit Chain</h3>
            {vintages.length === 0 ? (
              <div className="empty-vintage-box">
                No vintages have been committed for this trigger.
              </div>
            ) : (
              vintages.map((v, i) => {
                const conditionMet = isConditionMet(v, trigger);
                return (
                  <div key={i} className="audit-vintage-card">
                    <div className="audit-card-top">
                      <div className="vintage-number-tag">Vintage #{v.index + 1}</div>
                      <div className="vintage-obs-time">{new Date(v.observed_at).toISOString()}</div>
                      <div className="vintage-comp-status">
                        <span className={`badge ${v.comparability === 'COMPARABLE' ? 'badge-success' : 'badge-warning'}`}>
                          {v.comparability}
                        </span>
                      </div>
                    </div>

                    <div className="audit-card-grid">
                      <div className="audit-cell">
                        <span className="aud-sublabel">Raw Decimal Value</span>
                        <strong className="aud-highlight">{v.raw_value}</strong>
                      </div>
                      <div className="audit-cell">
                        <span className="aud-sublabel">Fixed-Scale Integer (×1000)</span>
                        <code>{v.value_scaled}</code>
                      </div>
                      <div className="audit-cell">
                        <span className="aud-sublabel">Outcome Classification</span>
                        <span>{v.outcome}</span>
                      </div>
                      <div className="audit-cell">
                        <span className="aud-sublabel">Deterministic Consequence</span>
                        <span>{conditionMet ? 'CONDITION MET (Active)' : 'CONDITION UNMET (Inactive)'}</span>
                      </div>
                    </div>

                    <div className="audit-hash-block">
                      <span className="aud-sublabel">SHA-256 Evidence Hash (Canonical BLS Payload):</span>
                      <code className="evidence-hash-box">{v.canonical_fingerprint}</code>
                      <span className="hash-verify-note">
                        ✓ Independent validator consensus verified; volatile responseTime excluded.
                      </span>
                    </div>

                    {v.footnotes && v.footnotes.length > 0 && (
                      <div className="audit-footnotes-block">
                        <span className="aud-sublabel">Attached BLS Footnotes ({v.footnotes.length}):</span>
                        <ul className="audit-fn-list">
                          {v.footnotes.map((fn, idx) => (
                            <li key={idx}>
                              <code className="fn-code">[{fn.code}]</code> {fn.text}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {v.reason && (
                      <div className="audit-reasoning-block">
                        <span className="aud-sublabel">LLM Comparability Rationale (Validator Consensus):</span>
                        <blockquote className="reasoning-quote">{v.reason}</blockquote>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

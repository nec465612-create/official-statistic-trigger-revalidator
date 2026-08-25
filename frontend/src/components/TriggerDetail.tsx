import React, { useEffect, useState, useCallback } from 'react';
import { rpcClient } from '../services/rpcClient';
import { useActiveWallet } from '../services/useActiveWallet';
import { writeManager } from '../services/writeManager';
import { Trigger, Vintage } from '../types';

interface TriggerDetailProps {
  triggerId: string;
  onClose: () => void;
  onRefreshParent: () => void;
}

export const TriggerDetail: React.FC<TriggerDetailProps> = ({
  triggerId,
  onClose,
  onRefreshParent,
}) => {
  const [trigger, setTrigger] = useState<Trigger | null>(null);
  const [vintages, setVintages] = useState<Vintage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isActing, setIsActing] = useState<boolean>(false);

  const activeWallet = useActiveWallet();

  const loadDetails = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const rawTrg = await rpcClient.readContract<string>('get_trigger', [triggerId]);
      if (!rawTrg) {
        throw new Error(`Trigger ${triggerId} not found`);
      }
      const parsedTrg = JSON.parse(rawTrg) as Trigger;
      setTrigger(parsedTrg);

      // get_vintages_page(trigger_id, 0, 20)
      const rawVintages = await rpcClient.readContract<string>('get_vintages_page', [triggerId, 0, 20]);
      const parsedVintages = rawVintages ? (JSON.parse(rawVintages) as Vintage[]) : [];
      setVintages(parsedVintages);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [triggerId]);

  useEffect(() => {
    loadDetails();
  }, [loadDetails]);

  const handleFreeze = async () => {
    if (!activeWallet) {
      setActionError('Wallet connection required.');
      return;
    }
    setActionError(null);
    setIsActing(true);
    try {
      const result = await writeManager.executeWrite(
        activeWallet,
        'freeze_trigger',
        [triggerId],
        async () => {
          const raw = await rpcClient.readContract<string>('get_trigger', [triggerId]);
          return raw ? (JSON.parse(raw) as Trigger) : null;
        },
        (readback) => Boolean(readback && readback.id === triggerId && readback.state === 'FROZEN')
      );
      if (!result.success) {
        setActionError(result.error || 'Freeze failed.');
      } else {
        await loadDetails();
        onRefreshParent();
      }
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsActing(false);
    }
  };

  const handleClose = async () => {
    if (!activeWallet) {
      setActionError('Wallet connection required.');
      return;
    }
    setActionError(null);
    setIsActing(true);
    try {
      const result = await writeManager.executeWrite(
        activeWallet,
        'close_trigger',
        [triggerId],
        async () => {
          const raw = await rpcClient.readContract<string>('get_trigger', [triggerId]);
          return raw ? (JSON.parse(raw) as Trigger) : null;
        },
        (readback) => Boolean(readback && readback.id === triggerId && readback.state === 'CLOSED')
      );
      if (!result.success) {
        setActionError(result.error || 'Close failed.');
      } else {
        await loadDetails();
        onRefreshParent();
      }
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsActing(false);
    }
  };

  const isOwner = activeWallet && trigger && activeWallet.address.toLowerCase() === trigger.owner.toLowerCase();
  const latestVintage = vintages.length > 0 ? vintages[vintages.length - 1] : null;

  return (
    <div className="card trigger-detail-modal" role="region" aria-label={`Trigger Details ${triggerId}`}>
      <div className="section-header-row">
        <div>
          <h2 className="section-title">Trigger Inspection: <code>{triggerId}</code></h2>
          <p className="section-subtitle">Comprehensive on-chain lifecycle and vintage audit record.</p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
          Back to List
        </button>
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      {actionError && (
        <div className="alert alert-error" role="alert">
          {actionError}
        </div>
      )}

      {isLoading && !trigger ? (
        <div className="loading-box">Loading trigger specification from Studionet...</div>
      ) : trigger ? (
        <div className="trigger-detail-body">
          <div className="metadata-grid">
            <div className="meta-card">
              <span className="meta-label">Series ID</span>
              <span className="meta-value">
                <strong>{trigger.series}</strong> ({trigger.series_title || 'CPI-U'})
              </span>
            </div>

            <div className="meta-card">
              <span className="meta-label">Target Period</span>
              <span className="meta-value">
                <strong>{trigger.period} {trigger.year}</strong>
              </span>
            </div>

            <div className="meta-card">
              <span className="meta-label">Condition</span>
              <span className="meta-value">
                <code>{trigger.operator === 'GE' ? '≥' : '≤'} {trigger.threshold_decimal}</code> ({trigger.threshold_scaled} scaled)
              </span>
            </div>

            <div className="meta-card">
              <span className="meta-label">Effective State</span>
              <span className="meta-value">
                <span className={`badge badge-lg state-${trigger.effective_state || trigger.state}`}>
                  {trigger.effective_state || trigger.state}
                </span>
                {trigger.effective_state === 'STALE' && (
                  <span className="stale-warn-text"> (Observation &gt; 30 days old)</span>
                )}
              </span>
            </div>

            <div className="meta-card">
              <span className="meta-label">Owner</span>
              <span className="meta-value">
                <code className="owner-address" title={trigger.owner}>{trigger.owner}</code>
              </span>
            </div>

            <div className="meta-card">
              <span className="meta-label">Created At</span>
              <span className="meta-value">
                {new Date(trigger.created_at).toLocaleString()}
              </span>
            </div>

            <div className="meta-card">
              <span className="meta-label">Latest Observation</span>
              <span className="meta-value">
                {trigger.latest_observed_at ? new Date(trigger.latest_observed_at).toLocaleString() : 'None'}
              </span>
            </div>

            <div className="meta-card">
              <span className="meta-label">Latest Observed Value</span>
              <span className="meta-value">
                {latestVintage ? (
                  <strong>{latestVintage.raw_value} ({latestVintage.value_scaled} scaled)</strong>
                ) : (
                  'Pending observation'
                )}
              </span>
            </div>
          </div>

          {isOwner && (
            <div className="owner-controls-card">
              <h3>Owner Policy Controls</h3>
              <p className="subtle-note">
                You are connected as the policy owner. You can freeze drafts or close expired triggers.
              </p>
              <div className="button-group">
                {trigger.state === 'DRAFT' && (
                  <button
                    type="button"
                    className="btn btn-warning"
                    disabled={isActing}
                    onClick={handleFreeze}
                  >
                    {isActing ? 'Processing...' : 'Freeze Trigger (Lock Specification)'}
                  </button>
                )}
                {trigger.state !== 'CLOSED' && (
                  <button
                    type="button"
                    className="btn btn-danger"
                    disabled={isActing}
                    onClick={handleClose}
                  >
                    {isActing ? 'Processing...' : 'Close Trigger'}
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="vintages-section">
            <h3>Immutable Vintage Chain ({vintages.length} / 5)</h3>
            <p className="subtle-note">
              Every BLS release and historical revision is permanently recorded on-chain with its SHA-256 evidence fingerprint.
            </p>

            {vintages.length === 0 ? (
              <div className="empty-vintage-box">
                No observations or vintages recorded yet. Trigger must be revalidated first.
              </div>
            ) : (
              <div className="vintages-timeline">
                {vintages.map((v, idx) => {
                  const conditionMet =
                    trigger.operator === 'GE'
                      ? v.value_scaled >= trigger.threshold_scaled
                      : v.value_scaled <= trigger.threshold_scaled;

                  return (
                    <div key={idx} className="vintage-card">
                      <div className="vintage-header">
                        <span className="vintage-badge">Vintage #{v.index + 1}</span>
                        <span className="vintage-time">{new Date(v.observed_at).toLocaleString()}</span>
                        <span className={`badge badge-sm ${v.comparability === 'COMPARABLE' ? 'badge-success' : 'badge-warning'}`}>
                          {v.comparability}
                        </span>
                      </div>

                      <div className="vintage-body-grid">
                        <div>
                          <span className="v-label">Raw BLS Value:</span>
                          <span className="v-val"><strong>{v.raw_value}</strong></span>
                        </div>
                        <div>
                          <span className="v-label">Scaled Integer:</span>
                          <span className="v-val"><code>{v.value_scaled}</code></span>
                        </div>
                        <div>
                          <span className="v-label">Condition Met:</span>
                          <span className="v-val">{conditionMet ? 'YES (Active)' : 'NO (Inactive)'}</span>
                        </div>
                        <div>
                          <span className="v-label">Outcome:</span>
                          <span className="v-val">{v.outcome}</span>
                        </div>
                      </div>

                      <div className="vintage-hash-row">
                        <span className="v-label">SHA-256 Fingerprint:</span>
                        <code className="evidence-hash">{v.canonical_fingerprint}</code>
                      </div>

                      {v.footnotes && v.footnotes.length > 0 && (
                        <div className="vintage-footnotes">
                          <span className="v-label">BLS Footnotes:</span>
                          <ul className="footnotes-list">
                            {v.footnotes.map((fn, fIdx) => (
                              <li key={fIdx}>
                                <code>[{fn.code}]</code> {fn.text}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {v.reason && (
                        <div className="vintage-reasoning">
                          <span className="v-label">LLM Metadata Assessment:</span>
                          <p className="reasoning-text">{v.reason}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

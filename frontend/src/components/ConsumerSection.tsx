import React, { useState } from 'react';
import { getAddress } from 'viem';
import { useActiveWallet } from '../services/useActiveWallet';
import { writeManager } from '../services/writeManager';
import { rpcClient } from '../services/rpcClient';
import { EffectiveTriggerState } from '../types';

interface ConsumerSectionProps {
  selectedTriggerId: string | null;
}

export const ConsumerSection: React.FC<ConsumerSectionProps> = ({ selectedTriggerId }) => {
  const [triggerId, setTriggerId] = useState<string>(selectedTriggerId || '');
  const [namespace, setNamespace] = useState<string>('benefit-sim-ns-01');
  const [isRegistering, setIsRegistering] = useState<boolean>(false);
  const [isQuerying, setIsQuerying] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [boundTriggerId, setBoundTriggerId] = useState<string | null>(null);
  const [effectiveStateData, setEffectiveStateData] = useState<EffectiveTriggerState | null>(null);

  const activeWallet = useActiveWallet();

  const handleBindConsumer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWallet) {
      setError('Please connect your Web3 wallet.');
      return;
    }
    if (!triggerId.trim()) {
      setError('Please provide a Trigger ID.');
      return;
    }
    if (!namespace.trim()) {
      setError('Please provide a namespace (1–64 characters).');
      return;
    }

    setError(null);
    setIsRegistering(true);
    try {
      // bind_consumer(namespace: str, trigger_id: str) -> str
      const result = await writeManager.executeWrite(
        activeWallet,
        'bind_consumer',
        [namespace.trim(), triggerId.trim()],
        async () => {
          const bound = await rpcClient.readContract<string>('get_consumer_binding', [
            getAddress(activeWallet.address),
            namespace.trim(),
          ]);
          return bound || null;
        },
        (readback) => readback === triggerId.trim()
      );

      if (!result.success) {
        setError(result.error || 'Binding registration failed.');
      } else {
        setBoundTriggerId(result.data as string);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRegistering(false);
    }
  };

  const handleQueryEffectiveState = async () => {
    if (!triggerId.trim()) {
      setError('Please specify a Trigger ID.');
      return;
    }
    setError(null);
    setIsQuerying(true);
    try {
      // get_effective_trigger_state(trigger_id: str) -> str (JSON)
      const rawState = await rpcClient.readContract<string>('get_effective_trigger_state', [triggerId.trim()]);
      if (!rawState) {
        throw new Error(`Trigger ${triggerId} not found on-chain.`);
      }
      const parsed = JSON.parse(rawState) as EffectiveTriggerState;
      setEffectiveStateData(parsed);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setEffectiveStateData(null);
    } finally {
      setIsQuerying(false);
    }
  };

  return (
    <div className="card consumer-section" role="region" aria-label="Downstream Consumer Integration">
      <div className="section-header-row">
        <div>
          <h2 className="section-title">Downstream Namespace Consumer Integration</h2>
          <p className="section-subtitle">
            Binding registry and deterministic boolean state evaluation for downstream policy simulation consumers.
          </p>
        </div>
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      <div className="grid-2-col">
        <div className="sub-card">
          <h3>Register Downstream Consumer Binding</h3>
          <p className="subtle-note">
            Register your contract or consumer address with a designated namespace binding on-chain.
          </p>

          <form onSubmit={handleBindConsumer}>
            <div className="form-group">
              <label htmlFor="binding-trigger-id">Trigger ID</label>
              <input
                id="binding-trigger-id"
                type="text"
                className="form-control"
                placeholder="e.g. trg-0001"
                value={triggerId}
                onChange={(e) => setTriggerId(e.target.value)}
                disabled={isRegistering}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="consumer-namespace">Downstream Namespace (1–64 characters)</label>
              <input
                id="consumer-namespace"
                type="text"
                className="form-control"
                placeholder="e.g. benefit-sim-ns-01"
                value={namespace}
                onChange={(e) => setNamespace(e.target.value)}
                disabled={isRegistering}
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={isRegistering || !activeWallet}
            >
              {isRegistering
                ? 'Registering Binding...'
                : !activeWallet
                ? 'Connect Wallet to Bind'
                : 'Bind Consumer (bind_consumer)'}
            </button>
          </form>

          {boundTriggerId && (
            <div className="binding-success-card">
              <span className="badge badge-success">Binding Confirmed</span>
              <p><strong>Namespace:</strong> {namespace}</p>
              <p><strong>Bound Trigger ID:</strong> {boundTriggerId}</p>
              <p><strong>Consumer Address:</strong> {activeWallet?.address}</p>
            </div>
          )}
        </div>

        <div className="sub-card">
          <h3>Authoritative Consequence Query</h3>
          <p className="subtle-note">
            Query effective trigger state via <code>get_effective_trigger_state(trigger_id)</code>.
          </p>

          <div className="query-box">
            <button
              type="button"
              className="btn btn-secondary btn-block"
              onClick={handleQueryEffectiveState}
              disabled={isQuerying || !triggerId.trim()}
            >
              {isQuerying ? 'Evaluating On-Chain State...' : `Query Effective State for ${triggerId || 'Trigger'}`}
            </button>

            {effectiveStateData && (
              <div className={`consequence-result-card ${effectiveStateData.is_effective_active ? 'res-active' : 'res-inactive'}`}>
                <div className="consequence-header">
                  <span className="consequence-badge">
                    Effective Active: <strong>{effectiveStateData.is_effective_active ? 'TRUE (Active)' : 'FALSE (Inactive)'}</strong>
                  </span>
                  <span className="badge badge-sm badge-outline">{effectiveStateData.effective_state}</span>
                </div>
                <div className="effective-state-details">
                  <p><strong>Stored State:</strong> {effectiveStateData.stored_state}</p>
                  <p><strong>Series / Period:</strong> {effectiveStateData.series} ({effectiveStateData.period} {effectiveStateData.year})</p>
                  <p><strong>Threshold:</strong> {effectiveStateData.operator === 'GE' ? '≥' : '≤'} {effectiveStateData.threshold_decimal}</p>
                  <p><strong>Latest Raw Value:</strong> {effectiveStateData.latest_raw_value || 'None'}</p>
                  <p><strong>Is Stale (&gt;30d):</strong> {effectiveStateData.is_stale ? 'YES (Stale)' : 'NO (Fresh)'}</p>
                  <p><strong>Is Hold:</strong> {effectiveStateData.is_hold ? 'YES (Hold)' : 'NO'}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect, useCallback } from 'react';
import { useActiveWallet } from '../services/useActiveWallet';
import { writeManager } from '../services/writeManager';
import { rpcClient } from '../services/rpcClient';
import { Trigger } from '../types';

interface RefresherProps {
  selectedTriggerId: string | null;
  onRevalidated: (triggerId: string) => void;
}

export const Refresher: React.FC<RefresherProps> = ({
  selectedTriggerId,
  onRevalidated,
}) => {
  const [triggerIdInput, setTriggerIdInput] = useState<string>(selectedTriggerId || '');
  const [targetTrigger, setTargetTrigger] = useState<Trigger | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<string | null>(null);

  const activeWallet = useActiveWallet();

  const fetchTrigger = useCallback(async (id: string) => {
    if (!id.trim()) {
      setTargetTrigger(null);
      return;
    }
    setIsLoadingDetails(true);
    setError(null);
    try {
      const raw = await rpcClient.readContract<string>('get_trigger', [id.trim()]);
      if (!raw) {
        setTargetTrigger(null);
        setError(`Trigger ${id} not found.`);
      } else {
        setTargetTrigger(JSON.parse(raw) as Trigger);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setTargetTrigger(null);
    } finally {
      setIsLoadingDetails(false);
    }
  }, []);

  useEffect(() => {
    if (selectedTriggerId) {
      setTriggerIdInput(selectedTriggerId);
      fetchTrigger(selectedTriggerId);
    }
  }, [selectedTriggerId, fetchTrigger]);

  const handleLookup = (e: React.FormEvent) => {
    e.preventDefault();
    fetchTrigger(triggerIdInput);
  };

  const handleFreeze = async () => {
    if (!targetTrigger || !activeWallet) return;
    setIsProcessing(true);
    setError(null);
    setSuccessInfo(null);
    try {
      const result = await writeManager.executeWrite(
        activeWallet,
        'freeze_trigger',
        [targetTrigger.id],
        async () => {
          const raw = await rpcClient.readContract<string>('get_trigger', [targetTrigger.id]);
          return raw ? (JSON.parse(raw) as Trigger) : null;
        },
        (readback) => Boolean(readback && readback.id === targetTrigger.id && readback.state === 'FROZEN')
      );
      if (!result.success) {
        setError(result.error || 'Freeze failed.');
      } else {
        const updated = result.data as Trigger;
        setTargetTrigger(updated);
        setSuccessInfo(`Trigger ${updated.id} successfully frozen! You can now execute initial observation.`);
        onRevalidated(updated.id);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleObserveInitial = async () => {
    if (!targetTrigger || !activeWallet) return;
    setIsProcessing(true);
    setError(null);
    setSuccessInfo(null);
    try {
      const result = await writeManager.executeWrite(
        activeWallet,
        'observe_initial',
        [targetTrigger.id],
        async () => {
          const raw = await rpcClient.readContract<string>('get_trigger', [targetTrigger.id]);
          return raw ? (JSON.parse(raw) as Trigger) : null;
        },
        (readback) => Boolean(readback &&
          readback.id === targetTrigger.id &&
          readback.vintage_count >= 1 &&
          !['DRAFT', 'FROZEN'].includes(readback.state))
      );
      if (!result.success) {
        setError(result.error || 'Initial observation failed.');
      } else {
        const updated = result.data as Trigger;
        setTargetTrigger(updated);
        setSuccessInfo(
          `Initial observation complete! Outcome recorded. State: ${updated.effective_state || updated.state}, Vintages: ${updated.vintage_count}`
        );
        onRevalidated(updated.id);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRevalidate = async () => {
    if (!targetTrigger || !activeWallet) return;
    setIsProcessing(true);
    setError(null);
    setSuccessInfo(null);
    try {
      const result = await writeManager.executeWrite(
        activeWallet,
        'revalidate_trigger',
        [targetTrigger.id],
        async () => {
          const raw = await rpcClient.readContract<string>('get_trigger', [targetTrigger.id]);
          return raw ? (JSON.parse(raw) as Trigger) : null;
        },
        (readback) => Boolean(readback &&
          readback.id === targetTrigger.id &&
          readback.vintage_count >= targetTrigger.vintage_count &&
          !['DRAFT', 'FROZEN', 'CLOSED'].includes(readback.state))
      );
      if (!result.success) {
        setError(result.error || 'Revalidation failed.');
      } else {
        const updated = result.data as Trigger;
        setTargetTrigger(updated);
        setSuccessInfo(
          `Revalidation complete! New State: ${updated.effective_state || updated.state}, Vintages: ${updated.vintage_count}`
        );
        onRevalidated(updated.id);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsProcessing(false);
    }
  };

  const isInitialObservationNeeded =
    targetTrigger &&
    (targetTrigger.vintage_count === 0 ||
      targetTrigger.state === 'FROZEN' ||
      targetTrigger.state === 'PROVISIONAL');

  return (
    <div className="card refresher-section" role="region" aria-label="Permissionless Trigger Revalidator">
      <div className="section-header-row">
        <div>
          <h2 className="section-title">Permissionless Revalidation</h2>
          <p className="section-subtitle">
            Trigger on-chain BLS API refetch and independent validator consensus for any active policy trigger.
          </p>
        </div>
      </div>

      <div className="info-box">
        <strong>Dual-Phase Consensus:</strong> When you invoke observation or revalidation, GenLayer validators independently fetch official data from the Bureau of Labor Statistics API v2, verify JSON schema &amp; canonical hash, check metadata comparability with LLM consensus, and update trigger state deterministically.
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      {successInfo && (
        <div className="alert alert-success" role="alert">
          {successInfo}
        </div>
      )}

      <form onSubmit={handleLookup} className="lookup-form">
        <div className="form-row">
          <div className="form-group flex-3">
            <label htmlFor="refresher-id-input">Target Trigger ID</label>
            <input
              id="refresher-id-input"
              type="text"
              className="form-control"
              placeholder="e.g. trg-0001"
              value={triggerIdInput}
              onChange={(e) => setTriggerIdInput(e.target.value)}
              disabled={isProcessing}
            />
          </div>
          <div className="form-group flex-1 form-btn-align">
            <button
              type="submit"
              className="btn btn-secondary btn-block"
              disabled={isLoadingDetails || isProcessing || !triggerIdInput.trim()}
            >
              {isLoadingDetails ? 'Loading...' : 'Lookup Trigger'}
            </button>
          </div>
        </div>
      </form>

      {targetTrigger && (
        <div className="revalidation-target-card">
          <div className="target-summary-grid">
            <div>
              <span className="summary-label">Trigger ID:</span>
              <span className="summary-val"><code>{targetTrigger.id}</code></span>
            </div>
            <div>
              <span className="summary-label">Series &amp; Period:</span>
              <span className="summary-val">
                <strong>{targetTrigger.series}</strong> ({targetTrigger.period} {targetTrigger.year})
              </span>
            </div>
            <div>
              <span className="summary-label">Threshold:</span>
              <span className="summary-val">
                <code>{targetTrigger.operator === 'GE' ? '≥' : '≤'} {targetTrigger.threshold_decimal}</code>
              </span>
            </div>
            <div>
              <span className="summary-label">Current State:</span>
              <span className="summary-val">
                <span className={`badge state-${targetTrigger.effective_state || targetTrigger.state}`}>
                  {targetTrigger.effective_state || targetTrigger.state}
                </span>
              </span>
            </div>
            <div>
              <span className="summary-label">Vintages Recorded:</span>
              <span className="summary-val">{targetTrigger.vintage_count} / 5</span>
            </div>
            <div>
              <span className="summary-label">Latest Observed:</span>
              <span className="summary-val">
                {targetTrigger.latest_observed_at
                  ? new Date(targetTrigger.latest_observed_at).toLocaleString()
                  : 'Never observed'}
              </span>
            </div>
          </div>

          <div className="revalidation-action-box">
            <p className="action-hint">
              Query endpoint:
              <code>https://api.bls.gov/publicAPI/v2/timeseries/data/{targetTrigger.series}?startyear={targetTrigger.year}&amp;endyear={targetTrigger.year}</code>
            </p>

            {targetTrigger.state === 'DRAFT' ? (
              <button
                type="button"
                className="btn btn-warning btn-lg"
                disabled={isProcessing || !activeWallet}
                onClick={handleFreeze}
              >
                {isProcessing
                  ? 'Freezing Trigger...'
                  : !activeWallet
                  ? 'Connect Wallet to Freeze'
                  : 'Freeze Trigger First (Lock Specification)'}
              </button>
            ) : isInitialObservationNeeded ? (
              <button
                type="button"
                className="btn btn-primary btn-lg"
                disabled={isProcessing || !activeWallet}
                onClick={handleObserveInitial}
              >
                {isProcessing
                  ? 'Validators Fetching Initial BLS Data...'
                  : !activeWallet
                  ? 'Connect Wallet to Observe'
                  : 'Execute Initial Observation (observe_initial)'}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-lg"
                disabled={isProcessing || !activeWallet || targetTrigger.state === 'CLOSED'}
                onClick={handleRevalidate}
              >
                {isProcessing
                  ? 'Validators Fetching BLS & Finalizing...'
                  : !activeWallet
                  ? 'Connect Wallet to Revalidate'
                  : targetTrigger.state === 'CLOSED'
                  ? 'Trigger is Closed'
                  : 'Execute Permissionless Revalidation (revalidate_trigger)'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

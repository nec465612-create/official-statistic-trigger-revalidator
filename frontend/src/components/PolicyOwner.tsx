import React, { useEffect, useState } from 'react';
import { useActiveWallet } from '../services/useActiveWallet';
import { writeManager } from '../services/writeManager';
import { rpcClient } from '../services/rpcClient';
import { Trigger } from '../types';

interface PolicyOwnerProps {
  onTriggerCreated: (triggerId: string) => void;
}

export const PolicyOwner: React.FC<PolicyOwnerProps> = ({ onTriggerCreated }) => {
  const [series, setSeries] = useState<'CUSR0000SA0' | 'CUUR0000SA0'>('CUSR0000SA0');
  const [year, setYear] = useState<number>(2024);
  const [period, setPeriod] = useState<string>('M05');
  const [operator, setOperator] = useState<'GE' | 'LE'>('GE');
  const [thresholdDecimal, setThresholdDecimal] = useState<string>('314.069');
  const [autoFreeze, setAutoFreeze] = useState<boolean>(true);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [createdTrigger, setCreatedTrigger] = useState<Trigger | null>(null);

  const activeWallet = useActiveWallet();

  useEffect(() => writeManager.subscribe(() => {
    if (writeManager.getStage() === 'SUCCESS') setError(null);
  }), []);

  const handleCreateTrigger = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWallet) {
      setError('Please connect your wallet first.');
      return;
    }

    setError(null);
    setCreatedTrigger(null);

    // Strict validation
    const cleanThreshold = thresholdDecimal.trim();
    if (!/^-?\d+(\.\d{1,3})?$/.test(cleanThreshold)) {
      setError('Invalid threshold. Must be a valid decimal number with up to 3 decimal places (e.g. 314.069).');
      return;
    }

    if (year < 1990 || year > 2099) {
      setError('Year must be between 1990 and 2099.');
      return;
    }

    const nonce = `nonce-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    setIsSubmitting(true);
    try {
      // Exact 6 args for create_trigger: [client_nonce, series, year, period, operator, threshold_decimal]
      const result = await writeManager.executeWrite(
        activeWallet,
        'create_trigger',
        [nonce, series, year.toString(), period, operator, cleanThreshold],
        async () => {
          // Use the same case-insensitive, authoritative recovery path as reload.
          return await writeManager.readCreatedTrigger(activeWallet.address, nonce) as Trigger | null;
        },
        (readback) => Boolean(readback &&
          readback.owner.toLowerCase() === activeWallet.address.toLowerCase() &&
          readback.client_nonce === nonce &&
          readback.series === series &&
          readback.year === year.toString() &&
          readback.period === period &&
          readback.operator === operator &&
          readback.threshold_decimal === cleanThreshold)
      );

      if (!result.success) {
        // An unresolved submitted transaction is recoverable, not a failed action.
        // TxStatusBar owns that pending state and its same-hash continuation path.
        if (writeManager.getStage() !== 'RECONCILIATION_REQUIRED') {
          setError(result.error || 'Trigger creation failed.');
        }
        return;
      }

      const created = result.data as Trigger;
      if (created) {
        setCreatedTrigger(created);

        // If auto-freeze is selected and trigger is in DRAFT
        if (autoFreeze && created.state === 'DRAFT') {
          const freezeResult = await writeManager.executeWrite(
              activeWallet,
              'freeze_trigger',
              [created.id],
              async () => {
                const raw = await rpcClient.readContract<string>('get_trigger', [created.id]);
                return raw ? (JSON.parse(raw) as Trigger) : null;
              },
              (readback) => Boolean(readback && readback.state === 'FROZEN')
            );
          if (freezeResult.success && freezeResult.data) {
            created.state = 'FROZEN';
            created.effective_state = 'FROZEN';
          } else {
            setError(`Trigger ${created.id} was created but freeze was not verified: ${freezeResult.error || 'unknown error'}`);
          }
        }

        onTriggerCreated(created.id);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="card policy-owner-section" role="region" aria-label="Policy Owner Management">
      <div className="section-header-row">
        <div>
          <h2 className="section-title">Policy Owner Workbench</h2>
          <p className="section-subtitle">
            Create and lock official Bureau of Labor Statistics triggers on-chain for policy simulation.
          </p>
        </div>
      </div>

      {!activeWallet && (
        <div className="alert alert-warning" role="alert">
          Please connect your Web3 wallet (MetaMask, OKX, or Rabby) to create or manage policy triggers.
        </div>
      )}

      {error && (
        <div className="alert alert-error" role="alert">
          <strong>Action Failed:</strong> {error}
        </div>
      )}

      {createdTrigger && (
        <div className="alert alert-success" role="alert">
          <strong>Trigger Created Successfully!</strong> Trigger ID: <code>{createdTrigger.id}</code> (State: {createdTrigger.state})
        </div>
      )}

      <form onSubmit={handleCreateTrigger} className="policy-form">
        <div className="form-row">
          <div className="form-group flex-2">
            <label htmlFor="series-select">BLS CPI Series (Strict Allowlist)</label>
            <select
              id="series-select"
              className="form-control"
              value={series}
              onChange={(e) => setSeries(e.target.value as 'CUSR0000SA0' | 'CUUR0000SA0')}
              disabled={isSubmitting || !activeWallet}
            >
              <option value="CUSR0000SA0">CUSR0000SA0 — CPI-U All Items (Seasonally Adjusted)</option>
              <option value="CUUR0000SA0">CUUR0000SA0 — CPI-U All Items (Not Seasonally Adjusted)</option>
            </select>
          </div>

          <div className="form-group flex-1">
            <label htmlFor="year-input">Target Year</label>
            <input
              id="year-input"
              type="number"
              className="form-control"
              value={year}
              min={1990}
              max={2099}
              onChange={(e) => setYear(parseInt(e.target.value, 10))}
              disabled={isSubmitting || !activeWallet}
              required
            />
          </div>

          <div className="form-group flex-1">
            <label htmlFor="period-select">Target Period (M01–M12)</label>
            <select
              id="period-select"
              className="form-control"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              disabled={isSubmitting || !activeWallet}
            >
              <option value="M01">M01 (January)</option>
              <option value="M02">M02 (February)</option>
              <option value="M03">M03 (March)</option>
              <option value="M04">M04 (April)</option>
              <option value="M05">M05 (May)</option>
              <option value="M06">M06 (June)</option>
              <option value="M07">M07 (July)</option>
              <option value="M08">M08 (August)</option>
              <option value="M09">M09 (September)</option>
              <option value="M10">M10 (October)</option>
              <option value="M11">M11 (November)</option>
              <option value="M12">M12 (December)</option>
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group flex-1">
            <label htmlFor="operator-select">Comparison Operator</label>
            <select
              id="operator-select"
              className="form-control"
              value={operator}
              onChange={(e) => setOperator(e.target.value as 'GE' | 'LE')}
              disabled={isSubmitting || !activeWallet}
            >
              <option value="GE">Greater Than or Equal (≥)</option>
              <option value="LE">Less Than or Equal (≤)</option>
            </select>
          </div>

          <div className="form-group flex-2">
            <label htmlFor="threshold-input">Threshold Value (Fixed-Scale Decimal)</label>
            <input
              id="threshold-input"
              type="text"
              className="form-control"
              value={thresholdDecimal}
              onChange={(e) => setThresholdDecimal(e.target.value)}
              placeholder="e.g. 314.069"
              disabled={isSubmitting || !activeWallet}
              required
            />
            <span className="field-hint">Scaled automatically to integer representation (×1000).</span>
          </div>
        </div>

        <div className="form-group-checkbox">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={autoFreeze}
              onChange={(e) => setAutoFreeze(e.target.checked)}
              disabled={isSubmitting || !activeWallet}
            />
            <span>Immediately Freeze on Creation (Locks specification for validator consensus)</span>
          </label>
        </div>

        <div className="form-actions">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isSubmitting || !activeWallet}
          >
            {isSubmitting ? 'Submitting & Finalizing...' : 'Create Policy Trigger'}
          </button>
        </div>
      </form>
    </div>
  );
};

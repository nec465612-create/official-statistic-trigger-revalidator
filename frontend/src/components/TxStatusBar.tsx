import React, { useEffect, useState } from 'react';
import { writeManager } from '../services/writeManager';
import { TxStage } from '../types';

// prefers-reduced-motion is handled by the matching .spinner rule in styles.css.

export const TxStatusBar: React.FC<{ onReconciled?: () => void }> = ({ onReconciled }) => {
  const [stage, setStage] = useState<TxStage>(writeManager.getStage());
  const [hash, setHash] = useState<string | null>(writeManager.getHash());
  const [error, setError] = useState<string | null>(writeManager.getError());

  useEffect(() => {
    const unsub = writeManager.subscribe(() => {
      setStage(writeManager.getStage());
      setHash(writeManager.getHash());
      setError(writeManager.getError());
    });
    return unsub;
  }, []);

  if (stage === 'IDLE') return null;

  const getStageMessage = () => {
    switch (stage) {
      case 'WAITING_FOR_WALLET':
        return 'Please confirm and sign the transaction in your connected wallet...';
      case 'SUBMITTED':
        return 'Transaction submitted to Studionet. Awaiting inclusion...';
      case 'WAITING_FOR_FINALITY':
        return 'Validators refetching BLS data & computing consensus finality...';
      case 'VERIFYING_EXECUTION':
        return 'Transaction finalized. Verifying its execution result...';
      case 'VERIFYING_READBACK':
        return 'Refreshing authoritative trigger state from the contract...';
      case 'SUCCESS':
        return 'Transaction execution and authoritative readback succeeded!';
      case 'FAILED':
        return `Transaction failed: ${error || 'Unknown execution error'}. Clear this failed attempt, then use the original action to retry.`;
      case 'REJECTED':
        return 'Wallet request rejected. No transaction was submitted; you may try again.';
      case 'RECONCILIATION_REQUIRED':
        return `Verification was interrupted: ${error || 'final status is unresolved'}. Do not submit again; continue the existing transaction.`;
      default:
        return '';
    }
  };

  const isPending = ['WAITING_FOR_WALLET', 'SUBMITTED', 'WAITING_FOR_FINALITY', 'VERIFYING_EXECUTION', 'VERIFYING_READBACK'].includes(stage);
  const canReconcile = stage === 'RECONCILIATION_REQUIRED' && Boolean(hash);

  return (
    <div
      className={`tx-status-bar ${stage === 'SUCCESS' ? 'tx-success' : stage === 'FAILED' ? 'tx-failed' : 'tx-pending'}`}
      data-transaction-phase={stage}
      role={stage === 'FAILED' || stage === 'REJECTED' ? 'alert' : 'status'}
      aria-live="polite"
    >
      <div className="tx-status-content">
        <div className="tx-stage-indicator">
          {isPending && <span className="spinner" aria-hidden="true" />}
          <strong className="tx-stage-title">[{stage}]</strong>
          <span className="tx-stage-msg">{getStageMessage()}</span>
        </div>

        {hash && (
          <div className="tx-hash-row">
            <span className="tx-hash-label">Tx Hash:</span>
            <code className="tx-hash-val">{hash}</code>
            <button type="button" className="btn btn-sm btn-outline" onClick={() => void navigator.clipboard.writeText(hash)}>Copy hash</button>
            <a className="btn btn-sm btn-outline" href={`https://explorer-studio.genlayer.com/tx/${hash}`} target="_blank" rel="noreferrer">View transaction</a>
          </div>
        )}
      </div>

      {canReconcile && (
        <button
          type="button"
          className="btn btn-sm btn-primary"
          onClick={() => void writeManager.continueVerification().then((result) => {
            if (result.success) onReconciled?.();
          })}
        >
          Continue verification
        </button>
      )}

      {!isPending && !canReconcile && (
        <button
          type="button"
          className="btn btn-sm btn-outline tx-dismiss-btn"
          onClick={() => writeManager.resetState()}
        >
          {stage === 'FAILED' ? 'Clear failed attempt' : 'Dismiss'}
        </button>
      )}
    </div>
  );
};

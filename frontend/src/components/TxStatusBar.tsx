import React, { useEffect, useState } from 'react';
import { writeManager } from '../services/writeManager';
import { TxStage } from '../types';

export const TxStatusBar: React.FC = () => {
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
      case 'PRE_SIGN':
        return 'Preparing transaction intent and recording journal...';
      case 'SIGNING':
        return 'Please confirm and sign the transaction in your connected wallet...';
      case 'SUBMITTED':
        return 'Transaction submitted to Studionet. Awaiting inclusion...';
      case 'FINALIZING':
        return 'Validators refetching BLS data & computing consensus finality...';
      case 'READBACK':
        return 'Transaction finalized! Performing authoritative state readback...';
      case 'SUCCESS':
        return 'Transaction execution and authoritative readback succeeded!';
      case 'FAILED':
        return `Transaction failed: ${error || 'Unknown execution error'}`;
      default:
        return '';
    }
  };

  const isPending = stage !== 'SUCCESS' && stage !== 'FAILED';

  return (
    <div
      className={`tx-status-bar ${stage === 'SUCCESS' ? 'tx-success' : stage === 'FAILED' ? 'tx-failed' : 'tx-pending'}`}
      role="status"
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
          </div>
        )}
      </div>

      {!isPending && (
        <button
          type="button"
          className="btn btn-sm btn-outline tx-dismiss-btn"
          onClick={() => writeManager.resetState()}
        >
          Dismiss
        </button>
      )}
    </div>
  );
};

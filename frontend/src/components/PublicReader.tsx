import React, { useEffect, useState, useCallback } from 'react';
import { rpcClient } from '../services/rpcClient';
import { Trigger } from '../types';

interface PublicReaderProps {
  onSelectTrigger: (triggerId: string) => void;
  selectedTriggerId: string | null;
  refreshTrigger: number;
}

export const PublicReader: React.FC<PublicReaderProps> = ({
  onSelectTrigger,
  selectedTriggerId,
  refreshTrigger,
}) => {
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const PAGE_SIZE = 20;

  const loadTriggers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const count = (await rpcClient.readContract<number>('get_trigger_count', [])) || 0;
      setTotalCount(Number(count));

      const offset = currentPage * PAGE_SIZE;
      const rawPage = await rpcClient.readContract<string>('get_triggers_page', [offset, PAGE_SIZE]);
      const parsed = rawPage ? JSON.parse(rawPage) : [];
      setTriggers(parsed);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [currentPage]);

  useEffect(() => {
    loadTriggers();
  }, [loadTriggers, refreshTrigger]);

  const getStateBadgeClass = (state: string) => {
    switch (state) {
      case 'CONFIRMED_ACTIVE':
      case 'RECONFIRMED':
      case 'ACTIVATED_BY_REVISION':
        return 'badge-success';
      case 'CONFIRMED_INACTIVE':
      case 'RECONFIRMED_INACTIVE':
      case 'REVERSED_BY_REVISION':
        return 'badge-neutral';
      case 'HOLD':
        return 'badge-warning';
      case 'STALE':
        return 'badge-stale';
      case 'FROZEN':
        return 'badge-info';
      case 'CLOSED':
        return 'badge-dark';
      case 'DRAFT':
      default:
        return 'badge-subtle';
    }
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE) || 1;

  return (
    <div className="card public-reader-section" role="region" aria-label="Public Policy Trigger Registry">
      <div className="section-header-row">
        <div>
          <h2 className="section-title">Public Policy Trigger Registry</h2>
          <p className="section-subtitle">
            Authoritative on-chain BLS statistic triggers with verified revision history.
          </p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={loadTriggers}
            disabled={isLoading}
          >
            {isLoading ? 'Refreshing...' : 'Refresh Registry'}
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          <strong>Failed to load triggers:</strong> {error}
        </div>
      )}

      <div className="table-responsive">
        <table className="data-table">
          <thead>
            <tr>
              <th>Trigger ID</th>
              <th>Series</th>
              <th>Target Period</th>
              <th>Condition</th>
              <th>Effective State</th>
              <th>Vintages</th>
              <th>Latest Observation</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {triggers.length === 0 ? (
              <tr>
                <td colSpan={8} className="empty-table-cell">
                  {isLoading ? 'Loading triggers from Studionet...' : 'No policy triggers found on-chain.'}
                </td>
              </tr>
            ) : (
              triggers.map((trg) => {
                const isSelected = trg.id === selectedTriggerId;
                return (
                  <tr key={trg.id} className={isSelected ? 'row-selected' : ''}>
                    <td>
                      <code className="code-id">{trg.id}</code>
                    </td>
                    <td>
                      <span className="series-name" title={trg.series_title}>
                        {trg.series}
                      </span>
                    </td>
                    <td>
                      <strong>{trg.period}</strong> {trg.year}
                    </td>
                    <td>
                      <code>{trg.operator === 'GE' ? '≥' : '≤'} {trg.threshold_decimal}</code>
                    </td>
                    <td>
                      <span className={`badge ${getStateBadgeClass(trg.effective_state || trg.state)}`}>
                        {trg.effective_state || trg.state}
                      </span>
                    </td>
                    <td>
                      <span className="vintage-count-chip">{trg.vintage_count} / 5</span>
                    </td>
                    <td>
                      <span className="timestamp-text">
                        {trg.latest_observed_at ? new Date(trg.latest_observed_at).toLocaleString() : 'Pending initial obs'}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className={`btn btn-sm ${isSelected ? 'btn-primary' : 'btn-outline'}`}
                        onClick={() => onSelectTrigger(trg.id)}
                      >
                        {isSelected ? 'Viewing' : 'Inspect'}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {totalCount > PAGE_SIZE && (
        <div className="pagination-controls">
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            disabled={currentPage === 0 || isLoading}
            onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
          >
            Previous
          </button>
          <span className="page-indicator">
            Page {currentPage + 1} of {totalPages} ({totalCount} total)
          </span>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            disabled={currentPage >= totalPages - 1 || isLoading}
            onClick={() => setCurrentPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { appConfig } from '../config';
import { walletManager } from '../services/walletManager';
import { rpcClient } from '../services/rpcClient';
import { ConnectedWallet, RPCStats } from '../types';

interface HeaderProps {
  onOpenConnect: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenConnect }) => {
  const [wallet, setWallet] = useState<ConnectedWallet | null>(walletManager.getActiveWallet());
  const [rpcStats, setRpcStats] = useState<RPCStats>(rpcClient.getStats());

  useEffect(() => {
    const unsub = walletManager.subscribe(() => {
      setWallet(walletManager.getActiveWallet());
    });
    return unsub;
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setRpcStats(rpcClient.getStats());
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="app-header">
      <div className="header-brand">
        <h1 className="brand-title">Official Statistic Trigger Revalidator</h1>
        <span className="brand-subtitle">
          GenLayer Intelligent Contract • Bureau of Labor Statistics Revalidator
        </span>
      </div>

      <div className="header-controls">
        <div className="network-badge" title={`Chain ID: ${appConfig.chainId}`}>
          <span className="dot dot-green" />
          <span>Studionet ({appConfig.chainId})</span>
        </div>

        <div className="rpc-stats-widget" title="Client RPC Budget & Cache Metrics">
          <span className="rpc-stat-item">Calls: <strong>{rpcStats.totalCalls}</strong></span>
          <span className="rpc-stat-item">Cached: <strong>{rpcStats.cachedHits}</strong></span>
          {rpcStats.rateLimitHits > 0 && (
            <span className="rpc-stat-item rpc-rate-limit">429s: <strong>{rpcStats.rateLimitHits}</strong></span>
          )}
        </div>

        {wallet ? (
          <div className="wallet-connected-info">
            <span className="wallet-brand-tag">{wallet.brand}</span>
            <span className="wallet-address" title={wallet.address}>
              {wallet.address.substring(0, 6)}...{wallet.address.substring(wallet.address.length - 4)}
            </span>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => walletManager.disconnect()}
            >
              Disconnect
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            onClick={onOpenConnect}
          >
            Connect Wallet
          </button>
        )}
      </div>
    </header>
  );
};

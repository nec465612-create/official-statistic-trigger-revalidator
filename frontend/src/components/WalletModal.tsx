import React, { useEffect, useRef, useState } from 'react';
import { walletManager } from '../services/walletManager';
import { DetectedWallet } from '../types';

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WalletModal: React.FC<WalletModalProps> = ({ isOpen, onClose }) => {
  const [wallets, setWallets] = useState<DetectedWallet[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setWallets(walletManager.getDetectedWallets());
    const unsub = walletManager.subscribe(() => {
      setWallets(walletManager.getDetectedWallets());
    });
    return unsub;
  }, []);

  useEffect(() => {
    const appShell = document.querySelector('.app-shell-content');
    if (isOpen) {
      if (appShell) {
        appShell.setAttribute('inert', '');
        appShell.setAttribute('aria-hidden', 'true');
      }
      previousFocusRef.current = document.activeElement as HTMLElement;
      setError(null);
      setTimeout(() => {
        const firstBtn = modalRef.current?.querySelector('button');
        firstBtn?.focus();
      }, 50);
    } else {
      if (appShell) {
        appShell.removeAttribute('inert');
        appShell.removeAttribute('aria-hidden');
      }
      if (previousFocusRef.current) {
        previousFocusRef.current.focus();
      }
    }
    return () => {
      if (appShell) {
        appShell.removeAttribute('inert');
        appShell.removeAttribute('aria-hidden');
      }
    };
  }, [isOpen]);

  // Keyboard navigation & focus trap
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'Tab') {
        const focusable = modalRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable || focusable.length === 0) return;

        const firstElement = focusable[0];
        const lastElement = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            lastElement.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === lastElement) {
            firstElement.focus();
            e.preventDefault();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSelectWallet = async (wallet: DetectedWallet) => {
    setIsConnecting(true);
    setError(null);
    try {
      await walletManager.connectWallet(wallet);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} aria-hidden="false">
      <div
        className="modal-container"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-modal-title"
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="wallet-modal-title">Select Wallet</h2>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close wallet selection modal"
          >
            &times;
          </button>
        </div>

        <p className="modal-description">
          Connect your Web3 provider. This application supports MetaMask, OKX Wallet, and Rabby.
        </p>

        {error && (
          <div className="alert alert-error" role="alert">
            <strong>Connection Failed:</strong> {error}
          </div>
        )}

        <div className="wallet-list">
          {wallets.length === 0 ? (
            <div className="empty-wallet-note">
              <p>No supported wallet detected (MetaMask, OKX, or Rabby).</p>
              <p className="subtle-note">Please install or unlock a supported browser extension and reload.</p>
            </div>
          ) : (
            wallets.map((wallet) => (
              <button
                key={wallet.id}
                type="button"
                className="wallet-option-btn"
                disabled={isConnecting}
                onClick={() => handleSelectWallet(wallet)}
              >
                <img
                  src={wallet.icon}
                  alt={`${wallet.brand} icon`}
                  className="wallet-icon"
                  width={32}
                  height={32}
                />
                <span className="wallet-name">{wallet.name}</span>
                {wallet.isFallback && <span className="badge badge-subtle">Fallback</span>}
              </button>
            ))
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

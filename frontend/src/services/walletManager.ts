import { DetectedWallet, ConnectedWallet, WalletBrand, EIP1193Provider, EIP6963ProviderDetail } from '../types';
import { appConfig } from '../config';

const STUDIONET_CHAIN_ID_HEX = `0x${appConfig.chainId.toString(16)}`;

export class WalletManager {
  private detectedWallets = new Map<string, DetectedWallet>();
  private activeWallet: ConnectedWallet | null = null;
  private listeners: Array<() => void> = [];
  private hasAnnounced = false;
  private attachedProviderListeners: {
    provider: EIP1193Provider;
    accountsHandler: (newAccounts: unknown) => void;
    chainHandler: (newChainHex: unknown) => void;
  } | null = null;

  constructor() {
    this.initEIP6963();
  }

  public subscribe(callback: () => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  private notify(): void {
    this.listeners.forEach((cb) => cb());
  }

  private initEIP6963(): void {
    if (typeof window === 'undefined') return;

    const handleAnnouncement = (event: Event) => {
      const customEvent = event as CustomEvent<EIP6963ProviderDetail>;
      if (!customEvent.detail || !customEvent.detail.info || !customEvent.detail.provider) {
        return;
      }

      const { info, provider } = customEvent.detail;
      const brand = this.identifyBrand(info.name, info.rdns);
      if (!brand) return; // Only allow MetaMask, OKX Wallet, Rabby

      this.hasAnnounced = true;
      this.detectedWallets.delete('legacy-fallback');

      // Deduplicate by UUID or brand
      const walletId = info.uuid || `${brand}-uuid`;

      // Check if this provider instance or ID is already recorded
      let existingKey: string | null = null;
      for (const [key, val] of this.detectedWallets.entries()) {
        if (val.provider === provider || val.id === walletId) {
          existingKey = key;
          break;
        }
      }

      const wallet: DetectedWallet = {
        id: walletId,
        brand,
        name: brand,
        icon: info.icon || this.getDefaultIcon(brand),
        provider,
        isFallback: false,
      };

      if (existingKey) {
        this.detectedWallets.set(existingKey, wallet);
      } else {
        this.detectedWallets.set(wallet.id, wallet);
      }
      this.notify();
    };

    window.addEventListener('eip6963:announceProvider', handleAnnouncement);
    window.dispatchEvent(new Event('eip6963:requestProvider'));

    // Bounded legacy fallback only if no EIP-6963 announcements arrive
    setTimeout(() => {
      if (!this.hasAnnounced && typeof window !== 'undefined') {
        const eth = (window as unknown as { ethereum?: EIP1193Provider }).ethereum;
        if (eth && typeof eth.request === 'function') {
          const brand = this.identifyLegacyBrand(eth);
          if (brand) {
            this.detectedWallets.set('legacy-fallback', {
              id: 'legacy-fallback',
              brand,
              name: brand,
              icon: this.getDefaultIcon(brand),
              provider: eth,
              isFallback: true,
            });
            this.notify();
          }
        }
      }
    }, 150);
  }

  private identifyBrand(name: string, rdns?: string): WalletBrand | null {
    const lowerName = (name || '').toLowerCase();
    const lowerRdns = (rdns || '').toLowerCase();

    if (lowerRdns.includes('metamask') || lowerName.includes('metamask')) {
      return 'MetaMask';
    }
    if (lowerRdns.includes('okx') || lowerName.includes('okx')) {
      return 'OKX Wallet';
    }
    if (lowerRdns.includes('rabby') || lowerName.includes('rabby')) {
      return 'Rabby';
    }
    return null;
  }

  private identifyLegacyBrand(provider: unknown): WalletBrand | null {
    const p = provider as Record<string, unknown>;
    if (p.isRabby) return 'Rabby';
    if (p.isOKExWallet || p.isOkxWallet) return 'OKX Wallet';
    if (p.isMetaMask) return 'MetaMask';
    return null;
  }

  private getDefaultIcon(brand: WalletBrand): string {
    switch (brand) {
      case 'MetaMask':
        return 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="%23E2761B"/><text x="16" y="21" font-size="14" font-family="sans-serif" font-weight="bold" text-anchor="middle" fill="white">MM</text></svg>';
      case 'OKX Wallet':
        return 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="%23000"/><text x="16" y="21" font-size="12" font-family="sans-serif" font-weight="bold" text-anchor="middle" fill="white">OKX</text></svg>';
      case 'Rabby':
        return 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="%238697FF"/><text x="16" y="21" font-size="13" font-family="sans-serif" font-weight="bold" text-anchor="middle" fill="white">RB</text></svg>';
    }
  }

  public getDetectedWallets(): DetectedWallet[] {
    return Array.from(this.detectedWallets.values());
  }

  public getActiveWallet(): ConnectedWallet | null {
    return this.activeWallet;
  }

  private cleanupListeners(): void {
    if (this.attachedProviderListeners) {
      const { provider, accountsHandler, chainHandler } = this.attachedProviderListeners;
      if (provider.removeListener) {
        try {
          provider.removeListener('accountsChanged', accountsHandler);
          provider.removeListener('chainChanged', chainHandler);
        } catch {
          // Ignore listener removal errors
        }
      }
      this.attachedProviderListeners = null;
    }
  }

  public async connectWallet(wallet: DetectedWallet): Promise<ConnectedWallet> {
    const provider = wallet.provider;

    // 1. Request accounts
    const accounts = (await provider.request({
      method: 'eth_requestAccounts',
    })) as string[];

    if (!accounts || !Array.isArray(accounts) || accounts.length === 0) {
      throw new Error('No accounts authorized or returned by wallet.');
    }

    const address = accounts[0];
    if (!address || typeof address !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
      throw new Error('Invalid account address received from wallet provider.');
    }

    // 2. Verify and switch chain if necessary
    const currentChainHex = (await provider.request({
      method: 'eth_chainId',
    })) as string;

    const currentChainId = parseInt(currentChainHex, 16);
    if (currentChainId !== appConfig.chainId) {
      try {
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: STUDIONET_CHAIN_ID_HEX }],
        });
      } catch (switchErr: unknown) {
        const err = switchErr as { code?: number; message?: string };
        // Chain not added to wallet (code 4902)
        if (err.code === 4902 || err.message?.includes('4902')) {
          await provider.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: STUDIONET_CHAIN_ID_HEX,
                chainName: 'GenLayer Studionet',
                rpcUrls: [appConfig.rpcUrl],
                nativeCurrency: {
                  name: 'GEN',
                  symbol: 'GEN',
                  decimals: 18,
                },
                blockExplorerUrls: [appConfig.explorerBaseUrl],
              },
            ],
          });

          // Enforce post-add chain switching
          await provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: STUDIONET_CHAIN_ID_HEX }],
          });
        } else {
          throw new Error(`Failed to switch to GenLayer Studionet (Chain ID ${appConfig.chainId}).`);
        }
      }
    }

    const verifiedChainHex = await provider.request({ method: 'eth_chainId' });
    if (typeof verifiedChainHex !== 'string' || parseInt(verifiedChainHex, 16) !== appConfig.chainId) {
      throw new Error(`Wallet did not confirm GenLayer Studionet (Chain ID ${appConfig.chainId}).`);
    }

    // 3. Clean previous listeners and attach fresh ones to the exact provider instance
    this.cleanupListeners();

    const accountsHandler = (newAccounts: unknown) => {
      const accs = newAccounts as string[];
      if (!accs || accs.length === 0) {
        this.disconnect();
      } else if (this.activeWallet && /^0x[0-9a-fA-F]{40}$/.test(accs[0])) {
        this.activeWallet = { ...this.activeWallet, address: accs[0] };
        this.notify();
      } else {
        this.disconnect();
      }
    };

    const chainHandler = (newChainHex: unknown) => {
      const chainId = parseInt(newChainHex as string, 16);
      if (chainId !== appConfig.chainId) {
        this.disconnect();
      } else if (this.activeWallet) {
        this.activeWallet.chainId = chainId;
        this.notify();
      }
    };

    if (provider.on) {
      provider.on('accountsChanged', accountsHandler);
      provider.on('chainChanged', chainHandler);
      this.attachedProviderListeners = {
        provider,
        accountsHandler,
        chainHandler,
      };
    }

    this.activeWallet = {
      address,
      chainId: appConfig.chainId,
      brand: wallet.brand,
      provider,
    };

    this.notify();
    return this.activeWallet;
  }

  public disconnect(): void {
    this.cleanupListeners();
    this.activeWallet = null;
    this.notify();
  }
}

export const walletManager = new WalletManager();

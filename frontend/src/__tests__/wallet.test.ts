import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { WalletManager } from '../services/walletManager';
import { EIP6963ProviderDetail } from '../types';
import { setTestConfig } from '../config';

describe('WalletManager (EIP-6963 Provider Gate, Chain Switch & Lifecycle)', () => {
  let manager: WalletManager;
  let eventListeners: Record<string, Function[]> = {};

  beforeEach(() => {
    setTestConfig({
      isConfigured: true,
      contractAddress: '0x8888888888888888888888888888888888888888',
      chainId: 61999,
    });

    eventListeners = {};
    (globalThis as any).window = {
      addEventListener: vi.fn((event: string, cb: Function) => {
        if (!eventListeners[event]) eventListeners[event] = [];
        eventListeners[event].push(cb);
      }),
      removeEventListener: vi.fn((event: string, cb: Function) => {
        if (eventListeners[event]) {
          eventListeners[event] = eventListeners[event].filter((fn) => fn !== cb);
        }
      }),
      dispatchEvent: vi.fn((event: Event) => {
        const listeners = eventListeners[event.type] || [];
        listeners.forEach((cb) => cb(event));
        return true;
      }),
    };

    manager = new WalletManager();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const dispatchAnnouncement = (detail: EIP6963ProviderDetail) => {
    const listeners = eventListeners['eip6963:announceProvider'] || [];
    listeners.forEach((cb) => cb({ type: 'eip6963:announceProvider', detail }));
  };

  it('filters detected providers strictly to MetaMask, OKX Wallet, and Rabby', () => {
    const metaMaskProvider: EIP6963ProviderDetail = {
      info: {
        uuid: 'meta-uuid-1',
        name: 'MetaMask',
        icon: 'data:image/svg+xml;base64,...',
        rdns: 'io.metamask',
      },
      provider: { request: vi.fn() },
    };

    const okxProvider: EIP6963ProviderDetail = {
      info: {
        uuid: 'okx-uuid-2',
        name: 'OKX Wallet',
        icon: 'data:image/svg+xml;base64,...',
        rdns: 'com.okx.wallet',
      },
      provider: { request: vi.fn() },
    };

    const rabbyProvider: EIP6963ProviderDetail = {
      info: {
        uuid: 'rabby-uuid-3',
        name: 'Rabby Wallet',
        icon: 'data:image/svg+xml;base64,...',
        rdns: 'io.rabby',
      },
      provider: { request: vi.fn() },
    };

    const unsupportedProvider: EIP6963ProviderDetail = {
      info: {
        uuid: 'other-uuid-4',
        name: 'Generic Wallet',
        icon: 'data:image/svg+xml;base64,...',
        rdns: 'com.generic.wallet',
      },
      provider: { request: vi.fn() },
    };

    dispatchAnnouncement(metaMaskProvider);
    dispatchAnnouncement(okxProvider);
    dispatchAnnouncement(rabbyProvider);
    dispatchAnnouncement(unsupportedProvider);

    const detected = manager.getDetectedWallets();

    expect(detected.length).toBe(3);
    const brands = detected.map((w) => w.brand);
    expect(brands).toContain('MetaMask');
    expect(brands).toContain('OKX Wallet');
    expect(brands).toContain('Rabby');
    expect(brands).not.toContain('Generic Wallet');
  });

  it('deduplicates providers by both UUID and object reference', () => {
    const mockProviderObj = { request: vi.fn() };
    const metaMaskProvider1: EIP6963ProviderDetail = {
      info: {
        uuid: 'meta-uuid-duplicate',
        name: 'MetaMask',
        icon: 'icon-data',
        rdns: 'io.metamask',
      },
      provider: mockProviderObj,
    };

    const metaMaskProvider2: EIP6963ProviderDetail = {
      info: {
        uuid: 'meta-uuid-duplicate-2',
        name: 'MetaMask',
        icon: 'icon-data',
        rdns: 'io.metamask',
      },
      provider: mockProviderObj, // Same provider object reference
    };

    dispatchAnnouncement(metaMaskProvider1);
    dispatchAnnouncement(metaMaskProvider1); // Duplicate UUID
    dispatchAnnouncement(metaMaskProvider2); // Duplicate reference

    const detected = manager.getDetectedWallets();
    expect(detected.length).toBe(1);
  });

  it('enforces post-add chain switching (wallet_switchEthereumChain) when chain mismatch occurs', async () => {
    let currentChainHex = '0x1'; // Initial chain is Ethereum Mainnet (1)

    const mockRequest = vi.fn().mockImplementation(async ({ method, params }) => {
      if (method === 'eth_requestAccounts') {
        return ['0x1234567890123456789012345678901234567890'];
      }
      if (method === 'eth_chainId') {
        return currentChainHex;
      }
      if (method === 'wallet_switchEthereumChain') {
        currentChainHex = params[0].chainId;
        return null;
      }
      if (method === 'wallet_addEthereumChain') {
        currentChainHex = params[0].chainId;
        return null;
      }
      return null;
    });

    const mockProvider = {
      request: mockRequest,
      on: vi.fn(),
      removeListener: vi.fn(),
    };

    dispatchAnnouncement({
      info: { uuid: 'meta-switch-test', name: 'MetaMask', icon: 'icon', rdns: 'io.metamask' },
      provider: mockProvider,
    });

    const connected = await manager.connectWallet(manager.getDetectedWallets()[0]);

    // Verify chain switch was invoked to switch to 61999 (0xf22f)
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0xf22f' }],
      })
    );
    expect(connected.chainId).toBe(61999);
  });

  it('cleans up provider event listeners on disconnect and switch', async () => {
    const removeListenerMock = vi.fn();
    const onMock = vi.fn();

    const mockProvider = {
      request: vi.fn().mockImplementation(async ({ method }) => {
        if (method === 'eth_requestAccounts') return ['0x1111111111111111111111111111111111111111'];
        if (method === 'eth_chainId') return '0xf22f';
        return null;
      }),
      on: onMock,
      removeListener: removeListenerMock,
    };

    dispatchAnnouncement({
      info: { uuid: 'u-cleanup', name: 'MetaMask', icon: 'i', rdns: 'io.metamask' },
      provider: mockProvider,
    });

    await manager.connectWallet(manager.getDetectedWallets()[0]);
    expect(onMock).toHaveBeenCalledWith('accountsChanged', expect.any(Function));
    expect(onMock).toHaveBeenCalledWith('chainChanged', expect.any(Function));

    manager.disconnect();
    expect(removeListenerMock).toHaveBeenCalledWith('accountsChanged', expect.any(Function));
    expect(removeListenerMock).toHaveBeenCalledWith('chainChanged', expect.any(Function));
    expect(manager.getActiveWallet()).toBeNull();
  });
});

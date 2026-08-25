import { useEffect, useState } from 'react';
import { ConnectedWallet } from '../types';
import { walletManager } from './walletManager';

export function useActiveWallet(): ConnectedWallet | null {
  const [wallet, setWallet] = useState<ConnectedWallet | null>(walletManager.getActiveWallet());

  useEffect(() => walletManager.subscribe(() => setWallet(walletManager.getActiveWallet())), []);

  return wallet;
}

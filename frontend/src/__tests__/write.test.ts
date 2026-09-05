import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { WriteManager } from '../services/writeManager';
import { rpcClient } from '../services/rpcClient';
import { ConnectedWallet } from '../types';
import { setTestConfig } from '../config';

const { mockDedicatedWriteContract, mockSharedWriteContract, mockCreateClient } = vi.hoisted(() => {
  const mockDedicatedWriteContract = vi.fn();
  const mockSharedWriteContract = vi.fn();
  const mockCreateClient = vi.fn((opts?: any) => {
    if (opts?.account) {
      return {
        writeContract: mockDedicatedWriteContract,
        readContract: vi.fn(),
        getTransactionReceipt: vi.fn(),
      };
    }
    return {
      writeContract: mockSharedWriteContract,
      readContract: vi.fn(),
      getTransactionReceipt: vi.fn(),
    };
  });
  return { mockDedicatedWriteContract, mockSharedWriteContract, mockCreateClient };
});

vi.mock('genlayer-js', () => {
  return {
    createClient: (...args: any[]) => mockCreateClient(...args),
    custom: vi.fn((provider: unknown) => ({ type: 'custom', provider })),
  };
});

describe('WriteManager (Routing, Fail-Closed Storage, Receipt Classifier & Readback)', () => {
  let writeMgr: WriteManager;
  let mockStorage: Record<string, string>;

  const mockMetaMaskWallet: ConnectedWallet = {
    address: '0x1111111111111111111111111111111111111111',
    chainId: 61999,
    provider: { name: 'MetaMaskProvider' } as any,
    brand: 'MetaMask',
  };

  const mockOKXWallet: ConnectedWallet = {
    address: '0x2222222222222222222222222222222222222222',
    chainId: 61999,
    provider: { name: 'OKXProvider' } as any,
    brand: 'OKX Wallet',
  };

  const mockRabbyWallet: ConnectedWallet = {
    address: '0x3333333333333333333333333333333333333333',
    chainId: 61999,
    provider: { name: 'RabbyProvider' } as any,
    brand: 'Rabby',
  };

  beforeEach(() => {
    setTestConfig({
      isConfigured: true,
      contractAddress: '0x8888888888888888888888888888888888888888',
      chainId: 61999,
    });

    mockStorage = {};
    const mockStorageObj = {
      getItem: vi.fn((k: string) => mockStorage[k] || null),
      setItem: vi.fn((k: string, v: string) => {
        mockStorage[k] = v;
      }),
      removeItem: vi.fn((k: string) => {
        delete mockStorage[k];
      }),
    };

    (globalThis as any).localStorage = mockStorageObj;
    (globalThis as any).window = {
      localStorage: mockStorageObj,
    };

    mockDedicatedWriteContract.mockReset();
    mockDedicatedWriteContract.mockResolvedValue('0xded_tx_hash_123');

    mockSharedWriteContract.mockReset();
    mockSharedWriteContract.mockResolvedValue('0xshared_tx_hash_456');

    mockCreateClient.mockClear();

    writeMgr = new WriteManager();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. Dedicated Provider Write Routing Ledgers (Blocker 2)
  // -------------------------------------------------------------------------
  describe('Dedicated Provider Write Routing Ledgers (MetaMask, OKX, Rabby)', () => {
    it.each([
      ['MetaMask', mockMetaMaskWallet],
      ['OKX Wallet', mockOKXWallet],
      ['Rabby', mockRabbyWallet],
    ])('routes write strictly through dedicated write client for %s with 0 writes on read client', async (brand, wallet) => {
      const rawSharedReadClient = rpcClient.getRawClient();
      const sharedWriteSpy = vi.spyOn(rawSharedReadClient, 'writeContract');
      vi.spyOn(rawSharedReadClient, 'getTransactionReceipt').mockResolvedValue({
        status: 'FINALIZED',
        execution_result: { status: 'SUCCESS' },
      } as any);

      const mockReadback = vi.fn().mockResolvedValue({ id: 'trg-0001' });

      const result = await writeMgr.executeWrite(
        wallet,
        'create_trigger',
        ['nonce-1', 'CUSR0000SA0', '2024', 'M05', 'GE', '314.069'],
        mockReadback
      );

      expect(result.success).toBe(true);
      expect(result.hash).toBe('0xded_tx_hash_123');

      // Verify dedicated write client was constructed with wallet provider and address
      expect(mockCreateClient).toHaveBeenCalledWith(
        expect.objectContaining({
          account: wallet.address,
        })
      );

      // Verify dedicated write contract was called with exact method and args
      expect(mockDedicatedWriteContract).toHaveBeenCalledWith({
        address: '0x8888888888888888888888888888888888888888',
        functionName: 'create_trigger',
        args: ['nonce-1', 'CUSR0000SA0', '2024', 'M05', 'GE', '314.069'],
        value: 0n,
      });

      // Strict verification: shared read client writeContract call ledger MUST remain strictly 0
      expect(sharedWriteSpy).toHaveBeenCalledTimes(0);
      expect(mockSharedWriteContract).toHaveBeenCalledTimes(0);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Fail-Closed Storage Probing & Intent Journaling (Blocker 3)
  // -------------------------------------------------------------------------
  describe('Fail-Closed Storage Probing & Journaling', () => {
    it('returns true when localStorage passes set/get/remove probe', () => {
      expect(writeMgr.probeStorage()).toBe(true);
    });

    it('fails closed and prevents signing if localStorage is disabled or throws', async () => {
      (globalThis as any).window.localStorage.setItem = vi.fn(() => {
        throw new Error('QuotaExceededError');
      });

      expect(writeMgr.probeStorage()).toBe(false);

      await expect(
        writeMgr.executeWrite(mockMetaMaskWallet, 'create_trigger', [], async () => ({}))
      ).rejects.toThrow('Fail-closed: Local storage is unavailable');

      // Signing should never have been attempted
      expect(mockDedicatedWriteContract).toHaveBeenCalledTimes(0);
    });

    it('fails closed if localStorage getItem returns mismatched corrupted data', async () => {
      (globalThis as any).window.localStorage.getItem = vi.fn(() => 'corrupted_val');

      expect(writeMgr.probeStorage()).toBe(false);

      await expect(
        writeMgr.executeWrite(mockMetaMaskWallet, 'create_trigger', [], async () => ({}))
      ).rejects.toThrow('Fail-closed: Local storage is unavailable');

      expect(mockDedicatedWriteContract).toHaveBeenCalledTimes(0);
    });

    it('rejects identical duplicate intent while first transaction is in flight', async () => {
      const rawSharedReadClient = rpcClient.getRawClient();
      vi.spyOn(rawSharedReadClient, 'getTransactionReceipt').mockImplementation(
        () => new Promise((res) => setTimeout(() => res({ status: 'FINALIZED', execution_result: { status: 'SUCCESS' } } as any), 100))
      );

      const p1 = writeMgr.executeWrite(
        mockMetaMaskWallet,
        'freeze_trigger',
        ['trg-0001'],
        async () => ({ id: 'trg-0001' })
      );

      // Attempt second submission with same intent
      await expect(
        writeMgr.executeWrite(mockMetaMaskWallet, 'freeze_trigger', ['trg-0001'], async () => ({}))
      ).rejects.toThrow('Another transaction is currently in flight');

      await p1;
    });
  });

  // -------------------------------------------------------------------------
  // 3. Receipt Classifier Envelopes (Blocker 4)
  // -------------------------------------------------------------------------
  describe('Receipt Classifier (4 Envelopes)', () => {
    it('classifies NON_TERMINAL receipts (UNDETERMINED, PROPOSED, PENDING, null)', () => {
      expect(writeMgr.classifyReceipt(null)).toEqual({
        type: 'NON_TERMINAL',
        status: 'NULL_OR_PENDING',
      });
      expect(writeMgr.classifyReceipt({ status: 'UNDETERMINED' })).toEqual({
        type: 'NON_TERMINAL',
        status: 'UNDETERMINED',
      });
      expect(writeMgr.classifyReceipt({ status: 'PROPOSED' })).toEqual({
        type: 'NON_TERMINAL',
        status: 'PROPOSED',
      });
      expect(writeMgr.classifyReceipt({ status: 'PENDING' })).toEqual({
        type: 'NON_TERMINAL',
        status: 'PENDING',
      });
    });

    it('classifies FINALIZED_SUCCESS receipts', () => {
      const res = writeMgr.classifyReceipt({
        status: 'FINALIZED',
        execution_result: { status: 'SUCCESS', result: 'trg-0001' },
      });
      expect(res).toEqual({
        type: 'FINALIZED_SUCCESS',
        result: 'trg-0001',
      });
    });

    it('classifies FINALIZED_FAILURE receipts from execution_result or error status', () => {
      const res1 = writeMgr.classifyReceipt({
        status: 'FINALIZED',
        execution_result: { status: 'ERROR', error: 'Execution reverted: series not allowlisted' },
      });
      expect(res1).toEqual({
        type: 'FINALIZED_FAILURE',
        error: 'Execution reverted: series not allowlisted',
      });

      const res2 = writeMgr.classifyReceipt({
        status: 'REJECTED',
        error: 'Validator consensus rejected',
      });
      expect(res2).toEqual({
        type: 'FINALIZED_FAILURE',
        error: 'Validator consensus rejected',
      });
    });

    it('classifies TERMINAL_AMBIGUOUS receipts when receipt structure is unrecognized', () => {
      const ambiguousReceipt = {
        status: 'FINALIZED',
        execution_result: { status: 'UNEXPECTED_STATUS' },
      };
      const res = writeMgr.classifyReceipt(ambiguousReceipt);
      expect(res).toEqual({
        type: 'TERMINAL_AMBIGUOUS',
        rawReceipt: ambiguousReceipt,
      });
    });
  });

  // -------------------------------------------------------------------------
  // 4. Lifecycle Stages & Authoritative Readback
  // -------------------------------------------------------------------------
  describe('Lifecycle Stages & Authoritative Readback', () => {
    it('executes the public lifecycle through finality, execution, readback and success', async () => {
      const rawSharedReadClient = rpcClient.getRawClient();
      vi.spyOn(rawSharedReadClient, 'getTransactionReceipt').mockResolvedValue({
        status: 'FINALIZED',
        execution_result: { status: 'SUCCESS' },
      } as any);

      const stages: string[] = [];
      writeMgr.subscribe(() => {
        stages.push(writeMgr.getStage());
      });

      const mockReadback = vi.fn().mockResolvedValue({ id: 'trg-0001', state: 'FROZEN' });

      const result = await writeMgr.executeWrite(
        mockMetaMaskWallet,
        'freeze_trigger',
        ['trg-0001'],
        mockReadback
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: 'trg-0001', state: 'FROZEN' });
      expect(stages).toEqual([
        'WAITING_FOR_WALLET',
        'SUBMITTED',
        'WAITING_FOR_FINALITY',
        'VERIFYING_EXECUTION',
        'VERIFYING_READBACK',
        'SUCCESS',
      ]);
    });

    it('handles execution failure during signing stage and updates state to FAILED', async () => {
      mockDedicatedWriteContract.mockRejectedValue(new Error('User rejected signature in wallet'));

      const result = await writeMgr.executeWrite(
        mockMetaMaskWallet,
        'freeze_trigger',
        ['trg-0001'],
        async () => null
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('User rejected signature in wallet');
      expect(writeMgr.getStage()).toBe('REJECTED');
    });

    it('keeps receipt-success journal items pending until method-specific readback proves state', async () => {
      mockStorage['ostr_tx_journal_v1'] = JSON.stringify([
        {
          intentId: 'i-1',
          account: mockMetaMaskWallet.address,
          chainId: 61999,
          contractAddress: '0x8888888888888888888888888888888888888888',
          method: 'create_trigger',
          args: [],
          createdAt: Date.now(),
          hash: '0xpendinghash',
          status: 'PENDING',
        },
      ]);

      const rawSharedReadClient = rpcClient.getRawClient();
      vi.spyOn(rawSharedReadClient, 'getTransactionReceipt').mockResolvedValue({
        status: 'FINALIZED',
        execution_result: { status: 'SUCCESS' },
      } as any);

      await writeMgr.reconcileJournal();

      const journal = JSON.parse(mockStorage['ostr_tx_journal_v1']);
      expect(journal[0].status).toBe('PENDING');
    });

    it('does not report success when method-specific readback rejects the observed state', async () => {
      const rawSharedReadClient = rpcClient.getRawClient();
      vi.spyOn(rawSharedReadClient, 'getTransactionReceipt').mockResolvedValue({
        status: 'FINALIZED',
        execution_result: { status: 'SUCCESS' },
      } as any);

      const result = await writeMgr.executeWrite(
        mockMetaMaskWallet,
        'freeze_trigger',
        ['trg-0001'],
        async () => ({ id: 'trg-0001', state: 'DRAFT' }),
        (readback) => readback.state === 'FROZEN'
      );

      expect(result.success).toBe(false);
      expect(result.hash).toBe('0xded_tx_hash_123');
      expect(writeMgr.getStage()).toBe('RECONCILIATION_REQUIRED');
      expect(JSON.parse(mockStorage['ostr_tx_journal_v1'])[0].status).toBe('PENDING');
    });

    it('blocks signing when a malformed persisted journal cannot be parsed', async () => {
      mockStorage['ostr_tx_journal_v1'] = '{not-json';

      await expect(
        writeMgr.executeWrite(mockMetaMaskWallet, 'freeze_trigger', ['trg-0001'], async () => ({}))
      ).rejects.toThrow();
      expect(mockDedicatedWriteContract).toHaveBeenCalledTimes(0);
    });

    it('retains an unresolved transaction hash and exposes manual reconciliation without submitting again', async () => {
      mockStorage['ostr_tx_journal_v1'] = JSON.stringify([{
        intentId: 'recover-pending', account: mockMetaMaskWallet.address, chainId: 61999,
        contractAddress: '0x8888888888888888888888888888888888888888', method: 'freeze_trigger',
        args: ['trg-0001'], createdAt: Date.now(), hash: '0xpendinghash', status: 'PENDING',
      }]);
      vi.spyOn(rpcClient.getRawClient(), 'getTransactionReceipt').mockResolvedValue({ status: 'PENDING' } as any);

      const result = await writeMgr.continueVerification();

      expect(result.success).toBe(false);
      expect(result.hash).toBe('0xpendinghash');
      expect(writeMgr.getStage()).toBe('RECONCILIATION_REQUIRED');
      expect(writeMgr.getHash()).toBe('0xpendinghash');
      expect(JSON.parse(mockStorage['ostr_tx_journal_v1'])[0].status).toBe('PENDING');
      expect(mockDedicatedWriteContract).not.toHaveBeenCalled();
    });

    it('continues a finalized Draft freeze from its saved hash and refreshes authoritative state', async () => {
      mockStorage['ostr_tx_journal_v1'] = JSON.stringify([{
        intentId: 'recover-success', account: mockMetaMaskWallet.address, chainId: 61999,
        contractAddress: '0x8888888888888888888888888888888888888888', method: 'freeze_trigger',
        args: ['trg-0001'], createdAt: Date.now(), hash: '0xfinalizedhash', status: 'PENDING',
      }]);
      vi.spyOn(rpcClient.getRawClient(), 'getTransactionReceipt').mockResolvedValue({
        statusName: 'FINALIZED', txExecutionResultName: 'FINISHED_WITH_RETURN',
      } as any);
      const invalidate = vi.spyOn(rpcClient, 'invalidateCache');
      vi.spyOn(rpcClient, 'readContract').mockResolvedValue(JSON.stringify({ id: 'trg-0001', state: 'FROZEN' }));

      const result = await writeMgr.continueVerification();

      expect(result.success).toBe(true);
      expect(writeMgr.getStage()).toBe('SUCCESS');
      expect(invalidate).toHaveBeenCalledOnce();
      expect(JSON.parse(mockStorage['ostr_tx_journal_v1'])[0].status).toBe('RECONCILED');
      expect(mockDedicatedWriteContract).not.toHaveBeenCalled();
    });

    it('records finalized failure, releases the pending block, and permits one deliberate retry', async () => {
      mockStorage['ostr_tx_journal_v1'] = JSON.stringify([{
        intentId: 'recover-failed', account: mockMetaMaskWallet.address, chainId: 61999,
        contractAddress: '0x8888888888888888888888888888888888888888', method: 'freeze_trigger',
        args: ['trg-0001'], createdAt: Date.now(), hash: '0xfailedhash', status: 'PENDING',
      }]);
      const receipt = vi.spyOn(rpcClient.getRawClient(), 'getTransactionReceipt');
      receipt.mockResolvedValueOnce({ status: 'FINALIZED', execution_result: { status: 'ERROR', error: 'reverted' } } as any)
        .mockResolvedValueOnce({ status: 'FINALIZED', execution_result: { status: 'SUCCESS' } } as any);

      const failed = await writeMgr.continueVerification();
      expect(failed.success).toBe(false);
      expect(writeMgr.getStage()).toBe('FAILED');
      expect(JSON.parse(mockStorage['ostr_tx_journal_v1'])[0].status).toBe('FAILED');

      const retried = await writeMgr.executeWrite(
        mockMetaMaskWallet, 'freeze_trigger', ['trg-0001'],
        async () => ({ id: 'trg-0001', state: 'FROZEN' }),
        (value) => value.state === 'FROZEN',
      );
      expect(retried.success).toBe(true);
      expect(mockDedicatedWriteContract).toHaveBeenCalledOnce();
    });

    it('turns a bounded polling timeout into reconciliation required while retaining the hash', async () => {
      vi.useFakeTimers();
      vi.spyOn(rpcClient.getRawClient(), 'getTransactionReceipt').mockResolvedValue({ status: 'PENDING' } as any);
      const resultPromise = writeMgr.executeWrite(
        mockMetaMaskWallet, 'freeze_trigger', ['trg-0001'], async () => null,
      );
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000 + 20_000);
      const result = await resultPromise;
      expect(result.success).toBe(false);
      expect(result.hash).toBe('0xded_tx_hash_123');
      expect(writeMgr.getStage()).toBe('RECONCILIATION_REQUIRED');
      expect(JSON.parse(mockStorage['ostr_tx_journal_v1'])[0].status).toBe('PENDING');
      vi.useRealTimers();
    });
  });
});

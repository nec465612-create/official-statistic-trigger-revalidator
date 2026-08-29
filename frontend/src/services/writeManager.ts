import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { ConnectedWallet, TxIntent, TxJournalEntry, TxStage, WriteResult } from '../types';
import { appConfig } from '../config';
import { rpcClient } from './rpcClient';

const JOURNAL_STORAGE_KEY = 'ostr_tx_journal_v1';

export type ReceiptClassification =
  | { type: 'NON_TERMINAL'; status: string }
  | { type: 'FINALIZED_SUCCESS'; result?: unknown }
  | { type: 'FINALIZED_FAILURE'; error: string }
  | { type: 'TERMINAL_AMBIGUOUS'; rawReceipt: unknown };

export class WriteManager {
  private currentStage: TxStage = 'IDLE';
  private currentHash: string | null = null;
  private currentError: string | null = null;
  private listeners: Array<() => void> = [];
  private isProcessing = false;
  private volatilePendingLocks = new Set<string>();
  private readonly ready: Promise<void>;

  constructor() {
    this.ready = this.reconcileJournal();
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

  public getStage(): TxStage {
    return this.currentStage;
  }

  public getHash(): string | null {
    return this.currentHash;
  }

  public getError(): string | null {
    return this.currentError;
  }

  public resetState(): void {
    if (!this.isProcessing) {
      this.currentStage = 'IDLE';
      this.currentHash = null;
      this.currentError = null;
      this.notify();
    }
  }

  public probeStorage(): boolean {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return false;
      const testKey = '__ostr_storage_probe__';
      window.localStorage.setItem(testKey, 'probe_val');
      const val = window.localStorage.getItem(testKey);
      window.localStorage.removeItem(testKey);
      return val === 'probe_val';
    } catch {
      return false;
    }
  }

  private loadJournal(): TxJournalEntry[] {
    if (!this.probeStorage()) throw new Error('Fail-closed: Local storage is unavailable.');
    const raw = window.localStorage.getItem(JOURNAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('Fail-closed: Transaction journal is malformed.');
    return parsed as TxJournalEntry[];
  }

  private saveJournal(entries: TxJournalEntry[]): boolean {
    if (!this.probeStorage()) return false;
    try {
      window.localStorage.setItem(JOURNAL_STORAGE_KEY, JSON.stringify(entries.slice(-20)));
      return true;
    } catch {
      return false;
    }
  }

  public async reconcileJournal(): Promise<void> {
    let journal: TxJournalEntry[];
    try {
      journal = this.loadJournal();
    } catch {
      return;
    }
    const pending = journal.filter((e) => e.status === 'PENDING' && e.hash);
    if (pending.length === 0) return;

    for (const entry of pending) {
      try {
        const rawClient = rpcClient.getRawClient();
        const receipt = await rawClient.getTransactionReceipt({
          hash: entry.hash as `0x${string}`,
        });

        const classified = this.classifyReceipt(receipt);
        if (classified.type === 'FINALIZED_FAILURE') {
          entry.status = 'FAILED';
          entry.error = classified.error;
        }
      } catch {
        // Leave pending for subsequent reconciliation
      }
    }
    this.saveJournal(journal);
  }

  public classifyReceipt(receipt: unknown): ReceiptClassification {
    if (!receipt || typeof receipt !== 'object') {
      return { type: 'NON_TERMINAL', status: 'NULL_OR_PENDING' };
    }

    const r = receipt as {
      status?: string;
      execution_result?: { status?: string; error?: string; result?: unknown };
      error?: string;
    };

    const status = (r.status || '').toUpperCase();

    if (status === 'UNDETERMINED' || status === 'PROPOSED' || status === 'PENDING' || status === '') {
      return { type: 'NON_TERMINAL', status: status || 'PENDING' };
    }

    if (status === 'FINALIZED') {
      const execStatus = (r.execution_result?.status || '').toUpperCase();
      if (execStatus === 'SUCCESS') {
        return { type: 'FINALIZED_SUCCESS', result: r.execution_result?.result };
      }
      if (execStatus === 'ERROR' || execStatus === 'FAILED') {
        const execErr = r.execution_result?.error || r.error || 'Transaction finalized with execution error';
        return { type: 'FINALIZED_FAILURE', error: execErr };
      }
      // If status is FINALIZED without execution_result or unrecognized status, mark as AMBIGUOUS
      return { type: 'TERMINAL_AMBIGUOUS', rawReceipt: receipt };
    }

    if (status === 'REJECTED' || status === 'FAILED' || status === 'ERROR') {
      return { type: 'FINALIZED_FAILURE', error: r.error || `Transaction failed with status ${status}` };
    }

    return { type: 'TERMINAL_AMBIGUOUS', rawReceipt: receipt };
  }

  public async executeWrite<T = unknown>(
    wallet: ConnectedWallet,
    method: string,
    args: unknown[],
    readbackFn: () => Promise<T>,
    verifyReadback: (data: T) => boolean = (data) => data !== undefined && data !== null
  ): Promise<WriteResult<T>> {
    await this.ready;
    // 1. Single-Flight Lock
    if (this.isProcessing) {
      throw new Error('Another transaction is currently in flight. Please wait.');
    }

    if (!appConfig.isConfigured) {
      throw new Error(appConfig.configError || 'Contract not configured.');
    }

    // 2. Fail-Closed Storage Check before intent creation
    if (!this.probeStorage()) {
      throw new Error('Fail-closed: Local storage is unavailable for transaction intent journaling.');
    }

    // 3. Prevent duplicate in-flight submission for identical intent
    const lockKey = `${wallet.address.toLowerCase()}:${wallet.chainId}:${appConfig.contractAddress.toLowerCase()}:${method}:${JSON.stringify(args)}`;
    if (this.volatilePendingLocks.has(lockKey)) {
      throw new Error('Identical transaction intent is already pending in volatile lock.');
    }

    this.isProcessing = true;
    this.volatilePendingLocks.add(lockKey);
    this.currentStage = 'PRE_SIGN';
    this.currentHash = null;
    this.currentError = null;
    this.notify();

    const intentId = `intent-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const intent: TxIntent = {
      intentId,
      account: wallet.address,
      chainId: wallet.chainId,
      contractAddress: appConfig.contractAddress,
      method,
      args,
      createdAt: Date.now(),
    };

    let journal: TxJournalEntry[];
    try {
      journal = this.loadJournal();
    } catch (error) {
      this.volatilePendingLocks.delete(lockKey);
      this.isProcessing = false;
      throw error;
    }
    const scopedPending = journal.find(
      (entry) =>
        entry.status === 'PENDING' &&
        entry.hash &&
        entry.account.toLowerCase() === wallet.address.toLowerCase() &&
        entry.chainId === wallet.chainId &&
        entry.contractAddress.toLowerCase() === appConfig.contractAddress.toLowerCase()
    );
    const existing = journal.find(
      (entry) =>
        entry.status === 'PENDING' &&
        entry.hash &&
        entry.account.toLowerCase() === wallet.address.toLowerCase() &&
        entry.chainId === wallet.chainId &&
        entry.contractAddress.toLowerCase() === appConfig.contractAddress.toLowerCase() &&
        entry.method === method &&
        JSON.stringify(entry.args) === JSON.stringify(args)
    );
    if (scopedPending && !existing) {
      this.volatilePendingLocks.delete(lockKey);
      this.isProcessing = false;
      throw new Error(`Transaction ${scopedPending.hash} is still unresolved. Reconcile that hash before submitting another write.`);
    }
    if (existing) {
      try {
        const recovered = await readbackFn();
        if (verifyReadback(recovered)) {
          existing.status = 'RECONCILED';
          existing.result = recovered;
          if (!this.saveJournal(journal)) {
            throw new Error('Recovered transaction, but journal cleanup could not be persisted. Retry remains blocked.');
          }
          this.currentStage = 'SUCCESS';
          this.currentHash = existing.hash;
          this.currentError = null;
          this.notify();
          this.volatilePendingLocks.delete(lockKey);
          this.isProcessing = false;
          return { success: true, hash: existing.hash, data: recovered };
        }
      } catch (error) {
        this.volatilePendingLocks.delete(lockKey);
        this.isProcessing = false;
        throw error;
      }
      this.volatilePendingLocks.delete(lockKey);
      this.isProcessing = false;
      throw new Error(`Transaction ${existing.hash} is still unresolved. Reconcile that hash before retrying.`);
    }
    const journalEntry: TxJournalEntry = {
      ...intent,
      hash: '',
      status: 'PENDING',
    };
    journal.push(journalEntry);
    const saved = this.saveJournal(journal);
    if (!saved) {
      this.volatilePendingLocks.delete(lockKey);
      this.isProcessing = false;
      throw new Error('Fail-closed: Failed to persist transaction intent to journal before signing.');
    }

    let hashExists = false;
    let confirmedFailure = false;
    let releaseLock = true;
    try {
      this.currentStage = 'SIGNING';
      this.notify();

      // 4. Dedicated Provider Write Routing (Blocker 2)
      // Instantiate write client bound strictly to wallet.provider and wallet.address
      const writeClient = createClient({
        chain: studionet,
        provider: wallet.provider as any,
        account: wallet.address as `0x${string}`,
      });

      // Submit transaction exclusively via dedicated write client
      const hash = await writeClient.writeContract({
        address: appConfig.contractAddress as `0x${string}`,
        functionName: method,
        args: args as any,
        value: 0n,
      });

      this.currentHash = hash;
      hashExists = true;
      releaseLock = false;
      this.currentStage = 'SUBMITTED';
      journalEntry.hash = hash;
      if (!this.saveJournal(journal)) {
        throw new Error(`Transaction ${hash} was submitted, but its journal could not be persisted. Retry is blocked; reconcile this hash.`);
      }
      this.notify();

      // 5. Polling for Finalization via Receipt Classifier (Blocker 4)
      this.currentStage = 'FINALIZING';
      this.notify();

      const pollResult = await this.pollFinalization(hash);

      // 6. Authoritative Readback & Expected State Validation
      this.currentStage = 'READBACK';
      this.notify();

      // Invalidate read cache so fresh state is read
      rpcClient.invalidateCache();

      let readbackData: T | undefined;
      for (let attempt = 1; attempt <= 4; attempt++) {
        try {
          readbackData = await readbackFn();
          if (readbackData !== undefined && readbackData !== null && verifyReadback(readbackData)) {
            break;
          }
        } catch (readbackErr: unknown) {
          if (attempt === 4) {
            if (pollResult.type === 'TERMINAL_AMBIGUOUS') {
              throw new Error('Transaction returned ambiguous terminal state and authoritative readback failed.');
            }
            throw new Error('Authoritative readback failed after transaction finalization.');
          }
          await new Promise((res) => setTimeout(res, 1200));
        }
      }

      if (readbackData === undefined || readbackData === null || !verifyReadback(readbackData)) {
        throw new Error(`Transaction ${hash} finalized, but authoritative readback does not prove the expected state.`);
      }

      this.currentStage = 'SUCCESS';
      journalEntry.status = 'FINALIZED';
      journalEntry.result = readbackData;
      const cleanupSaved = this.saveJournal(journal);
      releaseLock = cleanupSaved;
      this.notify();

      return {
        success: true,
        hash,
        data: readbackData,
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      confirmedFailure = errMsg.includes('Transaction FINALIZED with error:');
      this.currentStage = hashExists && !confirmedFailure ? 'READBACK' : 'FAILED';
      this.currentError = errMsg;
      journalEntry.status = hashExists && !confirmedFailure ? 'PENDING' : 'FAILED';
      journalEntry.error = errMsg;
      const errorSaved = this.saveJournal(journal);
      releaseLock = !hashExists || confirmedFailure ? errorSaved : false;
      this.notify();

      return {
        success: false,
        hash: this.currentHash || undefined,
        error: errMsg,
      };
    } finally {
      if (releaseLock) this.volatilePendingLocks.delete(lockKey);
      this.isProcessing = false;
    }
  }

  private async pollFinalization(hash: string): Promise<ReceiptClassification> {
    const rawClient = rpcClient.getRawClient();
    const startTime = Date.now();
    const deadline = 10 * 60 * 1000; // 10 minutes max
    let delay = 2500;

    while (Date.now() - startTime < deadline) {
      // Pause polling if browser tab is hidden to save RPC requests
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        await new Promise((res) => setTimeout(res, 1000));
        continue;
      }

      try {
        const receipt = await rawClient.getTransactionReceipt({
          hash: hash as `0x${string}`,
        });

        const classified = this.classifyReceipt(receipt);
        if (classified.type === 'FINALIZED_SUCCESS') {
          return classified;
        }
        if (classified.type === 'FINALIZED_FAILURE') {
          throw new Error(`Transaction FINALIZED with error: ${classified.error}`);
        }
        if (classified.type === 'TERMINAL_AMBIGUOUS') {
          return classified; // Let authoritative readback resolve ambiguous state
        }
      } catch (pollErr: unknown) {
        const pMsg = pollErr instanceof Error ? pollErr.message : String(pollErr);
        if (pMsg.includes('FINALIZED with error')) {
          throw pollErr;
        }
      }

      await new Promise((res) => setTimeout(res, delay));
      delay = Math.min(delay * 1.35, 10_000);
    }

    throw new Error('Transaction consensus timed out after 10 minutes.');
  }
}

export const writeManager = new WriteManager();

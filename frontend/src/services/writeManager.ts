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

  public async continueVerification(): Promise<WriteResult> {
    await this.ready;
    if (this.isProcessing) throw new Error('Transaction reconciliation is already running.');
    const journal = this.loadJournal();
    const entry = journal.find((item) => item.status === 'PENDING' && item.hash);
    if (!entry) throw new Error('No transaction is waiting for reconciliation.');
    this.isProcessing = true;
    this.currentHash = entry.hash;
    this.currentError = null;
    try {
      return await this.reconcileEntry(entry, journal);
    } finally {
      this.isProcessing = false;
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

    const entry = pending[0];
    this.currentHash = entry.hash;
    await this.reconcileEntry(entry, journal);
  }

  private async reconcileEntry(entry: TxJournalEntry, journal: TxJournalEntry[]): Promise<WriteResult> {
    this.currentStage = 'WAITING_FOR_FINALITY';
    this.notify();
    try {
      const transaction = await rpcClient.getRawClient().getTransaction({ hash: entry.hash as any });
      const classified = this.classifyTransaction(transaction);
      if (classified.type === 'NON_TERMINAL' || classified.type === 'TERMINAL_AMBIGUOUS') {
        throw new Error('The transaction is not yet conclusively finalized. Continue verification later.');
      }
      this.currentStage = 'VERIFYING_EXECUTION';
      this.notify();
      if (classified.type === 'FINALIZED_FAILURE') {
        entry.status = 'FAILED';
        entry.error = classified.error;
        if (!this.saveJournal(journal)) throw new Error('Final failure was found, but journal cleanup could not be persisted.');
        this.currentStage = 'FAILED';
        this.currentError = classified.error;
        this.notify();
        return { success: false, hash: entry.hash, error: classified.error };
      }

      this.currentStage = 'VERIFYING_READBACK';
      this.notify();
      rpcClient.invalidateCache();
      const data = await this.readbackJournalEntry(entry);
      entry.status = 'RECONCILED';
      entry.result = data;
      entry.error = undefined;
      if (!this.saveJournal(journal)) throw new Error('Verification succeeded, but journal cleanup could not be persisted.');
      this.currentStage = 'SUCCESS';
      this.currentError = null;
      this.notify();
      return { success: true, hash: entry.hash, data };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      if (entry.status !== 'FAILED') {
        entry.status = 'PENDING';
        entry.error = message;
        this.saveJournal(journal);
        this.currentStage = 'RECONCILIATION_REQUIRED';
      }
      this.currentError = message;
      this.notify();
      return { success: false, hash: entry.hash, error: message };
    }
  }

  public async readCreatedTrigger(account: string, nonce: string): Promise<Record<string, unknown> | null> {
    const count = Number(await rpcClient.readContract<number>('get_trigger_count', [], true));
    const pageSize = 20;
    const offset = Math.max(0, count - pageSize);
    const rawPage = await rpcClient.readContract<string>('get_triggers_page', [offset, pageSize], true);
    const page = rawPage ? JSON.parse(rawPage) as Array<{ id?: string; owner?: string; client_nonce?: string }> : [];
    const matched = page.find((trigger) =>
      trigger.client_nonce === nonce && trigger.owner?.toLowerCase() === account.toLowerCase()
    );
    if (!matched?.id) return null;
    const raw = await rpcClient.readContract<string>('get_trigger', [matched.id], true);
    return raw ? JSON.parse(raw) as Record<string, unknown> : null;
  }

  private async readbackJournalEntry(entry: TxJournalEntry): Promise<unknown> {
    if (entry.method === 'create_trigger') {
      const nonce = String(entry.args[0] ?? '');
      // owner_nonces is keyed by the contract's checksum-cased sender string,
      // while EIP-1193 wallets may expose a lower-cased address. Recover from
      // the newest bounded registry page, whose rows are authoritative contract
      // state, and match the nonce plus owner case-insensitively.
      const trigger = await this.readCreatedTrigger(entry.account, nonce);
      if (!trigger || String(trigger.owner || '').toLowerCase() !== entry.account.toLowerCase() || trigger.client_nonce !== nonce) {
        throw new Error('Authoritative create-trigger readback does not match the saved intent.');
      }
      const expected = entry.args.slice(1).map(String);
      const actual = [trigger.series, trigger.year, trigger.period, trigger.operator, trigger.threshold_decimal].map(String);
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error('Authoritative create-trigger specification does not match the saved intent.');
      }
      return trigger;
    }
    if (entry.method === 'bind_consumer') {
      const namespace = String(entry.args[0] ?? '');
      const expectedTrigger = String(entry.args[1] ?? '');
      const bound = await rpcClient.readContract<string>('get_consumer_binding', [entry.account, namespace], true);
      if (bound !== expectedTrigger) throw new Error('Authoritative consumer binding does not match the saved intent.');
      return bound;
    }

    const triggerId = String(entry.args[0] ?? '');
    if (!triggerId) throw new Error('The saved transaction intent has no trigger identifier.');
    const raw = await rpcClient.readContract<string>('get_trigger', [triggerId], true);
    const trigger = raw ? JSON.parse(raw) : null;
    if (!trigger || trigger.id !== triggerId) throw new Error('The trigger is not visible in authoritative state.');
    if (entry.method === 'freeze_trigger' && trigger.state !== 'FROZEN') throw new Error('The trigger is still DRAFT; freeze was not applied.');
    if (entry.method === 'close_trigger' && trigger.state !== 'CLOSED') throw new Error('The trigger was not closed.');
    if (entry.method === 'observe_initial' && (trigger.vintage_count < 1 || ['DRAFT', 'FROZEN'].includes(trigger.state))) {
      throw new Error('Initial observation is not present in authoritative state.');
    }
    if (entry.method === 'revalidate_trigger' && ['DRAFT', 'FROZEN', 'CLOSED'].includes(trigger.state)) {
      throw new Error('Revalidation is not present in authoritative state.');
    }
    return trigger;
  }

  public classifyTransaction(transaction: unknown): ReceiptClassification {
    if (!transaction || typeof transaction !== 'object') {
      return { type: 'NON_TERMINAL', status: 'NULL_OR_PENDING' };
    }

    const r = transaction as {
      status?: string | number;
      statusName?: string;
      txExecutionResultName?: string;
      resultName?: string;
      result_name?: string;
      consensus_data?: { leader_receipt?: Array<{
        mode?: string;
        vote?: string;
        execution_result?: string;
        genvm_result?: { error_code?: string; error_description?: string };
      }> };
      execution_result?: { status?: string; error?: string; result?: unknown };
      error?: string;
    };

    const status = String(r.statusName || r.status || '').toUpperCase();

    if (status === 'UNDETERMINED' || status === 'PROPOSED' || status === 'PENDING' || status === '') {
      return { type: 'NON_TERMINAL', status: status || 'PENDING' };
    }

    if (status === 'FINALIZED') {
      const leaderReceipts = r.consensus_data?.leader_receipt || [];
      const leaderExecution = leaderReceipts.map((item) => String(item.execution_result || '').toUpperCase()).filter(Boolean);
      const actualLeader = leaderReceipts.find((item) => String(item.mode || '').toLowerCase() === 'leader');
      const actualLeaderExecution = String(actualLeader?.execution_result || '').toUpperCase();
      const consensusResult = String(r.resultName || r.result_name || '').toUpperCase();
      const execStatus = (r.txExecutionResultName || r.execution_result?.status || '').toUpperCase();
      const semanticSuccess = execStatus === 'SUCCESS' || execStatus === 'FINISHED_WITH_RETURN' ||
        (consensusResult === 'MAJORITY_AGREE' && (actualLeaderExecution === 'SUCCESS' || actualLeaderExecution === 'FINISHED_WITH_RETURN')) ||
        (leaderExecution.length > 0 && leaderExecution.every((value) => value === 'SUCCESS' || value === 'FINISHED_WITH_RETURN'));
      const semanticFailure = execStatus === 'ERROR' || execStatus === 'FAILED' || execStatus === 'FINISHED_WITH_ERROR' ||
        actualLeaderExecution === 'ERROR' || actualLeaderExecution === 'FAILED' || actualLeaderExecution === 'FINISHED_WITH_ERROR' ||
        (!actualLeader && leaderExecution.some((value) => value === 'ERROR' || value === 'FAILED' || value === 'FINISHED_WITH_ERROR'));
      if (semanticSuccess) {
        return { type: 'FINALIZED_SUCCESS', result: r.execution_result?.result };
      }
      if (semanticFailure) {
        const leaderError = leaderReceipts.find((item) => item.genvm_result?.error_description)?.genvm_result?.error_description;
        const execErr = r.execution_result?.error || leaderError || r.error || 'Transaction finalized with execution error';
        return { type: 'FINALIZED_FAILURE', error: execErr };
      }
      // If status is FINALIZED without execution_result or unrecognized status, mark as AMBIGUOUS
      return { type: 'TERMINAL_AMBIGUOUS', rawReceipt: transaction };
    }

    if (status === 'REJECTED' || status === 'FAILED' || status === 'ERROR') {
      return { type: 'FINALIZED_FAILURE', error: r.error || `Transaction failed with status ${status}` };
    }

    return { type: 'TERMINAL_AMBIGUOUS', rawReceipt: transaction };
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
    this.currentStage = 'WAITING_FOR_WALLET';
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
      const recovered = await this.reconcileEntry(existing, journal);
      this.volatilePendingLocks.delete(lockKey);
      this.isProcessing = false;
      return recovered as WriteResult<T>;
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
      this.currentStage = 'WAITING_FOR_FINALITY';
      this.notify();

      const pollResult = await this.pollFinalization(hash);

      if (pollResult.type === 'TERMINAL_AMBIGUOUS') {
        throw new Error('Transaction finalized without a recognized semantic execution result. Continue verification later.');
      }

      // 6. Authoritative Readback & Expected State Validation
      this.currentStage = 'VERIFYING_EXECUTION';
      this.notify();
      this.currentStage = 'VERIFYING_READBACK';
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
      const rejected = !hashExists && /reject|denied|declined/i.test(errMsg);
      this.currentStage = hashExists && !confirmedFailure ? 'RECONCILIATION_REQUIRED' : rejected ? 'REJECTED' : 'FAILED';
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
        const transaction = await rawClient.getTransaction({
          hash: hash as any,
        });

        const classified = this.classifyTransaction(transaction);
        if (classified.type === 'FINALIZED_SUCCESS') {
          return classified;
        }
        if (classified.type === 'FINALIZED_FAILURE') {
          throw new Error(`Transaction FINALIZED with error: ${classified.error}`);
        }
        if (classified.type === 'TERMINAL_AMBIGUOUS') {
          return classified;
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

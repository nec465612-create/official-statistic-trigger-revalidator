import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RPCClient } from '../services/rpcClient';
import { setTestConfig } from '../config';

describe('RPCClient (Budget Manager, 10s Caching & In-Flight Dedup)', () => {
  let client: RPCClient;
  let mockReadContract: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setTestConfig({
      isConfigured: true,
      contractAddress: '0x8888888888888888888888888888888888888888',
      chainId: 61999,
    });

    mockReadContract = vi.fn().mockResolvedValue('test_result_value');
    const mockGenlayerClient = {
      readContract: mockReadContract,
      writeContract: vi.fn(),
      getTransactionReceipt: vi.fn(),
    };

    client = new RPCClient(mockGenlayerClient as any);
  });

  it('serves repeated requests from 10-second cache', async () => {
    // Call 1: misses cache, calls network
    const res1 = await client.readContract<string>('get_trigger', ['trg-0001']);
    expect(res1).toBe('test_result_value');
    expect(mockReadContract).toHaveBeenCalledTimes(1);

    // Call 2: hits cache within 10 seconds, zero network calls
    const res2 = await client.readContract<string>('get_trigger', ['trg-0001']);
    expect(res2).toBe('test_result_value');
    expect(mockReadContract).toHaveBeenCalledTimes(1);

    const stats = client.getStats();
    expect(stats.totalCalls).toBe(2);
    expect(stats.cachedHits).toBe(1);
  });

  it('deduplicates simultaneous in-flight read requests, including React Strict Mode re-entry', async () => {
    let resolveNetwork: (val: any) => void;
    mockReadContract.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveNetwork = resolve;
        })
    );

    // Launch 3 simultaneous calls
    const p1 = client.readContract<number>('get_trigger_count', []);
    const p2 = client.readContract<number>('get_trigger_count', []);
    const p3 = client.readContract<number>('get_trigger_count', []);

    expect(mockReadContract).toHaveBeenCalledTimes(1);

    resolveNetwork!(5);

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    expect(r1).toBe(5);
    expect(r2).toBe(5);
    expect(r3).toBe(5);
    expect(mockReadContract).toHaveBeenCalledTimes(1);
  });

  it('purges cache when invalidateCache() is called after writes', async () => {
    await client.readContract<string>('get_trigger', ['trg-0001']);
    expect(mockReadContract).toHaveBeenCalledTimes(1);

    // Invalidate
    client.invalidateCache();

    // Next call must hit network again
    await client.readContract<string>('get_trigger', ['trg-0001']);
    expect(mockReadContract).toHaveBeenCalledTimes(2);
  });

  it('uses bounded 429 backoff and records measured budget statistics', async () => {
    vi.useFakeTimers();
    mockReadContract.mockRejectedValueOnce(new Error('429 rate limit')).mockResolvedValueOnce('recovered');
    const promise = client.readContract<string>('get_trigger', ['trg-0001']);
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe('recovered');
    expect(mockReadContract).toHaveBeenCalledTimes(2);
    expect(client.getStats().rateLimitHits).toBe(1);
    vi.useRealTimers();
  });

  it('supports abort cancellation during 429 backoff', async () => {
    vi.useFakeTimers();
    mockReadContract.mockRejectedValue(new Error('429 rate limit'));
    const controller = new AbortController();
    const promise = client.readContract<string>('get_trigger', ['trg-0001'], true, controller.signal);
    await vi.advanceTimersByTimeAsync(1);
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(mockReadContract).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

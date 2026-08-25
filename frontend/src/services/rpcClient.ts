import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { appConfig } from '../config';
import { RPCStats } from '../types';

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export class RPCClient {
  private client: ReturnType<typeof createClient>;
  private cache = new Map<string, CacheEntry<unknown>>();
  private inFlight = new Map<string, Promise<unknown>>();
  private stats: RPCStats = {
    totalCalls: 0,
    cachedHits: 0,
    dedupedCalls: 0,
    rateLimitHits: 0,
    lastCallTime: 0,
  };
  private cooldownUntil = 0;
  private readonly CACHE_TTL_MS = 10_000; // 10 seconds

  constructor(clientOverride?: any) {
    this.client = clientOverride || createClient({
      chain: studionet,
      endpoint: appConfig.rpcUrl,
    });
  }

  public getStats(): RPCStats {
    return { ...this.stats };
  }

  public resetStats(): void {
    this.stats = {
      totalCalls: 0,
      cachedHits: 0,
      dedupedCalls: 0,
      rateLimitHits: 0,
      lastCallTime: 0,
    };
  }

  public invalidateCache(): void {
    this.cache.clear();
  }

  private buildKey(method: string, args: unknown[]): string {
    return `${appConfig.chainId}:${appConfig.contractAddress}:${method}:${JSON.stringify(args)}`;
  }

  public async readContract<T = unknown>(
    method: string,
    args: unknown[] = [],
    bypassCache: boolean = false
  ): Promise<T> {
    if (!appConfig.isConfigured) {
      throw new Error(appConfig.configError || 'Contract address not configured');
    }

    this.stats.totalCalls++;
    this.stats.lastCallTime = Date.now();

    const key = this.buildKey(method, args);
    const now = Date.now();

    // Check shared 429 cooldown
    if (now < this.cooldownUntil) {
      const waitMs = this.cooldownUntil - now;
      await new Promise((res) => setTimeout(res, Math.min(waitMs, 5000)));
    }

    // Check Cache
    if (!bypassCache) {
      const cached = this.cache.get(key);
      if (cached && cached.expiresAt > now) {
        this.stats.cachedHits++;
        return cached.data as T;
      }
    }

    // Check in-flight deduplication
    if (this.inFlight.has(key)) {
      this.stats.dedupedCalls++;
      return (await this.inFlight.get(key)) as T;
    }

    // Execute new request with in-flight tracking & backoff
    const fetchPromise = this.executeWithRetry<T>(method, args);
    this.inFlight.set(key, fetchPromise as Promise<unknown>);

    try {
      const result = await fetchPromise;
      this.cache.set(key, {
        data: result,
        expiresAt: Date.now() + this.CACHE_TTL_MS,
      });
      return result;
    } finally {
      this.inFlight.delete(key);
    }
  }

  private async executeWithRetry<T>(
    method: string,
    args: unknown[],
    attempt: number = 1
  ): Promise<T> {
    try {
      const raw = await this.client.readContract({
        address: appConfig.contractAddress as `0x${string}`,
        functionName: method,
        args: args as any,
      });
      return raw as T;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);

      // Handle 429 Rate Limit
      if (errMsg.includes('429') || errMsg.toLowerCase().includes('rate limit')) {
        this.stats.rateLimitHits++;
        if (attempt <= 3) {
          const backoff = Math.min(2500 * Math.pow(2, attempt - 1) + Math.random() * 500, 10000);
          this.cooldownUntil = Date.now() + backoff;
          await new Promise((res) => setTimeout(res, backoff));
          return this.executeWithRetry<T>(method, args, attempt + 1);
        }
      }

      throw err;
    }
  }

  public getRawClient() {
    return this.client;
  }
}

export const rpcClient = new RPCClient();

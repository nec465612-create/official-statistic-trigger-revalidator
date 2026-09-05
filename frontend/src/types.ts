export interface Footnote {
  code: string;
  text: string;
}

export interface Vintage {
  index: number;
  trigger_id: string;
  raw_value: string;
  value_scaled: number;
  series_id: string;
  year: string;
  period: string;
  period_name: string;
  footnotes: Footnote[];
  seasonal_band: string;
  catalog: Record<string, string>;
  source_status: string;
  comparability: 'COMPARABLE' | 'MATERIAL_SERIES_DEFINITION_CHANGE' | 'UNKNOWN';
  outcome: 'UNCHANGED_ABOVE' | 'REVISED_STILL_ABOVE' | 'REVISED_BELOW' | 'UNCHANGED_BELOW' | 'NOT_COMPARABLE' | 'UNRESOLVED' | string;
  exact_url: string;
  canonical_fingerprint: string;
  observed_at: string;
  is_hold: boolean;
  reason?: string;
}

export type TriggerState =
  | 'DRAFT'
  | 'FROZEN'
  | 'PROVISIONAL'
  | 'CONFIRMED_ACTIVE'
  | 'CONFIRMED_INACTIVE'
  | 'RECONFIRMED'
  | 'RECONFIRMED_INACTIVE'
  | 'REVERSED_BY_REVISION'
  | 'ACTIVATED_BY_REVISION'
  | 'HOLD'
  | 'CLOSED'
  | 'STALE';

export interface Trigger {
  id: string;
  owner: string;
  client_nonce: string;
  series: string;
  series_title: string;
  year: string;
  period: string;
  operator: 'GE' | 'LE';
  threshold_decimal: string;
  threshold_scaled: number;
  state: TriggerState;
  effective_state: TriggerState;
  created_at: string;
  frozen_at: string;
  closed_at: string;
  latest_observed_at: string;
  latest_vintage_index: number;
  vintage_count: number;
  canonical_key: string;
}

export interface ConsumerBinding {
  trigger_id: string;
  consumer_address: string;
  downstream_label: string;
  bound_at: string;
  active: boolean;
}

export interface EffectiveTriggerState {
  trigger_id: string;
  stored_state: TriggerState;
  effective_state: TriggerState;
  is_effective_active: boolean;
  is_stale: boolean;
  is_hold: boolean;
  series: string;
  year: string;
  period: string;
  operator: 'GE' | 'LE';
  threshold_scaled: number;
  threshold_decimal: string;
  latest_value_scaled: number;
  latest_raw_value: string;
  latest_observed_at: string;
  latest_fingerprint: string;
  vintage_count: number;
}

// ---------------------------------------------------------------------------
// Wallet & EIP-6963 Types
// ---------------------------------------------------------------------------
export type WalletBrand = 'MetaMask' | 'OKX Wallet' | 'Rabby';

export interface EIP6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

export interface EIP1193Provider {
  request: (args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>;
  on?: (eventName: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (eventName: string, listener: (...args: unknown[]) => void) => void;
}

export interface EIP6963ProviderDetail {
  info: EIP6963ProviderInfo;
  provider: EIP1193Provider;
}

export interface DetectedWallet {
  id: string;
  brand: WalletBrand;
  name: string;
  icon: string;
  provider: EIP1193Provider;
  isFallback?: boolean;
}

export interface ConnectedWallet {
  address: string;
  chainId: number;
  brand: WalletBrand;
  provider: EIP1193Provider;
}

// ---------------------------------------------------------------------------
// Transaction Lifecycle Types
// ---------------------------------------------------------------------------
export type TxStage =
  | 'IDLE'
  | 'WAITING_FOR_WALLET'
  | 'SUBMITTED'
  | 'WAITING_FOR_FINALITY'
  | 'VERIFYING_EXECUTION'
  | 'VERIFYING_READBACK'
  | 'SUCCESS'
  | 'REJECTED'
  | 'RECONCILIATION_REQUIRED'
  | 'FAILED';

export interface TxIntent {
  intentId: string;
  account: string;
  chainId: number;
  contractAddress: string;
  method: string;
  args: unknown[];
  createdAt: number;
}

export interface TxJournalEntry {
  intentId: string;
  account: string;
  chainId: number;
  contractAddress: string;
  method: string;
  args: unknown[];
  hash: string;
  createdAt: number;
  status: 'PENDING' | 'FINALIZED' | 'RECONCILED' | 'FAILED';
  result?: unknown;
  error?: string;
}

export interface WriteResult<T = unknown> {
  success: boolean;
  hash?: string;
  data?: T;
  error?: string;
}

export interface RPCStats {
  totalCalls: number;
  cachedHits: number;
  dedupedCalls: number;
  rateLimitHits: number;
  lastCallTime: number;
}

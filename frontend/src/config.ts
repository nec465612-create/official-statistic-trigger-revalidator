export interface AppConfig {
  rpcUrl: string;
  chainId: number;
  contractAddress: string;
  isConfigured: boolean;
  configError: string | null;
  explorerBaseUrl: string;
}

export function validateConfig(): AppConfig {
  const rpcUrl = (import.meta.env.VITE_GENLAYER_RPC_URL || 'https://studio.genlayer.com/api').trim();
  const chainIdStr = (import.meta.env.VITE_GENLAYER_CHAIN_ID || '61999').toString().trim();
  const contractAddress = (import.meta.env.VITE_CONTRACT_ADDRESS || '').trim();
  const explorerBaseUrl = 'https://explorer-studio.genlayer.com';

  const chainId = parseInt(chainIdStr, 10);
  if (isNaN(chainId) || chainId <= 0) {
    return {
      rpcUrl,
      chainId: 61999,
      contractAddress: '',
      isConfigured: false,
      configError: `Invalid VITE_GENLAYER_CHAIN_ID: "${chainIdStr}". Must be a positive integer.`,
      explorerBaseUrl,
    };
  }

  try {
    const url = new URL(rpcUrl);
    if (!['http:', 'https:'].includes(url.protocol)) {
      return {
        rpcUrl,
        chainId,
        contractAddress: '',
        isConfigured: false,
        configError: `Invalid RPC protocol in "${rpcUrl}". Must be http:// or https://.`,
        explorerBaseUrl,
      };
    }
  } catch {
    return {
      rpcUrl,
      chainId,
      contractAddress: '',
      isConfigured: false,
      configError: `Malformed VITE_GENLAYER_RPC_URL: "${rpcUrl}".`,
      explorerBaseUrl,
    };
  }

  // Contract address check
  if (!contractAddress) {
    return {
      rpcUrl,
      chainId,
      contractAddress: '',
      isConfigured: false,
      configError: 'VITE_CONTRACT_ADDRESS is not set. Please deploy the contract to Studionet and set VITE_CONTRACT_ADDRESS in .env.',
      explorerBaseUrl,
    };
  }

  // Detect forbidden placeholder patterns
  const placeholderPatterns = [
    '0x0000000000000000000000000000000000000000',
    '0x1234567890123456789012345678901234567890',
    'your_contract_address_here',
    'contract_address',
    '0x0',
  ];

  if (placeholderPatterns.includes(contractAddress.toLowerCase())) {
    return {
      rpcUrl,
      chainId,
      contractAddress: '',
      isConfigured: false,
      configError: `Placeholder contract address "${contractAddress}" detected. Set a real deployed contract address.`,
      explorerBaseUrl,
    };
  }

  const hexAddressRegex = /^0x[a-fA-F0-9]{40}$/;
  if (!hexAddressRegex.test(contractAddress)) {
    return {
      rpcUrl,
      chainId,
      contractAddress: '',
      isConfigured: false,
      configError: `Invalid contract address format "${contractAddress}". Must be a 42-character 0x-prefixed hex string.`,
      explorerBaseUrl,
    };
  }

  return {
    rpcUrl,
    chainId,
    contractAddress,
    isConfigured: true,
    configError: null,
    explorerBaseUrl,
  };
}

export let appConfig = validateConfig();

export function setTestConfig(overrides: Partial<AppConfig>): void {
  appConfig = {
    ...appConfig,
    ...overrides,
  };
}

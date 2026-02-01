/**
 * LI.FI API Client
 *
 * Read-only client for querying cross-chain data.
 * Base URL: https://li.quest
 * Auth: None required
 *
 * NOTE: LI.FI only supports MAINNET. For testnet operations, use direct chain clients.
 */

// Well-known chain IDs
export const LIFI_CHAIN_IDS = {
  // EVM
  ETHEREUM: 1,
  POLYGON: 137,
  ARBITRUM: 42161,
  OPTIMISM: 10,
  BASE: 8453,
  BSC: 56,
  AVALANCHE: 43114,
  // Non-EVM
  SUI: 9270000000000000,
  SOLANA: 1151111081099710,
  BITCOIN: 20000000000001,
} as const;

// Chain types supported by LI.FI
export type LiFiChainType = 'EVM' | 'SVM' | 'MVM' | 'UTXO';
export const ALL_CHAIN_TYPES: LiFiChainType[] = ['EVM', 'SVM', 'MVM', 'UTXO'];

export interface Confidence {
  score: number;         // 0-1 confidence level
  freshness: string;     // How old is this data
  source: string;        // Where did it come from
  latencyMs: number;     // API response time
  healthy: boolean;      // Is the API responding well
}

export interface LiFiResponse<T> {
  data: T;
  confidence: Confidence;
  timestamp: string;
}

export interface LiFiChain {
  id: number;
  key: string;
  name: string;
  chainType: string;
  coin: string;
  mainnet: boolean;
  logoURI?: string;
  multicallAddress?: string;
  metamask?: {
    chainId: string;
    chainName: string;
    nativeCurrency: {
      name: string;
      symbol: string;
      decimals: number;
    };
    rpcUrls: string[];
    blockExplorerUrls: string[];
  };
}

export interface LiFiToken {
  address: string;
  symbol: string;
  decimals: number;
  chainId: number;
  name: string;
  coinKey?: string;
  logoURI?: string;
  priceUSD?: string;
}

export interface LiFiTokensResponse {
  tokens: Record<string, LiFiToken[]>;
}

export class LiFiClient {
  private baseUrl: string;
  private readonly HEALTHY_LATENCY_THRESHOLD = 2000; // 2 seconds

  constructor(baseUrl: string = 'https://li.quest') {
    this.baseUrl = baseUrl;
  }

  /**
   * Make a request to LI.FI API with confidence scoring
   */
  private async request<T>(endpoint: string, params?: Record<string, string>): Promise<LiFiResponse<T>> {
    const url = new URL(`${this.baseUrl}${endpoint}`);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, value);
        }
      });
    }

    const startTime = Date.now();

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        throw new Error(`LI.FI API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as T;

      return {
        data,
        confidence: {
          score: this.calculateConfidence(latencyMs, true),
          freshness: 'live',
          source: 'li.fi',
          latencyMs,
          healthy: latencyMs < this.HEALTHY_LATENCY_THRESHOLD,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`LI.FI request failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Calculate confidence score based on latency and success
   */
  private calculateConfidence(latencyMs: number, success: boolean): number {
    if (!success) return 0;

    // Perfect score for < 500ms, decreasing for slower responses
    if (latencyMs < 500) return 1.0;
    if (latencyMs < 1000) return 0.95;
    if (latencyMs < 2000) return 0.85;
    if (latencyMs < 5000) return 0.7;
    return 0.5;
  }

  /**
   * Get all supported chains
   * GET /v1/chains
   * @param chainTypes - Filter by chain types (default: all types)
   */
  async getChains(chainTypes?: LiFiChainType[]): Promise<LiFiResponse<LiFiChain[]>> {
    const params: Record<string, string> = {};

    // Default to all chain types to include SUI, Solana, Bitcoin
    const types = chainTypes || ALL_CHAIN_TYPES;
    params.chainTypes = types.join(',');

    const response = await this.request<{ chains: LiFiChain[] }>('/v1/chains', params);
    return {
      ...response,
      data: response.data.chains,
    };
  }

  /**
   * Get tokens for specific chains
   * GET /v1/tokens
   */
  async getTokens(chainIds?: number[]): Promise<LiFiResponse<LiFiTokensResponse>> {
    const params: Record<string, string> = {};

    if (chainIds && chainIds.length > 0) {
      params.chains = chainIds.join(',');
    }

    return this.request<LiFiTokensResponse>('/v1/tokens', params);
  }

  /**
   * Health check - verify API is responding
   */
  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number }> {
    const startTime = Date.now();

    try {
      const response = await fetch(`${this.baseUrl}/v1/chains`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });

      const latencyMs = Date.now() - startTime;

      return {
        healthy: response.ok && latencyMs < this.HEALTHY_LATENCY_THRESHOLD,
        latencyMs,
      };
    } catch {
      return {
        healthy: false,
        latencyMs: Date.now() - startTime,
      };
    }
  }
}

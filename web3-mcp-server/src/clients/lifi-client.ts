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

// ============================================================================
// Quote & Route Types
// ============================================================================

export interface QuoteRequest {
  fromChain: number | string;      // Chain ID or key
  toChain: number | string;        // Chain ID or key
  fromToken: string;               // Token address
  toToken: string;                 // Token address
  fromAmount: string;              // Amount in smallest units (wei)
  fromAddress?: string;            // User's address (optional for quotes)
  toAddress?: string;              // Destination address (defaults to fromAddress)
  slippage?: number;               // Slippage tolerance (0.01 = 1%)
  order?: 'RECOMMENDED' | 'FASTEST' | 'CHEAPEST' | 'SAFEST';
}

export interface LiFiAction {
  fromChainId: number;
  toChainId: number;
  fromToken: LiFiToken;
  toToken: LiFiToken;
  fromAmount: string;
  slippage: number;
  fromAddress?: string;
  toAddress?: string;
}

export interface LiFiEstimate {
  fromAmount: string;
  toAmount: string;
  toAmountMin: string;
  approvalAddress?: string;
  executionDuration: number;       // Seconds
  feeCosts?: LiFiFeeCost[];
  gasCosts?: LiFiGasCost[];
}

export interface LiFiFeeCost {
  name: string;
  description?: string;
  percentage: string;
  token: LiFiToken;
  amount: string;
  amountUSD?: string;
}

export interface LiFiGasCost {
  type: string;
  estimate: string;
  limit: string;
  amount: string;
  amountUSD?: string;
  price: string;
  token: LiFiToken;
}

export interface LiFiStep {
  id: string;
  type: 'swap' | 'cross' | 'lifi' | 'custom';
  tool: string;                    // e.g., 'uniswap', 'stargate', 'allbridge'
  toolDetails: {
    key: string;
    name: string;
    logoURI?: string;
  };
  action: LiFiAction;
  estimate: LiFiEstimate;
  includedSteps?: LiFiStep[];
}

export interface LiFiQuote {
  id: string;
  type: string;
  tool: string;
  toolDetails: {
    key: string;
    name: string;
    logoURI?: string;
  };
  action: LiFiAction;
  estimate: LiFiEstimate;
  includedSteps: LiFiStep[];
  transactionRequest?: {
    to: string;
    from: string;
    data: string;
    value: string;
    gasLimit: string;
    gasPrice?: string;
    chainId: number;
  };
}

export interface LiFiRoute {
  id: string;
  fromChainId: number;
  fromAmountUSD: string;
  fromAmount: string;
  fromToken: LiFiToken;
  fromAddress?: string;
  toChainId: number;
  toAmountUSD: string;
  toAmount: string;
  toAmountMin: string;
  toToken: LiFiToken;
  toAddress?: string;
  gasCostUSD?: string;
  steps: LiFiStep[];
  tags?: string[];
}

export interface LiFiRoutesResponse {
  routes: LiFiRoute[];
  unavailableRoutes?: {
    filteredOut: any[];
    failed: any[];
  };
}

// ============================================================================
// Transaction Status Types
// ============================================================================

export type TransactionStatus =
  | 'NOT_FOUND'
  | 'INVALID'
  | 'PENDING'
  | 'DONE'
  | 'FAILED';

export interface LiFiStatusResponse {
  transactionId?: string;
  sending: {
    txHash: string;
    txLink?: string;
    amount: string;
    token: LiFiToken;
    chainId: number;
    gasPrice?: string;
    gasUsed?: string;
    gasToken?: LiFiToken;
    gasAmount?: string;
    gasAmountUSD?: string;
    amountUSD?: string;
    value?: string;
    timestamp?: number;
  };
  receiving?: {
    txHash?: string;
    txLink?: string;
    amount?: string;
    token?: LiFiToken;
    chainId?: number;
    gasPrice?: string;
    gasUsed?: string;
    gasToken?: LiFiToken;
    gasAmount?: string;
    gasAmountUSD?: string;
    amountUSD?: string;
    value?: string;
    timestamp?: number;
  };
  lifiExplorerLink?: string;
  fromAddress?: string;
  toAddress?: string;
  tool?: string;
  status: TransactionStatus;
  substatus?: string;
  substatusMessage?: string;
}

// ============================================================================
// Gas Price Types
// ============================================================================

export interface LiFiGasPriceData {
  standard: number;
  fast: number;
  fastest: number;
  lastUpdated: number;
}

export interface LiFiGasPricesResponse {
  [chainId: string]: LiFiGasPriceData;
}

export interface LiFiGasPrice {
  chainId: number;
  standard: string;
  fast: string;
  instant: string;
  lastUpdated?: number;
}

// ============================================================================
// Token Balance Types
// ============================================================================

export interface LiFiTokenBalance {
  address: string;
  symbol: string;
  decimals: number;
  chainId: number;
  name: string;
  coinKey?: string;
  logoURI?: string;
  priceUSD?: string;
  amount: string;
  blockNumber?: number;
}

export interface LiFiTokenBalancesResponse {
  [chainId: string]: LiFiTokenBalance[];
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
   * Make a POST request to LI.FI API with confidence scoring
   */
  private async postRequest<T>(endpoint: string, body: Record<string, any>): Promise<LiFiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;
    const startTime = Date.now();

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LI.FI API error: ${response.status} ${response.statusText} - ${errorText}`);
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

  // ==========================================================================
  // Quote & Route Methods
  // ==========================================================================

  /**
   * Get a quote for a cross-chain or same-chain swap
   * GET /v1/quote
   */
  async getQuote(request: QuoteRequest): Promise<LiFiResponse<LiFiQuote>> {
    const params: Record<string, string> = {
      fromChain: request.fromChain.toString(),
      toChain: request.toChain.toString(),
      fromToken: request.fromToken,
      toToken: request.toToken,
      fromAmount: request.fromAmount,
    };

    if (request.fromAddress) {
      params.fromAddress = request.fromAddress;
    }
    if (request.toAddress) {
      params.toAddress = request.toAddress;
    }
    if (request.slippage !== undefined) {
      params.slippage = request.slippage.toString();
    }
    if (request.order) {
      params.order = request.order;
    }

    return this.request<LiFiQuote>('/v1/quote', params);
  }

  /**
   * Get multiple routes for comparison
   * POST /v1/advanced/routes
   */
  async getRoutes(request: QuoteRequest): Promise<LiFiResponse<LiFiRoutesResponse>> {
    const body: Record<string, any> = {
      fromChainId: Number(request.fromChain),
      toChainId: Number(request.toChain),
      fromTokenAddress: request.fromToken,
      toTokenAddress: request.toToken,
      fromAmount: request.fromAmount,
    };

    if (request.fromAddress) {
      body.fromAddress = request.fromAddress;
    }
    if (request.toAddress) {
      body.toAddress = request.toAddress;
    }
    if (request.slippage !== undefined) {
      body.options = { slippage: request.slippage };
    }
    if (request.order) {
      body.options = { ...body.options, order: request.order };
    }

    return this.postRequest<LiFiRoutesResponse>('/v1/advanced/routes', body);
  }

  /**
   * Get transaction status for cross-chain transfers
   * GET /v1/status
   */
  async getStatus(
    txHash: string,
    fromChain: number | string,
    toChain: number | string
  ): Promise<LiFiResponse<LiFiStatusResponse>> {
    const params: Record<string, string> = {
      txHash,
      fromChain: fromChain.toString(),
      toChain: toChain.toString(),
    };

    return this.request<LiFiStatusResponse>('/v1/status', params);
  }

  /**
   * Get available connections between chains (which bridges work)
   * GET /v1/connections
   */
  async getConnections(
    fromChain: number | string,
    toChain: number | string,
    fromToken?: string,
    toToken?: string
  ): Promise<LiFiResponse<any>> {
    const params: Record<string, string> = {
      fromChain: fromChain.toString(),
      toChain: toChain.toString(),
    };

    if (fromToken) {
      params.fromToken = fromToken;
    }
    if (toToken) {
      params.toToken = toToken;
    }

    return this.request<any>('/v1/connections', params);
  }

  /**
   * Get available tools (bridges and DEXs)
   * GET /v1/tools
   */
  async getTools(): Promise<LiFiResponse<{ bridges: any[]; exchanges: any[] }>> {
    return this.request<{ bridges: any[]; exchanges: any[] }>('/v1/tools');
  }

  // ==========================================================================
  // Gas Price Methods
  // ==========================================================================

  /**
   * Get all gas prices (returns all chains at once)
   * GET /v1/gas/prices
   */
  async getAllGasPrices(): Promise<LiFiResponse<LiFiGasPricesResponse>> {
    return this.request<LiFiGasPricesResponse>('/v1/gas/prices');
  }

  /**
   * Get gas prices for a specific chain
   * Extracts from the all-chains response
   */
  async getGasPrice(chainId: number): Promise<LiFiResponse<LiFiGasPrice>> {
    const response = await this.getAllGasPrices();
    const chainGas = response.data[chainId.toString()];

    if (!chainGas) {
      throw new Error(`Gas prices not available for chain ${chainId}`);
    }

    return {
      data: {
        chainId,
        standard: chainGas.standard.toString(),
        fast: chainGas.fast.toString(),
        instant: chainGas.fastest.toString(),
        lastUpdated: chainGas.lastUpdated,
      },
      confidence: response.confidence,
      timestamp: response.timestamp,
    };
  }

  /**
   * Get gas prices for multiple chains
   */
  async getGasPrices(chainIds: number[]): Promise<LiFiResponse<LiFiGasPrice[]>> {
    const response = await this.getAllGasPrices();
    const results: LiFiGasPrice[] = [];

    for (const chainId of chainIds) {
      const chainGas = response.data[chainId.toString()];
      if (chainGas) {
        results.push({
          chainId,
          standard: chainGas.standard.toString(),
          fast: chainGas.fast.toString(),
          instant: chainGas.fastest.toString(),
          lastUpdated: chainGas.lastUpdated,
        });
      }
    }

    return {
      data: results,
      confidence: response.confidence,
      timestamp: response.timestamp,
    };
  }

  // ==========================================================================
  // Token Balance Methods
  // ==========================================================================

  /**
   * Get token balances for a wallet address across chains
   * GET /v1/token/balances
   */
  async getTokenBalances(
    walletAddress: string,
    chainIds?: number[]
  ): Promise<LiFiResponse<LiFiTokenBalancesResponse>> {
    const params: Record<string, string> = {
      walletAddress,
    };

    if (chainIds && chainIds.length > 0) {
      params.chains = chainIds.join(',');
    }

    return this.request<LiFiTokenBalancesResponse>('/v1/token/balances', params);
  }
}

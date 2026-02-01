/**
 * LI.FI Chain Tools
 *
 * Observer Agent skills for querying supported chains and tokens.
 * All read-only, no execution.
 */

import { LiFiClient, LiFiChain, LiFiResponse } from '../clients/lifi-client.js';

export interface ChainSummary {
  id: number;
  key: string;
  name: string;
  type: string;
  nativeToken: string;
  isMainnet: boolean;
  logoURI?: string;
}

export interface SupportedChainsResponse {
  chains: ChainSummary[];
  totalChains: number;
  mainnetCount: number;
  testnetCount: number;
  chainTypes: string[];
}

export interface TokenSummary {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  priceUSD?: string;
  logoURI?: string;
}

export interface ChainTokensResponse {
  chainId: number;
  chainName: string;
  tokens: TokenSummary[];
  totalTokens: number;
}

/**
 * Get all supported chains from LI.FI
 */
export async function getSupportedChains(
  client: LiFiClient
): Promise<LiFiResponse<SupportedChainsResponse>> {
  const response = await client.getChains();

  const chains: ChainSummary[] = response.data.map((chain) => ({
    id: chain.id,
    key: chain.key,
    name: chain.name,
    type: chain.chainType,
    nativeToken: chain.coin,
    isMainnet: chain.mainnet,
    logoURI: chain.logoURI,
  }));

  // Sort by mainnet first, then by name
  chains.sort((a, b) => {
    if (a.isMainnet !== b.isMainnet) return a.isMainnet ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  // Get unique chain types
  const chainTypes = [...new Set(chains.map((c) => c.type))];

  const mainnetCount = chains.filter((c) => c.isMainnet).length;
  const testnetCount = chains.filter((c) => !c.isMainnet).length;

  return {
    data: {
      chains,
      totalChains: chains.length,
      mainnetCount,
      testnetCount,
      chainTypes,
    },
    confidence: response.confidence,
    timestamp: response.timestamp,
  };
}

/**
 * Get chain by ID or key
 */
export async function getChainById(
  client: LiFiClient,
  chainIdOrKey: number | string
): Promise<LiFiResponse<ChainSummary | null>> {
  const response = await client.getChains();

  const chain = response.data.find((c) => {
    if (typeof chainIdOrKey === 'number') {
      return c.id === chainIdOrKey;
    }
    return c.key.toLowerCase() === chainIdOrKey.toLowerCase() ||
           c.name.toLowerCase() === chainIdOrKey.toLowerCase();
  });

  if (!chain) {
    return {
      data: null,
      confidence: response.confidence,
      timestamp: response.timestamp,
    };
  }

  return {
    data: {
      id: chain.id,
      key: chain.key,
      name: chain.name,
      type: chain.chainType,
      nativeToken: chain.coin,
      isMainnet: chain.mainnet,
      logoURI: chain.logoURI,
    },
    confidence: response.confidence,
    timestamp: response.timestamp,
  };
}

/**
 * Get tokens for a specific chain
 */
export async function getChainTokens(
  client: LiFiClient,
  chainId: number
): Promise<LiFiResponse<ChainTokensResponse>> {
  // First get chain info
  const chainsResponse = await client.getChains();
  const chain = chainsResponse.data.find((c) => c.id === chainId);

  if (!chain) {
    throw new Error(`Chain ${chainId} not found`);
  }

  // Get tokens for this chain
  const tokensResponse = await client.getTokens([chainId]);

  const chainTokens = tokensResponse.data.tokens[chainId.toString()] || [];

  const tokens: TokenSummary[] = chainTokens.map((token) => ({
    address: token.address,
    symbol: token.symbol,
    name: token.name,
    decimals: token.decimals,
    priceUSD: token.priceUSD,
    logoURI: token.logoURI,
  }));

  // Sort by symbol
  tokens.sort((a, b) => a.symbol.localeCompare(b.symbol));

  return {
    data: {
      chainId,
      chainName: chain.name,
      tokens,
      totalTokens: tokens.length,
    },
    confidence: tokensResponse.confidence,
    timestamp: tokensResponse.timestamp,
  };
}

/**
 * Search chains by name or native token
 */
export async function searchChains(
  client: LiFiClient,
  query: string
): Promise<LiFiResponse<ChainSummary[]>> {
  const response = await client.getChains();
  const queryLower = query.toLowerCase();

  const matching = response.data.filter((chain) =>
    chain.name.toLowerCase().includes(queryLower) ||
    chain.key.toLowerCase().includes(queryLower) ||
    chain.coin.toLowerCase().includes(queryLower)
  );

  const chains: ChainSummary[] = matching.map((chain) => ({
    id: chain.id,
    key: chain.key,
    name: chain.name,
    type: chain.chainType,
    nativeToken: chain.coin,
    isMainnet: chain.mainnet,
    logoURI: chain.logoURI,
  }));

  return {
    data: chains,
    confidence: response.confidence,
    timestamp: response.timestamp,
  };
}

/**
 * Check if a specific chain is supported
 */
export async function isChainSupported(
  client: LiFiClient,
  chainIdOrKey: number | string
): Promise<LiFiResponse<boolean>> {
  const response = await getChainById(client, chainIdOrKey);

  return {
    data: response.data !== null,
    confidence: response.confidence,
    timestamp: response.timestamp,
  };
}

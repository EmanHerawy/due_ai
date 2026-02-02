/**
 * LI.FI Portfolio Tools
 *
 * Observer Agent skills for querying token prices and portfolio values.
 * All read-only, no execution.
 */

import {
  LiFiClient,
  LiFiResponse,
  LIFI_CHAIN_IDS,
} from '../clients/lifi-client.js';

// ============================================================================
// Types
// ============================================================================

export interface TokenPrice {
  symbol: string;
  name: string;
  address: string;
  chainId: number;
  chainName?: string;
  priceUSD: number;
  decimals: number;
  logoURI?: string;
}

export interface ChainBalance {
  chainId: number;
  chainName: string;
  chainType: string;
  tokens: TokenBalance[];
  totalValueUSD: number;
}

export interface TokenBalance {
  symbol: string;
  name: string;
  address: string;
  balance: string;
  balanceFormatted: string;
  priceUSD: number;
  valueUSD: number;
  decimals: number;
  logoURI?: string;
}

export interface PortfolioSummary {
  address: string;
  totalValueUSD: number;
  chainCount: number;
  tokenCount: number;
  chains: ChainBalance[];
  topHoldings: TokenBalance[];
}

export interface CrossChainBalances {
  address: string;
  chains: ChainBalance[];
  totalValueUSD: number;
  totalTokens: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

function formatBalance(balance: string, decimals: number): string {
  if (!balance || balance === '0') return '0';

  const num = BigInt(balance);
  const divisor = BigInt(10 ** decimals);
  const whole = num / divisor;
  const fraction = num % divisor;

  if (fraction === BigInt(0)) {
    return whole.toString();
  }

  const fractionStr = fraction.toString().padStart(decimals, '0').replace(/0+$/, '');
  if (!fractionStr) return whole.toString();

  return `${whole}.${fractionStr}`;
}

// ============================================================================
// Tool Functions
// ============================================================================

/**
 * Get current USD price for a token on a specific chain
 */
export async function getTokenPrice(
  client: LiFiClient,
  chainId: number,
  tokenAddress: string
): Promise<LiFiResponse<TokenPrice | null>> {
  const tokensResponse = await client.getTokens([chainId]);
  const chainTokens = tokensResponse.data.tokens[chainId.toString()] || [];

  // Find the token
  const token = chainTokens.find(
    (t) => t.address.toLowerCase() === tokenAddress.toLowerCase()
  );

  if (!token) {
    return {
      data: null,
      confidence: tokensResponse.confidence,
      timestamp: tokensResponse.timestamp,
    };
  }

  // Get chain info for name
  const chainsResponse = await client.getChains();
  const chain = chainsResponse.data.find((c) => c.id === chainId);

  return {
    data: {
      symbol: token.symbol,
      name: token.name,
      address: token.address,
      chainId: token.chainId,
      chainName: chain?.name,
      priceUSD: parseFloat(token.priceUSD || '0'),
      decimals: token.decimals,
      logoURI: token.logoURI,
    },
    confidence: tokensResponse.confidence,
    timestamp: tokensResponse.timestamp,
  };
}

/**
 * Get token price by symbol (searches across chains)
 */
export async function getTokenPriceBySymbol(
  client: LiFiClient,
  symbol: string,
  preferredChainId?: number
): Promise<LiFiResponse<TokenPrice[]>> {
  // Get tokens from major chains
  const chainIds = preferredChainId
    ? [preferredChainId]
    : [
        LIFI_CHAIN_IDS.ETHEREUM,
        LIFI_CHAIN_IDS.POLYGON,
        LIFI_CHAIN_IDS.ARBITRUM,
        LIFI_CHAIN_IDS.BASE,
        LIFI_CHAIN_IDS.BSC,
      ];

  const tokensResponse = await client.getTokens(chainIds);
  const chainsResponse = await client.getChains();

  const matchingTokens: TokenPrice[] = [];
  const symbolUpper = symbol.toUpperCase();

  for (const chainId of chainIds) {
    const chainTokens = tokensResponse.data.tokens[chainId.toString()] || [];
    const chain = chainsResponse.data.find((c) => c.id === chainId);

    for (const token of chainTokens) {
      if (token.symbol.toUpperCase() === symbolUpper) {
        matchingTokens.push({
          symbol: token.symbol,
          name: token.name,
          address: token.address,
          chainId: token.chainId,
          chainName: chain?.name,
          priceUSD: parseFloat(token.priceUSD || '0'),
          decimals: token.decimals,
          logoURI: token.logoURI,
        });
      }
    }
  }

  // Sort by price (highest first) to get most liquid markets
  matchingTokens.sort((a, b) => b.priceUSD - a.priceUSD);

  return {
    data: matchingTokens,
    confidence: tokensResponse.confidence,
    timestamp: tokensResponse.timestamp,
  };
}

/**
 * Get balances across multiple chains for an address
 * Note: This queries LI.FI for token lists, but actual balances
 * would need to come from on-chain queries or a balance API
 */
export async function getCrossChainTokens(
  client: LiFiClient,
  chainIds?: number[]
): Promise<LiFiResponse<{ chains: { chainId: number; chainName: string; tokenCount: number; tokens: TokenPrice[] }[] }>> {
  const chains = chainIds || [
    LIFI_CHAIN_IDS.ETHEREUM,
    LIFI_CHAIN_IDS.POLYGON,
    LIFI_CHAIN_IDS.ARBITRUM,
    LIFI_CHAIN_IDS.OPTIMISM,
    LIFI_CHAIN_IDS.BASE,
  ];

  const tokensResponse = await client.getTokens(chains);
  const chainsResponse = await client.getChains();

  const result: { chainId: number; chainName: string; tokenCount: number; tokens: TokenPrice[] }[] = [];

  for (const chainId of chains) {
    const chainTokens = tokensResponse.data.tokens[chainId.toString()] || [];
    const chain = chainsResponse.data.find((c) => c.id === chainId);

    const tokens: TokenPrice[] = chainTokens
      .filter((t) => parseFloat(t.priceUSD || '0') > 0)
      .slice(0, 50) // Top 50 tokens per chain
      .map((token) => ({
        symbol: token.symbol,
        name: token.name,
        address: token.address,
        chainId: token.chainId,
        chainName: chain?.name,
        priceUSD: parseFloat(token.priceUSD || '0'),
        decimals: token.decimals,
        logoURI: token.logoURI,
      }));

    result.push({
      chainId,
      chainName: chain?.name || `Chain ${chainId}`,
      tokenCount: chainTokens.length,
      tokens,
    });
  }

  return {
    data: { chains: result },
    confidence: tokensResponse.confidence,
    timestamp: tokensResponse.timestamp,
  };
}

/**
 * Calculate portfolio value from token balances
 * Takes raw balances and enriches with prices
 */
export function calculatePortfolioValue(
  balances: { chainId: number; tokens: { address: string; balance: string }[] }[],
  prices: Map<string, TokenPrice>
): PortfolioSummary {
  const chains: ChainBalance[] = [];
  let totalValueUSD = 0;
  let totalTokens = 0;
  const allTokenBalances: TokenBalance[] = [];

  for (const chainBalance of balances) {
    const chainTokens: TokenBalance[] = [];
    let chainTotalUSD = 0;

    for (const token of chainBalance.tokens) {
      const priceKey = `${chainBalance.chainId}:${token.address.toLowerCase()}`;
      const priceInfo = prices.get(priceKey);

      if (priceInfo && token.balance !== '0') {
        const balanceFormatted = formatBalance(token.balance, priceInfo.decimals);
        const balanceNum = parseFloat(balanceFormatted);
        const valueUSD = balanceNum * priceInfo.priceUSD;

        const tokenBalance: TokenBalance = {
          symbol: priceInfo.symbol,
          name: priceInfo.name,
          address: token.address,
          balance: token.balance,
          balanceFormatted,
          priceUSD: priceInfo.priceUSD,
          valueUSD,
          decimals: priceInfo.decimals,
          logoURI: priceInfo.logoURI,
        };

        chainTokens.push(tokenBalance);
        allTokenBalances.push(tokenBalance);
        chainTotalUSD += valueUSD;
        totalTokens++;
      }
    }

    if (chainTokens.length > 0) {
      chains.push({
        chainId: chainBalance.chainId,
        chainName: `Chain ${chainBalance.chainId}`,
        chainType: 'EVM',
        tokens: chainTokens.sort((a, b) => b.valueUSD - a.valueUSD),
        totalValueUSD: chainTotalUSD,
      });
      totalValueUSD += chainTotalUSD;
    }
  }

  // Get top holdings across all chains
  const topHoldings = allTokenBalances
    .sort((a, b) => b.valueUSD - a.valueUSD)
    .slice(0, 10);

  return {
    address: '',
    totalValueUSD,
    chainCount: chains.length,
    tokenCount: totalTokens,
    chains: chains.sort((a, b) => b.totalValueUSD - a.totalValueUSD),
    topHoldings,
  };
}

/**
 * Get common token prices (stablecoins, major tokens)
 */
export async function getCommonTokenPrices(
  client: LiFiClient
): Promise<LiFiResponse<{ [symbol: string]: TokenPrice }>> {
  const commonSymbols = ['USDC', 'USDT', 'DAI', 'WETH', 'WBTC', 'ETH'];
  const result: { [symbol: string]: TokenPrice } = {};

  // Get from Ethereum as reference
  const tokensResponse = await client.getTokens([LIFI_CHAIN_IDS.ETHEREUM]);
  const ethTokens = tokensResponse.data.tokens[LIFI_CHAIN_IDS.ETHEREUM.toString()] || [];

  for (const symbol of commonSymbols) {
    const token = ethTokens.find(
      (t) => t.symbol.toUpperCase() === symbol.toUpperCase()
    );
    if (token) {
      result[symbol] = {
        symbol: token.symbol,
        name: token.name,
        address: token.address,
        chainId: token.chainId,
        chainName: 'Ethereum',
        priceUSD: parseFloat(token.priceUSD || '0'),
        decimals: token.decimals,
        logoURI: token.logoURI,
      };
    }
  }

  return {
    data: result,
    confidence: tokensResponse.confidence,
    timestamp: tokensResponse.timestamp,
  };
}

/**
 * Format portfolio as human-readable string
 */
export function formatPortfolioDescription(portfolio: PortfolioSummary): string {
  const lines: string[] = [
    `💰 **Portfolio Summary**`,
    ``,
    `**Total Value:** $${portfolio.totalValueUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    `**Chains:** ${portfolio.chainCount}`,
    `**Tokens:** ${portfolio.tokenCount}`,
    ``,
  ];

  if (portfolio.topHoldings.length > 0) {
    lines.push(`**Top Holdings:**`);
    for (const token of portfolio.topHoldings.slice(0, 5)) {
      lines.push(
        `  • ${token.balanceFormatted} ${token.symbol} = $${token.valueUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      );
    }
    lines.push(``);
  }

  if (portfolio.chains.length > 0) {
    lines.push(`**By Chain:**`);
    for (const chain of portfolio.chains) {
      lines.push(
        `  • ${chain.chainName}: $${chain.totalValueUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${chain.tokens.length} tokens)`
      );
    }
  }

  return lines.join('\n');
}

// Re-export chain IDs
export { LIFI_CHAIN_IDS };

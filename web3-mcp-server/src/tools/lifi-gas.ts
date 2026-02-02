/**
 * LI.FI Gas & Wallet Tools
 *
 * Observer Agent skills for querying gas prices, estimating transaction costs,
 * and fetching wallet balances across chains.
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

export interface GasPriceSummary {
  chainId: number;
  chainName?: string;
  // Gas prices in native token (wei/gwei)
  standard: {
    price: string;
    priceGwei: string;
    priceUSD?: string;
  };
  fast: {
    price: string;
    priceGwei: string;
    priceUSD?: string;
  };
  instant: {
    price: string;
    priceGwei: string;
    priceUSD?: string;
  };
}

export interface TransactionCostEstimate {
  chainId: number;
  chainName?: string;
  // Gas estimates
  gasLimit: string;
  gasPrice: string;
  gasPriceGwei: string;
  // Costs
  gasCostNative: string;
  gasCostUSD: string;
  // For cross-chain
  bridgeFeeUSD?: string;
  totalCostUSD: string;
  // Breakdown
  breakdown: {
    type: string;
    description: string;
    amountUSD: string;
  }[];
}

export interface WalletBalanceSummary {
  address: string;
  totalValueUSD: number;
  chainCount: number;
  tokenCount: number;
  chains: ChainBalanceSummary[];
}

export interface ChainBalanceSummary {
  chainId: number;
  chainName?: string;
  totalValueUSD: number;
  tokens: TokenBalanceSummary[];
}

export interface TokenBalanceSummary {
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

export interface MultiChainGasComparison {
  chains: GasPriceSummary[];
  cheapest: { chainId: number; chainName?: string; standardUSD: string };
  mostExpensive: { chainId: number; chainName?: string; standardUSD: string };
}

// ============================================================================
// Helper Functions
// ============================================================================

function weiToGwei(wei: string): string {
  const num = BigInt(wei);
  const gwei = num / BigInt(10 ** 9);
  const remainder = num % BigInt(10 ** 9);

  if (remainder === BigInt(0)) {
    return gwei.toString();
  }

  const fractionStr = remainder.toString().padStart(9, '0').replace(/0+$/, '');
  if (!fractionStr) return gwei.toString();

  return `${gwei}.${fractionStr}`;
}

function formatBalance(amount: string, decimals: number): string {
  if (!amount || amount === '0') return '0';

  const num = BigInt(amount);
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

const CHAIN_NAMES: Record<number, string> = {
  [LIFI_CHAIN_IDS.ETHEREUM]: 'Ethereum',
  [LIFI_CHAIN_IDS.POLYGON]: 'Polygon',
  [LIFI_CHAIN_IDS.ARBITRUM]: 'Arbitrum',
  [LIFI_CHAIN_IDS.OPTIMISM]: 'Optimism',
  [LIFI_CHAIN_IDS.BASE]: 'Base',
  [LIFI_CHAIN_IDS.BSC]: 'BSC',
  [LIFI_CHAIN_IDS.AVALANCHE]: 'Avalanche',
};

// ============================================================================
// Gas Price Tools
// ============================================================================

/**
 * Get current gas prices for a specific chain
 */
export async function getGasPrice(
  client: LiFiClient,
  chainId: number
): Promise<LiFiResponse<GasPriceSummary>> {
  const response = await client.getGasPrice(chainId);
  const gas = response.data;

  return {
    data: {
      chainId: gas.chainId,
      chainName: CHAIN_NAMES[gas.chainId],
      standard: {
        price: gas.standard,
        priceGwei: weiToGwei(gas.standard),
      },
      fast: {
        price: gas.fast,
        priceGwei: weiToGwei(gas.fast),
      },
      instant: {
        price: gas.instant,
        priceGwei: weiToGwei(gas.instant),
      },
    },
    confidence: response.confidence,
    timestamp: response.timestamp,
  };
}

/**
 * Compare gas prices across multiple chains
 */
export async function compareGasPrices(
  client: LiFiClient,
  chainIds?: number[]
): Promise<LiFiResponse<MultiChainGasComparison>> {
  const chains = chainIds || [
    LIFI_CHAIN_IDS.ETHEREUM,
    LIFI_CHAIN_IDS.POLYGON,
    LIFI_CHAIN_IDS.ARBITRUM,
    LIFI_CHAIN_IDS.OPTIMISM,
    LIFI_CHAIN_IDS.BASE,
  ];

  const summaries: GasPriceSummary[] = [];
  let totalLatency = 0;
  let minScore = 1.0;

  for (const chainId of chains) {
    try {
      const response = await getGasPrice(client, chainId);
      summaries.push(response.data);
      totalLatency += response.confidence.latencyMs;
      minScore = Math.min(minScore, response.confidence.score);
    } catch {
      // Skip chains that fail
    }
  }

  // Find cheapest and most expensive
  let cheapest = summaries[0];
  let mostExpensive = summaries[0];

  for (const summary of summaries) {
    const currentUSD = parseFloat(summary.standard.priceUSD || '0');
    const cheapestUSD = parseFloat(cheapest.standard.priceUSD || '0');
    const expensiveUSD = parseFloat(mostExpensive.standard.priceUSD || '0');

    if (currentUSD < cheapestUSD || cheapestUSD === 0) {
      cheapest = summary;
    }
    if (currentUSD > expensiveUSD) {
      mostExpensive = summary;
    }
  }

  return {
    data: {
      chains: summaries,
      cheapest: {
        chainId: cheapest.chainId,
        chainName: cheapest.chainName,
        standardUSD: cheapest.standard.priceUSD || '0',
      },
      mostExpensive: {
        chainId: mostExpensive.chainId,
        chainName: mostExpensive.chainName,
        standardUSD: mostExpensive.standard.priceUSD || '0',
      },
    },
    confidence: {
      score: minScore,
      freshness: 'live',
      source: 'li.fi',
      latencyMs: totalLatency,
      healthy: totalLatency < 10000,
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Estimate transaction cost for a cross-chain or same-chain transfer
 * Uses the quote endpoint to get accurate cost estimates
 * Note: May be rate limited without an API key
 */
export async function estimateTransactionCost(
  client: LiFiClient,
  fromChain: number,
  toChain: number,
  fromToken: string,
  toToken: string,
  fromAmount: string,
  options?: {
    fromAddress?: string;
  }
): Promise<LiFiResponse<TransactionCostEstimate>> {
  // Use a dummy address if none provided (required by some routes)
  const fromAddress = options?.fromAddress || '0x552008c0f6870c2f77e5cC1d2eb9bdff03e30Ea0';

  try {
    // Get a quote to get accurate cost estimates
    const quoteResponse = await client.getQuote({
      fromChain,
      toChain,
      fromToken,
      toToken,
      fromAmount,
      fromAddress,
    });

    const quote = quoteResponse.data;
  const breakdown: { type: string; description: string; amountUSD: string }[] = [];

  // Calculate gas costs
  let totalGasUSD = 0;
  let gasLimit = '0';
  let gasPrice = '0';

  if (quote.estimate?.gasCosts) {
    for (const gasCost of quote.estimate.gasCosts) {
      const amountUSD = parseFloat(gasCost.amountUSD || '0');
      totalGasUSD += amountUSD;
      breakdown.push({
        type: 'gas',
        description: `${gasCost.type} gas on ${CHAIN_NAMES[fromChain] || `Chain ${fromChain}`}`,
        amountUSD: amountUSD.toFixed(4),
      });

      if (gasCost.limit) gasLimit = gasCost.limit;
      if (gasCost.price) gasPrice = gasCost.price;
    }
  }

  // Calculate fee costs (bridge fees, etc.)
  let totalFeesUSD = 0;
  if (quote.estimate?.feeCosts) {
    for (const feeCost of quote.estimate.feeCosts) {
      const amountUSD = parseFloat(feeCost.amountUSD || '0');
      totalFeesUSD += amountUSD;
      breakdown.push({
        type: 'fee',
        description: feeCost.name || 'Protocol fee',
        amountUSD: amountUSD.toFixed(4),
      });
    }
  }

  const totalCostUSD = totalGasUSD + totalFeesUSD;

  // Also check included steps for additional costs
  if (quote.includedSteps) {
    for (const step of quote.includedSteps) {
      if (step.estimate?.gasCosts) {
        for (const gasCost of step.estimate.gasCosts) {
          const amountUSD = parseFloat(gasCost.amountUSD || '0');
          if (amountUSD > 0) {
            breakdown.push({
              type: 'step_gas',
              description: `${step.tool} ${step.type} gas`,
              amountUSD: amountUSD.toFixed(4),
            });
          }
        }
      }
      if (step.estimate?.feeCosts) {
        for (const feeCost of step.estimate.feeCosts) {
          const amountUSD = parseFloat(feeCost.amountUSD || '0');
          if (amountUSD > 0) {
            breakdown.push({
              type: 'step_fee',
              description: `${step.tool} ${feeCost.name || 'fee'}`,
              amountUSD: amountUSD.toFixed(4),
            });
          }
        }
      }
    }
  }

    return {
      data: {
        chainId: fromChain,
        chainName: CHAIN_NAMES[fromChain],
        gasLimit,
        gasPrice,
        gasPriceGwei: weiToGwei(gasPrice),
        gasCostNative: '0', // Would need to calculate from gasLimit * gasPrice
        gasCostUSD: totalGasUSD.toFixed(4),
        bridgeFeeUSD: totalFeesUSD > 0 ? totalFeesUSD.toFixed(4) : undefined,
        totalCostUSD: totalCostUSD.toFixed(4),
        breakdown,
      },
      confidence: quoteResponse.confidence,
      timestamp: quoteResponse.timestamp,
    };
  } catch (error) {
    // Handle rate limiting gracefully
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isRateLimited = errorMessage.includes('429') || errorMessage.includes('Rate limit');

    if (isRateLimited) {
      return {
        data: {
          chainId: fromChain,
          chainName: CHAIN_NAMES[fromChain],
          gasLimit: '0',
          gasPrice: '0',
          gasPriceGwei: '0',
          gasCostNative: '0',
          gasCostUSD: '0',
          totalCostUSD: '0',
          breakdown: [],
        },
        confidence: {
          score: 0,
          freshness: 'unavailable',
          source: 'li.fi',
          latencyMs: 0,
          healthy: false,
        },
        timestamp: new Date().toISOString(),
      };
    }
    throw error;
  }
}

// ============================================================================
// Wallet Balance Tools
// ============================================================================

/**
 * Get wallet balances across multiple chains
 * Note: This endpoint may be rate limited without an API key
 */
export async function getWalletBalances(
  client: LiFiClient,
  walletAddress: string,
  chainIds?: number[]
): Promise<LiFiResponse<WalletBalanceSummary>> {
  const chains = chainIds || [
    LIFI_CHAIN_IDS.ETHEREUM,
    LIFI_CHAIN_IDS.POLYGON,
    LIFI_CHAIN_IDS.ARBITRUM,
    LIFI_CHAIN_IDS.OPTIMISM,
    LIFI_CHAIN_IDS.BASE,
  ];

  try {
    const response = await client.getTokenBalances(walletAddress, chains);
    const balances = response.data;

    const chainSummaries: ChainBalanceSummary[] = [];
    let totalValueUSD = 0;
    let totalTokenCount = 0;

    for (const chainId of chains) {
      const chainTokens = balances[chainId.toString()] || [];
      const tokenSummaries: TokenBalanceSummary[] = [];
      let chainTotalUSD = 0;

      for (const token of chainTokens) {
        if (token.amount && token.amount !== '0') {
          const balanceFormatted = formatBalance(token.amount, token.decimals);
          const priceUSD = parseFloat(token.priceUSD || '0');
          const valueUSD = parseFloat(balanceFormatted) * priceUSD;

          tokenSummaries.push({
            symbol: token.symbol,
            name: token.name,
            address: token.address,
            balance: token.amount,
            balanceFormatted,
            priceUSD,
            valueUSD,
            decimals: token.decimals,
            logoURI: token.logoURI,
          });

          chainTotalUSD += valueUSD;
          totalTokenCount++;
        }
      }

      if (tokenSummaries.length > 0) {
        // Sort by value descending
        tokenSummaries.sort((a, b) => b.valueUSD - a.valueUSD);

        chainSummaries.push({
          chainId,
          chainName: CHAIN_NAMES[chainId],
          totalValueUSD: chainTotalUSD,
          tokens: tokenSummaries,
        });

        totalValueUSD += chainTotalUSD;
      }
    }

    // Sort chains by value descending
    chainSummaries.sort((a, b) => b.totalValueUSD - a.totalValueUSD);

    return {
      data: {
        address: walletAddress,
        totalValueUSD,
        chainCount: chainSummaries.length,
        tokenCount: totalTokenCount,
        chains: chainSummaries,
      },
      confidence: response.confidence,
      timestamp: response.timestamp,
    };
  } catch (error) {
    // Handle rate limiting and API errors gracefully
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isRateLimited = errorMessage.includes('429') || errorMessage.includes('Rate limit');
    const isNotFound = errorMessage.includes('404') || errorMessage.includes('Not Found');

    if (isRateLimited || isNotFound) {
      return {
        data: {
          address: walletAddress,
          totalValueUSD: 0,
          chainCount: 0,
          tokenCount: 0,
          chains: [],
        },
        confidence: {
          score: 0,
          freshness: 'unavailable',
          source: 'li.fi',
          latencyMs: 0,
          healthy: false,
        },
        timestamp: new Date().toISOString(),
      };
    }
    throw error;
  }
}

/**
 * Get wallet balance for a specific chain
 */
export async function getWalletBalanceOnChain(
  client: LiFiClient,
  walletAddress: string,
  chainId: number
): Promise<LiFiResponse<ChainBalanceSummary>> {
  const response = await getWalletBalances(client, walletAddress, [chainId]);

  const chainBalance = response.data.chains[0] || {
    chainId,
    chainName: CHAIN_NAMES[chainId],
    totalValueUSD: 0,
    tokens: [],
  };

  return {
    data: chainBalance,
    confidence: response.confidence,
    timestamp: response.timestamp,
  };
}

/**
 * Format wallet balances as human-readable string
 */
export function formatWalletBalances(summary: WalletBalanceSummary): string {
  const lines: string[] = [
    `**Wallet Balance Summary**`,
    ``,
    `**Address:** ${summary.address.slice(0, 6)}...${summary.address.slice(-4)}`,
    `**Total Value:** $${summary.totalValueUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    `**Chains:** ${summary.chainCount}`,
    `**Tokens:** ${summary.tokenCount}`,
    ``,
  ];

  for (const chain of summary.chains) {
    lines.push(`**${chain.chainName || `Chain ${chain.chainId}`}:** $${chain.totalValueUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

    for (const token of chain.tokens.slice(0, 5)) {
      lines.push(`  - ${token.balanceFormatted} ${token.symbol} = $${token.valueUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    }

    if (chain.tokens.length > 5) {
      lines.push(`  - ... and ${chain.tokens.length - 5} more tokens`);
    }
    lines.push(``);
  }

  return lines.join('\n');
}

/**
 * Format gas comparison as human-readable string
 */
export function formatGasComparison(comparison: MultiChainGasComparison): string {
  const lines: string[] = [
    `**Gas Price Comparison**`,
    ``,
  ];

  for (const chain of comparison.chains) {
    lines.push(`**${chain.chainName || `Chain ${chain.chainId}`}:**`);
    lines.push(`  - Standard: ${chain.standard.priceGwei} gwei ($${chain.standard.priceUSD || 'N/A'})`);
    lines.push(`  - Fast: ${chain.fast.priceGwei} gwei ($${chain.fast.priceUSD || 'N/A'})`);
    lines.push(`  - Instant: ${chain.instant.priceGwei} gwei ($${chain.instant.priceUSD || 'N/A'})`);
    lines.push(``);
  }

  lines.push(`**Cheapest:** ${comparison.cheapest.chainName || `Chain ${comparison.cheapest.chainId}`} ($${comparison.cheapest.standardUSD})`);
  lines.push(`**Most Expensive:** ${comparison.mostExpensive.chainName || `Chain ${comparison.mostExpensive.chainId}`} ($${comparison.mostExpensive.standardUSD})`);

  return lines.join('\n');
}

// Re-export chain IDs
export { LIFI_CHAIN_IDS };

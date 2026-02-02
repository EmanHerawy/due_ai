/**
 * LI.FI Quote Tools
 *
 * Observer Agent skills for querying cross-chain swap/bridge quotes.
 * All read-only, no execution.
 */

import {
  LiFiClient,
  LiFiResponse,
  LiFiQuote,
  LiFiRoute,
  LiFiStatusResponse,
  QuoteRequest,
  LIFI_CHAIN_IDS,
} from '../clients/lifi-client.js';

// ============================================================================
// Response Types
// ============================================================================

export interface QuoteSummary {
  // Route info
  fromChain: { id: number; name?: string };
  toChain: { id: number; name?: string };
  fromToken: { symbol: string; address: string; decimals: number };
  toToken: { symbol: string; address: string; decimals: number };

  // Amounts
  fromAmount: string;
  fromAmountFormatted: string;
  toAmount: string;
  toAmountFormatted: string;
  toAmountMin: string;
  toAmountMinFormatted: string;

  // Costs
  estimatedGasUSD: string;
  estimatedFeesUSD: string;
  totalCostUSD: string;

  // Execution
  estimatedDurationSeconds: number;
  estimatedDurationFormatted: string;
  toolUsed: string;
  bridgeUsed?: string;

  // Steps breakdown
  steps: StepSummary[];
}

export interface StepSummary {
  type: 'swap' | 'bridge' | 'cross';
  tool: string;
  fromChain: number;
  toChain: number;
  fromToken: string;
  toToken: string;
  fromAmount: string;
  toAmount: string;
  durationSeconds: number;
}

export interface RouteComparison {
  recommended: QuoteSummary | null;
  fastest: QuoteSummary | null;
  cheapest: QuoteSummary | null;
  allRoutes: QuoteSummary[];
  totalRoutesFound: number;
  unavailableCount: number;
}

export interface TransactionStatusSummary {
  status: 'NOT_FOUND' | 'PENDING' | 'DONE' | 'FAILED' | 'INVALID';
  statusMessage: string;

  // Source transaction
  sourceTxHash: string;
  sourceChainId: number;
  sourceAmount: string;
  sourceToken: string;
  sourceAmountUSD?: string;

  // Destination transaction (if completed)
  destTxHash?: string;
  destChainId: number;
  destAmount?: string;
  destToken?: string;
  destAmountUSD?: string;

  // Links
  explorerLink?: string;
  lifiExplorerLink?: string;

  // Tool used
  bridge?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function formatAmount(amount: string, decimals: number): string {
  const num = BigInt(amount);
  const divisor = BigInt(10 ** decimals);
  const whole = num / divisor;
  const fraction = num % divisor;

  if (fraction === BigInt(0)) {
    return whole.toString();
  }

  const fractionStr = fraction.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${whole}.${fractionStr}`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`;
}

function quoteToSummary(quote: LiFiQuote | LiFiRoute): QuoteSummary {
  // Type-safe access using type guards
  const asQuote = quote as LiFiQuote;
  const asRoute = quote as LiFiRoute;

  const fromToken = asQuote.action?.fromToken || asRoute.fromToken;
  const toToken = asQuote.action?.toToken || asRoute.toToken;
  const fromAmount = asQuote.action?.fromAmount || asRoute.fromAmount;
  const toAmount = asQuote.estimate?.toAmount || asRoute.toAmount;
  const toAmountMin = asQuote.estimate?.toAmountMin || asRoute.toAmountMin;

  // Calculate costs
  let gasUSD = '0';
  let feesUSD = '0';

  if (asQuote.estimate?.gasCosts) {
    gasUSD = asQuote.estimate.gasCosts
      .reduce((sum: number, cost: { amountUSD?: string }) => sum + parseFloat(cost.amountUSD || '0'), 0)
      .toFixed(2);
  }

  if (asQuote.estimate?.feeCosts) {
    feesUSD = asQuote.estimate.feeCosts
      .reduce((sum: number, cost: { amountUSD?: string }) => sum + parseFloat(cost.amountUSD || '0'), 0)
      .toFixed(2);
  }

  // For routes, use the gasCostUSD field
  if (asRoute.gasCostUSD) {
    gasUSD = asRoute.gasCostUSD;
  }

  const totalCostUSD = (parseFloat(gasUSD) + parseFloat(feesUSD)).toFixed(2);

  // Calculate duration from steps
  let totalDuration = asQuote.estimate?.executionDuration || 0;
  const steps: StepSummary[] = [];

  const includedSteps = asQuote.includedSteps || asRoute.steps || [];
  for (const step of includedSteps) {
    if (step.estimate?.executionDuration) {
      totalDuration += step.estimate.executionDuration;
    }

    steps.push({
      type: step.type === 'cross' ? 'bridge' : step.type as 'swap' | 'bridge' | 'cross',
      tool: step.tool,
      fromChain: step.action.fromChainId,
      toChain: step.action.toChainId,
      fromToken: step.action.fromToken.symbol,
      toToken: step.action.toToken.symbol,
      fromAmount: formatAmount(step.action.fromAmount, step.action.fromToken.decimals),
      toAmount: formatAmount(step.estimate?.toAmount || '0', step.action.toToken.decimals),
      durationSeconds: step.estimate?.executionDuration || 0,
    });
  }

  // Find bridge step
  const bridgeStep = steps.find((s) => s.type === 'bridge');

  return {
    fromChain: {
      id: asQuote.action?.fromChainId || asRoute.fromChainId,
    },
    toChain: {
      id: asQuote.action?.toChainId || asRoute.toChainId,
    },
    fromToken: {
      symbol: fromToken.symbol,
      address: fromToken.address,
      decimals: fromToken.decimals,
    },
    toToken: {
      symbol: toToken.symbol,
      address: toToken.address,
      decimals: toToken.decimals,
    },
    fromAmount,
    fromAmountFormatted: formatAmount(fromAmount, fromToken.decimals),
    toAmount,
    toAmountFormatted: formatAmount(toAmount, toToken.decimals),
    toAmountMin,
    toAmountMinFormatted: formatAmount(toAmountMin, toToken.decimals),
    estimatedGasUSD: gasUSD,
    estimatedFeesUSD: feesUSD,
    totalCostUSD,
    estimatedDurationSeconds: totalDuration,
    estimatedDurationFormatted: formatDuration(totalDuration),
    toolUsed: asQuote.tool || asRoute.steps?.[0]?.tool || 'unknown',
    bridgeUsed: bridgeStep?.tool,
    steps,
  };
}

// ============================================================================
// Tool Functions
// ============================================================================

/**
 * Get a single best quote for a cross-chain or same-chain swap
 */
export async function getQuote(
  client: LiFiClient,
  fromChain: number | string,
  toChain: number | string,
  fromToken: string,
  toToken: string,
  fromAmount: string,
  options?: {
    fromAddress?: string;
    toAddress?: string;
    slippage?: number;
    order?: 'RECOMMENDED' | 'FASTEST' | 'CHEAPEST' | 'SAFEST';
  }
): Promise<LiFiResponse<QuoteSummary>> {
  const request: QuoteRequest = {
    fromChain,
    toChain,
    fromToken,
    toToken,
    fromAmount,
    fromAddress: options?.fromAddress,
    toAddress: options?.toAddress,
    slippage: options?.slippage,
    order: options?.order,
  };

  const response = await client.getQuote(request);

  return {
    data: quoteToSummary(response.data),
    confidence: response.confidence,
    timestamp: response.timestamp,
  };
}

/**
 * Get multiple routes for comparison
 */
export async function getRoutes(
  client: LiFiClient,
  fromChain: number | string,
  toChain: number | string,
  fromToken: string,
  toToken: string,
  fromAmount: string,
  options?: {
    fromAddress?: string;
    toAddress?: string;
    slippage?: number;
  }
): Promise<LiFiResponse<RouteComparison>> {
  const request: QuoteRequest = {
    fromChain,
    toChain,
    fromToken,
    toToken,
    fromAmount,
    fromAddress: options?.fromAddress,
    toAddress: options?.toAddress,
    slippage: options?.slippage,
  };

  const response = await client.getRoutes(request);

  const routes = response.data.routes || [];
  const summaries = routes.map((route) => quoteToSummary(route));

  // Find recommended (first), fastest, and cheapest
  let recommended: QuoteSummary | null = summaries[0] || null;
  let fastest: QuoteSummary | null = null;
  let cheapest: QuoteSummary | null = null;

  for (const summary of summaries) {
    if (!fastest || summary.estimatedDurationSeconds < fastest.estimatedDurationSeconds) {
      fastest = summary;
    }
    if (!cheapest || parseFloat(summary.totalCostUSD) < parseFloat(cheapest.totalCostUSD)) {
      cheapest = summary;
    }
  }

  const unavailableCount =
    (response.data.unavailableRoutes?.filteredOut?.length || 0) +
    (response.data.unavailableRoutes?.failed?.length || 0);

  return {
    data: {
      recommended,
      fastest,
      cheapest,
      allRoutes: summaries,
      totalRoutesFound: summaries.length,
      unavailableCount,
    },
    confidence: response.confidence,
    timestamp: response.timestamp,
  };
}

/**
 * Get transaction status for a cross-chain transfer
 */
export async function getTransactionStatus(
  client: LiFiClient,
  txHash: string,
  fromChain: number | string,
  toChain: number | string
): Promise<LiFiResponse<TransactionStatusSummary>> {
  try {
    const response = await client.getStatus(txHash, fromChain, toChain);
    const data = response.data;

    let statusMessage = '';
    switch (data.status) {
      case 'NOT_FOUND':
        statusMessage = 'Transaction not found';
        break;
      case 'PENDING':
        statusMessage = data.substatusMessage || 'Transaction is pending';
        break;
      case 'DONE':
        statusMessage = 'Transaction completed successfully';
        break;
      case 'FAILED':
        statusMessage = data.substatusMessage || 'Transaction failed';
        break;
      case 'INVALID':
        statusMessage = 'Invalid transaction';
        break;
    }

    return {
      data: {
        status: data.status,
        statusMessage,
        sourceTxHash: data.sending?.txHash || txHash,
        sourceChainId: data.sending?.chainId || Number(fromChain),
        sourceAmount: data.sending?.amount || '0',
        sourceToken: data.sending?.token?.symbol || 'UNKNOWN',
        sourceAmountUSD: data.sending?.amountUSD,
        destTxHash: data.receiving?.txHash,
        destChainId: data.receiving?.chainId || Number(toChain),
        destAmount: data.receiving?.amount,
        destToken: data.receiving?.token?.symbol,
        destAmountUSD: data.receiving?.amountUSD,
        explorerLink: data.receiving?.txLink || data.sending?.txLink,
        lifiExplorerLink: data.lifiExplorerLink,
        bridge: data.tool,
      },
      confidence: response.confidence,
      timestamp: response.timestamp,
    };
  } catch (error) {
    // Handle 400/404 errors as NOT_FOUND
    return {
      data: {
        status: 'NOT_FOUND',
        statusMessage: 'Transaction not found',
        sourceTxHash: txHash,
        sourceChainId: Number(fromChain),
        sourceAmount: '0',
        sourceToken: 'UNKNOWN',
        destChainId: Number(toChain),
      },
      confidence: {
        score: 1.0,
        freshness: 'live',
        source: 'li.fi',
        latencyMs: 0,
        healthy: true,
      },
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Check if a route exists between two chains for specific tokens
 * Uses the tools endpoint to find available bridges
 */
export async function canBridge(
  client: LiFiClient,
  fromChain: number | string,
  toChain: number | string,
  _fromToken?: string,  // Reserved for future token-specific checks
  _toToken?: string     // Reserved for future token-specific checks
): Promise<LiFiResponse<{ canBridge: boolean; availableBridges: string[] }>> {
  try {
    // Get available tools (bridges)
    const toolsResponse = await client.getTools();
    const bridges = toolsResponse.data.bridges || [];

    const fromChainId = Number(fromChain);
    const toChainId = Number(toChain);

    // Find bridges that support this chain pair
    const availableBridges: string[] = [];

    for (const bridge of bridges) {
      const supportedChains = bridge.supportedChains || [];
      const hasRoute = supportedChains.some(
        (route: { fromChainId: number; toChainId: number }) =>
          route.fromChainId === fromChainId && route.toChainId === toChainId
      );

      if (hasRoute) {
        availableBridges.push(bridge.key);
      }
    }

    return {
      data: {
        canBridge: availableBridges.length > 0,
        availableBridges,
      },
      confidence: toolsResponse.confidence,
      timestamp: toolsResponse.timestamp,
    };
  } catch {
    return {
      data: {
        canBridge: false,
        availableBridges: [],
      },
      confidence: {
        score: 0.5,
        freshness: 'live',
        source: 'li.fi',
        latencyMs: 0,
        healthy: true,
      },
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Get a human-readable quote summary for a cross-chain swap
 * Useful for chatbot responses
 */
export async function getQuoteDescription(
  client: LiFiClient,
  fromChain: number | string,
  toChain: number | string,
  fromToken: string,
  toToken: string,
  fromAmount: string,
  options?: {
    fromAddress?: string;
    slippage?: number;
  }
): Promise<LiFiResponse<string>> {
  const quoteResponse = await getQuote(
    client,
    fromChain,
    toChain,
    fromToken,
    toToken,
    fromAmount,
    options
  );

  const q = quoteResponse.data;

  const description = [
    `💱 **Cross-Chain Quote**`,
    ``,
    `**From:** ${q.fromAmountFormatted} ${q.fromToken.symbol} (Chain ${q.fromChain.id})`,
    `**To:** ${q.toAmountFormatted} ${q.toToken.symbol} (Chain ${q.toChain.id})`,
    `**Minimum Received:** ${q.toAmountMinFormatted} ${q.toToken.symbol}`,
    ``,
    `**Estimated Cost:** $${q.totalCostUSD}`,
    `**Estimated Time:** ${q.estimatedDurationFormatted}`,
    `**Route:** ${q.bridgeUsed || q.toolUsed}`,
    ``,
    `**Steps:**`,
    ...q.steps.map(
      (s, i) =>
        `${i + 1}. ${s.type.toUpperCase()}: ${s.fromAmount} ${s.fromToken} → ${s.toAmount} ${s.toToken} via ${s.tool}`
    ),
  ].join('\n');

  return {
    data: description,
    confidence: quoteResponse.confidence,
    timestamp: quoteResponse.timestamp,
  };
}

// Re-export chain IDs for convenience
export { LIFI_CHAIN_IDS };

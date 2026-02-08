import { DueAiSuiClient } from '../clients/sui-client.js';
import { formatBalance } from './sui-balance.js';

// Known token decimals (same as sui-balance.ts)
const TOKEN_DECIMALS: Record<string, number> = {
  SUI: 9,
  USDC: 6,
  USDT: 6,
  WETH: 8,
  WBTC: 8,
};

const SUI_COIN_TYPE = '0x2::sui::SUI';

// ============================================================================
// Interfaces
// ============================================================================

export interface BuildTransferRequest {
  sender: string;
  recipient: string;
  amount: string; // Human-readable amount (e.g., "1.5")
  coinType?: string; // Full coin type path; defaults to SUI
  gasBudget?: string; // Optional gas budget in MIST
}

export interface GasEstimate {
  computationCost: string;
  storageCost: string;
  storageRebate: string;
  totalGasCost: string;
  totalGasCostFormatted: string;
}

export interface PaymentSummary {
  sender: string;
  recipient: string;
  amount: string;
  amountFormatted: string;
  symbol: string;
  coinType: string;
  network: string;
  gasEstimate: GasEstimate;
}

export interface BuildTransferResponse {
  txBytes: string; // Base64-encoded unsigned transaction bytes
  paymentSummary: PaymentSummary;
  message: string; // Human-readable summary for the user
}

export interface ExecuteSignedTxRequest {
  txBytes: string; // Base64-encoded transaction bytes
  signature: string; // Base64-encoded signature (flag || sig || pubkey)
}

export interface ExecuteSignedTxResponse {
  digest: string;
  status: string;
  gasUsed: GasEstimate;
  explorerUrl: string;
  balanceChanges: Array<{
    owner: string;
    coinType: string;
    amount: string;
  }>;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Extract token symbol from a full coin type path.
 * e.g., "0x2::sui::SUI" -> "SUI"
 */
export function extractSymbol(coinType: string): string {
  return coinType.split('::').pop() || 'UNKNOWN';
}

/**
 * Convert a human-readable amount to the smallest unit (e.g., SUI -> MIST).
 */
export function toSmallestUnit(amount: string, decimals: number): bigint {
  const parts = amount.split('.');
  const wholePart = parts[0] || '0';
  let fractionalPart = parts[1] || '';

  // Pad or truncate fractional part to the correct number of decimals
  if (fractionalPart.length > decimals) {
    fractionalPart = fractionalPart.slice(0, decimals);
  } else {
    fractionalPart = fractionalPart.padEnd(decimals, '0');
  }

  return BigInt(wholePart + fractionalPart);
}

function parseGasFromEffects(effects: any): GasEstimate {
  const gasUsed = effects?.gasUsed || {};
  const computation = BigInt(gasUsed.computationCost || '0');
  const storage = BigInt(gasUsed.storageCost || '0');
  const rebate = BigInt(gasUsed.storageRebate || '0');
  const total = computation + storage - rebate;

  return {
    computationCost: computation.toString(),
    storageCost: storage.toString(),
    storageRebate: rebate.toString(),
    totalGasCost: total.toString(),
    totalGasCostFormatted: formatBalance(total, 9) + ' SUI',
  };
}

// ============================================================================
// Tool Functions
// ============================================================================

/**
 * Build an unsigned SUI transfer transaction.
 * Returns serialized tx bytes, payment summary, and gas estimate.
 */
export async function buildSuiTransfer(
  client: DueAiSuiClient,
  request: BuildTransferRequest
): Promise<BuildTransferResponse> {
  const { sender, recipient, amount, gasBudget } = request;
  const coinType = request.coinType || SUI_COIN_TYPE;
  const symbol = extractSymbol(coinType);
  const decimals = TOKEN_DECIMALS[symbol] || 9;

  // Validate addresses
  if (!sender || !sender.startsWith('0x')) {
    throw new Error('Invalid sender address. Must start with 0x');
  }
  if (!recipient || !recipient.startsWith('0x')) {
    throw new Error('Invalid recipient address. Must start with 0x');
  }
  if (sender === recipient) {
    throw new Error('Sender and recipient cannot be the same address');
  }

  // Convert human-readable amount to smallest unit
  const amountSmallest = toSmallestUnit(amount, decimals);
  if (amountSmallest <= BigInt(0)) {
    throw new Error('Amount must be greater than 0');
  }

  const gasBudgetBigInt = gasBudget ? BigInt(gasBudget) : undefined;

  // Build the transaction
  let txBytes: string;
  const isNativeSui = coinType === SUI_COIN_TYPE;

  if (isNativeSui) {
    const result = await client.buildSuiTransfer(sender, recipient, amountSmallest, gasBudgetBigInt);
    txBytes = result.txBytes;
  } else {
    const result = await client.buildCoinTransfer(sender, recipient, amountSmallest, coinType, gasBudgetBigInt);
    txBytes = result.txBytes;
  }

  // Dry-run to estimate gas
  const dryRunResult = await client.dryRunTransaction(txBytes);
  const gasEstimate = parseGasFromEffects(dryRunResult.effects);

  const amountFormatted = formatBalance(amountSmallest, decimals);
  const network = client.getNetwork();

  const paymentSummary: PaymentSummary = {
    sender,
    recipient,
    amount: amountSmallest.toString(),
    amountFormatted,
    symbol,
    coinType,
    network,
    gasEstimate,
  };

  const message =
    `Transfer ${amountFormatted} ${symbol} from ${sender.slice(0, 8)}...${sender.slice(-4)} ` +
    `to ${recipient.slice(0, 8)}...${recipient.slice(-4)} on ${network}. ` +
    `Estimated gas: ${gasEstimate.totalGasCostFormatted}. ` +
    `Please sign the transaction bytes to proceed.`;

  return {
    txBytes,
    paymentSummary,
    message,
  };
}

/**
 * Execute a signed transaction on the Sui network.
 */
export async function executeSignedTransaction(
  client: DueAiSuiClient,
  request: ExecuteSignedTxRequest
): Promise<ExecuteSignedTxResponse> {
  const { txBytes, signature } = request;

  if (!txBytes) {
    throw new Error('txBytes is required');
  }
  if (!signature) {
    throw new Error('signature is required');
  }

  const result = await client.executeSignedTransaction(txBytes, signature);

  const digest = result.digest;
  const status = result.effects?.status?.status || 'unknown';
  const gasUsed = parseGasFromEffects(result.effects);
  const explorerUrl = client.getExplorerUrl(digest);

  const balanceChanges = (result.balanceChanges || []).map((change) => ({
    owner: typeof change.owner === 'object' && 'AddressOwner' in change.owner
      ? change.owner.AddressOwner
      : JSON.stringify(change.owner),
    coinType: change.coinType,
    amount: change.amount,
  }));

  if (status === 'failure') {
    const errorMsg = result.effects?.status?.error || 'Transaction failed';
    throw new Error(`Transaction failed: ${errorMsg}`);
  }

  return {
    digest,
    status,
    gasUsed,
    explorerUrl,
    balanceChanges,
  };
}

import { DueAiSuiClient } from '../clients/sui-client.js';

export interface BalanceRequest {
  address: string;
  tokenType?: string; // Optional: get specific token balance only
}

export interface BalanceResponse {
  address: string;
  balances: Record<string, string>; // String for JSON serialization
  totalCoins: number;
  network: string;
}

export interface TokenBalanceResponse {
  address: string;
  tokenType: string;
  balance: string;
  network: string;
}

export interface Asset {
  symbol: string;
  coinType: string; // Full type path e.g., "0x2::sui::SUI"
  balance: string;
  formattedBalance: string;
  decimals: number;
}

export interface UserAssetsResponse {
  address: string;
  assets: Asset[];
  totalAssets: number;
  network: string;
}

// Known token decimals (add more as needed)
const TOKEN_DECIMALS: Record<string, number> = {
  SUI: 9,
  USDC: 6,
  USDT: 6,
  WETH: 8,
  WBTC: 8,
};

/**
 * Get all token balances for a Sui wallet
 */
export async function getBalance(
  client: DueAiSuiClient,
  address: string
): Promise<BalanceResponse> {
  const result = await client.getBalance(address);

  // Convert BigInt to string for JSON serialization
  const balances: Record<string, string> = {};
  for (const [token, balance] of Object.entries(result.balances)) {
    balances[token] = balance.toString();
  }

  return {
    address: result.address,
    balances,
    totalCoins: result.totalCoins,
    network: client.getNetwork(),
  };
}

/**
 * List all assets (tokens) a user holds with their balances
 */
export async function listUserAssets(
  client: DueAiSuiClient,
  address: string
): Promise<UserAssetsResponse> {
  const result = await client.getBalance(address);

  const assets: Asset[] = [];

  for (const [symbol, balance] of Object.entries(result.balances)) {
    const decimals = TOKEN_DECIMALS[symbol] || 9; // Default to 9 decimals
    const coinType = result.coinTypes[symbol] || `unknown::${symbol}`;

    assets.push({
      symbol,
      coinType,
      balance: balance.toString(),
      formattedBalance: formatBalance(balance, decimals),
      decimals,
    });
  }

  // Sort by symbol for consistent ordering
  assets.sort((a, b) => a.symbol.localeCompare(b.symbol));

  return {
    address,
    assets,
    totalAssets: assets.length,
    network: client.getNetwork(),
  };
}

/**
 * Get balance of a specific token
 */
export async function getTokenBalance(
  client: DueAiSuiClient,
  address: string,
  tokenType: string
): Promise<TokenBalanceResponse> {
  const balance = await client.getTokenBalance(address, tokenType);

  return {
    address,
    tokenType,
    balance: balance.toString(),
    network: client.getNetwork(),
  };
}

/**
 * Format balance to human-readable string with decimals
 * SUI has 9 decimals, USDC typically has 6
 */
export function formatBalance(
  balance: bigint | string,
  decimals: number = 9
): string {
  const balanceBigInt = typeof balance === 'string' ? BigInt(balance) : balance;
  const divisor = BigInt(10 ** decimals);
  const wholePart = balanceBigInt / divisor;
  const fractionalPart = balanceBigInt % divisor;

  // Pad fractional part with leading zeros
  const fractionalStr = fractionalPart.toString().padStart(decimals, '0');

  // Remove trailing zeros for cleaner display
  const trimmedFractional = fractionalStr.replace(/0+$/, '') || '0';

  if (trimmedFractional === '0') {
    return wholePart.toString();
  }

  return `${wholePart}.${trimmedFractional}`;
}

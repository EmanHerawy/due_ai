import { SuiClient, getFullnodeUrl } from '@mysten/sui.js/client';

export type SuiNetwork = 'mainnet' | 'testnet' | 'devnet';

export interface CoinBalance {
  coinType: string;
  coinObjectId: string;
  balance: string;
}

export interface WalletBalances {
  address: string;
  balances: Record<string, bigint>;
  coinTypes: Record<string, string>; // symbol -> full coin type
  totalCoins: number;
}

export class DueAiSuiClient {
  private client: SuiClient;
  private network: SuiNetwork;

  constructor(network: SuiNetwork = 'testnet') {
    this.network = network;
    this.client = new SuiClient({ url: getFullnodeUrl(network) });
  }

  /**
   * Get the underlying Sui client
   */
  getClient(): SuiClient {
    return this.client;
  }

  /**
   * Get network
   */
  getNetwork(): SuiNetwork {
    return this.network;
  }

  /**
   * Get all coin balances for a wallet address
   */
  async getBalance(address: string): Promise<WalletBalances> {
    // Validate address format
    if (!address || !address.startsWith('0x')) {
      throw new Error('Invalid Sui address format. Must start with 0x');
    }

    try {
      const coins = await this.client.getAllCoins({ owner: address });

      // Aggregate balances by coin type
      const balances: Record<string, bigint> = {};
      const coinTypes: Record<string, string> = {};

      for (const coin of coins.data) {
        // Extract the token name from the full type path
        // e.g., "0x2::sui::SUI" -> "SUI"
        const symbol = coin.coinType.split('::').pop() || 'UNKNOWN';
        const currentBalance = balances[symbol] || BigInt(0);
        balances[symbol] = currentBalance + BigInt(coin.balance);
        coinTypes[symbol] = coin.coinType; // Store full type path
      }

      return {
        address,
        balances,
        coinTypes,
        totalCoins: coins.data.length,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to fetch balance: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Get balance of a specific token type
   */
  async getTokenBalance(address: string, tokenType: string): Promise<bigint> {
    const { balances } = await this.getBalance(address);
    return balances[tokenType] || BigInt(0);
  }

  /**
   * Check if an address has a minimum balance of a token
   */
  async hasMinimumBalance(
    address: string,
    tokenType: string,
    minAmount: bigint
  ): Promise<boolean> {
    const balance = await this.getTokenBalance(address, tokenType);
    return balance >= minAmount;
  }
}

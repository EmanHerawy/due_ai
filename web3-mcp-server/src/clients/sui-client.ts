import { SuiClient, getFullnodeUrl } from '@mysten/sui.js/client';
import type { DryRunTransactionBlockResponse, SuiTransactionBlockResponse } from '@mysten/sui.js/client';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { toB64 } from '@mysten/sui.js/utils';

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

  /**
   * Build an unsigned native SUI transfer transaction.
   * Uses splitCoins(tx.gas) to split the exact amount from the gas coin.
   */
  async buildSuiTransfer(
    sender: string,
    recipient: string,
    amountMist: bigint,
    gasBudget?: bigint
  ): Promise<{ txBytes: string; tx: TransactionBlock }> {
    const tx = new TransactionBlock();
    tx.setSender(sender);

    const [coin] = tx.splitCoins(tx.gas, [amountMist]);
    tx.transferObjects([coin], recipient);

    if (gasBudget) {
      tx.setGasBudget(gasBudget);
    }

    const txBytes = await tx.build({ client: this.client });
    return { txBytes: toB64(txBytes), tx };
  }

  /**
   * Build an unsigned transfer for a non-SUI coin type.
   * Fetches the sender's coins, merges if needed, splits the exact amount, and transfers.
   */
  async buildCoinTransfer(
    sender: string,
    recipient: string,
    amount: bigint,
    coinType: string,
    gasBudget?: bigint
  ): Promise<{ txBytes: string; tx: TransactionBlock }> {
    // Fetch coins of the specified type
    const coins = await this.client.getCoins({ owner: sender, coinType });
    if (coins.data.length === 0) {
      throw new Error(`No coins of type ${coinType} found for address ${sender}`);
    }

    // Check total balance
    const totalBalance = coins.data.reduce((sum, c) => sum + BigInt(c.balance), BigInt(0));
    if (totalBalance < amount) {
      throw new Error(
        `Insufficient balance: have ${totalBalance.toString()} but need ${amount.toString()} of ${coinType}`
      );
    }

    const tx = new TransactionBlock();
    tx.setSender(sender);

    if (gasBudget) {
      tx.setGasBudget(gasBudget);
    }

    // Use the first coin as primary, merge others into it if needed
    const primaryCoin = tx.object(coins.data[0].coinObjectId);

    if (coins.data.length > 1) {
      const otherCoins = coins.data.slice(1).map((c) => tx.object(c.coinObjectId));
      tx.mergeCoins(primaryCoin, otherCoins);
    }

    const [splitCoin] = tx.splitCoins(primaryCoin, [amount]);
    tx.transferObjects([splitCoin], recipient);

    const txBytes = await tx.build({ client: this.client });
    return { txBytes: toB64(txBytes), tx };
  }

  /**
   * Dry-run a transaction to estimate gas costs without executing it.
   */
  async dryRunTransaction(txBytes: string): Promise<DryRunTransactionBlockResponse> {
    return this.client.dryRunTransactionBlock({ transactionBlock: txBytes });
  }

  /**
   * Execute a signed transaction on the Sui network.
   */
  async executeSignedTransaction(
    txBytes: string,
    signature: string
  ): Promise<SuiTransactionBlockResponse> {
    return this.client.executeTransactionBlock({
      transactionBlock: txBytes,
      signature,
      options: {
        showEffects: true,
        showEvents: true,
        showBalanceChanges: true,
      },
    });
  }

  /**
   * Get explorer URL for a transaction digest.
   */
  getExplorerUrl(digest: string): string {
    return `https://suiscan.xyz/${this.network}/tx/${digest}`;
  }
}

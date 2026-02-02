import { describe, it, expect, beforeAll } from 'vitest';
import { LiFiClient, LIFI_CHAIN_IDS } from '../src/clients/lifi-client.js';
import {
  getGasPrice,
  compareGasPrices,
  estimateTransactionCost,
  getWalletBalances,
  getWalletBalanceOnChain,
  formatWalletBalances,
  formatGasComparison,
} from '../src/tools/lifi-gas.js';

describe('LI.FI Observer Agent - Gas & Wallet', () => {
  let client: LiFiClient;

  // Common token addresses
  const TOKENS = {
    ETH_USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    ETH_USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    POLYGON_USDC: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // USDC.e on Polygon
    ARB_USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // Native USDC on Arbitrum
    // Native ETH address used by LI.FI
    NATIVE_ETH: '0x0000000000000000000000000000000000000000',
  };

  // Test wallet with known balances (vitalik.eth)
  const TEST_WALLET = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

  beforeAll(() => {
    client = new LiFiClient();
  });

  describe('getGasPrice', () => {
    it('should get gas price for Ethereum', async () => {
      const response = await getGasPrice(client, LIFI_CHAIN_IDS.ETHEREUM);

      expect(response.data.chainId).toBe(LIFI_CHAIN_IDS.ETHEREUM);
      expect(response.data.chainName).toBe('Ethereum');
      expect(response.data.standard.price).toBeTruthy();
      expect(response.data.standard.priceGwei).toBeTruthy();
      expect(response.data.fast.price).toBeTruthy();
      expect(response.data.instant.price).toBeTruthy();

      console.log(`  Ethereum Gas Prices:`);
      console.log(`    Standard: ${response.data.standard.priceGwei} gwei`);
      console.log(`    Fast: ${response.data.fast.priceGwei} gwei`);
      console.log(`    Instant: ${response.data.instant.priceGwei} gwei`);
    }, 15000);

    it('should get gas price for Polygon', async () => {
      const response = await getGasPrice(client, LIFI_CHAIN_IDS.POLYGON);

      expect(response.data.chainId).toBe(LIFI_CHAIN_IDS.POLYGON);
      expect(response.data.chainName).toBe('Polygon');
      expect(response.data.standard.price).toBeTruthy();

      console.log(`  Polygon Gas: ${response.data.standard.priceGwei} gwei`);
    }, 15000);

    it('should get gas price for Arbitrum', async () => {
      const response = await getGasPrice(client, LIFI_CHAIN_IDS.ARBITRUM);

      expect(response.data.chainId).toBe(LIFI_CHAIN_IDS.ARBITRUM);
      expect(response.data.chainName).toBe('Arbitrum');

      console.log(`  Arbitrum Gas: ${response.data.standard.priceGwei} gwei`);
    }, 15000);

    it('should include confidence scoring', async () => {
      const response = await getGasPrice(client, LIFI_CHAIN_IDS.ETHEREUM);

      expect(response.confidence).toHaveProperty('score');
      expect(response.confidence).toHaveProperty('latencyMs');
      expect(response.confidence.source).toBe('li.fi');
    }, 15000);
  });

  describe('compareGasPrices', () => {
    it('should compare gas prices across multiple chains', async () => {
      const response = await compareGasPrices(client, [
        LIFI_CHAIN_IDS.ETHEREUM,
        LIFI_CHAIN_IDS.POLYGON,
        LIFI_CHAIN_IDS.ARBITRUM,
      ]);

      expect(response.data.chains.length).toBe(3);
      expect(response.data.cheapest).toBeDefined();
      expect(response.data.mostExpensive).toBeDefined();

      console.log(`  Cheapest: ${response.data.cheapest.chainName}`);
      console.log(`  Most Expensive: ${response.data.mostExpensive.chainName}`);
    }, 30000);

    it('should use default chains when none specified', async () => {
      const response = await compareGasPrices(client);

      expect(response.data.chains.length).toBeGreaterThan(0);
      expect(response.data.cheapest).toBeDefined();

      console.log(`  Compared ${response.data.chains.length} chains`);
    }, 45000);

    it('should format gas comparison as readable string', async () => {
      const response = await compareGasPrices(client, [
        LIFI_CHAIN_IDS.ETHEREUM,
        LIFI_CHAIN_IDS.POLYGON,
      ]);

      const formatted = formatGasComparison(response.data);

      expect(formatted).toContain('Gas Price Comparison');
      expect(formatted).toContain('Ethereum');
      expect(formatted).toContain('Polygon');
      expect(formatted).toContain('Cheapest');

      console.log('\n' + formatted);
    }, 30000);
  });

  describe('estimateTransactionCost', () => {
    it('should estimate cost for cross-chain USDC transfer (or handle rate limit)', async () => {
      const response = await estimateTransactionCost(
        client,
        LIFI_CHAIN_IDS.ETHEREUM,
        LIFI_CHAIN_IDS.POLYGON,
        TOKENS.ETH_USDC,
        TOKENS.POLYGON_USDC,
        '1000000' // 1 USDC (6 decimals)
      );

      expect(response.data.chainId).toBe(LIFI_CHAIN_IDS.ETHEREUM);
      expect(parseFloat(response.data.totalCostUSD)).toBeGreaterThanOrEqual(0);

      if (response.confidence.score === 0) {
        console.log(`  Rate limited - cost estimate unavailable`);
      } else {
        console.log(`  Cross-chain USDC transfer cost:`);
        console.log(`    Gas: $${response.data.gasCostUSD}`);
        console.log(`    Bridge fees: $${response.data.bridgeFeeUSD || '0'}`);
        console.log(`    Total: $${response.data.totalCostUSD}`);
      }
    }, 20000);

    it('should estimate cost for same-chain swap (or handle rate limit)', async () => {
      const response = await estimateTransactionCost(
        client,
        LIFI_CHAIN_IDS.ETHEREUM,
        LIFI_CHAIN_IDS.ETHEREUM,
        TOKENS.NATIVE_ETH,
        TOKENS.ETH_USDC,
        '100000000000000000' // 0.1 ETH
      );

      expect(response.data.chainId).toBe(LIFI_CHAIN_IDS.ETHEREUM);
      expect(parseFloat(response.data.totalCostUSD)).toBeGreaterThanOrEqual(0);

      if (response.confidence.score === 0) {
        console.log(`  Rate limited - cost estimate unavailable`);
      } else {
        console.log(`  Same-chain ETH->USDC swap cost: $${response.data.totalCostUSD}`);
      }
    }, 20000);

    it('should include cost breakdown (or handle rate limit)', async () => {
      const response = await estimateTransactionCost(
        client,
        LIFI_CHAIN_IDS.ETHEREUM,
        LIFI_CHAIN_IDS.ARBITRUM,
        TOKENS.ETH_USDC,
        TOKENS.ARB_USDC,
        '1000000' // 1 USDC
      );

      expect(response.data.breakdown).toBeDefined();
      expect(Array.isArray(response.data.breakdown)).toBe(true);

      if (response.confidence.score === 0) {
        console.log(`  Rate limited - breakdown unavailable`);
      } else {
        console.log(`  Cost breakdown for ETH->ARB bridge:`);
        for (const item of response.data.breakdown) {
          console.log(`    - ${item.description}: $${item.amountUSD}`);
        }
      }
    }, 20000);

    it('should include confidence scoring', async () => {
      const response = await estimateTransactionCost(
        client,
        LIFI_CHAIN_IDS.ETHEREUM,
        LIFI_CHAIN_IDS.POLYGON,
        TOKENS.ETH_USDC,
        TOKENS.POLYGON_USDC,
        '1000000' // 1 USDC
      );

      expect(response.confidence).toHaveProperty('score');
      expect(response.confidence).toHaveProperty('latencyMs');
    }, 20000);
  });

  describe('getWalletBalances', () => {
    it('should get wallet balances across chains (or handle rate limit)', async () => {
      const response = await getWalletBalances(client, TEST_WALLET, [
        LIFI_CHAIN_IDS.ETHEREUM,
        LIFI_CHAIN_IDS.POLYGON,
      ]);

      expect(response.data.address).toBe(TEST_WALLET);
      expect(response.data.totalValueUSD).toBeGreaterThanOrEqual(0);

      if (response.confidence.score === 0) {
        console.log(`  Rate limited - balances unavailable`);
      } else {
        console.log(`  Wallet ${TEST_WALLET.slice(0, 8)}... balance:`);
        console.log(`    Total: $${response.data.totalValueUSD.toLocaleString()}`);
        console.log(`    Chains: ${response.data.chainCount}`);
        console.log(`    Tokens: ${response.data.tokenCount}`);
      }
    }, 30000);

    it('should sort tokens by value (when not rate limited)', async () => {
      const response = await getWalletBalances(client, TEST_WALLET, [
        LIFI_CHAIN_IDS.ETHEREUM,
      ]);

      // Skip test if rate limited
      if (response.confidence.score === 0) {
        console.log('  Skipped - rate limited');
        return;
      }

      if (response.data.chains.length > 0 && response.data.chains[0].tokens.length > 1) {
        const tokens = response.data.chains[0].tokens;
        // Verify sorted by value descending
        for (let i = 1; i < tokens.length; i++) {
          expect(tokens[i - 1].valueUSD).toBeGreaterThanOrEqual(tokens[i].valueUSD);
        }
      }
    }, 15000);

    it('should include token details (when not rate limited)', async () => {
      const response = await getWalletBalances(client, TEST_WALLET, [
        LIFI_CHAIN_IDS.ETHEREUM,
      ]);

      // Skip test if rate limited
      if (response.confidence.score === 0) {
        console.log('  Skipped - rate limited');
        return;
      }

      if (response.data.chains.length > 0 && response.data.chains[0].tokens.length > 0) {
        const token = response.data.chains[0].tokens[0];
        expect(token.symbol).toBeTruthy();
        expect(token.address).toBeTruthy();
        expect(token.decimals).toBeGreaterThan(0);
        expect(token.balanceFormatted).toBeTruthy();
      }
    }, 15000);
  });

  describe('getWalletBalanceOnChain', () => {
    it('should get balance for specific chain (or handle rate limit)', async () => {
      const response = await getWalletBalanceOnChain(
        client,
        TEST_WALLET,
        LIFI_CHAIN_IDS.ETHEREUM
      );

      expect(response.data.chainId).toBe(LIFI_CHAIN_IDS.ETHEREUM);

      if (response.confidence.score === 0) {
        console.log(`  Rate limited - balance unavailable`);
      } else {
        expect(response.data.chainName).toBe('Ethereum');
        console.log(`  ETH balance: $${response.data.totalValueUSD.toLocaleString()}`);
        console.log(`  Tokens: ${response.data.tokens.length}`);
      }
    }, 15000);

    it('should return empty for wallet with no balance (or handle rate limit)', async () => {
      const emptyWallet = '0x0000000000000000000000000000000000000001';
      const response = await getWalletBalanceOnChain(
        client,
        emptyWallet,
        LIFI_CHAIN_IDS.ETHEREUM
      );

      // Whether rate limited or not, should have 0 value
      expect(response.data.totalValueUSD).toBe(0);
      expect(response.data.tokens.length).toBe(0);
    }, 15000);
  });

  describe('formatWalletBalances', () => {
    it('should format balances as readable string', async () => {
      const response = await getWalletBalances(client, TEST_WALLET, [
        LIFI_CHAIN_IDS.ETHEREUM,
      ]);

      const formatted = formatWalletBalances(response.data);

      expect(formatted).toContain('Wallet Balance Summary');
      expect(formatted).toContain('Total Value');
      expect(formatted).toContain('Chains');
      expect(formatted).toContain('Tokens');

      console.log('\n' + formatted);
    }, 15000);
  });
});

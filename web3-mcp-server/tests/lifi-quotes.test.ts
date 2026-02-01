import { describe, it, expect, beforeAll } from 'vitest';
import { LiFiClient, LIFI_CHAIN_IDS } from '../src/clients/lifi-client.js';
import {
  getQuote,
  getRoutes,
  getTransactionStatus,
  canBridge,
  getQuoteDescription,
} from '../src/tools/lifi-quotes.js';

describe('LI.FI Observer Agent - Quotes', () => {
  let client: LiFiClient;

  // Common test addresses (don't need to be real for quotes)
  const TEST_ADDRESS = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';

  // Common token addresses
  const TOKENS = {
    ETH_USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    ETH_USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    ETH_NATIVE: '0x0000000000000000000000000000000000000000',
    POLYGON_USDC: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    POLYGON_NATIVE: '0x0000000000000000000000000000000000000000',
    ARB_USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    ARB_NATIVE: '0x0000000000000000000000000000000000000000',
  };

  beforeAll(() => {
    client = new LiFiClient();
  });

  describe('LiFiClient Quote Methods', () => {
    it('should fetch a quote from the API', async () => {
      const response = await client.getQuote({
        fromChain: LIFI_CHAIN_IDS.ETHEREUM,
        toChain: LIFI_CHAIN_IDS.POLYGON,
        fromToken: TOKENS.ETH_USDC,
        toToken: TOKENS.POLYGON_USDC,
        fromAmount: '1000000', // 1 USDC (6 decimals)
        fromAddress: TEST_ADDRESS,
      });

      expect(response).toHaveProperty('data');
      expect(response).toHaveProperty('confidence');
      expect(response.data).toHaveProperty('action');
      expect(response.data).toHaveProperty('estimate');
    }, 30000);

    it('should fetch routes from the API', async () => {
      const response = await client.getRoutes({
        fromChain: LIFI_CHAIN_IDS.ETHEREUM,
        toChain: LIFI_CHAIN_IDS.ARBITRUM,
        fromToken: TOKENS.ETH_USDC,
        toToken: TOKENS.ARB_USDC,
        fromAmount: '10000000', // 10 USDC
        fromAddress: TEST_ADDRESS,
      });

      expect(response).toHaveProperty('data');
      expect(response.data).toHaveProperty('routes');
      expect(Array.isArray(response.data.routes)).toBe(true);
    }, 30000);
  });

  describe('getQuote', () => {
    it('should get a quote for USDC from Ethereum to Polygon', async () => {
      const response = await getQuote(
        client,
        LIFI_CHAIN_IDS.ETHEREUM,
        LIFI_CHAIN_IDS.POLYGON,
        TOKENS.ETH_USDC,
        TOKENS.POLYGON_USDC,
        '1000000', // 1 USDC
        { fromAddress: TEST_ADDRESS }
      );

      expect(response.data).toHaveProperty('fromChain');
      expect(response.data).toHaveProperty('toChain');
      expect(response.data).toHaveProperty('fromToken');
      expect(response.data).toHaveProperty('toToken');
      expect(response.data).toHaveProperty('fromAmountFormatted');
      expect(response.data).toHaveProperty('toAmountFormatted');
      expect(response.data).toHaveProperty('totalCostUSD');
      expect(response.data).toHaveProperty('estimatedDurationFormatted');

      console.log(`  Quote: ${response.data.fromAmountFormatted} ${response.data.fromToken.symbol}`);
      console.log(`      → ${response.data.toAmountFormatted} ${response.data.toToken.symbol}`);
      console.log(`  Cost: $${response.data.totalCostUSD}`);
      console.log(`  Time: ${response.data.estimatedDurationFormatted}`);
      console.log(`  Via: ${response.data.bridgeUsed || response.data.toolUsed}`);
    }, 30000);

    it('should get a same-chain swap quote', async () => {
      const response = await getQuote(
        client,
        LIFI_CHAIN_IDS.ETHEREUM,
        LIFI_CHAIN_IDS.ETHEREUM,
        TOKENS.ETH_NATIVE, // ETH
        TOKENS.ETH_USDC,   // USDC
        '100000000000000000', // 0.1 ETH (18 decimals)
        { fromAddress: TEST_ADDRESS }
      );

      expect(response.data.fromChain.id).toBe(LIFI_CHAIN_IDS.ETHEREUM);
      expect(response.data.toChain.id).toBe(LIFI_CHAIN_IDS.ETHEREUM);
      expect(response.data.steps.length).toBeGreaterThan(0);

      console.log(`  Same-chain swap: ${response.data.fromAmountFormatted} ETH → ${response.data.toAmountFormatted} USDC`);
    }, 30000);

    it('should include confidence scoring', async () => {
      const response = await getQuote(
        client,
        LIFI_CHAIN_IDS.POLYGON,
        LIFI_CHAIN_IDS.ARBITRUM,
        TOKENS.POLYGON_USDC,
        TOKENS.ARB_USDC,
        '5000000', // 5 USDC
        { fromAddress: TEST_ADDRESS }
      );

      expect(response.confidence).toHaveProperty('score');
      expect(response.confidence).toHaveProperty('latencyMs');
      expect(response.confidence.score).toBeGreaterThan(0);
      expect(response.confidence.score).toBeLessThanOrEqual(1);

      console.log(`  Confidence: ${(response.confidence.score * 100).toFixed(0)}%`);
      console.log(`  Latency: ${response.confidence.latencyMs}ms`);
    }, 30000);
  });

  describe('getRoutes', () => {
    it('should get multiple routes for comparison', async () => {
      const response = await getRoutes(
        client,
        LIFI_CHAIN_IDS.ETHEREUM,
        LIFI_CHAIN_IDS.ARBITRUM,
        TOKENS.ETH_USDC,
        TOKENS.ARB_USDC,
        '100000000', // 100 USDC
        { fromAddress: TEST_ADDRESS }
      );

      expect(response.data).toHaveProperty('recommended');
      expect(response.data).toHaveProperty('fastest');
      expect(response.data).toHaveProperty('cheapest');
      expect(response.data).toHaveProperty('allRoutes');
      expect(response.data).toHaveProperty('totalRoutesFound');

      console.log(`  Routes found: ${response.data.totalRoutesFound}`);
      console.log(`  Unavailable: ${response.data.unavailableCount}`);

      if (response.data.recommended) {
        console.log(`  Recommended: ${response.data.recommended.toolUsed} ($${response.data.recommended.totalCostUSD})`);
      }
      if (response.data.fastest) {
        console.log(`  Fastest: ${response.data.fastest.estimatedDurationFormatted}`);
      }
      if (response.data.cheapest) {
        console.log(`  Cheapest: $${response.data.cheapest.totalCostUSD}`);
      }
    }, 30000);

    it('should return routes sorted by recommendation', async () => {
      const response = await getRoutes(
        client,
        LIFI_CHAIN_IDS.POLYGON,
        LIFI_CHAIN_IDS.BASE,
        TOKENS.POLYGON_USDC,
        '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // Base USDC
        '50000000', // 50 USDC
        { fromAddress: TEST_ADDRESS }
      );

      if (response.data.allRoutes.length > 0) {
        // First route should be recommended
        expect(response.data.recommended).toEqual(response.data.allRoutes[0]);
      }
    }, 30000);
  });

  describe('canBridge', () => {
    it('should check if bridging is possible between Ethereum and Polygon', async () => {
      const response = await canBridge(
        client,
        LIFI_CHAIN_IDS.ETHEREUM,
        LIFI_CHAIN_IDS.POLYGON
      );

      expect(response.data).toHaveProperty('canBridge');
      expect(response.data).toHaveProperty('availableBridges');
      expect(response.data.canBridge).toBe(true);
      expect(response.data.availableBridges.length).toBeGreaterThan(0);

      console.log(`  Can bridge: ${response.data.canBridge}`);
      console.log(`  Available bridges: ${response.data.availableBridges.join(', ')}`);
    }, 15000);

    it('should check bridging with specific tokens', async () => {
      const response = await canBridge(
        client,
        LIFI_CHAIN_IDS.ETHEREUM,
        LIFI_CHAIN_IDS.ARBITRUM,
        TOKENS.ETH_USDC,
        TOKENS.ARB_USDC
      );

      expect(response.data.canBridge).toBe(true);
    }, 15000);
  });

  describe('getTransactionStatus', () => {
    it('should return NOT_FOUND for non-existent transaction', async () => {
      const fakeTxHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

      const response = await getTransactionStatus(
        client,
        fakeTxHash,
        LIFI_CHAIN_IDS.ETHEREUM,
        LIFI_CHAIN_IDS.POLYGON
      );

      expect(response.data.status).toBe('NOT_FOUND');
      expect(response.data.statusMessage).toBe('Transaction not found');
    }, 15000);
  });

  describe('getQuoteDescription', () => {
    it('should return human-readable quote description', async () => {
      const response = await getQuoteDescription(
        client,
        LIFI_CHAIN_IDS.ETHEREUM,
        LIFI_CHAIN_IDS.POLYGON,
        TOKENS.ETH_USDC,
        TOKENS.POLYGON_USDC,
        '10000000', // 10 USDC
        { fromAddress: TEST_ADDRESS }
      );

      expect(typeof response.data).toBe('string');
      expect(response.data).toContain('Cross-Chain Quote');
      expect(response.data).toContain('From:');
      expect(response.data).toContain('To:');
      expect(response.data).toContain('Steps:');

      console.log('\n' + response.data);
    }, 30000);
  });

  describe('Edge Cases', () => {
    it('should handle large amounts', async () => {
      const response = await getQuote(
        client,
        LIFI_CHAIN_IDS.ETHEREUM,
        LIFI_CHAIN_IDS.ARBITRUM,
        TOKENS.ETH_USDC,
        TOKENS.ARB_USDC,
        '1000000000000', // 1 million USDC
        { fromAddress: TEST_ADDRESS }
      );

      expect(response.data).toHaveProperty('toAmountFormatted');
      console.log(`  Large amount: ${response.data.fromAmountFormatted} → ${response.data.toAmountFormatted}`);
    }, 30000);

    it('should handle small amounts', async () => {
      const response = await getQuote(
        client,
        LIFI_CHAIN_IDS.ETHEREUM,
        LIFI_CHAIN_IDS.POLYGON,
        TOKENS.ETH_USDC,
        TOKENS.POLYGON_USDC,
        '100000', // 0.1 USDC
        { fromAddress: TEST_ADDRESS }
      );

      expect(response.data).toHaveProperty('toAmountFormatted');
      console.log(`  Small amount: ${response.data.fromAmountFormatted} → ${response.data.toAmountFormatted}`);
    }, 30000);
  });
});

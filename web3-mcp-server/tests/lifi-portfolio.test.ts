import { describe, it, expect, beforeAll } from 'vitest';
import { LiFiClient, LIFI_CHAIN_IDS } from '../src/clients/lifi-client.js';
import {
  getTokenPrice,
  getTokenPriceBySymbol,
  getCrossChainTokens,
  getCommonTokenPrices,
  calculatePortfolioValue,
  formatPortfolioDescription,
  TokenPrice,
} from '../src/tools/lifi-portfolio.js';

describe('LI.FI Observer Agent - Portfolio', () => {
  let client: LiFiClient;

  // Common token addresses
  const TOKENS = {
    ETH_USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    ETH_USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    ETH_WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    ETH_WBTC: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
  };

  beforeAll(() => {
    client = new LiFiClient();
  });

  describe('getTokenPrice', () => {
    it('should get USDC price on Ethereum', async () => {
      const response = await getTokenPrice(
        client,
        LIFI_CHAIN_IDS.ETHEREUM,
        TOKENS.ETH_USDC
      );

      expect(response.data).not.toBeNull();
      expect(response.data?.symbol).toBe('USDC');
      expect(response.data?.priceUSD).toBeGreaterThan(0.9);
      expect(response.data?.priceUSD).toBeLessThan(1.1);

      console.log(`  USDC price: $${response.data?.priceUSD}`);
    }, 15000);

    it('should get WETH price on Ethereum', async () => {
      const response = await getTokenPrice(
        client,
        LIFI_CHAIN_IDS.ETHEREUM,
        TOKENS.ETH_WETH
      );

      expect(response.data).not.toBeNull();
      expect(response.data?.symbol).toBe('WETH');
      expect(response.data?.priceUSD).toBeGreaterThan(1000);

      console.log(`  WETH price: $${response.data?.priceUSD}`);
    }, 15000);

    it('should get WBTC price on Ethereum', async () => {
      const response = await getTokenPrice(
        client,
        LIFI_CHAIN_IDS.ETHEREUM,
        TOKENS.ETH_WBTC
      );

      expect(response.data).not.toBeNull();
      expect(response.data?.symbol).toBe('WBTC');
      expect(response.data?.priceUSD).toBeGreaterThan(30000);

      console.log(`  WBTC price: $${response.data?.priceUSD}`);
    }, 15000);

    it('should return null for non-existent token', async () => {
      const response = await getTokenPrice(
        client,
        LIFI_CHAIN_IDS.ETHEREUM,
        '0x0000000000000000000000000000000000000001'
      );

      expect(response.data).toBeNull();
    }, 15000);

    it('should include confidence scoring', async () => {
      const response = await getTokenPrice(
        client,
        LIFI_CHAIN_IDS.ETHEREUM,
        TOKENS.ETH_USDC
      );

      expect(response.confidence).toHaveProperty('score');
      expect(response.confidence).toHaveProperty('latencyMs');
      expect(response.confidence.score).toBeGreaterThan(0);
    }, 15000);
  });

  describe('getTokenPriceBySymbol', () => {
    it('should find USDC across chains', async () => {
      const response = await getTokenPriceBySymbol(client, 'USDC');

      expect(response.data.length).toBeGreaterThan(0);
      expect(response.data[0].symbol).toBe('USDC');

      console.log(`  Found USDC on ${response.data.length} chains`);
      response.data.slice(0, 3).forEach((token) => {
        console.log(`    - ${token.chainName}: $${token.priceUSD}`);
      });
    }, 30000);

    it('should find ETH/WETH', async () => {
      const response = await getTokenPriceBySymbol(client, 'WETH');

      expect(response.data.length).toBeGreaterThan(0);
      expect(response.data[0].priceUSD).toBeGreaterThan(1000);

      console.log(`  WETH price: $${response.data[0].priceUSD}`);
    }, 30000);

    it('should return empty for non-existent symbol', async () => {
      const response = await getTokenPriceBySymbol(client, 'NOTAREALTOKEN123');

      expect(response.data).toEqual([]);
    }, 15000);

    it('should filter by preferred chain', async () => {
      const response = await getTokenPriceBySymbol(
        client,
        'USDC',
        LIFI_CHAIN_IDS.POLYGON
      );

      expect(response.data.length).toBeGreaterThan(0);
      expect(response.data[0].chainId).toBe(LIFI_CHAIN_IDS.POLYGON);
    }, 15000);
  });

  describe('getCrossChainTokens', () => {
    it('should get tokens from multiple chains', async () => {
      const response = await getCrossChainTokens(client, [
        LIFI_CHAIN_IDS.ETHEREUM,
        LIFI_CHAIN_IDS.POLYGON,
      ]);

      expect(response.data.chains.length).toBe(2);

      for (const chain of response.data.chains) {
        expect(chain.tokenCount).toBeGreaterThan(0);
        expect(chain.tokens.length).toBeGreaterThan(0);
        console.log(`  ${chain.chainName}: ${chain.tokenCount} tokens`);
      }
    }, 30000);

    it('should include token prices', async () => {
      const response = await getCrossChainTokens(client, [LIFI_CHAIN_IDS.ETHEREUM]);

      const ethChain = response.data.chains[0];
      expect(ethChain.tokens.length).toBeGreaterThan(0);

      // All returned tokens should have prices > 0
      for (const token of ethChain.tokens) {
        expect(token.priceUSD).toBeGreaterThan(0);
      }
    }, 15000);
  });

  describe('getCommonTokenPrices', () => {
    it('should get prices for common tokens', async () => {
      const response = await getCommonTokenPrices(client);

      expect(response.data).toHaveProperty('USDC');
      expect(response.data).toHaveProperty('USDT');
      expect(response.data).toHaveProperty('WETH');

      console.log('  Common token prices:');
      for (const [symbol, token] of Object.entries(response.data)) {
        console.log(`    ${symbol}: $${token.priceUSD}`);
      }
    }, 15000);

    it('should return stablecoin prices near $1', async () => {
      const response = await getCommonTokenPrices(client);

      expect(response.data.USDC.priceUSD).toBeGreaterThan(0.95);
      expect(response.data.USDC.priceUSD).toBeLessThan(1.05);

      expect(response.data.USDT.priceUSD).toBeGreaterThan(0.95);
      expect(response.data.USDT.priceUSD).toBeLessThan(1.05);
    }, 15000);
  });

  describe('calculatePortfolioValue', () => {
    it('should calculate portfolio from balances and prices', () => {
      // Mock balances
      const balances = [
        {
          chainId: 1,
          tokens: [
            { address: TOKENS.ETH_USDC, balance: '1000000000' }, // 1000 USDC
            { address: TOKENS.ETH_WETH, balance: '500000000000000000' }, // 0.5 WETH
          ],
        },
      ];

      // Mock prices
      const prices = new Map<string, TokenPrice>();
      prices.set(`1:${TOKENS.ETH_USDC.toLowerCase()}`, {
        symbol: 'USDC',
        name: 'USD Coin',
        address: TOKENS.ETH_USDC,
        chainId: 1,
        priceUSD: 1.0,
        decimals: 6,
      });
      prices.set(`1:${TOKENS.ETH_WETH.toLowerCase()}`, {
        symbol: 'WETH',
        name: 'Wrapped Ether',
        address: TOKENS.ETH_WETH,
        chainId: 1,
        priceUSD: 2000,
        decimals: 18,
      });

      const portfolio = calculatePortfolioValue(balances, prices);

      expect(portfolio.totalValueUSD).toBe(2000); // 1000 USDC + 0.5 * 2000 WETH
      expect(portfolio.tokenCount).toBe(2);
      expect(portfolio.chainCount).toBe(1);
      expect(portfolio.topHoldings.length).toBe(2);

      console.log(`  Total value: $${portfolio.totalValueUSD}`);
    });

    it('should sort by value (highest first)', () => {
      const balances = [
        {
          chainId: 1,
          tokens: [
            { address: '0xaaa', balance: '100000000' }, // 100 tokens
            { address: '0xbbb', balance: '1000000' },   // 1 token but expensive
          ],
        },
      ];

      const prices = new Map<string, TokenPrice>();
      prices.set('1:0xaaa', {
        symbol: 'CHEAP',
        name: 'Cheap Token',
        address: '0xaaa',
        chainId: 1,
        priceUSD: 1,
        decimals: 6,
      });
      prices.set('1:0xbbb', {
        symbol: 'EXPENSIVE',
        name: 'Expensive Token',
        address: '0xbbb',
        chainId: 1,
        priceUSD: 1000,
        decimals: 6,
      });

      const portfolio = calculatePortfolioValue(balances, prices);

      // Expensive should be first (1000 USD vs 100 USD)
      expect(portfolio.topHoldings[0].symbol).toBe('EXPENSIVE');
      expect(portfolio.topHoldings[1].symbol).toBe('CHEAP');
    });
  });

  describe('formatPortfolioDescription', () => {
    it('should format portfolio as readable string', () => {
      const portfolio = {
        address: '0x123',
        totalValueUSD: 5000,
        chainCount: 2,
        tokenCount: 5,
        chains: [
          {
            chainId: 1,
            chainName: 'Ethereum',
            chainType: 'EVM',
            tokens: [],
            totalValueUSD: 3000,
          },
          {
            chainId: 137,
            chainName: 'Polygon',
            chainType: 'EVM',
            tokens: [],
            totalValueUSD: 2000,
          },
        ],
        topHoldings: [
          {
            symbol: 'WETH',
            name: 'Wrapped Ether',
            address: '0x...',
            balance: '1000000000000000000',
            balanceFormatted: '1',
            priceUSD: 2000,
            valueUSD: 2000,
            decimals: 18,
          },
          {
            symbol: 'USDC',
            name: 'USD Coin',
            address: '0x...',
            balance: '3000000000',
            balanceFormatted: '3000',
            priceUSD: 1,
            valueUSD: 3000,
            decimals: 6,
          },
        ],
      };

      const description = formatPortfolioDescription(portfolio);

      expect(description).toContain('Portfolio Summary');
      expect(description).toContain('$5,000.00');
      expect(description).toContain('**Chains:** 2');
      expect(description).toContain('**Tokens:** 5');
      expect(description).toContain('WETH');
      expect(description).toContain('Ethereum');

      console.log('\n' + description);
    });
  });
});

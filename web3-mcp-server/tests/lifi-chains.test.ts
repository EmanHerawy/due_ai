import { describe, it, expect, beforeAll } from 'vitest';
import { LiFiClient } from '../src/clients/lifi-client.js';
import {
  getSupportedChains,
  getChainById,
  getChainTokens,
  searchChains,
  isChainSupported,
} from '../src/tools/lifi-chains.js';

describe('LI.FI Observer Agent - Chains', () => {
  let client: LiFiClient;

  beforeAll(() => {
    client = new LiFiClient();
  });

  describe('LiFiClient', () => {
    it('should initialize with default base URL', () => {
      const defaultClient = new LiFiClient();
      expect(defaultClient).toBeDefined();
    });

    it('should pass health check', async () => {
      const health = await client.healthCheck();

      expect(health).toHaveProperty('healthy');
      expect(health).toHaveProperty('latencyMs');
      expect(typeof health.latencyMs).toBe('number');
      console.log(`  Health check: ${health.healthy ? '✓' : '✗'} (${health.latencyMs}ms)`);
    });

    it('should fetch chains from API', async () => {
      const response = await client.getChains();

      expect(response).toHaveProperty('data');
      expect(response).toHaveProperty('confidence');
      expect(response).toHaveProperty('timestamp');
      expect(Array.isArray(response.data)).toBe(true);
      expect(response.data.length).toBeGreaterThan(0);
    });
  });

  describe('getSupportedChains', () => {
    it('should return all supported chains with metadata', async () => {
      const response = await getSupportedChains(client);

      expect(response.data).toHaveProperty('chains');
      expect(response.data).toHaveProperty('totalChains');
      expect(response.data).toHaveProperty('mainnetCount');
      expect(response.data).toHaveProperty('testnetCount');
      expect(response.data).toHaveProperty('chainTypes');

      expect(response.data.totalChains).toBeGreaterThan(50); // LI.FI supports 60+ chains
      expect(response.data.chainTypes.length).toBeGreaterThan(1); // Should have EVM, MVM, SVM, UTXO

      // Should include multiple chain types
      expect(response.data.chainTypes).toContain('EVM');
      expect(response.data.chainTypes).toContain('MVM'); // SUI

      console.log(`  Total chains: ${response.data.totalChains}`);
      console.log(`  Mainnets: ${response.data.mainnetCount}`);
      console.log(`  Testnets: ${response.data.testnetCount}`);
      console.log(`  Chain types: ${response.data.chainTypes.join(', ')}`);
    });

    it('should include confidence scoring', async () => {
      const response = await getSupportedChains(client);

      expect(response.confidence).toHaveProperty('score');
      expect(response.confidence).toHaveProperty('freshness');
      expect(response.confidence).toHaveProperty('source', 'li.fi');
      expect(response.confidence).toHaveProperty('latencyMs');
      expect(response.confidence).toHaveProperty('healthy');

      expect(response.confidence.score).toBeGreaterThan(0);
      expect(response.confidence.score).toBeLessThanOrEqual(1);

      console.log(`  Confidence: ${(response.confidence.score * 100).toFixed(0)}%`);
      console.log(`  Latency: ${response.confidence.latencyMs}ms`);
    });

    it('should include well-known chains', async () => {
      const response = await getSupportedChains(client);
      const chainNames = response.data.chains.map((c) => c.name.toLowerCase());

      // Check for major chains
      expect(chainNames.some((n) => n.includes('ethereum'))).toBe(true);
      expect(chainNames.some((n) => n.includes('polygon'))).toBe(true);
      expect(chainNames.some((n) => n.includes('arbitrum'))).toBe(true);
    });

    it('should have SUI chain for our use case', async () => {
      const response = await getSupportedChains(client);
      const suiChain = response.data.chains.find(
        (c) => c.key.toLowerCase() === 'sui' || c.name.toLowerCase().includes('sui')
      );

      // SUI should be supported (chain type MVM)
      expect(suiChain).toBeDefined();
      expect(suiChain?.key).toBe('sui');
      expect(suiChain?.type).toBe('MVM');
      console.log(`  ✓ SUI supported: ID=${suiChain?.id}, Name=${suiChain?.name}, Type=${suiChain?.type}`);
    });
  });

  describe('getChainById', () => {
    it('should find chain by ID (Ethereum = 1)', async () => {
      const response = await getChainById(client, 1);

      expect(response.data).not.toBeNull();
      expect(response.data?.id).toBe(1);
      expect(response.data?.name.toLowerCase()).toContain('ethereum');
    });

    it('should find chain by key', async () => {
      const response = await getChainById(client, 'pol');

      expect(response.data).not.toBeNull();
      expect(response.data?.key.toLowerCase()).toBe('pol');
    });

    it('should return null for non-existent chain', async () => {
      const response = await getChainById(client, 999999);

      expect(response.data).toBeNull();
    });

    it('should be case-insensitive for key search', async () => {
      const response1 = await getChainById(client, 'ETH');
      const response2 = await getChainById(client, 'eth');

      expect(response1.data?.id).toBe(response2.data?.id);
    });
  });

  describe('searchChains', () => {
    it('should search by name', async () => {
      const response = await searchChains(client, 'arbitrum');

      expect(response.data.length).toBeGreaterThan(0);
      expect(
        response.data.every((c) => c.name.toLowerCase().includes('arbitrum'))
      ).toBe(true);
    });

    it('should search by native token', async () => {
      const response = await searchChains(client, 'ETH');

      expect(response.data.length).toBeGreaterThan(0);
      // Should find chains with ETH as native token
    });

    it('should return empty array for no matches', async () => {
      const response = await searchChains(client, 'nonexistentchain12345');

      expect(response.data).toEqual([]);
    });
  });

  describe('isChainSupported', () => {
    it('should return true for supported chain', async () => {
      const response = await isChainSupported(client, 1); // Ethereum

      expect(response.data).toBe(true);
    });

    it('should return false for unsupported chain', async () => {
      const response = await isChainSupported(client, 999999);

      expect(response.data).toBe(false);
    });
  });

  describe('getChainTokens', () => {
    it('should get tokens for Ethereum (chain 1)', async () => {
      const response = await getChainTokens(client, 1);

      expect(response.data).toHaveProperty('chainId', 1);
      expect(response.data).toHaveProperty('chainName');
      expect(response.data).toHaveProperty('tokens');
      expect(response.data).toHaveProperty('totalTokens');

      expect(response.data.tokens.length).toBeGreaterThan(0);

      console.log(`  Tokens on Ethereum: ${response.data.totalTokens}`);

      // Check token structure
      const token = response.data.tokens[0];
      expect(token).toHaveProperty('address');
      expect(token).toHaveProperty('symbol');
      expect(token).toHaveProperty('name');
      expect(token).toHaveProperty('decimals');
    }, 15000); // Longer timeout for token fetch

    it('should throw error for invalid chain', async () => {
      await expect(getChainTokens(client, 999999)).rejects.toThrow('Chain 999999 not found');
    });

    it('should include common tokens on Polygon', async () => {
      const response = await getChainTokens(client, 137); // Polygon

      const symbols = response.data.tokens.map((t) => t.symbol.toUpperCase());

      // Check for common tokens
      expect(symbols).toContain('USDC');
      expect(symbols).toContain('USDT');

      console.log(`  Tokens on Polygon: ${response.data.totalTokens}`);
    }, 15000);
  });
});

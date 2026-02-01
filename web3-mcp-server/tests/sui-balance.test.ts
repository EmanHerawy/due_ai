import { describe, it, expect, beforeAll } from 'vitest';
import { DueAiSuiClient } from '../src/clients/sui-client.js';
import { getBalance, getTokenBalance, formatBalance } from '../src/tools/sui-balance.js';

describe('Sui Wallet Balance', () => {
  let client: DueAiSuiClient;

  beforeAll(() => {
    client = new DueAiSuiClient('testnet');
  });

  describe('DueAiSuiClient', () => {
    it('should initialize with testnet by default', () => {
      const defaultClient = new DueAiSuiClient();
      expect(defaultClient.getNetwork()).toBe('testnet');
    });

    it('should connect to the correct network', () => {
      expect(client.getNetwork()).toBe('testnet');
      expect(client.getClient()).toBeDefined();
    });

    it('should throw error for invalid address format', async () => {
      await expect(client.getBalance('invalid_address')).rejects.toThrow(
        'Invalid Sui address format'
      );
    });

    it('should throw error for empty address', async () => {
      await expect(client.getBalance('')).rejects.toThrow(
        'Invalid Sui address format'
      );
    });
  });

  describe('getBalance - Real Network Call', () => {
    // Using a known testnet address with funds
    // This is a testnet faucet address that typically has SUI
    const testAddress = '0x0000000000000000000000000000000000000000000000000000000000000000';

    it('should fetch balance for a valid address', async () => {
      const result = await getBalance(client, testAddress);

      expect(result).toHaveProperty('address', testAddress);
      expect(result).toHaveProperty('balances');
      expect(result).toHaveProperty('totalCoins');
      expect(result).toHaveProperty('network', 'testnet');
      expect(typeof result.totalCoins).toBe('number');
    });

    it('should handle addresses with or without coins gracefully', async () => {
      // Any valid address should return a proper response structure
      const randomAddress = '0xfedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';
      const result = await getBalance(client, randomAddress);

      expect(result.address).toBe(randomAddress);
      expect(typeof result.totalCoins).toBe('number');
      expect(result.totalCoins).toBeGreaterThanOrEqual(0);
      expect(typeof result.balances).toBe('object');
    });
  });

  describe('getTokenBalance', () => {
    const testAddress = '0x0000000000000000000000000000000000000000000000000000000000000000';

    it('should return specific token balance', async () => {
      const result = await getTokenBalance(client, testAddress, 'SUI');

      expect(result).toHaveProperty('address', testAddress);
      expect(result).toHaveProperty('tokenType', 'SUI');
      expect(result).toHaveProperty('balance');
      expect(result).toHaveProperty('network', 'testnet');
    });

    it('should return 0 for token not owned', async () => {
      const result = await getTokenBalance(client, testAddress, 'NONEXISTENT_TOKEN');

      expect(result.balance).toBe('0');
    });
  });

  describe('formatBalance', () => {
    it('should format balance with 9 decimals (SUI default)', () => {
      // 1 SUI = 1,000,000,000 MIST
      expect(formatBalance(BigInt('1000000000'), 9)).toBe('1');
      expect(formatBalance(BigInt('1500000000'), 9)).toBe('1.5');
      expect(formatBalance(BigInt('1234567890'), 9)).toBe('1.23456789');
      expect(formatBalance(BigInt('100000000'), 9)).toBe('0.1');
    });

    it('should format balance with 6 decimals (USDC)', () => {
      // 1 USDC = 1,000,000 units
      expect(formatBalance(BigInt('1000000'), 6)).toBe('1');
      expect(formatBalance(BigInt('1500000'), 6)).toBe('1.5');
      expect(formatBalance(BigInt('1234567'), 6)).toBe('1.234567');
    });

    it('should handle string input', () => {
      expect(formatBalance('1000000000', 9)).toBe('1');
      expect(formatBalance('500000000', 9)).toBe('0.5');
    });

    it('should handle zero balance', () => {
      expect(formatBalance(BigInt(0), 9)).toBe('0');
    });

    it('should handle very large balances', () => {
      // 1 billion SUI
      expect(formatBalance(BigInt('1000000000000000000'), 9)).toBe('1000000000');
    });
  });
});

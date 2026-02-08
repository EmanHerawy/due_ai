import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSuiTransfer,
  executeSignedTransaction,
  extractSymbol,
  toSmallestUnit,
} from '../src/tools/sui-transfer.js';
import type { DueAiSuiClient } from '../src/clients/sui-client.js';

// ============================================================================
// Helper function tests
// ============================================================================

describe('extractSymbol', () => {
  it('should extract symbol from full coin type', () => {
    expect(extractSymbol('0x2::sui::SUI')).toBe('SUI');
  });

  it('should extract symbol from custom coin type', () => {
    expect(extractSymbol('0xabcd::usdc::USDC')).toBe('USDC');
  });

  it('should return UNKNOWN for empty string', () => {
    expect(extractSymbol('')).toBe('UNKNOWN');
  });
});

describe('toSmallestUnit', () => {
  it('should convert whole number SUI to MIST', () => {
    expect(toSmallestUnit('1', 9)).toBe(BigInt('1000000000'));
  });

  it('should convert decimal SUI to MIST', () => {
    expect(toSmallestUnit('1.5', 9)).toBe(BigInt('1500000000'));
  });

  it('should convert USDC with 6 decimals', () => {
    expect(toSmallestUnit('100', 6)).toBe(BigInt('100000000'));
  });

  it('should convert fractional USDC', () => {
    expect(toSmallestUnit('0.5', 6)).toBe(BigInt('500000'));
  });

  it('should truncate excess decimals', () => {
    // 9 decimals for SUI, but given 12 decimal digits
    expect(toSmallestUnit('1.123456789999', 9)).toBe(BigInt('1123456789'));
  });

  it('should handle zero', () => {
    expect(toSmallestUnit('0', 9)).toBe(BigInt(0));
  });
});

// ============================================================================
// buildSuiTransfer tests
// ============================================================================

describe('buildSuiTransfer', () => {
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      getNetwork: vi.fn().mockReturnValue('testnet'),
      buildSuiTransfer: vi.fn().mockResolvedValue({
        txBytes: 'bW9ja1R4Qnl0ZXM=', // base64 "mockTxBytes"
        tx: {},
      }),
      buildCoinTransfer: vi.fn().mockResolvedValue({
        txBytes: 'bW9ja1R4Qnl0ZXM=',
        tx: {},
      }),
      dryRunTransaction: vi.fn().mockResolvedValue({
        effects: {
          gasUsed: {
            computationCost: '1000000',
            storageCost: '2000000',
            storageRebate: '500000',
          },
          status: { status: 'success' },
        },
      }),
    };
  });

  it('should build a native SUI transfer', async () => {
    const result = await buildSuiTransfer(mockClient as DueAiSuiClient, {
      sender: '0xaaaa',
      recipient: '0xbbbb',
      amount: '1.5',
    });

    expect(result.txBytes).toBe('bW9ja1R4Qnl0ZXM=');
    expect(result.paymentSummary.symbol).toBe('SUI');
    expect(result.paymentSummary.amountFormatted).toBe('1.5');
    expect(result.paymentSummary.sender).toBe('0xaaaa');
    expect(result.paymentSummary.recipient).toBe('0xbbbb');
    expect(result.paymentSummary.network).toBe('testnet');
    expect(result.paymentSummary.gasEstimate.totalGasCost).toBe('2500000');
    expect(result.message).toContain('1.5 SUI');

    expect(mockClient.buildSuiTransfer).toHaveBeenCalledWith(
      '0xaaaa',
      '0xbbbb',
      BigInt('1500000000'),
      undefined
    );
  });

  it('should build a non-SUI coin transfer', async () => {
    const result = await buildSuiTransfer(mockClient as DueAiSuiClient, {
      sender: '0xaaaa',
      recipient: '0xbbbb',
      amount: '100',
      coinType: '0xabcd::usdc::USDC',
    });

    expect(result.paymentSummary.symbol).toBe('USDC');
    expect(result.paymentSummary.coinType).toBe('0xabcd::usdc::USDC');
    expect(mockClient.buildCoinTransfer).toHaveBeenCalledWith(
      '0xaaaa',
      '0xbbbb',
      BigInt('100000000'),
      '0xabcd::usdc::USDC',
      undefined
    );
  });

  it('should throw for invalid sender address', async () => {
    await expect(
      buildSuiTransfer(mockClient as DueAiSuiClient, {
        sender: 'invalid',
        recipient: '0xbbbb',
        amount: '1',
      })
    ).rejects.toThrow('Invalid sender address');
  });

  it('should throw for invalid recipient address', async () => {
    await expect(
      buildSuiTransfer(mockClient as DueAiSuiClient, {
        sender: '0xaaaa',
        recipient: 'invalid',
        amount: '1',
      })
    ).rejects.toThrow('Invalid recipient address');
  });

  it('should throw when sender equals recipient', async () => {
    await expect(
      buildSuiTransfer(mockClient as DueAiSuiClient, {
        sender: '0xaaaa',
        recipient: '0xaaaa',
        amount: '1',
      })
    ).rejects.toThrow('Sender and recipient cannot be the same');
  });

  it('should throw for zero amount', async () => {
    await expect(
      buildSuiTransfer(mockClient as DueAiSuiClient, {
        sender: '0xaaaa',
        recipient: '0xbbbb',
        amount: '0',
      })
    ).rejects.toThrow('Amount must be greater than 0');
  });

  it('should pass gas budget when provided', async () => {
    await buildSuiTransfer(mockClient as DueAiSuiClient, {
      sender: '0xaaaa',
      recipient: '0xbbbb',
      amount: '1',
      gasBudget: '10000000',
    });

    expect(mockClient.buildSuiTransfer).toHaveBeenCalledWith(
      '0xaaaa',
      '0xbbbb',
      BigInt('1000000000'),
      BigInt('10000000')
    );
  });
});

// ============================================================================
// executeSignedTransaction tests
// ============================================================================

describe('executeSignedTransaction', () => {
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      getNetwork: vi.fn().mockReturnValue('testnet'),
      executeSignedTransaction: vi.fn().mockResolvedValue({
        digest: 'ABC123digest',
        effects: {
          status: { status: 'success' },
          gasUsed: {
            computationCost: '1000000',
            storageCost: '2000000',
            storageRebate: '500000',
          },
        },
        balanceChanges: [
          {
            owner: { AddressOwner: '0xaaaa' },
            coinType: '0x2::sui::SUI',
            amount: '-1500000000',
          },
          {
            owner: { AddressOwner: '0xbbbb' },
            coinType: '0x2::sui::SUI',
            amount: '1500000000',
          },
        ],
      }),
      getExplorerUrl: vi.fn().mockReturnValue('https://suiscan.xyz/testnet/tx/ABC123digest'),
    };
  });

  it('should execute a signed transaction successfully', async () => {
    const result = await executeSignedTransaction(mockClient as DueAiSuiClient, {
      txBytes: 'dHhCeXRlcw==',
      signature: 'c2lnbmF0dXJl',
    });

    expect(result.digest).toBe('ABC123digest');
    expect(result.status).toBe('success');
    expect(result.explorerUrl).toBe('https://suiscan.xyz/testnet/tx/ABC123digest');
    expect(result.gasUsed.totalGasCost).toBe('2500000');
    expect(result.balanceChanges).toHaveLength(2);
    expect(result.balanceChanges[0].owner).toBe('0xaaaa');
  });

  it('should throw when txBytes is missing', async () => {
    await expect(
      executeSignedTransaction(mockClient as DueAiSuiClient, {
        txBytes: '',
        signature: 'c2lnbmF0dXJl',
      })
    ).rejects.toThrow('txBytes is required');
  });

  it('should throw when signature is missing', async () => {
    await expect(
      executeSignedTransaction(mockClient as DueAiSuiClient, {
        txBytes: 'dHhCeXRlcw==',
        signature: '',
      })
    ).rejects.toThrow('signature is required');
  });

  it('should throw when transaction fails', async () => {
    mockClient.executeSignedTransaction.mockResolvedValue({
      digest: 'FAILED123',
      effects: {
        status: { status: 'failure', error: 'InsufficientGas' },
        gasUsed: {
          computationCost: '1000000',
          storageCost: '0',
          storageRebate: '0',
        },
      },
      balanceChanges: [],
    });

    await expect(
      executeSignedTransaction(mockClient as DueAiSuiClient, {
        txBytes: 'dHhCeXRlcw==',
        signature: 'c2lnbmF0dXJl',
      })
    ).rejects.toThrow('Transaction failed: InsufficientGas');
  });
});

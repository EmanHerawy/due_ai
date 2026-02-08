import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSuiTransfer,
  executeSignedTransaction,
  extractSymbol,
  toSmallestUnit,
  buildTransactionBreakdown,
  buildSecurityInfo,
  encodeSigningIntent,
  getSigningUrl,
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
// buildTransactionBreakdown tests
// ============================================================================

describe('buildTransactionBreakdown', () => {
  it('should return 2 operations for native SUI transfer', () => {
    const result = buildTransactionBreakdown(true, 'SUI', '1.5', '0xaaaa', '0xbbbb');
    expect(result.type).toBe('Native SUI Transfer');
    expect(result.operations).toHaveLength(2);
    expect(result.operations[0].action).toBe('Split Coins');
    expect(result.operations[1].action).toBe('Transfer Objects');
  });

  it('should return 3 operations for token transfer', () => {
    const result = buildTransactionBreakdown(false, 'USDC', '100', '0xaaaa', '0xbbbb');
    expect(result.type).toBe('USDC Token Transfer');
    expect(result.operations).toHaveLength(3);
    expect(result.operations[0].action).toBe('Merge Coins');
    expect(result.operations[1].action).toBe('Split Coins');
    expect(result.operations[2].action).toBe('Transfer Objects');
  });

  it('should include whatThisCannotDo list', () => {
    const result = buildTransactionBreakdown(true, 'SUI', '1', '0xaaaa', '0xbbbb');
    expect(result.whatThisCannotDo.length).toBeGreaterThan(0);
    expect(result.whatThisCannotDo).toContain('Access your other tokens or objects');
  });

  it('should include whatYouAreSigning summary', () => {
    const result = buildTransactionBreakdown(true, 'SUI', '2.5', '0xaaaa1234', '0xbbbb5678');
    expect(result.whatYouAreSigning).toContain('2.5 SUI');
  });
});

// ============================================================================
// buildSecurityInfo tests
// ============================================================================

describe('buildSecurityInfo', () => {
  it('should return low risk for simple transfers', () => {
    const result = buildSecurityInfo('0xaaaa', '0xbbbb', '1.5', 'SUI', 'testnet');
    expect(result.riskLevel).toBe('low');
  });

  it('should include verification checklist with recipient, amount, and network', () => {
    const result = buildSecurityInfo('0xaaaa', '0xbbbb', '1.5', 'SUI', 'testnet');
    expect(result.verificationChecklist.length).toBeGreaterThanOrEqual(3);
    const joined = result.verificationChecklist.join(' ');
    expect(joined).toContain('0xbbbb');
    expect(joined).toContain('1.5 SUI');
    expect(joined).toContain('testnet');
  });
});

// ============================================================================
// encodeSigningIntent + getSigningUrl tests
// ============================================================================

describe('encodeSigningIntent', () => {
  it('should produce valid base64url that decodes to correct intent', () => {
    const encoded = encodeSigningIntent('0xsender', '0xrecipient', '1.5', '0x2::sui::SUI', 'testnet');
    const decoded = JSON.parse(Buffer.from(encoded, 'base64url').toString());
    expect(decoded.s).toBe('0xsender');
    expect(decoded.r).toBe('0xrecipient');
    expect(decoded.a).toBe('1.5');
    expect(decoded.c).toBe('0x2::sui::SUI');
    expect(decoded.n).toBe('testnet');
  });
});

describe('getSigningUrl', () => {
  it('should build correct URL format', () => {
    const url = getSigningUrl('abc123', 'my_bot');
    expect(url).toBe('https://t.me/my_bot/sign?startapp=abc123');
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

    // Transaction breakdown
    expect(result.transactionBreakdown.type).toBe('Native SUI Transfer');
    expect(result.transactionBreakdown.operations).toHaveLength(2);
    expect(result.transactionBreakdown.whatThisCannotDo.length).toBeGreaterThan(0);

    // Security info
    expect(result.securityInfo.riskLevel).toBe('low');
    expect(result.securityInfo.verificationChecklist.length).toBeGreaterThanOrEqual(3);

    // Signing info
    expect(result.signingInfo.startParam).toBeTruthy();
    expect(result.signingInfo.methods).toContain('zklogin_google');
    expect(result.signingInfo.methods).toContain('walletconnect');
    // No bot username set, so signingUrl should be empty
    expect(result.signingInfo.signingUrl).toBe('');

    expect(mockClient.buildSuiTransfer).toHaveBeenCalledWith(
      '0xaaaa',
      '0xbbbb',
      BigInt('1500000000'),
      undefined
    );
  });

  it('should include signingUrl when botUsername is provided', async () => {
    const result = await buildSuiTransfer(mockClient as DueAiSuiClient, {
      sender: '0xaaaa',
      recipient: '0xbbbb',
      amount: '1.5',
      botUsername: 'my_test_bot',
    });

    expect(result.signingInfo.signingUrl).toContain('https://t.me/my_test_bot/sign?startapp=');
    expect(result.message).toContain('Sign Now');
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
    expect(result.transactionBreakdown.type).toBe('USDC Token Transfer');
    expect(result.transactionBreakdown.operations).toHaveLength(3);
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

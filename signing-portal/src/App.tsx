import { useEffect, useState, useCallback } from 'react';
import { SuiClient, getFullnodeUrl } from '@mysten/sui.js/client';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import {
  beginZkLoginSetup,
  getGoogleOAuthUrl,
  completeZkLogin,
  assembleZkLoginSignature,
  saveIntent,
  loadIntent,
  type AccountData,
} from './zkLoginHelpers';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TransferIntent {
  sender: string;
  recipient: string;
  amount: string;
  coinType: string;
  network: string;
}

type AppPhase = 'loading' | 'error' | 'review' | 'signing' | 'success';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SUI_COIN_TYPE = '0x2::sui::SUI';
const MAX_EPOCH_OFFSET = 10; // ephemeral key valid for ~10 epochs (~10 days)
const PROVER_URL =
  import.meta.env.VITE_ZK_PROVER_URL || 'https://prover.mystenlabs.com/v1';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function decodeStartParam(raw: string): TransferIntent | null {
  try {
    // base64url → base64 → decode
    const json = atob(raw.replace(/-/g, '+').replace(/_/g, '/'));
    const obj = JSON.parse(json);
    return {
      sender: obj.s,
      recipient: obj.r,
      amount: obj.a,
      coinType: obj.c || SUI_COIN_TYPE,
      network: obj.n || 'testnet',
    };
  } catch {
    return null;
  }
}

function shortAddr(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 8)}...${addr.slice(-4)}`;
}

function getExplorerUrl(digest: string, network: string): string {
  return `https://suiscan.xyz/${network}/tx/${digest}`;
}

function parseAmountToSmallest(amount: string, decimals: number): bigint {
  const parts = amount.split('.');
  const whole = parts[0] || '0';
  let frac = parts[1] || '';
  if (frac.length > decimals) frac = frac.slice(0, decimals);
  else frac = frac.padEnd(decimals, '0');
  return BigInt(whole + frac);
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
  container: {
    maxWidth: 420,
    margin: '0 auto',
    padding: '24px 16px',
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 16,
  },
  card: {
    background: 'var(--tg-theme-secondary-bg-color, #16213e)',
    borderRadius: 12,
    padding: 16,
  },
  title: { fontSize: 20, fontWeight: 700 as const, marginBottom: 12 },
  label: {
    fontSize: 12,
    opacity: 0.6,
    textTransform: 'uppercase' as const,
    marginBottom: 4,
  },
  value: { fontSize: 15, marginBottom: 12 },
  step: {
    display: 'flex',
    gap: 12,
    alignItems: 'flex-start' as const,
    marginBottom: 12,
  },
  stepNum: {
    background: 'var(--tg-theme-button-color, #4a6cf7)',
    color: '#fff',
    borderRadius: '50%',
    width: 28,
    height: 28,
    display: 'flex',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    fontSize: 13,
    fontWeight: 700 as const,
    flexShrink: 0,
  },
  badge: {
    display: 'inline-block',
    padding: '4px 10px',
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 600 as const,
  },
  cannotList: { fontSize: 13, opacity: 0.8, paddingLeft: 16, marginBottom: 6 },
  btn: {
    width: '100%',
    padding: '14px 0',
    borderRadius: 10,
    border: 'none',
    fontSize: 16,
    fontWeight: 600 as const,
    cursor: 'pointer',
    marginBottom: 8,
  },
  primaryBtn: {
    background: 'var(--tg-theme-button-color, #4a6cf7)',
    color: 'var(--tg-theme-button-text-color, #fff)',
  },
  secondaryBtn: {
    background: 'transparent',
    color: 'var(--tg-theme-button-color, #4a6cf7)',
    border: '2px solid var(--tg-theme-button-color, #4a6cf7)',
  },
  errorBox: {
    background: '#ff4444',
    color: '#fff',
    padding: 16,
    borderRadius: 12,
    textAlign: 'center' as const,
  },
  successBox: {
    textAlign: 'center' as const,
    padding: 24,
  },
  link: {
    color: 'var(--tg-theme-link-color, #4a6cf7)',
    textDecoration: 'none' as const,
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function App() {
  const [phase, setPhase] = useState<AppPhase>('loading');
  const [intent, setIntent] = useState<TransferIntent | null>(null);
  const [error, setError] = useState('');
  const [txDigest, setTxDigest] = useState('');
  const [statusMsg, setStatusMsg] = useState('Loading transaction...');

  // ------------------------------------------------------------------
  // On mount: check for OAuth redirect first, then decode start_param
  // ------------------------------------------------------------------
  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    tg?.ready?.();
    tg?.expand?.();

    (async () => {
      try {
        // 1. Check if returning from Google OAuth redirect
        const account = await completeZkLogin(PROVER_URL);
        if (account) {
          // We have a completed zkLogin — now sign & send the transaction
          const savedIntent = loadIntent();
          if (!savedIntent) {
            throw new Error('Transaction intent lost during OAuth redirect');
          }
          setIntent(savedIntent);
          setPhase('signing');
          setStatusMsg('Signing transaction...');
          await signAndSendWithZkLogin(account, savedIntent);
          return;
        }

        // 2. Normal flow: decode start_param from TMA launch
        const startParam =
          tg?.initDataUnsafe?.start_param ||
          new URLSearchParams(window.location.search).get('startapp') ||
          '';

        if (!startParam) {
          throw new Error(
            'No transaction intent found. Open this app from a signing link.'
          );
        }

        const decoded = decodeStartParam(startParam);
        if (!decoded) {
          throw new Error(
            'Invalid transaction intent. The signing link may be corrupted.'
          );
        }

        setIntent(decoded);
        setPhase('review');
      } catch (e: any) {
        setError(e.message);
        setPhase('error');
      }
    })();
  }, []);

  // ------------------------------------------------------------------
  // Sign and send transaction using zkLogin account
  // ------------------------------------------------------------------
  const signAndSendWithZkLogin = useCallback(
    async (account: AccountData, txIntent: TransferIntent) => {
      const suiClient = new SuiClient({
        url: getFullnodeUrl(txIntent.network as any),
      });

      // Build the transaction
      const txb = new TransactionBlock();
      txb.setSender(account.userAddr);

      const isNativeSui = txIntent.coinType === SUI_COIN_TYPE;
      const decimals = isNativeSui ? 9 : 6; // default to 6 for tokens
      const amountSmallest = parseAmountToSmallest(txIntent.amount, decimals);

      if (isNativeSui) {
        const [coin] = txb.splitCoins(txb.gas, [amountSmallest]);
        txb.transferObjects([coin], txIntent.recipient);
      } else {
        // For non-SUI tokens: get coins, merge, split, transfer
        const coins = await suiClient.getCoins({
          owner: account.userAddr,
          coinType: txIntent.coinType,
        });
        if (coins.data.length === 0) {
          throw new Error(`No ${txIntent.coinType} coins found in wallet`);
        }
        const primaryCoin = txb.object(coins.data[0].coinObjectId);
        if (coins.data.length > 1) {
          txb.mergeCoins(
            primaryCoin,
            coins.data.slice(1).map((c) => txb.object(c.coinObjectId))
          );
        }
        const [splitCoin] = txb.splitCoins(primaryCoin, [amountSmallest]);
        txb.transferObjects([splitCoin], txIntent.recipient);
      }

      // Sign with ephemeral key
      const secretKeyBytes = Uint8Array.from(
        atob(account.ephemeralPrivateKey),
        (c) => c.charCodeAt(0)
      );
      const ephemeralKeyPair = Ed25519Keypair.fromSecretKey(secretKeyBytes);
      const { bytes, signature: userSignature } = await txb.sign({
        client: suiClient,
        signer: ephemeralKeyPair,
      });

      // Assemble zkLogin signature (using genAddressSeed)
      const zkLoginSignature = assembleZkLoginSignature(
        account.zkProofs,
        userSignature,
        account.userSalt,
        account.sub,
        account.aud,
        account.maxEpoch
      );

      // Execute
      const result = await suiClient.executeTransactionBlock({
        transactionBlock: bytes,
        signature: zkLoginSignature,
        options: { showEffects: true },
      });

      if (result.effects?.status?.status === 'failure') {
        throw new Error(
          `Transaction failed: ${result.effects.status.error || 'unknown'}`
        );
      }

      setTxDigest(result.digest);
      setPhase('success');

      // Auto-close TMA after 5 seconds
      setTimeout(() => {
        (window as any).Telegram?.WebApp?.close?.();
      }, 5000);
    },
    []
  );

  // ------------------------------------------------------------------
  // Start zkLogin flow: save intent, redirect to Google OAuth
  // ------------------------------------------------------------------
  const handleZkLogin = useCallback(async () => {
    if (!intent) return;

    try {
      setPhase('signing');
      setStatusMsg('Redirecting to Google...');

      const suiClient = new SuiClient({
        url: getFullnodeUrl(intent.network as any),
      });
      const { epoch } = await suiClient.getLatestSuiSystemState();
      const maxEpoch = Number(epoch) + MAX_EPOCH_OFFSET;

      const { nonce } = beginZkLoginSetup(maxEpoch);

      // Save intent so we can restore it after OAuth redirect
      saveIntent(intent);

      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
      if (!clientId) {
        throw new Error(
          'Google OAuth not configured. Set VITE_GOOGLE_CLIENT_ID.'
        );
      }

      const redirectUri =
        window.location.origin + window.location.pathname;
      const oauthUrl = getGoogleOAuthUrl(nonce, clientId, redirectUri);
      window.location.replace(oauthUrl);
    } catch (e: any) {
      setError(e.message);
      setPhase('error');
    }
  }, [intent]);

  // ------------------------------------------------------------------
  // WalletConnect placeholder
  // ------------------------------------------------------------------
  const handleWalletConnect = useCallback(() => {
    setError(
      'WalletConnect signing requires a Reown project ID. ' +
        'Configure VITE_REOWN_PROJECT_ID and integrate @reown/appkit.'
    );
    setPhase('error');
  }, []);

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  if (phase === 'loading') {
    return (
      <div style={styles.container}>
        <div style={{ ...styles.card, textAlign: 'center' }}>
          <p>{statusMsg}</p>
        </div>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div style={styles.container}>
        <div style={styles.errorBox}>
          <p style={{ fontWeight: 700, marginBottom: 8 }}>Error</p>
          <p style={{ fontSize: 14 }}>{error}</p>
        </div>
        {intent && (
          <button
            style={{ ...styles.btn, ...styles.secondaryBtn }}
            onClick={() => {
              setPhase('review');
              setError('');
            }}
          >
            Go Back
          </button>
        )}
      </div>
    );
  }

  if (phase === 'signing') {
    return (
      <div style={styles.container}>
        <div style={{ ...styles.card, textAlign: 'center' }}>
          <p style={styles.title}>Processing...</p>
          <p style={{ fontSize: 14, opacity: 0.7 }}>{statusMsg}</p>
        </div>
      </div>
    );
  }

  if (phase === 'success') {
    return (
      <div style={styles.container}>
        <div style={{ ...styles.card, ...styles.successBox }}>
          <p style={{ fontSize: 48, marginBottom: 12 }}>&#10003;</p>
          <p style={styles.title}>Transaction Sent!</p>
          <p style={{ fontSize: 14, opacity: 0.7, marginBottom: 16 }}>
            Your transfer has been submitted to the {intent?.network} network.
          </p>
          {txDigest && (
            <a
              href={getExplorerUrl(txDigest, intent?.network || 'testnet')}
              target="_blank"
              rel="noopener noreferrer"
              style={{ ...styles.link, fontSize: 14 }}
            >
              View on SuiScan &rarr;
            </a>
          )}
          <p style={{ fontSize: 12, opacity: 0.5, marginTop: 16 }}>
            This window will close automatically...
          </p>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // phase === 'review' — show educational breakdown
  // ------------------------------------------------------------------
  if (!intent) return null;

  const isNativeSui = intent.coinType === SUI_COIN_TYPE;
  const symbol = intent.coinType.split('::').pop() || 'UNKNOWN';

  const operations = isNativeSui
    ? [
        {
          step: 1,
          action: 'Split Coins',
          desc: `Split ${intent.amount} ${symbol} from your gas coin`,
        },
        {
          step: 2,
          action: 'Transfer Objects',
          desc: `Send to ${shortAddr(intent.recipient)}`,
        },
      ]
    : [
        {
          step: 1,
          action: 'Merge Coins',
          desc: `Merge all ${symbol} coins into one`,
        },
        {
          step: 2,
          action: 'Split Coins',
          desc: `Split ${intent.amount} ${symbol}`,
        },
        {
          step: 3,
          action: 'Transfer Objects',
          desc: `Send to ${shortAddr(intent.recipient)}`,
        },
      ];

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.card}>
        <p style={styles.title}>Transaction Review</p>
        <div
          style={{
            ...styles.badge,
            background: '#22c55e33',
            color: '#22c55e',
          }}
        >
          Low Risk — Simple Transfer
        </div>
      </div>

      {/* What you're signing */}
      <div style={styles.card}>
        <p style={styles.label}>What You're Signing</p>
        <p style={{ fontSize: 16, fontWeight: 600 }}>
          Transfer {intent.amount} {symbol} to {shortAddr(intent.recipient)}
        </p>
      </div>

      {/* Operation steps */}
      <div style={styles.card}>
        <p style={{ ...styles.label, marginBottom: 12 }}>
          Operation Breakdown
        </p>
        {operations.map((op) => (
          <div key={op.step} style={styles.step}>
            <div style={styles.stepNum}>{op.step}</div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 600 }}>{op.action}</p>
              <p style={{ fontSize: 13, opacity: 0.7 }}>{op.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Payment details */}
      <div style={styles.card}>
        <p style={{ ...styles.label, marginBottom: 12 }}>Payment Details</p>
        <p style={styles.label}>Amount</p>
        <p style={styles.value}>
          {intent.amount} {symbol}
        </p>
        <p style={styles.label}>Recipient</p>
        <p
          style={{
            ...styles.value,
            fontFamily: 'monospace',
            fontSize: 13,
            wordBreak: 'break-all',
          }}
        >
          {intent.recipient}
        </p>
        <p style={styles.label}>Network</p>
        <p style={styles.value}>{intent.network}</p>
      </div>

      {/* Safety assurance */}
      <div style={styles.card}>
        <p style={{ ...styles.label, marginBottom: 8 }}>
          This Transaction CANNOT
        </p>
        {[
          'Access your other tokens or objects',
          'Approve future transactions on your behalf',
          'Change your account permissions',
          'Interact with any smart contract beyond the transfer',
        ].map((item, i) => (
          <p key={i} style={styles.cannotList}>
            &#x2717; {item}
          </p>
        ))}
      </div>

      {/* Sign buttons */}
      <button
        style={{ ...styles.btn, ...styles.primaryBtn }}
        onClick={handleZkLogin}
      >
        Sign with Google (zkLogin)
      </button>
      <button
        style={{ ...styles.btn, ...styles.secondaryBtn }}
        onClick={handleWalletConnect}
      >
        Sign with Wallet (WalletConnect)
      </button>
    </div>
  );
}

import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import {
  genAddressSeed,
  generateNonce,
  generateRandomness,
  getZkLoginSignature,
  jwtToAddress,
} from '@mysten/zklogin';
import { decodeJwt } from 'jose';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SetupData {
  maxEpoch: number;
  randomness: string;
  ephemeralPublicKey: string;
  ephemeralPrivateKey: string;
}

export interface AccountData {
  userAddr: string;
  zkProofs: any;
  ephemeralPublicKey: string;
  ephemeralPrivateKey: string;
  userSalt: string;
  sub: string;
  aud: string;
  maxEpoch: number;
}

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

const SETUP_KEY = 'due_ai_zklogin_setup';
const ACCOUNT_KEY = 'due_ai_zklogin_account';
const INTENT_KEY = 'due_ai_intent';

// ---------------------------------------------------------------------------
// Ephemeral KeyPair + Nonce
// ---------------------------------------------------------------------------

/**
 * Begin the zkLogin flow:
 * 1. Create ephemeral keypair
 * 2. Generate nonce for OAuth
 * 3. Save setup data to sessionStorage
 * Returns the nonce to use in the OAuth URL.
 */
export function beginZkLoginSetup(maxEpoch: number): { nonce: string; setupData: SetupData } {
  const ephemeralKeyPair = new Ed25519Keypair();
  const randomness = generateRandomness();
  const pubKey = ephemeralKeyPair.getPublicKey();
  const nonce = generateNonce(pubKey as any, maxEpoch, randomness);

  // The ZK prover expects extendedEphemeralPublicKey as a BigInt string
  // derived from the public key's Sui bytes (flag byte + key bytes)
  const pubKeyBytes = pubKey.toSuiBytes();
  let bigIntValue = 0n;
  for (const byte of pubKeyBytes) {
    bigIntValue = (bigIntValue << 8n) | BigInt(byte);
  }

  const setupData: SetupData = {
    maxEpoch,
    randomness: randomness.toString(),
    ephemeralPublicKey: bigIntValue.toString(),
    ephemeralPrivateKey: ephemeralKeyPair.export().privateKey,
  };

  sessionStorage.setItem(SETUP_KEY, JSON.stringify(setupData));
  return { nonce, setupData };
}

// ---------------------------------------------------------------------------
// Google OAuth URL
// ---------------------------------------------------------------------------

export function getGoogleOAuthUrl(
  nonce: string,
  clientId: string,
  redirectUri: string
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'id_token',
    scope: 'openid',
    nonce,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// OAuth Redirect Handler
// ---------------------------------------------------------------------------

/**
 * Check if we're returning from an OAuth redirect.
 * Returns the JWT id_token if found, null otherwise.
 */
export function extractJwtFromUrl(): string | null {
  const hash = window.location.hash.substring(1);
  const params = new URLSearchParams(hash);
  const jwt = params.get('id_token');
  if (jwt) {
    // Clean up the URL fragment
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    return jwt;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Setup data persistence
// ---------------------------------------------------------------------------

export function loadSetupData(): SetupData | null {
  const raw = sessionStorage.getItem(SETUP_KEY);
  if (!raw) return null;
  return JSON.parse(raw);
}

export function clearSetupData(): void {
  sessionStorage.removeItem(SETUP_KEY);
}

// ---------------------------------------------------------------------------
// Intent persistence (survives OAuth redirect)
// ---------------------------------------------------------------------------

export function saveIntent(intent: any): void {
  sessionStorage.setItem(INTENT_KEY, JSON.stringify(intent));
}

export function loadIntent(): any | null {
  const raw = sessionStorage.getItem(INTENT_KEY);
  if (!raw) return null;
  return JSON.parse(raw);
}

// ---------------------------------------------------------------------------
// Salt — deterministic from Google `sub` claim
// Uses the same approach as the reference demo salt service.
// In production, use a dedicated salt server.
// ---------------------------------------------------------------------------

export function getSaltFromJwt(jwt: string): string {
  const payload = decodeJwt(jwt);
  const sub = payload.sub as string;
  // Deterministic salt derived from sub — simple hash for hackathon
  // Production should use a proper salt service (see reference salt-service.js)
  let hash = 0n;
  const input = 'due-ai-salt:' + sub;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31n + BigInt(input.charCodeAt(i))) % (2n ** 128n);
  }
  return hash.toString();
}

// ---------------------------------------------------------------------------
// Derive Sui address from JWT + salt
// ---------------------------------------------------------------------------

export function deriveAddress(jwt: string, userSalt: string): string {
  return jwtToAddress(jwt, BigInt(userSalt));
}

// ---------------------------------------------------------------------------
// ZK Proof — from prover service
// ---------------------------------------------------------------------------

export async function fetchZkProof(
  jwt: string,
  setupData: SetupData,
  userSalt: string,
  proverUrl: string
): Promise<any> {
  const payload = {
    maxEpoch: setupData.maxEpoch,
    jwtRandomness: setupData.randomness,
    extendedEphemeralPublicKey: setupData.ephemeralPublicKey,
    jwt,
    salt: userSalt,
    keyClaimName: 'sub',
  };

  const response = await fetch(proverUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`ZK prover error (${response.status}): ${errText}`);
  }

  return response.json();
}

// ---------------------------------------------------------------------------
// Assemble zkLogin Signature + Execute
// ---------------------------------------------------------------------------

/**
 * Build the zkLogin signature from ZK proofs + ephemeral signature.
 * Follows the reference: genAddressSeed(salt, 'sub', sub, aud) for addressSeed.
 */
export function assembleZkLoginSignature(
  zkProofs: any,
  userSignature: string,
  userSalt: string,
  sub: string,
  aud: string,
  maxEpoch: number
): string {
  const addressSeed = genAddressSeed(
    BigInt(userSalt),
    'sub',
    sub,
    aud
  ).toString();

  return getZkLoginSignature({
    inputs: {
      ...zkProofs,
      addressSeed,
    },
    maxEpoch,
    userSignature,
  });
}

// ---------------------------------------------------------------------------
// Complete zkLogin flow after OAuth redirect
// Returns AccountData ready for signing, or null if not in redirect flow.
// ---------------------------------------------------------------------------

export async function completeZkLogin(
  proverUrl: string
): Promise<AccountData | null> {
  const jwt = extractJwtFromUrl();
  if (!jwt) return null;

  const payload = decodeJwt(jwt);
  if (!payload.sub || !payload.aud) {
    throw new Error('JWT missing sub or aud claims');
  }

  const setupData = loadSetupData();
  if (!setupData) {
    throw new Error('Missing setup data — OAuth flow was not initiated properly');
  }
  clearSetupData();

  // Derive salt and address
  const userSalt = getSaltFromJwt(jwt);
  const userAddr = deriveAddress(jwt, userSalt);

  // Get ZK proof from prover service
  const zkProofs = await fetchZkProof(jwt, setupData, userSalt, proverUrl);

  return {
    userAddr,
    zkProofs,
    ephemeralPublicKey: setupData.ephemeralPublicKey,
    ephemeralPrivateKey: setupData.ephemeralPrivateKey,
    userSalt,
    sub: payload.sub,
    aud: typeof payload.aud === 'string' ? payload.aud : payload.aud[0],
    maxEpoch: setupData.maxEpoch,
  };
}

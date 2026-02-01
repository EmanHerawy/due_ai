import { DueAiSuiClient } from '../src/clients/sui-client.js';
import { getBalance, formatBalance, listUserAssets } from '../src/tools/sui-balance.js';

async function demo() {
  const client = new DueAiSuiClient('testnet');

  // Test with the zero address (system address that typically has SUI)
  const address = '0x0000000000000000000000000000000000000000000000000000000000000000';

  console.log('');
  console.log('🔍 Testing Sui Wallet Balance on Testnet');
  console.log('=========================================');
  console.log('Address:', address);
  console.log('');

  // Test 1: Get raw balances
  console.log('--- getBalance() ---');
  const result = await getBalance(client, address);
  console.log('Network:', result.network);
  console.log('Total Coin Objects:', result.totalCoins);
  console.log('Balances:');
  for (const [token, balance] of Object.entries(result.balances)) {
    const decimals = token === 'SUI' ? 9 : 6;
    const formatted = formatBalance(balance, decimals);
    console.log(`  ${token}: ${formatted}`);
  }

  console.log('');

  // Test 2: List user assets with details
  console.log('--- listUserAssets() ---');
  const assets = await listUserAssets(client, address);
  console.log(`Total Assets: ${assets.totalAssets}`);
  console.log('');
  console.log('Assets:');
  for (const asset of assets.assets) {
    console.log(`  ${asset.symbol}:`);
    console.log(`    Balance: ${asset.formattedBalance}`);
    console.log(`    Decimals: ${asset.decimals}`);
    console.log(`    CoinType: ${asset.coinType}`);
  }

  console.log('');
  console.log('✅ All balance checks successful!');
  console.log('');
}

demo().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});

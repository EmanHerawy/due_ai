import { DueAiSuiClient } from '../src/clients/sui-client.js';
import { getBalance, formatBalance } from '../src/tools/sui-balance.js';

async function demo() {
  const client = new DueAiSuiClient('testnet');

  // Test with the zero address (system address that typically has SUI)
  const address = '0x0000000000000000000000000000000000000000000000000000000000000000';

  console.log('');
  console.log('🔍 Testing Sui Wallet Balance on Testnet');
  console.log('=========================================');
  console.log('Address:', address);
  console.log('');

  const result = await getBalance(client, address);
  console.log('Network:', result.network);
  console.log('Total Coin Objects:', result.totalCoins);
  console.log('');
  console.log('Balances:');

  for (const [token, balance] of Object.entries(result.balances)) {
    const decimals = token === 'SUI' ? 9 : 6;
    const formatted = formatBalance(balance, decimals);
    console.log(`  ${token}: ${formatted}`);
  }

  console.log('');
  console.log('✅ Balance check successful!');
  console.log('');
}

demo().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});

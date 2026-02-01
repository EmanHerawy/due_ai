import { LiFiClient } from '../src/clients/lifi-client.js';
import { getSupportedChains, getChainById, searchChains, getChainTokens } from '../src/tools/lifi-chains.js';

async function demo() {
  const client = new LiFiClient();

  console.log('');
  console.log('🌉 LI.FI Observer Agent Demo');
  console.log('============================');
  console.log('');

  // Health check
  console.log('1. Health Check');
  const health = await client.healthCheck();
  console.log(`   Status: ${health.healthy ? '✓ Healthy' : '✗ Unhealthy'}`);
  console.log(`   Latency: ${health.latencyMs}ms`);
  console.log('');

  // Get all chains
  console.log('2. Supported Chains');
  const chains = await getSupportedChains(client);
  console.log(`   Total: ${chains.data.totalChains} chains`);
  console.log(`   Mainnets: ${chains.data.mainnetCount}`);
  console.log(`   Testnets: ${chains.data.testnetCount}`);
  console.log(`   Types: ${chains.data.chainTypes.join(', ')}`);
  console.log(`   Confidence: ${(chains.confidence.score * 100).toFixed(0)}%`);
  console.log('');

  // Show first 10 chains
  console.log('   Top 10 Chains:');
  chains.data.chains.slice(0, 10).forEach((chain, i) => {
    console.log(`   ${i + 1}. ${chain.name} (ID: ${chain.id}, Token: ${chain.nativeToken})`);
  });
  console.log('');

  // Search for Arbitrum chains
  console.log('3. Search: "arbitrum"');
  const arbitrumChains = await searchChains(client, 'arbitrum');
  arbitrumChains.data.forEach((chain) => {
    console.log(`   - ${chain.name} (ID: ${chain.id})`);
  });
  console.log('');

  // Get specific chain
  console.log('4. Get Chain by ID: 137 (Polygon)');
  const polygon = await getChainById(client, 137);
  if (polygon.data) {
    console.log(`   Name: ${polygon.data.name}`);
    console.log(`   Key: ${polygon.data.key}`);
    console.log(`   Native Token: ${polygon.data.nativeToken}`);
    console.log(`   Type: ${polygon.data.type}`);
  }
  console.log('');

  // Get tokens for a chain
  console.log('5. Tokens on Arbitrum (ID: 42161)');
  const arbTokens = await getChainTokens(client, 42161);
  console.log(`   Chain: ${arbTokens.data.chainName}`);
  console.log(`   Total Tokens: ${arbTokens.data.totalTokens}`);
  console.log('   Sample Tokens:');
  arbTokens.data.tokens.slice(0, 5).forEach((token) => {
    const price = token.priceUSD ? `$${parseFloat(token.priceUSD).toFixed(2)}` : 'N/A';
    console.log(`   - ${token.symbol}: ${token.name} (${price})`);
  });
  console.log('');

  console.log('✅ Demo complete!');
  console.log('');
}

demo().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});

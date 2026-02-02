# Due AI Web3 MCP Server

A Model Context Protocol (MCP) server for cross-chain crypto operations. Built for the **Observer Agent** pattern - read-only, zero authority, single source of truth.

## Features

- **Sui Blockchain** - Balance queries, token listings
- **LI.FI Integration** - Cross-chain quotes, routes, bridge tracking
- **Confidence Scoring** - Every response includes reliability metrics
- **61+ Chains Supported** - EVM, Solana, Bitcoin, SUI via LI.FI

## Quick Start

```bash
# Install dependencies
npm install

# Run tests
npm test

# Start MCP server (stdio transport)
npm run dev
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Observer Agent                           │
│            (Read-Only, Zero Authority)                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐    ┌─────────────────────────────────┐│
│  │   Sui Client    │    │         LI.FI Client            ││
│  │   (Testnet)     │    │         (Mainnet)               ││
│  └────────┬────────┘    └────────────┬────────────────────┘│
│           │                          │                      │
│  ┌────────▼────────┐    ┌────────────▼────────────────────┐│
│  │ • get_balance   │    │ • getSupportedChains            ││
│  │ • list_assets   │    │ • getQuote / getRoutes          ││
│  │ • get_token_bal │    │ • getTransactionStatus          ││
│  └─────────────────┘    │ • canBridge                     ││
│                         │ • getTokenPrice                 ││
│                         │ • getPortfolioValue             ││
│                         │ • getCrossChainTokens           ││
│                         └─────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

## LI.FI API Endpoints

| Endpoint | Method | Purpose | When to Use |
|----------|--------|---------|-------------|
| `/v1/quote` | **GET** | Single best quote | Want the recommended option |
| `/v1/advanced/routes` | **POST** | Multiple routes comparison | Show options to user |
| `/v1/status` | GET | Track transaction | Monitor cross-chain transfers |
| `/v1/chains` | GET | List supported chains | Foundation data |
| `/v1/tokens` | GET | List tokens per chain | Token discovery |
| `/v1/tools` | GET | Available bridges/DEXs | Check what bridges exist |

### Quote vs Routes

```
/v1/quote (GET)
├── Returns: Single best route
├── Includes: Ready-to-sign transaction data
├── Use when: You want the recommended option
└── Faster: Single optimized result

/v1/advanced/routes (POST)
├── Returns: Multiple routes (11+ options)
├── Includes: Comparison data (fastest, cheapest)
├── Use when: You want to show options to user
└── More data: But requires POST with JSON body
```

## Supported Chains

| Chain | ID | Type | Status |
|-------|-----|------|--------|
| Ethereum | 1 | EVM | ✅ |
| Polygon | 137 | EVM | ✅ |
| Arbitrum | 42161 | EVM | ✅ |
| Optimism | 10 | EVM | ✅ |
| Base | 8453 | EVM | ✅ |
| BSC | 56 | EVM | ✅ |
| Avalanche | 43114 | EVM | ✅ |
| **SUI** | 9270000000000000 | MVM | ✅ |
| Solana | 1151111081099710 | SVM | ✅ |
| Bitcoin | 20000000000001 | UTXO | ✅ |
| + 50 more... | | | |

## Confidence Scoring

Every response includes reliability metrics:

```typescript
{
  data: { ... },
  confidence: {
    score: 0.95,        // 0-1 confidence level
    freshness: "live",  // Data freshness
    source: "li.fi",    // Data source
    latencyMs: 150,     // API response time
    healthy: true       // Is API healthy?
  },
  timestamp: "2024-..."
}
```

### Score Calculation

| Latency | Score |
|---------|-------|
| < 500ms | 1.0 |
| < 1000ms | 0.95 |
| < 2000ms | 0.85 |
| < 5000ms | 0.70 |
| > 5000ms | 0.50 |

## API Reference

### Sui Balance Tools

```typescript
// Get all balances for a wallet
const balances = await getBalance(client, "0x...");

// Get specific token balance
const sui = await getTokenBalance(client, "0x...", "SUI");

// List all assets with details
const assets = await listUserAssets(client, "0x...");
```

### LI.FI Chain Tools

```typescript
// Get all supported chains
const chains = await getSupportedChains(client);

// Search chains
const results = await searchChains(client, "arbitrum");

// Get tokens for a chain
const tokens = await getChainTokens(client, 1); // Ethereum
```

### LI.FI Quote Tools

```typescript
// Get single best quote
const quote = await getQuote(
  client,
  1,        // fromChain: Ethereum
  137,      // toChain: Polygon
  "0xA0b...", // fromToken: USDC
  "0x3c4...", // toToken: USDC
  "1000000"   // amount: 1 USDC
);

// Get multiple routes for comparison
const routes = await getRoutes(client, ...);

// Check if bridging is possible
const canDo = await canBridge(client, 1, 137);

// Track transaction status
const status = await getTransactionStatus(client, txHash, 1, 137);

// Get human-readable description
const desc = await getQuoteDescription(client, ...);
```

### LI.FI Portfolio Tools

```typescript
// Get token price by address
const price = await getTokenPrice(client, 1, "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
// Returns: { symbol: "USDC", priceUSD: 1.0, ... }

// Get token price by symbol (searches across chains)
const prices = await getTokenPriceBySymbol(client, "USDC");
// Returns: USDC prices on Ethereum, Polygon, Arbitrum, etc.

// Get common token prices (USDC, USDT, DAI, WETH, WBTC, ETH)
const common = await getCommonTokenPrices(client);
// Returns: { USDC: { priceUSD: 1.0 }, WETH: { priceUSD: 2285.52 }, ... }

// Get tokens across multiple chains
const tokens = await getCrossChainTokens(client, [1, 137, 42161]);
// Returns: Top 50 tokens per chain with prices

// Calculate portfolio value from balances
const portfolio = calculatePortfolioValue(balances, priceMap);
// Returns: { totalValueUSD, chainCount, tokenCount, topHoldings, chains }

// Format portfolio as readable string
const description = formatPortfolioDescription(portfolio);
// Returns: Markdown formatted portfolio summary
```

## Test Results

```
Test Files  4 passed
Tests       65 passed

✓ Sui Balance Tests (17)
✓ LI.FI Chain Tests (19)
✓ LI.FI Quote Tests (13)
✓ LI.FI Portfolio Tests (16)
```

## Project Structure

```
web3-mcp-server/
├── src/
│   ├── index.ts              # MCP server entry
│   ├── clients/
│   │   ├── sui-client.ts     # Sui blockchain client
│   │   └── lifi-client.ts    # LI.FI API client
│   └── tools/
│       ├── sui-balance.ts    # Sui balance tools
│       ├── lifi-chains.ts    # LI.FI chain tools
│       ├── lifi-quotes.ts    # LI.FI quote tools
│       └── lifi-portfolio.ts # LI.FI portfolio tools
├── tests/
│   ├── sui-balance.test.ts
│   ├── lifi-chains.test.ts
│   ├── lifi-quotes.test.ts
│   └── lifi-portfolio.test.ts
├── Dockerfile
├── docker-compose.yml
└── package.json
```

## Environment Variables

```bash
# Sui network (testnet, mainnet, devnet)
SUI_NETWORK=testnet

# Optional: LI.FI API key for higher rate limits
LIFI_API_KEY=your-key-here
```

## Docker

```bash
# Build
docker compose build

# Run with OpenClaw
docker compose up -d openclaw-gateway

# Test MCP server directly
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | \
  docker compose run --rm -i due-ai-web3-mcp
```

## Notes

- **LI.FI = Mainnet only** - No testnet support
- **Sui Direct = Testnet** - For development/testing
- **Observer Agent = Read-only** - No execution, no signing

## License

MIT

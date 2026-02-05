# Due AI Web3 - Cross-Chain Crypto Tools

Query blockchain data across 61+ chains via MCP. Supports Sui, Ethereum, Polygon, Arbitrum, Solana, Bitcoin, and more through LI.FI integration.

## Sui Blockchain Tools

### get_balance
Get all token balances for a Sui wallet address.

**Arguments:**
- `address` (string, required): Sui wallet address (0x...)

### get_token_balance
Get balance of a specific token for a Sui wallet.

**Arguments:**
- `address` (string, required): Sui wallet address (0x...)
- `token` (string, required): Token symbol (e.g., SUI, USDC)

### list_user_assets
List all assets a user holds with detailed information.

**Arguments:**
- `address` (string, required): Sui wallet address (0x...)

## LI.FI Chain Tools

### get_supported_chains
Get all 61+ supported blockchain chains (Ethereum, Polygon, Sui, Solana, Bitcoin, etc.)

**Arguments:** None

### search_chains
Search for chains by name or key.

**Arguments:**
- `query` (string, required): Search query (e.g., "ethereum", "sui")

### get_chain_tokens
Get available tokens on a specific chain.

**Arguments:**
- `chainId` (number, required): Chain ID (e.g., 1 for Ethereum, 137 for Polygon)

## LI.FI Quote Tools

### get_quote
Get a quote for a cross-chain or same-chain token swap.

**Arguments:**
- `fromChain` (number, required): Source chain ID
- `toChain` (number, required): Destination chain ID
- `fromToken` (string, required): Source token address
- `toToken` (string, required): Destination token address
- `fromAmount` (string, required): Amount in smallest units (wei)
- `fromAddress` (string, optional): User's wallet address

### get_routes
Get multiple route options to compare (fastest, cheapest, recommended).

**Arguments:**
- `fromChain` (number, required): Source chain ID
- `toChain` (number, required): Destination chain ID
- `fromToken` (string, required): Source token address
- `toToken` (string, required): Destination token address
- `fromAmount` (string, required): Amount in smallest units

### can_bridge
Check if bridging is possible between two chains.

**Arguments:**
- `fromChain` (number, required): Source chain ID
- `toChain` (number, required): Destination chain ID

### get_transaction_status
Track the status of a cross-chain transaction.

**Arguments:**
- `txHash` (string, required): Transaction hash
- `fromChain` (number, required): Source chain ID
- `toChain` (number, required): Destination chain ID

### get_quote_description
Get a human-readable description of a cross-chain quote.

**Arguments:**
- `fromChain` (number, required): Source chain ID
- `toChain` (number, required): Destination chain ID
- `fromToken` (string, required): Source token address
- `toToken` (string, required): Destination token address
- `fromAmount` (string, required): Amount in smallest units

## LI.FI Portfolio Tools

### get_token_price
Get the current USD price for a token.

**Arguments:**
- `chainId` (number, required): Chain ID
- `tokenAddress` (string, required): Token contract address

### get_token_price_by_symbol
Get token prices across chains by symbol.

**Arguments:**
- `symbol` (string, required): Token symbol (e.g., USDC, WETH)
- `preferredChainId` (number, optional): Preferred chain to search

### get_common_token_prices
Get prices for common tokens (USDC, USDT, DAI, WETH, WBTC, ETH).

**Arguments:** None

## LI.FI Gas Tools

### get_gas_price
Get current gas prices for a chain (standard, fast, instant).

**Arguments:**
- `chainId` (number, required): Chain ID

### compare_gas_prices
Compare gas prices across multiple chains.

**Arguments:**
- `chainIds` (array of numbers, optional): Chain IDs to compare

### estimate_transaction_cost
Estimate total cost (gas + bridge fees) for a transfer.

**Arguments:**
- `fromChain` (number, required): Source chain ID
- `toChain` (number, required): Destination chain ID
- `fromToken` (string, required): Source token address
- `toToken` (string, required): Destination token address
- `fromAmount` (string, required): Amount in smallest units

### get_wallet_balances
Get token balances for a wallet across multiple EVM chains.

**Arguments:**
- `walletAddress` (string, required): Wallet address (0x...)
- `chainIds` (array of numbers, optional): Chains to check

## Common Chain IDs

| Chain | ID |
|-------|-----|
| Ethereum | 1 |
| Polygon | 137 |
| Arbitrum | 42161 |
| Optimism | 10 |
| Base | 8453 |
| BSC | 56 |
| Avalanche | 43114 |
| Sui | 9270000000000000 |
| Solana | 1151111081099710 |

## Configuration

Environment variables:
- `SUI_NETWORK`: Sui network (testnet, mainnet, devnet) - default: testnet
- `LIFI_API_KEY`: Optional LI.FI API key for higher rate limits

## MCP Server

This skill uses an MCP server with stdio transport. Configure via mcporter:

```bash
# Local development
mcporter add due-ai-web3 --transport stdio -- npx tsx src/index.ts

# Docker
mcporter add due-ai-web3 --transport stdio -- docker compose run --rm -i due-ai-web3-mcp
```

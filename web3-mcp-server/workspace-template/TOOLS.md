# Tools Guide

## MCP Server: Due AI Web3

18 tools available via MCP stdio transport. All tools are **read-only observers** — no execution, no signing.

### Tool Categories

**Sui Direct (3 tools)**
Works against Sui testnet/mainnet/devnet via @mysten/sui.js.
- `get_balance` — all tokens for a Sui address
- `get_token_balance` — specific token for a Sui address
- `list_user_assets` — detailed asset list with formatted balances

**Chain Discovery (3 tools)**
Via LI.FI SDK. Mainnet only.
- `get_supported_chains` — full list of 61+ chains
- `search_chains` — fuzzy search by name/key
- `get_chain_tokens` — tokens available on a chain

**Cross-Chain Quotes (5 tools)**
Via LI.FI SDK. Mainnet only.
- `get_quote` — best single route
- `get_routes` — multiple routes for comparison
- `can_bridge` — check bridge availability between two chains
- `get_transaction_status` — track cross-chain tx by hash
- `get_quote_description` — human-readable markdown summary

**Prices (3 tools)**
Via LI.FI SDK.
- `get_token_price` — by chain ID + token address
- `get_token_price_by_symbol` — by symbol across chains
- `get_common_token_prices` — USDC, USDT, DAI, WETH, WBTC, ETH

**Gas & Wallets (4 tools)**
Via LI.FI SDK.
- `get_gas_price` — gas tiers for a single chain
- `compare_gas_prices` — side-by-side gas across chains
- `estimate_transaction_cost` — gas + bridge fees in USD
- `get_wallet_balances` — EVM multi-chain portfolio scan

### Confidence Scoring

Every tool response includes a `confidence` object:
- `score`: 0.0–1.0 (based on API latency)
- `freshness`: "live" or "cached"
- `healthy`: boolean
- `latencyMs`: response time

If `score < 0.7`, warn the user that data may be delayed.

### Rate Limits

LI.FI API may throttle without `LIFI_API_KEY`. Tools handle 429 errors gracefully and return confidence score 0. Retry after a brief pause.

### Conventions

- Token amounts in tool params use **smallest units** (wei, lamports, MIST). The tools return both raw and formatted values.
- Sui addresses start with `0x` and are 64 hex characters.
- EVM addresses start with `0x` and are 40 hex characters.
- Known token decimals: SUI(9), USDC(6), USDT(6), WETH(8), WBTC(8). Unknown defaults to 9.

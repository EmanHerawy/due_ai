# Tools Guide

## Calling MCP Tools via mcporter

MCP tools are **not** built-in agent tools. You must use the `exec` tool to invoke them through mcporter.

### Key Rules

- Always use the full dotted address: `due-ai-web3.<tool_name>`
- The `call` command is **implicit** — dotted tokens (`server.tool`) auto-trigger it. No need to write `mcporter call`.
- Always append `--output json` for structured responses.

### Argument Styles

mcporter accepts multiple argument styles. All feed the same validation pipeline (type coercion, required-field checks).

| Style | Example |
|-------|---------|
| Function-call (preferred) | `npx mcporter 'due-ai-web3.get_balance(address: "0x...")'` |
| Flag-based | `npx mcporter due-ai-web3.get_balance address=0x...` |
| Key-colon | `npx mcporter due-ai-web3.get_balance address: "0x..."` |
| JSON payload | `npx mcporter call due-ai-web3.get_balance --args '{"address":"0x..."}'` |

### Function-Call Syntax Notes

- **Named arguments preferred**: `address: "0x1234"` is self-documenting.
- **Positional fallback**: omit labels and arguments map to schema order — `'due-ai-web3.search_chains("polygon")'` maps the first argument to `query`.
- **Supported literals**: strings (`"..."`), numbers (`137`), booleans (`true`), `null`, arrays (`[1, 137]`), nested objects.
- **Shell quoting**: wrap the whole expression in single quotes so the shell leaves parentheses and commas intact.

### Error Handling

- mcporter **auto-corrects** minor typos (e.g., `getBalance` → `get_balance`) and logs the correction.
- If the distance is too large, it suggests the closest match: `Did you mean due-ai-web3.get_balance?`
- Invalid keys or parser failures return actionable error messages.

### Discovering Tools

- `npx mcporter list due-ai-web3` — shows all tools with TypeScript-style signatures and example invocations.
- `npx mcporter list due-ai-web3 --all-parameters` — reveals hidden optional parameters.
- `npx mcporter list due-ai-web3 --schema` — raw JSON schemas.

---

## MCP Server: due-ai-web3

18 tools. All **read-only observers** — no execution, no signing.

### Sui Direct (3 tools)

Works against Sui testnet/mainnet/devnet via @mysten/sui.js.
- `due-ai-web3.get_balance` — all tokens for a Sui address
- `due-ai-web3.get_token_balance` — specific token for a Sui address
- `due-ai-web3.list_user_assets` — detailed asset list with formatted balances

### Chain Discovery (3 tools)

Via LI.FI SDK. Mainnet only.
- `due-ai-web3.get_supported_chains` — full list of 61+ chains
- `due-ai-web3.search_chains` — fuzzy search by name/key
- `due-ai-web3.get_chain_tokens` — tokens available on a chain

### Cross-Chain Quotes (5 tools)

Via LI.FI SDK. Mainnet only.
- `due-ai-web3.get_quote` — best single route
- `due-ai-web3.get_routes` — multiple routes for comparison
- `due-ai-web3.can_bridge` — check bridge availability between two chains
- `due-ai-web3.get_transaction_status` — track cross-chain tx by hash
- `due-ai-web3.get_quote_description` — human-readable markdown summary

### Prices (3 tools)

Via LI.FI SDK.
- `due-ai-web3.get_token_price` — by chain ID + token address
- `due-ai-web3.get_token_price_by_symbol` — by symbol across chains
- `due-ai-web3.get_common_token_prices` — USDC, USDT, DAI, WETH, WBTC, ETH

### Gas & Wallets (4 tools)

Via LI.FI SDK.
- `due-ai-web3.get_gas_price` — gas tiers for a single chain
- `due-ai-web3.compare_gas_prices` — side-by-side gas across chains
- `due-ai-web3.estimate_transaction_cost` — gas + bridge fees in USD
- `due-ai-web3.get_wallet_balances` — EVM multi-chain portfolio scan

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

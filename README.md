
# Due AI

### AI-powered crypto payment agent with on-chain guardrails, cross-chain routing, and one-tap signing.

**Never Miss a Payment. Never Think About It.**

Due AI is a non-custodial financial agent that automates crypto bills, salaries, and subscriptions. It understands your payment obligations in natural language, finds the best routes across 61+ chains, and executes everything within spending limits you control on-chain.

> "Nothing moves without your consent — except the things you explicitly pre-approved, within limits you control."

[Try the Bot](https://t.me/DueAI_bot)

---

## The Problem

Crypto payments today are **manual and fragmented**:

- **The Token Gap:** You hold SUI, but your bill is in USDC.
- **The Chain Gap:** Your funds are on Ethereum, but the payment is on Sui.
- **The Memory Gap:** You forget the date, your service gets cut, or your freelancer doesn't get paid.

## The Solution

Due AI is a non-custodial crypto CFO. You tell it what you owe in plain English, and it builds the transactions to make it happen — all protected by on-chain spending guardrails.

### Example Flows

**One-time transfer:**
> "Send 1 SUI to 0x0350...95fb"

The agent builds an unsigned transaction, shows you a step-by-step breakdown of what you're signing, and presents a one-tap "Sign Now" link that opens the Signing Portal mini app.

**Recurring payment:**
> "Pay my $15 Netflix sub on the 10th of every month"

The agent saves the intent. On the due date, it checks your vault balance, routes through the cheapest swap/bridge if needed, and presents the transaction for signing.

**Cross-chain payment:**
> "Send $1000 USDC to alice.eth on Sui"

The agent scans your balances across chains, finds the best route via LI.FI or DeepBook, shows you the fees and execution time, and builds the transaction.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     User (Telegram)                         │
└──────────────────────────┬──────────────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │  OpenClaw   │  AI Gateway (LLM + channels)
                    │  Gateway    │  Gemini / Claude / GPT / Ollama
                    └──────┬──────┘
                           │ mcporter (stdio)
                    ┌──────▼──────┐
                    │  Due AI     │  20 MCP Tools
                    │  MCP Server │  Sui + LI.FI + Transfer
                    └──┬─────┬───┘
                       │     │
              ┌────────▼┐  ┌─▼────────┐
              │ Sui RPC │  │ LI.FI    │
              │ testnet │  │ API      │
              └─────────┘  └──────────┘

┌─────────────────────────────────────────────────────────────┐
│  Signing Portal (Telegram Mini App)                         │
│  React + zkLogin + WalletConnect                            │
│  One-tap signing — no private keys leave the browser        │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Smart Contract Vaults (On-chain Guardrails)                │
│  Sui Move: agent_vault module (deployed on testnet)         │
│  EVM Solidity: AgentVault + AgentVaultFactory               │
└─────────────────────────────────────────────────────────────┘
```

---

## Sui Features

### Sui Move Smart Vault (`smart_contracts/vault/`)

A programmable vault deployed on **Sui testnet** that enforces spending guardrails entirely on-chain.

**Package ID:** [`0x0bc97f3891cab1ab6b1fe6afaa51f0c74975a0b1d8e16cf8f757b7e06962680c`](https://suiscan.xyz/testnet/object/0x0bc97f3891cab1ab6b1fe6afaa51f0c74975a0b1d8e16cf8f757b7e06962680c)

**Core objects:**
- **Vault** — Shared object holding multi-token balances via Sui's `Bag` + `Balance<T>` generics
- **OwnerCap** — Capability object proving vault ownership (Sui's object-capability pattern)
- **AgentCap** — Capability object granting an AI agent spending authority
- **SpendPolicy** — Per-agent, per-token spending limits with time-based period resets

**On-chain security model (3-layer authorization):**
1. Emergency stop check (pause flag)
2. Capability binding + runtime registry (`VecSet<ID>`)
3. Policy enforcement: `max_per_tx`, `total_per_period`, `max_tx_per_period` with lazy period reset

**Key functions:**
| Function | Description |
|----------|-------------|
| `create_vault` | Create a new vault, returns `OwnerCap` |
| `deposit<T>` | Deposit any coin type into the vault |
| `withdraw<T>` | Owner-only withdrawal |
| `add_agent` | Grant an agent `AgentCap` with spending rights |
| `set_policy<T>` | Set per-agent per-token spend limits |
| `execute_payment<T>` | Agent-initiated payment — enforces all guardrails |
| `pause` / `unpause` | Emergency stop |

### Sui Transfer Tools (MCP)

Two MCP tools for building and executing Sui transactions:

- **`build_sui_transfer`** — Builds unsigned Programmable Transaction Blocks (PTBs) for native SUI and custom coin transfers. Returns:
  - Base64-encoded transaction bytes
  - Educational step-by-step breakdown (Split Coins, Transfer Objects)
  - Gas estimate from dry-run
  - Risk assessment and security checklist
  - Signing Portal URL for one-tap signing

- **`execute_sui_signed_tx`** — Submits a signed transaction to the Sui network and returns the digest, status, balance changes, and explorer link.

### Sui Balance Tools (MCP)

- **`get_balance`** — All token balances for a Sui address (aggregated by symbol)
- **`get_token_balance`** — Specific token balance with formatted output
- **`list_user_assets`** — Detailed asset list with decimal-formatted balances

### Sui zkLogin Signing Portal

A **Telegram Mini App** (React + Vite) that enables one-tap transaction signing without exposing private keys:

1. User taps "Sign Now" in Telegram chat
2. Mini app opens with transaction details pre-loaded (encoded in `startapp` param)
3. User signs in with Google (zkLogin) or connects their wallet (WalletConnect)
4. Ephemeral Ed25519 keypair generated client-side, ZK proof fetched from Mysten Labs prover
5. Transaction signed and submitted — all within the browser, nothing leaves the device

**zkLogin flow:**
```
Google OAuth → JWT id_token → derive salt from sub claim
→ derive Sui address (jwtToAddress) → fetch ZK proof (prover.mystenlabs.com)
→ sign with ephemeral key → assemble zkLoginSignature → execute on Sui
```

---

## LI.FI Integration

15 MCP tools powered by the [LI.FI SDK](https://docs.li.fi/) for cross-chain operations across **61+ chains** including Ethereum, Polygon, Arbitrum, Optimism, Base, BSC, Sui, Solana, and Bitcoin.

### Chain Discovery (3 tools)
- **`get_supported_chains`** — Full list of 61+ supported chains (EVM, SVM, MVM, UTXO)
- **`search_chains`** — Fuzzy search by name or key (e.g., "polygon", "sui")
- **`get_chain_tokens`** — Available tokens on a specific chain

### Cross-Chain Quotes & Routing (5 tools)
- **`get_quote`** — Best single route for a swap or bridge
- **`get_routes`** — Multiple route options for comparison (fastest, cheapest, recommended)
- **`can_bridge`** — Check bridge availability between two chains
- **`get_transaction_status`** — Track cross-chain transaction by hash
- **`get_quote_description`** — Human-readable markdown summary of a quote

### Token Prices (3 tools)
- **`get_token_price`** — Current USD price by chain ID + token address
- **`get_token_price_by_symbol`** — Price by symbol across all chains
- **`get_common_token_prices`** — Quick prices for USDC, USDT, DAI, WETH, WBTC, ETH

### Gas & Wallets (4 tools)
- **`get_gas_price`** — Gas tiers (standard, fast, instant) for a chain
- **`compare_gas_prices`** — Side-by-side gas comparison across chains
- **`estimate_transaction_cost`** — Total cost (gas + bridge fees) in USD
- **`get_wallet_balances`** — Multi-chain EVM portfolio scan

Every LI.FI tool response includes a **confidence score** (0.0-1.0) based on API latency, freshness indicator, and health status.

---

## EVM Smart Vault (`smart_contracts/evm_vault/`)

A Solidity port of the Sui Move vault with identical security guarantees, enabling the same agent-guarded spending model on EVM chains.

- **AgentVault.sol** — Multi-token vault (ERC-20 via SafeERC20 + native ETH) with the same 3-layer authorization
- **AgentVaultFactory.sol** — One vault per user, simple CREATE deployment
- **Testing:** Foundry test suite with MockUSDC/MockDAI

| Sui Move | EVM Solidity |
|----------|-------------|
| `OwnerCap` (capability object) | `msg.sender == owner` (immutable) |
| `AgentCap` (owned object) + `VecSet` | `mapping(address => bool) activeAgents` |
| `Bag` + `Balance<T>` (type params) | ERC-20 addresses + `balanceOf` |
| `Clock` object | `block.timestamp` |
| Dynamic fields for `SpendPolicy` | `mapping(agent => mapping(token => SpendPolicy))` |
| `transfer::public_transfer` | `SafeERC20.safeTransfer` / `.call{value}` |

---

## How It's Made

### Technologies Used

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **AI Agent** | [OpenClaw](https://openclaw.com) + mcporter | AI gateway connecting LLMs to Telegram/Discord/WhatsApp channels |
| **LLM** | Google Gemini 2.5 Flash (swappable: Claude, GPT, Ollama) | Natural language understanding and tool orchestration |
| **Tool Protocol** | [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) | Standardized interface exposing 20 blockchain tools to any LLM |
| **Sui SDK** | `@mysten/sui.js` v0.54.1 | RPC client, PTB construction, transaction building |
| **zkLogin** | `@mysten/zklogin` v0.7.25 | Zero-knowledge Google sign-in for Sui transactions |
| **Cross-chain** | [LI.FI SDK](https://li.fi) v3.15.4 | Multi-chain routing, quotes, gas estimation (61+ chains) |
| **Sui Contracts** | Move language | On-chain vault with capability-based agent authorization |
| **EVM Contracts** | Solidity + OpenZeppelin | Equivalent vault on EVM chains with SafeERC20 + ReentrancyGuard |
| **Signing Portal** | React 19 + Vite | Telegram Mini App for one-tap transaction signing |
| **Infrastructure** | Docker Compose | Multi-service orchestration (gateway + MCP server) |
| **Deployment** | Vercel (signing portal), Docker (agent) | Production hosting |

### How the Pieces Fit Together

**The MCP Server** is the core integration layer. It's a Node.js process that speaks the Model Context Protocol over stdio, exposing 20 tools to the AI agent. The agent (running in OpenClaw) calls these tools via mcporter whenever the user asks about balances, prices, routes, or wants to send a transaction.

**The Sui client** (`DueAiSuiClient`) wraps `@mysten/sui.js` to build Programmable Transaction Blocks. For transfers, it constructs `splitCoins` + `transferObjects` operations, dry-runs them for gas estimation, and serializes to base64 bytes — all without touching private keys.

**The LI.FI client** (`LiFiClient`) wraps the LI.FI REST API with confidence scoring. Every response includes latency-based health metrics so the agent can warn users when data might be stale.

**The Signing Portal** is where the "hacky but elegant" part lives. When `build_sui_transfer` returns, it encodes the transaction intent (sender, recipient, amount, coin type, network) into a base64url string and embeds it in a Telegram Mini App URL: `https://t.me/DueAI_bot/sign?startapp={encoded_intent}`. The user taps "Sign Now" in the chat, the mini app opens with the transaction pre-loaded, and they sign with Google (zkLogin) or their wallet. The entire signing flow happens client-side in the browser — no private keys ever touch the server.

**The Smart Vaults** add the guardrail layer. When an AI agent has an `AgentCap`, it can call `execute_payment` on the vault — but only if the transaction passes all policy checks (max per tx, total per period, tx count). This means you can give the agent autonomy for small recurring payments while maintaining hard on-chain limits.

### Notable Hacks

**zkLogin for Telegram Mini Apps** — We use Sui's zkLogin to let users sign transactions with just their Google account, inside a Telegram Mini App. The ephemeral keypair is generated in-browser, the ZK proof is fetched from Mysten Labs' prover, and the transaction is submitted directly. No wallet extension needed, no seed phrase, no downloads. Users go from chat message to signed transaction in two taps.

**Transaction Intent Encoding in TMA `startapp`** — Telegram Mini Apps only receive a single string parameter (`startapp`). We compress the full transaction intent (sender, recipient, amount, coin type, network) into a compact JSON object with single-letter keys, base64url-encode it, and pass it as the `startapp` param. The mini app decodes it on load and pre-populates the signing flow.

**Educational Transaction Breakdown** — Every transfer includes a step-by-step breakdown of exactly what the user is signing ("Step 1: Split 1 SUI from your gas coin", "Step 2: Transfer to 0x0350..."), what the transaction CANNOT do ("Access your other tokens", "Approve future transactions"), and a risk level assessment. This isn't just UX polish — it's a trust mechanism that makes users comfortable signing transactions through a bot.

**Dual-Chain Vault with Identical Security** — The Sui Move vault and EVM Solidity vault share the exact same security model (3-layer auth, lazy period reset, emergency pause) but are implemented idiomatically for each chain. Sui uses capability objects and `VecSet` registries; EVM uses `msg.sender` checks and nested mappings. Same guarantees, different primitives.

**LLM-Agnostic via MCP** — The 20 blockchain tools are exposed via the Model Context Protocol, making the entire system LLM-agnostic. We've tested with Gemini, Claude, GPT-4, and even local Ollama models. Swap the model in one env var and the agent keeps working.

---

## Quick Start

```bash
cd web3-mcp-server

# 1. Configure
cp .env.example .env
# Edit .env: add your LLM API key and Telegram bot token

# 2. Setup
./setup.sh

# 3. Launch
docker compose up -d

# 4. Talk to your bot on Telegram
```

## Links

- [Telegram Bot](https://t.me/DueAI_bot)
- [Sui Vault Package (testnet)](https://suiscan.xyz/testnet/object/0x0bc97f3891cab1ab6b1fe6afaa51f0c74975a0b1d8e16cf8f757b7e06962680c)

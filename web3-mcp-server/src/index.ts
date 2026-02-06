#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { DueAiSuiClient, SuiNetwork } from "./clients/sui-client.js";
import { LiFiClient } from "./clients/lifi-client.js";
import { getBalance, getTokenBalance, listUserAssets } from "./tools/sui-balance.js";
import { getSupportedChains, searchChains, getChainTokens } from "./tools/lifi-chains.js";
import { getQuote, getRoutes, canBridge, getTransactionStatus, getQuoteDescription } from "./tools/lifi-quotes.js";
import { getTokenPrice, getTokenPriceBySymbol, getCommonTokenPrices } from "./tools/lifi-portfolio.js";
import { getGasPrice, compareGasPrices, estimateTransactionCost, getWalletBalances } from "./tools/lifi-gas.js";
import dotenv from "dotenv";

dotenv.config();

// Initialize Sui client
const network = (process.env.SUI_NETWORK as SuiNetwork) || "testnet";
const suiClient = new DueAiSuiClient(network);

// Initialize LI.FI client
const lifiClient = new LiFiClient();

// MCP Server using new McpServer API
const server = new McpServer({
  name: "due-ai-web3",
  version: "1.0.0",
});

// ============================================================================
// TOOL: get_balance
// ============================================================================
server.registerTool(
  "get_balance",
  {
    description: "Get all token balances for a Sui wallet address",
    inputSchema: {
      address: z.string().describe("Sui wallet address (0x...)"),
    },
  },
  async ({ address }) => {
    try {
      const result = await getBalance(suiClient, address);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              error: error instanceof Error ? error.message : String(error),
            }),
          },
        ],
        isError: true,
      };
    }
  }
);

// ============================================================================
// TOOL: get_token_balance
// ============================================================================
server.registerTool(
  "get_token_balance",
  {
    description: "Get balance of a specific token for a Sui wallet",
    inputSchema: {
      address: z.string().describe("Sui wallet address (0x...)"),
      token: z.string().describe("Token symbol (e.g., SUI, USDC)"),
    },
  },
  async ({ address, token }) => {
    try {
      const result = await getTokenBalance(suiClient, address, token);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              error: error instanceof Error ? error.message : String(error),
            }),
          },
        ],
        isError: true,
      };
    }
  }
);

// ============================================================================
// TOOL: list_user_assets
// ============================================================================
server.registerTool(
  "list_user_assets",
  {
    description:
      "List all assets (tokens) a user holds with detailed information including formatted balances",
    inputSchema: {
      address: z.string().describe("Sui wallet address (0x...)"),
    },
  },
  async ({ address }) => {
    try {
      const result = await listUserAssets(suiClient, address);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              error: error instanceof Error ? error.message : String(error),
            }),
          },
        ],
        isError: true,
      };
    }
  }
);

// ============================================================================
// TOOL: get_supported_chains (LI.FI)
// ============================================================================
server.registerTool(
  "get_supported_chains",
  {
    description: "Get all blockchain chains supported by LI.FI for cross-chain operations (61+ chains including Ethereum, Polygon, Arbitrum, Sui, Solana, Bitcoin)",
    inputSchema: {},
  },
  async () => {
    try {
      const result = await getSupportedChains(lifiClient);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) }],
        isError: true,
      };
    }
  }
);

// ============================================================================
// TOOL: search_chains (LI.FI)
// ============================================================================
server.registerTool(
  "search_chains",
  {
    description: "Search for blockchain chains by name or key (e.g., 'ethereum', 'polygon', 'sui')",
    inputSchema: {
      query: z.string().describe("Search query for chain name or key"),
    },
  },
  async ({ query }) => {
    try {
      const result = await searchChains(lifiClient, query);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) }],
        isError: true,
      };
    }
  }
);

// ============================================================================
// TOOL: get_chain_tokens (LI.FI)
// ============================================================================
server.registerTool(
  "get_chain_tokens",
  {
    description: "Get available tokens on a specific blockchain chain",
    inputSchema: {
      chainId: z.number().describe("Chain ID (e.g., 1 for Ethereum, 137 for Polygon)"),
    },
  },
  async ({ chainId }) => {
    try {
      const result = await getChainTokens(lifiClient, chainId);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) }],
        isError: true,
      };
    }
  }
);

// ============================================================================
// TOOL: get_quote (LI.FI)
// ============================================================================
server.registerTool(
  "get_quote",
  {
    description: "Get a quote for a cross-chain or same-chain token swap/bridge",
    inputSchema: {
      fromChain: z.number().describe("Source chain ID (e.g., 1 for Ethereum)"),
      toChain: z.number().describe("Destination chain ID (e.g., 137 for Polygon)"),
      fromToken: z.string().describe("Source token address"),
      toToken: z.string().describe("Destination token address"),
      fromAmount: z.string().describe("Amount in smallest units (wei)"),
      fromAddress: z.string().optional().describe("User's wallet address"),
    },
  },
  async ({ fromChain, toChain, fromToken, toToken, fromAmount, fromAddress }) => {
    try {
      const result = await getQuote(lifiClient, fromChain, toChain, fromToken, toToken, fromAmount, { fromAddress });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) }],
        isError: true,
      };
    }
  }
);

// ============================================================================
// TOOL: get_routes (LI.FI)
// ============================================================================
server.registerTool(
  "get_routes",
  {
    description: "Get multiple route options for a cross-chain swap to compare (fastest, cheapest, recommended)",
    inputSchema: {
      fromChain: z.number().describe("Source chain ID"),
      toChain: z.number().describe("Destination chain ID"),
      fromToken: z.string().describe("Source token address"),
      toToken: z.string().describe("Destination token address"),
      fromAmount: z.string().describe("Amount in smallest units"),
    },
  },
  async ({ fromChain, toChain, fromToken, toToken, fromAmount }) => {
    try {
      const result = await getRoutes(lifiClient, fromChain, toChain, fromToken, toToken, fromAmount);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) }],
        isError: true,
      };
    }
  }
);

// ============================================================================
// TOOL: can_bridge (LI.FI)
// ============================================================================
server.registerTool(
  "can_bridge",
  {
    description: "Check if bridging is possible between two chains and list available bridges",
    inputSchema: {
      fromChain: z.number().describe("Source chain ID"),
      toChain: z.number().describe("Destination chain ID"),
    },
  },
  async ({ fromChain, toChain }) => {
    try {
      const result = await canBridge(lifiClient, fromChain, toChain);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) }],
        isError: true,
      };
    }
  }
);

// ============================================================================
// TOOL: get_transaction_status (LI.FI)
// ============================================================================
server.registerTool(
  "get_transaction_status",
  {
    description: "Track the status of a cross-chain transaction",
    inputSchema: {
      txHash: z.string().describe("Transaction hash"),
      fromChain: z.number().describe("Source chain ID"),
      toChain: z.number().describe("Destination chain ID"),
    },
  },
  async ({ txHash, fromChain, toChain }) => {
    try {
      const result = await getTransactionStatus(lifiClient, txHash, fromChain, toChain);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) }],
        isError: true,
      };
    }
  }
);

// ============================================================================
// TOOL: get_quote_description (LI.FI)
// ============================================================================
server.registerTool(
  "get_quote_description",
  {
    description: "Get a human-readable description of a cross-chain quote",
    inputSchema: {
      fromChain: z.number().describe("Source chain ID"),
      toChain: z.number().describe("Destination chain ID"),
      fromToken: z.string().describe("Source token address"),
      toToken: z.string().describe("Destination token address"),
      fromAmount: z.string().describe("Amount in smallest units"),
    },
  },
  async ({ fromChain, toChain, fromToken, toToken, fromAmount }) => {
    try {
      const result = await getQuoteDescription(lifiClient, fromChain, toChain, fromToken, toToken, fromAmount);
      return {
        content: [{ type: "text" as const, text: result.data }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) }],
        isError: true,
      };
    }
  }
);

// ============================================================================
// TOOL: get_token_price (LI.FI)
// ============================================================================
server.registerTool(
  "get_token_price",
  {
    description: "Get the current USD price for a token on a specific chain",
    inputSchema: {
      chainId: z.number().describe("Chain ID (e.g., 1 for Ethereum)"),
      tokenAddress: z.string().describe("Token contract address"),
    },
  },
  async ({ chainId, tokenAddress }) => {
    try {
      const result = await getTokenPrice(lifiClient, chainId, tokenAddress);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) }],
        isError: true,
      };
    }
  }
);

// ============================================================================
// TOOL: get_token_price_by_symbol (LI.FI)
// ============================================================================
server.registerTool(
  "get_token_price_by_symbol",
  {
    description: "Get token prices across chains by symbol (e.g., USDC, WETH, WBTC)",
    inputSchema: {
      symbol: z.string().describe("Token symbol (e.g., USDC, WETH)"),
      preferredChainId: z.number().optional().describe("Preferred chain ID to search"),
    },
  },
  async ({ symbol, preferredChainId }) => {
    try {
      const result = await getTokenPriceBySymbol(lifiClient, symbol, preferredChainId);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) }],
        isError: true,
      };
    }
  }
);

// ============================================================================
// TOOL: get_common_token_prices (LI.FI)
// ============================================================================
server.registerTool(
  "get_common_token_prices",
  {
    description: "Get current prices for common tokens (USDC, USDT, DAI, WETH, WBTC, ETH)",
    inputSchema: {},
  },
  async () => {
    try {
      const result = await getCommonTokenPrices(lifiClient);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) }],
        isError: true,
      };
    }
  }
);

// ============================================================================
// TOOL: get_gas_price (LI.FI)
// ============================================================================
server.registerTool(
  "get_gas_price",
  {
    description: "Get current gas prices for a blockchain (standard, fast, instant)",
    inputSchema: {
      chainId: z.number().describe("Chain ID (e.g., 1 for Ethereum, 137 for Polygon)"),
    },
  },
  async ({ chainId }) => {
    try {
      const result = await getGasPrice(lifiClient, chainId);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) }],
        isError: true,
      };
    }
  }
);

// ============================================================================
// TOOL: compare_gas_prices (LI.FI)
// ============================================================================
server.registerTool(
  "compare_gas_prices",
  {
    description: "Compare gas prices across multiple chains to find the cheapest",
    inputSchema: {
      chainIds: z.array(z.number()).optional().describe("Chain IDs to compare (defaults to major chains)"),
    },
  },
  async ({ chainIds }) => {
    try {
      const result = await compareGasPrices(lifiClient, chainIds);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) }],
        isError: true,
      };
    }
  }
);

// ============================================================================
// TOOL: estimate_transaction_cost (LI.FI)
// ============================================================================
server.registerTool(
  "estimate_transaction_cost",
  {
    description: "Estimate the total cost (gas + bridge fees) for a cross-chain transfer",
    inputSchema: {
      fromChain: z.number().describe("Source chain ID"),
      toChain: z.number().describe("Destination chain ID"),
      fromToken: z.string().describe("Source token address"),
      toToken: z.string().describe("Destination token address"),
      fromAmount: z.string().describe("Amount in smallest units"),
    },
  },
  async ({ fromChain, toChain, fromToken, toToken, fromAmount }) => {
    try {
      const result = await estimateTransactionCost(lifiClient, fromChain, toChain, fromToken, toToken, fromAmount);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) }],
        isError: true,
      };
    }
  }
);

// ============================================================================
// TOOL: get_wallet_balances (LI.FI)
// ============================================================================
server.registerTool(
  "get_wallet_balances",
  {
    description: "Get token balances for a wallet address across multiple EVM chains (may be rate limited)",
    inputSchema: {
      walletAddress: z.string().describe("Wallet address (0x...)"),
      chainIds: z.array(z.number()).optional().describe("Chain IDs to check (defaults to major chains)"),
    },
  },
  async ({ walletAddress, chainIds }) => {
    try {
      const result = await getWalletBalances(lifiClient, walletAddress, chainIds);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) }],
        isError: true,
      };
    }
  }
);

// ============================================================================
// START SERVER (stdio transport for Clawdbot)
// ============================================================================
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Due AI Web3 MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});

# Boot Checklist

Runs on gateway restart when internal hooks are enabled.
1. Verify mcporter server is healthy by running: `npx mcporter list due-ai-web3`
2. If server is not listed or unhealthy, log to today's memory: "BOOT: MCP server unreachable at [time]."
3. Verify MCP tool connectivity by calling: `npx mcporter 'due-ai-web3.get_common_token_prices()' --output json`
4. If connectivity fails, log to today's memory: "BOOT: MCP tool call failed at [time]."
5. Read today's and yesterday's memory files from `memory/`.
6. Read `MEMORY.md` for long-term context.
7. If any watched wallets are stored in MEMORY.md, run a quick balance check using `due-ai-web3.get_balance` and note any significant changes.
8. Send status message via Telegram: "Due AI online. All systems go."
9. Check for pending payments from last session.
10. Load all scheduled payments.
11. Load guardrails from Move contracts.

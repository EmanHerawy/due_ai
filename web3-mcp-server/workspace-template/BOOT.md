# Boot Checklist

Runs on gateway restart when internal hooks are enabled.

1. Read today's and yesterday's memory files from `memory/`.
2. Read `MEMORY.md` for long-term context.
3. Verify MCP server connectivity by calling `get_common_token_prices`.
4. If connectivity fails, log to today's memory: "BOOT: MCP server unreachable at [time]."
5. If any watched wallets are stored in MEMORY.md, run a quick balance check and note any significant changes.
6. Send status message via Telegram: "Due AI online ⚡. All systems go."
8. Check for pending payments from last session.
9. Load all scheduled payments.
10. Load guardrails from Move contracts.

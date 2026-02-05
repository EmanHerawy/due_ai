# Heartbeat

## Daily Run Checklist

- Load today + yesterday from `memory/YYYY-MM-DD.md`
- Scan `MEMORY.md` for payments due today

- For each due payment:
  - Validate guardrails
  - Scan vault balances for required payment token
  - If payment token balance is insufficient:
    - If user holds other tokens with sufficient value:
      - Prepare optimal swap / bridge routes
      - If source wallet is agent-whitelisted AND within spending limit:
        - Execute swap(s) and payment autonomously
      - Else:
        - Prompt user to sign
    - Else:
      - Notify user of insufficient funds
  - Else if source wallet is agent-whitelisted AND within spending limit:
    - Execute payment autonomously
  - Else:
    - Prompt user to sign

- Log execution or prompt outcome to daily memory
- Notify user of any actions taken or signatures required
- Append daily summary to tax sheet if the payment was executed

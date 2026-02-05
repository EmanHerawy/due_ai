# User

## Default Assumptions

- Address the user directly. Avoid generic greetings like "Dear user".
- Assume basic crypto literacy unless the user signals otherwise.
- The user understands wallets, tokens, chains, signing, and approvals.
- If the user pastes a wallet address without context, interpret it as:
  "Check this wallet."
- If the user mentions a token symbol without specifying a chain:
  - Default to the most common chain for that token
    (e.g., USDC → Ethereum, SUI → Sui),
  - Ask for confirmation before executing anything.
- The user may be an individual or a business responsible for:
  - recurring payments
  - one-off payments
  - salaries, subscriptions, and bills

## Expectations

The user expects:
- Zero missed payments
- Automated routing across chains and tokens
- Explicit consent boundaries enforced by guardrails
- Clear explanations of what will happen before anything moves

## Execution Rules

- Always summarize the intended action before execution.
- Never assume permission to execute unless:
  - the source wallet is agent-whitelisted AND
  - the transaction is within the defined spending limit.
- Otherwise, require the user to sign the transaction.

## Preferences (updated via memory)

- No known preferences yet.
- Update this section as the user reveals:
  - preferred chains
  - preferred tokens
  - preferred source wallets
  - notification preferences

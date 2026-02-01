
# 🤖 Due AI

**Never Miss a Payment. Never Think About It.**

The AI copilot that handles your crypto bills, salaries, and subscriptions—automatically finding the best routes across chains and executing everything on time, every time.

---

## 🛑 The Problem

Crypto payments today are **manual and fragmented**.

* **The Token Gap:** You have SUI, but your bill is in USDC.
* **The Chain Gap:** You have funds on Ethereum, but the payment is on Sui.
* **The Memory Gap:** You forget the date, your service gets cut, or your freelancer doesn't get paid.

## ⚡ The Solution: Due AI

**Due AI** is a non-custodial financial agent. It doesn't just "store" your money; it **understands your obligations.** You tell the AI what you owe, and it builds the **Programmable Transaction Blocks (PTBs)** to make it happen.

### 🧠 How it Works

1. **Natural Intent:** You tell the Telegram bot: *"Pay my $15 Netflix sub on the 10th."*
2. **Autonomous Routing:** The AI scans your vaults. If you’re short on USDC, it finds the best swap on **DeepBook** or bridge via **LI.FI**.
3. **Policy-Protected Execution:** On the due date, the AI executes the payment. It only works if the transaction matches the **Guardrails** (spending limits) you set in the Move smart contract.

---

## 🏗 System Architecture

### 1. The "Brain" (Off-chain)

* **Interface:** Telegram Bot.
* **Intelligence:** LLM-powered parser that turns text into structured `PaymentIntent` JSON.
* **Solver:** Real-time calculation of swap fees, bridge times, and gas costs.

### 2. The "Vault" (On-chain Move)

* **Smart Vault:** A user-owned object that holds assets.
* **Policy Engine:** On-chain "Guardrails" that enforce safety rules (e.g., *"No single payment > $100 without 2FA"*).
* **Intent Registry:** Stores recurring payment metadata on-chain for transparency.


## links 

* [TG Bot](https://t.me/DueAI_bot)

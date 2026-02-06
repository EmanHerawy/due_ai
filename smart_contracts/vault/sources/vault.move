module vault::agent_vault;

use sui::bag::{Self, Bag};
use sui::balance::{Self, Balance};
use sui::clock::Clock;
use sui::coin::{Self, Coin};
use sui::dynamic_field as df;
use sui::event;
use sui::vec_set::{Self, VecSet};
use std::type_name::{Self, TypeName};

// ===== Error Codes =====

const ENotOwner: u64 = 0;
const ENotAuthorized: u64 = 1;
const ENoPolicySet: u64 = 3;
const EVaultPaused: u64 = 4;
const EExceedsMaxPerTx: u64 = 5;
const EExceedsPeriodLimit: u64 = 6;
const EExceedsTxCount: u64 = 7;
const EInsufficientBalance: u64 = 8;
const EAgentAlreadyActive: u64 = 9;
const EZeroAmount: u64 = 10;
const EAgentNotActive: u64 = 11;

// ===== Structs =====

public struct Vault has key {
    id: UID,
    owner: address,
    balances: Bag,
    active_agents: VecSet<ID>,
    paused: bool,
    created_at: u64,
}

public struct OwnerCap has key, store {
    id: UID,
    vault_id: ID,
}

public struct AgentCap has key, store {
    id: UID,
    vault_id: ID,
}

public struct SpendPolicy has store, drop {
    max_per_tx: u64,
    total_per_period: u64,
    max_tx_per_period: u64,
    period_ms: u64,
    period_start_ms: u64,
    spent_this_period: u64,
    tx_count_this_period: u64,
}

public struct PolicyKey has copy, drop, store {
    agent_id: ID,
    token_type: TypeName,
}

// ===== Events =====

public struct VaultCreated has copy, drop {
    vault_id: ID,
    owner: address,
}

public struct Deposited has copy, drop {
    vault_id: ID,
    amount: u64,
    token_type: TypeName,
}

public struct Withdrawn has copy, drop {
    vault_id: ID,
    amount: u64,
    token_type: TypeName,
}

public struct AgentAdded has copy, drop {
    vault_id: ID,
    agent_cap_id: ID,
    agent_address: address,
}

public struct AgentRemoved has copy, drop {
    vault_id: ID,
    agent_id: ID,
}

public struct PolicySet has copy, drop {
    vault_id: ID,
    agent_id: ID,
    token_type: TypeName,
    max_per_tx: u64,
    total_per_period: u64,
    max_tx_per_period: u64,
    period_ms: u64,
}

public struct PolicyRemoved has copy, drop {
    vault_id: ID,
    agent_id: ID,
    token_type: TypeName,
}

public struct PaymentExecuted has copy, drop {
    vault_id: ID,
    agent_id: ID,
    recipient: address,
    amount: u64,
    token_type: TypeName,
}

public struct VaultPaused has copy, drop {
    vault_id: ID,
}

public struct VaultUnpaused has copy, drop {
    vault_id: ID,
}

// ===== Owner Functions =====

public fun create_vault(clock: &Clock, ctx: &mut TxContext): OwnerCap {
    let vault = Vault {
        id: object::new(ctx),
        owner: ctx.sender(),
        balances: bag::new(ctx),
        active_agents: vec_set::empty(),
        paused: false,
        created_at: clock.timestamp_ms(),
    };

    let owner_cap = OwnerCap {
        id: object::new(ctx),
        vault_id: object::id(&vault),
    };

    event::emit(VaultCreated {
        vault_id: object::id(&vault),
        owner: ctx.sender(),
    });

    transfer::share_object(vault);
    owner_cap
}

public fun deposit<T>(
    vault: &mut Vault,
    owner_cap: &OwnerCap,
    coin: Coin<T>,
) {
    assert!(owner_cap.vault_id == object::id(vault), ENotOwner);

    let amount = coin.value();
    let token_type = type_name::with_original_ids<T>();

    if (bag::contains(&vault.balances, token_type)) {
        let balance: &mut Balance<T> = bag::borrow_mut(&mut vault.balances, token_type);
        balance::join(balance, coin.into_balance());
    } else {
        bag::add(&mut vault.balances, token_type, coin.into_balance());
    };

    event::emit(Deposited {
        vault_id: object::id(vault),
        amount,
        token_type,
    });
}

public fun withdraw<T>(
    vault: &mut Vault,
    owner_cap: &OwnerCap,
    amount: u64,
    ctx: &mut TxContext,
) {
    assert!(owner_cap.vault_id == object::id(vault), ENotOwner);
    assert!(amount > 0, EZeroAmount);

    let token_type = type_name::with_original_ids<T>();
    assert!(bag::contains(&vault.balances, token_type), EInsufficientBalance);

    let balance: &mut Balance<T> = bag::borrow_mut(&mut vault.balances, token_type);
    assert!(balance::value(balance) >= amount, EInsufficientBalance);

    let withdrawn = balance::split(balance, amount);

    // Remove empty balance from bag to reclaim storage rebate
    if (balance::value(balance) == 0) {
        let empty_balance: Balance<T> = bag::remove(&mut vault.balances, token_type);
        balance::destroy_zero(empty_balance);
    };

    let coin = coin::from_balance(withdrawn, ctx);
    transfer::public_transfer(coin, ctx.sender());

    event::emit(Withdrawn {
        vault_id: object::id(vault),
        amount,
        token_type,
    });
}

public fun add_agent(
    vault: &mut Vault,
    owner_cap: &OwnerCap,
    agent_addr: address,
    ctx: &mut TxContext,
) {
    assert!(owner_cap.vault_id == object::id(vault), ENotOwner);

    let agent_cap = AgentCap {
        id: object::new(ctx),
        vault_id: object::id(vault),
    };

    let agent_cap_id = object::id(&agent_cap);

    // Register in active agents set
    assert!(!vec_set::contains(&vault.active_agents, &agent_cap_id), EAgentAlreadyActive);
    vec_set::insert(&mut vault.active_agents, agent_cap_id);

    event::emit(AgentAdded {
        vault_id: object::id(vault),
        agent_cap_id,
        agent_address: agent_addr,
    });

    transfer::transfer(agent_cap, agent_addr);
}

public fun remove_agent(
    vault: &mut Vault,
    owner_cap: &OwnerCap,
    agent_id: ID,
) {
    assert!(owner_cap.vault_id == object::id(vault), ENotOwner);
    assert!(vec_set::contains(&vault.active_agents, &agent_id), EAgentNotActive);

    vec_set::remove(&mut vault.active_agents, &agent_id);

    event::emit(AgentRemoved {
        vault_id: object::id(vault),
        agent_id,
    });
}

public fun set_spend_policy<T>(
    vault: &mut Vault,
    owner_cap: &OwnerCap,
    agent_id: ID,
    max_per_tx: u64,
    total_per_period: u64,
    max_tx_per_period: u64,
    period_ms: u64,
    clock: &Clock,
) {
    assert!(owner_cap.vault_id == object::id(vault), ENotOwner);
    assert!(vec_set::contains(&vault.active_agents, &agent_id), EAgentNotActive);

    let token_type = type_name::with_original_ids<T>();
    let key = PolicyKey { agent_id, token_type };

    let policy = SpendPolicy {
        max_per_tx,
        total_per_period,
        max_tx_per_period,
        period_ms,
        period_start_ms: clock.timestamp_ms(),
        spent_this_period: 0,
        tx_count_this_period: 0,
    };

    if (df::exists_(&vault.id, key)) {
        // Update existing policy
        let existing: &mut SpendPolicy = df::borrow_mut(&mut vault.id, key);
        *existing = policy;
    } else {
        df::add(&mut vault.id, key, policy);
    };

    event::emit(PolicySet {
        vault_id: object::id(vault),
        agent_id,
        token_type,
        max_per_tx,
        total_per_period,
        max_tx_per_period,
        period_ms,
    });
}

public fun remove_spend_policy<T>(
    vault: &mut Vault,
    owner_cap: &OwnerCap,
    agent_id: ID,
) {
    assert!(owner_cap.vault_id == object::id(vault), ENotOwner);

    let token_type = type_name::with_original_ids<T>();
    let key = PolicyKey { agent_id, token_type };
    assert!(df::exists_(&vault.id, key), ENoPolicySet);

    let _: SpendPolicy = df::remove(&mut vault.id, key);

    event::emit(PolicyRemoved {
        vault_id: object::id(vault),
        agent_id,
        token_type,
    });
}

public fun pause(vault: &mut Vault, owner_cap: &OwnerCap) {
    assert!(owner_cap.vault_id == object::id(vault), ENotOwner);
    vault.paused = true;

    event::emit(VaultPaused {
        vault_id: object::id(vault),
    });
}

public fun unpause(vault: &mut Vault, owner_cap: &OwnerCap) {
    assert!(owner_cap.vault_id == object::id(vault), ENotOwner);
    vault.paused = false;

    event::emit(VaultUnpaused {
        vault_id: object::id(vault),
    });
}

// ===== Agent Functions =====

public fun execute_payment<T>(
    vault: &mut Vault,
    agent_cap: &AgentCap,
    recipient: address,
    amount: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    // 1. Emergency stop check
    assert!(!vault.paused, EVaultPaused);

    // 2. Cap bound to this vault
    assert!(agent_cap.vault_id == object::id(vault), ENotAuthorized);

    // 3. Runtime agent registry check
    let agent_id = object::id(agent_cap);
    assert!(vec_set::contains(&vault.active_agents, &agent_id), ENotAuthorized);

    // 4. No zero-amount txs
    assert!(amount > 0, EZeroAmount);

    // 6. Look up SpendPolicy
    let token_type = type_name::with_original_ids<T>();
    let key = PolicyKey { agent_id, token_type };
    assert!(df::exists_(&vault.id, key), ENoPolicySet);

    let policy: &mut SpendPolicy = df::borrow_mut(&mut vault.id, key);

    // 7. Lazy period reset
    let now = clock.timestamp_ms();
    if (now >= policy.period_start_ms + policy.period_ms) {
        policy.spent_this_period = 0;
        policy.tx_count_this_period = 0;
        policy.period_start_ms = now;
    };

    // 8-10. Spending limit checks
    assert!(amount <= policy.max_per_tx, EExceedsMaxPerTx);
    assert!(policy.spent_this_period + amount <= policy.total_per_period, EExceedsPeriodLimit);
    assert!(policy.tx_count_this_period + 1 <= policy.max_tx_per_period, EExceedsTxCount);

    // 11-13. Balance check and split
    assert!(bag::contains(&vault.balances, token_type), EInsufficientBalance);
    let balance: &mut Balance<T> = bag::borrow_mut(&mut vault.balances, token_type);
    assert!(balance::value(balance) >= amount, EInsufficientBalance);

    let withdrawn = balance::split(balance, amount);

    // 14. Remove empty balance from bag (storage rebate)
    if (balance::value(balance) == 0) {
        let empty_balance: Balance<T> = bag::remove(&mut vault.balances, token_type);
        balance::destroy_zero(empty_balance);
    };

    // 15. Transfer to recipient
    let coin = coin::from_balance(withdrawn, ctx);
    transfer::public_transfer(coin, recipient);

    // 16-17. Update accounting
    policy.spent_this_period = policy.spent_this_period + amount;
    policy.tx_count_this_period = policy.tx_count_this_period + 1;

    // 18. Emit event
    event::emit(PaymentExecuted {
        vault_id: object::id(vault),
        agent_id,
        recipient,
        amount,
        token_type,
    });
}

// ===== View Functions =====

public fun vault_balance<T>(vault: &Vault): u64 {
    let token_type = type_name::with_original_ids<T>();
    if (bag::contains(&vault.balances, token_type)) {
        let balance: &Balance<T> = bag::borrow(&vault.balances, token_type);
        balance::value(balance)
    } else {
        0
    }
}

public fun is_agent_active(vault: &Vault, agent_id: &ID): bool {
    vec_set::contains(&vault.active_agents, agent_id)
}

public fun vault_owner(vault: &Vault): address {
    vault.owner
}

public fun is_paused(vault: &Vault): bool {
    vault.paused
}

public fun agent_cap_vault_id(agent_cap: &AgentCap): ID {
    agent_cap.vault_id
}

public fun owner_cap_vault_id(owner_cap: &OwnerCap): ID {
    owner_cap.vault_id
}

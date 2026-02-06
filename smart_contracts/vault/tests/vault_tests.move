#[test_only]
module vault::vault_tests;

use sui::test_scenario::{Self as ts, Scenario};
use sui::clock::{Self, Clock};
use sui::coin::{Self};
use sui::sui::SUI;
use vault::agent_vault::{Self, Vault, OwnerCap, AgentCap};

// Test addresses
const OWNER: address = @0xA;
const AGENT: address = @0xB;
const RECIPIENT: address = @0xC;
const RANDOM: address = @0xD;
const AGENT2: address = @0xE;

// Test coin type for multi-token tests
public struct USDC has drop {}

// ===== Helpers =====

fun setup_vault(scenario: &mut Scenario, clock: &Clock) {
    ts::next_tx(scenario, OWNER);
    {
        let owner_cap = agent_vault::create_vault(clock, ts::ctx(scenario));
        transfer::public_transfer(owner_cap, OWNER);
    };
}

fun deposit_sui(scenario: &mut Scenario, amount: u64) {
    ts::next_tx(scenario, OWNER);
    {
        let mut vault = ts::take_shared<Vault>(scenario);
        let owner_cap = ts::take_from_sender<OwnerCap>(scenario);
        let coin = coin::mint_for_testing<SUI>(amount, ts::ctx(scenario));
        agent_vault::deposit(&mut vault, &owner_cap, coin);
        ts::return_shared(vault);
        ts::return_to_sender(scenario, owner_cap);
    };
}

fun add_agent_helper(scenario: &mut Scenario, agent_addr: address) {
    ts::next_tx(scenario, OWNER);
    {
        let mut vault = ts::take_shared<Vault>(scenario);
        let owner_cap = ts::take_from_sender<OwnerCap>(scenario);
        agent_vault::add_agent(&mut vault, &owner_cap, agent_addr, ts::ctx(scenario));
        ts::return_shared(vault);
        ts::return_to_sender(scenario, owner_cap);
    };
}

fun set_sui_policy(scenario: &mut Scenario, agent_cap_id: ID, clock: &Clock) {
    ts::next_tx(scenario, OWNER);
    {
        let mut vault = ts::take_shared<Vault>(scenario);
        let owner_cap = ts::take_from_sender<OwnerCap>(scenario);
        agent_vault::set_spend_policy<SUI>(
            &mut vault,
            &owner_cap,
            agent_cap_id,
            1000,          // max_per_tx
            5000,          // total_per_period
            10,            // max_tx_per_period
            2_592_000_000, // period_ms (30 days)
            clock,
        );
        ts::return_shared(vault);
        ts::return_to_sender(scenario, owner_cap);
    };
}

// ===== Test 1: create_vault =====

#[test]
fun test_create_vault() {
    let mut scenario = ts::begin(OWNER);
    let clock = clock::create_for_testing(ts::ctx(&mut scenario));

    setup_vault(&mut scenario, &clock);

    // Verify vault exists and owner_cap was received
    ts::next_tx(&mut scenario, OWNER);
    {
        let vault = ts::take_shared<Vault>(&scenario);
        assert!(agent_vault::vault_owner(&vault) == OWNER);
        assert!(!agent_vault::is_paused(&vault));
        assert!(agent_vault::vault_balance<SUI>(&vault) == 0);
        ts::return_shared(vault);

        let owner_cap = ts::take_from_sender<OwnerCap>(&scenario);
        ts::return_to_sender(&scenario, owner_cap);
    };

    clock::destroy_for_testing(clock);
    ts::end(scenario);
}

// ===== Test 2: deposit and withdraw =====

#[test]
fun test_deposit() {
    let mut scenario = ts::begin(OWNER);
    let clock = clock::create_for_testing(ts::ctx(&mut scenario));
    setup_vault(&mut scenario, &clock);

    deposit_sui(&mut scenario, 10_000);

    ts::next_tx(&mut scenario, OWNER);
    {
        let vault = ts::take_shared<Vault>(&scenario);
        assert!(agent_vault::vault_balance<SUI>(&vault) == 10_000);
        ts::return_shared(vault);
    };

    clock::destroy_for_testing(clock);
    ts::end(scenario);
}

#[test]
fun test_deposit_multiple_same_token() {
    let mut scenario = ts::begin(OWNER);
    let clock = clock::create_for_testing(ts::ctx(&mut scenario));
    setup_vault(&mut scenario, &clock);

    deposit_sui(&mut scenario, 5_000);
    deposit_sui(&mut scenario, 3_000);

    ts::next_tx(&mut scenario, OWNER);
    {
        let vault = ts::take_shared<Vault>(&scenario);
        assert!(agent_vault::vault_balance<SUI>(&vault) == 8_000);
        ts::return_shared(vault);
    };

    clock::destroy_for_testing(clock);
    ts::end(scenario);
}

#[test]
fun test_withdraw_partial() {
    let mut scenario = ts::begin(OWNER);
    let clock = clock::create_for_testing(ts::ctx(&mut scenario));
    setup_vault(&mut scenario, &clock);
    deposit_sui(&mut scenario, 10_000);

    // Withdraw partial
    ts::next_tx(&mut scenario, OWNER);
    {
        let mut vault = ts::take_shared<Vault>(&scenario);
        let owner_cap = ts::take_from_sender<OwnerCap>(&scenario);
        agent_vault::withdraw<SUI>(&mut vault, &owner_cap, 3_000, ts::ctx(&mut scenario));
        assert!(agent_vault::vault_balance<SUI>(&vault) == 7_000);
        ts::return_shared(vault);
        ts::return_to_sender(&scenario, owner_cap);
    };

    clock::destroy_for_testing(clock);
    ts::end(scenario);
}

#[test]
fun test_withdraw_full() {
    let mut scenario = ts::begin(OWNER);
    let clock = clock::create_for_testing(ts::ctx(&mut scenario));
    setup_vault(&mut scenario, &clock);
    deposit_sui(&mut scenario, 10_000);

    // Withdraw all — empty balance should be removed from bag
    ts::next_tx(&mut scenario, OWNER);
    {
        let mut vault = ts::take_shared<Vault>(&scenario);
        let owner_cap = ts::take_from_sender<OwnerCap>(&scenario);
        agent_vault::withdraw<SUI>(&mut vault, &owner_cap, 10_000, ts::ctx(&mut scenario));
        assert!(agent_vault::vault_balance<SUI>(&vault) == 0);
        ts::return_shared(vault);
        ts::return_to_sender(&scenario, owner_cap);
    };

    clock::destroy_for_testing(clock);
    ts::end(scenario);
}

#[test]
fun test_multi_token_deposit() {
    let mut scenario = ts::begin(OWNER);
    let clock = clock::create_for_testing(ts::ctx(&mut scenario));
    setup_vault(&mut scenario, &clock);

    // Deposit SUI
    deposit_sui(&mut scenario, 10_000);

    // Deposit USDC
    ts::next_tx(&mut scenario, OWNER);
    {
        let mut vault = ts::take_shared<Vault>(&scenario);
        let owner_cap = ts::take_from_sender<OwnerCap>(&scenario);
        let usdc_coin = coin::mint_for_testing<USDC>(50_000, ts::ctx(&mut scenario));
        agent_vault::deposit(&mut vault, &owner_cap, usdc_coin);
        ts::return_shared(vault);
        ts::return_to_sender(&scenario, owner_cap);
    };

    // Verify both balances
    ts::next_tx(&mut scenario, OWNER);
    {
        let vault = ts::take_shared<Vault>(&scenario);
        assert!(agent_vault::vault_balance<SUI>(&vault) == 10_000);
        assert!(agent_vault::vault_balance<USDC>(&vault) == 50_000);
        ts::return_shared(vault);
    };

    clock::destroy_for_testing(clock);
    ts::end(scenario);
}

// ===== Test 3: add_agent =====

#[test]
fun test_add_agent() {
    let mut scenario = ts::begin(OWNER);
    let clock = clock::create_for_testing(ts::ctx(&mut scenario));
    setup_vault(&mut scenario, &clock);

    add_agent_helper(&mut scenario, AGENT);

    // Agent should have received AgentCap
    ts::next_tx(&mut scenario, AGENT);
    {
        let vault = ts::take_shared<Vault>(&scenario);
        let agent_cap = ts::take_from_sender<AgentCap>(&scenario);
        let agent_id = object::id(&agent_cap);
        assert!(agent_vault::is_agent_active(&vault, &agent_id));
        ts::return_shared(vault);
        ts::return_to_sender(&scenario, agent_cap);
    };

    clock::destroy_for_testing(clock);
    ts::end(scenario);
}

// ===== Test 4: remove_agent =====

#[test]
fun test_remove_agent() {
    let mut scenario = ts::begin(OWNER);
    let clock = clock::create_for_testing(ts::ctx(&mut scenario));
    setup_vault(&mut scenario, &clock);
    add_agent_helper(&mut scenario, AGENT);

    // Get agent_cap ID
    ts::next_tx(&mut scenario, AGENT);
    let agent_cap_id;
    {
        let agent_cap = ts::take_from_sender<AgentCap>(&scenario);
        agent_cap_id = object::id(&agent_cap);
        ts::return_to_sender(&scenario, agent_cap);
    };

    // Owner removes agent
    ts::next_tx(&mut scenario, OWNER);
    {
        let mut vault = ts::take_shared<Vault>(&scenario);
        let owner_cap = ts::take_from_sender<OwnerCap>(&scenario);
        agent_vault::remove_agent(&mut vault, &owner_cap, agent_cap_id);
        assert!(!agent_vault::is_agent_active(&vault, &agent_cap_id));
        ts::return_shared(vault);
        ts::return_to_sender(&scenario, owner_cap);
    };

    clock::destroy_for_testing(clock);
    ts::end(scenario);
}

// ===== Test 5: re-add agent =====

#[test]
fun test_readd_agent_after_removal() {
    let mut scenario = ts::begin(OWNER);
    let clock = clock::create_for_testing(ts::ctx(&mut scenario));
    setup_vault(&mut scenario, &clock);
    add_agent_helper(&mut scenario, AGENT);

    // Get and store agent cap ID
    ts::next_tx(&mut scenario, AGENT);
    let agent_cap_id;
    {
        let agent_cap = ts::take_from_sender<AgentCap>(&scenario);
        agent_cap_id = object::id(&agent_cap);
        ts::return_to_sender(&scenario, agent_cap);
    };

    // Remove
    ts::next_tx(&mut scenario, OWNER);
    {
        let mut vault = ts::take_shared<Vault>(&scenario);
        let owner_cap = ts::take_from_sender<OwnerCap>(&scenario);
        agent_vault::remove_agent(&mut vault, &owner_cap, agent_cap_id);
        ts::return_shared(vault);
        ts::return_to_sender(&scenario, owner_cap);
    };

    // Re-add (new cap, same address)
    add_agent_helper(&mut scenario, AGENT);

    // Agent should have a NEW cap that is active
    ts::next_tx(&mut scenario, AGENT);
    {
        let vault = ts::take_shared<Vault>(&scenario);
        let agent_cap = ts::take_from_sender<AgentCap>(&scenario);
        let new_id = object::id(&agent_cap);
        assert!(agent_vault::is_agent_active(&vault, &new_id));
        // Old cap ID should still be inactive
        assert!(!agent_vault::is_agent_active(&vault, &agent_cap_id));
        ts::return_shared(vault);
        ts::return_to_sender(&scenario, agent_cap);
    };

    clock::destroy_for_testing(clock);
    ts::end(scenario);
}

// ===== Test 6: set_spend_policy =====

#[test]
fun test_set_spend_policy() {
    let mut scenario = ts::begin(OWNER);
    let clock = clock::create_for_testing(ts::ctx(&mut scenario));
    setup_vault(&mut scenario, &clock);
    add_agent_helper(&mut scenario, AGENT);

    // Get agent cap ID
    ts::next_tx(&mut scenario, AGENT);
    let agent_cap_id;
    {
        let agent_cap = ts::take_from_sender<AgentCap>(&scenario);
        agent_cap_id = object::id(&agent_cap);
        ts::return_to_sender(&scenario, agent_cap);
    };

    // Set policy
    set_sui_policy(&mut scenario, agent_cap_id, &clock);

    clock::destroy_for_testing(clock);
    ts::end(scenario);
}

#[test, expected_failure(abort_code = agent_vault::EAgentNotActive)]
fun test_set_policy_inactive_agent_fails() {
    let mut scenario = ts::begin(OWNER);
    let clock = clock::create_for_testing(ts::ctx(&mut scenario));
    setup_vault(&mut scenario, &clock);
    add_agent_helper(&mut scenario, AGENT);

    // Get agent cap ID, then remove agent
    ts::next_tx(&mut scenario, AGENT);
    let agent_cap_id;
    {
        let agent_cap = ts::take_from_sender<AgentCap>(&scenario);
        agent_cap_id = object::id(&agent_cap);
        ts::return_to_sender(&scenario, agent_cap);
    };

    // Remove agent
    ts::next_tx(&mut scenario, OWNER);
    {
        let mut vault = ts::take_shared<Vault>(&scenario);
        let owner_cap = ts::take_from_sender<OwnerCap>(&scenario);
        agent_vault::remove_agent(&mut vault, &owner_cap, agent_cap_id);
        ts::return_shared(vault);
        ts::return_to_sender(&scenario, owner_cap);
    };

    // Try to set policy for inactive agent — should fail
    set_sui_policy(&mut scenario, agent_cap_id, &clock);

    clock::destroy_for_testing(clock);
    ts::end(scenario);
}

// ===== Test 7: execute_payment happy path =====

#[test]
fun test_execute_payment_happy_path() {
    let mut scenario = ts::begin(OWNER);
    let clock = clock::create_for_testing(ts::ctx(&mut scenario));
    setup_vault(&mut scenario, &clock);
    deposit_sui(&mut scenario, 10_000);
    add_agent_helper(&mut scenario, AGENT);

    // Get agent cap ID and set policy
    ts::next_tx(&mut scenario, AGENT);
    let agent_cap_id;
    {
        let agent_cap = ts::take_from_sender<AgentCap>(&scenario);
        agent_cap_id = object::id(&agent_cap);
        ts::return_to_sender(&scenario, agent_cap);
    };
    set_sui_policy(&mut scenario, agent_cap_id, &clock);

    // Execute payment
    ts::next_tx(&mut scenario, AGENT);
    {
        let mut vault = ts::take_shared<Vault>(&scenario);
        let agent_cap = ts::take_from_sender<AgentCap>(&scenario);
        agent_vault::execute_payment<SUI>(
            &mut vault,
            &agent_cap,
            RECIPIENT,
            500,
            &clock,
            ts::ctx(&mut scenario),
        );
        assert!(agent_vault::vault_balance<SUI>(&vault) == 9_500);
        ts::return_shared(vault);
        ts::return_to_sender(&scenario, agent_cap);
    };

    clock::destroy_for_testing(clock);
    ts::end(scenario);
}

// ===== Test 8: execute_payment — revoked agent =====

#[test, expected_failure(abort_code = agent_vault::ENotAuthorized)]
fun test_execute_payment_revoked_agent() {
    let mut scenario = ts::begin(OWNER);
    let clock = clock::create_for_testing(ts::ctx(&mut scenario));
    setup_vault(&mut scenario, &clock);
    deposit_sui(&mut scenario, 10_000);
    add_agent_helper(&mut scenario, AGENT);

    // Get agent cap ID and set policy
    ts::next_tx(&mut scenario, AGENT);
    let agent_cap_id;
    {
        let agent_cap = ts::take_from_sender<AgentCap>(&scenario);
        agent_cap_id = object::id(&agent_cap);
        ts::return_to_sender(&scenario, agent_cap);
    };
    set_sui_policy(&mut scenario, agent_cap_id, &clock);

    // Remove agent
    ts::next_tx(&mut scenario, OWNER);
    {
        let mut vault = ts::take_shared<Vault>(&scenario);
        let owner_cap = ts::take_from_sender<OwnerCap>(&scenario);
        agent_vault::remove_agent(&mut vault, &owner_cap, agent_cap_id);
        ts::return_shared(vault);
        ts::return_to_sender(&scenario, owner_cap);
    };

    // Try to execute payment with revoked agent — should fail
    ts::next_tx(&mut scenario, AGENT);
    {
        let mut vault = ts::take_shared<Vault>(&scenario);
        let agent_cap = ts::take_from_sender<AgentCap>(&scenario);
        agent_vault::execute_payment<SUI>(
            &mut vault,
            &agent_cap,
            RECIPIENT,
            500,
            &clock,
            ts::ctx(&mut scenario),
        );
        ts::return_shared(vault);
        ts::return_to_sender(&scenario, agent_cap);
    };

    clock::destroy_for_testing(clock);
    ts::end(scenario);
}

// ===== Test 9: execute_payment — paused vault =====

#[test, expected_failure(abort_code = agent_vault::EVaultPaused)]
fun test_execute_payment_paused_vault() {
    let mut scenario = ts::begin(OWNER);
    let clock = clock::create_for_testing(ts::ctx(&mut scenario));
    setup_vault(&mut scenario, &clock);
    deposit_sui(&mut scenario, 10_000);
    add_agent_helper(&mut scenario, AGENT);

    ts::next_tx(&mut scenario, AGENT);
    let agent_cap_id;
    {
        let agent_cap = ts::take_from_sender<AgentCap>(&scenario);
        agent_cap_id = object::id(&agent_cap);
        ts::return_to_sender(&scenario, agent_cap);
    };
    set_sui_policy(&mut scenario, agent_cap_id, &clock);

    // Pause vault
    ts::next_tx(&mut scenario, OWNER);
    {
        let mut vault = ts::take_shared<Vault>(&scenario);
        let owner_cap = ts::take_from_sender<OwnerCap>(&scenario);
        agent_vault::pause(&mut vault, &owner_cap);
        ts::return_shared(vault);
        ts::return_to_sender(&scenario, owner_cap);
    };

    // Try to execute — should fail with EVaultPaused
    ts::next_tx(&mut scenario, AGENT);
    {
        let mut vault = ts::take_shared<Vault>(&scenario);
        let agent_cap = ts::take_from_sender<AgentCap>(&scenario);
        agent_vault::execute_payment<SUI>(
            &mut vault,
            &agent_cap,
            RECIPIENT,
            500,
            &clock,
            ts::ctx(&mut scenario),
        );
        ts::return_shared(vault);
        ts::return_to_sender(&scenario, agent_cap);
    };

    clock::destroy_for_testing(clock);
    ts::end(scenario);
}


// ===== Test 10: execute_payment — exceeds max_per_tx =====

#[test, expected_failure(abort_code = agent_vault::EExceedsMaxPerTx)]
fun test_execute_payment_exceeds_max_per_tx() {
    let mut scenario = ts::begin(OWNER);
    let clock = clock::create_for_testing(ts::ctx(&mut scenario));
    setup_vault(&mut scenario, &clock);
    deposit_sui(&mut scenario, 10_000);
    add_agent_helper(&mut scenario, AGENT);

    ts::next_tx(&mut scenario, AGENT);
    let agent_cap_id;
    {
        let agent_cap = ts::take_from_sender<AgentCap>(&scenario);
        agent_cap_id = object::id(&agent_cap);
        ts::return_to_sender(&scenario, agent_cap);
    };
    set_sui_policy(&mut scenario, agent_cap_id, &clock); // max_per_tx = 1000

    // Try to pay 1500 — exceeds max_per_tx of 1000
    ts::next_tx(&mut scenario, AGENT);
    {
        let mut vault = ts::take_shared<Vault>(&scenario);
        let agent_cap = ts::take_from_sender<AgentCap>(&scenario);
        agent_vault::execute_payment<SUI>(
            &mut vault,
            &agent_cap,
            RECIPIENT,
            1500,
            &clock,
            ts::ctx(&mut scenario),
        );
        ts::return_shared(vault);
        ts::return_to_sender(&scenario, agent_cap);
    };

    clock::destroy_for_testing(clock);
    ts::end(scenario);
}

// ===== Test 12: execute_payment — exceeds period total =====

#[test, expected_failure(abort_code = agent_vault::EExceedsPeriodLimit)]
fun test_execute_payment_exceeds_period_total() {
    let mut scenario = ts::begin(OWNER);
    let clock = clock::create_for_testing(ts::ctx(&mut scenario));
    setup_vault(&mut scenario, &clock);
    deposit_sui(&mut scenario, 100_000);
    add_agent_helper(&mut scenario, AGENT);

    ts::next_tx(&mut scenario, AGENT);
    let agent_cap_id;
    {
        let agent_cap = ts::take_from_sender<AgentCap>(&scenario);
        agent_cap_id = object::id(&agent_cap);
        ts::return_to_sender(&scenario, agent_cap);
    };
    set_sui_policy(&mut scenario, agent_cap_id, &clock); // total_per_period = 5000

    // Pay 1000 five times (total 5000 = at limit)
    let mut i = 0;
    while (i < 5) {
        ts::next_tx(&mut scenario, AGENT);
        {
            let mut vault = ts::take_shared<Vault>(&scenario);
            let agent_cap = ts::take_from_sender<AgentCap>(&scenario);
            agent_vault::execute_payment<SUI>(
                &mut vault,
                &agent_cap,
                RECIPIENT,
                1000,
                &clock,
                ts::ctx(&mut scenario),
            );
            ts::return_shared(vault);
            ts::return_to_sender(&scenario, agent_cap);
        };
        i = i + 1;
    };

    // 6th payment should fail — exceeds period total
    ts::next_tx(&mut scenario, AGENT);
    {
        let mut vault = ts::take_shared<Vault>(&scenario);
        let agent_cap = ts::take_from_sender<AgentCap>(&scenario);
        agent_vault::execute_payment<SUI>(
            &mut vault,
            &agent_cap,
            RECIPIENT,
            1,
            &clock,
            ts::ctx(&mut scenario),
        );
        ts::return_shared(vault);
        ts::return_to_sender(&scenario, agent_cap);
    };

    clock::destroy_for_testing(clock);
    ts::end(scenario);
}

// ===== Test 13: execute_payment — exceeds tx count =====

#[test, expected_failure(abort_code = agent_vault::EExceedsTxCount)]
fun test_execute_payment_exceeds_tx_count() {
    let mut scenario = ts::begin(OWNER);
    let clock = clock::create_for_testing(ts::ctx(&mut scenario));
    setup_vault(&mut scenario, &clock);
    deposit_sui(&mut scenario, 100_000);
    add_agent_helper(&mut scenario, AGENT);

    ts::next_tx(&mut scenario, AGENT);
    let agent_cap_id;
    {
        let agent_cap = ts::take_from_sender<AgentCap>(&scenario);
        agent_cap_id = object::id(&agent_cap);
        ts::return_to_sender(&scenario, agent_cap);
    };
    set_sui_policy(&mut scenario, agent_cap_id, &clock); // max_tx_per_period = 10

    // Execute 10 payments (at limit)
    let mut i = 0;
    while (i < 10) {
        ts::next_tx(&mut scenario, AGENT);
        {
            let mut vault = ts::take_shared<Vault>(&scenario);
            let agent_cap = ts::take_from_sender<AgentCap>(&scenario);
            agent_vault::execute_payment<SUI>(
                &mut vault,
                &agent_cap,
                RECIPIENT,
                100,
                &clock,
                ts::ctx(&mut scenario),
            );
            ts::return_shared(vault);
            ts::return_to_sender(&scenario, agent_cap);
        };
        i = i + 1;
    };

    // 11th tx should fail
    ts::next_tx(&mut scenario, AGENT);
    {
        let mut vault = ts::take_shared<Vault>(&scenario);
        let agent_cap = ts::take_from_sender<AgentCap>(&scenario);
        agent_vault::execute_payment<SUI>(
            &mut vault,
            &agent_cap,
            RECIPIENT,
            100,
            &clock,
            ts::ctx(&mut scenario),
        );
        ts::return_shared(vault);
        ts::return_to_sender(&scenario, agent_cap);
    };

    clock::destroy_for_testing(clock);
    ts::end(scenario);
}

// ===== Test 14: execute_payment — insufficient balance =====

#[test, expected_failure(abort_code = agent_vault::EInsufficientBalance)]
fun test_execute_payment_insufficient_balance() {
    let mut scenario = ts::begin(OWNER);
    let clock = clock::create_for_testing(ts::ctx(&mut scenario));
    setup_vault(&mut scenario, &clock);
    deposit_sui(&mut scenario, 100); // only 100
    add_agent_helper(&mut scenario, AGENT);

    ts::next_tx(&mut scenario, AGENT);
    let agent_cap_id;
    {
        let agent_cap = ts::take_from_sender<AgentCap>(&scenario);
        agent_cap_id = object::id(&agent_cap);
        ts::return_to_sender(&scenario, agent_cap);
    };
    set_sui_policy(&mut scenario, agent_cap_id, &clock);

    // Try to pay 500 but only 100 in vault
    ts::next_tx(&mut scenario, AGENT);
    {
        let mut vault = ts::take_shared<Vault>(&scenario);
        let agent_cap = ts::take_from_sender<AgentCap>(&scenario);
        agent_vault::execute_payment<SUI>(
            &mut vault,
            &agent_cap,
            RECIPIENT,
            500,
            &clock,
            ts::ctx(&mut scenario),
        );
        ts::return_shared(vault);
        ts::return_to_sender(&scenario, agent_cap);
    };

    clock::destroy_for_testing(clock);
    ts::end(scenario);
}

// ===== Test 15: execute_payment — wrong vault =====

#[test, expected_failure(abort_code = agent_vault::ENotAuthorized)]
fun test_execute_payment_wrong_vault() {
    let mut scenario = ts::begin(OWNER);
    let clock = clock::create_for_testing(ts::ctx(&mut scenario));

    // Create vault 1
    setup_vault(&mut scenario, &clock);
    deposit_sui(&mut scenario, 10_000);
    add_agent_helper(&mut scenario, AGENT);

    ts::next_tx(&mut scenario, AGENT);
    let agent_cap_id;
    {
        let agent_cap = ts::take_from_sender<AgentCap>(&scenario);
        agent_cap_id = object::id(&agent_cap);
        ts::return_to_sender(&scenario, agent_cap);
    };
    set_sui_policy(&mut scenario, agent_cap_id, &clock);

    // Create vault 2
    ts::next_tx(&mut scenario, RANDOM);
    {
        let owner_cap2 = agent_vault::create_vault(&clock, ts::ctx(&mut scenario));
        transfer::public_transfer(owner_cap2, RANDOM);
    };

    // Try to use agent_cap (bound to vault 1) on vault 2
    ts::next_tx(&mut scenario, AGENT);
    {
        // Take the SECOND shared vault (vault 2)
        let mut vault2 = ts::take_shared<Vault>(&scenario);
        let agent_cap = ts::take_from_sender<AgentCap>(&scenario);
        agent_vault::execute_payment<SUI>(
            &mut vault2,
            &agent_cap,
            RECIPIENT,
            500,
            &clock,
            ts::ctx(&mut scenario),
        );
        ts::return_shared(vault2);
        ts::return_to_sender(&scenario, agent_cap);
    };

    clock::destroy_for_testing(clock);
    ts::end(scenario);
}

// ===== Test 16: pause/unpause =====

#[test]
fun test_pause_and_unpause() {
    let mut scenario = ts::begin(OWNER);
    let clock = clock::create_for_testing(ts::ctx(&mut scenario));
    setup_vault(&mut scenario, &clock);
    deposit_sui(&mut scenario, 10_000);
    add_agent_helper(&mut scenario, AGENT);

    ts::next_tx(&mut scenario, AGENT);
    let agent_cap_id;
    {
        let agent_cap = ts::take_from_sender<AgentCap>(&scenario);
        agent_cap_id = object::id(&agent_cap);
        ts::return_to_sender(&scenario, agent_cap);
    };
    set_sui_policy(&mut scenario, agent_cap_id, &clock);

    // Pause
    ts::next_tx(&mut scenario, OWNER);
    {
        let mut vault = ts::take_shared<Vault>(&scenario);
        let owner_cap = ts::take_from_sender<OwnerCap>(&scenario);
        agent_vault::pause(&mut vault, &owner_cap);
        assert!(agent_vault::is_paused(&vault));
        ts::return_shared(vault);
        ts::return_to_sender(&scenario, owner_cap);
    };

    // Unpause
    ts::next_tx(&mut scenario, OWNER);
    {
        let mut vault = ts::take_shared<Vault>(&scenario);
        let owner_cap = ts::take_from_sender<OwnerCap>(&scenario);
        agent_vault::unpause(&mut vault, &owner_cap);
        assert!(!agent_vault::is_paused(&vault));
        ts::return_shared(vault);
        ts::return_to_sender(&scenario, owner_cap);
    };

    // Payment should work after unpause
    ts::next_tx(&mut scenario, AGENT);
    {
        let mut vault = ts::take_shared<Vault>(&scenario);
        let agent_cap = ts::take_from_sender<AgentCap>(&scenario);
        agent_vault::execute_payment<SUI>(
            &mut vault,
            &agent_cap,
            RECIPIENT,
            500,
            &clock,
            ts::ctx(&mut scenario),
        );
        assert!(agent_vault::vault_balance<SUI>(&vault) == 9_500);
        ts::return_shared(vault);
        ts::return_to_sender(&scenario, agent_cap);
    };

    clock::destroy_for_testing(clock);
    ts::end(scenario);
}

// ===== Test 17: period reset =====

#[test]
fun test_period_reset() {
    let mut scenario = ts::begin(OWNER);
    let mut clock = clock::create_for_testing(ts::ctx(&mut scenario));
    setup_vault(&mut scenario, &clock);
    deposit_sui(&mut scenario, 100_000);
    add_agent_helper(&mut scenario, AGENT);

    ts::next_tx(&mut scenario, AGENT);
    let agent_cap_id;
    {
        let agent_cap = ts::take_from_sender<AgentCap>(&scenario);
        agent_cap_id = object::id(&agent_cap);
        ts::return_to_sender(&scenario, agent_cap);
    };
    set_sui_policy(&mut scenario, agent_cap_id, &clock); // total_per_period = 5000

    // Spend up to the limit
    let mut i = 0;
    while (i < 5) {
        ts::next_tx(&mut scenario, AGENT);
        {
            let mut vault = ts::take_shared<Vault>(&scenario);
            let agent_cap = ts::take_from_sender<AgentCap>(&scenario);
            agent_vault::execute_payment<SUI>(
                &mut vault,
                &agent_cap,
                RECIPIENT,
                1000,
                &clock,
                ts::ctx(&mut scenario),
            );
            ts::return_shared(vault);
            ts::return_to_sender(&scenario, agent_cap);
        };
        i = i + 1;
    };

    // Advance clock past period (30 days + 1ms)
    clock::increment_for_testing(&mut clock, 2_592_000_001);

    // Should be able to spend again after period reset
    ts::next_tx(&mut scenario, AGENT);
    {
        let mut vault = ts::take_shared<Vault>(&scenario);
        let agent_cap = ts::take_from_sender<AgentCap>(&scenario);
        agent_vault::execute_payment<SUI>(
            &mut vault,
            &agent_cap,
            RECIPIENT,
            1000,
            &clock,
            ts::ctx(&mut scenario),
        );
        // 100_000 - 5*1000 - 1000 = 94_000
        assert!(agent_vault::vault_balance<SUI>(&vault) == 94_000);
        ts::return_shared(vault);
        ts::return_to_sender(&scenario, agent_cap);
    };

    clock::destroy_for_testing(clock);
    ts::end(scenario);
}

// ===== Test 18: multi-token policies =====

#[test]
fun test_multi_token_execute_payment() {
    let mut scenario = ts::begin(OWNER);
    let clock = clock::create_for_testing(ts::ctx(&mut scenario));
    setup_vault(&mut scenario, &clock);

    // Deposit SUI and USDC
    deposit_sui(&mut scenario, 10_000);
    ts::next_tx(&mut scenario, OWNER);
    {
        let mut vault = ts::take_shared<Vault>(&scenario);
        let owner_cap = ts::take_from_sender<OwnerCap>(&scenario);
        let usdc_coin = coin::mint_for_testing<USDC>(50_000, ts::ctx(&mut scenario));
        agent_vault::deposit(&mut vault, &owner_cap, usdc_coin);
        ts::return_shared(vault);
        ts::return_to_sender(&scenario, owner_cap);
    };

    add_agent_helper(&mut scenario, AGENT);

    // Get agent cap ID
    ts::next_tx(&mut scenario, AGENT);
    let agent_cap_id;
    {
        let agent_cap = ts::take_from_sender<AgentCap>(&scenario);
        agent_cap_id = object::id(&agent_cap);
        ts::return_to_sender(&scenario, agent_cap);
    };

    // Set SUI policy
    set_sui_policy(&mut scenario, agent_cap_id, &clock);

    // Set USDC policy
    ts::next_tx(&mut scenario, OWNER);
    {
        let mut vault = ts::take_shared<Vault>(&scenario);
        let owner_cap = ts::take_from_sender<OwnerCap>(&scenario);
        agent_vault::set_spend_policy<USDC>(
            &mut vault,
            &owner_cap,
            agent_cap_id,
            2000,
            10_000,
            5,
            2_592_000_000,
            &clock,
        );
        ts::return_shared(vault);
        ts::return_to_sender(&scenario, owner_cap);
    };

    // Execute SUI payment
    ts::next_tx(&mut scenario, AGENT);
    {
        let mut vault = ts::take_shared<Vault>(&scenario);
        let agent_cap = ts::take_from_sender<AgentCap>(&scenario);
        agent_vault::execute_payment<SUI>(
            &mut vault,
            &agent_cap,
            RECIPIENT,
            500,
            &clock,
            ts::ctx(&mut scenario),
        );
        assert!(agent_vault::vault_balance<SUI>(&vault) == 9_500);
        ts::return_shared(vault);
        ts::return_to_sender(&scenario, agent_cap);
    };

    // Execute USDC payment
    ts::next_tx(&mut scenario, AGENT);
    {
        let mut vault = ts::take_shared<Vault>(&scenario);
        let agent_cap = ts::take_from_sender<AgentCap>(&scenario);
        agent_vault::execute_payment<USDC>(
            &mut vault,
            &agent_cap,
            RECIPIENT,
            1500,
            &clock,
            ts::ctx(&mut scenario),
        );
        assert!(agent_vault::vault_balance<USDC>(&vault) == 48_500);
        ts::return_shared(vault);
        ts::return_to_sender(&scenario, agent_cap);
    };

    clock::destroy_for_testing(clock);
    ts::end(scenario);
}

// ===== Test 19: owner can withdraw while agent has budget =====

#[test]
fun test_owner_withdraw_during_active_agent() {
    let mut scenario = ts::begin(OWNER);
    let clock = clock::create_for_testing(ts::ctx(&mut scenario));
    setup_vault(&mut scenario, &clock);
    deposit_sui(&mut scenario, 10_000);
    add_agent_helper(&mut scenario, AGENT);

    ts::next_tx(&mut scenario, AGENT);
    let agent_cap_id;
    {
        let agent_cap = ts::take_from_sender<AgentCap>(&scenario);
        agent_cap_id = object::id(&agent_cap);
        ts::return_to_sender(&scenario, agent_cap);
    };
    set_sui_policy(&mut scenario, agent_cap_id, &clock);

    // Owner withdraws most funds
    ts::next_tx(&mut scenario, OWNER);
    {
        let mut vault = ts::take_shared<Vault>(&scenario);
        let owner_cap = ts::take_from_sender<OwnerCap>(&scenario);
        agent_vault::withdraw<SUI>(&mut vault, &owner_cap, 9_000, ts::ctx(&mut scenario));
        assert!(agent_vault::vault_balance<SUI>(&vault) == 1_000);
        ts::return_shared(vault);
        ts::return_to_sender(&scenario, owner_cap);
    };

    // Agent can still pay from remaining balance (within limits)
    ts::next_tx(&mut scenario, AGENT);
    {
        let mut vault = ts::take_shared<Vault>(&scenario);
        let agent_cap = ts::take_from_sender<AgentCap>(&scenario);
        agent_vault::execute_payment<SUI>(
            &mut vault,
            &agent_cap,
            RECIPIENT,
            500,
            &clock,
            ts::ctx(&mut scenario),
        );
        assert!(agent_vault::vault_balance<SUI>(&vault) == 500);
        ts::return_shared(vault);
        ts::return_to_sender(&scenario, agent_cap);
    };

    clock::destroy_for_testing(clock);
    ts::end(scenario);
}



// ===== Test: zero amount =====

#[test, expected_failure(abort_code = agent_vault::EZeroAmount)]
fun test_execute_payment_zero_amount() {
    let mut scenario = ts::begin(OWNER);
    let clock = clock::create_for_testing(ts::ctx(&mut scenario));
    setup_vault(&mut scenario, &clock);
    deposit_sui(&mut scenario, 10_000);
    add_agent_helper(&mut scenario, AGENT);

    ts::next_tx(&mut scenario, AGENT);
    let agent_cap_id;
    {
        let agent_cap = ts::take_from_sender<AgentCap>(&scenario);
        agent_cap_id = object::id(&agent_cap);
        ts::return_to_sender(&scenario, agent_cap);
    };
    set_sui_policy(&mut scenario, agent_cap_id, &clock);

    ts::next_tx(&mut scenario, AGENT);
    {
        let mut vault = ts::take_shared<Vault>(&scenario);
        let agent_cap = ts::take_from_sender<AgentCap>(&scenario);
        agent_vault::execute_payment<SUI>(
            &mut vault,
            &agent_cap,
            RECIPIENT,
            0,
            &clock,
            ts::ctx(&mut scenario),
        );
        ts::return_shared(vault);
        ts::return_to_sender(&scenario, agent_cap);
    };

    clock::destroy_for_testing(clock);
    ts::end(scenario);
}

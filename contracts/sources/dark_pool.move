module zebra::dark_pool {
    use sui::object::{Self, UID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::event;
    use sui::table::{Self, Table};
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::groth16;
    use std::vector;

    // Error codes
    const EInvalidProof: u64 = 0;
    const EOrderExpired: u64 = 1;
    const ENullifierUsed: u64 = 2;
    const EInsufficientBalance: u64 = 3;
    const EOrderNotFound: u64 = 4;
    const EUnauthorized: u64 = 5;
    const EInvalidReveal: u64 = 6;
    const EInsufficientVaultBalance: u64 = 7;
    const EInsolventPayout: u64 = 8;

    // Dark pool shared object — single phantom type (SUI/SUI = same token)
    public struct DarkPool<phantom CoinType> has key {
        id: UID,
        vk_bytes: vector<u8>,
        commitments: Table<vector<u8>, OrderCommitment>,
        nullifiers: Table<vector<u8>, bool>,
        vault: Balance<CoinType>,
        config: PoolConfig,
    }

    // Stripped OrderCommitment — no is_bid, no expiry in struct
    public struct OrderCommitment has store, drop {
        commitment: vector<u8>,
        nullifier: vector<u8>,
        owner: address,
        locked_amount: u64,
        created_at: u64,
        encrypted_data: vector<u8>,
    }

    public struct PoolConfig has store, drop {
        min_order_size: u64,
        max_order_size: u64,
        pool_id: vector<u8>,
    }

    public struct AdminCap has key, store {
        id: UID,
    }

    public struct MatcherCap has key, store {
        id: UID,
    }

    // Privacy-preserving events — NOTHING about individual orders leaked
    public struct OrderCommitted has copy, drop {
        pool_id: vector<u8>,
        commitment: vector<u8>,
        encrypted_data: vector<u8>,
        timestamp: u64,
    }

    public struct OrderCancelled has copy, drop {
        pool_id: vector<u8>,
        commitment: vector<u8>,
        timestamp: u64,
    }

    public struct OrderSettled has copy, drop {
        pool_id: vector<u8>,
        commitment_a: vector<u8>,
        commitment_b: vector<u8>,
        timestamp: u64,
    }

    // Create a new dark pool — returns (AdminCap, MatcherCap)
    public fun create_pool<CoinType>(
        vk_bytes: vector<u8>,
        pool_id: vector<u8>,
        min_order_size: u64,
        max_order_size: u64,
        ctx: &mut TxContext
    ): (AdminCap, MatcherCap) {
        let pool = DarkPool<CoinType> {
            id: object::new(ctx),
            vk_bytes,
            commitments: table::new(ctx),
            nullifiers: table::new(ctx),
            vault: balance::zero<CoinType>(),
            config: PoolConfig {
                min_order_size,
                max_order_size,
                pool_id,
            },
        };

        transfer::share_object(pool);

        (
            AdminCap { id: object::new(ctx) },
            MatcherCap { id: object::new(ctx) },
        )
    }

    // Unified submit_order — no buy/sell distinction visible on-chain
    public fun submit_order<CoinType>(
        pool: &mut DarkPool<CoinType>,
        coin: Coin<CoinType>,
        proof_points: vector<u8>,
        public_inputs: vector<u8>,
        commitment: vector<u8>,
        nullifier: vector<u8>,
        encrypted_data: vector<u8>,
        ctx: &mut TxContext
    ) {
        // Verify the ZK proof
        verify_proof(pool, &proof_points, &public_inputs);

        // Check nullifier not used
        assert!(!table::contains(&pool.nullifiers, nullifier), ENullifierUsed);

        // Lock funds in vault
        let locked_amount = coin::value(&coin);
        let coin_balance = coin::into_balance(coin);
        balance::join(&mut pool.vault, coin_balance);

        // Store commitment
        let order = OrderCommitment {
            commitment,
            nullifier,
            owner: tx_context::sender(ctx),
            locked_amount,
            created_at: tx_context::epoch(ctx),
            encrypted_data,
        };

        table::add(&mut pool.commitments, commitment, order);
        table::add(&mut pool.nullifiers, nullifier, true);

        // Emit privacy-preserving event — NO side, NO locked_amount, NO owner
        event::emit(OrderCommitted {
            pool_id: pool.config.pool_id,
            commitment,
            encrypted_data,
            timestamp: tx_context::epoch(ctx),
        });
    }

    // Verify Groth16 proof
    fun verify_proof<CoinType>(
        pool: &DarkPool<CoinType>,
        proof_points: &vector<u8>,
        public_inputs: &vector<u8>,
    ) {
        let pvk = groth16::prepare_verifying_key(
            &groth16::bn254(),
            &pool.vk_bytes
        );

        let proof = groth16::proof_points_from_bytes(*proof_points);
        let inputs = groth16::public_proof_inputs_from_bytes(*public_inputs);

        let valid = groth16::verify_groth16_proof(
            &groth16::bn254(),
            &pvk,
            &inputs,
            &proof
        );

        assert!(valid, EInvalidProof);
    }

    // Unified cancel_order — no buy/sell distinction
    public fun cancel_order<CoinType>(
        pool: &mut DarkPool<CoinType>,
        commitment: vector<u8>,
        ctx: &mut TxContext
    ): Coin<CoinType> {
        assert!(table::contains(&pool.commitments, commitment), EOrderNotFound);
        let order = table::remove(&mut pool.commitments, commitment);
        assert!(order.owner == tx_context::sender(ctx), EUnauthorized);

        let refund_balance = balance::split(&mut pool.vault, order.locked_amount);

        event::emit(OrderCancelled {
            pool_id: pool.config.pool_id,
            commitment,
            timestamp: tx_context::epoch(ctx),
        });

        coin::from_balance(refund_balance, ctx)
    }

    // Payout-based settlement — TEE decides payouts, contract enforces solvency
    public fun settle_match<CoinType>(
        pool: &mut DarkPool<CoinType>,
        _matcher_cap: &MatcherCap,
        commitment_a: vector<u8>,
        commitment_b: vector<u8>,
        payout_a: u64,
        payout_b: u64,
        ctx: &mut TxContext
    ) {
        // Verify both orders exist
        assert!(table::contains(&pool.commitments, commitment_a), EOrderNotFound);
        assert!(table::contains(&pool.commitments, commitment_b), EOrderNotFound);

        // Store addresses and locked amounts before removing
        let order_a = table::borrow(&pool.commitments, commitment_a);
        let order_b = table::borrow(&pool.commitments, commitment_b);
        let addr_a = order_a.owner;
        let addr_b = order_b.owner;
        let locked_a = order_a.locked_amount;
        let locked_b = order_b.locked_amount;

        // Solvency check: payouts cannot exceed total locked
        assert!(payout_a + payout_b <= locked_a + locked_b, EInsolventPayout);

        // Remove settled orders
        let _ = table::remove(&mut pool.commitments, commitment_a);
        let _ = table::remove(&mut pool.commitments, commitment_b);

        // Transfer payout_a to owner_a
        if (payout_a > 0) {
            assert!(balance::value(&pool.vault) >= payout_a, EInsufficientVaultBalance);
            let balance_a = balance::split(&mut pool.vault, payout_a);
            let coin_a = coin::from_balance(balance_a, ctx);
            transfer::public_transfer(coin_a, addr_a);
        };

        // Transfer payout_b to owner_b
        if (payout_b > 0) {
            assert!(balance::value(&pool.vault) >= payout_b, EInsufficientVaultBalance);
            let balance_b = balance::split(&mut pool.vault, payout_b);
            let coin_b = coin::from_balance(balance_b, ctx);
            transfer::public_transfer(coin_b, addr_b);
        };

        let current_time = tx_context::epoch(ctx);

        // Emit privacy-preserving event — NO buyer/seller labels, NO amounts
        event::emit(OrderSettled {
            pool_id: pool.config.pool_id,
            commitment_a,
            commitment_b,
            timestamp: current_time,
        });
    }

    /// Settle a single order via flash loan netting.
    /// Returns locked Coin to the caller's PTB for flash loan repayment.
    public fun settle_single<CoinType>(
        pool: &mut DarkPool<CoinType>,
        _matcher_cap: &MatcherCap,
        commitment: vector<u8>,
        ctx: &mut TxContext
    ): Coin<CoinType> {
        assert!(table::contains(&pool.commitments, commitment), EOrderNotFound);
        let order = table::remove(&mut pool.commitments, commitment);
        assert!(balance::value(&pool.vault) >= order.locked_amount, EInsufficientVaultBalance);

        let coin = coin::from_balance(
            balance::split(&mut pool.vault, order.locked_amount),
            ctx,
        );

        event::emit(OrderSettled {
            pool_id: pool.config.pool_id,
            commitment_a: commitment,
            commitment_b: vector::empty<u8>(),
            timestamp: tx_context::epoch(ctx),
        });

        coin
    }

    // View functions
    public fun get_order_exists<CoinType>(
        pool: &DarkPool<CoinType>,
        commitment: vector<u8>
    ): bool {
        table::contains(&pool.commitments, commitment)
    }

    public fun is_nullifier_used<CoinType>(
        pool: &DarkPool<CoinType>,
        nullifier: vector<u8>
    ): bool {
        table::contains(&pool.nullifiers, nullifier)
    }

    public fun get_pool_id<CoinType>(
        pool: &DarkPool<CoinType>
    ): vector<u8> {
        pool.config.pool_id
    }
}

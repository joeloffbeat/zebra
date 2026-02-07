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
    const EInvalidReceiverSplit: u64 = 9;
    const EReceiverLengthMismatch: u64 = 10;

    // Dual-coin dark pool — BaseCoin (SUI) / QuoteCoin (DBUSDC)
    public struct DarkPool<phantom BaseCoin, phantom QuoteCoin> has key {
        id: UID,
        vk_bytes: vector<u8>,
        commitments: Table<vector<u8>, OrderCommitment>,
        nullifiers: Table<vector<u8>, bool>,
        base_vault: Balance<BaseCoin>,
        quote_vault: Balance<QuoteCoin>,
        config: PoolConfig,
    }

    public struct OrderCommitment has store, drop {
        commitment: vector<u8>,
        nullifier: vector<u8>,
        owner: address,
        locked_amount: u64,
        is_buy: bool,
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

    // Privacy-preserving events — NO amounts, addresses, sides, or receiver info
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

    public struct SingleSettled has copy, drop {
        pool_id: vector<u8>,
        commitment: vector<u8>,
        timestamp: u64,
    }

    // ── Pool Creation ────────────────────────────────────────────────────

    public fun create_pool<BaseCoin, QuoteCoin>(
        vk_bytes: vector<u8>,
        pool_id: vector<u8>,
        min_order_size: u64,
        max_order_size: u64,
        ctx: &mut TxContext
    ): (AdminCap, MatcherCap) {
        let pool = DarkPool<BaseCoin, QuoteCoin> {
            id: object::new(ctx),
            vk_bytes,
            commitments: table::new(ctx),
            nullifiers: table::new(ctx),
            base_vault: balance::zero<BaseCoin>(),
            quote_vault: balance::zero<QuoteCoin>(),
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

    // ── Order Submission ─────────────────────────────────────────────────

    /// Seller locks BaseCoin (e.g. SUI) — is_buy = false
    public fun submit_sell_order<BaseCoin, QuoteCoin>(
        pool: &mut DarkPool<BaseCoin, QuoteCoin>,
        coin: Coin<BaseCoin>,
        proof_points: vector<u8>,
        public_inputs: vector<u8>,
        commitment: vector<u8>,
        nullifier: vector<u8>,
        encrypted_data: vector<u8>,
        ctx: &mut TxContext
    ) {
        verify_proof(pool, &proof_points, &public_inputs);
        assert!(!table::contains(&pool.nullifiers, nullifier), ENullifierUsed);

        let locked_amount = coin::value(&coin);
        balance::join(&mut pool.base_vault, coin::into_balance(coin));

        let order = OrderCommitment {
            commitment,
            nullifier,
            owner: tx_context::sender(ctx),
            locked_amount,
            is_buy: false,
            created_at: tx_context::epoch(ctx),
            encrypted_data,
        };

        table::add(&mut pool.commitments, commitment, order);
        table::add(&mut pool.nullifiers, nullifier, true);

        event::emit(OrderCommitted {
            pool_id: pool.config.pool_id,
            commitment,
            encrypted_data,
            timestamp: tx_context::epoch(ctx),
        });
    }

    /// Buyer locks QuoteCoin (e.g. DBUSDC) — is_buy = true
    public fun submit_buy_order<BaseCoin, QuoteCoin>(
        pool: &mut DarkPool<BaseCoin, QuoteCoin>,
        coin: Coin<QuoteCoin>,
        proof_points: vector<u8>,
        public_inputs: vector<u8>,
        commitment: vector<u8>,
        nullifier: vector<u8>,
        encrypted_data: vector<u8>,
        ctx: &mut TxContext
    ) {
        verify_proof(pool, &proof_points, &public_inputs);
        assert!(!table::contains(&pool.nullifiers, nullifier), ENullifierUsed);

        let locked_amount = coin::value(&coin);
        balance::join(&mut pool.quote_vault, coin::into_balance(coin));

        let order = OrderCommitment {
            commitment,
            nullifier,
            owner: tx_context::sender(ctx),
            locked_amount,
            is_buy: true,
            created_at: tx_context::epoch(ctx),
            encrypted_data,
        };

        table::add(&mut pool.commitments, commitment, order);
        table::add(&mut pool.nullifiers, nullifier, true);

        event::emit(OrderCommitted {
            pool_id: pool.config.pool_id,
            commitment,
            encrypted_data,
            timestamp: tx_context::epoch(ctx),
        });
    }

    // ── Cancel Order ─────────────────────────────────────────────────────

    /// Cancel order — refunds from correct vault via public_transfer
    /// (can't conditionally return different coin types)
    public fun cancel_order<BaseCoin, QuoteCoin>(
        pool: &mut DarkPool<BaseCoin, QuoteCoin>,
        commitment: vector<u8>,
        ctx: &mut TxContext
    ) {
        assert!(table::contains(&pool.commitments, commitment), EOrderNotFound);
        let order = table::remove(&mut pool.commitments, commitment);
        assert!(order.owner == tx_context::sender(ctx), EUnauthorized);

        if (order.is_buy) {
            let refund = balance::split(&mut pool.quote_vault, order.locked_amount);
            transfer::public_transfer(coin::from_balance(refund, ctx), order.owner);
        } else {
            let refund = balance::split(&mut pool.base_vault, order.locked_amount);
            transfer::public_transfer(coin::from_balance(refund, ctx), order.owner);
        };

        event::emit(OrderCancelled {
            pool_id: pool.config.pool_id,
            commitment,
            timestamp: tx_context::epoch(ctx),
        });
    }

    // ── Settlement ───────────────────────────────────────────────────────

    /// Cross-type settlement with multi-receiver routing.
    /// Buyer gets BaseCoin from base_vault, seller gets QuoteCoin from quote_vault.
    /// If receivers vector is empty, defaults to order owner at 100%.
    public fun settle_match<BaseCoin, QuoteCoin>(
        pool: &mut DarkPool<BaseCoin, QuoteCoin>,
        _matcher_cap: &MatcherCap,
        commitment_a: vector<u8>,
        commitment_b: vector<u8>,
        payout_a: u64,
        payout_b: u64,
        receivers_a: vector<address>,
        percentages_a: vector<u64>,
        receivers_b: vector<address>,
        percentages_b: vector<u64>,
        ctx: &mut TxContext
    ) {
        assert!(table::contains(&pool.commitments, commitment_a), EOrderNotFound);
        assert!(table::contains(&pool.commitments, commitment_b), EOrderNotFound);

        let order_a = table::remove(&mut pool.commitments, commitment_a);
        let order_b = table::remove(&mut pool.commitments, commitment_b);

        // Distribute payouts based on is_buy:
        // Buyer (is_buy=true) → gets BaseCoin from base_vault
        // Seller (is_buy=false) → gets QuoteCoin from quote_vault
        if (payout_a > 0) {
            if (order_a.is_buy) {
                distribute_coins<BaseCoin>(
                    &mut pool.base_vault, payout_a, order_a.owner,
                    receivers_a, percentages_a, ctx
                );
            } else {
                distribute_coins<QuoteCoin>(
                    &mut pool.quote_vault, payout_a, order_a.owner,
                    receivers_a, percentages_a, ctx
                );
            };
        };

        if (payout_b > 0) {
            if (order_b.is_buy) {
                distribute_coins<BaseCoin>(
                    &mut pool.base_vault, payout_b, order_b.owner,
                    receivers_b, percentages_b, ctx
                );
            } else {
                distribute_coins<QuoteCoin>(
                    &mut pool.quote_vault, payout_b, order_b.owner,
                    receivers_b, percentages_b, ctx
                );
            };
        };

        event::emit(OrderSettled {
            pool_id: pool.config.pool_id,
            commitment_a,
            commitment_b,
            timestamp: tx_context::epoch(ctx),
        });
    }

    /// Extract seller's locked BaseCoin for flash loan repayment.
    /// Asserts order is a sell (is_buy = false).
    public fun settle_single_base<BaseCoin, QuoteCoin>(
        pool: &mut DarkPool<BaseCoin, QuoteCoin>,
        _matcher_cap: &MatcherCap,
        commitment: vector<u8>,
        ctx: &mut TxContext
    ): Coin<BaseCoin> {
        assert!(table::contains(&pool.commitments, commitment), EOrderNotFound);
        let order = table::remove(&mut pool.commitments, commitment);
        assert!(!order.is_buy, EUnauthorized);
        assert!(balance::value(&pool.base_vault) >= order.locked_amount, EInsufficientVaultBalance);

        let coin = coin::from_balance(
            balance::split(&mut pool.base_vault, order.locked_amount),
            ctx,
        );

        event::emit(SingleSettled {
            pool_id: pool.config.pool_id,
            commitment,
            timestamp: tx_context::epoch(ctx),
        });

        coin
    }

    /// Extract buyer's locked QuoteCoin for flash loan repayment.
    /// Asserts order is a buy (is_buy = true).
    public fun settle_single_quote<BaseCoin, QuoteCoin>(
        pool: &mut DarkPool<BaseCoin, QuoteCoin>,
        _matcher_cap: &MatcherCap,
        commitment: vector<u8>,
        ctx: &mut TxContext
    ): Coin<QuoteCoin> {
        assert!(table::contains(&pool.commitments, commitment), EOrderNotFound);
        let order = table::remove(&mut pool.commitments, commitment);
        assert!(order.is_buy, EUnauthorized);
        assert!(balance::value(&pool.quote_vault) >= order.locked_amount, EInsufficientVaultBalance);

        let coin = coin::from_balance(
            balance::split(&mut pool.quote_vault, order.locked_amount),
            ctx,
        );

        event::emit(SingleSettled {
            pool_id: pool.config.pool_id,
            commitment,
            timestamp: tx_context::epoch(ctx),
        });

        coin
    }

    // ── Distribution Helpers ─────────────────────────────────────────────

    /// Public helper for PTBs: split a coin proportionally and transfer to receivers.
    /// Last receiver gets remainder (rounding dust).
    public fun split_and_distribute<CoinType>(
        coin: Coin<CoinType>,
        receivers: vector<address>,
        percentages: vector<u64>,
        ctx: &mut TxContext
    ) {
        validate_splits(&receivers, &percentages);
        let total = coin::value(&coin);
        let mut remaining = coin;
        let len = vector::length(&receivers);
        let mut sent = 0u64;
        let mut i = 0;

        while (i < len - 1) {
            let pct = *vector::borrow(&percentages, i);
            let split_amount = (total * pct) / 100;
            let split_coin = coin::split(&mut remaining, split_amount, ctx);
            transfer::public_transfer(split_coin, *vector::borrow(&receivers, i));
            sent = sent + split_amount;
            i = i + 1;
        };

        // Last receiver gets remainder
        transfer::public_transfer(remaining, *vector::borrow(&receivers, len - 1));
    }

    /// Internal helper: distribute from a vault balance to receivers.
    /// If receivers is empty, sends full amount to owner.
    fun distribute_coins<CoinType>(
        vault: &mut Balance<CoinType>,
        amount: u64,
        owner: address,
        receivers: vector<address>,
        percentages: vector<u64>,
        ctx: &mut TxContext
    ) {
        assert!(balance::value(vault) >= amount, EInsufficientVaultBalance);

        if (vector::is_empty(&receivers)) {
            let coin = coin::from_balance(balance::split(vault, amount), ctx);
            transfer::public_transfer(coin, owner);
        } else {
            validate_splits(&receivers, &percentages);
            let len = vector::length(&receivers);
            let mut sent = 0u64;
            let mut i = 0;

            while (i < len - 1) {
                let pct = *vector::borrow(&percentages, i);
                let split_amount = (amount * pct) / 100;
                let coin = coin::from_balance(balance::split(vault, split_amount), ctx);
                transfer::public_transfer(coin, *vector::borrow(&receivers, i));
                sent = sent + split_amount;
                i = i + 1;
            };

            // Last receiver gets remainder
            let remainder = amount - sent;
            let coin = coin::from_balance(balance::split(vault, remainder), ctx);
            transfer::public_transfer(coin, *vector::borrow(&receivers, len - 1));
        };
    }

    /// Validate receiver split arrays
    fun validate_splits(receivers: &vector<address>, percentages: &vector<u64>) {
        let len = vector::length(receivers);
        assert!(len > 0, EInvalidReceiverSplit);
        assert!(len == vector::length(percentages), EReceiverLengthMismatch);

        let mut total = 0u64;
        let mut i = 0;
        while (i < len) {
            let pct = *vector::borrow(percentages, i);
            assert!(pct > 0, EInvalidReceiverSplit);
            total = total + pct;
            i = i + 1;
        };
        assert!(total == 100, EInvalidReceiverSplit);
    }

    // ── Proof Verification ───────────────────────────────────────────────

    fun verify_proof<BaseCoin, QuoteCoin>(
        pool: &DarkPool<BaseCoin, QuoteCoin>,
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

    // ── View Functions ───────────────────────────────────────────────────

    public fun get_order_exists<BaseCoin, QuoteCoin>(
        pool: &DarkPool<BaseCoin, QuoteCoin>,
        commitment: vector<u8>
    ): bool {
        table::contains(&pool.commitments, commitment)
    }

    public fun is_nullifier_used<BaseCoin, QuoteCoin>(
        pool: &DarkPool<BaseCoin, QuoteCoin>,
        nullifier: vector<u8>
    ): bool {
        table::contains(&pool.nullifiers, nullifier)
    }

    public fun get_pool_id<BaseCoin, QuoteCoin>(
        pool: &DarkPool<BaseCoin, QuoteCoin>
    ): vector<u8> {
        pool.config.pool_id
    }
}

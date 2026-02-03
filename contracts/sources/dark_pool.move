module zebra::dark_pool {
    use sui::object::{Self, UID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::event;
    use sui::table::{Self, Table};
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::groth16;
    use sui::hash::blake2b256;
    use sui::bcs;
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

    // Dark pool shared object
    public struct DarkPool<phantom BaseAsset, phantom QuoteAsset> has key {
        id: UID,
        vk_bytes: vector<u8>,
        commitments: Table<vector<u8>, OrderCommitment>,
        nullifiers: Table<vector<u8>, bool>,
        base_vault: Balance<BaseAsset>,
        quote_vault: Balance<QuoteAsset>,
        config: PoolConfig,
    }

    public struct OrderCommitment has store, drop {
        commitment: vector<u8>,
        nullifier: vector<u8>,
        owner: address,
        locked_amount: u64,
        is_bid: bool,
        created_at: u64,
        expiry: u64,
        encrypted_data: vector<u8>,
    }

    public struct PoolConfig has store, drop {
        min_order_size: u64,
        max_order_size: u64,
        fee_bps: u64,
        pool_id: vector<u8>,
    }

    public struct AdminCap has key, store {
        id: UID,
    }

    // Capability for the matching engine to call settle
    public struct MatcherCap has key, store {
        id: UID,
    }

    // Events
    public struct OrderCommitted has copy, drop {
        pool_id: vector<u8>,
        commitment: vector<u8>,
        nullifier: vector<u8>,
        owner: address,
        is_bid: bool,
        locked_amount: u64,
        timestamp: u64,
        encrypted_data: vector<u8>,
    }

    public struct OrderCancelled has copy, drop {
        pool_id: vector<u8>,
        commitment: vector<u8>,
        owner: address,
        timestamp: u64,
    }

    public struct OrderSettled has copy, drop {
        pool_id: vector<u8>,
        buyer: address,
        seller: address,
        amount: u64,
        price: u64,
        timestamp: u64,
    }

    // Create a new dark pool — returns (AdminCap, MatcherCap)
    public fun create_pool<BaseAsset, QuoteAsset>(
        vk_bytes: vector<u8>,
        pool_id: vector<u8>,
        min_order_size: u64,
        max_order_size: u64,
        fee_bps: u64,
        ctx: &mut TxContext
    ): (AdminCap, MatcherCap) {
        let pool = DarkPool<BaseAsset, QuoteAsset> {
            id: object::new(ctx),
            vk_bytes,
            commitments: table::new(ctx),
            nullifiers: table::new(ctx),
            base_vault: balance::zero<BaseAsset>(),
            quote_vault: balance::zero<QuoteAsset>(),
            config: PoolConfig {
                min_order_size,
                max_order_size,
                fee_bps,
                pool_id,
            },
        };

        transfer::share_object(pool);

        (
            AdminCap { id: object::new(ctx) },
            MatcherCap { id: object::new(ctx) },
        )
    }

    // Submit a hidden BUY order with ZK proof
    public fun submit_buy_order<BaseAsset, QuoteAsset>(
        pool: &mut DarkPool<BaseAsset, QuoteAsset>,
        quote_coin: Coin<QuoteAsset>,
        proof_points: vector<u8>,
        public_inputs: vector<u8>,
        commitment: vector<u8>,
        nullifier: vector<u8>,
        expiry: u64,
        encrypted_data: vector<u8>,
        ctx: &mut TxContext
    ) {
        // Verify the ZK proof
        verify_proof(pool, &proof_points, &public_inputs);

        // Check nullifier not used
        assert!(!table::contains(&pool.nullifiers, nullifier), ENullifierUsed);

        // Lock the quote funds
        let locked_amount = coin::value(&quote_coin);
        let coin_balance = coin::into_balance(quote_coin);
        balance::join(&mut pool.quote_vault, coin_balance);

        // Store commitment
        let order = OrderCommitment {
            commitment,
            nullifier,
            owner: tx_context::sender(ctx),
            locked_amount,
            is_bid: true,
            created_at: tx_context::epoch(ctx),
            expiry,
            encrypted_data,
        };

        table::add(&mut pool.commitments, commitment, order);
        table::add(&mut pool.nullifiers, nullifier, true);

        // Emit event
        event::emit(OrderCommitted {
            pool_id: pool.config.pool_id,
            commitment,
            nullifier,
            owner: tx_context::sender(ctx),
            is_bid: true,
            locked_amount,
            timestamp: tx_context::epoch(ctx),
            encrypted_data,
        });
    }

    // Submit a hidden SELL order with ZK proof
    public fun submit_sell_order<BaseAsset, QuoteAsset>(
        pool: &mut DarkPool<BaseAsset, QuoteAsset>,
        base_coin: Coin<BaseAsset>,
        proof_points: vector<u8>,
        public_inputs: vector<u8>,
        commitment: vector<u8>,
        nullifier: vector<u8>,
        expiry: u64,
        encrypted_data: vector<u8>,
        ctx: &mut TxContext
    ) {
        verify_proof(pool, &proof_points, &public_inputs);
        assert!(!table::contains(&pool.nullifiers, nullifier), ENullifierUsed);

        let locked_amount = coin::value(&base_coin);
        let coin_balance = coin::into_balance(base_coin);
        balance::join(&mut pool.base_vault, coin_balance);

        let order = OrderCommitment {
            commitment,
            nullifier,
            owner: tx_context::sender(ctx),
            locked_amount,
            is_bid: false,
            created_at: tx_context::epoch(ctx),
            expiry,
            encrypted_data,
        };

        table::add(&mut pool.commitments, commitment, order);
        table::add(&mut pool.nullifiers, nullifier, true);

        event::emit(OrderCommitted {
            pool_id: pool.config.pool_id,
            commitment,
            nullifier,
            owner: tx_context::sender(ctx),
            is_bid: false,
            locked_amount,
            timestamp: tx_context::epoch(ctx),
            encrypted_data,
        });
    }

    // Verify Groth16 proof
    fun verify_proof<BaseAsset, QuoteAsset>(
        pool: &DarkPool<BaseAsset, QuoteAsset>,
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

    // Cancel buy order and refund
    public fun cancel_buy_order<BaseAsset, QuoteAsset>(
        pool: &mut DarkPool<BaseAsset, QuoteAsset>,
        commitment: vector<u8>,
        ctx: &mut TxContext
    ): Coin<QuoteAsset> {
        assert!(table::contains(&pool.commitments, commitment), EOrderNotFound);
        let order = table::remove(&mut pool.commitments, commitment);
        assert!(order.owner == tx_context::sender(ctx), EUnauthorized);
        assert!(order.is_bid, EUnauthorized);

        let quote_balance = balance::split(&mut pool.quote_vault, order.locked_amount);

        event::emit(OrderCancelled {
            pool_id: pool.config.pool_id,
            commitment,
            owner: order.owner,
            timestamp: tx_context::epoch(ctx),
        });

        coin::from_balance(quote_balance, ctx)
    }

    // Cancel sell order and refund
    public fun cancel_sell_order<BaseAsset, QuoteAsset>(
        pool: &mut DarkPool<BaseAsset, QuoteAsset>,
        commitment: vector<u8>,
        ctx: &mut TxContext
    ): Coin<BaseAsset> {
        assert!(table::contains(&pool.commitments, commitment), EOrderNotFound);
        let order = table::remove(&mut pool.commitments, commitment);
        assert!(order.owner == tx_context::sender(ctx), EUnauthorized);
        assert!(!order.is_bid, EUnauthorized);

        let base_balance = balance::split(&mut pool.base_vault, order.locked_amount);

        event::emit(OrderCancelled {
            pool_id: pool.config.pool_id,
            commitment,
            owner: order.owner,
            timestamp: tx_context::epoch(ctx),
        });

        coin::from_balance(base_balance, ctx)
    }

    // Settle a matched order pair (called by matching engine with MatcherCap)
    public fun settle_match<BaseAsset, QuoteAsset>(
        pool: &mut DarkPool<BaseAsset, QuoteAsset>,
        _matcher_cap: &MatcherCap,
        buyer_commitment: vector<u8>,
        seller_commitment: vector<u8>,
        exec_amount: u64,
        exec_price: u64,
        ctx: &mut TxContext
    ) {
        // Verify both orders exist
        assert!(table::contains(&pool.commitments, buyer_commitment), EOrderNotFound);
        assert!(table::contains(&pool.commitments, seller_commitment), EOrderNotFound);

        let buyer_order = table::borrow(&pool.commitments, buyer_commitment);
        let seller_order = table::borrow(&pool.commitments, seller_commitment);

        // Verify orders haven't expired
        let current_time = tx_context::epoch(ctx);
        assert!(buyer_order.expiry > current_time, EOrderExpired);
        assert!(seller_order.expiry > current_time, EOrderExpired);

        // Store addresses and locked amounts before removing orders
        let buyer_addr = buyer_order.owner;
        let seller_addr = seller_order.owner;
        let buyer_locked = buyer_order.locked_amount;
        let seller_locked = seller_order.locked_amount;

        // Remove settled orders
        let _ = table::remove(&mut pool.commitments, buyer_commitment);
        let _ = table::remove(&mut pool.commitments, seller_commitment);

        // Calculate quote cost: exec_amount * exec_price / 1e9
        let quote_cost = exec_amount * exec_price / 1000000000;

        // Transfer base tokens (exec_amount) from vault to buyer
        assert!(balance::value(&pool.base_vault) >= exec_amount, EInsufficientVaultBalance);
        let base_to_buyer = balance::split(&mut pool.base_vault, exec_amount);
        let base_coin = coin::from_balance(base_to_buyer, ctx);
        transfer::public_transfer(base_coin, buyer_addr);

        // Refund excess base to seller (locked_base - exec_amount)
        if (seller_locked > exec_amount) {
            let seller_base_refund = balance::split(&mut pool.base_vault, seller_locked - exec_amount);
            let seller_refund_coin = coin::from_balance(seller_base_refund, ctx);
            transfer::public_transfer(seller_refund_coin, seller_addr);
        };

        // Transfer quote tokens (quote_cost) from vault to seller
        assert!(balance::value(&pool.quote_vault) >= quote_cost, EInsufficientVaultBalance);
        let quote_to_seller = balance::split(&mut pool.quote_vault, quote_cost);
        let quote_coin = coin::from_balance(quote_to_seller, ctx);
        transfer::public_transfer(quote_coin, seller_addr);

        // Refund excess quote to buyer (locked_quote - quote_cost)
        if (buyer_locked > quote_cost) {
            let buyer_quote_refund = balance::split(&mut pool.quote_vault, buyer_locked - quote_cost);
            let buyer_refund_coin = coin::from_balance(buyer_quote_refund, ctx);
            transfer::public_transfer(buyer_refund_coin, buyer_addr);
        };

        event::emit(OrderSettled {
            pool_id: pool.config.pool_id,
            buyer: buyer_addr,
            seller: seller_addr,
            amount: exec_amount,
            price: exec_price,
            timestamp: current_time,
        });
    }

    // View functions
    public fun get_order_exists<BaseAsset, QuoteAsset>(
        pool: &DarkPool<BaseAsset, QuoteAsset>,
        commitment: vector<u8>
    ): bool {
        table::contains(&pool.commitments, commitment)
    }

    public fun is_nullifier_used<BaseAsset, QuoteAsset>(
        pool: &DarkPool<BaseAsset, QuoteAsset>,
        nullifier: vector<u8>
    ): bool {
        table::contains(&pool.nullifiers, nullifier)
    }

    public fun get_pool_id<BaseAsset, QuoteAsset>(
        pool: &DarkPool<BaseAsset, QuoteAsset>
    ): vector<u8> {
        pool.config.pool_id
    }
}

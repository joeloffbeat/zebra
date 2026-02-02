pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/comparators.circom";
include "node_modules/circomlib/circuits/bitify.circom";

template OrderCommitment() {
    // Private inputs
    signal input secret;
    signal input side;             // 0 = SELL, 1 = BUY
    signal input amount;
    signal input price;
    signal input expiry;
    signal input nonce;

    // Public inputs
    signal input user_balance;
    signal input current_time;
    signal input pool_id;

    // Outputs
    signal output commitment;
    signal output nullifier;

    // Compute commitment = Poseidon(side, amount, price, expiry, nonce, secret)
    component commitment_hasher = Poseidon(6);
    commitment_hasher.inputs[0] <== side;
    commitment_hasher.inputs[1] <== amount;
    commitment_hasher.inputs[2] <== price;
    commitment_hasher.inputs[3] <== expiry;
    commitment_hasher.inputs[4] <== nonce;
    commitment_hasher.inputs[5] <== secret;
    commitment <== commitment_hasher.out;

    // Generate nullifier = Poseidon(secret, pool_id)
    component nullifier_hasher = Poseidon(2);
    nullifier_hasher.inputs[0] <== secret;
    nullifier_hasher.inputs[1] <== pool_id;
    nullifier <== nullifier_hasher.out;

    // Validate side (must be 0 or 1)
    signal side_check;
    side_check <== side * (side - 1);
    side_check === 0;

    // Amount > 0
    component amount_gt_zero = GreaterThan(64);
    amount_gt_zero.in[0] <== amount;
    amount_gt_zero.in[1] <== 0;
    amount_gt_zero.out === 1;

    // Price > 0
    component price_gt_zero = GreaterThan(64);
    price_gt_zero.in[0] <== price;
    price_gt_zero.in[1] <== 0;
    price_gt_zero.out === 1;

    // Expiry > current_time
    component expiry_valid = GreaterThan(64);
    expiry_valid.in[0] <== expiry;
    expiry_valid.in[1] <== current_time;
    expiry_valid.out === 1;

    // Sufficient balance
    component balance_sufficient = LessEqThan(64);
    balance_sufficient.in[0] <== amount;
    balance_sufficient.in[1] <== user_balance;
    balance_sufficient.out === 1;
}

component main {public [user_balance, current_time, pool_id]} = OrderCommitment();

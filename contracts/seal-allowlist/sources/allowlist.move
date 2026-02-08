// Based on the Seal allowlist pattern from MystenLabs/seal
// Deployed as a separate package for Zebra dark pool access control

module zebra_seal::allowlist;

use std::string::String;
use sui::dynamic_field as df;
use zebra_seal::utils::is_prefix;

const EInvalidCap: u64 = 0;
const ENoAccess: u64 = 1;
const EDuplicate: u64 = 2;
const MARKER: u64 = 3;

public struct Allowlist has key {
    id: UID,
    name: String,
    list: vector<address>,
}

public struct Cap has key {
    id: UID,
    allowlist_id: ID,
}

public fun create_allowlist(name: String, ctx: &mut TxContext): Cap {
    let allowlist = Allowlist {
        id: object::new(ctx),
        list: vector::empty(),
        name: name,
    };
    let cap = Cap {
        id: object::new(ctx),
        allowlist_id: object::id(&allowlist),
    };
    transfer::share_object(allowlist);
    cap
}

entry fun create_allowlist_entry(name: String, ctx: &mut TxContext) {
    transfer::transfer(create_allowlist(name, ctx), ctx.sender());
}

public fun add(allowlist: &mut Allowlist, cap: &Cap, account: address) {
    assert!(cap.allowlist_id == object::id(allowlist), EInvalidCap);
    assert!(!allowlist.list.contains(&account), EDuplicate);
    allowlist.list.push_back(account);
}

public fun remove(allowlist: &mut Allowlist, cap: &Cap, account: address) {
    assert!(cap.allowlist_id == object::id(allowlist), EInvalidCap);
    allowlist.list = allowlist.list.filter!(|x| x != account);
}

public fun namespace(allowlist: &Allowlist): vector<u8> {
    allowlist.id.to_bytes()
}

fun approve_internal(caller: address, id: vector<u8>, allowlist: &Allowlist): bool {
    let namespace = namespace(allowlist);
    if (!is_prefix(namespace, id)) {
        return false
    };
    allowlist.list.contains(&caller)
}

entry fun seal_approve(id: vector<u8>, allowlist: &Allowlist, ctx: &TxContext) {
    assert!(approve_internal(ctx.sender(), id, allowlist), ENoAccess);
}

public fun publish(allowlist: &mut Allowlist, cap: &Cap, blob_id: String) {
    assert!(cap.allowlist_id == object::id(allowlist), EInvalidCap);
    df::add(&mut allowlist.id, blob_id, MARKER);
}

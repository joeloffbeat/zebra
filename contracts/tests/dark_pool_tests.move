#[test_only]
module zebra::dark_pool_tests {
    use zebra::dark_pool;
    use sui::test_scenario;
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;

    #[test]
    fun test_create_pool() {
        let admin = @0xAD;
        let mut scenario = test_scenario::begin(admin);

        // Create a test verification key (dummy for testing)
        let vk_bytes = vector[0u8, 1u8, 2u8, 3u8];
        let pool_id = vector[1u8];

        test_scenario::next_tx(&mut scenario, admin);
        {
            let admin_cap = dark_pool::create_pool<SUI, SUI>(
                vk_bytes,
                pool_id,
                1000000, // min order
                1000000000000, // max order
                100, // fee bps
                test_scenario::ctx(&mut scenario)
            );

            transfer::public_transfer(admin_cap, admin);
        };

        test_scenario::end(scenario);
    }
}

#[test_only]
module zebra::dark_pool_tests {
    use zebra::dark_pool;
    use sui::test_scenario;
    use sui::sui::SUI;

    // Dummy QuoteCoin for testing
    public struct DBUSDC has drop {}

    #[test]
    fun test_create_pool() {
        let admin = @0xAD;
        let mut scenario = test_scenario::begin(admin);

        let vk_bytes = vector[0u8, 1u8, 2u8, 3u8];
        let pool_id = vector[1u8];

        test_scenario::next_tx(&mut scenario, admin);
        {
            let (admin_cap, matcher_cap) = dark_pool::create_pool<SUI, DBUSDC>(
                vk_bytes,
                pool_id,
                1000000,
                1000000000000,
                test_scenario::ctx(&mut scenario)
            );

            transfer::public_transfer(admin_cap, admin);
            transfer::public_transfer(matcher_cap, admin);
        };

        test_scenario::end(scenario);
    }
}

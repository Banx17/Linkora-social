#![cfg(test)]
extern crate alloc;

use super::*;
use soroban_sdk::{
    events::Event as _,
    testutils::{Address as _, Events},
    token::{Client as TokenClient, StellarAssetClient},
    Address, Env, String,
};

fn setup(env: &Env) -> (LinkoraReferralClient<'_>, Address, Address) {
    let contract_id = env.register(LinkoraReferral, ());
    let client = LinkoraReferralClient::new(env, &contract_id);
    let admin = Address::generate(env);
    let token_admin = Address::generate(env);
    let token_id = env.register_stellar_asset_contract_v2(token_admin.clone());
    StellarAssetClient::new(env, &token_id.address()).mint(&token_admin, &1_000_000);
    client.initialize(&admin, &token_id.address());
    (client, admin, token_id.address())
}

/// Mint `amount` of the referral token to `to` (the token admin is the minter).
fn mint(env: &Env, token: &Address, to: &Address, amount: i128) {
    StellarAssetClient::new(env, token).mint(to, &amount);
}

#[test]
fn test_initialization_sets_default_rate() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _) = setup(&env);

    assert_eq!(client.get_referral_rate(), DEFAULT_REFERRAL_RATE_BPS);
}

#[test]
#[should_panic(expected = "already initialized")]
fn test_initialize_twice_panics() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, token) = setup(&env);
    client.initialize(&admin, &token);
}

#[test]
fn test_register_code_and_owner_lookup() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _) = setup(&env);

    let user = Address::generate(&env);
    let code = String::from_str(&env, "alice-code");
    client.register_code(&user, &code);

    assert_eq!(client.get_code_owner(&code), Some(user.clone()));
    assert_eq!(client.get_code_of(&user), Some(code));
}

#[test]
#[should_panic(expected = "code already registered")]
fn test_register_code_twice_by_different_users_panics() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _) = setup(&env);

    let first = Address::generate(&env);
    let second = Address::generate(&env);
    let code = String::from_str(&env, "alice-code");
    client.register_code(&first, &code);
    client.register_code(&second, &code);
}

#[test]
#[should_panic(expected = "user already registered a code")]
fn test_register_second_code_by_same_user_panics() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _) = setup(&env);

    let user = Address::generate(&env);
    client.register_code(&user, &String::from_str(&env, "alice-code"));
    client.register_code(&user, &String::from_str(&env, "alice-code-2"));
}

#[test]
#[should_panic(expected = "code must be 3-32 characters")]
fn test_register_code_rejects_short_code() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _) = setup(&env);

    let user = Address::generate(&env);
    client.register_code(&user, &String::from_str(&env, "ab"));
}

#[test]
fn test_register_with_code_attributes_referrer() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _) = setup(&env);

    let referrer = Address::generate(&env);
    let referred = Address::generate(&env);
    let code = String::from_str(&env, "alice-code");
    client.register_code(&referrer, &code);

    client.register_with_code(&referred, &code);

    assert_eq!(client.get_referrer(&referred), Some(referrer.clone()));
    assert_eq!(client.get_referrer(&referrer), None);
}

#[test]
#[should_panic(expected = "user already has a referrer")]
fn test_register_with_code_only_once_per_wallet() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _) = setup(&env);

    let referrer = Address::generate(&env);
    let other = Address::generate(&env);
    let referred = Address::generate(&env);
    client.register_code(&referrer, &String::from_str(&env, "alice-code"));
    client.register_code(&other, &String::from_str(&env, "bob-code"));

    client.register_with_code(&referred, &String::from_str(&env, "alice-code"));
    client.register_with_code(&referred, &String::from_str(&env, "bob-code"));
}

#[test]
#[should_panic(expected = "cannot refer yourself")]
fn test_self_referral_is_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _) = setup(&env);

    let user = Address::generate(&env);
    let code = String::from_str(&env, "alice-code");
    client.register_code(&user, &code);
    client.register_with_code(&user, &code);
}

#[test]
#[should_panic(expected = "referral code not found")]
fn test_register_with_unknown_code_panics() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _) = setup(&env);

    let referred = Address::generate(&env);
    client.register_with_code(&referred, &String::from_str(&env, "nope-code"));
}

#[test]
fn test_claim_reward_splits_tip_in_basis_points() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, token) = setup(&env);

    let referrer = Address::generate(&env);
    let referred = Address::generate(&env);
    mint(&env, &token, &referred, 1_000);
    let code = String::from_str(&env, "alice-code");
    client.register_code(&referrer, &code);
    client.register_with_code(&referred, &code);

    // 1_000 * 1_000 / 10_000 = 100
    client.claim_reward(&referred, &1_000);

    let token_client = TokenClient::new(&env, &token);
    assert_eq!(token_client.balance(&referrer), 100);
    assert!(client.get_rewarded(&referred));
}

#[test]
#[should_panic(expected = "referral reward already paid")]
fn test_claim_reward_only_for_the_first_tip() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, token) = setup(&env);

    let referrer = Address::generate(&env);
    let referred = Address::generate(&env);
    mint(&env, &token, &referred, 10_000);
    client.register_code(&referrer, &String::from_str(&env, "alice-code"));
    client.register_with_code(&referred, &String::from_str(&env, "alice-code"));

    client.claim_reward(&referred, &1_000);
    client.claim_reward(&referred, &5_000);
}

#[test]
#[should_panic(expected = "user has no referrer")]
fn test_claim_reward_without_referrer_panics() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _) = setup(&env);

    let wallet = Address::generate(&env);
    client.claim_reward(&wallet, &1_000);
}

#[test]
fn test_set_referral_rate_by_admin() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _) = setup(&env);

    client.set_referral_rate(&2_500);
    assert_eq!(client.get_referral_rate(), 2_500);
}

#[test]
#[should_panic(expected = "referral rate must be at most 10000 bps")]
fn test_set_referral_rate_rejects_more_than_100_percent() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _) = setup(&env);

    client.set_referral_rate(&10_001);
}

#[test]
fn test_reward_amount_is_calculated_in_basis_points() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _) = setup(&env);

    assert_eq!(client.referral_reward_amount(&1_000, &1_000), 100);
    assert_eq!(client.referral_reward_amount(&1_000, &2_500), 250);
    assert_eq!(client.referral_reward_amount(&1_000, &0), 0);
    assert_eq!(client.referral_reward_amount(&0, &1_000), 0);
}

#[test]
fn test_events_are_emitted_for_registration_and_reward() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, token) = setup(&env);

    let referrer = Address::generate(&env);
    let referred = Address::generate(&env);
    mint(&env, &token, &referred, 1_000);
    let code = String::from_str(&env, "alice-code");

    // Registering a code emits a referral_registered event.
    client.register_code(&referrer, &code);
    let expected_code_event = ReferralRegisteredEvent {
        version: EVENT_VERSION,
        user: referrer.clone(),
        code: code.clone(),
        referred: referrer.clone(),
    }
    .to_xdr(&env, &client.address);
    assert!(env.events().all().events().contains(&expected_code_event));

    // Using a code emits a referral_registered event for the attribution.
    client.register_with_code(&referred, &code);
    let expected_attribution_event = ReferralRegisteredEvent {
        version: EVENT_VERSION,
        user: referrer.clone(),
        code: code.clone(),
        referred: referred.clone(),
    }
    .to_xdr(&env, &client.address);
    assert!(env
        .events()
        .all()
        .events()
        .contains(&expected_attribution_event));

    // Paying the reward emits a referral_reward_paid event.
    client.claim_reward(&referred, &1_000);
    let expected_reward = ReferralRewardPaidEvent {
        version: EVENT_VERSION,
        referrer: referrer.clone(),
        referred: referred.clone(),
        tip_amount: 1_000,
        reward_amount: 100,
        rate_bps: DEFAULT_REFERRAL_RATE_BPS,
    }
    .to_xdr(&env, &client.address);
    assert!(env.events().all().events().contains(&expected_reward));
}

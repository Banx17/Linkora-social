#![no_std]

mod test;

use soroban_sdk::{
    contract, contractevent, contractimpl, contracttype, symbol_short, token, Address, Env, String,
    Symbol,
};

#[macro_export]
macro_rules! require_with_error {
    ($env:expr, $cond:expr, $msg:expr) => {{
        if !($cond) {
            let _ = &$env;
            panic!("{}", $msg);
        }
    }};
}

// ── Storage Keys ──────────────────────────────────────────────────────────────

const ADMIN: Symbol = symbol_short!("ADMIN");
const TOKEN: Symbol = symbol_short!("TOKEN");
const RATE: Symbol = symbol_short!("RATE");
const INIT: Symbol = symbol_short!("INIT");

/// Default referral reward: 10% of the first tip.
pub const DEFAULT_REFERRAL_RATE_BPS: u32 = 1_000;

/// Maximum referral reward: 100%.
pub const MAX_REFERRAL_RATE_BPS: u32 = 10_000;

/// Basis point denominator.
pub const BPS_DENOMINATOR: i128 = 10_000;

/// Minimum length of a referral code.
pub const MIN_CODE_LEN: u32 = 3;

/// Maximum length of a referral code.
pub const MAX_CODE_LEN: u32 = 32;

// ── TTL ───────────────────────────────────────────────────────────────────────

const EVENT_VERSION: u32 = 1;
const LEDGER_BUMP: u32 = 535_000;
const LEDGER_THRESHOLD: u32 = 535_000 - 100;

// ── Events ────────────────────────────────────────────────────────────────────

/// Emitted when a user registers a referral code.
#[contractevent]
#[derive(Clone)]
pub struct ReferralRegisteredEvent {
    /// Event schema version.
    #[topic]
    pub version: u32,
    /// The wallet that owns the code.
    #[topic]
    pub user: Address,
    /// The referral code that was registered.
    #[topic]
    pub code: String,
    /// The wallet that used the code, when the registration is an attribution.
    pub referred: Address,
}

/// Emitted when a referral reward is paid out to a referrer.
#[contractevent]
#[derive(Clone)]
pub struct ReferralRewardPaidEvent {
    /// Event schema version.
    #[topic]
    pub version: u32,
    /// The wallet that received the reward.
    #[topic]
    pub referrer: Address,
    /// The wallet that earned the tip and paid the referral reward.
    #[topic]
    pub referred: Address,
    /// The amount that triggered the reward (the first tip).
    pub tip_amount: i128,
    /// The reward paid to the referrer.
    pub reward_amount: i128,
    /// The reward rate in basis points that was applied.
    pub rate_bps: u32,
}

/// Emitted when the referral rate is changed.
#[contractevent]
#[derive(Clone)]
pub struct ReferralRateUpdatedEvent {
    /// Event schema version.
    #[topic]
    pub version: u32,
    /// The old rate in basis points.
    pub old_rate_bps: u32,
    /// The new rate in basis points.
    pub new_rate_bps: u32,
}

// ── Storage Types ─────────────────────────────────────────────────────────────

/// Persistent storage keys for the referral program.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// referral code -> owner address
    Code(String),
    /// owner address -> referral code
    CodeOf(Address),
    /// referred address -> referrer address
    Referrer(Address),
    /// referred address -> whether the first-tip reward was already paid
    Rewarded(Address),
}

/// A registered referral code.
#[contracttype]
#[derive(Clone, Debug)]
pub struct ReferralCode {
    pub code: String,
    pub owner: Address,
    pub registered_ledger: u32,
}

// ── Contract ──────────────────────────────────────────────────────────────────

/// On-chain referral program.
///
/// Users register a referral code, new wallets can attribute themselves to a
/// code once, and the referrer receives a configurable share (default 10%) of
/// the referred user's first tip.
#[contract]
pub struct LinkoraReferral;

#[contractimpl]
impl LinkoraReferral {
    /// Initialise the referral program. Must be called exactly once.
    ///
    /// @param admin Address allowed to change the referral rate (governance).
    /// @param token Address of the SEP-41 token used to pay referral rewards.
    pub fn initialize(env: Env, admin: Address, token_address: Address) {
        if env
            .storage()
            .instance()
            .get::<Symbol, bool>(&INIT)
            .unwrap_or(false)
        {
            panic!("already initialized");
        }
        admin.require_auth();

        env.storage().instance().set(&ADMIN, &admin);
        env.storage().instance().set(&TOKEN, &token_address);
        env.storage()
            .instance()
            .set(&RATE, &DEFAULT_REFERRAL_RATE_BPS);
        env.storage().instance().set(&INIT, &true);
        env.storage()
            .instance()
            .extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);
    }

    /// Register a referral code for `user`.
    ///
    /// Precondition: `user` must authorize the call (`require_auth`).
    /// @param user The wallet that owns the code.
    /// @param code The referral code to register.
    pub fn register_code(env: Env, user: Address, code: String) {
        user.require_auth();
        Self::validate_code(&env, &code);

        let code_key = DataKey::Code(code.clone());
        let existing: Option<Address> = env.storage().persistent().get(&code_key);
        require_with_error!(&env, existing.is_none(), "code already registered");

        let code_of_key = DataKey::CodeOf(user.clone());
        let own_code: Option<String> = env.storage().persistent().get(&code_of_key);
        require_with_error!(&env, own_code.is_none(), "user already registered a code");

        env.storage().persistent().set(&code_key, &user);
        env.storage().persistent().set(&code_of_key, &code);
        env.storage()
            .persistent()
            .extend_ttl(&code_key, LEDGER_THRESHOLD, LEDGER_BUMP);
        env.storage()
            .persistent()
            .extend_ttl(&code_of_key, LEDGER_THRESHOLD, LEDGER_BUMP);

        ReferralRegisteredEvent {
            version: EVENT_VERSION,
            user: user.clone(),
            code: code.clone(),
            referred: user,
        }
        .publish(&env);
    }

    /// Attribute `user` to the owner of `code`.
    ///
    /// Anti-abuse: a wallet can only use one referral code, ever.
    ///
    /// Precondition: `user` must authorize the call (`require_auth`).
    /// @param user The new wallet being referred.
    /// @param code The referral code to use.
    pub fn register_with_code(env: Env, user: Address, code: String) {
        user.require_auth();
        Self::validate_code(&env, &code);

        let referrer_key = DataKey::Referrer(user.clone());
        let existing: Option<Address> = env.storage().persistent().get(&referrer_key);
        require_with_error!(&env, existing.is_none(), "user already has a referrer");

        let code_key = DataKey::Code(code.clone());
        let referrer: Address = env
            .storage()
            .persistent()
            .get(&code_key)
            .unwrap_or_else(|| panic!("referral code not found"));
        require_with_error!(&env, referrer != user, "cannot refer yourself");

        env.storage().persistent().set(&referrer_key, &referrer);
        env.storage()
            .persistent()
            .extend_ttl(&referrer_key, LEDGER_THRESHOLD, LEDGER_BUMP);

        ReferralRegisteredEvent {
            version: EVENT_VERSION,
            user: referrer,
            code,
            referred: user,
        }
        .publish(&env);
    }

    /// Pay the referral reward for the first tip of a referred wallet.
    ///
    /// The reward is `tip_amount * rate_bps / 10_000` and is transferred from
    /// the referred wallet to the referrer. Only the first tip of a referred
    /// wallet is eligible.
    ///
    /// Precondition: `referred` must authorize the call (`require_auth`).
    /// @param referred The wallet that earned the tip.
    /// @param tip_amount The tip amount the reward is calculated from.
    pub fn claim_reward(env: Env, referred: Address, tip_amount: i128) {
        referred.require_auth();
        require_with_error!(&env, tip_amount > 0, "tip amount must be positive");

        let referrer_key = DataKey::Referrer(referred.clone());
        let referrer: Address = env
            .storage()
            .persistent()
            .get(&referrer_key)
            .unwrap_or_else(|| panic!("user has no referrer"));

        let rewarded_key = DataKey::Rewarded(referred.clone());
        let rewarded: bool = env
            .storage()
            .persistent()
            .get(&rewarded_key)
            .unwrap_or(false);
        require_with_error!(&env, !rewarded, "referral reward already paid");

        let rate_bps: u32 = env.storage().instance().get(&RATE).unwrap_or(0);
        let reward_amount = Self::referral_reward_amount(tip_amount, rate_bps);
        require_with_error!(&env, reward_amount > 0, "referral reward is zero");

        let token_address: Address = env.storage().instance().get(&TOKEN).unwrap();
        let token_client = token::Client::new(&env, &token_address);
        token_client.transfer(&referred, &referrer, &reward_amount);

        env.storage().persistent().set(&rewarded_key, &true);
        env.storage()
            .persistent()
            .extend_ttl(&rewarded_key, LEDGER_THRESHOLD, LEDGER_BUMP);

        ReferralRewardPaidEvent {
            version: EVENT_VERSION,
            referrer,
            referred,
            tip_amount,
            reward_amount,
            rate_bps,
        }
        .publish(&env);
    }

    /// Change the referral reward rate. Admin (governance) only.
    ///
    /// @param new_rate_bps The new rate in basis points (max 10_000 = 100%).
    pub fn set_referral_rate(env: Env, new_rate_bps: u32) {
        let admin: Address = env.storage().instance().get(&ADMIN).unwrap();
        admin.require_auth();
        require_with_error!(
            &env,
            new_rate_bps <= MAX_REFERRAL_RATE_BPS,
            "referral rate must be at most 10000 bps"
        );

        let old_rate_bps: u32 = env.storage().instance().get(&RATE).unwrap_or(0);
        env.storage().instance().set(&RATE, &new_rate_bps);

        ReferralRateUpdatedEvent {
            version: EVENT_VERSION,
            old_rate_bps,
            new_rate_bps,
        }
        .publish(&env);
    }

    /// Read the current referral reward rate in basis points.
    pub fn get_referral_rate(env: Env) -> u32 {
        env.storage()
            .instance()
            .extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);
        env.storage().instance().get(&RATE).unwrap_or(0)
    }

    /// The address that owns a referral code.
    pub fn get_code_owner(env: Env, code: String) -> Option<Address> {
        let key = DataKey::Code(code);
        let result: Option<Address> = env.storage().persistent().get(&key);
        if result.is_some() {
            env.storage()
                .persistent()
                .extend_ttl(&key, LEDGER_THRESHOLD, LEDGER_BUMP);
        }
        result
    }

    /// The referral code registered by an address.
    pub fn get_code_of(env: Env, user: Address) -> Option<String> {
        let key = DataKey::CodeOf(user);
        let result: Option<String> = env.storage().persistent().get(&key);
        if result.is_some() {
            env.storage()
                .persistent()
                .extend_ttl(&key, LEDGER_THRESHOLD, LEDGER_BUMP);
        }
        result
    }

    /// The referrer attributed to a wallet, if any.
    pub fn get_referrer(env: Env, user: Address) -> Option<Address> {
        let key = DataKey::Referrer(user);
        let result: Option<Address> = env.storage().persistent().get(&key);
        if result.is_some() {
            env.storage()
                .persistent()
                .extend_ttl(&key, LEDGER_THRESHOLD, LEDGER_BUMP);
        }
        result
    }

    /// Whether the first-tip referral reward was already paid for a wallet.
    pub fn get_rewarded(env: Env, user: Address) -> bool {
        let key = DataKey::Rewarded(user);
        let result: bool = env.storage().persistent().get(&key).unwrap_or(false);
        if result {
            env.storage()
                .persistent()
                .extend_ttl(&key, LEDGER_THRESHOLD, LEDGER_BUMP);
        }
        result
    }

    /// The referral reward for a tip amount at a given rate.
    pub fn referral_reward_amount(tip_amount: i128, rate_bps: u32) -> i128 {
        if tip_amount <= 0 || rate_bps == 0 {
            return 0;
        }
        tip_amount * (rate_bps as i128) / BPS_DENOMINATOR
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    /// Validate a referral code.
    fn validate_code(env: &Env, code: &String) {
        require_with_error!(env, !code.is_empty(), "code must not be empty");
        require_with_error!(
            env,
            code.len() >= MIN_CODE_LEN && code.len() <= MAX_CODE_LEN,
            "code must be 3-32 characters"
        );
    }
}

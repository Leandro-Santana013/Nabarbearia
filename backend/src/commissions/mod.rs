//! Commission policy, regularization, payments and financial projections.
//! Settlement participates in the caller's transaction; commands own theirs.
mod error;
mod payouts;
mod queries;
mod rules;
mod settlement;
mod storage;

pub use error::{Error, Rejection};
pub use payouts::record_payout;
pub use queries::{earnings, owner_summary};
pub use rules::create_rule;
pub(crate) use settlement::settle_commission;

use crate::models::{AppointmentResponse, AuthUser, CommissionRuleType, Role};
use chrono::{DateTime, SecondsFormat, Utc};

pub struct Rule {
    pub barber_id: Option<String>,
    pub service_id: Option<String>,
    pub rule_type: CommissionRuleType,
    pub amount: i64,
    pub priority: i64,
    pub valid_from: Option<DateTime<Utc>>,
    pub valid_until: Option<DateTime<Utc>>,
}

pub struct Payout {
    pub barber_id: String,
    pub expected_amount_cents: i64,
    pub idempotency_key: String,
}

impl Rule {
    // Also called before parsing HTTP dates to preserve validation precedence.
    pub(crate) fn validate_values(
        rule_type: CommissionRuleType,
        amount: i64,
        priority: i64,
    ) -> Result<(), Error> {
        if !(-1000..=1000).contains(&priority)
            || !(0..=100_000_000).contains(&amount)
            || matches!(rule_type, CommissionRuleType::Percent) && amount > 10_000
        {
            return Err(Error::bad_request(
                "INVALID_COMMISSION_RULE",
                "Commission rule is invalid",
            ));
        }
        Ok(())
    }
}

/// Only historical appointment facts are needed to settle a commission.
pub(crate) struct Settlement {
    business_id: String,
    id: String,
    barber_user_id: String,
    service_id: String,
    starts_at: String,
    price_cents: i64,
}

impl From<&AppointmentResponse> for Settlement {
    fn from(appointment: &AppointmentResponse) -> Self {
        Self {
            business_id: appointment.business_id.clone(),
            id: appointment.id.clone(),
            barber_user_id: appointment.barber_user_id.clone(),
            service_id: appointment.service_id.clone(),
            starts_at: utc_text(appointment.starts_at),
            price_cents: appointment.price_cents,
        }
    }
}

fn require_owner(actor: &AuthUser) -> Result<(), Error> {
    if !actor.roles.contains(&Role::Owner) {
        return Err(Error::forbidden());
    }
    Ok(())
}

fn new_id() -> String {
    uuid::Uuid::now_v7().to_string()
}

fn utc_text(value: DateTime<Utc>) -> String {
    value.to_rfc3339_opts(SecondsFormat::Secs, true)
}

#[cfg(test)]
mod tests;

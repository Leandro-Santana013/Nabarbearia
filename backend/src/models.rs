use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Role {
    Client,
    Barber,
    Owner,
}

impl Role {
    pub fn from_db(value: &str) -> Option<Self> {
        match value {
            "client" => Some(Self::Client),
            "barber" => Some(Self::Barber),
            "owner" => Some(Self::Owner),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AppointmentStatus {
    Confirmed,
    Completed,
    NoShow,
    Cancelled,
}

impl AppointmentStatus {
    pub fn from_db(value: &str) -> Option<Self> {
        match value {
            "confirmed" => Some(Self::Confirmed),
            "completed" => Some(Self::Completed),
            "no_show" => Some(Self::NoShow),
            "cancelled" => Some(Self::Cancelled),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CommissionRuleType {
    Percent,
    Fixed,
}

impl CommissionRuleType {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Percent => "percent",
            Self::Fixed => "fixed",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct AuthUser {
    pub id: String,
    pub business_id: String,
    pub email: String,
    pub display_name: String,
    pub roles: Vec<Role>,
}

#[derive(Debug, Clone)]
pub struct AuthContext {
    pub user: AuthUser,
    pub token_hash: String,
    pub csrf_hash: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SetupOwnerRequest {
    pub business_name: String,
    pub timezone: String,
    pub email: String,
    pub password: String,
    pub display_name: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RegisterRequest {
    pub email: String,
    pub password: String,
    pub display_name: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct SetupStatusResponse {
    pub needs_owner: bool,
}

#[derive(Debug, Serialize)]
pub struct AuthResponse {
    pub user: AuthUser,
    pub csrf_token: String,
    pub expires_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct MessageResponse {
    pub message: &'static str,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ServiceRequest {
    pub name: String,
    pub description: Option<String>,
    #[serde(default)]
    pub category: Option<String>,
    pub price_cents: i64,
    pub duration_minutes: i64,
    pub active: Option<bool>,
}

#[derive(Debug, Serialize, Clone)]
pub struct ServiceResponse {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub price_cents: i64,
    pub duration_minutes: i64,
    pub active: bool,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BarberRequest {
    pub email: String,
    pub password: String,
    pub display_name: String,
    #[serde(default)]
    pub photo_url: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct PublicBarberResponse {
    pub id: String,
    pub display_name: String,
    pub photo_url: Option<String>,
    pub recommendations: i64,
}

#[derive(Debug, Serialize)]
pub struct BarberResponse {
    pub id: String,
    pub display_name: String,
    pub email: String,
    pub active: bool,
    pub photo_url: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ScheduleRequest {
    pub barber_user_id: String,
    pub weekday: i64,
    pub start_minute: i64,
    pub end_minute: i64,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BlockRequest {
    pub barber_user_id: String,
    pub starts_at_utc: String,
    pub ends_at_utc: String,
    pub reason: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AvailabilityQuery {
    pub service_id: String,
    pub barber_id: Option<String>,
    pub date: String,
}

#[derive(Debug, Serialize)]
pub struct AvailableSlot {
    pub barber_id: String,
    pub starts_at: DateTime<Utc>,
    pub ends_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct AppointmentRequest {
    pub barber_user_id: String,
    pub service_id: String,
    pub starts_at: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct AdminAppointmentRequest {
    pub client_user_id: String,
    pub barber_user_id: String,
    pub service_id: String,
    pub starts_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RescheduleRequest {
    pub starts_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CancelRequest {
    pub reason: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CompleteRequest {
    pub notes: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppointmentResponse {
    pub id: String,
    pub business_id: String,
    pub client_user_id: String,
    pub barber_user_id: String,
    pub service_id: String,
    pub starts_at: DateTime<Utc>,
    pub ends_at: DateTime<Utc>,
    pub status: AppointmentStatus,
    pub price_cents: i64,
    pub duration_minutes: i64,
    pub client_display_name: Option<String>,
    pub barber_display_name: Option<String>,
    pub service_name: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CommissionRuleRequest {
    pub barber_user_id: Option<String>,
    pub service_id: Option<String>,
    pub rule_type: CommissionRuleType,
    pub amount: i64,
    pub priority: Option<i64>,
    pub valid_from_utc: Option<String>,
    pub valid_until_utc: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ConsentRequest {
    pub consent_type: String,
    pub policy_version: String,
    pub granted: bool,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RatingRequest {
    pub score: i64,
    pub comment: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DateRangeQuery {
    pub from: Option<String>,
    pub to: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct RevenueReport {
    pub completed_count: i64,
    pub revenue_cents: i64,
    pub commission_cents: i64,
    pub commission_pending_count: i64,
}

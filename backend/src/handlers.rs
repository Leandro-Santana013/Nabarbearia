use std::{collections::HashSet, str::FromStr, time::Duration};

use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, Path, Query, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    middleware,
    response::{IntoResponse, Response},
    routing::{get, patch, post, put},
};
use chrono::{
    DateTime, Datelike, Duration as ChronoDuration, LocalResult, NaiveDate, SecondsFormat,
    TimeZone, Timelike, Utc,
};
use chrono_tz::Tz;
use rusqlite::{OptionalExtension, TransactionBehavior, params};
use serde_json::json;
use tower_http::trace::TraceLayer;
use uuid::Uuid;

use crate::{
    AppState,
    error::{ApiResult, AppError},
    models::{
        AdminAppointmentRequest, AppointmentRequest, AppointmentResponse, AppointmentStatus,
        AuthContext, AuthResponse, AuthUser, AvailabilityQuery, AvailableSlot, BarberRequest,
        BarberResponse, BlockRequest, CancelRequest, CommissionRuleRequest, CommissionRuleType,
        CompleteRequest, ConsentRequest, DateRangeQuery, LoginRequest, MessageResponse,
        PublicBarberResponse, RatingRequest, RegisterRequest, RescheduleRequest, RevenueReport,
        Role, ScheduleRequest, ServiceRequest, ServiceResponse, SetupOwnerRequest,
        SetupStatusResponse,
    },
    security::{
        check_origin, constant_time_eq, csrf_token, hash_token, random_token, removal_cookie,
        session_cookie, session_token, verify_password,
    },
};

const MAX_BODY_BYTES: usize = 16 * 1024;
const MAX_APPOINTMENTS_PER_RESPONSE: usize = 500;

#[derive(Clone)]
struct SessionBundle {
    token: String,
    csrf_token: String,
    expires_at: DateTime<Utc>,
}

#[derive(Clone)]
struct ScheduleRow {
    barber_id: String,
    start_minute: i64,
    end_minute: i64,
}

#[derive(Clone)]
struct BusyInterval {
    barber_id: String,
    starts_at: DateTime<Utc>,
    ends_at: DateTime<Utc>,
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/api/v1/health", get(health))
        .route("/api/v1/setup/status", get(setup_status))
        .route("/api/v1/setup/owner", post(setup_owner))
        .route("/api/v1/auth/register", post(register))
        .route("/api/v1/auth/login", post(login))
        .route("/api/v1/auth/session", get(auth_session))
        .route("/api/v1/auth/logout", post(logout))
        .route("/api/v1/public/services", get(public_services))
        .route("/api/v1/public/barbers", get(public_barbers))
        .route("/api/v1/public/availability", get(public_availability))
        .route(
            "/api/v1/appointments",
            get(list_appointments).post(create_appointment),
        )
        .route(
            "/api/v1/appointments/{id}/reschedule",
            patch(reschedule_appointment),
        )
        .route("/api/v1/appointments/{id}/cancel", post(cancel_appointment))
        .route("/api/v1/appointments/{id}/start", post(start_execution))
        .route(
            "/api/v1/appointments/{id}/complete",
            post(complete_appointment),
        )
        .route(
            "/api/v1/appointments/{id}/no-show",
            post(no_show_appointment),
        )
        .route("/api/v1/appointments/{id}/rating", post(create_rating))
        .route("/api/v1/consents", post(record_consent))
        .route("/api/v1/admin/services", post(create_service))
        .route("/api/v1/admin/appointments", post(create_admin_appointment))
        .route("/api/v1/admin/services/{id}", put(update_service))
        .route("/api/v1/admin/barbers", post(create_barber))
        .route("/api/v1/admin/schedules", post(create_schedule))
        .route("/api/v1/admin/blocks", post(create_block))
        .route(
            "/api/v1/admin/commission-rules",
            post(create_commission_rule),
        )
        .route("/api/v1/admin/reports/revenue", get(revenue_report))
        .layer(DefaultBodyLimit::max(MAX_BODY_BYTES))
        .layer(middleware::map_response(add_security_headers))
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

async fn add_security_headers(mut response: Response) -> Response {
    let headers = response.headers_mut();
    headers.insert("cache-control", HeaderValue::from_static("no-store"));
    headers.insert(
        "x-content-type-options",
        HeaderValue::from_static("nosniff"),
    );
    headers.insert("x-frame-options", HeaderValue::from_static("DENY"));
    headers.insert("referrer-policy", HeaderValue::from_static("no-referrer"));
    headers.insert(
        "cross-origin-resource-policy",
        HeaderValue::from_static("same-origin"),
    );
    headers.insert(
        "content-security-policy",
        HeaderValue::from_static("default-src 'none'; frame-ancestors 'none'; base-uri 'none'"),
    );
    response
}

async fn health() -> impl IntoResponse {
    (StatusCode::OK, Json(json!({"status": "ok"})))
}

async fn setup_status(State(state): State<AppState>) -> ApiResult<Json<SetupStatusResponse>> {
    let needs_owner = state
        .db
        .with_conn(|connection| -> Result<_, AppError> {
            let owner_count: i64 = connection.query_row(
                "SELECT COUNT(*) FROM user_roles WHERE role = 'owner'",
                [],
                |row| row.get(0),
            )?;
            Ok(owner_count == 0)
        })
        .await?;
    Ok(Json(SetupStatusResponse { needs_owner }))
}

async fn setup_owner(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<SetupOwnerRequest>,
) -> ApiResult<(HeaderMap, Json<AuthResponse>)> {
    check_origin(&headers, &state.config.allowed_origins)?;
    let supplied = headers
        .get("x-bootstrap-token")
        .and_then(|value| value.to_str().ok())
        .ok_or_else(AppError::forbidden)?;
    if !constant_time_eq(supplied, &state.config.bootstrap_token) {
        return Err(AppError::forbidden());
    }

    let business_name = required_text(
        &request.business_name,
        2,
        120,
        "INVALID_BUSINESS",
        "Business name is invalid",
    )?;
    let timezone = valid_timezone(&request.timezone)?;
    if timezone != state.config.timezone {
        return Err(AppError::bad_request(
            "INVALID_TIMEZONE",
            "Setup timezone must match NABARBEARIA_TIMEZONE",
        ));
    }
    let email = email_address(&request.email)?;
    let display_name = required_text(
        &request.display_name,
        2,
        120,
        "INVALID_NAME",
        "Display name is invalid",
    )?;
    let password = password_value(&request.password)?;
    let password_hash = crate::security::hash_password(password).await?;
    let now = utc_text(Utc::now());
    let business_id = new_id();
    let owner_id = new_id();
    let business_for_tx = business_id.clone();
    let owner_for_tx = owner_id.clone();
    let email_for_tx = email.clone();
    let display_name_for_tx = display_name.clone();
    state
        .db
        .with_conn(move |connection| -> Result<_, AppError> {
            let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
            let owner_count: i64 = transaction.query_row(
                "SELECT COUNT(*) FROM user_roles WHERE role = 'owner'", [], |row| row.get(0),
            )?;
            let business_count: i64 =
                transaction.query_row("SELECT COUNT(*) FROM businesses", [], |row| row.get(0))?;
            let bootstrapped: i64 = transaction.query_row(
                "SELECT EXISTS(SELECT 1 FROM security_state WHERE id = 1 AND bootstrap_completed_at_utc IS NOT NULL)",
                [],
                |row| row.get(0),
            )?;
            if owner_count > 0 || business_count > 0 || bootstrapped != 0 {
                return Err(AppError::conflict("ALREADY_CONFIGURED", "Owner setup has already completed"));
            }
            transaction.execute(
                "INSERT INTO businesses(id, name, timezone, created_at_utc, updated_at_utc) VALUES (?1, ?2, ?3, ?4, ?4)",
                params![business_for_tx, business_name, timezone, now],
            )?;
            transaction.execute(
                "INSERT INTO users(id, business_id, email, password_hash, display_name, created_at_utc, updated_at_utc) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
                params![owner_for_tx, business_for_tx, email_for_tx, password_hash, display_name_for_tx, now],
            )?;
            transaction.execute(
                "INSERT INTO user_roles(business_id, user_id, role, created_at_utc) VALUES (?1, ?2, 'owner', ?3)",
                params![business_for_tx, owner_for_tx, now],
            )?;
            transaction.execute(
                "INSERT INTO security_state(id, bootstrap_completed_at_utc) VALUES (1, ?1)",
                params![now],
            )?;
            insert_audit(&transaction, &business_for_tx, Some(&owner_for_tx), "setup.owner_created", "business", &business_for_tx, "{}")?;
            transaction.commit()?;
            Ok(())
        })
        .await?;

    let user = AuthUser {
        id: owner_id,
        business_id,
        email,
        display_name,
        roles: vec![Role::Owner],
    };
    let session = create_session(&state, &user).await?;
    auth_json_response(&state, user, session)
}

async fn register(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<RegisterRequest>,
) -> ApiResult<(HeaderMap, Json<AuthResponse>)> {
    check_origin(&headers, &state.config.allowed_origins)?;
    let email = email_address(&request.email)?;
    if !state
        .limiter
        .check(&format!("register:{email}"), 6, Duration::from_secs(60))
        || !state
            .limiter
            .check("register:global", 120, Duration::from_secs(60))
    {
        return Err(AppError::too_many_requests());
    }
    let display_name = required_text(
        &request.display_name,
        2,
        120,
        "INVALID_NAME",
        "Display name is invalid",
    )?;
    let password = password_value(&request.password)?;
    let password_hash = crate::security::hash_password(password).await?;
    let user_id = new_id();
    let now = utc_text(Utc::now());
    let email_for_tx = email.clone();
    let name_for_tx = display_name.clone();
    let user_for_tx = user_id.clone();
    let business_id = state
        .db
        .with_conn(move |connection| -> Result<_, AppError> {
            let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
            let business_id = single_active_business(&transaction)?;
            let exists: i64 = transaction.query_row(
                "SELECT EXISTS(SELECT 1 FROM users WHERE business_id = ?1 AND email = ?2)",
                params![business_id, email_for_tx],
                |row| row.get(0),
            )?;
            if exists != 0 {
                return Err(AppError::conflict("ACCOUNT_NOT_AVAILABLE", "Account is not available"));
            }
            transaction.execute(
                "INSERT INTO users(id, business_id, email, password_hash, display_name, created_at_utc, updated_at_utc) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
                params![user_for_tx, business_id, email_for_tx, password_hash, name_for_tx, now],
            )?;
            transaction.execute(
                "INSERT INTO user_roles(business_id, user_id, role, created_at_utc) VALUES (?1, ?2, 'client', ?3)",
                params![business_id, user_for_tx, now],
            )?;
            insert_audit(&transaction, &business_id, Some(&user_for_tx), "auth.client_registered", "user", &user_for_tx, "{}")?;
            transaction.commit()?;
            Ok(business_id)
        })
        .await?;
    let user = AuthUser {
        id: user_id,
        business_id,
        email,
        display_name,
        roles: vec![Role::Client],
    };
    let session = create_session(&state, &user).await?;
    auth_json_response(&state, user, session)
}

async fn login(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<LoginRequest>,
) -> ApiResult<(HeaderMap, Json<AuthResponse>)> {
    check_origin(&headers, &state.config.allowed_origins)?;
    let email = email_address(&request.email)?;
    if !state
        .limiter
        .check(&format!("login:{email}"), 10, Duration::from_secs(60))
        || !state
            .limiter
            .check("login:global", 240, Duration::from_secs(60))
    {
        return Err(AppError::too_many_requests());
    }
    let password = password_value(&request.password)?;
    let email_for_query = email.clone();
    let candidate = state
        .db
        .with_conn(move |connection| -> Result<_, AppError> {
            let business_id = single_active_business(connection)?;
            let result = connection
                .query_row(
                    "SELECT id, password_hash, display_name FROM users WHERE business_id = ?1 AND email = ?2 AND active = 1",
                    params![business_id, email_for_query],
                    |row| Ok((business_id.clone(), row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?)),
                )
                .optional()?;
            Ok(result)
        })
        .await?;

    let Some((business_id, user_id, password_hash, display_name)) = candidate else {
        // Perform a comparable Argon2 operation to reduce account-enumeration timing signal.
        let _ = crate::security::hash_password(password).await?;
        return Err(AppError::unauthorized());
    };
    if !verify_password(password, password_hash).await? {
        return Err(AppError::unauthorized());
    }
    let roles = load_roles(&state, &business_id, &user_id).await?;
    let user = AuthUser {
        id: user_id,
        business_id,
        email,
        display_name,
        roles,
    };
    let session = create_session(&state, &user).await?;
    auth_json_response(&state, user, session)
}

async fn auth_session(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<AuthResponse>> {
    let context = authenticate(&state, &headers).await?;
    let csrf = random_token().map_err(|_| AppError::Internal)?;
    let csrf_hash = hash_token(&csrf);
    let token_hash = context.token_hash.clone();
    state
        .db
        .with_conn(move |connection| -> Result<_, AppError> {
            let changed = connection.execute(
                "UPDATE sessions SET csrf_hash = ?1 WHERE token_hash = ?2 AND revoked_at_utc IS NULL",
                params![csrf_hash, token_hash],
            )?;
            if changed != 1 {
                return Err(AppError::unauthorized());
            }
            Ok(())
        })
        .await?;
    let expires_at = session_expiry(&state, &context.token_hash).await?;
    Ok(Json(AuthResponse {
        user: context.user,
        csrf_token: csrf,
        expires_at,
    }))
}

async fn logout(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<(HeaderMap, Json<MessageResponse>)> {
    let context = authenticate(&state, &headers).await?;
    require_mutation(&state, &headers, &context)?;
    let token_hash = context.token_hash;
    let now = utc_text(Utc::now());
    state
        .db
        .with_conn(move |connection| -> Result<_, AppError> {
            connection.execute(
                "UPDATE sessions SET revoked_at_utc = ?1 WHERE token_hash = ?2 AND revoked_at_utc IS NULL",
                params![now, token_hash],
            )?;
            Ok(())
        })
        .await?;
    let mut response_headers = HeaderMap::new();
    response_headers.insert(
        header::SET_COOKIE,
        HeaderValue::from_str(&removal_cookie(state.config.secure_cookies))
            .map_err(|_| AppError::Internal)?,
    );
    Ok((
        response_headers,
        Json(MessageResponse {
            message: "Signed out",
        }),
    ))
}

async fn authenticate(state: &AppState, headers: &HeaderMap) -> Result<AuthContext, AppError> {
    let raw_token = session_token(headers).ok_or_else(AppError::unauthorized)?;
    if raw_token.len() > 128 {
        return Err(AppError::unauthorized());
    }
    let token_hash = hash_token(&raw_token);
    let token_hash_for_query = token_hash.clone();
    let now = utc_text(Utc::now());
    let (business_id, user_id, email, display_name, csrf_hash) = state
        .db
        .with_conn(move |connection| -> Result<_, AppError> {
            connection
                .query_row(
                    "SELECT s.business_id, u.id, u.email, u.display_name, s.csrf_hash
                     FROM sessions s JOIN users u ON u.id = s.user_id AND u.business_id = s.business_id
                     JOIN businesses b ON b.id = s.business_id
                     WHERE s.token_hash = ?1 AND s.revoked_at_utc IS NULL AND s.expires_at_utc > ?2
                       AND u.active = 1 AND b.active = 1",
                    params![token_hash_for_query, now],
                    |row| Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, String>(4)?,
                    )),
                )
                .optional()?
                .ok_or_else(AppError::unauthorized)
        })
        .await?;
    let roles = load_roles(state, &business_id, &user_id).await?;
    if roles.is_empty() {
        return Err(AppError::unauthorized());
    }
    Ok(AuthContext {
        user: AuthUser {
            id: user_id,
            business_id,
            email,
            display_name,
            roles,
        },
        token_hash,
        csrf_hash,
    })
}

async fn load_roles(
    state: &AppState,
    business_id: &str,
    user_id: &str,
) -> Result<Vec<Role>, AppError> {
    let business_id = business_id.to_string();
    let user_id = user_id.to_string();
    state
        .db
        .with_conn(move |connection| -> Result<_, AppError> {
            let mut statement = connection.prepare(
                "SELECT role FROM user_roles WHERE business_id = ?1 AND user_id = ?2 ORDER BY role",
            )?;
            let values = statement
                .query_map(params![business_id, user_id], |row| row.get::<_, String>(0))?
                .collect::<Result<Vec<_>, _>>()?;
            values
                .iter()
                .map(|value| Role::from_db(value).ok_or(AppError::Internal))
                .collect()
        })
        .await
}

async fn create_session(state: &AppState, user: &AuthUser) -> Result<SessionBundle, AppError> {
    let token = random_token().map_err(|_| AppError::Internal)?;
    let csrf_token = random_token().map_err(|_| AppError::Internal)?;
    let token_hash = hash_token(&token);
    let csrf_hash = hash_token(&csrf_token);
    let expires_at = Utc::now() + ChronoDuration::days(state.config.session_days);
    let expires_text = utc_text(expires_at);
    let now = utc_text(Utc::now());
    let business_id = user.business_id.clone();
    let user_id = user.id.clone();
    state
        .db
        .with_conn(move |connection| -> Result<_, AppError> {
            let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
            transaction.execute(
                "DELETE FROM sessions WHERE expires_at_utc <= ?1 OR revoked_at_utc IS NOT NULL",
                params![now],
            )?;
            transaction.execute(
                "DELETE FROM sessions WHERE token_hash IN (
                    SELECT token_hash FROM sessions
                    WHERE business_id = ?1 AND user_id = ?2 AND revoked_at_utc IS NULL
                    ORDER BY created_at_utc ASC
                    LIMIT -1 OFFSET 9
                 )",
                params![business_id, user_id],
            )?;
            transaction.execute(
                "INSERT INTO sessions(token_hash, business_id, user_id, csrf_hash, created_at_utc, expires_at_utc)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![token_hash, business_id, user_id, csrf_hash, now, expires_text],
            )?;
            transaction.commit()?;
            Ok(())
        })
        .await?;
    Ok(SessionBundle {
        token,
        csrf_token,
        expires_at,
    })
}

async fn session_expiry(state: &AppState, token_hash: &str) -> Result<DateTime<Utc>, AppError> {
    let token_hash = token_hash.to_string();
    let value = state
        .db
        .with_conn(move |connection| -> Result<_, AppError> {
            connection
                .query_row(
                    "SELECT expires_at_utc FROM sessions WHERE token_hash = ?1",
                    params![token_hash],
                    |row| row.get::<_, String>(0),
                )
                .optional()?
                .ok_or_else(AppError::unauthorized)
        })
        .await?;
    parse_database_utc(&value)
}

fn auth_json_response(
    state: &AppState,
    user: AuthUser,
    session: SessionBundle,
) -> ApiResult<(HeaderMap, Json<AuthResponse>)> {
    let mut headers = HeaderMap::new();
    headers.insert(
        header::SET_COOKIE,
        HeaderValue::from_str(&session_cookie(
            &session.token,
            state.config.secure_cookies,
            state.config.session_days * 86_400,
        ))
        .map_err(|_| AppError::Internal)?,
    );
    Ok((
        headers,
        Json(AuthResponse {
            user,
            csrf_token: session.csrf_token,
            expires_at: session.expires_at,
        }),
    ))
}

fn require_mutation(
    state: &AppState,
    headers: &HeaderMap,
    context: &AuthContext,
) -> Result<(), AppError> {
    check_origin(headers, &state.config.allowed_origins)?;
    let provided = csrf_token(headers).ok_or_else(AppError::forbidden)?;
    if !constant_time_eq(&hash_token(provided), &context.csrf_hash) {
        return Err(AppError::forbidden());
    }
    Ok(())
}

fn require_role(context: &AuthContext, role: Role) -> Result<(), AppError> {
    if context.user.roles.contains(&role) {
        Ok(())
    } else {
        Err(AppError::forbidden())
    }
}

fn is_owner(context: &AuthContext) -> bool {
    context.user.roles.contains(&Role::Owner)
}

fn new_id() -> String {
    Uuid::now_v7().to_string()
}

fn utc_text(value: DateTime<Utc>) -> String {
    value.to_rfc3339_opts(SecondsFormat::Secs, true)
}

fn parse_database_utc(value: &str) -> Result<DateTime<Utc>, AppError> {
    DateTime::parse_from_rfc3339(value)
        .map_err(|_| AppError::Internal)
        .map(|value| value.with_timezone(&Utc))
}

fn parse_input_utc(value: &str) -> Result<DateTime<Utc>, AppError> {
    if value.len() > 40 {
        return Err(AppError::bad_request(
            "INVALID_TIMESTAMP",
            "Timestamp must be RFC3339 UTC",
        ));
    }
    let parsed = DateTime::parse_from_rfc3339(value)
        .map_err(|_| AppError::bad_request("INVALID_TIMESTAMP", "Timestamp must be RFC3339 UTC"))?;
    if parsed.offset().local_minus_utc() != 0 || parsed.second() != 0 || parsed.nanosecond() != 0 {
        return Err(AppError::bad_request(
            "INVALID_TIMESTAMP",
            "Timestamp must be UTC and aligned to a minute",
        ));
    }
    Ok(parsed.with_timezone(&Utc))
}

fn required_text(
    value: &str,
    min: usize,
    max: usize,
    code: &'static str,
    message: &'static str,
) -> Result<String, AppError> {
    let cleaned = value.trim();
    let length = cleaned.chars().count();
    if length < min || length > max || cleaned.chars().any(char::is_control) {
        return Err(AppError::bad_request(code, message));
    }
    Ok(cleaned.to_string())
}

fn optional_text(
    value: Option<&str>,
    max: usize,
    code: &'static str,
    message: &'static str,
) -> Result<String, AppError> {
    let cleaned = value.unwrap_or_default().trim();
    if cleaned.chars().count() > max || cleaned.chars().any(char::is_control) {
        return Err(AppError::bad_request(code, message));
    }
    Ok(cleaned.to_string())
}

fn email_address(value: &str) -> Result<String, AppError> {
    let email = value.trim().to_ascii_lowercase();
    let valid = email.len() <= 254
        && email.len() >= 3
        && !email.chars().any(char::is_whitespace)
        && email.matches('@').count() == 1
        && email.split_once('@').is_some_and(|(local, domain)| {
            !local.is_empty()
                && domain.contains('.')
                && !domain.starts_with('.')
                && !domain.ends_with('.')
        });
    if !valid {
        return Err(AppError::bad_request("INVALID_EMAIL", "Email is invalid"));
    }
    Ok(email)
}

fn password_value(value: &str) -> Result<String, AppError> {
    let length = value.chars().count();
    if !(12..=128).contains(&length) || value.chars().any(char::is_control) {
        return Err(AppError::bad_request(
            "INVALID_PASSWORD",
            "Password must contain 12 to 128 printable characters",
        ));
    }
    Ok(value.to_string())
}

fn valid_timezone(value: &str) -> Result<String, AppError> {
    let timezone = value.trim();
    Tz::from_str(timezone).map_err(|_| {
        AppError::bad_request("INVALID_TIMEZONE", "Timezone must be a valid IANA name")
    })?;
    Ok(timezone.to_string())
}

fn valid_id(value: &str) -> Result<String, AppError> {
    Uuid::parse_str(value)
        .map_err(|_| AppError::bad_request("INVALID_ID", "Identifier is invalid"))?;
    Ok(value.to_string())
}

fn idempotency_key(headers: &HeaderMap) -> Result<String, AppError> {
    let value = headers
        .get("idempotency-key")
        .and_then(|header| header.to_str().ok())
        .ok_or_else(|| {
            AppError::bad_request("IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required")
        })?;
    if !(16..=128).contains(&value.len())
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        return Err(AppError::bad_request(
            "INVALID_IDEMPOTENCY_KEY",
            "Idempotency-Key is invalid",
        ));
    }
    Ok(value.to_string())
}

fn single_active_business(connection: &rusqlite::Connection) -> Result<String, AppError> {
    let mut statement = connection
        .prepare("SELECT id FROM businesses WHERE active = 1 ORDER BY created_at_utc LIMIT 2")?;
    let values = statement
        .query_map([], |row| row.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    match values.as_slice() {
        [business_id] => Ok(business_id.clone()),
        [] => Err(AppError::not_found(
            "SETUP_REQUIRED",
            "Owner setup is required",
        )),
        _ => Err(AppError::Internal),
    }
}

fn insert_audit(
    connection: &rusqlite::Connection,
    business_id: &str,
    actor_user_id: Option<&str>,
    action: &str,
    entity_type: &str,
    entity_id: &str,
    metadata_json: &str,
) -> Result<(), AppError> {
    connection.execute(
        "INSERT INTO audit_log(id, business_id, actor_user_id, action, entity_type, entity_id, metadata_json, created_at_utc)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![new_id(), business_id, actor_user_id, action, entity_type, entity_id, metadata_json, utc_text(Utc::now())],
    )?;
    Ok(())
}

async fn public_services(State(state): State<AppState>) -> ApiResult<Json<Vec<ServiceResponse>>> {
    let services = state
        .db
        .with_conn(|connection| -> Result<_, AppError> {
            let business_id = match single_active_business(connection) {
                Ok(value) => value,
                Err(AppError::Api { code: "SETUP_REQUIRED", .. }) => return Ok(Vec::new()),
                Err(error) => return Err(error),
            };
            let mut statement = connection.prepare(
                "SELECT id, name, description, category, price_cents, duration_minutes, active
                 FROM services WHERE business_id = ?1 AND active = 1 ORDER BY category COLLATE NOCASE, name COLLATE NOCASE LIMIT 100",
            )?;
            statement
                .query_map(params![business_id], |row| {
                    Ok(ServiceResponse {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        description: row.get(2)?,
                        category: row.get(3)?,
                        price_cents: row.get(4)?,
                        duration_minutes: row.get(5)?,
                        active: row.get::<_, i64>(6)? != 0,
                    })
                })?
                .collect::<Result<Vec<_>, _>>()
                .map_err(AppError::from)
        })
        .await?;
    Ok(Json(services))
}

async fn public_barbers(
    State(state): State<AppState>,
) -> ApiResult<Json<Vec<PublicBarberResponse>>> {
    let barbers = state
        .db
        .with_conn(|connection| -> Result<_, AppError> {
            let business_id = match single_active_business(connection) {
                Ok(value) => value,
                Err(AppError::Api { code: "SETUP_REQUIRED", .. }) => return Ok(Vec::new()),
                Err(error) => return Err(error),
            };
            let mut statement = connection.prepare(
                "SELECT u.id, u.display_name, p.photo_url, p.recommendations
                 FROM barber_profiles p JOIN users u ON u.id = p.user_id AND u.business_id = p.business_id
                 WHERE p.business_id = ?1 AND p.active = 1 AND u.active = 1
                 ORDER BY u.display_name COLLATE NOCASE LIMIT 100",
            )?;
            statement
                .query_map(params![business_id], |row| {
                    Ok(PublicBarberResponse {
                        id: row.get(0)?,
                        display_name: row.get(1)?,
                        photo_url: row.get(2)?,
                        recommendations: row.get(3)?,
                    })
                })?
                .collect::<Result<Vec<_>, _>>()
                .map_err(AppError::from)
        })
        .await?;
    Ok(Json(barbers))
}

async fn create_service(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<ServiceRequest>,
) -> ApiResult<(StatusCode, Json<ServiceResponse>)> {
    let context = authenticate(&state, &headers).await?;
    require_mutation(&state, &headers, &context)?;
    require_role(&context, Role::Owner)?;
    let service = service_input_to_response(new_id(), request)?;
    let service_for_tx = service.clone();
    let business_id = context.user.business_id.clone();
    let actor_id = context.user.id.clone();
    state
        .db
        .with_conn(move |connection| -> Result<_, AppError> {
            let now = utc_text(Utc::now());
            connection.execute(
                "INSERT INTO services(id, business_id, name, description, category, price_cents, duration_minutes, active, created_at_utc, updated_at_utc)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)",
                params![
                    service_for_tx.id,
                    business_id,
                    service_for_tx.name,
                    service_for_tx.description,
                    service_for_tx.category,
                    service_for_tx.price_cents,
                    service_for_tx.duration_minutes,
                    if service_for_tx.active { 1 } else { 0 },
                    now,
                ],
            )?;
            insert_audit(connection, &business_id, Some(&actor_id), "service.created", "service", &service_for_tx.id, "{}")?;
            Ok(())
        })
        .await?;
    Ok((StatusCode::CREATED, Json(service)))
}

async fn update_service(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(request): Json<ServiceRequest>,
) -> ApiResult<Json<ServiceResponse>> {
    let context = authenticate(&state, &headers).await?;
    require_mutation(&state, &headers, &context)?;
    require_role(&context, Role::Owner)?;
    let id = valid_id(&id)?;
    let service = service_input_to_response(id.clone(), request)?;
    let business_id = context.user.business_id.clone();
    let actor_id = context.user.id.clone();
    let service_for_tx = service.clone();
    state
        .db
        .with_conn(move |connection| -> Result<_, AppError> {
            let changed = connection.execute(
                "UPDATE services SET name = ?1, description = ?2, category = ?3, price_cents = ?4, duration_minutes = ?5, active = ?6, updated_at_utc = ?7
                 WHERE business_id = ?8 AND id = ?9",
                params![
                    service_for_tx.name,
                    service_for_tx.description,
                    service_for_tx.category,
                    service_for_tx.price_cents,
                    service_for_tx.duration_minutes,
                    if service_for_tx.active { 1 } else { 0 },
                    utc_text(Utc::now()),
                    business_id,
                    service_for_tx.id,
                ],
            )?;
            if changed != 1 {
                return Err(AppError::not_found("SERVICE_NOT_FOUND", "Service was not found"));
            }
            insert_audit(connection, &business_id, Some(&actor_id), "service.updated", "service", &service_for_tx.id, "{}")?;
            Ok(())
        })
        .await?;
    Ok(Json(service))
}

fn service_input_to_response(
    id: String,
    request: ServiceRequest,
) -> Result<ServiceResponse, AppError> {
    let name = required_text(
        &request.name,
        2,
        120,
        "INVALID_SERVICE",
        "Service name is invalid",
    )?;
    let description = optional_text(
        request.description.as_deref(),
        1000,
        "INVALID_SERVICE",
        "Service description is invalid",
    )?;
    let category = required_text(
        request.category.as_deref().unwrap_or("Serviços"),
        2,
        80,
        "INVALID_SERVICE",
        "Service category is invalid",
    )?;
    if !(0..=100_000_000).contains(&request.price_cents)
        || !(5..=720).contains(&request.duration_minutes)
    {
        return Err(AppError::bad_request(
            "INVALID_SERVICE",
            "Service price or duration is invalid",
        ));
    }
    Ok(ServiceResponse {
        id,
        name,
        description,
        category,
        price_cents: request.price_cents,
        duration_minutes: request.duration_minutes,
        active: request.active.unwrap_or(true),
    })
}

async fn create_barber(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<BarberRequest>,
) -> ApiResult<(StatusCode, Json<BarberResponse>)> {
    let context = authenticate(&state, &headers).await?;
    require_mutation(&state, &headers, &context)?;
    require_role(&context, Role::Owner)?;
    let email = email_address(&request.email)?;
    let display_name = required_text(
        &request.display_name,
        2,
        120,
        "INVALID_NAME",
        "Display name is invalid",
    )?;
    let photo_url = request
        .photo_url
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned);
    if let Some(url) = &photo_url
        && (url.len() > 1000 || !url.starts_with("https://"))
    {
        return Err(AppError::bad_request(
            "INVALID_PHOTO_URL",
            "Photo URL must be an HTTPS URL with at most 1000 characters",
        ));
    }
    let password = password_value(&request.password)?;
    let password_hash = crate::security::hash_password(password).await?;
    let barber_id = new_id();
    let business_id = context.user.business_id.clone();
    let actor_id = context.user.id.clone();
    let email_for_tx = email.clone();
    let name_for_tx = display_name.clone();
    let barber_for_tx = barber_id.clone();
    let photo_for_tx = photo_url.clone();
    state
        .db
        .with_conn(move |connection| -> Result<_, AppError> {
            let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
            let exists: i64 = transaction.query_row(
                "SELECT EXISTS(SELECT 1 FROM users WHERE business_id = ?1 AND email = ?2)",
                params![business_id, email_for_tx],
                |row| row.get(0),
            )?;
            if exists != 0 {
                return Err(AppError::conflict("ACCOUNT_NOT_AVAILABLE", "Account is not available"));
            }
            let now = utc_text(Utc::now());
            transaction.execute(
                "INSERT INTO users(id, business_id, email, password_hash, display_name, created_at_utc, updated_at_utc) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
                params![barber_for_tx, business_id, email_for_tx, password_hash, name_for_tx, now],
            )?;
            transaction.execute(
                "INSERT INTO user_roles(business_id, user_id, role, created_at_utc) VALUES (?1, ?2, 'barber', ?3)",
                params![business_id, barber_for_tx, now],
            )?;
            transaction.execute(
                "INSERT INTO barber_profiles(business_id, user_id, photo_url, created_at_utc, updated_at_utc) VALUES (?1, ?2, ?3, ?4, ?4)",
                params![business_id, barber_for_tx, photo_for_tx, now],
            )?;
            insert_audit(&transaction, &business_id, Some(&actor_id), "barber.created", "user", &barber_for_tx, "{}")?;
            transaction.commit()?;
            Ok(())
        })
        .await?;
    Ok((
        StatusCode::CREATED,
        Json(BarberResponse {
            id: barber_id,
            display_name,
            email,
            active: true,
            photo_url,
        }),
    ))
}

async fn create_schedule(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<ScheduleRequest>,
) -> ApiResult<(StatusCode, Json<MessageResponse>)> {
    let context = authenticate(&state, &headers).await?;
    require_mutation(&state, &headers, &context)?;
    require_role(&context, Role::Owner)?;
    let barber_id = valid_id(&request.barber_user_id)?;
    if !(0..=6).contains(&request.weekday)
        || !(0..=1439).contains(&request.start_minute)
        || !(1..=1440).contains(&request.end_minute)
        || request.end_minute <= request.start_minute
    {
        return Err(AppError::bad_request(
            "INVALID_SCHEDULE",
            "Schedule interval is invalid",
        ));
    }
    let business_id = context.user.business_id.clone();
    let actor_id = context.user.id.clone();
    state
        .db
        .with_conn(move |connection| -> Result<_, AppError> {
            let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
            ensure_active_barber(&transaction, &business_id, &barber_id)?;
            let overlap: i64 = transaction.query_row(
                "SELECT EXISTS(SELECT 1 FROM weekly_schedules
                 WHERE business_id = ?1 AND barber_user_id = ?2 AND weekday = ?3 AND active = 1
                   AND start_minute < ?4 AND end_minute > ?5)",
                params![business_id, barber_id, request.weekday, request.end_minute, request.start_minute],
                |row| row.get(0),
            )?;
            if overlap != 0 {
                return Err(AppError::conflict("SCHEDULE_OVERLAP", "Schedule overlaps an existing interval"));
            }
            let schedule_id = new_id();
            transaction.execute(
                "INSERT INTO weekly_schedules(id, business_id, barber_user_id, weekday, start_minute, end_minute, created_at_utc)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![schedule_id, business_id, barber_id, request.weekday, request.start_minute, request.end_minute, utc_text(Utc::now())],
            )?;
            insert_audit(&transaction, &business_id, Some(&actor_id), "schedule.created", "weekly_schedule", &schedule_id, "{}")?;
            transaction.commit()?;
            Ok(())
        })
        .await?;
    Ok((
        StatusCode::CREATED,
        Json(MessageResponse {
            message: "Schedule created",
        }),
    ))
}

async fn create_block(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<BlockRequest>,
) -> ApiResult<(StatusCode, Json<MessageResponse>)> {
    let context = authenticate(&state, &headers).await?;
    require_mutation(&state, &headers, &context)?;
    require_role(&context, Role::Owner)?;
    let barber_id = valid_id(&request.barber_user_id)?;
    let starts_at = parse_input_utc(&request.starts_at_utc)?;
    let ends_at = parse_input_utc(&request.ends_at_utc)?;
    if ends_at <= starts_at || ends_at - starts_at > ChronoDuration::days(366) {
        return Err(AppError::bad_request(
            "INVALID_BLOCK",
            "Block interval is invalid",
        ));
    }
    let reason = optional_text(
        request.reason.as_deref(),
        500,
        "INVALID_BLOCK",
        "Block reason is invalid",
    )?;
    let business_id = context.user.business_id.clone();
    let actor_id = context.user.id.clone();
    let starts_text = utc_text(starts_at);
    let ends_text = utc_text(ends_at);
    state
        .db
        .with_conn(move |connection| -> Result<_, AppError> {
            let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
            ensure_active_barber(&transaction, &business_id, &barber_id)?;
            let overlap: i64 = transaction.query_row(
                "SELECT EXISTS(SELECT 1 FROM availability_blocks
                 WHERE business_id = ?1 AND barber_user_id = ?2 AND active = 1
                   AND starts_at_utc < ?3 AND ends_at_utc > ?4)",
                params![business_id, barber_id, ends_text, starts_text],
                |row| row.get(0),
            )?;
            if overlap != 0 {
                return Err(AppError::conflict("BLOCK_OVERLAP", "Block overlaps an existing block"));
            }
            let block_id = new_id();
            transaction.execute(
                "INSERT INTO availability_blocks(id, business_id, barber_user_id, starts_at_utc, ends_at_utc, reason, created_by_user_id, created_at_utc)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![block_id, business_id, barber_id, starts_text, ends_text, reason, actor_id, utc_text(Utc::now())],
            )?;
            insert_audit(&transaction, &business_id, Some(&actor_id), "availability_block.created", "availability_block", &block_id, "{}")?;
            transaction.commit()?;
            Ok(())
        })
        .await?;
    Ok((
        StatusCode::CREATED,
        Json(MessageResponse {
            message: "Block created",
        }),
    ))
}

async fn create_commission_rule(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<CommissionRuleRequest>,
) -> ApiResult<(StatusCode, Json<MessageResponse>)> {
    let context = authenticate(&state, &headers).await?;
    require_mutation(&state, &headers, &context)?;
    require_role(&context, Role::Owner)?;
    let barber_id = request
        .barber_user_id
        .as_deref()
        .map(valid_id)
        .transpose()?;
    let service_id = request.service_id.as_deref().map(valid_id).transpose()?;
    let priority = request.priority.unwrap_or(0);
    if !(-1000..=1000).contains(&priority)
        || request.amount < 0
        || request.amount > 100_000_000
        || matches!(request.rule_type, CommissionRuleType::Percent) && request.amount > 10_000
    {
        return Err(AppError::bad_request(
            "INVALID_COMMISSION_RULE",
            "Commission rule is invalid",
        ));
    }
    let valid_from = request
        .valid_from_utc
        .as_deref()
        .map(parse_input_utc)
        .transpose()?;
    let valid_until = request
        .valid_until_utc
        .as_deref()
        .map(parse_input_utc)
        .transpose()?;
    if valid_until.is_some_and(|end| valid_from.is_some_and(|start| end <= start)) {
        return Err(AppError::bad_request(
            "INVALID_COMMISSION_RULE",
            "Commission validity interval is invalid",
        ));
    }
    let business_id = context.user.business_id.clone();
    let actor_id = context.user.id.clone();
    let rule_id = new_id();
    let rule_type = request.rule_type.as_str();
    let valid_from = valid_from.map(utc_text);
    let valid_until = valid_until.map(utc_text);
    state
        .db
        .with_conn(move |connection| -> Result<_, AppError> {
            let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
            if let Some(ref barber_id) = barber_id {
                ensure_active_barber(&transaction, &business_id, barber_id)?;
            }
            if let Some(ref service_id) = service_id {
                let exists: i64 = transaction.query_row(
                    "SELECT EXISTS(SELECT 1 FROM services WHERE business_id = ?1 AND id = ?2)",
                    params![business_id, service_id],
                    |row| row.get(0),
                )?;
                if exists == 0 {
                    return Err(AppError::not_found("SERVICE_NOT_FOUND", "Service was not found"));
                }
            }
            let now = utc_text(Utc::now());
            transaction.execute(
                "INSERT INTO commission_rules(id, business_id, barber_user_id, service_id, rule_type, amount, priority, valid_from_utc, valid_until_utc, created_at_utc, updated_at_utc)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)",
                params![rule_id, business_id, barber_id, service_id, rule_type, request.amount, priority, valid_from, valid_until, now],
            )?;
            insert_audit(&transaction, &business_id, Some(&actor_id), "commission_rule.created", "commission_rule", &rule_id, "{}")?;
            transaction.commit()?;
            Ok(())
        })
        .await?;
    Ok((
        StatusCode::CREATED,
        Json(MessageResponse {
            message: "Commission rule created",
        }),
    ))
}

fn ensure_active_barber(
    connection: &rusqlite::Connection,
    business_id: &str,
    barber_id: &str,
) -> Result<(), AppError> {
    let exists: i64 = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM barber_profiles p JOIN users u ON u.id = p.user_id AND u.business_id = p.business_id
         WHERE p.business_id = ?1 AND p.user_id = ?2 AND p.active = 1 AND u.active = 1)",
        params![business_id, barber_id],
        |row| row.get(0),
    )?;
    if exists == 0 {
        return Err(AppError::not_found(
            "BARBER_NOT_FOUND",
            "Barber was not found",
        ));
    }
    Ok(())
}

async fn public_availability(
    State(state): State<AppState>,
    Query(query): Query<AvailabilityQuery>,
) -> ApiResult<Json<Vec<AvailableSlot>>> {
    let service_id = valid_id(&query.service_id)?;
    let barber_filter = query.barber_id.as_deref().map(valid_id).transpose()?;
    let date = NaiveDate::parse_from_str(&query.date, "%Y-%m-%d")
        .map_err(|_| AppError::bad_request("INVALID_DATE", "Date must use YYYY-MM-DD"))?;
    let today = Utc::now().date_naive();
    if date < today - ChronoDuration::days(1) || date > today + ChronoDuration::days(366) {
        return Err(AppError::bad_request(
            "INVALID_DATE",
            "Date is outside the supported booking window",
        ));
    }
    let (timezone, duration_minutes, barbers, schedules, busy) = state
        .db
        .with_conn(move |connection| -> Result<_, AppError> {
            let business_id = single_active_business(connection)?;
            let (timezone, duration_minutes): (String, i64) = connection
                .query_row(
                    "SELECT b.timezone, s.duration_minutes FROM businesses b JOIN services s ON s.business_id = b.id
                     WHERE b.id = ?1 AND s.id = ?2 AND s.active = 1",
                    params![business_id, service_id],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .optional()?
                .ok_or_else(|| AppError::not_found("SERVICE_NOT_FOUND", "Service was not found"))?;

            let mut barber_statement = connection.prepare(
                "SELECT p.user_id FROM barber_profiles p JOIN users u ON u.id = p.user_id AND u.business_id = p.business_id
                 WHERE p.business_id = ?1 AND p.active = 1 AND u.active = 1 AND (?2 IS NULL OR p.user_id = ?2)
                 ORDER BY p.user_id LIMIT 100",
            )?;
            let barbers = barber_statement
                .query_map(params![business_id, barber_filter], |row| row.get::<_, String>(0))?
                .collect::<Result<Vec<_>, _>>()?;
            if barbers.is_empty() {
                return Ok((timezone, duration_minutes, Vec::new(), Vec::new(), Vec::new()));
            }

            let tz = Tz::from_str(&timezone).map_err(|_| AppError::Internal)?;
            let day_start = local_time(tz, date, 0)?;
            let day_end = local_time(tz, date.succ_opt().ok_or(AppError::Internal)?, 0)?;
            let day_start_text = utc_text(day_start.with_timezone(&Utc));
            let day_end_text = utc_text(day_end.with_timezone(&Utc));
            let weekday = i64::from(date.weekday().num_days_from_sunday());
            let barber_ids = barbers.iter().cloned().collect::<HashSet<_>>();

            let mut schedule_statement = connection.prepare(
                "SELECT barber_user_id, start_minute, end_minute FROM weekly_schedules
                 WHERE business_id = ?1 AND weekday = ?2 AND active = 1 ORDER BY start_minute",
            )?;
            let schedules = schedule_statement
                .query_map(params![business_id, weekday], |row| {
                    Ok(ScheduleRow { barber_id: row.get(0)?, start_minute: row.get(1)?, end_minute: row.get(2)? })
                })?
                .collect::<Result<Vec<_>, _>>()?
                .into_iter()
                .filter(|row| barber_ids.contains(&row.barber_id))
                .collect::<Vec<_>>();

            let mut busy_statement = connection.prepare(
                "SELECT barber_user_id, starts_at_utc, ends_at_utc FROM availability_blocks
                 WHERE business_id = ?1 AND active = 1 AND starts_at_utc < ?2 AND ends_at_utc > ?3
                 UNION ALL
                 SELECT barber_user_id, starts_at_utc, ends_at_utc FROM appointments
                 WHERE business_id = ?1 AND status = 'confirmed' AND starts_at_utc < ?2 AND ends_at_utc > ?3",
            )?;
            let busy = busy_statement
                .query_map(params![business_id, day_end_text, day_start_text], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?))
                })?
                .collect::<Result<Vec<_>, _>>()?
                .into_iter()
                .filter(|(barber_id, _, _)| barber_ids.contains(barber_id))
                .map(|(barber_id, starts, ends)| {
                    Ok(BusyInterval {
                        barber_id,
                        starts_at: parse_database_utc(&starts)?,
                        ends_at: parse_database_utc(&ends)?,
                    })
                })
                .collect::<Result<Vec<_>, AppError>>()?;
            Ok((timezone, duration_minutes, barbers, schedules, busy))
        })
        .await?;

    let tz = Tz::from_str(&timezone).map_err(|_| AppError::Internal)?;
    let duration = ChronoDuration::minutes(duration_minutes);
    let now = Utc::now();
    let mut slots = Vec::new();
    let mut seen = HashSet::new();
    for schedule in schedules {
        let schedule_start = local_time(tz, date, schedule.start_minute)?;
        let schedule_end = local_time(tz, date, schedule.end_minute)?;
        let mut cursor = schedule_start;
        while cursor + duration <= schedule_end && slots.len() < MAX_APPOINTMENTS_PER_RESPONSE {
            let starts_at = cursor.with_timezone(&Utc);
            let ends_at = (cursor + duration).with_timezone(&Utc);
            let key = format!("{}:{}", schedule.barber_id, utc_text(starts_at));
            let has_conflict = busy.iter().any(|interval| {
                interval.barber_id == schedule.barber_id
                    && interval.starts_at < ends_at
                    && interval.ends_at > starts_at
            });
            if starts_at >= now && !has_conflict && seen.insert(key) {
                slots.push(AvailableSlot {
                    barber_id: schedule.barber_id.clone(),
                    starts_at,
                    ends_at,
                });
            }
            cursor += ChronoDuration::minutes(30);
        }
    }
    slots.sort_by(|left, right| {
        left.starts_at
            .cmp(&right.starts_at)
            .then(left.barber_id.cmp(&right.barber_id))
    });
    let _ = barbers; // Barbers without a weekly interval correctly yield no slot.
    Ok(Json(slots))
}

fn local_time(timezone: Tz, date: NaiveDate, minute: i64) -> Result<DateTime<Tz>, AppError> {
    let hour = u32::try_from(minute / 60).map_err(|_| AppError::Internal)?;
    let minute_part = u32::try_from(minute % 60).map_err(|_| AppError::Internal)?;
    let local = date
        .and_hms_opt(hour, minute_part, 0)
        .ok_or(AppError::Internal)?;
    match timezone.from_local_datetime(&local) {
        LocalResult::Single(value) => Ok(value),
        LocalResult::Ambiguous(_, _) | LocalResult::None => Err(AppError::bad_request(
            "UNAVAILABLE_DATE",
            "Date contains a timezone transition and cannot be booked automatically",
        )),
    }
}

async fn create_appointment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<AppointmentRequest>,
) -> ApiResult<(StatusCode, Json<AppointmentResponse>)> {
    let context = authenticate(&state, &headers).await?;
    require_mutation(&state, &headers, &context)?;
    require_role(&context, Role::Client)?;
    let idempotency_key = idempotency_key(&headers)?;
    let barber_id = valid_id(&request.barber_user_id)?;
    let service_id = valid_id(&request.service_id)?;
    let starts_at = parse_input_utc(&request.starts_at)?;
    if starts_at <= Utc::now() {
        return Err(AppError::bad_request(
            "INVALID_APPOINTMENT",
            "Appointment must be in the future",
        ));
    }
    let request_hash =
        hash_token(&serde_json::to_string(&request).map_err(|_| AppError::Internal)?);
    let business_id = context.user.business_id.clone();
    let client_id = context.user.id.clone();
    let starts_text = utc_text(starts_at);
    let appointment = state
        .db
        .with_conn(move |connection| -> Result<_, AppError> {
            let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
            if let Some((stored_hash, response_json)) = transaction
                .query_row(
                    "SELECT request_hash, response_json FROM idempotency_keys
                     WHERE business_id = ?1 AND user_id = ?2 AND endpoint = 'POST /appointments' AND idem_key = ?3",
                    params![business_id, client_id, idempotency_key],
                    |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
                )
                .optional()?
            {
                if !constant_time_eq(&stored_hash, &request_hash) {
                    return Err(AppError::conflict("IDEMPOTENCY_KEY_REUSED", "Idempotency-Key was already used with another request"));
                }
                let response = serde_json::from_str(&response_json).map_err(|_| AppError::Internal)?;
                return Ok(response);
            }
            let (price_cents, duration_minutes): (i64, i64) = transaction
                .query_row(
                    "SELECT price_cents, duration_minutes FROM services WHERE business_id = ?1 AND id = ?2 AND active = 1",
                    params![business_id, service_id],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .optional()?
                .ok_or_else(|| AppError::not_found("SERVICE_NOT_FOUND", "Service was not found"))?;
            let ends_at = starts_at + ChronoDuration::minutes(duration_minutes);
            ensure_slot_available(&transaction, &business_id, &barber_id, starts_at, ends_at, None)?;
            let appointment_id = new_id();
            let now = utc_text(Utc::now());
            let ends_text = utc_text(ends_at);
            transaction.execute(
                "INSERT INTO appointments(id, business_id, client_user_id, barber_user_id, service_id, starts_at_utc, ends_at_utc,
                  status, price_cents, duration_minutes, source, created_by_user_id, created_at_utc, updated_at_utc)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'confirmed', ?8, ?9, 'web', ?3, ?10, ?10)",
                params![appointment_id, business_id, client_id, barber_id, service_id, starts_text, ends_text, price_cents, duration_minutes, now],
            )?;
            insert_history(
                &transaction,
                &business_id,
                &appointment_id,
                Some(&client_id),
                "created",
                None,
                Some("confirmed"),
                None,
                Some(&starts_text),
                "",
            )?;
            insert_audit(&transaction, &business_id, Some(&client_id), "appointment.created", "appointment", &appointment_id, "{}")?;
            let response = AppointmentResponse {
                id: appointment_id.clone(),
                business_id: business_id.clone(),
                client_user_id: client_id.clone(),
                barber_user_id: barber_id.clone(),
                service_id: service_id.clone(),
                starts_at,
                ends_at,
                status: AppointmentStatus::Confirmed,
                price_cents,
                duration_minutes,
                client_display_name: None,
                barber_display_name: None,
                service_name: None,
            };
            let response_json = serde_json::to_string(&response).map_err(|_| AppError::Internal)?;
            transaction.execute(
                "INSERT INTO idempotency_keys(business_id, user_id, endpoint, idem_key, request_hash, response_json, response_status, appointment_id, created_at_utc)
                 VALUES (?1, ?2, 'POST /appointments', ?3, ?4, ?5, 201, ?6, ?7)",
                params![business_id, client_id, idempotency_key, request_hash, response_json, appointment_id, now],
            )?;
            transaction.commit()?;
            Ok(response)
        })
        .await?;
    Ok((StatusCode::CREATED, Json(appointment)))
}

async fn create_admin_appointment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<AdminAppointmentRequest>,
) -> ApiResult<(StatusCode, Json<AppointmentResponse>)> {
    let context = authenticate(&state, &headers).await?;
    require_mutation(&state, &headers, &context)?;
    require_role(&context, Role::Owner)?;
    let idempotency_key = idempotency_key(&headers)?;
    let client_id = valid_id(&request.client_user_id)?;
    let barber_id = valid_id(&request.barber_user_id)?;
    let service_id = valid_id(&request.service_id)?;
    let starts_at = parse_input_utc(&request.starts_at)?;
    if starts_at <= Utc::now() {
        return Err(AppError::bad_request(
            "INVALID_APPOINTMENT",
            "Appointment must be in the future",
        ));
    }
    let request_hash =
        hash_token(&serde_json::to_string(&request).map_err(|_| AppError::Internal)?);
    let business_id = context.user.business_id.clone();
    let actor_id = context.user.id.clone();
    let starts_text = utc_text(starts_at);
    let appointment = state
        .db
        .with_conn(move |connection| -> Result<_, AppError> {
            let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
            if let Some((stored_hash, response_json)) = transaction
                .query_row(
                    "SELECT request_hash, response_json FROM idempotency_keys
                     WHERE business_id = ?1 AND user_id = ?2 AND endpoint = 'POST /admin/appointments' AND idem_key = ?3",
                    params![business_id, actor_id, idempotency_key],
                    |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
                )
                .optional()?
            {
                if !constant_time_eq(&stored_hash, &request_hash) {
                    return Err(AppError::conflict(
                        "IDEMPOTENCY_KEY_REUSED",
                        "Idempotency-Key was already used with another request",
                    ));
                }
                return serde_json::from_str(&response_json).map_err(|_| AppError::Internal);
            }
            let client_exists: i64 = transaction.query_row(
                "SELECT EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id = u.id AND r.business_id = u.business_id
                 WHERE u.business_id = ?1 AND u.id = ?2 AND u.active = 1 AND r.role = 'client')",
                params![business_id, client_id],
                |row| row.get(0),
            )?;
            if client_exists == 0 {
                return Err(AppError::not_found("CLIENT_NOT_FOUND", "Client was not found"));
            }
            let (price_cents, duration_minutes): (i64, i64) = transaction
                .query_row(
                    "SELECT price_cents, duration_minutes FROM services WHERE business_id = ?1 AND id = ?2 AND active = 1",
                    params![business_id, service_id],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .optional()?
                .ok_or_else(|| AppError::not_found("SERVICE_NOT_FOUND", "Service was not found"))?;
            let ends_at = starts_at + ChronoDuration::minutes(duration_minutes);
            ensure_slot_available(&transaction, &business_id, &barber_id, starts_at, ends_at, None)?;
            let appointment_id = new_id();
            let now = utc_text(Utc::now());
            let ends_text = utc_text(ends_at);
            transaction.execute(
                "INSERT INTO appointments(id, business_id, client_user_id, barber_user_id, service_id, starts_at_utc, ends_at_utc,
                  status, price_cents, duration_minutes, source, created_by_user_id, created_at_utc, updated_at_utc)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'confirmed', ?8, ?9, 'owner', ?10, ?11, ?11)",
                params![appointment_id, business_id, client_id, barber_id, service_id, starts_text, ends_text, price_cents, duration_minutes, actor_id, now],
            )?;
            insert_history(
                &transaction,
                &business_id,
                &appointment_id,
                Some(&actor_id),
                "created",
                None,
                Some("confirmed"),
                None,
                Some(&starts_text),
                "",
            )?;
            insert_audit(
                &transaction,
                &business_id,
                Some(&actor_id),
                "appointment.created_by_owner",
                "appointment",
                &appointment_id,
                "{}",
            )?;
            let response = AppointmentResponse {
                id: appointment_id.clone(),
                business_id: business_id.clone(),
                client_user_id: client_id.clone(),
                barber_user_id: barber_id.clone(),
                service_id: service_id.clone(),
                starts_at,
                ends_at,
                status: AppointmentStatus::Confirmed,
                price_cents,
                duration_minutes,
                client_display_name: None,
                barber_display_name: None,
                service_name: None,
            };
            let response_json = serde_json::to_string(&response).map_err(|_| AppError::Internal)?;
            transaction.execute(
                "INSERT INTO idempotency_keys(business_id, user_id, endpoint, idem_key, request_hash, response_json, response_status, appointment_id, created_at_utc)
                 VALUES (?1, ?2, 'POST /admin/appointments', ?3, ?4, ?5, 201, ?6, ?7)",
                params![business_id, actor_id, idempotency_key, request_hash, response_json, appointment_id, now],
            )?;
            transaction.commit()?;
            Ok(response)
        })
        .await?;
    Ok((StatusCode::CREATED, Json(appointment)))
}

async fn list_appointments(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<DateRangeQuery>,
) -> ApiResult<Json<Vec<AppointmentResponse>>> {
    let context = authenticate(&state, &headers).await?;
    let from = query.from.as_deref().map(parse_input_utc).transpose()?;
    let to = query.to.as_deref().map(parse_input_utc).transpose()?;
    if to.is_some_and(|end| {
        from.as_ref()
            .is_some_and(|start| end <= *start || end - *start > ChronoDuration::days(366))
    }) {
        return Err(AppError::bad_request(
            "INVALID_RANGE",
            "Date range is invalid",
        ));
    }
    let from = from.map(utc_text);
    let to = to.map(utc_text);
    let business_id = context.user.business_id.clone();
    let user_id = context.user.id.clone();
    let scope = if is_owner(&context) {
        "owner"
    } else if context.user.roles.contains(&Role::Barber) {
        "barber"
    } else {
        "client"
    };
    let appointments = state
        .db
        .with_conn(move |connection| -> Result<_, AppError> {
            let clause = match scope {
                "owner" => "",
                "barber" => " AND a.barber_user_id = ?2",
                _ => " AND a.client_user_id = ?2",
            };
            let sql = format!(
                "SELECT a.id, a.business_id, a.client_user_id, a.barber_user_id, a.service_id, a.starts_at_utc, a.ends_at_utc, a.status, a.price_cents, a.duration_minutes,
                        client.display_name, barber.display_name, service.name
                 FROM appointments a
                 JOIN users client ON client.business_id = a.business_id AND client.id = a.client_user_id
                 JOIN users barber ON barber.business_id = a.business_id AND barber.id = a.barber_user_id
                 JOIN services service ON service.business_id = a.business_id AND service.id = a.service_id
                 WHERE a.business_id = ?1 {clause}
                 AND (?3 IS NULL OR a.starts_at_utc >= ?3) AND (?4 IS NULL OR a.starts_at_utc < ?4)
                 ORDER BY a.starts_at_utc DESC LIMIT {}",
                MAX_APPOINTMENTS_PER_RESPONSE
            );
            let mut statement = connection.prepare(&sql)?;
            let rows = statement
                .query_map(params![business_id, user_id, from, to], appointment_from_row)?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        })
        .await?;
    Ok(Json(appointments))
}

async fn reschedule_appointment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(request): Json<RescheduleRequest>,
) -> ApiResult<Json<AppointmentResponse>> {
    let context = authenticate(&state, &headers).await?;
    require_mutation(&state, &headers, &context)?;
    let appointment_id = valid_id(&id)?;
    let starts_at = parse_input_utc(&request.starts_at)?;
    if starts_at <= Utc::now() {
        return Err(AppError::bad_request(
            "INVALID_APPOINTMENT",
            "Appointment must be in the future",
        ));
    }
    let business_id = context.user.business_id.clone();
    let actor_id = context.user.id.clone();
    let actor_is_owner = is_owner(&context);
    let actor_is_client = context.user.roles.contains(&Role::Client);
    let result = state
        .db
        .with_conn(move |connection| -> Result<_, AppError> {
            let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
            let current = get_appointment(&transaction, &business_id, &appointment_id)?;
            if !(actor_is_owner || (actor_is_client && current.client_user_id == actor_id)) {
                return Err(AppError::forbidden());
            }
            if current.status != AppointmentStatus::Confirmed {
                return Err(AppError::conflict("INVALID_TRANSITION", "Only a confirmed appointment can be rescheduled"));
            }
            if current.starts_at == starts_at {
                return Ok(current);
            }
            let execution_exists: i64 = transaction.query_row(
                "SELECT EXISTS(SELECT 1 FROM service_executions WHERE business_id = ?1 AND appointment_id = ?2)",
                params![business_id, appointment_id],
                |row| row.get(0),
            )?;
            if execution_exists != 0 {
                return Err(AppError::conflict("INVALID_TRANSITION", "An appointment in execution cannot be rescheduled"));
            }
            let ends_at = starts_at + ChronoDuration::minutes(current.duration_minutes);
            ensure_slot_available(&transaction, &business_id, &current.barber_user_id, starts_at, ends_at, Some(&appointment_id))?;
            let starts_text = utc_text(starts_at);
            let ends_text = utc_text(ends_at);
            let now = utc_text(Utc::now());
            transaction.execute(
                "UPDATE appointments SET starts_at_utc = ?1, ends_at_utc = ?2, version = version + 1, updated_at_utc = ?3
                 WHERE business_id = ?4 AND id = ?5 AND status = 'confirmed'",
                params![starts_text, ends_text, now, business_id, appointment_id],
            )?;
            insert_history(
                &transaction,
                &business_id,
                &appointment_id,
                Some(&actor_id),
                "rescheduled",
                Some("confirmed"),
                Some("confirmed"),
                Some(&utc_text(current.starts_at)),
                Some(&starts_text),
                "",
            )?;
            insert_audit(&transaction, &business_id, Some(&actor_id), "appointment.rescheduled", "appointment", &appointment_id, "{}")?;
            transaction.commit()?;
            Ok(AppointmentResponse { starts_at, ends_at, ..current })
        })
        .await?;
    Ok(Json(result))
}

async fn cancel_appointment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(request): Json<CancelRequest>,
) -> ApiResult<Json<AppointmentResponse>> {
    let context = authenticate(&state, &headers).await?;
    require_mutation(&state, &headers, &context)?;
    let appointment_id = valid_id(&id)?;
    let reason = optional_text(
        request.reason.as_deref(),
        500,
        "INVALID_CANCELLATION",
        "Cancellation reason is invalid",
    )?;
    let business_id = context.user.business_id.clone();
    let actor_id = context.user.id.clone();
    let actor_is_owner = is_owner(&context);
    let actor_is_client = context.user.roles.contains(&Role::Client);
    let result = state
        .db
        .with_conn(move |connection| -> Result<_, AppError> {
            let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
            let current = get_appointment(&transaction, &business_id, &appointment_id)?;
            if !(actor_is_owner || (actor_is_client && current.client_user_id == actor_id)) {
                return Err(AppError::forbidden());
            }
            if current.status != AppointmentStatus::Confirmed {
                return Err(AppError::conflict("INVALID_TRANSITION", "Only a confirmed appointment can be cancelled"));
            }
            let now = utc_text(Utc::now());
            transaction.execute(
                "UPDATE appointments SET status = 'cancelled', cancellation_reason = ?1, cancelled_at_utc = ?2,
                 updated_at_utc = ?2, version = version + 1 WHERE business_id = ?3 AND id = ?4 AND status = 'confirmed'",
                params![reason, now, business_id, appointment_id],
            )?;
            insert_history(
                &transaction,
                &business_id,
                &appointment_id,
                Some(&actor_id),
                "cancelled",
                Some("confirmed"),
                Some("cancelled"),
                None,
                None,
                &reason,
            )?;
            insert_audit(&transaction, &business_id, Some(&actor_id), "appointment.cancelled", "appointment", &appointment_id, "{}")?;
            transaction.commit()?;
            Ok(AppointmentResponse { status: AppointmentStatus::Cancelled, ..current })
        })
        .await?;
    Ok(Json(result))
}

async fn start_execution(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> ApiResult<Json<MessageResponse>> {
    let context = authenticate(&state, &headers).await?;
    require_mutation(&state, &headers, &context)?;
    let appointment_id = valid_id(&id)?;
    let business_id = context.user.business_id.clone();
    let actor_id = context.user.id.clone();
    let actor_is_owner = is_owner(&context);
    let actor_is_barber = context.user.roles.contains(&Role::Barber);
    state
        .db
        .with_conn(move |connection| -> Result<_, AppError> {
            let transaction =
                connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
            let appointment = get_appointment(&transaction, &business_id, &appointment_id)?;
            if !(actor_is_owner || (actor_is_barber && appointment.barber_user_id == actor_id)) {
                return Err(AppError::forbidden());
            }
            if appointment.status != AppointmentStatus::Confirmed {
                return Err(AppError::conflict(
                    "INVALID_TRANSITION",
                    "Only a confirmed appointment can start",
                ));
            }
            let created = transaction.execute(
                "INSERT INTO service_executions(business_id, appointment_id, started_at_utc, notes)
                 VALUES (?1, ?2, ?3, '') ON CONFLICT(business_id, appointment_id) DO NOTHING",
                params![business_id, appointment_id, utc_text(Utc::now())],
            )?;
            if created != 0 {
                insert_audit(
                    &transaction,
                    &business_id,
                    Some(&actor_id),
                    "service_execution.started",
                    "appointment",
                    &appointment_id,
                    "{}",
                )?;
            }
            transaction.commit()?;
            Ok(())
        })
        .await?;
    Ok(Json(MessageResponse {
        message: "Execution started",
    }))
}

fn appointment_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<AppointmentResponse> {
    let status = row.get::<_, String>(7)?;
    let status = AppointmentStatus::from_db(&status).ok_or(rusqlite::Error::InvalidQuery)?;
    Ok(AppointmentResponse {
        id: row.get(0)?,
        business_id: row.get(1)?,
        client_user_id: row.get(2)?,
        barber_user_id: row.get(3)?,
        service_id: row.get(4)?,
        starts_at: row.get(5)?,
        ends_at: row.get(6)?,
        status,
        price_cents: row.get(8)?,
        duration_minutes: row.get(9)?,
        client_display_name: row.get(10)?,
        barber_display_name: row.get(11)?,
        service_name: row.get(12)?,
    })
}

fn get_appointment(
    connection: &rusqlite::Connection,
    business_id: &str,
    appointment_id: &str,
) -> Result<AppointmentResponse, AppError> {
    connection
        .query_row(
            "SELECT a.id, a.business_id, a.client_user_id, a.barber_user_id, a.service_id, a.starts_at_utc, a.ends_at_utc, a.status, a.price_cents, a.duration_minutes,
                    client.display_name, barber.display_name, service.name
             FROM appointments a
             JOIN users client ON client.business_id = a.business_id AND client.id = a.client_user_id
             JOIN users barber ON barber.business_id = a.business_id AND barber.id = a.barber_user_id
             JOIN services service ON service.business_id = a.business_id AND service.id = a.service_id
             WHERE a.business_id = ?1 AND a.id = ?2",
            params![business_id, appointment_id],
            appointment_from_row,
        )
        .optional()?
        .ok_or_else(|| AppError::not_found("APPOINTMENT_NOT_FOUND", "Appointment was not found"))
}

fn ensure_slot_available(
    connection: &rusqlite::Connection,
    business_id: &str,
    barber_id: &str,
    starts_at: DateTime<Utc>,
    ends_at: DateTime<Utc>,
    excluded_appointment_id: Option<&str>,
) -> Result<(), AppError> {
    if ends_at <= starts_at {
        return Err(AppError::bad_request(
            "INVALID_APPOINTMENT",
            "Appointment interval is invalid",
        ));
    }
    ensure_active_barber(connection, business_id, barber_id)?;
    let timezone: String = connection.query_row(
        "SELECT timezone FROM businesses WHERE id = ?1 AND active = 1",
        params![business_id],
        |row| row.get(0),
    )?;
    let timezone = Tz::from_str(&timezone).map_err(|_| AppError::Internal)?;
    let local_start = starts_at.with_timezone(&timezone);
    let local_end = ends_at.with_timezone(&timezone);
    if local_start.date_naive() != local_end.date_naive()
        || local_start.weekday() != local_end.weekday()
    {
        return Err(AppError::conflict(
            "SLOT_UNAVAILABLE",
            "Requested slot is not within a working interval",
        ));
    }
    let start_minute = i64::from(local_start.hour()) * 60 + i64::from(local_start.minute());
    let end_minute = i64::from(local_end.hour()) * 60 + i64::from(local_end.minute());
    let weekday = i64::from(local_start.weekday().num_days_from_sunday());
    let in_schedule: i64 = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM weekly_schedules
         WHERE business_id = ?1 AND barber_user_id = ?2 AND weekday = ?3 AND active = 1
           AND start_minute <= ?4 AND end_minute >= ?5)",
        params![business_id, barber_id, weekday, start_minute, end_minute],
        |row| row.get(0),
    )?;
    if in_schedule == 0 {
        return Err(AppError::conflict(
            "SLOT_UNAVAILABLE",
            "Requested slot is not within a working interval",
        ));
    }
    let starts_text = utc_text(starts_at);
    let ends_text = utc_text(ends_at);
    let blocked: i64 = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM availability_blocks
         WHERE business_id = ?1 AND barber_user_id = ?2 AND active = 1
           AND starts_at_utc < ?3 AND ends_at_utc > ?4)",
        params![business_id, barber_id, ends_text, starts_text],
        |row| row.get(0),
    )?;
    if blocked != 0 {
        return Err(AppError::conflict(
            "SLOT_UNAVAILABLE",
            "Requested slot is blocked",
        ));
    }
    let conflict: i64 = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM appointments
         WHERE business_id = ?1 AND barber_user_id = ?2 AND status = 'confirmed'
           AND starts_at_utc < ?3 AND ends_at_utc > ?4
           AND (?5 IS NULL OR id <> ?5))",
        params![
            business_id,
            barber_id,
            ends_text,
            starts_text,
            excluded_appointment_id
        ],
        |row| row.get(0),
    )?;
    if conflict != 0 {
        return Err(AppError::conflict(
            "SLOT_UNAVAILABLE",
            "Requested slot is no longer available",
        ));
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn insert_history(
    connection: &rusqlite::Connection,
    business_id: &str,
    appointment_id: &str,
    actor_user_id: Option<&str>,
    event_type: &str,
    from_status: Option<&str>,
    to_status: Option<&str>,
    from_starts_at: Option<&str>,
    to_starts_at: Option<&str>,
    reason: &str,
) -> Result<(), AppError> {
    connection.execute(
        "INSERT INTO appointment_history(id, business_id, appointment_id, actor_user_id, event_type, from_status, to_status,
         from_starts_at_utc, to_starts_at_utc, reason, payload_json, created_at_utc)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, '{}', ?11)",
        params![
            new_id(), business_id, appointment_id, actor_user_id, event_type, from_status, to_status,
            from_starts_at, to_starts_at, reason, utc_text(Utc::now()),
        ],
    )?;
    Ok(())
}

async fn complete_appointment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(request): Json<CompleteRequest>,
) -> ApiResult<Json<AppointmentResponse>> {
    let context = authenticate(&state, &headers).await?;
    require_mutation(&state, &headers, &context)?;
    let appointment_id = valid_id(&id)?;
    let notes = optional_text(
        request.notes.as_deref(),
        1000,
        "INVALID_EXECUTION",
        "Execution notes are invalid",
    )?;
    let business_id = context.user.business_id.clone();
    let actor_id = context.user.id.clone();
    let actor_is_owner = is_owner(&context);
    let actor_is_barber = context.user.roles.contains(&Role::Barber);
    let result = state
        .db
        .with_conn(move |connection| -> Result<_, AppError> {
            let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
            let current = get_appointment(&transaction, &business_id, &appointment_id)?;
            if !(actor_is_owner || (actor_is_barber && current.barber_user_id == actor_id)) {
                return Err(AppError::forbidden());
            }
            if current.status != AppointmentStatus::Confirmed {
                return Err(AppError::conflict("INVALID_TRANSITION", "Only a confirmed appointment can be completed"));
            }
            let now = utc_text(Utc::now());
            transaction.execute(
                "INSERT INTO service_executions(business_id, appointment_id, started_at_utc, notes)
                 VALUES (?1, ?2, ?3, '') ON CONFLICT(business_id, appointment_id) DO NOTHING",
                params![business_id, appointment_id, now],
            )?;
            transaction.execute(
                "UPDATE service_executions SET completed_at_utc = ?1, notes = ?2, completed_by_user_id = ?3
                 WHERE business_id = ?4 AND appointment_id = ?5 AND completed_at_utc IS NULL",
                params![now, notes, actor_id, business_id, appointment_id],
            )?;
            transaction.execute(
                "UPDATE appointments SET status = 'completed', completed_at_utc = ?1, updated_at_utc = ?1, version = version + 1
                 WHERE business_id = ?2 AND id = ?3 AND status = 'confirmed'",
                params![now, business_id, appointment_id],
            )?;
            insert_history(
                &transaction,
                &business_id,
                &appointment_id,
                Some(&actor_id),
                "completed",
                Some("confirmed"),
                Some("completed"),
                None,
                None,
                "",
            )?;
            transaction.execute(
                "INSERT INTO financial_entries(id, business_id, appointment_id, kind, amount_cents, status, created_at_utc)
                 VALUES (?1, ?2, ?3, 'revenue', ?4, 'posted', ?5)",
                params![new_id(), business_id, appointment_id, current.price_cents, now],
            )?;
            let rule: Option<(String, String, i64)> = transaction
                .query_row(
                    "SELECT id, rule_type, amount FROM commission_rules
                     WHERE business_id = ?1 AND active = 1
                       AND (barber_user_id IS NULL OR barber_user_id = ?2)
                       AND (service_id IS NULL OR service_id = ?3)
                       AND (valid_from_utc IS NULL OR valid_from_utc <= ?4)
                       AND (valid_until_utc IS NULL OR valid_until_utc > ?4)
                     ORDER BY (barber_user_id IS NOT NULL) DESC, (service_id IS NOT NULL) DESC, priority DESC, created_at_utc DESC
                     LIMIT 1",
                    params![business_id, current.barber_user_id, current.service_id, utc_text(current.starts_at)],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                )
                .optional()?;
            match rule {
                Some((rule_id, rule_type, rule_amount)) => {
                    let commission_cents = if rule_type == "percent" {
                        (current.price_cents * rule_amount + 5_000) / 10_000
                    } else {
                        rule_amount
                    };
                    transaction.execute(
                        "INSERT INTO commission_snapshots(business_id, appointment_id, barber_user_id, rule_id, rule_type, rule_amount,
                         base_cents, amount_cents, status, created_at_utc)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'posted', ?9)",
                        params![business_id, appointment_id, current.barber_user_id, rule_id, rule_type, rule_amount, current.price_cents, commission_cents, now],
                    )?;
                    transaction.execute(
                        "INSERT INTO financial_entries(id, business_id, appointment_id, kind, amount_cents, status, created_at_utc)
                         VALUES (?1, ?2, ?3, 'commission', ?4, 'posted', ?5)",
                        params![new_id(), business_id, appointment_id, commission_cents, now],
                    )?;
                }
                None => {
                    transaction.execute(
                        "INSERT INTO commission_snapshots(business_id, appointment_id, barber_user_id, base_cents, status, error_code, created_at_utc)
                         VALUES (?1, ?2, ?3, ?4, 'pending_configuration', 'COMMISSION_RULE_MISSING', ?5)",
                        params![business_id, appointment_id, current.barber_user_id, current.price_cents, now],
                    )?;
                    transaction.execute(
                        "INSERT INTO financial_entries(id, business_id, appointment_id, kind, amount_cents, status, created_at_utc)
                         VALUES (?1, ?2, ?3, 'commission', NULL, 'pending_configuration', ?4)",
                        params![new_id(), business_id, appointment_id, now],
                    )?;
                }
            }
            insert_audit(&transaction, &business_id, Some(&actor_id), "appointment.completed", "appointment", &appointment_id, "{}")?;
            transaction.commit()?;
            Ok(AppointmentResponse { status: AppointmentStatus::Completed, ..current })
        })
        .await?;
    Ok(Json(result))
}

async fn no_show_appointment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> ApiResult<Json<AppointmentResponse>> {
    let context = authenticate(&state, &headers).await?;
    require_mutation(&state, &headers, &context)?;
    let appointment_id = valid_id(&id)?;
    let business_id = context.user.business_id.clone();
    let actor_id = context.user.id.clone();
    let actor_is_owner = is_owner(&context);
    let actor_is_barber = context.user.roles.contains(&Role::Barber);
    let result = state
        .db
        .with_conn(move |connection| -> Result<_, AppError> {
            let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
            let current = get_appointment(&transaction, &business_id, &appointment_id)?;
            if !(actor_is_owner || (actor_is_barber && current.barber_user_id == actor_id)) {
                return Err(AppError::forbidden());
            }
            if current.status != AppointmentStatus::Confirmed {
                return Err(AppError::conflict("INVALID_TRANSITION", "Only a confirmed appointment can be marked no-show"));
            }
            let started: i64 = transaction.query_row(
                "SELECT EXISTS(SELECT 1 FROM service_executions WHERE business_id = ?1 AND appointment_id = ?2)",
                params![business_id, appointment_id],
                |row| row.get(0),
            )?;
            if started != 0 {
                return Err(AppError::conflict("INVALID_TRANSITION", "An appointment in execution cannot be marked no-show"));
            }
            let now = utc_text(Utc::now());
            transaction.execute(
                "UPDATE appointments SET status = 'no_show', updated_at_utc = ?1, version = version + 1
                 WHERE business_id = ?2 AND id = ?3 AND status = 'confirmed'",
                params![now, business_id, appointment_id],
            )?;
            insert_history(
                &transaction,
                &business_id,
                &appointment_id,
                Some(&actor_id),
                "no_show",
                Some("confirmed"),
                Some("no_show"),
                None,
                None,
                "",
            )?;
            insert_audit(&transaction, &business_id, Some(&actor_id), "appointment.no_show", "appointment", &appointment_id, "{}")?;
            transaction.commit()?;
            Ok(AppointmentResponse { status: AppointmentStatus::NoShow, ..current })
        })
        .await?;
    Ok(Json(result))
}

async fn create_rating(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(request): Json<RatingRequest>,
) -> ApiResult<(StatusCode, Json<MessageResponse>)> {
    let context = authenticate(&state, &headers).await?;
    require_mutation(&state, &headers, &context)?;
    require_role(&context, Role::Client)?;
    let appointment_id = valid_id(&id)?;
    if !(1..=5).contains(&request.score) {
        return Err(AppError::bad_request(
            "INVALID_RATING",
            "Rating must be between one and five",
        ));
    }
    let comment = optional_text(
        request.comment.as_deref(),
        1000,
        "INVALID_RATING",
        "Rating comment is invalid",
    )?;
    let business_id = context.user.business_id.clone();
    let user_id = context.user.id.clone();
    state
        .db
        .with_conn(move |connection| -> Result<_, AppError> {
            let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
            let appointment = get_appointment(&transaction, &business_id, &appointment_id)?;
            if appointment.client_user_id != user_id {
                return Err(AppError::forbidden());
            }
            if appointment.status != AppointmentStatus::Completed {
                return Err(AppError::conflict("INVALID_RATING", "Only completed appointments can be rated"));
            }
            let exists: i64 = transaction.query_row(
                "SELECT EXISTS(SELECT 1 FROM ratings WHERE business_id = ?1 AND appointment_id = ?2)",
                params![business_id, appointment_id],
                |row| row.get(0),
            )?;
            if exists != 0 {
                return Err(AppError::conflict("RATING_EXISTS", "Appointment has already been rated"));
            }
            transaction.execute(
                "INSERT INTO ratings(business_id, appointment_id, client_user_id, score, comment, created_at_utc)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![business_id, appointment_id, user_id, request.score, comment, utc_text(Utc::now())],
            )?;
            insert_audit(&transaction, &business_id, Some(&user_id), "appointment.rated", "appointment", &appointment_id, "{}")?;
            transaction.commit()?;
            Ok(())
        })
        .await?;
    Ok((
        StatusCode::CREATED,
        Json(MessageResponse {
            message: "Rating recorded",
        }),
    ))
}

async fn record_consent(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<ConsentRequest>,
) -> ApiResult<(StatusCode, Json<MessageResponse>)> {
    let context = authenticate(&state, &headers).await?;
    require_mutation(&state, &headers, &context)?;
    let consent_type = required_text(
        &request.consent_type,
        2,
        80,
        "INVALID_CONSENT",
        "Consent type is invalid",
    )?;
    let policy_version = required_text(
        &request.policy_version,
        1,
        80,
        "INVALID_CONSENT",
        "Policy version is invalid",
    )?;
    let business_id = context.user.business_id.clone();
    let user_id = context.user.id.clone();
    state
        .db
        .with_conn(move |connection| -> Result<_, AppError> {
            let id = new_id();
            connection.execute(
                "INSERT INTO consents(id, business_id, user_id, consent_type, policy_version, granted, source, created_at_utc)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'web', ?7)",
                params![id, business_id, user_id, consent_type, policy_version, if request.granted { 1 } else { 0 }, utc_text(Utc::now())],
            )?;
            insert_audit(connection, &business_id, Some(&user_id), "consent.recorded", "consent", &id, "{}")?;
            Ok(())
        })
        .await?;
    Ok((
        StatusCode::CREATED,
        Json(MessageResponse {
            message: "Consent recorded",
        }),
    ))
}

async fn revenue_report(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<DateRangeQuery>,
) -> ApiResult<Json<RevenueReport>> {
    let context = authenticate(&state, &headers).await?;
    require_role(&context, Role::Owner)?;
    let from = query.from.as_deref().map(parse_input_utc).transpose()?;
    let to = query.to.as_deref().map(parse_input_utc).transpose()?;
    if to.is_some_and(|end| {
        from.as_ref()
            .is_some_and(|start| end <= *start || end - *start > ChronoDuration::days(366))
    }) {
        return Err(AppError::bad_request(
            "INVALID_RANGE",
            "Date range is invalid",
        ));
    }
    let from = from.map(utc_text);
    let to = to.map(utc_text);
    let business_id = context.user.business_id.clone();
    let report = state
        .db
        .with_conn(move |connection| -> Result<_, AppError> {
            let completed_count: i64 = connection.query_row(
                "SELECT COUNT(*) FROM appointments WHERE business_id = ?1 AND status = 'completed'
                 AND (?2 IS NULL OR completed_at_utc >= ?2) AND (?3 IS NULL OR completed_at_utc < ?3)",
                params![business_id, from, to],
                |row| row.get(0),
            )?;
            let revenue_cents: i64 = connection.query_row(
                "SELECT COALESCE(SUM(f.amount_cents), 0) FROM financial_entries f
                 JOIN appointments a ON a.id = f.appointment_id AND a.business_id = f.business_id
                 WHERE f.business_id = ?1 AND f.kind = 'revenue' AND f.status = 'posted' AND a.status = 'completed'
                   AND (?2 IS NULL OR a.completed_at_utc >= ?2) AND (?3 IS NULL OR a.completed_at_utc < ?3)",
                params![business_id, from, to],
                |row| row.get(0),
            )?;
            let commission_cents: i64 = connection.query_row(
                "SELECT COALESCE(SUM(f.amount_cents), 0) FROM financial_entries f
                 JOIN appointments a ON a.id = f.appointment_id AND a.business_id = f.business_id
                 WHERE f.business_id = ?1 AND f.kind = 'commission' AND f.status = 'posted' AND a.status = 'completed'
                   AND (?2 IS NULL OR a.completed_at_utc >= ?2) AND (?3 IS NULL OR a.completed_at_utc < ?3)",
                params![business_id, from, to],
                |row| row.get(0),
            )?;
            let commission_pending_count: i64 = connection.query_row(
                "SELECT COUNT(*) FROM commission_snapshots c
                 JOIN appointments a ON a.id = c.appointment_id AND a.business_id = c.business_id
                 WHERE c.business_id = ?1 AND c.status = 'pending_configuration' AND a.status = 'completed'
                   AND (?2 IS NULL OR a.completed_at_utc >= ?2) AND (?3 IS NULL OR a.completed_at_utc < ?3)",
                params![business_id, from, to],
                |row| row.get(0),
            )?;
            Ok(RevenueReport { completed_count, revenue_cents, commission_cents, commission_pending_count })
        })
        .await?;
    Ok(Json(report))
}

#[cfg(test)]
mod tests {
    use std::{collections::HashSet, net::SocketAddr, sync::Arc};

    use axum::{
        body::Body,
        http::{Request, header},
    };
    use http_body_util::BodyExt;
    use serde_json::{Value, json};
    use tower::ServiceExt;

    use super::*;
    use crate::{config::Config, db::Db, security::RateLimiter};

    fn test_app() -> Router {
        let config = Config {
            bind_addr: "127.0.0.1:3001".parse::<SocketAddr>().unwrap(),
            db_path: ":memory:".into(),
            bootstrap_token: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
                .into(),
            allowed_origins: HashSet::from(["http://127.0.0.1:5173".into()]),
            secure_cookies: false,
            session_days: 7,
            timezone: "America/Sao_Paulo".into(),
        };
        router(AppState {
            config: Arc::new(config),
            db: Db::in_memory().unwrap(),
            limiter: RateLimiter::default(),
        })
    }

    async fn request_json(
        app: &Router,
        method: &str,
        path: &str,
        payload: Value,
        cookie: Option<&str>,
        csrf: Option<&str>,
        bootstrap: Option<&str>,
    ) -> (StatusCode, HeaderMap, Value) {
        let mut builder = Request::builder()
            .method(method)
            .uri(path)
            .header(header::CONTENT_TYPE, "application/json");
        if method != "GET" {
            builder = builder.header(header::ORIGIN, "http://127.0.0.1:5173");
        }
        if let Some(cookie) = cookie {
            builder = builder.header(header::COOKIE, cookie);
        }
        if let Some(csrf) = csrf {
            builder = builder.header("x-csrf-token", csrf);
        }
        if let Some(bootstrap) = bootstrap {
            builder = builder.header("x-bootstrap-token", bootstrap);
        }
        let response = app
            .clone()
            .oneshot(
                builder
                    .body(Body::from(serde_json::to_vec(&payload).unwrap()))
                    .unwrap(),
            )
            .await
            .unwrap();
        let status = response.status();
        let headers = response.headers().clone();
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        (status, headers, serde_json::from_slice(&bytes).unwrap())
    }

    fn cookie(headers: &HeaderMap) -> String {
        headers
            .get(header::SET_COOKIE)
            .unwrap()
            .to_str()
            .unwrap()
            .split(';')
            .next()
            .unwrap()
            .to_string()
    }

    #[tokio::test]
    async fn booking_conflict_and_completion_are_atomic() {
        let app = test_app();
        let bootstrap = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        let (status, owner_headers, owner) = request_json(
            &app,
            "POST",
            "/api/v1/setup/owner",
            json!({
                "business_name": "NA Test",
                "timezone": "America/Sao_Paulo",
                "email": "owner@example.test",
                "password": "TestPassword123!",
                "display_name": "Owner"
            }),
            None,
            None,
            Some(bootstrap),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        let owner_cookie = cookie(&owner_headers);
        let owner_csrf = owner["csrf_token"].as_str().unwrap().to_string();

        let (status, _, service) = request_json(
            &app,
            "POST",
            "/api/v1/admin/services",
            json!({"name":"Corte","description":"","price_cents":5000,"duration_minutes":30,"active":true}),
            Some(&owner_cookie),
            Some(&owner_csrf),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::CREATED);
        let service_id = service["id"].as_str().unwrap().to_string();

        let (status, _, barber) = request_json(
            &app,
            "POST",
            "/api/v1/admin/barbers",
            json!({"email":"barber@example.test","password":"TestPassword123!","display_name":"Barbeiro"}),
            Some(&owner_cookie),
            Some(&owner_csrf),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::CREATED);
        let barber_id = barber["id"].as_str().unwrap().to_string();

        let timezone: Tz = "America/Sao_Paulo".parse().unwrap();
        let target_date =
            Utc::now().with_timezone(&timezone).date_naive() + ChronoDuration::days(1);
        let local_start = target_date.and_hms_opt(10, 0, 0).unwrap();
        let starts_at = match timezone.from_local_datetime(&local_start) {
            LocalResult::Single(value) => value.with_timezone(&Utc),
            _ => panic!("test date must be unambiguous"),
        };
        let weekday = i64::from(target_date.weekday().num_days_from_sunday());
        let (status, _, _) = request_json(
            &app,
            "POST",
            "/api/v1/admin/schedules",
            json!({"barber_user_id":barber_id,"weekday":weekday,"start_minute":540,"end_minute":720}),
            Some(&owner_cookie),
            Some(&owner_csrf),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::CREATED);

        let (status, client_headers, client) = request_json(
            &app,
            "POST",
            "/api/v1/auth/register",
            json!({"email":"client@example.test","password":"TestPassword123!","display_name":"Cliente"}),
            None,
            None,
            None,
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        let client_cookie = cookie(&client_headers);
        let client_csrf = client["csrf_token"].as_str().unwrap().to_string();
        let booking_payload = json!({
            "barber_user_id": barber_id,
            "service_id": service_id,
            "starts_at": utc_text(starts_at)
        });
        let (status, _, _appointment) = request_json(
            &app,
            "POST",
            "/api/v1/appointments",
            booking_payload.clone(),
            Some(&client_cookie),
            Some(&client_csrf),
            None,
        )
        .await;
        // The endpoint requires an idempotency header; the first request above is intentionally forbidden.
        assert_eq!(status, StatusCode::BAD_REQUEST);

        let request = Request::builder()
            .method("POST")
            .uri("/api/v1/appointments")
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::ORIGIN, "http://127.0.0.1:5173")
            .header(header::COOKIE, &client_cookie)
            .header("x-csrf-token", &client_csrf)
            .header("idempotency-key", "booking-test-key-0001")
            .body(Body::from(serde_json::to_vec(&booking_payload).unwrap()))
            .unwrap();
        let response = app.clone().oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::CREATED);
        let appointment: Value =
            serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                .unwrap();
        let appointment_id = appointment["id"].as_str().unwrap().to_string();

        let owner_booking = Request::builder()
            .method("POST")
            .uri("/api/v1/admin/appointments")
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::ORIGIN, "http://127.0.0.1:5173")
            .header(header::COOKIE, &owner_cookie)
            .header("x-csrf-token", &owner_csrf)
            .header("idempotency-key", "owner-booking-test-0001")
            .body(Body::from(
                serde_json::to_vec(&json!({
                    "client_user_id": client["user"]["id"],
                    "barber_user_id": barber_id,
                    "service_id": service_id,
                    "starts_at": utc_text(starts_at + ChronoDuration::hours(1))
                }))
                .unwrap(),
            ))
            .unwrap();
        assert_eq!(
            app.clone().oneshot(owner_booking).await.unwrap().status(),
            StatusCode::CREATED
        );

        let (status, second_headers, second) = request_json(
            &app,
            "POST",
            "/api/v1/auth/register",
            json!({"email":"client2@example.test","password":"TestPassword123!","display_name":"Cliente Dois"}),
            None,
            None,
            None,
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        let second_cookie = cookie(&second_headers);
        let second_csrf = second["csrf_token"].as_str().unwrap().to_string();
        let conflict_request = Request::builder()
            .method("POST")
            .uri("/api/v1/appointments")
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::ORIGIN, "http://127.0.0.1:5173")
            .header(header::COOKIE, &second_cookie)
            .header("x-csrf-token", &second_csrf)
            .header("idempotency-key", "booking-test-key-0002")
            .body(Body::from(serde_json::to_vec(&booking_payload).unwrap()))
            .unwrap();
        assert_eq!(
            app.clone()
                .oneshot(conflict_request)
                .await
                .unwrap()
                .status(),
            StatusCode::CONFLICT
        );

        let (status, barber_headers, barber) = request_json(
            &app,
            "POST",
            "/api/v1/auth/login",
            json!({"email":"barber@example.test","password":"TestPassword123!"}),
            None,
            None,
            None,
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        let barber_cookie = cookie(&barber_headers);
        let barber_csrf = barber["csrf_token"].as_str().unwrap().to_string();
        let (status, _, completed) = request_json(
            &app,
            "POST",
            &format!("/api/v1/appointments/{appointment_id}/complete"),
            json!({"notes":"feito"}),
            Some(&barber_cookie),
            Some(&barber_csrf),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(completed["status"], "completed");

        let (status, _, report) = request_json(
            &app,
            "GET",
            "/api/v1/admin/reports/revenue",
            json!({}),
            Some(&owner_cookie),
            None,
            None,
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(report["revenue_cents"], 5000);
        assert_eq!(report["commission_pending_count"], 1);
    }
}

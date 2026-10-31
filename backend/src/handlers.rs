mod account;
mod android;
mod owner;
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
use tower::ServiceExt;
use tower_http::trace::TraceLayer;
use uuid::Uuid;

use crate::{
    AppState,
    appointments::{
        self,
        storage::{appointment_from_row, ensure_active_barber, get_appointment},
    },
    db::insert_audit,
    error::{ApiResult, AppError},
    models::{
        AdminAppointmentRequest, AppointmentRequest, AppointmentResponse, AppointmentStatus,
        AuthContext, AuthResponse, AuthUser, AvailabilityQuery, AvailableSlot, BarberRequest,
        BarberResponse, BlockRequest, CancelRequest, CommissionRuleRequest, CompleteRequest,
        ConsentRequest, DateRangeQuery, LoginRequest, MessageResponse, PublicBarberResponse,
        RatingRequest, RegisterRequest, RescheduleRequest, RevenueReport, Role, ScheduleRequest,
        ServiceRequest, ServiceResponse, SetupOwnerRequest, SetupStatusResponse,
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
        .route("/api/v1/auth/staff/login", post(staff_login))
        .route("/api/v1/staff/android/apk", get(staff_android_apk))
        .route("/api/v1/staff/android/release", get(android::release))
        .route("/api/v1/auth/session", get(auth_session))
        .route("/api/v1/auth/logout", post(logout))
        .route("/api/v1/account", patch(account::update))
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
            "/api/v1/appointments/{id}/details",
            patch(update_appointment_details),
        )
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
        .route(
            "/api/v1/admin/services",
            get(owner::services).post(create_service),
        )
        .route("/api/v1/admin/summary", get(owner::summary))
        .route("/api/v1/admin/payouts", post(owner::payout))
        .route(
            "/api/v1/admin/my-barber-profile",
            post(owner::enable_hybrid),
        )
        .route("/api/v1/admin/barbers/{id}", put(owner::edit_barber))
        .route("/api/v1/admin/agenda/bulk", post(owner::bulk_agenda))
        .route("/api/v1/admin/appointments", post(create_admin_appointment))
        .route("/api/v1/barber/walk-ins", post(create_admin_appointment))
        .route(
            "/api/v1/barber/blocks",
            get(list_own_blocks).post(create_block),
        )
        .route("/api/v1/admin/services/{id}", put(update_service))
        .route("/api/v1/admin/barbers", post(create_barber))
        .route("/api/v1/admin/schedules", post(create_schedule))
        .route("/api/v1/admin/blocks", post(create_block))
        .route(
            "/api/v1/admin/commission-rules",
            post(create_commission_rule),
        )
        .route("/api/v1/admin/reports/revenue", get(revenue_report))
        .route("/api/v1/reports/revenue", get(revenue_report))
        .layer(DefaultBodyLimit::max(MAX_BODY_BYTES))
        .layer(middleware::map_response(add_security_headers))
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

pub async fn add_security_headers(mut response: Response) -> Response {
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
        HeaderValue::from_static("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https://d39p7gjvbgwtet.cloudfront.net https://www.trinks.com data:; font-src 'self' data:; connect-src 'self'; frame-src https://www.google.com https://maps.google.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"),
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
        phone: String::new(),
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
        phone: String::new(),
    };
    let session = create_session(&state, &user).await?;
    auth_json_response(&state, user, session)
}

async fn login(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<LoginRequest>,
) -> ApiResult<(HeaderMap, Json<AuthResponse>)> {
    login_for_channel(state, headers, request, false).await
}

async fn staff_login(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<LoginRequest>,
) -> ApiResult<(HeaderMap, Json<AuthResponse>)> {
    login_for_channel(state, headers, request, true).await
}

async fn login_for_channel(
    state: AppState,
    headers: HeaderMap,
    request: LoginRequest,
    staff_only: bool,
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
                    "SELECT id, password_hash, display_name, phone FROM users WHERE business_id = ?1 AND email = ?2 AND active = 1",
                    params![business_id, email_for_query],
                    |row| Ok((business_id.clone(), row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, String>(3)?)),
                )
                .optional()?;
            Ok(result)
        })
        .await?;

    let Some((business_id, user_id, password_hash, display_name, phone)) = candidate else {
        // Perform a comparable Argon2 operation to reduce account-enumeration timing signal.
        let _ = crate::security::hash_password(password).await?;
        return Err(AppError::unauthorized());
    };
    if !verify_password(password, password_hash).await? {
        return Err(AppError::unauthorized());
    }
    let roles = load_roles(&state, &business_id, &user_id).await?;
    if staff_only && !roles.contains(&Role::Owner) && !roles.contains(&Role::Barber) {
        return Err(AppError::Api {
            status: StatusCode::FORBIDDEN,
            code: "STAFF_ONLY",
            message: "Este acesso é exclusivo para barbeiros e proprietário.",
        });
    }
    let user = AuthUser {
        id: user_id,
        business_id,
        email,
        display_name,
        phone,
        roles,
    };
    let session = create_session(&state, &user).await?;
    auth_json_response(&state, user, session)
}

async fn staff_android_apk(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Response> {
    let context = authenticate(&state, &headers).await?;
    if !context.user.roles.contains(&Role::Owner) && !context.user.roles.contains(&Role::Barber) {
        return Err(AppError::forbidden());
    }
    // Delivery lives alongside private data, never inside the publicly served frontend directory.
    let path = state
        .config
        .db_path
        .parent()
        .unwrap_or(std::path::Path::new("."))
        .join("android/NA-Barbearia-arm64-release.apk");
    let request = axum::http::Request::builder()
        .uri("/")
        .body(axum::body::Body::empty())
        .map_err(|_| AppError::Internal)?;
    let response = tower_http::services::ServeFile::new(path)
        .oneshot(request)
        .await
        .map_err(|_| AppError::Internal)?;
    let mut response = response.map(axum::body::Body::new);
    if response.status() == StatusCode::NOT_FOUND {
        return Err(AppError::not_found(
            "APK_NOT_AVAILABLE",
            "O APK ainda não foi publicado.",
        ));
    }
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/vnd.android.package-archive"),
    );
    response.headers_mut().insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_static("attachment; filename=\"NA-Barbearia-arm64-release.apk\""),
    );
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    Ok(response)
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
    let (business_id, user_id, email, display_name, csrf_hash, phone) = state
        .db
        .with_conn(move |connection| -> Result<_, AppError> {
            connection
                .query_row(
                    "SELECT s.business_id, u.id, u.email, u.display_name, s.csrf_hash, u.phone
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
                        row.get::<_, String>(5)?,
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
            phone,
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

async fn list_own_blocks(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<DateRangeQuery>,
) -> ApiResult<Json<Vec<serde_json::Value>>> {
    let context = authenticate(&state, &headers).await?;
    require_role(&context, Role::Barber)?;
    let from = query
        .from
        .as_deref()
        .map(parse_input_utc)
        .transpose()?
        .map(utc_text);
    let to = query
        .to
        .as_deref()
        .map(parse_input_utc)
        .transpose()?
        .map(utc_text);
    let business = context.user.business_id;
    let barber = context.user.id;
    let blocks = state.db.with_conn(move |connection| -> Result<_, AppError> {
        let mut statement = connection.prepare("SELECT id, starts_at_utc, ends_at_utc, reason FROM availability_blocks WHERE business_id=?1 AND barber_user_id=?2 AND active=1 AND (?3 IS NULL OR ends_at_utc > ?3) AND (?4 IS NULL OR starts_at_utc < ?4) ORDER BY starts_at_utc LIMIT 500")?;
        let rows = statement.query_map(params![business,barber,from,to], |row| Ok(json!({ "id":row.get::<_,String>(0)?, "starts_at":row.get::<_,String>(1)?, "ends_at":row.get::<_,String>(2)?, "reason":row.get::<_,Option<String>>(3)? })))?.collect::<Result<Vec<_>,_>>()?;
        Ok(rows)
    }).await?;
    Ok(Json(blocks))
}

async fn create_block(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<BlockRequest>,
) -> ApiResult<(StatusCode, Json<MessageResponse>)> {
    let context = authenticate(&state, &headers).await?;
    require_mutation(&state, &headers, &context)?;
    let barber_id = valid_id(&request.barber_user_id)?;
    if !is_owner(&context)
        && !(context.user.roles.contains(&Role::Barber) && barber_id == context.user.id)
    {
        return Err(AppError::forbidden());
    }
    let starts_at = parse_input_utc(&request.starts_at_utc)?;
    let ends_at = parse_input_utc(&request.ends_at_utc)?;
    if starts_at <= Utc::now()
        || ends_at <= starts_at
        || ends_at - starts_at > ChronoDuration::days(366)
    {
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
            let booked: i64 = transaction.query_row("SELECT EXISTS(SELECT 1 FROM appointments WHERE business_id = ?1 AND barber_user_id = ?2 AND status = 'confirmed' AND starts_at_utc < ?3 AND ends_at_utc > ?4)", params![business_id, barber_id, ends_text, starts_text], |row| row.get(0))?;
            if booked != 0 { return Err(AppError::conflict("APPOINTMENT_OVERLAP", "A pausa coincide com um atendimento confirmado.")); }
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
    crate::commissions::Rule::validate_values(
        request.rule_type,
        request.amount,
        request.priority.unwrap_or(0),
    )?;
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
    crate::commissions::create_rule(
        &state.db,
        context.user,
        crate::commissions::Rule {
            barber_id,
            service_id,
            rule_type: request.rule_type,
            amount: request.amount,
            priority: request.priority.unwrap_or(0),
            valid_from,
            valid_until,
        },
    )
    .await?;
    Ok((
        StatusCode::CREATED,
        Json(MessageResponse {
            message: "Commission rule created",
        }),
    ))
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
    let request_hash =
        hash_token(&serde_json::to_string(&request).map_err(|_| AppError::Internal)?);
    let appointment = appointments::create(
        &state.db,
        context.user,
        appointments::Booking {
            barber_id,
            service_id,
            starts_at,
            idempotency: appointments::Idempotency {
                key: idempotency_key,
                request_hash,
            },
        },
    )
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
    let idempotency_key = idempotency_key(&headers)?;
    let walk_in = request.client_user_id.is_none();
    let client_id = request
        .client_user_id
        .as_deref()
        .map(valid_id)
        .transpose()?
        .unwrap_or_else(new_id);
    let client_name = if walk_in {
        Some(required_text(
            request.client_name.as_deref().unwrap_or(""),
            2,
            120,
            "INVALID_NAME",
            "Informe o nome do cliente.",
        )?)
    } else {
        None
    };
    let client_phone = optional_text(
        request.client_phone.as_deref(),
        20,
        "INVALID_PHONE",
        "Telefone inválido",
    )?;
    if !client_phone.is_empty() {
        let phone = &client_phone;
        if !phone.chars().all(|c| c.is_ascii_digit()) || !(10..=13).contains(&phone.len()) {
            return Err(AppError::bad_request(
                "INVALID_PHONE",
                "Informe DDD e telefone, somente números.",
            ));
        }
    }
    let client_note = optional_text(
        request.client_note.as_deref(),
        500,
        "INVALID_NOTE",
        "Observação muito longa",
    )?;
    let payment_method = request.payment_method.clone();
    if payment_method
        .as_deref()
        .is_some_and(|p| !["Pix", "Cartão", "Presencial"].contains(&p))
    {
        return Err(AppError::bad_request(
            "INVALID_PAYMENT",
            "Forma de pagamento inválida",
        ));
    }
    let barber_id = valid_id(&request.barber_user_id)?;
    let service_id = valid_id(&request.service_id)?;
    let starts_at = parse_input_utc(&request.starts_at)?;
    let request_hash =
        hash_token(&serde_json::to_string(&request).map_err(|_| AppError::Internal)?);
    let appointment = appointments::create_reception(
        &state.db,
        context.user,
        appointments::ReceptionBooking {
            booking: appointments::Booking {
                barber_id,
                service_id,
                starts_at,
                idempotency: appointments::Idempotency {
                    key: idempotency_key,
                    request_hash,
                },
            },
            client_id,
            client_name,
            client_phone,
            payment_method,
            client_note,
        },
    )
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
                        client.display_name, barber.display_name, service.name,
                    (SELECT r.score FROM ratings r WHERE r.business_id = a.business_id AND r.appointment_id = a.id),
                    a.client_phone, a.payment_method, a.client_note,
                    EXISTS(SELECT 1 FROM service_executions e WHERE e.business_id=a.business_id AND e.appointment_id=a.id),
                    (SELECT c.amount_cents FROM commission_snapshots c WHERE c.business_id=a.business_id AND c.appointment_id=a.id AND c.status='posted')
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
    let appointments = appointments
        .into_iter()
        .map(|mut item| {
            if scope == "client" {
                item.commission_cents = None;
            }
            item
        })
        .collect();
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
    let result =
        appointments::reschedule(&state.db, context.user, appointment_id, starts_at).await?;
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
    let result = appointments::cancel(&state.db, context.user, appointment_id, reason).await?;
    Ok(Json(result))
}

async fn update_appointment_details(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(request): Json<crate::models::AppointmentDetailsRequest>,
) -> ApiResult<Json<MessageResponse>> {
    let context = authenticate(&state, &headers).await?;
    require_mutation(&state, &headers, &context)?;
    let appointment_id = valid_id(&id)?;
    let phone = optional_text(
        request.client_phone.as_deref(),
        20,
        "INVALID_PHONE",
        "Telefone inválido",
    )?;
    if !phone.is_empty() {
        let value = &phone;
        if !value.chars().all(|c| c.is_ascii_digit()) || !(10..=13).contains(&value.len()) {
            return Err(AppError::bad_request(
                "INVALID_PHONE",
                "Informe DDD e telefone, somente números.",
            ));
        }
    }
    let note = optional_text(
        request.client_note.as_deref(),
        500,
        "INVALID_NOTE",
        "Observação muito longa",
    )?;
    let payment = request.payment_method;
    if payment
        .as_deref()
        .is_some_and(|p| !["Pix", "Cartão", "Presencial"].contains(&p))
    {
        return Err(AppError::bad_request(
            "INVALID_PAYMENT",
            "Forma de pagamento inválida",
        ));
    }
    appointments::update_details(
        &state.db,
        context.user,
        appointment_id,
        appointments::Details {
            phone,
            payment,
            note,
        },
    )
    .await?;
    Ok(Json(MessageResponse {
        message: "Detalhes atualizados",
    }))
}

async fn start_execution(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> ApiResult<Json<MessageResponse>> {
    let context = authenticate(&state, &headers).await?;
    require_mutation(&state, &headers, &context)?;
    let appointment_id = valid_id(&id)?;
    appointments::start(&state.db, context.user, appointment_id).await?;
    Ok(Json(MessageResponse {
        message: "Execution started",
    }))
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
    let result = appointments::complete(&state.db, context.user, appointment_id, notes).await?;
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
    let result = appointments::no_show(&state.db, context.user, appointment_id).await?;
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
    if !is_owner(&context) && !context.user.roles.contains(&Role::Barber) {
        return Err(AppError::forbidden());
    }
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
    let report = crate::commissions::earnings(&state.db, context.user, from, to).await?;
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

    pub(super) fn test_state() -> AppState {
        let config = Config {
            bind_addr: "127.0.0.1:3001".parse::<SocketAddr>().unwrap(),
            db_path: ":memory:".into(),
            frontend_dir: "dist".into(),
            bootstrap_token: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
                .into(),
            allowed_origins: HashSet::from(["http://127.0.0.1:5173".into()]),
            secure_cookies: false,
            session_days: 7,
            timezone: "America/Sao_Paulo".into(),
        };
        AppState {
            config: Arc::new(config),
            db: Db::in_memory().unwrap(),
            limiter: RateLimiter::default(),
        }
    }

    fn test_app() -> Router {
        router(test_state())
    }

    pub(super) async fn request_json(
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

    pub(super) fn cookie(headers: &HeaderMap) -> String {
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
    async fn android_release_is_public_but_only_advertises_a_published_apk() {
        let directory = std::env::temp_dir().join(format!("na-release-test-{}", Uuid::now_v7()));
        std::fs::create_dir_all(directory.join("android")).unwrap();
        let mut state = test_state();
        Arc::get_mut(&mut state.config).unwrap().db_path = directory.join("test.db");
        let app = router(state);
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/staff/android/release")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NO_CONTENT);
        assert_eq!(response.headers()[header::CACHE_CONTROL], "no-store");
        use sha2::Digest;
        let release = json!({ "version_code":2002, "version_name":"0.2.2", "size_bytes":4, "sha256":format!("{:x}", sha2::Sha256::digest([1_u8, 2, 3, 4])) });
        std::fs::write(directory.join("android/release.json"), release.to_string()).unwrap();
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/staff/android/release")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
        std::fs::write(
            directory.join("android/NA-Barbearia-arm64-release.apk"),
            [1_u8, 2, 3, 4],
        )
        .unwrap();
        let (status, headers, body) = request_json(
            &app,
            "GET",
            "/api/v1/staff/android/release",
            json!(null),
            None,
            None,
            None,
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(headers[header::CACHE_CONTROL], "no-store");
        assert_eq!(body, release);
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/staff/android/apk")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        std::fs::write(
            directory.join("android/NA-Barbearia-arm64-release.apk"),
            [4_u8, 3, 2, 1],
        )
        .unwrap();
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/v1/staff/android/release")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
        std::fs::remove_dir_all(directory).unwrap();
    }

    #[tokio::test]
    async fn staff_apk_is_streamed_from_private_storage_after_authentication() {
        let directory = std::env::temp_dir().join(format!("na-apk-test-{}", Uuid::now_v7()));
        std::fs::create_dir_all(directory.join("android")).unwrap();
        let bytes = vec![42_u8; 128 * 1024];
        std::fs::write(
            directory.join("android/NA-Barbearia-arm64-release.apk"),
            &bytes,
        )
        .unwrap();
        let mut state = test_state();
        Arc::get_mut(&mut state.config).unwrap().db_path = directory.join("test.db");
        let app = router(state);
        let (_, headers, _) = request_json(&app, "POST", "/api/v1/setup/owner", json!({
            "business_name":"APK Test", "timezone":"America/Sao_Paulo", "email":"owner@apk.test",
            "password":"TestPassword123!", "display_name":"Owner"
        }), None, None, Some("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")).await;
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/v1/staff/android/apk")
                    .header(header::COOKIE, cookie(&headers))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.headers()[header::CONTENT_TYPE],
            "application/vnd.android.package-archive"
        );
        assert_eq!(response.headers()[header::CACHE_CONTROL], "no-store");
        assert!(
            response.headers()[header::CONTENT_DISPOSITION]
                .to_str()
                .unwrap()
                .starts_with("attachment;")
        );
        assert_eq!(
            response
                .into_body()
                .collect()
                .await
                .unwrap()
                .to_bytes()
                .as_ref(),
            bytes.as_slice()
        );
        std::fs::remove_dir_all(directory).unwrap();
    }

    #[tokio::test]
    async fn inactive_staff_cannot_create_another_session() {
        let state = test_state();
        let app = router(state.clone());
        request_json(&app, "POST", "/api/v1/setup/owner", json!({
            "business_name":"Inactive Test", "timezone":"America/Sao_Paulo", "email":"owner@inactive.test",
            "password":"TestPassword123!", "display_name":"Owner"
        }), None, None, Some("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")).await;
        state
            .db
            .with_conn(|connection| -> Result<_, AppError> {
                connection.execute("UPDATE users SET active = 0", [])?;
                Ok(())
            })
            .await
            .unwrap();
        let (status, headers, _) = request_json(
            &app,
            "POST",
            "/api/v1/auth/staff/login",
            json!({
                "email":"owner@inactive.test", "password":"TestPassword123!"
            }),
            None,
            None,
            None,
        )
        .await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
        assert!(!headers.contains_key(header::SET_COOKIE));
        let sessions = state
            .db
            .with_conn(|connection| -> Result<i64, AppError> {
                Ok(connection.query_row("SELECT COUNT(*) FROM sessions", [], |row| row.get(0))?)
            })
            .await
            .unwrap();
        assert_eq!(sessions, 1);
    }

    #[tokio::test]
    async fn staff_login_rejects_clients_and_preserves_public_login() {
        let app = test_app();
        let bootstrap = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        let (_, headers, owner) = request_json(&app, "POST", "/api/v1/setup/owner", json!({
            "business_name":"NA Test", "timezone":"America/Sao_Paulo", "email":"owner@staff.test",
            "password":"TestPassword123!", "display_name":"Owner"
        }), None, None, Some(bootstrap)).await;
        let owner_cookie = cookie(&headers);
        let (status, _, _) = request_json(
            &app,
            "POST",
            "/api/v1/admin/barbers",
            json!({
                "email":"barber@staff.test", "password":"TestPassword123!", "display_name":"Barber"
            }),
            Some(&owner_cookie),
            owner["csrf_token"].as_str(),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::CREATED);
        let (status, client_headers, _) = request_json(
            &app,
            "POST",
            "/api/v1/auth/register",
            json!({
                "email":"client@staff.test", "password":"TestPassword123!", "display_name":"Client"
            }),
            None,
            None,
            None,
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        let client_cookie = cookie(&client_headers);
        let client_login = json!({"email":"client@staff.test", "password":"TestPassword123!"});
        let (status, headers, body) = request_json(
            &app,
            "POST",
            "/api/v1/auth/staff/login",
            client_login.clone(),
            None,
            None,
            None,
        )
        .await;
        assert_eq!(status, StatusCode::FORBIDDEN);
        assert_eq!(body["code"], "STAFF_ONLY");
        assert!(!headers.contains_key(header::SET_COOKIE));
        let (status, _, _) = request_json(
            &app,
            "POST",
            "/api/v1/auth/login",
            client_login,
            None,
            None,
            None,
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        let (status, _, _) = request_json(
            &app,
            "GET",
            "/api/v1/staff/android/apk",
            json!({}),
            Some(&client_cookie),
            None,
            None,
        )
        .await;
        assert_eq!(status, StatusCode::FORBIDDEN);
        let (status, _, _) = request_json(
            &app,
            "GET",
            "/api/v1/staff/android/apk",
            json!({}),
            None,
            None,
            None,
        )
        .await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
        for email in ["owner@staff.test", "barber@staff.test"] {
            let (status, headers, body) = request_json(
                &app,
                "POST",
                "/api/v1/auth/staff/login",
                json!({"email":email,"password":"TestPassword123!"}),
                None,
                None,
                None,
            )
            .await;
            assert_eq!(status, StatusCode::OK);
            assert!(headers.contains_key(header::SET_COOKIE));
            let (status, _, _) = request_json(
                &app,
                "POST",
                "/api/v1/auth/logout",
                json!({}),
                Some(&cookie(&headers)),
                body["csrf_token"].as_str(),
                None,
            )
            .await;
            assert_eq!(status, StatusCode::OK);
            let (status, _, _) = request_json(
                &app,
                "GET",
                "/api/v1/auth/session",
                json!({}),
                Some(&cookie(&headers)),
                None,
                None,
            )
            .await;
            assert_eq!(status, StatusCode::UNAUTHORIZED);
        }
        let (status, headers, _) = request_json(
            &app,
            "POST",
            "/api/v1/auth/staff/login",
            json!({"email":"owner@staff.test","password":"WrongPassword!"}),
            None,
            None,
            None,
        )
        .await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
        assert!(!headers.contains_key(header::SET_COOKIE));
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/auth/staff/login")
                    .header(header::CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        r#"{"email":"owner@staff.test","password":"TestPassword123!"}"#,
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
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

        let (status, _, invalid_rule) = request_json(
            &app,
            "POST",
            "/api/v1/admin/commission-rules",
            json!({"rule_type":"percent","amount":10001,"valid_from_utc":"not-a-date"}),
            Some(&owner_cookie),
            Some(&owner_csrf),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(invalid_rule["code"], "INVALID_COMMISSION_RULE");

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

        let (status, _, barber_report) = request_json(
            &app,
            "GET",
            "/api/v1/reports/revenue",
            json!({}),
            Some(&barber_cookie),
            None,
            None,
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(barber_report["completed_count"], 1);
        assert_eq!(barber_report["revenue_cents"], 5000);
        assert_eq!(barber_report["commission_pending_count"], 1);

        // A rule linked to this barber and service settles earlier missing commissions.
        let rule = json!({"barber_user_id":barber_id,"service_id":service_id,"rule_type":"percent","amount":5000});
        let (status, _, _) = request_json(
            &app,
            "POST",
            "/api/v1/admin/commission-rules",
            rule.clone(),
            Some(&barber_cookie),
            Some(&barber_csrf),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::FORBIDDEN);
        let (status, _, _) = request_json(
            &app,
            "POST",
            "/api/v1/admin/commission-rules",
            rule.clone(),
            Some(&owner_cookie),
            Some(&owner_csrf),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::CREATED);
        let (_, _, settled) = request_json(
            &app,
            "GET",
            "/api/v1/reports/revenue",
            json!({}),
            Some(&barber_cookie),
            None,
            None,
        )
        .await;
        assert_eq!(settled["commission_cents"], 2500);
        assert_eq!(settled["commission_pending_count"], 0);
        // A later rate must not rewrite already posted financial history.
        let mut changed_rule = rule;
        changed_rule["amount"] = json!(7000);
        let (status, _, _) = request_json(
            &app,
            "POST",
            "/api/v1/admin/commission-rules",
            changed_rule,
            Some(&owner_cookie),
            Some(&owner_csrf),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::CREATED);
        let (_, _, preserved) = request_json(
            &app,
            "GET",
            "/api/v1/reports/revenue",
            json!({}),
            Some(&barber_cookie),
            None,
            None,
        )
        .await;
        assert_eq!(preserved["commission_cents"], 2500);
        assert_eq!(preserved["revenue_cents"], 5000);

        let (status, _, _) = request_json(
            &app,
            "GET",
            "/api/v1/reports/revenue",
            json!({}),
            Some(&client_cookie),
            None,
            None,
        )
        .await;
        assert_eq!(status, StatusCode::FORBIDDEN);
    }
}

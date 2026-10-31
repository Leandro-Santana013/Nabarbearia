use super::{
    authenticate, email_address, password_value, require_mutation, required_text, utc_text,
};
use crate::{
    AppState,
    db::insert_audit,
    error::{ApiResult, AppError},
    models::{AuthUser, UpdateAccountRequest},
    security::{hash_password, verify_password},
};
use axum::{Json, extract::State, http::HeaderMap};
use chrono::Utc;
use rusqlite::{TransactionBehavior, params};
use std::time::Duration;

pub(super) async fn update(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<UpdateAccountRequest>,
) -> ApiResult<Json<AuthUser>> {
    let context = authenticate(&state, &headers).await?;
    require_mutation(&state, &headers, &context)?;
    if !state.limiter.check(
        &format!("account:{}", context.user.id),
        10,
        Duration::from_secs(60),
    ) {
        return Err(AppError::too_many_requests());
    }
    let name = required_text(
        &request.display_name,
        2,
        120,
        "INVALID_NAME",
        "Display name is invalid",
    )?;
    let email = email_address(&request.email)?;
    let phone = request.phone.trim().to_string();
    if !phone.is_empty()
        && (!(10..=13).contains(&phone.len()) || !phone.bytes().all(|c| c.is_ascii_digit()))
    {
        return Err(AppError::bad_request(
            "INVALID_PHONE",
            "Phone must contain DDD and 10 to 13 digits",
        ));
    }
    let new_password = request
        .new_password
        .as_deref()
        .map(password_value)
        .transpose()?;
    let credentials_changed = email != context.user.email || new_password.is_some();
    let business = context.user.business_id.clone();
    let user_id = context.user.id.clone();
    let old_hash: String = state
        .db
        .with_conn(move |connection| -> Result<_, AppError> {
            Ok(connection.query_row(
                "SELECT password_hash FROM users WHERE business_id=?1 AND id=?2",
                params![business, user_id],
                |row| row.get(0),
            )?)
        })
        .await?;
    if credentials_changed {
        let current = request
            .current_password
            .filter(|p| p.chars().count() <= 128)
            .ok_or_else(|| {
                AppError::bad_request("CURRENT_PASSWORD_REQUIRED", "Current password is required")
            })?;
        if !verify_password(current, old_hash.clone()).await? {
            return Err(AppError::bad_request(
                "INCORRECT_PASSWORD",
                "Current password is incorrect",
            ));
        }
    }
    let new_hash = match new_password {
        Some(password) => Some(hash_password(password).await?),
        None => None,
    };
    let mut user = context.user;
    let result = state.db.with_conn(move |connection| -> Result<_, AppError> {
        let tx = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let now = utc_text(Utc::now());
        // Recheck after password verification so a revoked session or concurrent
        // credential change cannot authorize a late account update.
        let session_valid: bool = tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM sessions WHERE token_hash=?1 AND revoked_at_utc IS NULL AND expires_at_utc>?2 AND csrf_hash=?3)",
            params![context.token_hash, now, context.csrf_hash], |row| row.get(0),
        )?;
        if !session_valid { return Err(AppError::unauthorized()); }
        let taken: bool = tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM users WHERE business_id=?1 AND email=?2 AND id<>?3)",
            params![user.business_id, email, user.id], |row| row.get(0),
        )?;
        if taken { return Err(AppError::conflict("ACCOUNT_NOT_AVAILABLE", "Account is not available")); }
        let changed = tx.execute(
            "UPDATE users SET display_name=?1,email=?2,phone=?3,password_hash=COALESCE(?4,password_hash),updated_at_utc=?5 WHERE business_id=?6 AND id=?7 AND active=1 AND password_hash=?8 AND email=?9",
            params![name, email, phone, new_hash, now, user.business_id, user.id, old_hash, user.email],
        )?;
        if changed != 1 { return Err(AppError::conflict("ACCOUNT_CHANGED", "Account changed; reload before retrying")); }
        if credentials_changed {
            tx.execute("UPDATE sessions SET revoked_at_utc=?1 WHERE business_id=?2 AND user_id=?3 AND token_hash<>?4 AND revoked_at_utc IS NULL",
                params![now, user.business_id, user.id, context.token_hash])?;
        }
        insert_audit(&tx, &user.business_id, Some(&user.id), "account.updated", "user", &user.id, "{}")?;
        tx.commit()?;
        user.display_name = name;
        user.email = email;
        user.phone = phone;
        Ok(user)
    }).await?;
    Ok(Json(result))
}

#[cfg(test)]
mod tests;

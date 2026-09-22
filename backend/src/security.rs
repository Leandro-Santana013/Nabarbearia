use std::{
    collections::{HashMap, VecDeque},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use argon2::{
    Argon2,
    password_hash::{PasswordHasher, PasswordVerifier, phc::PasswordHash},
};
use axum::http::{HeaderMap, header};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use cookie::{Cookie, SameSite};
use rand::{TryRngCore, rngs::OsRng};
use sha2::{Digest, Sha256};
use thiserror::Error;

use crate::error::AppError;

pub const SESSION_COOKIE: &str = "na_session";
pub const CSRF_HEADER: &str = "x-csrf-token";

#[derive(Debug, Error)]
pub enum SecurityError {
    #[error("randomness unavailable")]
    Randomness,
}

pub fn random_token() -> Result<String, SecurityError> {
    let mut bytes = [0_u8; 32];
    OsRng
        .try_fill_bytes(&mut bytes)
        .map_err(|_| SecurityError::Randomness)?;
    Ok(URL_SAFE_NO_PAD.encode(bytes))
}

pub fn hash_token(token: &str) -> String {
    let digest = Sha256::digest(token.as_bytes());
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

pub async fn hash_password(password: String) -> Result<String, AppError> {
    tokio::task::spawn_blocking(move || {
        Argon2::default()
            .hash_password(password.as_bytes())
            .map(|hash| hash.to_string())
            .map_err(|_| AppError::Internal)
    })
    .await
    .map_err(|_| AppError::Internal)?
}

pub async fn verify_password(password: String, password_hash: String) -> Result<bool, AppError> {
    tokio::task::spawn_blocking(move || {
        let parsed = PasswordHash::new(&password_hash).map_err(|_| AppError::Internal)?;
        Ok(Argon2::default()
            .verify_password(password.as_bytes(), &parsed)
            .is_ok())
    })
    .await
    .map_err(|_| AppError::Internal)?
}

pub fn session_token(headers: &HeaderMap) -> Option<String> {
    let raw = headers.get(header::COOKIE)?.to_str().ok()?;
    Cookie::split_parse(raw)
        .filter_map(Result::ok)
        .find_map(|cookie| (cookie.name() == SESSION_COOKIE).then(|| cookie.value().to_string()))
}

pub fn csrf_token(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(CSRF_HEADER)
        .and_then(|value| value.to_str().ok())
}

pub fn session_cookie(token: &str, secure: bool, max_age: i64) -> String {
    Cookie::build((SESSION_COOKIE, token.to_string()))
        .path("/")
        .http_only(true)
        .same_site(SameSite::Lax)
        .secure(secure)
        .max_age(cookie::time::Duration::seconds(max_age))
        .build()
        .to_string()
}

pub fn removal_cookie(secure: bool) -> String {
    Cookie::build((SESSION_COOKIE, ""))
        .path("/")
        .http_only(true)
        .same_site(SameSite::Lax)
        .secure(secure)
        .max_age(cookie::time::Duration::seconds(0))
        .build()
        .to_string()
}

pub fn check_origin(
    headers: &HeaderMap,
    allowed_origins: &std::collections::HashSet<String>,
) -> Result<(), AppError> {
    let Some(origin) = headers
        .get(header::ORIGIN)
        .and_then(|value| value.to_str().ok())
    else {
        return Err(AppError::forbidden());
    };
    if !allowed_origins.contains(origin) {
        return Err(AppError::forbidden());
    }
    Ok(())
}

pub fn constant_time_eq(left: &str, right: &str) -> bool {
    let max_len = left.len().max(right.len());
    let mut difference = (left.len() ^ right.len()) as u8;
    for index in 0..max_len {
        let a = left.as_bytes().get(index).copied().unwrap_or_default();
        let b = right.as_bytes().get(index).copied().unwrap_or_default();
        difference |= a ^ b;
    }
    difference == 0
}

#[derive(Clone, Default)]
pub struct RateLimiter {
    events: Arc<Mutex<HashMap<String, VecDeque<Instant>>>>,
}

impl RateLimiter {
    pub fn check(&self, key: &str, limit: usize, window: Duration) -> bool {
        if key.is_empty() || key.len() > 320 {
            return false;
        }
        let Ok(mut events) = self.events.lock() else {
            return false;
        };
        let now = Instant::now();
        if !events.contains_key(key) && events.len() >= 10_000 {
            events.retain(|_, bucket| {
                while bucket
                    .front()
                    .is_some_and(|event| now.duration_since(*event) > window)
                {
                    bucket.pop_front();
                }
                !bucket.is_empty()
            });
            if events.len() >= 10_000 {
                return false;
            }
        }
        let bucket = events.entry(key.to_string()).or_default();
        while bucket
            .front()
            .is_some_and(|event| now.duration_since(*event) > window)
        {
            bucket.pop_front();
        }
        if bucket.len() >= limit {
            return false;
        }
        bucket.push_back(now);
        true
    }
}

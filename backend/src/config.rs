use std::{
    collections::HashSet,
    env, fmt,
    net::{IpAddr, SocketAddr},
    path::PathBuf,
    str::FromStr,
};

use thiserror::Error;

#[derive(Clone)]
pub struct Config {
    pub bind_addr: SocketAddr,
    pub db_path: PathBuf,
    pub bootstrap_token: String,
    pub allowed_origins: HashSet<String>,
    pub secure_cookies: bool,
    pub session_days: i64,
    pub timezone: String,
}

impl fmt::Debug for Config {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("Config")
            .field("bind_addr", &self.bind_addr)
            .field("db_path", &self.db_path)
            .field("bootstrap_token", &"[REDACTED]")
            .field("allowed_origins", &self.allowed_origins)
            .field("secure_cookies", &self.secure_cookies)
            .field("session_days", &self.session_days)
            .field("timezone", &self.timezone)
            .finish()
    }
}

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("invalid {0}: {1}")]
    Invalid(String, String),
    #[error("missing required environment variable {0}")]
    Missing(String),
}

impl Config {
    pub fn from_env() -> Result<Self, ConfigError> {
        let bind_addr = env::var("NABARBEARIA_BIND")
            .unwrap_or_else(|_| "127.0.0.1:3001".to_string())
            .parse::<SocketAddr>()
            .map_err(|error| ConfigError::Invalid("NABARBEARIA_BIND".into(), error.to_string()))?;

        let bind_is_loopback = matches!(bind_addr.ip(), IpAddr::V4(ip) if ip.is_loopback())
            || matches!(bind_addr.ip(), IpAddr::V6(ip) if ip.is_loopback());

        let bootstrap_token = env::var("NABARBEARIA_BOOTSTRAP_TOKEN")
            .map_err(|_| ConfigError::Missing("NABARBEARIA_BOOTSTRAP_TOKEN".into()))?;
        if !is_bootstrap_token_format(&bootstrap_token) {
            return Err(ConfigError::Invalid(
                "NABARBEARIA_BOOTSTRAP_TOKEN".into(),
                "must be a 32-byte CSPRNG token encoded as 43+ base64url characters or 64+ hexadecimal characters".into(),
            ));
        }

        let allowed_origins = env::var("NABARBEARIA_ALLOWED_ORIGINS")
            .unwrap_or_else(|_| "http://127.0.0.1:5173,http://localhost:5173".to_string())
            .split(',')
            .map(str::trim)
            .filter(|origin| !origin.is_empty())
            .map(ToOwned::to_owned)
            .collect::<HashSet<_>>();
        if allowed_origins.is_empty() {
            return Err(ConfigError::Invalid(
                "NABARBEARIA_ALLOWED_ORIGINS".into(),
                "must contain at least one origin".into(),
            ));
        }
        for origin in &allowed_origins {
            if !is_valid_origin(origin) {
                return Err(ConfigError::Invalid(
                    "NABARBEARIA_ALLOWED_ORIGINS".into(),
                    "origins must be exact http(s) origins without paths, wildcard, null, or credentials".into(),
                ));
            }
            if !bind_is_loopback && !origin.starts_with("https://") {
                return Err(ConfigError::Invalid(
                    "NABARBEARIA_ALLOWED_ORIGINS".into(),
                    "production origins must use https".into(),
                ));
            }
        }

        let secure_cookies = env::var("NABARBEARIA_SECURE_COOKIES")
            .unwrap_or_else(|_| "false".to_string())
            .parse::<bool>()
            .map_err(|error| {
                ConfigError::Invalid("NABARBEARIA_SECURE_COOKIES".into(), error.to_string())
            })?;
        if !bind_is_loopback && !secure_cookies {
            return Err(ConfigError::Invalid(
                "NABARBEARIA_SECURE_COOKIES".into(),
                "must be true when binding outside loopback".into(),
            ));
        }

        let session_days = env::var("NABARBEARIA_SESSION_DAYS")
            .unwrap_or_else(|_| "7".to_string())
            .parse::<i64>()
            .map_err(|error| {
                ConfigError::Invalid("NABARBEARIA_SESSION_DAYS".into(), error.to_string())
            })?;
        if !(1..=90).contains(&session_days) {
            return Err(ConfigError::Invalid(
                "NABARBEARIA_SESSION_DAYS".into(),
                "must be between 1 and 90".into(),
            ));
        }

        let timezone =
            env::var("NABARBEARIA_TIMEZONE").unwrap_or_else(|_| "America/Sao_Paulo".to_string());
        chrono_tz::Tz::from_str(&timezone).map_err(|_| {
            ConfigError::Invalid(
                "NABARBEARIA_TIMEZONE".into(),
                "unknown IANA timezone".into(),
            )
        })?;

        let db_path = env::var("NABARBEARIA_DB_PATH")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("backend/data/nabarbearia.db"));

        Ok(Self {
            bind_addr,
            db_path,
            bootstrap_token,
            allowed_origins,
            secure_cookies,
            session_days,
            timezone,
        })
    }
}

fn is_valid_origin(origin: &str) -> bool {
    if origin.is_empty() || origin == "*" || origin.eq_ignore_ascii_case("null") {
        return false;
    }
    let Ok(uri) = origin.parse::<http::Uri>() else {
        return false;
    };
    let Some(scheme) = uri.scheme_str() else {
        return false;
    };
    let Some(authority) = uri.authority() else {
        return false;
    };
    origin == format!("{scheme}://{authority}")
        && matches!(scheme, "http" | "https")
        && !authority.as_str().is_empty()
        && !authority.as_str().contains('@')
        && uri.query().is_none()
        && matches!(uri.path(), "" | "/")
}

fn is_bootstrap_token_format(token: &str) -> bool {
    let base64url = token.len() >= 43
        && token.len() <= 128
        && token
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'));
    let hexadecimal = token.len() >= 64
        && token.len() <= 128
        && token.bytes().all(|byte| byte.is_ascii_hexdigit());
    base64url || hexadecimal
}

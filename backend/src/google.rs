use std::time::Duration;

use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode, decode_header};
use serde::Deserialize;

const GOOGLE_CERTS_URL: &str = "https://www.googleapis.com/oauth2/v3/certs";

#[derive(Debug)]
pub struct GoogleIdentity {
    pub subject: String,
    pub email: String,
    pub display_name: Option<String>,
}

#[derive(Debug)]
pub enum GoogleTokenError {
    Invalid,
    Unavailable,
}

#[derive(Debug, Deserialize)]
struct GoogleJwks {
    keys: Vec<GoogleJwk>,
}

#[derive(Debug, Deserialize)]
struct GoogleJwk {
    kid: String,
    kty: String,
    n: String,
    e: String,
}

#[derive(Debug, Deserialize)]
struct GoogleClaims {
    iss: String,
    sub: String,
    aud: String,
    exp: usize,
    email: String,
    email_verified: bool,
    name: Option<String>,
}

pub async fn verify_id_token(
    id_token: &str,
    client_id: &str,
) -> Result<GoogleIdentity, GoogleTokenError> {
    if id_token.len() < 100 || id_token.len() > 8 * 1024 || client_id.is_empty() {
        return Err(GoogleTokenError::Invalid);
    }

    let header = decode_header(id_token).map_err(|_| GoogleTokenError::Invalid)?;
    if header.alg != Algorithm::RS256 {
        return Err(GoogleTokenError::Invalid);
    }
    let key_id = header.kid.ok_or(GoogleTokenError::Invalid)?;
    let jwks = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(|_| GoogleTokenError::Unavailable)?
        .get(GOOGLE_CERTS_URL)
        .send()
        .await
        .map_err(|_| GoogleTokenError::Unavailable)?
        .error_for_status()
        .map_err(|_| GoogleTokenError::Unavailable)?
        .json::<GoogleJwks>()
        .await
        .map_err(|_| GoogleTokenError::Unavailable)?;
    let key = jwks
        .keys
        .into_iter()
        .find(|key| key.kid == key_id && key.kty == "RSA")
        .ok_or(GoogleTokenError::Invalid)?;
    let decoding_key =
        DecodingKey::from_rsa_components(&key.n, &key.e).map_err(|_| GoogleTokenError::Invalid)?;
    let mut validation = Validation::new(Algorithm::RS256);
    validation.set_audience(&[client_id]);
    validation.set_issuer(&["https://accounts.google.com", "accounts.google.com"]);
    let claims = decode::<GoogleClaims>(id_token, &decoding_key, &validation)
        .map_err(|_| GoogleTokenError::Invalid)?
        .claims;

    if claims.iss != "https://accounts.google.com" && claims.iss != "accounts.google.com"
        || claims.aud != client_id
        || claims.exp == 0
        || claims.sub.trim().is_empty()
        || !claims.email_verified
    {
        return Err(GoogleTokenError::Invalid);
    }

    Ok(GoogleIdentity {
        subject: claims.sub,
        email: claims.email,
        display_name: claims.name,
    })
}

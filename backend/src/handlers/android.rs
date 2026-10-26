use crate::{
    AppState,
    error::{ApiResult, AppError},
};
use axum::{
    Json,
    extract::State,
    http::{StatusCode, header},
    response::{IntoResponse, Response},
};
use serde::{Deserialize, Serialize};

#[derive(Deserialize, Serialize)]
pub(super) struct AndroidRelease {
    version_code: u32,
    version_name: String,
    size_bytes: u64,
    sha256: String,
}

// Only version information is public. The APK still requires a staff session.
pub(super) async fn release(State(state): State<AppState>) -> ApiResult<Response> {
    let directory = state
        .config
        .db_path
        .parent()
        .unwrap_or(std::path::Path::new("."))
        .join("android");
    let release =
        tokio::task::spawn_blocking(move || -> Result<Option<AndroidRelease>, AppError> {
            let bytes = match std::fs::read(directory.join("release.json")) {
                Ok(bytes) => bytes,
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
                Err(_) => return Err(AppError::Internal),
            };
            let release: AndroidRelease =
                serde_json::from_slice(&bytes).map_err(|_| AppError::Internal)?;
            let apk = match std::fs::metadata(directory.join("NA-Barbearia-arm64-release.apk")) {
                Ok(file) => file,
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
                Err(_) => return Err(AppError::Internal),
            };
            if release.version_code == 0
                || release.version_name.is_empty()
                || release.size_bytes == 0
                || release.size_bytes != apk.len()
                || release.sha256.len() != 64
                || !release
                    .sha256
                    .bytes()
                    .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
            {
                return Err(AppError::Internal);
            }
            Ok(Some(release))
        })
        .await
        .map_err(|_| AppError::Internal)??;
    Ok(match release {
        Some(release) => ([(header::CACHE_CONTROL, "no-store")], Json(release)).into_response(),
        None => (
            StatusCode::NO_CONTENT,
            [(header::CACHE_CONTROL, "no-store")],
        )
            .into_response(),
    })
}

use crate::{
    AppState,
    android_release::AndroidRelease,
    error::{ApiResult, AppError},
};
use axum::{
    Json,
    extract::State,
    http::{StatusCode, header},
    response::{IntoResponse, Response},
};
use sha2::{Digest, Sha256};
use std::io::Read;

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
            let value = serde_json::from_slice(&bytes).map_err(|_| AppError::Internal)?;
            let release = AndroidRelease::parse(&value).ok_or(AppError::Internal)?;
            let mut apk =
                match std::fs::File::open(directory.join("NA-Barbearia-arm64-release.apk")) {
                    Ok(file) => file,
                    Err(_) => return Err(AppError::Internal),
                };
            if release.size_bytes != apk.metadata().map_err(|_| AppError::Internal)?.len() {
                return Err(AppError::Internal);
            }
            let mut hash = Sha256::new();
            let mut buffer = [0_u8; 65536];
            loop {
                let count = apk.read(&mut buffer).map_err(|_| AppError::Internal)?;
                if count == 0 {
                    break;
                }
                hash.update(&buffer[..count]);
            }
            if format!("{:x}", hash.finalize()) != release.sha256 {
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

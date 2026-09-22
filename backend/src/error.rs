use axum::{
    Json,
    http::{HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
};
use serde::Serialize;
use thiserror::Error;
use uuid::Uuid;

use crate::db::DbError;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("{message}")]
    Api {
        status: StatusCode,
        code: &'static str,
        message: &'static str,
    },
    #[error("database failure: {0}")]
    Db(#[from] DbError),
    #[error("sqlite failure: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("internal failure")]
    Internal,
}

impl AppError {
    pub fn bad_request(code: &'static str, message: &'static str) -> Self {
        Self::Api {
            status: StatusCode::BAD_REQUEST,
            code,
            message,
        }
    }

    pub fn unauthorized() -> Self {
        Self::Api {
            status: StatusCode::UNAUTHORIZED,
            code: "UNAUTHORIZED",
            message: "Authentication required",
        }
    }

    pub fn forbidden() -> Self {
        Self::Api {
            status: StatusCode::FORBIDDEN,
            code: "FORBIDDEN",
            message: "Insufficient permission",
        }
    }

    pub fn not_found(code: &'static str, message: &'static str) -> Self {
        Self::Api {
            status: StatusCode::NOT_FOUND,
            code,
            message,
        }
    }

    pub fn conflict(code: &'static str, message: &'static str) -> Self {
        Self::Api {
            status: StatusCode::CONFLICT,
            code,
            message,
        }
    }

    pub fn too_many_requests() -> Self {
        Self::Api {
            status: StatusCode::TOO_MANY_REQUESTS,
            code: "RATE_LIMITED",
            message: "Too many requests",
        }
    }
}

#[derive(Debug, Serialize)]
struct ErrorBody<'a> {
    code: &'a str,
    message: &'a str,
    request_id: &'a str,
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let request_id = Uuid::now_v7().to_string();
        let (status, code, message) = match self {
            Self::Api {
                status,
                code,
                message,
            } => (status, code, message),
            other => {
                tracing::error!(error = %other, request_id = %request_id, "request failed");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "INTERNAL_ERROR",
                    "An internal error occurred",
                )
            }
        };
        let mut headers = HeaderMap::new();
        headers.insert(
            "x-request-id",
            HeaderValue::from_str(&request_id).unwrap_or(HeaderValue::from_static("invalid")),
        );
        headers.insert("cache-control", HeaderValue::from_static("no-store"));
        (
            status,
            headers,
            Json(ErrorBody {
                code,
                message,
                request_id: &request_id,
            }),
        )
            .into_response()
    }
}

pub type ApiResult<T> = Result<T, AppError>;

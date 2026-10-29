use crate::db::DbError;

/// Business failures are independent of Axum and HTTP status codes.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("{message}")]
    Rejected {
        kind: Rejection,
        code: &'static str,
        message: &'static str,
    },
    #[error(transparent)]
    Db(#[from] DbError),
    #[error(transparent)]
    Sqlite(#[from] rusqlite::Error),
    #[error("internal failure")]
    Internal,
}

#[derive(Debug, Clone, Copy)]
pub enum Rejection {
    Invalid,
    Forbidden,
    Missing,
    Conflict,
}

impl Error {
    pub(super) fn bad_request(code: &'static str, message: &'static str) -> Self {
        Self::Rejected {
            kind: Rejection::Invalid,
            code,
            message,
        }
    }
    pub(super) fn forbidden() -> Self {
        Self::Rejected {
            kind: Rejection::Forbidden,
            code: "FORBIDDEN",
            message: "Insufficient permission",
        }
    }
    pub(super) fn not_found(code: &'static str, message: &'static str) -> Self {
        Self::Rejected {
            kind: Rejection::Missing,
            code,
            message,
        }
    }
    pub(super) fn conflict(code: &'static str, message: &'static str) -> Self {
        Self::Rejected {
            kind: Rejection::Conflict,
            code,
            message,
        }
    }
}

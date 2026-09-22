use std::{
    fs,
    path::Path,
    sync::{Arc, Mutex},
};

use rusqlite::Connection;
use sha2::{Digest, Sha256};
use thiserror::Error;

const MIGRATIONS: &[(i64, &str, &str)] = &[
    (1, "initial", include_str!("../migrations/0001_initial.sql")),
    (
        2,
        "barber_photos",
        include_str!("../migrations/0002_barber_photos.sql"),
    ),
    (
        3,
        "service_categories",
        include_str!("../migrations/0003_service_categories.sql"),
    ),
    (
        4,
        "barber_recommendations",
        include_str!("../migrations/0004_barber_recommendations.sql"),
    ),
    (
        5,
        "original_barber_photos",
        include_str!("../migrations/0005_original_barber_photos.sql"),
    ),
];

#[derive(Debug, Error)]
pub enum DbError {
    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("database task failed: {0}")]
    Join(#[from] tokio::task::JoinError),
    #[error("database mutex is poisoned")]
    Poisoned,
    #[error("database migration failed: {0}")]
    Migration(String),
    #[error("database path parent could not be created: {0}")]
    Path(String),
}

#[derive(Clone)]
pub struct Db {
    connection: Arc<Mutex<Connection>>,
}

impl Db {
    pub fn open(path: &Path) -> Result<Self, DbError> {
        if path != Path::new(":memory:")
            && let Some(parent) = path.parent()
        {
            fs::create_dir_all(parent).map_err(|error| DbError::Path(error.to_string()))?;
            restrict_directory_permissions(parent)?;
        }
        let connection = Connection::open(path)?;
        configure_connection(&connection)?;
        apply_migrations(&connection)?;
        if path != Path::new(":memory:") {
            restrict_file_permissions(path)?;
        }
        Ok(Self {
            connection: Arc::new(Mutex::new(connection)),
        })
    }

    pub fn in_memory() -> Result<Self, DbError> {
        Self::open(Path::new(":memory:"))
    }

    pub async fn with_conn<T, E, F>(&self, operation: F) -> Result<T, E>
    where
        T: Send + 'static,
        E: From<DbError> + Send + 'static,
        F: FnOnce(&mut Connection) -> Result<T, E> + Send + 'static,
    {
        let connection = Arc::clone(&self.connection);
        tokio::task::spawn_blocking(move || {
            let mut guard = connection.lock().map_err(|_| E::from(DbError::Poisoned))?;
            operation(&mut guard)
        })
        .await
        .map_err(|error| E::from(DbError::Join(error)))?
    }
}

fn configure_connection(connection: &Connection) -> Result<(), rusqlite::Error> {
    connection.busy_timeout(std::time::Duration::from_secs(5))?;
    connection.execute_batch(
        "PRAGMA foreign_keys = ON;
         PRAGMA journal_mode = WAL;
         PRAGMA synchronous = FULL;",
    )?;
    Ok(())
}

fn apply_migrations(connection: &Connection) -> Result<(), DbError> {
    connection.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            checksum TEXT NOT NULL,
            applied_at_utc TEXT NOT NULL
        );",
    )?;
    for &(version, name, contents) in MIGRATIONS {
        let checksum = migration_checksum(contents);
        let applied = connection.query_row(
            "SELECT checksum FROM schema_migrations WHERE version = ?1",
            [version],
            |row| row.get::<_, String>(0),
        );
        match applied {
            Ok(previous_checksum) if previous_checksum == checksum => continue,
            Ok(_) => {
                return Err(DbError::Migration(format!(
                    "migration {version} checksum differs from the database; refusing to start"
                )));
            }
            Err(rusqlite::Error::QueryReturnedNoRows) => {
                let transaction = connection.unchecked_transaction()?;
                transaction
                    .execute_batch(contents)
                    .map_err(|error| DbError::Migration(error.to_string()))?;
                transaction.execute(
                    "INSERT INTO schema_migrations(version, name, checksum, applied_at_utc) VALUES (?1, ?2, ?3, ?4)",
                    (version, name, &checksum, chrono::Utc::now().to_rfc3339()),
                )?;
                transaction.commit()?;
            }
            Err(error) => return Err(error.into()),
        }
    }
    Ok(())
}

fn migration_checksum(contents: &str) -> String {
    let digest = Sha256::digest(contents.as_bytes());
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[cfg(unix)]
fn restrict_directory_permissions(path: &Path) -> Result<(), DbError> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o700))
        .map_err(|error| DbError::Path(error.to_string()))
}

#[cfg(not(unix))]
fn restrict_directory_permissions(_path: &Path) -> Result<(), DbError> {
    // Windows ACLs are deployment-managed. The path never comes from HTTP input.
    Ok(())
}

#[cfg(unix)]
fn restrict_file_permissions(path: &Path) -> Result<(), DbError> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o600))
        .map_err(|error| DbError::Path(error.to_string()))
}

#[cfg(not(unix))]
fn restrict_file_permissions(_path: &Path) -> Result<(), DbError> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use rusqlite::params;

    use super::*;

    #[tokio::test]
    async fn composite_foreign_key_rejects_cross_business_role() {
        let db = Db::in_memory().unwrap();
        db.with_conn(|connection| -> Result<(), DbError> {
            let now = "2026-09-21T00:00:00Z";
            let business_a = "00000000-0000-7000-8000-000000000001";
            let business_b = "00000000-0000-7000-8000-000000000002";
            let user_b = "00000000-0000-7000-8000-000000000003";
            for business_id in [business_a, business_b] {
                connection.execute(
                    "INSERT INTO businesses(id, name, timezone, created_at_utc, updated_at_utc) VALUES (?1, 'Test', 'America/Sao_Paulo', ?2, ?2)",
                    params![business_id, now],
                )?;
            }
            connection.execute(
                "INSERT INTO users(id, business_id, email, password_hash, display_name, created_at_utc, updated_at_utc)
                 VALUES (?1, ?2, 'user@example.test', ?3, 'User', ?4, ?4)",
                params![user_b, business_b, "x".repeat(32), now],
            )?;
            let mixed_business = connection.execute(
                "INSERT INTO user_roles(business_id, user_id, role, created_at_utc) VALUES (?1, ?2, 'client', ?3)",
                params![business_a, user_b, now],
            );
            assert!(mixed_business.is_err());
            Ok(())
        })
        .await
        .unwrap();
    }
}

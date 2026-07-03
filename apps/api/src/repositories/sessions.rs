//! Sessões — apenas o hash do token toca o banco.

use crate::models::User;
use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

pub async fn create(
    pool: &PgPool,
    token_hash: &str,
    user_id: Uuid,
    expires_at: DateTime<Utc>,
) -> sqlx::Result<()> {
    sqlx::query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)")
        .bind(token_hash)
        .bind(user_id)
        .bind(expires_at)
        .execute(pool)
        .await?;
    Ok(())
}

/// Usuário da sessão válida (não expirada), com o vencimento atual.
pub async fn find_user(
    pool: &PgPool,
    token_hash: &str,
) -> sqlx::Result<Option<(User, DateTime<Utc>)>> {
    let row = sqlx::query_as::<_, UserWithExpiry>(
        r#"
        SELECT u.id, u.email, u.name, u.picture_url, u.prefs, s.expires_at
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = $1 AND s.expires_at > now()
        "#,
    )
    .bind(token_hash)
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|r| {
        (
            User {
                id: r.id,
                email: r.email,
                name: r.name,
                picture_url: r.picture_url,
                prefs: r.prefs,
            },
            r.expires_at,
        )
    }))
}

#[derive(sqlx::FromRow)]
struct UserWithExpiry {
    id: Uuid,
    email: String,
    name: String,
    picture_url: Option<String>,
    prefs: serde_json::Value,
    expires_at: DateTime<Utc>,
}

pub async fn renew(pool: &PgPool, token_hash: &str, expires_at: DateTime<Utc>) -> sqlx::Result<()> {
    sqlx::query("UPDATE sessions SET expires_at = $2 WHERE token_hash = $1")
        .bind(token_hash)
        .bind(expires_at)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn delete(pool: &PgPool, token_hash: &str) -> sqlx::Result<()> {
    sqlx::query("DELETE FROM sessions WHERE token_hash = $1")
        .bind(token_hash)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn delete_expired(pool: &PgPool) -> sqlx::Result<u64> {
    let res = sqlx::query("DELETE FROM sessions WHERE expires_at < now()")
        .execute(pool)
        .await?;
    Ok(res.rows_affected())
}

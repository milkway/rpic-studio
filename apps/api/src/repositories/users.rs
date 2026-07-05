//! Usuários — upsert a partir do perfil Google.

use crate::models::{User, UserAdminRow};
use sqlx::PgPool;
use uuid::Uuid;

pub async fn upsert_google_user(
    pool: &PgPool,
    google_sub: &str,
    email: &str,
    name: &str,
    picture_url: Option<&str>,
) -> sqlx::Result<User> {
    sqlx::query_as::<_, User>(
        r#"
        INSERT INTO users (google_sub, email, name, picture_url)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (google_sub) DO UPDATE
          SET email = EXCLUDED.email,
              name = EXCLUDED.name,
              picture_url = EXCLUDED.picture_url,
              last_login = now()
        RETURNING id, email, name, picture_url, prefs
        "#,
    )
    .bind(google_sub)
    .bind(email)
    .bind(name)
    .bind(picture_url)
    .fetch_one(pool)
    .await
}

/// Todos os usuários, mais recentes por último login primeiro (página admin).
pub async fn list_admin_rows(pool: &PgPool) -> sqlx::Result<Vec<UserAdminRow>> {
    sqlx::query_as::<_, UserAdminRow>(
        "SELECT email, name, created_at, last_login FROM users ORDER BY last_login DESC",
    )
    .fetch_all(pool)
    .await
}

/// Nº de sessões ainda válidas (não expiradas).
pub async fn active_session_count(pool: &PgPool) -> sqlx::Result<i64> {
    sqlx::query_scalar::<_, i64>("SELECT count(*) FROM sessions WHERE expires_at > now()")
        .fetch_one(pool)
        .await
}

pub async fn set_prefs(
    pool: &PgPool,
    user_id: Uuid,
    prefs: &serde_json::Value,
) -> sqlx::Result<()> {
    sqlx::query("UPDATE users SET prefs = $2 WHERE id = $1")
        .bind(user_id)
        .bind(prefs)
        .execute(pool)
        .await?;
    Ok(())
}

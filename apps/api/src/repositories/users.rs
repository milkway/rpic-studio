//! Usuários — upsert a partir do perfil Google.

use crate::models::User;
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

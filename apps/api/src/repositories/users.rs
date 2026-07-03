//! Usuários — upsert a partir do perfil Google.

use crate::models::User;
use sqlx::PgPool;

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
        RETURNING id, email, name, picture_url
        "#,
    )
    .bind(google_sub)
    .bind(email)
    .bind(name)
    .bind(picture_url)
    .fetch_one(pool)
    .await
}

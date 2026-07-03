//! Diagramas — todas as consultas filtram por dono (ownership no SQL).

use crate::models::{Diagram, DiagramSummary, SharedDiagram};
use sqlx::PgPool;
use uuid::Uuid;

pub async fn list(pool: &PgPool, user_id: Uuid) -> sqlx::Result<Vec<DiagramSummary>> {
    sqlx::query_as::<_, DiagramSummary>(
        r#"
        SELECT id, title, circuits, share_slug, updated_at
        FROM diagrams WHERE user_id = $1
        ORDER BY updated_at DESC
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
}

pub async fn create(
    pool: &PgPool,
    user_id: Uuid,
    title: &str,
    source: &str,
    circuits: bool,
) -> sqlx::Result<Diagram> {
    sqlx::query_as::<_, Diagram>(
        "INSERT INTO diagrams (user_id, title, source, circuits)
         VALUES ($1, $2, $3, $4)
         RETURNING id, title, source, circuits, share_slug, created_at, updated_at",
    )
    .bind(user_id)
    .bind(title)
    .bind(source)
    .bind(circuits)
    .fetch_one(pool)
    .await
}

pub async fn get(pool: &PgPool, user_id: Uuid, id: Uuid) -> sqlx::Result<Option<Diagram>> {
    sqlx::query_as::<_, Diagram>(
        "SELECT id, title, source, circuits, share_slug, created_at, updated_at
         FROM diagrams WHERE id = $1 AND user_id = $2",
    )
    .bind(id)
    .bind(user_id)
    .fetch_optional(pool)
    .await
}

pub async fn update(
    pool: &PgPool,
    user_id: Uuid,
    id: Uuid,
    title: &str,
    source: &str,
    circuits: bool,
) -> sqlx::Result<Option<Diagram>> {
    sqlx::query_as::<_, Diagram>(
        "UPDATE diagrams
         SET title = $3, source = $4, circuits = $5, updated_at = now()
         WHERE id = $1 AND user_id = $2
         RETURNING id, title, source, circuits, share_slug, created_at, updated_at",
    )
    .bind(id)
    .bind(user_id)
    .bind(title)
    .bind(source)
    .bind(circuits)
    .fetch_optional(pool)
    .await
}

pub async fn delete(pool: &PgPool, user_id: Uuid, id: Uuid) -> sqlx::Result<bool> {
    let res = sqlx::query("DELETE FROM diagrams WHERE id = $1 AND user_id = $2")
        .bind(id)
        .bind(user_id)
        .execute(pool)
        .await?;
    Ok(res.rows_affected() > 0)
}

/// Define o slug se ainda não houver; retorna o slug vigente.
pub async fn set_slug(
    pool: &PgPool,
    user_id: Uuid,
    id: Uuid,
    slug: &str,
) -> sqlx::Result<Option<String>> {
    sqlx::query_scalar::<_, String>(
        r#"
        UPDATE diagrams
        SET share_slug = COALESCE(share_slug, $3), updated_at = updated_at
        WHERE id = $1 AND user_id = $2
        RETURNING share_slug
        "#,
    )
    .bind(id)
    .bind(user_id)
    .bind(slug)
    .fetch_optional(pool)
    .await
}

pub async fn clear_slug(pool: &PgPool, user_id: Uuid, id: Uuid) -> sqlx::Result<bool> {
    let res = sqlx::query("UPDATE diagrams SET share_slug = NULL WHERE id = $1 AND user_id = $2")
        .bind(id)
        .bind(user_id)
        .execute(pool)
        .await?;
    Ok(res.rows_affected() > 0)
}

pub async fn get_shared(pool: &PgPool, slug: &str) -> sqlx::Result<Option<SharedDiagram>> {
    sqlx::query_as::<_, SharedDiagram>(
        "SELECT title, source, circuits, updated_at FROM diagrams WHERE share_slug = $1",
    )
    .bind(slug)
    .fetch_optional(pool)
    .await
}

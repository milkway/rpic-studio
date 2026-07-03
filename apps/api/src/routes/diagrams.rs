//! CRUD de diagramas do usuário + link curto público.

use crate::errors::{ApiError, ApiResult};
use crate::models::{Diagram, DiagramSummary, SharedDiagram};
use crate::repositories::diagrams;
use crate::services::session::CurrentUser;
use crate::AppState;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use utoipa::ToSchema;
use uuid::Uuid;

const MAX_SOURCE_BYTES: usize = 64 * 1024;
const MAX_TITLE_CHARS: usize = 200;

#[derive(Debug, Deserialize, ToSchema)]
pub struct DiagramInput {
    pub title: String,
    pub source: String,
    #[serde(default)]
    pub circuits: bool,
}

fn validate(input: &DiagramInput) -> ApiResult<()> {
    if input.title.trim().is_empty() || input.title.chars().count() > MAX_TITLE_CHARS {
        return Err(ApiError::BadRequest(format!(
            "título deve ter entre 1 e {MAX_TITLE_CHARS} caracteres"
        )));
    }
    if input.source.len() > MAX_SOURCE_BYTES {
        return Err(ApiError::BadRequest(format!(
            "código excede o limite de {} KB",
            MAX_SOURCE_BYTES / 1024
        )));
    }
    Ok(())
}

#[utoipa::path(get, path = "/api/diagrams", responses((status = 200, body = [DiagramSummary])))]
pub async fn list(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
) -> ApiResult<Json<Vec<DiagramSummary>>> {
    Ok(Json(diagrams::list(&state.pool, user.id).await?))
}

#[utoipa::path(post, path = "/api/diagrams", request_body = DiagramInput,
    responses((status = 201, body = Diagram)))]
pub async fn create(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Json(input): Json<DiagramInput>,
) -> ApiResult<(StatusCode, Json<Diagram>)> {
    validate(&input)?;
    let diagram = diagrams::create(
        &state.pool,
        user.id,
        input.title.trim(),
        &input.source,
        input.circuits,
    )
    .await?;
    Ok((StatusCode::CREATED, Json(diagram)))
}

#[utoipa::path(get, path = "/api/diagrams/{id}", responses((status = 200, body = Diagram)))]
pub async fn get(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<Diagram>> {
    diagrams::get(&state.pool, user.id, id)
        .await?
        .map(Json)
        .ok_or(ApiError::NotFound)
}

#[utoipa::path(put, path = "/api/diagrams/{id}", request_body = DiagramInput,
    responses((status = 200, body = Diagram)))]
pub async fn update(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Path(id): Path<Uuid>,
    Json(input): Json<DiagramInput>,
) -> ApiResult<Json<Diagram>> {
    validate(&input)?;
    diagrams::update(
        &state.pool,
        user.id,
        id,
        input.title.trim(),
        &input.source,
        input.circuits,
    )
    .await?
    .map(Json)
    .ok_or(ApiError::NotFound)
}

#[utoipa::path(delete, path = "/api/diagrams/{id}", responses((status = 204)))]
pub async fn delete(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Path(id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    if diagrams::delete(&state.pool, user.id, id).await? {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(ApiError::NotFound)
    }
}

/// POST /api/diagrams/{id}/share — gera (ou retorna) o slug público.
pub async fn share(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<serde_json::Value>> {
    // 40 bits de aleatoriedade; retry cobre a colisão rara (slug é UNIQUE).
    for _ in 0..3 {
        let candidate = Uuid::new_v4().simple().to_string()[..10].to_string();
        match diagrams::set_slug(&state.pool, user.id, id, &candidate).await {
            Ok(Some(slug)) => return Ok(Json(serde_json::json!({ "share_slug": slug }))),
            Ok(None) => return Err(ApiError::NotFound),
            Err(sqlx::Error::Database(e)) if e.is_unique_violation() => continue,
            Err(e) => return Err(e.into()),
        }
    }
    Err(ApiError::Other(anyhow::anyhow!(
        "não foi possível gerar um slug único"
    )))
}

/// DELETE /api/diagrams/{id}/share — revoga o link público.
pub async fn unshare(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Path(id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    if diagrams::clear_slug(&state.pool, user.id, id).await? {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(ApiError::NotFound)
    }
}

#[utoipa::path(get, path = "/api/shared/{slug}",
    responses((status = 200, body = SharedDiagram), (status = 404)))]
pub async fn shared(
    State(state): State<AppState>,
    Path(slug): Path<String>,
) -> ApiResult<Json<SharedDiagram>> {
    diagrams::get_shared(&state.pool, &slug)
        .await?
        .map(Json)
        .ok_or(ApiError::NotFound)
}

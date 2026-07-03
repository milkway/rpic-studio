//! Liveness.

use axum::Json;
use serde_json::{json, Value};

#[utoipa::path(get, path = "/health", responses((status = 200, description = "API viva")))]
pub async fn health() -> Json<Value> {
    Json(json!({ "status": "ok" }))
}

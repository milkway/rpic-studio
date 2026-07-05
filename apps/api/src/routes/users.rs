//! Administração: listagem de usuários (allowlist `ADMIN_EMAILS`).

use crate::errors::{ApiError, ApiResult};
use crate::models::UsersReport;
use crate::repositories::users;
use crate::services::session::CurrentUser;
use crate::AppState;
use axum::extract::State;
use axum::Json;

/// GET /api/users — todos que já logaram (só admin). 401 anônimo, 403 não-admin.
#[utoipa::path(get, path = "/api/users", responses(
    (status = 200, body = UsersReport),
    (status = 401, description = "sem sessão válida"),
    (status = 403, description = "sem permissão de admin")
))]
pub async fn list(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
) -> ApiResult<Json<UsersReport>> {
    if !state.config.is_admin(&user.email) {
        return Err(ApiError::Forbidden);
    }
    let rows = users::list_admin_rows(&state.pool).await?;
    let active_sessions = users::active_session_count(&state.pool).await?;
    Ok(Json(UsersReport {
        total: rows.len() as i64,
        active_sessions,
        users: rows,
    }))
}

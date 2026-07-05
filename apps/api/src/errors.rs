//! Tipo de erro unificado da API com mapeamento para respostas HTTP.

use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;

#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    #[error("recurso não encontrado")]
    NotFound,
    #[error("requisição inválida: {0}")]
    BadRequest(String),
    #[error("não autenticado")]
    Unauthorized,
    #[error("acesso negado")]
    Forbidden,
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error(transparent)]
    Other(#[from] anyhow::Error),
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, message) = match &self {
            ApiError::NotFound => (StatusCode::NOT_FOUND, self.to_string()),
            ApiError::BadRequest(_) => (StatusCode::BAD_REQUEST, self.to_string()),
            ApiError::Unauthorized => (StatusCode::UNAUTHORIZED, self.to_string()),
            ApiError::Forbidden => (StatusCode::FORBIDDEN, self.to_string()),
            ApiError::Database(e) => {
                // Nunca vazar detalhes sensíveis ao cliente; log interno completo.
                tracing::error!(error = %e, "erro de banco de dados");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "erro interno".to_string(),
                )
            }
            ApiError::Other(e) => {
                tracing::error!(error = %e, "erro interno");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "erro interno".to_string(),
                )
            }
        };
        (status, Json(json!({ "error": message }))).into_response()
    }
}

pub type ApiResult<T> = Result<T, ApiError>;

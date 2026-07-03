//! Modelos de domínio expostos pela API.

use chrono::{DateTime, Utc};
use serde::Serialize;
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, sqlx::FromRow, ToSchema)]
pub struct User {
    pub id: Uuid,
    pub email: String,
    pub name: String,
    pub picture_url: Option<String>,
}

/// Diagrama completo (inclui o código-fonte).
#[derive(Debug, Clone, Serialize, sqlx::FromRow, ToSchema)]
pub struct Diagram {
    pub id: Uuid,
    pub title: String,
    pub source: String,
    pub circuits: bool,
    pub share_slug: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Item da listagem (sem `source`, para a lista ficar leve).
#[derive(Debug, Clone, Serialize, sqlx::FromRow, ToSchema)]
pub struct DiagramSummary {
    pub id: Uuid,
    pub title: String,
    pub circuits: bool,
    pub share_slug: Option<String>,
    pub updated_at: DateTime<Utc>,
}

/// Diagrama público via link curto (somente leitura).
#[derive(Debug, Clone, Serialize, sqlx::FromRow, ToSchema)]
pub struct SharedDiagram {
    pub title: String,
    pub source: String,
    pub circuits: bool,
    pub updated_at: DateTime<Utc>,
}

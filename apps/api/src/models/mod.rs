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
    /// Preferências do cliente (papel do diagrama, idioma, tema…), JSON livre.
    #[schema(value_type = Object)]
    pub prefs: serde_json::Value,
    /// Acesso à administração (allowlist `ADMIN_EMAILS`). Não é coluna: derivado
    /// em `/api/auth/me` a partir do e-mail; `#[sqlx(default)]` para o `FromRow`.
    #[sqlx(default)]
    #[serde(default)]
    pub is_admin: bool,
}

/// Linha da listagem de administração (sem `id`/`prefs`; só o essencial).
#[derive(Debug, Clone, Serialize, sqlx::FromRow, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UserAdminRow {
    pub email: String,
    pub name: String,
    pub created_at: DateTime<Utc>,
    pub last_login: DateTime<Utc>,
}

/// Relatório da página de usuários (admin).
#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UsersReport {
    pub total: i64,
    pub active_sessions: i64,
    pub users: Vec<UserAdminRow>,
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

/// Item da listagem (inclui `source` para renderizar a miniatura).
#[derive(Debug, Clone, Serialize, sqlx::FromRow, ToSchema)]
pub struct DiagramSummary {
    pub id: Uuid,
    pub title: String,
    pub source: String,
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

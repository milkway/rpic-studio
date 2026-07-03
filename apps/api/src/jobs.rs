//! Jobs de manutenção em background.

use sqlx::PgPool;
use std::time::Duration;

/// Limpa sessões expiradas a cada hora.
pub fn spawn(pool: PgPool) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(3600));
        loop {
            interval.tick().await;
            match crate::repositories::sessions::delete_expired(&pool).await {
                Ok(0) => {}
                Ok(n) => tracing::info!(removidas = n, "sessões expiradas limpas"),
                Err(e) => tracing::warn!(error = %e, "falha na limpeza de sessões"),
            }
        }
    });
}

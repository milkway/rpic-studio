//! rpic API — binário. Telemetria, pool, jobs, rate limiting e serve.

use rpic_api::config::Config;
use rpic_api::{build_router, jobs, telemetry, AppState};
use sqlx::postgres::PgPoolOptions;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;
use tower_governor::{governor::GovernorConfigBuilder, GovernorLayer};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let config = Arc::new(Config::from_env()?);
    telemetry::init(&config.app_env);
    tracing::info!(env = %config.app_env, "iniciando rpic API");

    let pool = PgPoolOptions::new()
        .max_connections(10)
        .acquire_timeout(Duration::from_secs(8))
        .connect(&config.database_url)
        .await?;

    let state = AppState {
        pool: pool.clone(),
        config: config.clone(),
    };

    jobs::spawn(pool.clone());

    // Rate limiting por IP. `period` = intervalo para repor 1 token.
    let period_ms = (1000 / config.rate_limit_per_second.max(1)).max(1);
    let governor_conf = Arc::new(
        GovernorConfigBuilder::default()
            .period(Duration::from_millis(period_ms))
            .burst_size(config.rate_limit_burst)
            .finish()
            .expect("config de rate limit inválida"),
    );

    let app = build_router(state).layer(GovernorLayer::new(governor_conf));

    let addr: SocketAddr = format!("{}:{}", config.host, config.port).parse()?;
    let listener = tokio::net::TcpListener::bind(addr).await?;
    tracing::info!(%addr, "API ouvindo");
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await?;
    Ok(())
}

//! rpic API (biblioteca). Exposta para testes de integração in-process.

pub mod config;
pub mod errors;
pub mod jobs;
pub mod models;
pub mod repositories;
pub mod routes;
pub mod services;
pub mod telemetry;

use axum::http::{HeaderValue, Method};
use config::Config;
use sqlx::PgPool;
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use tower_http::limit::RequestBodyLimitLayer;
use tower_http::request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer};
use tower_http::trace::TraceLayer;
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub config: Arc<Config>,
}

#[derive(OpenApi)]
#[openapi(
    info(
        title = "rpic studio API",
        version = "0.1.0",
        description = "Login Google e diagramas rpic salvos"
    ),
    paths(
        routes::health::health,
        routes::auth::me,
        routes::users::list,
        routes::diagrams::list,
        routes::diagrams::create,
        routes::diagrams::get,
        routes::diagrams::update,
        routes::diagrams::delete,
        routes::diagrams::shared,
        routes::render::render,
    ),
    components(schemas(
        models::User,
        models::UserAdminRow,
        models::UsersReport,
        models::Diagram,
        models::DiagramSummary,
        models::SharedDiagram,
    ))
)]
pub struct ApiDoc;

/// Roteador completo SEM rate limiting (testável via `oneshot`).
/// O rate limiting é adicionado no binário, pois depende do IP do peer.
pub fn build_router(state: AppState) -> axum::Router {
    let cors = build_cors(&state.config);
    routes::router(state)
        .merge(SwaggerUi::new("/docs").url("/api-docs/openapi.json", ApiDoc::openapi()))
        // Fontes de diagrama têm limite de 64 KB; 256 KB cobre JSON + folga.
        .layer(RequestBodyLimitLayer::new(256 * 1024))
        .layer(TraceLayer::new_for_http())
        .layer(cors)
        .layer(PropagateRequestIdLayer::x_request_id())
        .layer(SetRequestIdLayer::x_request_id(MakeRequestUuid))
}

pub fn build_cors(config: &Config) -> CorsLayer {
    let origins: Vec<HeaderValue> = config
        .cors_allowed_origins
        .iter()
        .filter_map(|o| o.parse().ok())
        .collect();
    CorsLayer::new()
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_origin(origins)
}

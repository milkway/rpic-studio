//! Montagem do roteador da API.

pub mod auth;
pub mod diagrams;
pub mod health;
pub mod render;

use crate::AppState;
use axum::routing::{get, post, put};
use axum::Router;

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health::health))
        .route("/api/auth/config", get(auth::config))
        .route("/api/auth/google/login", get(auth::google_login))
        .route("/api/auth/google/callback", get(auth::google_callback))
        .route("/api/auth/logout", post(auth::logout))
        .route("/api/auth/me", get(auth::me))
        .route("/api/auth/prefs", put(auth::set_prefs))
        .route("/api/diagrams", get(diagrams::list).post(diagrams::create))
        .route(
            "/api/diagrams/{id}",
            get(diagrams::get)
                .put(diagrams::update)
                .delete(diagrams::delete),
        )
        .route(
            "/api/diagrams/{id}/share",
            post(diagrams::share).delete(diagrams::unshare),
        )
        .route("/api/shared/{slug}", get(diagrams::shared))
        .route("/api/render", post(render::render))
        .with_state(state)
}

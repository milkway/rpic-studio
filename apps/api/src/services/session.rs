//! Sessões próprias: token opaco em cookie httpOnly; o banco só vê sha256.
//! Renovação deslizante quando faltam menos de 15 dias.

use crate::errors::ApiError;
use crate::models::User;
use crate::repositories::sessions;
use crate::AppState;
use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};
use chrono::{Duration, Utc};
use sha2::{Digest, Sha256};
use uuid::Uuid;

pub const SESSION_COOKIE: &str = "rpic_session";
const SESSION_DAYS: i64 = 30;
const RENEW_THRESHOLD_DAYS: i64 = 15;

/// Token opaco de 244 bits de entropia (2 UUIDv4), em hex.
pub fn generate_token() -> String {
    format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple())
}

pub fn hash_token(token: &str) -> String {
    hex::encode(Sha256::digest(token.as_bytes()))
}

/// Cria a sessão no banco e devolve o cookie pronto.
pub async fn start_session(state: &AppState, user_id: Uuid) -> Result<Cookie<'static>, ApiError> {
    let token = generate_token();
    let expires_at = Utc::now() + Duration::days(SESSION_DAYS);
    sessions::create(&state.pool, &hash_token(&token), user_id, expires_at).await?;
    Ok(build_cookie(state, token, SESSION_DAYS))
}

pub fn build_cookie(state: &AppState, value: String, days: i64) -> Cookie<'static> {
    let mut cookie = Cookie::new(SESSION_COOKIE, value);
    cookie.set_http_only(true);
    cookie.set_same_site(SameSite::Lax);
    cookie.set_path("/");
    cookie.set_secure(state.config.cookie_secure);
    cookie.set_max_age(time::Duration::days(days));
    cookie.into_owned()
}

pub fn removal_cookie(state: &AppState) -> Cookie<'static> {
    build_cookie(state, String::new(), 0)
}

/// Extractor: usuário autenticado pela sessão do cookie. 401 sem sessão válida.
pub struct CurrentUser(pub User);

impl FromRequestParts<AppState> for CurrentUser {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let jar = CookieJar::from_request_parts(parts, state)
            .await
            .map_err(|_| ApiError::Unauthorized)?;
        let token = jar
            .get(SESSION_COOKIE)
            .map(|c| c.value().to_string())
            .filter(|v| !v.is_empty())
            .ok_or(ApiError::Unauthorized)?;
        let token_hash = hash_token(&token);
        let (user, expires_at) = sessions::find_user(&state.pool, &token_hash)
            .await?
            .ok_or(ApiError::Unauthorized)?;

        // Renovação deslizante (best-effort; falha não bloqueia a requisição).
        if expires_at - Utc::now() < Duration::days(RENEW_THRESHOLD_DAYS) {
            let new_expiry = Utc::now() + Duration::days(SESSION_DAYS);
            if let Err(e) = sessions::renew(&state.pool, &token_hash, new_expiry).await {
                tracing::warn!(error = %e, "falha ao renovar sessão");
            }
        }
        Ok(CurrentUser(user))
    }
}

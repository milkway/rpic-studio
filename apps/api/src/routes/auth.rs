//! Autenticação: fluxo Google OAuth (code + PKCE) e sessão por cookie.

use crate::errors::{ApiError, ApiResult};
use crate::models::User;
use crate::repositories::users;
use crate::services::google_oauth::{self, OauthFlow};
use crate::services::session::{self, CurrentUser, SESSION_COOKIE};
use crate::AppState;
use axum::extract::{Query, State};
use axum::response::Redirect;
use axum::Json;
use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};
use serde::Deserialize;

const OAUTH_COOKIE: &str = "rpic_oauth";

/// `next` só pode ser um caminho interno do app (evita open redirect).
fn safe_next(next: Option<String>) -> String {
    match next {
        Some(n) if n.starts_with('/') && !n.starts_with("//") => n,
        _ => "/".to_string(),
    }
}

fn oauth_cookie(state: &AppState, value: String, minutes: i64) -> Cookie<'static> {
    let mut c = Cookie::new(OAUTH_COOKIE, value);
    c.set_http_only(true);
    c.set_same_site(SameSite::Lax);
    c.set_path("/");
    c.set_secure(state.config.cookie_secure);
    c.set_max_age(time::Duration::minutes(minutes));
    c.into_owned()
}

/// GET /api/auth/config — o frontend só exibe "Entrar" se o login existir.
pub async fn config(State(state): State<AppState>) -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "google_login": !state.config.google_client_id.is_empty()
    }))
}

#[derive(Deserialize)]
pub struct LoginParams {
    next: Option<String>,
}

/// GET /api/auth/google/login — inicia o fluxo e redireciona ao Google.
pub async fn google_login(
    State(state): State<AppState>,
    jar: CookieJar,
    Query(params): Query<LoginParams>,
) -> ApiResult<(CookieJar, Redirect)> {
    if state.config.google_client_id.is_empty() {
        return Err(ApiError::BadRequest(
            "login não configurado (GOOGLE_CLIENT_ID ausente)".into(),
        ));
    }
    let flow = OauthFlow::new(safe_next(params.next));
    let url = google_oauth::auth_url(&state.config, &flow);
    let jar = jar.add(oauth_cookie(&state, flow.encode(), 10));
    Ok((jar, Redirect::temporary(&url)))
}

#[derive(Deserialize)]
pub struct CallbackParams {
    code: Option<String>,
    state: Option<String>,
}

/// GET /api/auth/google/callback — valida state, troca o code, cria a sessão.
/// Falhas redirecionam ao app com `?auth=erro` (UX melhor que JSON de erro).
pub async fn google_callback(
    State(state): State<AppState>,
    jar: CookieJar,
    Query(params): Query<CallbackParams>,
) -> (CookieJar, Redirect) {
    let fail = |jar: CookieJar| {
        let url = format!("{}/?auth=erro", state.config.app_base_url);
        (jar, Redirect::temporary(&url))
    };

    let Some(flow) = jar
        .get(OAUTH_COOKIE)
        .and_then(|c| OauthFlow::decode(c.value()))
    else {
        tracing::warn!("callback sem cookie de fluxo oauth");
        return fail(jar);
    };
    let jar = jar.add(oauth_cookie(&state, String::new(), 0));

    let (Some(code), Some(returned_state)) = (params.code, params.state) else {
        tracing::warn!("callback sem code/state");
        return fail(jar);
    };
    if returned_state != flow.state {
        tracing::warn!("state CSRF divergente no callback oauth");
        return fail(jar);
    }

    let google_user = match google_oauth::fetch_user(&state.config, &code, &flow.verifier).await {
        Ok(u) => u,
        Err(e) => {
            tracing::error!(error = %e, "falha na troca de code/userinfo");
            return fail(jar);
        }
    };

    let user = match users::upsert_google_user(
        &state.pool,
        &google_user.sub,
        &google_user.email,
        &google_user.name,
        google_user.picture.as_deref(),
    )
    .await
    {
        Ok(u) => u,
        Err(e) => {
            tracing::error!(error = %e, "falha ao upsert do usuário");
            return fail(jar);
        }
    };

    let session_cookie = match session::start_session(&state, user.id).await {
        Ok(c) => c,
        Err(e) => {
            tracing::error!(error = ?e, "falha ao criar sessão");
            return fail(jar);
        }
    };

    let url = format!("{}{}", state.config.app_base_url, flow.next);
    (jar.add(session_cookie), Redirect::temporary(&url))
}

/// POST /api/auth/logout — encerra a sessão e limpa o cookie.
pub async fn logout(State(state): State<AppState>, jar: CookieJar) -> ApiResult<CookieJar> {
    if let Some(token) = jar.get(SESSION_COOKIE).map(|c| c.value().to_string()) {
        crate::repositories::sessions::delete(&state.pool, &session::hash_token(&token)).await?;
    }
    Ok(jar.add(session::removal_cookie(&state)))
}

/// GET /api/auth/me — usuário da sessão atual (401 sem sessão).
#[utoipa::path(get, path = "/api/auth/me", responses(
    (status = 200, body = User),
    (status = 401, description = "sem sessão válida")
))]
pub async fn me(CurrentUser(user): CurrentUser) -> Json<User> {
    Json(user)
}

const MAX_PREFS_BYTES: usize = 8 * 1024;

/// PUT /api/auth/prefs — persiste as preferências do cliente na conta.
pub async fn set_prefs(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Json(prefs): Json<serde_json::Value>,
) -> ApiResult<Json<serde_json::Value>> {
    if !prefs.is_object() {
        return Err(ApiError::BadRequest("prefs deve ser um objeto JSON".into()));
    }
    let size = serde_json::to_vec(&prefs).map(|v| v.len()).unwrap_or(0);
    if size > MAX_PREFS_BYTES {
        return Err(ApiError::BadRequest(format!(
            "prefs excede o limite de {} KB",
            MAX_PREFS_BYTES / 1024
        )));
    }
    crate::repositories::users::set_prefs(&state.pool, user.id, &prefs).await?;
    Ok(Json(prefs))
}

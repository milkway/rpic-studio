//! Testes de integração in-process (tower::oneshot) contra o Postgres local.
//! Requer DATABASE_URL acessível (docker compose up postgres). Cada teste cria
//! seus próprios usuários (google_sub aleatório) — sem interferência cruzada.

use axum::body::Body;
use axum::http::{header, Request, StatusCode};
use chrono::{Duration, Utc};
use http_body_util::BodyExt;
use rpic_api::config::Config;
use rpic_api::models::User;
use rpic_api::services::session::{generate_token, hash_token};
use rpic_api::{build_router, AppState};
use sqlx::PgPool;
use std::sync::Arc;
use tower::util::ServiceExt;
use uuid::Uuid;

async fn test_state() -> AppState {
    let config = Config::from_env().expect("config de teste (DATABASE_URL) ausente");
    let pool = PgPool::connect(&config.database_url)
        .await
        .expect("postgres de teste indisponível — rode: docker compose -f infra/docker-compose.yml up -d postgres");
    AppState {
        pool,
        config: Arc::new(config),
    }
}

/// Cria usuário + sessão válida; retorna (usuário, valor do header Cookie).
async fn login_test_user(state: &AppState) -> (User, String) {
    let sub = format!("test-{}", Uuid::new_v4().simple());
    let user = rpic_api::repositories::users::upsert_google_user(
        &state.pool,
        &sub,
        &format!("{sub}@teste.local"),
        "Usuário de Teste",
        None,
    )
    .await
    .expect("upsert do usuário de teste");
    let token = generate_token();
    rpic_api::repositories::sessions::create(
        &state.pool,
        &hash_token(&token),
        user.id,
        Utc::now() + Duration::days(1),
    )
    .await
    .expect("sessão de teste");
    (user, format!("rpic_session={token}"))
}

async fn body_json(response: axum::response::Response) -> serde_json::Value {
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    serde_json::from_slice(&bytes).unwrap()
}

fn post_json(uri: &str, cookie: &str, body: serde_json::Value) -> Request<Body> {
    Request::builder()
        .method("POST")
        .uri(uri)
        .header(header::COOKIE, cookie)
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(body.to_string()))
        .unwrap()
}

fn get_req(uri: &str, cookie: Option<&str>) -> Request<Body> {
    let mut b = Request::builder().uri(uri);
    if let Some(c) = cookie {
        b = b.header(header::COOKIE, c);
    }
    b.body(Body::empty()).unwrap()
}

#[tokio::test]
async fn me_sem_sessao_retorna_401() {
    let app = build_router(test_state().await);
    let res = app.oneshot(get_req("/api/auth/me", None)).await.unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn me_com_sessao_retorna_usuario() {
    let state = test_state().await;
    let (user, cookie) = login_test_user(&state).await;
    let app = build_router(state);
    let res = app
        .oneshot(get_req("/api/auth/me", Some(&cookie)))
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let json = body_json(res).await;
    assert_eq!(json["email"], user.email.as_str());
}

#[tokio::test]
async fn crud_de_diagramas_completo() {
    let state = test_state().await;
    let (_, cookie) = login_test_user(&state).await;
    let app = build_router(state);

    // create
    let res = app
        .clone()
        .oneshot(post_json(
            "/api/diagrams",
            &cookie,
            serde_json::json!({ "title": "Meu fluxo", "source": "box \"a\"", "circuits": false }),
        ))
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::CREATED);
    let created = body_json(res).await;
    let id = created["id"].as_str().unwrap().to_string();

    // list
    let res = app
        .clone()
        .oneshot(get_req("/api/diagrams", Some(&cookie)))
        .await
        .unwrap();
    let list = body_json(res).await;
    assert!(list
        .as_array()
        .unwrap()
        .iter()
        .any(|d| d["id"] == id.as_str()));
    // a lista inclui o código (para renderizar a miniatura)
    assert!(list[0]["source"].is_string());

    // update
    let res = app
        .clone()
        .oneshot({
            Request::builder()
                .method("PUT")
                .uri(format!("/api/diagrams/{id}"))
                .header(header::COOKIE, &cookie)
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    serde_json::json!({ "title": "Renomeado", "source": "circle \"b\"", "circuits": true })
                        .to_string(),
                ))
                .unwrap()
        })
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    assert_eq!(body_json(res).await["title"], "Renomeado");

    // delete → get 404
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri(format!("/api/diagrams/{id}"))
                .header(header::COOKIE, &cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::NO_CONTENT);
    let res = app
        .oneshot(get_req(&format!("/api/diagrams/{id}"), Some(&cookie)))
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn diagrama_de_outro_usuario_e_404() {
    let state = test_state().await;
    let (_, cookie_a) = login_test_user(&state).await;
    let (_, cookie_b) = login_test_user(&state).await;
    let app = build_router(state);

    let res = app
        .clone()
        .oneshot(post_json(
            "/api/diagrams",
            &cookie_a,
            serde_json::json!({ "title": "Privado de A", "source": "box" }),
        ))
        .await
        .unwrap();
    let id = body_json(res).await["id"].as_str().unwrap().to_string();

    let res = app
        .oneshot(get_req(&format!("/api/diagrams/{id}"), Some(&cookie_b)))
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn compartilhar_gera_slug_publico_e_revogavel() {
    let state = test_state().await;
    let (_, cookie) = login_test_user(&state).await;
    let app = build_router(state);

    let res = app
        .clone()
        .oneshot(post_json(
            "/api/diagrams",
            &cookie,
            serde_json::json!({ "title": "Público", "source": "ellipse \"oi\"" }),
        ))
        .await
        .unwrap();
    let id = body_json(res).await["id"].as_str().unwrap().to_string();

    // gera slug
    let res = app
        .clone()
        .oneshot(post_json(
            &format!("/api/diagrams/{id}/share"),
            &cookie,
            serde_json::json!({}),
        ))
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let slug = body_json(res).await["share_slug"]
        .as_str()
        .unwrap()
        .to_string();

    // acesso público sem cookie
    let res = app
        .clone()
        .oneshot(get_req(&format!("/api/shared/{slug}"), None))
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    assert_eq!(body_json(res).await["title"], "Público");

    // revoga → público some
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri(format!("/api/diagrams/{id}/share"))
                .header(header::COOKIE, &cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::NO_CONTENT);
    let res = app
        .oneshot(get_req(&format!("/api/shared/{slug}"), None))
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn logout_invalida_a_sessao() {
    let state = test_state().await;
    let (_, cookie) = login_test_user(&state).await;
    let app = build_router(state);

    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/auth/logout")
                .header(header::COOKIE, &cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);

    let res = app
        .oneshot(get_req("/api/auth/me", Some(&cookie)))
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn prefs_persistem_na_conta() {
    let state = test_state().await;
    let (_, cookie) = login_test_user(&state).await;
    let app = build_router(state);

    // me começa com prefs vazio
    let res = app
        .clone()
        .oneshot(get_req("/api/auth/me", Some(&cookie)))
        .await
        .unwrap();
    assert_eq!(body_json(res).await["prefs"], serde_json::json!({}));

    // grava e lê de volta
    let prefs =
        serde_json::json!({ "canvas": { "pattern": "lines", "bg": "#faf4e6" }, "locale": "pt" });
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri("/api/auth/prefs")
                .header(header::COOKIE, &cookie)
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(prefs.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);

    let res = app
        .clone()
        .oneshot(get_req("/api/auth/me", Some(&cookie)))
        .await
        .unwrap();
    assert_eq!(body_json(res).await["prefs"], prefs);

    // não-objeto é rejeitado
    let res = app
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri("/api/auth/prefs")
                .header(header::COOKIE, &cookie)
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from("[1,2,3]"))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn valida_limites_de_titulo_e_fonte() {
    let state = test_state().await;
    let (_, cookie) = login_test_user(&state).await;
    let app = build_router(state);

    let res = app
        .clone()
        .oneshot(post_json(
            "/api/diagrams",
            &cookie,
            serde_json::json!({ "title": "   ", "source": "box" }),
        ))
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::BAD_REQUEST);

    let res = app
        .oneshot(post_json(
            "/api/diagrams",
            &cookie,
            serde_json::json!({ "title": "Grande", "source": "x".repeat(65 * 1024) }),
        ))
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::BAD_REQUEST);
}

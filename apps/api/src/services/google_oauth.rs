//! Google OAuth 2.0 — authorization code + PKCE, implementado direto sobre
//! reqwest (endpoints estáveis documentados pelo Google).

use crate::config::Config;
use anyhow::Context;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use uuid::Uuid;

const AUTH_ENDPOINT: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT: &str = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT: &str = "https://openidconnect.googleapis.com/v1/userinfo";

/// Estado efêmero do fluxo, guardado num cookie temporário (10 min).
#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct OauthFlow {
    pub state: String,
    pub verifier: String,
    pub next: String,
}

impl OauthFlow {
    pub fn new(next: String) -> Self {
        Self {
            // 122 bits de entropia cada — suficiente para state CSRF e verifier PKCE.
            state: Uuid::new_v4().simple().to_string(),
            verifier: format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple()),
            next,
        }
    }

    pub fn encode(&self) -> String {
        URL_SAFE_NO_PAD.encode(serde_json::to_vec(self).expect("OauthFlow serializável"))
    }

    pub fn decode(raw: &str) -> Option<Self> {
        let bytes = URL_SAFE_NO_PAD.decode(raw).ok()?;
        serde_json::from_slice(&bytes).ok()
    }
}

fn code_challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

/// URL de autorização do Google para este fluxo.
pub fn auth_url(config: &Config, flow: &OauthFlow) -> String {
    let params = [
        ("client_id", config.google_client_id.as_str()),
        ("redirect_uri", &config.google_redirect_uri()),
        ("response_type", "code"),
        ("scope", "openid email profile"),
        ("state", &flow.state),
        ("code_challenge", &code_challenge(&flow.verifier)),
        ("code_challenge_method", "S256"),
        ("prompt", "select_account"),
    ];
    let query = params
        .iter()
        .map(|(k, v)| format!("{}={}", k, urlencode(v)))
        .collect::<Vec<_>>()
        .join("&");
    format!("{AUTH_ENDPOINT}?{query}")
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
}

#[derive(Debug, Deserialize)]
pub struct GoogleUser {
    pub sub: String,
    pub email: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub picture: Option<String>,
}

/// Troca o code por tokens e busca o perfil do usuário.
pub async fn fetch_user(config: &Config, code: &str, verifier: &str) -> anyhow::Result<GoogleUser> {
    let client = reqwest::Client::new();
    let form_body = [
        ("client_id", config.google_client_id.as_str()),
        ("client_secret", config.google_client_secret.as_str()),
        ("code", code),
        ("code_verifier", verifier),
        ("grant_type", "authorization_code"),
        ("redirect_uri", &config.google_redirect_uri()),
    ]
    .iter()
    .map(|(k, v)| format!("{}={}", k, urlencode(v)))
    .collect::<Vec<_>>()
    .join("&");
    let token: TokenResponse = client
        .post(TOKEN_ENDPOINT)
        .header("content-type", "application/x-www-form-urlencoded")
        .body(form_body)
        .send()
        .await
        .context("falha ao chamar o token endpoint")?
        .error_for_status()
        .context("token endpoint retornou erro")?
        .json()
        .await
        .context("resposta de token inválida")?;

    let user: GoogleUser = client
        .get(USERINFO_ENDPOINT)
        .bearer_auth(&token.access_token)
        .send()
        .await
        .context("falha ao buscar userinfo")?
        .error_for_status()
        .context("userinfo retornou erro")?
        .json()
        .await
        .context("userinfo inválido")?;
    Ok(user)
}

/// Percent-encoding mínimo para parâmetros de query.
fn urlencode(s: &str) -> String {
    let mut out = String::with_capacity(s.len() * 3);
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

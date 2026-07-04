//! Render server-side: recebe código pic e devolve SVG, PNG ou PDF.
//! Público e rate-limited. O código é tratado como NÃO confiável (includes de
//! arquivo negados). CPU-bound → roda em `spawn_blocking`.

use crate::errors::{ApiError, ApiResult};
use axum::body::Body;
use axum::extract::Query;
use axum::http::header;
use axum::response::Response;
use rpic_core::{CompileOptions, IncludePolicy};
use serde::Deserialize;
use std::sync::Once;

/// Registra o renderer de math (RaTeX) uma vez, para `texlabels` funcionar.
static MATH_INIT: Once = Once::new();
fn ensure_math() {
    MATH_INIT.call_once(|| {
        rpic_core::set_math_renderer(rpic_render::math::render_math);
    });
}

#[derive(Debug, Deserialize)]
pub struct RenderQuery {
    /// svg (padrão) | png | pdf
    format: Option<String>,
    /// densidade do PNG (0.5–4, padrão 2)
    scale: Option<f32>,
    /// carrega a biblioteca de circuitos
    circuits: Option<bool>,
    /// tipografa rótulos `$…$` como math TeX
    texlabels: Option<bool>,
}

enum Rendered {
    Text(String, &'static str),
    Bytes(Vec<u8>, &'static str),
}

/// POST /api/render?format=svg|png|pdf&scale=2&circuits=true&texlabels=true
/// Corpo: o código pic (text/plain). Erros de compilação → 400.
#[utoipa::path(
    post, path = "/api/render",
    request_body(content = String, description = "código pic", content_type = "text/plain"),
    responses(
        (status = 200, description = "SVG, PNG ou PDF conforme `format`"),
        (status = 400, description = "erro de compilação/render")
    )
)]
pub async fn render(Query(q): Query<RenderQuery>, src: String) -> ApiResult<Response> {
    let format = q.format.unwrap_or_else(|| "svg".into()).to_lowercase();
    let scale = q.scale.unwrap_or(2.0).clamp(0.5, 4.0);
    let circuits = q.circuits.unwrap_or(false);
    let texlabels = q.texlabels.unwrap_or(false);

    let out = tokio::task::spawn_blocking(move || -> Result<Rendered, String> {
        ensure_math();
        let opts = CompileOptions {
            circuits,
            texlabels,
            // Código de terceiros: nunca resolver `copy "arquivo"` do disco.
            includes: IncludePolicy::Deny,
            ..Default::default()
        };
        let svg = rpic_core::render_svg_with_options(&src, &opts)?;
        match format.as_str() {
            "png" => Ok(Rendered::Bytes(
                rpic_render::to_png(&svg, scale)?,
                "image/png",
            )),
            "pdf" => Ok(Rendered::Bytes(
                rpic_render::to_pdf(&svg)?,
                "application/pdf",
            )),
            "svg" => Ok(Rendered::Text(svg, "image/svg+xml; charset=utf-8")),
            other => Err(format!("formato inválido: {other} (use svg, png ou pdf)")),
        }
    })
    .await
    .map_err(|e| ApiError::Other(anyhow::anyhow!("render task falhou: {e}")))?
    .map_err(ApiError::BadRequest)?;

    let resp = match out {
        Rendered::Text(s, ct) => Response::builder()
            .header(header::CONTENT_TYPE, ct)
            .body(Body::from(s)),
        Rendered::Bytes(b, ct) => Response::builder()
            .header(header::CONTENT_TYPE, ct)
            .body(Body::from(b)),
    }
    .map_err(|e| ApiError::Other(anyhow::anyhow!(e)))?;
    Ok(resp)
}

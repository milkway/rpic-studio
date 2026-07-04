//! Render server-side: recebe código pic e devolve SVG, PNG ou PDF.
//! Público e rate-limited. O código é tratado como NÃO confiável (includes de
//! arquivo negados). CPU-bound → roda em `spawn_blocking`.
//!
//! Fonte: por padrão o `rpic-render` embute a própria (consistente com o CLI).
//! Com `google_font=Família` (restrito ao catálogo), busca o TTF no Google,
//! cacheia e rasteriza com um fontdb próprio — casando com a fonte do studio.

use crate::errors::{ApiError, ApiResult};
use axum::body::Body;
use axum::extract::Query;
use axum::http::header;
use axum::response::Response;
use rpic_core::{CompileOptions, IncludePolicy};
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::{LazyLock, Mutex, Once};

/// Registra o renderer de math (RaTeX) uma vez, para `texlabels` funcionar.
static MATH_INIT: Once = Once::new();
fn ensure_math() {
    MATH_INIT.call_once(|| {
        rpic_core::set_math_renderer(rpic_render::math::render_math);
    });
}

/// Catálogo permitido de Google Fonts (mesmo do frontend) — evita fetch de
/// nomes arbitrários (mitiga SSRF).
const GOOGLE_FONTS: &[&str] = &[
    "Roboto",
    "Open Sans",
    "Lato",
    "Montserrat",
    "Poppins",
    "Inter",
    "Nunito",
    "Nunito Sans",
    "Work Sans",
    "Source Sans 3",
    "Noto Sans",
    "Raleway",
    "Ubuntu",
    "Rubik",
    "Mulish",
    "DM Sans",
    "Manrope",
    "Barlow",
    "Kanit",
    "Oswald",
    "Fira Sans",
    "PT Sans",
    "Karla",
    "Josefin Sans",
    "Quicksand",
    "Cabin",
    "Assistant",
    "Titillium Web",
    "Archivo",
    "Space Grotesk",
    "Merriweather",
    "Playfair Display",
    "Lora",
    "PT Serif",
    "Noto Serif",
    "Source Serif 4",
    "Bitter",
    "Crimson Text",
    "EB Garamond",
    "Cormorant",
    "Libre Baskerville",
    "Zilla Slab",
    "Roboto Slab",
    "Vollkorn",
    "Spectral",
    "Roboto Mono",
    "Source Code Pro",
    "JetBrains Mono",
    "Fira Code",
    "Space Mono",
    "Inconsolata",
    "Ubuntu Mono",
    "Cousine",
    "IBM Plex Mono",
    "Bebas Neue",
    "Righteous",
    "Archivo Black",
    "Abril Fatface",
    "Comfortaa",
    "Pacifico",
    "Caveat",
    "Dancing Script",
    "Lobster",
    "Satisfy",
    "Shadows Into Light",
    "Permanent Marker",
    "Indie Flower",
];

fn allowed_font(name: &str) -> Option<&'static str> {
    GOOGLE_FONTS
        .iter()
        .copied()
        .find(|f| f.eq_ignore_ascii_case(name))
}

static FONT_CACHE: LazyLock<Mutex<HashMap<String, Vec<Vec<u8>>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// Busca (e cacheia) TODOS os pesos/estilos (400/700 × normal/italic) de uma
/// Google Font, para fidelidade de peso — negrito usa o glyph bold real, não
/// sintetizado. Com um UA de Android antigo o Google serve o TTF ESTÁTICO
/// completo (`/s/…ttf`); o fontdb não lê woff2 nem o subset `/l/font?kit=`.
async fn font_faces(family: &str) -> Result<Vec<Vec<u8>>, String> {
    if let Some(faces) = FONT_CACHE.lock().unwrap().get(family) {
        return Ok(faces.clone());
    }
    let client = reqwest::Client::new();
    let css = client
        .get(format!(
            "https://fonts.googleapis.com/css?family={}:400,700,400italic,700italic",
            family.replace(' ', "+")
        ))
        .header("user-agent", "Mozilla/5.0 (Linux; U; Android 2.2)")
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())?;
    // TODAS as url(...) do CSS (uma por @font-face). Pesos ausentes são omitidos
    // pelo Google — carregamos o que houver (mínimo: regular).
    let urls: Vec<String> = css
        .split("url(")
        .skip(1)
        .filter_map(|s| s.split(')').next())
        .map(|s| s.trim_matches(|c| c == '\'' || c == '"').to_string())
        .collect();
    if urls.is_empty() {
        return Err("URL da fonte não encontrada no CSS do Google".into());
    }
    let mut faces = Vec::with_capacity(urls.len());
    for url in urls {
        let bytes = client
            .get(&url)
            .send()
            .await
            .map_err(|e| e.to_string())?
            .error_for_status()
            .map_err(|e| e.to_string())?
            .bytes()
            .await
            .map_err(|e| e.to_string())?
            .to_vec();
        faces.push(bytes);
    }
    FONT_CACHE
        .lock()
        .unwrap()
        .insert(family.to_string(), faces.clone());
    Ok(faces)
}

fn png_with_font(svg: &str, scale: f32, faces: &[Vec<u8>]) -> Result<Vec<u8>, String> {
    use resvg::{tiny_skia, usvg};
    let mut opt = usvg::Options::default();
    {
        let db = opt.fontdb_mut();
        for face in faces {
            db.load_font_data(face.clone());
        }
        // Usa o nome de família REAL da fonte carregada (evita mismatch como o
        // do Merriweather, cujo nameID difere do nome pedido).
        let resolved = db
            .faces()
            .next()
            .and_then(|f| f.families.first().map(|(n, _)| n.clone()))
            .unwrap_or_default();
        db.set_sans_serif_family(resolved.clone());
        db.set_serif_family(resolved.clone());
        db.set_monospace_family(resolved);
    }
    let tree = usvg::Tree::from_str(svg, &opt).map_err(|e| e.to_string())?;
    let size = tree.size();
    let w = ((size.width() * scale).ceil() as u32).max(1);
    let h = ((size.height() * scale).ceil() as u32).max(1);
    let mut pixmap = tiny_skia::Pixmap::new(w, h).ok_or("falha ao alocar pixmap")?;
    resvg::render(
        &tree,
        tiny_skia::Transform::from_scale(scale, scale),
        &mut pixmap.as_mut(),
    );
    pixmap.encode_png().map_err(|e| e.to_string())
}

fn pdf_with_font(svg: &str, faces: &[Vec<u8>]) -> Result<Vec<u8>, String> {
    use svg2pdf::usvg;
    let mut opt = usvg::Options::default();
    {
        let db = opt.fontdb_mut();
        for face in faces {
            db.load_font_data(face.clone());
        }
        let resolved = db
            .faces()
            .next()
            .and_then(|f| f.families.first().map(|(n, _)| n.clone()))
            .unwrap_or_default();
        db.set_sans_serif_family(resolved.clone());
        db.set_serif_family(resolved.clone());
        db.set_monospace_family(resolved);
    }
    let tree = usvg::Tree::from_str(svg, &opt).map_err(|e| e.to_string())?;
    svg2pdf::to_pdf(
        &tree,
        svg2pdf::ConversionOptions::default(),
        svg2pdf::PageOptions::default(),
    )
    .map_err(|e| e.to_string())
}

/// Reescreve a font-family do `<svg>` raiz (saída SVG com a fonte escolhida).
fn svg_with_font(svg: &str, family: &str) -> String {
    let needle = "font-family=\"";
    if let Some(start) = svg.find(needle) {
        let after = start + needle.len();
        if let Some(end_rel) = svg[after..].find('"') {
            let end = after + end_rel;
            return format!("{}'{}', sans-serif{}", &svg[..after], family, &svg[end..]);
        }
    }
    svg.to_string()
}

#[derive(Debug, Deserialize)]
pub struct RenderQuery {
    format: Option<String>,
    scale: Option<f32>,
    circuits: Option<bool>,
    texlabels: Option<bool>,
    /// Nome de uma Google Font (catálogo permitido); casa a fonte do PNG/PDF.
    google_font: Option<String>,
}

enum Rendered {
    Text(String, &'static str),
    Bytes(Vec<u8>, &'static str),
}

/// POST /api/render?format=svg|png|pdf&scale=2&circuits=true&texlabels=true&google_font=Roboto
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

    // Fonte Google opcional (allowlist), buscada antes do trabalho CPU-bound.
    // Falha no fetch → cai para a fonte embutida (não quebra o render).
    let font = match q.google_font.as_deref().and_then(allowed_font) {
        Some(fam) => font_faces(fam).await.ok().map(|f| (fam.to_string(), f)),
        None => None,
    };

    let out = tokio::task::spawn_blocking(move || -> Result<Rendered, String> {
        ensure_math();
        let opts = CompileOptions {
            circuits,
            texlabels,
            includes: IncludePolicy::Deny,
            ..Default::default()
        };
        let svg = rpic_core::render_svg_with_options(&src, &opts)?;
        match (format.as_str(), &font) {
            ("png", Some((_, b))) => {
                Ok(Rendered::Bytes(png_with_font(&svg, scale, b)?, "image/png"))
            }
            ("pdf", Some((_, b))) => {
                Ok(Rendered::Bytes(pdf_with_font(&svg, b)?, "application/pdf"))
            }
            ("svg", Some((fam, _))) => Ok(Rendered::Text(
                svg_with_font(&svg, fam),
                "image/svg+xml; charset=utf-8",
            )),
            ("png", None) => Ok(Rendered::Bytes(
                rpic_render::to_png(&svg, scale)?,
                "image/png",
            )),
            ("pdf", None) => Ok(Rendered::Bytes(
                rpic_render::to_pdf(&svg)?,
                "application/pdf",
            )),
            ("svg", None) => Ok(Rendered::Text(svg, "image/svg+xml; charset=utf-8")),
            (other, _) => Err(format!("formato inválido: {other} (use svg, png ou pdf)")),
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

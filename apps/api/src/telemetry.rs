//! Inicialização de tracing: legível em dev, JSON em produção.

use tracing_subscriber::{fmt, EnvFilter};

pub fn init(app_env: &str) {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    if app_env == "production" {
        fmt().with_env_filter(filter).json().init();
    } else {
        fmt().with_env_filter(filter).compact().init();
    }
}

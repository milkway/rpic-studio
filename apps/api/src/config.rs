//! Configuração carregada do ambiente (12-factor). Nenhum segredo no binário.

#[derive(Clone, Debug)]
pub struct Config {
    pub app_env: String,
    pub host: String,
    pub port: u16,
    pub database_url: String,
    pub cors_allowed_origins: Vec<String>,
    pub rate_limit_per_second: u64,
    pub rate_limit_burst: u32,
    /// URL pública do app (redirects do OAuth). Ex.: http://localhost:5173
    pub app_base_url: String,
    pub google_client_id: String,
    pub google_client_secret: String,
    /// Cookies com `Secure` (true atrás de HTTPS em produção).
    pub cookie_secure: bool,
    /// E-mails com acesso à página de administração (lista de usuários).
    /// Vem de `ADMIN_EMAILS` (separado por vírgula); vazio = ninguém é admin.
    pub admin_emails: Vec<String>,
}

fn env_or(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_string())
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        // Carrega .env se existir (dev). Em produção, variáveis vêm do ambiente.
        let _ = dotenvy::dotenv();

        Ok(Self {
            app_env: env_or("APP_ENV", "development"),
            host: env_or("API_HOST", "0.0.0.0"),
            port: env_or("API_PORT", "8080").parse().unwrap_or(8080),
            database_url: std::env::var("DATABASE_URL")
                .map_err(|_| anyhow::anyhow!("DATABASE_URL é obrigatório"))?,
            cors_allowed_origins: env_or("CORS_ALLOWED_ORIGINS", "http://localhost:5173")
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect(),
            rate_limit_per_second: env_or("RATE_LIMIT_PER_SECOND", "50").parse().unwrap_or(50),
            rate_limit_burst: env_or("RATE_LIMIT_BURST", "200").parse().unwrap_or(200),
            app_base_url: env_or("APP_BASE_URL", "http://localhost:5173")
                .trim_end_matches('/')
                .to_string(),
            google_client_id: env_or("GOOGLE_CLIENT_ID", ""),
            google_client_secret: env_or("GOOGLE_CLIENT_SECRET", ""),
            cookie_secure: env_or("COOKIE_SECURE", "false") == "true",
            admin_emails: env_or("ADMIN_EMAILS", "")
                .split(',')
                .map(|s| s.trim().to_lowercase())
                .filter(|s| !s.is_empty())
                .collect(),
        })
    }

    /// O e-mail (case-insensitive) consta na allowlist de administradores?
    pub fn is_admin(&self, email: &str) -> bool {
        let email = email.trim().to_lowercase();
        self.admin_emails.iter().any(|a| a == &email)
    }

    pub fn is_production(&self) -> bool {
        self.app_env == "production"
    }

    /// redirect_uri registrado no console do Google.
    pub fn google_redirect_uri(&self) -> String {
        format!("{}/api/auth/google/callback", self.app_base_url)
    }
}

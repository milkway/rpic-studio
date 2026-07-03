-- Preferências do usuário (papel do diagrama, idioma, tema, layout) —
-- JSON livre do cliente, para as escolhas seguirem a conta entre navegadores.
ALTER TABLE users ADD COLUMN IF NOT EXISTS prefs jsonb NOT NULL DEFAULT '{}'::jsonb;

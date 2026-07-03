-- Usuários (Google OAuth) e sessões (cookie opaco; só o hash toca o banco).

CREATE TABLE users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  google_sub  text UNIQUE NOT NULL,          -- claim "sub" do Google (estável)
  email       text NOT NULL,
  name        text NOT NULL DEFAULT '',
  picture_url text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_login  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  token_hash  text PRIMARY KEY,              -- sha256(token); o token nunca é persistido
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);

CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

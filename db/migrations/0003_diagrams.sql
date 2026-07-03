-- Diagramas salvos. O SVG não é persistido: a fonte da verdade é o código,
-- recompilado no cliente (WASM).

CREATE TABLE diagrams (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       text NOT NULL DEFAULT 'Sem título',
  source      text NOT NULL,
  circuits    boolean NOT NULL DEFAULT false,
  share_slug  text UNIQUE,                   -- NULL = privado
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX diagrams_user_idx ON diagrams (user_id, updated_at DESC);
CREATE INDEX diagrams_slug_idx ON diagrams (share_slug) WHERE share_slug IS NOT NULL;

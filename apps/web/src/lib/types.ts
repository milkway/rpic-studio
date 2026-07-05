// Tipos espelhando os modelos da API (apps/api/src/models).

export interface User {
  id: string;
  email: string;
  name: string;
  picture_url: string | null;
  /** Preferências salvas na conta (papel do diagrama, idioma, tema…). */
  prefs: Record<string, unknown>;
  /** true quando o usuário tem acesso admin (ex.: página de Usuários). */
  is_admin?: boolean;
}

/** Retorno de GET /api/users (só admin): quem já fez login no app. */
export interface UsersReport {
  total: number;
  activeSessions: number;
  users: {
    email: string;
    name: string;
    createdAt: string;
    lastLogin: string;
  }[];
}

export interface DiagramSummary {
  id: string;
  title: string;
  source: string;
  circuits: boolean;
  share_slug: string | null;
  updated_at: string;
}

export interface Diagram extends DiagramSummary {
  source: string;
  created_at: string;
}

export interface SharedDiagram {
  title: string;
  source: string;
  circuits: boolean;
  updated_at: string;
}

export interface DiagramInput {
  title: string;
  source: string;
  circuits: boolean;
}

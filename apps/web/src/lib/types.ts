// Tipos espelhando os modelos da API (apps/api/src/models).

export interface User {
  id: string;
  email: string;
  name: string;
  picture_url: string | null;
}

export interface DiagramSummary {
  id: string;
  title: string;
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

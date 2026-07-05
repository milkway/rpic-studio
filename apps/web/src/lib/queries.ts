// TanStack Query: sessão, diagramas e mutações com invalidação.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "./api";
import type { Diagram, DiagramInput, DiagramSummary, SharedDiagram, User, UsersReport } from "./types";

/** Login está configurado/disponível? false também quando a API está fora
 *  do ar — o app segue 100% funcional anônimo, sem botão quebrado. */
export function useAuthConfig() {
  return useQuery({
    queryKey: ["auth-config"],
    staleTime: Infinity,
    retry: false,
    queryFn: async (): Promise<{ google_login: boolean }> => {
      try {
        return await api<{ google_login: boolean }>("/api/auth/config");
      } catch {
        return { google_login: false };
      }
    },
  });
}

/** Usuário logado, ou null (401 = anônimo, nunca erro). */
export function useMe() {
  return useQuery({
    queryKey: ["me"],
    staleTime: Infinity,
    retry: false,
    queryFn: async (): Promise<User | null> => {
      try {
        return await api<User>("/api/auth/me");
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>("/api/auth/logout", { method: "POST" }),
    onSuccess: () => {
      qc.setQueryData(["me"], null);
      qc.removeQueries({ queryKey: ["diagrams"] });
    },
  });
}

export function useDiagrams(enabled: boolean) {
  return useQuery({
    queryKey: ["diagrams"],
    enabled,
    queryFn: () => api<DiagramSummary[]>("/api/diagrams"),
  });
}

/** Relatório de usuários (admin only). Só habilite com `me?.is_admin` —
 *  a API responde 403 para não-admin e 401 anônimo. */
export function useUsers(enabled: boolean) {
  return useQuery({
    queryKey: ["users"],
    enabled,
    retry: false,
    queryFn: () => api<UsersReport>("/api/users"),
  });
}

export function useDiagram(id: string | undefined) {
  return useQuery({
    queryKey: ["diagram", id],
    enabled: !!id,
    retry: false,
    queryFn: () => api<Diagram>(`/api/diagrams/${id}`),
  });
}

export function useSharedDiagram(slug: string | undefined) {
  return useQuery({
    queryKey: ["shared", slug],
    enabled: !!slug,
    retry: false,
    queryFn: () => api<SharedDiagram>(`/api/shared/${slug}`),
  });
}

export function useCreateDiagram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DiagramInput) =>
      api<Diagram>("/api/diagrams", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: (diagram) => {
      qc.invalidateQueries({ queryKey: ["diagrams"] });
      qc.setQueryData(["diagram", diagram.id], diagram);
    },
  });
}

export function useUpdateDiagram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: DiagramInput & { id: string }) =>
      api<Diagram>(`/api/diagrams/${id}`, { method: "PUT", body: JSON.stringify(input) }),
    onSuccess: (diagram) => {
      qc.invalidateQueries({ queryKey: ["diagrams"] });
      qc.setQueryData(["diagram", diagram.id], diagram);
    },
  });
}

export function useDeleteDiagram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/api/diagrams/${id}`, { method: "DELETE" }),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["diagrams"] });
      qc.removeQueries({ queryKey: ["diagram", id] });
    },
  });
}

export function useShareDiagram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<{ share_slug: string }>(`/api/diagrams/${id}/share`, { method: "POST" }),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["diagrams"] });
      qc.invalidateQueries({ queryKey: ["diagram", id] });
    },
  });
}

export function useUnshareDiagram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/api/diagrams/${id}/share`, { method: "DELETE" }),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["diagrams"] });
      qc.invalidateQueries({ queryKey: ["diagram", id] });
    },
  });
}

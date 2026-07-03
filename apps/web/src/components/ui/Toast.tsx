import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { cn } from "@rpic/design-system";

interface ToastItem {
  id: number;
  message: string;
  kind: "success" | "error";
}

const ToastContext = createContext<(message: string, kind?: ToastItem["kind"]) => void>(() => {});

/** Notificações curtas e não bloqueantes (copiado!, salvo!, erro…). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const push = useCallback((message: string, kind: ToastItem["kind"] = "success") => {
    const id = nextId.current++;
    setToasts((t) => [...t, { id, message, kind }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-5 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              "flex items-center gap-2 rounded-(--radius-md) px-3.5 py-2.5 text-sm font-medium shadow-(--shadow-pop)",
              "bg-(--color-ink) text-(--color-ink-text)",
            )}
          >
            {t.kind === "success" ? (
              <CheckCircle2 size={15} className="text-(--color-success)" />
            ) : (
              <AlertTriangle size={15} className="text-(--color-danger)" />
            )}
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

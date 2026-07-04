import { useEffect } from "react";
import { ensureFontLoaded } from "@/lib/appearance";

/** Carrega a Google Font do valor atual (no-op para fontes builtin). */
export function useEnsureFont(fontFamily: string): void {
  useEffect(() => {
    void ensureFontLoaded(fontFamily);
  }, [fontFamily]);
}

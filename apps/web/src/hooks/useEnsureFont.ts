import { useEffect } from "react";
import { ensureFontLoaded, ensureGoogleFont, GOOGLE_FONTS } from "@/lib/appearance";

/** Carrega a Google Font do valor atual (no-op para fontes builtin). */
export function useEnsureFont(fontFamily: string): void {
  useEffect(() => {
    void ensureFontLoaded(fontFamily);
  }, [fontFamily]);
}

const GOOGLE_FAMILIES = new Set(GOOGLE_FONTS.map((f) => f.family));

/** Carrega as Google Fonts referenciadas POR OBJETO no código (`font "Família"`),
 *  p/ o preview renderizar a família certa (senão cai na genérica). */
export function useEnsureObjectFonts(source: string): void {
  useEffect(() => {
    const seen = new Set<string>();
    for (const m of source.matchAll(/\bfont\s+"([^"\\]+)"/g)) {
      const fam = m[1];
      if (!seen.has(fam) && GOOGLE_FAMILIES.has(fam)) {
        seen.add(fam);
        void ensureGoogleFont(fam);
      }
    }
  }, [source]);
}

import { useEffect, useState } from "react";
import { compile, ensureRpic } from "@/lib/rpic";
import { sanitizeSvg } from "@/lib/sanitize";

interface RpicThumbProps {
  source: string;
  circuits: boolean;
  className?: string;
}

/** Miniatura estática de um diagrama rpic (compila uma vez ao montar). */
export function RpicThumb({ source, circuits, className }: RpicThumbProps) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    ensureRpic()
      .then(() => {
        if (cancelled) return;
        try {
          setSvg(sanitizeSvg(compile(source, { circuits }).svg));
        } catch {
          setSvg(null);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [source, circuits]);

  if (!svg) {
    return <div className={className} aria-hidden="true" />;
  }
  return (
    <div
      className={className}
      // SVG gerado pelo nosso compilador e sanitizado com DOMPurify.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

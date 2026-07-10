import { useEffect, useState } from "react";
import { Cpu } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import { Tip } from "@/components/ui/Tooltip";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { compile, ensureRpic } from "@/lib/rpic";
import { sanitizeSvg } from "@/lib/sanitize";
import {
  CIRCUIT_ELEMENTS,
  CIRCUIT_GROUPS,
  circuitIconSource,
  type CircuitElement,
  type CircuitGroup,
} from "@/lib/circuitCatalog";

interface CircuitPaletteProps {
  /** Insere o elemento escolhido no código (o EditorPage é dono do doc). */
  onInsert: (element: CircuitElement) => void;
}

const GROUP_LABEL_KEY: Record<CircuitGroup, MessageKey> = {
  passive: "circuitPalette.group.passive",
  source: "circuitPalette.group.source",
  semiconductor: "circuitPalette.group.semiconductor",
  logic: "circuitPalette.group.logic",
  measure: "circuitPalette.group.measure",
  electromech: "circuitPalette.group.electromech",
  connector: "circuitPalette.group.connector",
};

// Thumbnails dos elementos: cada macro compilada no WASM real (uma vez,
// cacheada no módulo) — o ícone é sempre o desenho VERDADEIRO da biblioteca,
// não um clipart que dessincroniza num bump. Decorativo: falha em silêncio.
const iconCache = new Map<string, string>();

function CircuitIcon({ el }: { el: CircuitElement }) {
  const [svg, setSvg] = useState(() => iconCache.get(el.id) ?? "");
  useEffect(() => {
    if (svg) return;
    let on = true;
    ensureRpic()
      .then(() => {
        const out = compile(circuitIconSource(el), { circuits: true });
        const clean = sanitizeSvg(out.svg);
        iconCache.set(el.id, clean);
        if (on) setSvg(clean);
      })
      .catch(() => {});
    return () => {
      on = false;
    };
  }, [el, svg]);
  return (
    <span
      aria-hidden
      className="ckt-icon flex h-6 w-10 shrink-0 items-center justify-center text-(--color-text-body)"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/** Menu no header do painel de código: insere elementos elétricos
 *  (circuit_macros — resistor, capacitor…) no pic, tornando a biblioteca de
 *  circuitos descoberta e usável sem decorar sintaxe. */
export function CircuitPalette({ onInsert }: CircuitPaletteProps) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tip label={t("circuitPalette.tip")}>
        <PopoverTrigger asChild>
          <Button variant="ink-ghost" size="sm" data-testid="circuits-menu">
            <Cpu size={13} />
            <span className="max-sm:hidden">{t("circuitPalette.button")}</span>
          </Button>
        </PopoverTrigger>
      </Tip>
      {/* catálogo completo (~80 macros) — rola dentro do popover; no mobile
          encolhe até caber na viewport */}
      <PopoverContent
        className="max-h-[min(70vh,34rem)] w-96 max-w-[calc(100vw-0.75rem)] overflow-y-auto"
        data-testid="circuits-palette"
      >
        <p className="mb-2 font-mono text-[10px] tracking-widest text-(--color-text-muted) uppercase">
          {t("circuitPalette.title")}
        </p>
        <div className="flex flex-col gap-3">
          {CIRCUIT_GROUPS.map((group) => (
            <div key={group}>
              <p className="mb-1 text-[11px] font-semibold text-(--color-text-muted)">
                {t(GROUP_LABEL_KEY[group])}
              </p>
              <div className="grid grid-cols-2 gap-1">
                {CIRCUIT_ELEMENTS.filter((el) => el.group === group).map((el) => (
                  <button
                    key={el.id}
                    type="button"
                    data-testid={`circuit-el-${el.id}`}
                    onClick={() => {
                      onInsert(el);
                      setOpen(false);
                    }}
                    className="flex cursor-pointer items-center gap-2 rounded-(--radius-sm) px-2 py-1 text-left text-sm text-(--color-text-body) outline-none transition-colors hover:bg-(--color-surface-muted) hover:text-(--color-text)"
                  >
                    <CircuitIcon el={el} />
                    <span className="min-w-0 leading-tight">{el.label[locale]}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

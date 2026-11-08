import { useState } from "react";
import { cn } from "@rpic/design-system";
import {
  validField,
  type AnalysisCard,
  type CardField,
  type CardFieldKey,
} from "@/lib/simAnalysis";
import { parseSpiceNumber } from "@/lib/simValues";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { Tip } from "@/components/ui/Tooltip";

/** Unidade da escala por análise (o `.dc` varre o que a fonte for). */
const UNIT: Readonly<Record<string, string>> = { tran: "s", ac: "Hz", dc: "" };

interface AnalysisEditorProps {
  cards: AnalysisCard[];
  /** Por que o cartão é só leitura (mensagem já traduzida); `null` = editável. */
  readOnly: (card: AnalysisCard) => string | null;
  /** Commit de um campo (Enter/blur) com a grafia do usuário. */
  onCommit: (card: AnalysisCard, key: CardFieldKey, text: string) => void;
}

/** Editor dos cartões de análise do deck (issue #33): uma linha por cartão,
 *  o tipo num chip e os campos de FAIXA (início/fim) e DENSIDADE (passo,
 *  pontos) em notação SPICE. Cada commit vira UMA edição do fonte (o painel a
 *  escreve e re-roda); o resto do cartão (`uic`, 2ª fonte do `.dc`) fica
 *  como está. Cartão ilegível ou fora do fonte = só leitura, com o motivo. */
export function AnalysisEditor({ cards, readOnly, onCommit }: AnalysisEditorProps) {
  const { t } = useI18n();
  if (cards.length === 0) return null;
  return (
    <section className="space-y-1" data-testid="sim-analysis" aria-label={t("sim.analysis")}>
      <h3 className="font-mono text-[10.5px] tracking-widest text-(--color-text-muted) uppercase">
        {t("sim.analysis")}
      </h3>
      <ul className="space-y-1">
        {cards.map((card) => {
          const reason = readOnly(card);
          const key = `${card.type}:${card.ordinal}`;
          return (
            <li
              key={key}
              className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1"
              data-testid="sim-card"
              data-card={key}
              data-readonly={reason === null ? "0" : "1"}
            >
              <span className="shrink-0 rounded-full border border-(--color-border-strong) px-2 py-0.5 font-mono text-[11px] text-(--color-text)">
                {card.chip}
              </span>
              {reason === null ? (
                <CardFields card={card} onCommit={onCommit} />
              ) : (
                <Tip label={reason}>
                  <span
                    tabIndex={0}
                    className="min-w-0 truncate font-mono text-[11px] text-(--color-text-muted)"
                    data-testid="sim-card-readonly"
                    aria-label={`${card.text} — ${reason}`}
                  >
                    {card.text}
                  </span>
                </Tip>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function fieldLabel(card: AnalysisCard, f: CardField): MessageKey {
  if (f.key === "points") {
    const kind = (card.args[0] ?? "lin").toLowerCase();
    return kind === "dec"
      ? "sim.an.points.dec"
      : kind === "oct"
        ? "sim.an.points.oct"
        : "sim.an.points.lin";
  }
  return `sim.an.${f.key}` as MessageKey;
}

function CardFields({
  card,
  onCommit,
}: {
  card: AnalysisCard;
  onCommit: AnalysisEditorProps["onCommit"];
}) {
  const { t } = useI18n();
  const unit = UNIT[card.type] ?? "";
  const group = (g: CardField["group"]) => card.fields.filter((f) => f.group === g);
  return (
    <>
      {(["range", "density"] as const).map((g) => (
        <span
          key={g}
          className="flex shrink-0 items-center gap-1"
          role="group"
          aria-label={t(g === "range" ? "sim.an.range" : "sim.an.density")}
        >
          {group(g).map((f, i) => (
            <span key={f.key} className="flex items-center gap-1">
              {g === "range" && i > 0 && (
                <span className="font-mono text-[11px] text-(--color-text-muted)" aria-hidden>
                  –
                </span>
              )}
              <CardInput card={card} field={f} label={t(fieldLabel(card, f))} onCommit={onCommit} />
            </span>
          ))}
          {g === "range" && unit && (
            <span className="font-mono text-[11px] text-(--color-text-muted)">{unit}</span>
          )}
        </span>
      ))}
    </>
  );
}

/** Um campo: commit no Enter/blur, inválido = fica o valor antigo + erro
 *  visual, Esc = desfaz o rascunho (as convenções do `ElementSlider`). */
function CardInput({
  card,
  field,
  label,
  onCommit,
}: {
  card: AnalysisCard;
  field: CardField;
  label: string;
  onCommit: AnalysisEditorProps["onCommit"];
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<string | null>(null);
  const parsed = draft === null ? field.value : parseSpiceNumber(draft);
  const invalid =
    draft !== null &&
    (parsed === null || /\S\s+\S/.test(draft.trim()) || !validField(card, field.key, parsed));
  const commit = () => {
    if (draft === null || invalid) return;
    const text = draft.trim();
    setDraft(null);
    if (text === field.text) return;
    // `tstart` ausente: 0 digitado de novo não escreve nada
    if (!field.present && parsed === field.value) return;
    onCommit(card, field.key, text);
  };
  const aria = t("sim.an.field", { card: card.chip, field: label });
  return (
    <label className="flex items-center gap-1">
      <span className="font-mono text-[10.5px] text-(--color-text-muted)">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        spellCheck={false}
        aria-label={aria}
        aria-invalid={invalid || undefined}
        title={invalid ? t("sim.an.invalid", { value: field.text }) : undefined}
        value={draft ?? field.text}
        onFocus={(e) => {
          setDraft(field.text);
          e.currentTarget.select();
        }}
        onChange={(e) => setDraft(e.currentTarget.value)}
        onBlur={() => {
          commit();
          setDraft(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape" && draft !== null) {
            e.stopPropagation();
            setDraft(null);
          }
        }}
        className={cn(
          "h-6 w-16 rounded-(--radius-sm) border bg-(--color-paper) px-1.5 text-right font-mono text-[11.5px] text-(--color-text) tabular-nums",
          invalid ? "border-(--color-danger)" : "border-(--color-border-strong)",
          !field.present && draft === null && "text-(--color-text-muted)",
        )}
        data-testid={`sim-card-${field.key}`}
      />
    </label>
  );
}

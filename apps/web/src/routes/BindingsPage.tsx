import { useState, type ReactNode } from "react";
import { Copy, ExternalLink, SquareTerminal } from "lucide-react";
import { AppShell } from "@/components/app-shell/AppShell";
import { ReadOnlyCode, type CodeLanguage } from "@/components/preview/ReadOnlyCode";
import { useToast } from "@/components/ui/Toast";
import { copyText } from "@/lib/exports";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";

interface Binding {
  id: string;
  name: string;
  badge: string;
  whatKey: MessageKey;
  install?: string;
  installLang?: CodeLanguage;
  usage: string;
  usageLang: CodeLanguage;
  docs: { label: string; href: string };
}

const BINDINGS: Binding[] = [
  {
    id: "cli",
    name: "CLI",
    badge: "rpic-cli · crates.io",
    whatKey: "bindings.cli.what",
    install: `# crates.io (Rust)
cargo install rpic-cli

# ou: brew install milkway/rpic/rpic`,
    installLang: "python", // realce de comentário/comando de shell
    usage: `# SVG (padrão) para stdout
rpic diagrama.pic > diagrama.svg

# PNG 2x e PDF
rpic --png --scale 2 -o out.png diagrama.pic
rpic --pdf -o out.pdf diagrama.pic

# biblioteca de circuitos (-c) e math TeX (-t)
rpic -c circuito.pic
rpic -t formulas.pic

# bundle estruturado (svg + animações + diagnósticos)
rpic --json diagrama.pic`,
    usageLang: "python",
    docs: { label: "rpic.dev/docs/installation", href: "https://rpic.dev/docs/installation" },
  },
  {
    id: "python",
    name: "Python",
    badge: "rpiclang · PyPI",
    whatKey: "bindings.py.what",
    install: `pip install rpiclang        # importa como  import rpic`,
    installLang: "python",
    usage: `import rpic

svg = rpic.render_svg('box "oi"; arrow; circle "x"')
open("out.png", "wb").write(rpic.render_png("box \\"oi\\"", scale=2.0))
open("out.pdf", "wb").write(rpic.render_pdf("box \\"oi\\""))

# biblioteca de circuitos
svg = rpic.render_svg('A:(0,0); B:(2,0)\\nresistor(A,B)', circuits=True)

# bundle estruturado (svg, animations, diagnostics, warnings)
import json
bundle = json.loads(rpic.compile_json('box\\nanimate last box with "pop"'))`,
    usageLang: "python",
    docs: { label: "pypi.org/project/rpiclang", href: "https://pypi.org/project/rpiclang/" },
  },
  {
    id: "r",
    name: "R",
    badge: "milkway/rpic-r · GitHub",
    whatKey: "bindings.r.what",
    install: `remotes::install_github("milkway/rpic-r")`,
    installLang: "r",
    usage: `library(rpic)

svg <- rpic_svg('box "oi"; arrow; circle "x"')
writeLines(svg, "diagrama.svg")

# PNG 2x e PDF
rpic_png('circle rad 0.4', "out.png", scale = 2)
rpic_pdf('box "relatorio"', "out.pdf")

# biblioteca de circuitos e math TeX
rpic_svg('A:(0,0); B:(2,0)\\nresistor(A,B)', circuits = TRUE)
rpic_svg('box "$E = mc^2$" fit', texlabels = TRUE)`,
    usageLang: "r",
    docs: { label: "github.com/milkway/rpic-r", href: "https://github.com/milkway/rpic-r" },
  },
  {
    id: "js",
    name: "JavaScript / WASM",
    badge: "@strategicprojects/rpic · npm",
    whatKey: "bindings.js.what",
    install: `npm i @strategicprojects/rpic`,
    installLang: "python",
    usage: `import * as rpic from "@strategicprojects/rpic";
import { gsap } from "gsap";

await rpic.ready(); // browser: o .wasm e buscado sozinho
const { svg, animations, diagnostics, warnings } = rpic.compile('box "A"; arrow; box "B"');
document.querySelector("#stage").innerHTML = svg;
rpic.animate(document.querySelector("#stage"), animations, gsap);

// biblioteca de circuitos
rpic.renderSvg('A:(0,0); B:(2,0)\\nresistor(A,B)', { circuits: true });

// math TeX: build opcional (RaTeX), buscado so quando pedido
await rpic.ready(undefined, { math: true });
rpic.renderSvg('box "$-\\\\frac{T}{2}$" fit', { texlabels: true });

// so o player (0.11): p/ SVG pre-renderizado (rpic --json), zero wasm
import { animate, interactive } from "@strategicprojects/rpic/player";`,
    usageLang: "xml",
    docs: {
      label: "npmjs.com/package/@strategicprojects/rpic",
      href: "https://www.npmjs.com/package/@strategicprojects/rpic",
    },
  },
  {
    id: "rest",
    name: "REST API",
    badge: "studio.rpic.dev/api/render",
    whatKey: "bindings.rest.what",
    usage: `# SVG (padrao)
curl -X POST "https://studio.rpic.dev/api/render?format=svg" \\
  --data-binary 'box "oi"; arrow; circle "x"'

# PNG 3x, com a biblioteca de circuitos
curl -X POST "https://studio.rpic.dev/api/render?format=png&scale=3&circuits=true" \\
  --data-binary 'A:(0,0); B:(2,0)
resistor(A,B)' -o diagrama.png

# PDF, com math TeX ($...$) e uma Google Font
curl -X POST "https://studio.rpic.dev/api/render?format=pdf&texlabels=true&google_font=Merriweather" \\
  --data-binary 'box "$E = mc^2$" fit' -o diagrama.pdf

# parametros: format=svg|png|pdf  scale=0.5..4  circuits=bool  texlabels=bool  google_font=<familia>`,
    usageLang: "python",
    docs: { label: "studio.rpic.dev", href: "https://studio.rpic.dev" },
  },
];

function CodeBlock({
  label,
  content,
  language,
  dark,
}: {
  label: string;
  content: string;
  language: CodeLanguage;
  dark: boolean;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const lines = content.split("\n").length;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="font-mono text-[10px] tracking-widest text-(--color-text-muted) uppercase">
          {label}
        </span>
        <button
          onClick={async () => {
            await copyText(content);
            toast(t("examplesPage.codeCopied"));
          }}
          className="flex cursor-pointer items-center gap-1 text-[11px] text-(--color-text-muted) hover:text-(--color-text)"
        >
          <Copy size={11} /> {t("examplesPage.copyCode")}
        </button>
      </div>
      <div
        className="overflow-hidden rounded-(--radius-md) border border-(--color-ink-border)"
        style={{ height: Math.min(Math.max(lines, 2) * 22 + 28, 360) }}
      >
        <ReadOnlyCode content={content} language={language} dark={dark} />
      </div>
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-(--radius-md) border border-(--color-border) bg-(--color-surface-muted) px-3.5 py-2.5 text-[13px] text-(--color-text-body)">
      {children}
    </p>
  );
}

/** Orientações de uso dos bindings do rpic (CLI, Python, R, JS). */
export function BindingsPage() {
  const { t } = useI18n();
  const { dark } = useTheme();
  const [active, setActive] = useState(BINDINGS[0].id);
  const binding = BINDINGS.find((b) => b.id === active)!;

  return (
    <AppShell>
      <div className="h-full overflow-auto">
        <div className="mx-auto max-w-4xl px-6 py-10">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-(--color-text)">
            {t("bindings.title")}
          </h1>
          <p className="mt-2 max-w-2xl text-(--color-text-body)">{t("bindings.subtitle")}</p>

          {/* Abas por linguagem */}
          <div className="mt-6 flex flex-wrap gap-1.5 border-b border-(--color-border) pb-3">
            {BINDINGS.map((b) => (
              <button
                key={b.id}
                onClick={() => setActive(b.id)}
                data-testid={`binding-tab-${b.id}`}
                className={
                  active === b.id
                    ? "cursor-pointer rounded-(--radius-sm) bg-(--color-accent-soft) px-3 py-1.5 text-sm font-medium text-(--color-accent)"
                    : "cursor-pointer rounded-(--radius-sm) px-3 py-1.5 text-sm font-medium text-(--color-text-body) transition-colors hover:bg-(--color-surface-muted) hover:text-(--color-text)"
                }
              >
                {b.name}
              </button>
            ))}
          </div>

          <section className="mt-6 space-y-4" data-testid={`binding-panel-${binding.id}`}>
            <div className="flex flex-wrap items-center gap-2">
              <SquareTerminal size={16} className="text-(--color-accent)" />
              <h2 className="font-display text-xl font-semibold text-(--color-text)">
                {binding.name}
              </h2>
              <span className="rounded-full bg-(--color-surface-muted) px-2.5 py-0.5 font-mono text-[11px] text-(--color-text-muted)">
                {binding.badge}
              </span>
            </div>
            <p className="text-(--color-text-body)">{t(binding.whatKey)}</p>

            {binding.install && (
              <CodeBlock
                label={t("bindings.install")}
                content={binding.install}
                language={binding.installLang ?? "python"}
                dark={dark}
              />
            )}
            <CodeBlock
              label={t("bindings.usage")}
              content={binding.usage}
              language={binding.usageLang}
              dark={dark}
            />

            <a
              href={binding.docs.href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-(--color-accent) hover:underline"
            >
              {t("bindings.docs")}: {binding.docs.label}
              <ExternalLink size={13} />
            </a>
          </section>

          <div className="mt-8 space-y-2.5">
            <Note>{t("bindings.note.circuits")}</Note>
            <Note>{t("bindings.note.tex")}</Note>
            {binding.id === "rest" && <Note>{t("bindings.note.fonts")}</Note>}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

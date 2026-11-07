// Preview de fontes `spice = 1` (issue #17). As macros de elemento do dune
// (`vsource`, `isource`, `acsource`, …) vivem no PRELUDE pic do dune, não na
// biblioteca `-c` do rpic — sem ele o preview acusava um erro falso numa figura
// que o painel SIM desenha e simula. Aqui o preview compila o MESMO texto que o
// `renderPic` do dune compila (`prelude + "\n" + fonte`, circuitos ligados), com
// o rpic do Studio: sai o bundle completo (svg + objects + places + warnings)
// que o inspetor usa, e os ids `sN` batem com o `map` do extrator do dune.
//
// O `compile()` do rpic não tem opção de prelude/unidade nomeada (só
// `circuits`/`texlabels`), então o prelude é PREFIXADO e toda posição do
// bundle/erro é re-baseada para o fonte do usuário: linha > deslocamento →
// linha do usuário; linha dentro do prelude → `file: DUNE_PRELUDE_FILE`
// (contextualizada como arquivo incluído, nunca marcada no editor).
import { compile, type Bundle, type CompileError, type CompileOptions } from "./rpic";

/** Nome de "arquivo" dos diagnósticos/objetos que caem dentro do prelude. */
export const DUNE_PRELUDE_FILE = "dune prelude";

let prelude: string | null = null;
let loading: Promise<string> | null = null;

/** Carrega o texto do prelude (chunk próprio, ~24 KB; só para fontes spice).
 *  Idempotente; falha não fica cacheada. */
export function loadDunePrelude(): Promise<string> {
  if (prelude !== null) return Promise.resolve(prelude);
  if (!loading) {
    loading = import("virtual:dune-prelude")
      .then((m) => {
        prelude = m.default;
        return prelude;
      })
      .catch((e) => {
        loading = null;
        throw e;
      });
  }
  return loading;
}

/** O prelude, se já carregado (síncrono — o hook do preview re-roda ao carregar). */
export function dunePreludeLoaded(): string | null {
  return prelude;
}

/** Quantas linhas o prefixo `prelude + "\n"` ocupa antes da linha 1 do usuário. */
export function preludeOffset(text: string): number {
  return text.split("\n").length;
}

/** Re-baseia UMA posição (diagnóstico, objeto, lugar, passthrough): `file` já
 *  definido (circuits, `copy`) fica como está; linha dentro do prelude ganha
 *  `file: DUNE_PRELUDE_FILE`; senão a linha volta ao referencial do usuário. */
function rebaseSpan<T extends { line?: number | null; file?: string | null }>(x: T, offset: number): T {
  if (x.file != null || x.line == null) return x;
  return x.line > offset ? { ...x, line: x.line - offset } : { ...x, file: DUNE_PRELUDE_FILE };
}

/** Prefixo `"L:C: "` da mensagem do compilador, no mesmo referencial. */
function rebaseMessage(message: string, offset: number): string {
  return message.replace(/^(\d+):(\d+):/, (_m, l: string, c: string) => {
    const n = Number(l);
    return n > offset ? `${n - offset}:${c}:` : `${DUNE_PRELUDE_FILE}:${l}:${c}:`;
  });
}

/** Compila `source` com o prelude do dune à frente e devolve o bundle com as
 *  posições no referencial do usuário. Força `circuits` (o prelude se apoia na
 *  biblioteca de circuitos, como no `renderPic` do dune). Em erro, lança um
 *  `CompileError` com mensagem e `errorInfo` re-baseados. */
export function compileWithPrelude(source: string, preludeText: string, opts?: CompileOptions): Bundle {
  const offset = preludeOffset(preludeText);
  let bundle: Bundle;
  try {
    bundle = compile(preludeText + "\n" + source, { ...opts, circuits: true });
  } catch (e) {
    const err = e as CompileError;
    if (err instanceof Error) {
      err.message = rebaseMessage(err.message, offset);
      if (err.errorInfo) err.errorInfo = rebaseSpan(err.errorInfo, offset);
      if (err.warnings) err.warnings = err.warnings.map((w) => rebaseSpan(w, offset));
    }
    throw err;
  }
  const out: Bundle = {
    ...bundle,
    warnings: (bundle.warnings ?? []).map((w) => rebaseSpan(w, offset)),
    objects: (bundle.objects ?? []).map((o) => rebaseSpan(o, offset)),
  };
  if (bundle.places) out.places = bundle.places.map((p) => rebaseSpan(p, offset));
  if (bundle.passthrough) {
    out.passthrough = bundle.passthrough.map((p) => {
      const r = rebaseSpan(p, offset);
      return r.file == null && p.end_line !== undefined ? { ...r, end_line: p.end_line - offset } : r;
    });
  }
  return out;
}

/** Compila como o preview deve: com o prelude quando ele é dado, senão o
 *  `compile` puro (caminho não-spice inalterado). */
export function compileFigure(source: string, opts: CompileOptions, preludeText: string | null): Bundle {
  return preludeText === null ? compile(source, opts) : compileWithPrelude(source, preludeText, opts);
}

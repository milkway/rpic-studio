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
import { compile, type Bundle, type CompileError, type CompileOptions, type ObjectGeometry } from "./rpic";
import type { Scene } from "@strategicprojects/rpic";

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

/** Objetos desenhados DENTRO de macros (prelude do dune ou lib de circuitos)
 *  são atribuídos à CHAMADA do usuário que os gerou — o bloco mais interno com
 *  `span` no fonte do usuário (o `V1: vsource(...)`; o rpic ≥ 0.16 agrupa a
 *  chamada plana num bloco). Assim o inspetor os seleciona e o clique pula para
 *  a linha do elemento. Sem bloco do usuário em volta, ficam como estão. */
function attributeToCallSite(
  objects: ObjectGeometry[],
  scene: Scene | undefined,
  offset: number,
): ObjectGeometry[] {
  if (!scene) return objects;
  const items = new Map(scene.items.map((it) => [it.id, it]));
  return objects.map((o) => {
    if (o.file == null) return o; // já re-baseado para o usuário
    const blocks = items.get(o.id)?.block ?? [];
    for (let i = blocks.length - 1; i >= 0; i--) {
      const span = items.get(blocks[i])?.span;
      if (span && span.file == null && span.line > offset) {
        const moved: ObjectGeometry = { ...o, line: span.line - offset, col: span.col, end_col: span.end_col };
        delete moved.file;
        return moved;
      }
    }
    return o;
  });
}

/** Compila `source` com o prelude do dune à frente e devolve o bundle com as
 *  posições no referencial do usuário. Força `circuits` (o prelude se apoia na
 *  biblioteca de circuitos, como no `renderPic` do dune) e pede a `scene` só
 *  para ler os blocos com a posição da chamada — ela NÃO sai no bundle (as
 *  posições dela estão no referencial combinado); dela sai, re-baseada, a
 *  atribuição dos objetos ao `Rótulo: macro(…)` do usuário.
 *  Em erro, lança um `CompileError` com mensagem e `errorInfo` re-baseados.
 *
 *  Todo o re-baseamento mora AQUI: quando o `compile()` do rpic ganhar
 *  preludes nomeados (unidades como o `-c`), este módulo encolhe a um repasse. */
export function compileWithPrelude(
  source: string,
  preludeText: string,
  opts?: CompileOptions,
): Bundle {
  const offset = preludeOffset(preludeText);
  let bundle: Bundle;
  try {
    bundle = compile(preludeText + "\n" + source, { ...opts, circuits: true, scene: true });
  } catch (e) {
    const err = e as CompileError;
    if (err instanceof Error) {
      err.message = rebaseMessage(err.message, offset);
      if (err.errorInfo) err.errorInfo = rebaseSpan(err.errorInfo, offset);
      if (err.warnings) err.warnings = err.warnings.map((w) => rebaseSpan(w, offset));
    }
    throw err;
  }
  const { scene, ...rest } = bundle;
  const out: Bundle = {
    ...rest,
    warnings: (bundle.warnings ?? []).map((w) => rebaseSpan(w, offset)),
    objects: attributeToCallSite(
      (bundle.objects ?? []).map((o) => rebaseSpan(o, offset)),
      scene,
      offset,
    ),
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
export function compileFigure(
  source: string,
  opts: CompileOptions,
  preludeText: string | null,
): Bundle {
  return preludeText === null ? compile(source, opts) : compileWithPrelude(source, preludeText, opts);
}

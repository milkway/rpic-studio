// Preview de fontes `spice = 1` (issue #17). As macros de elemento do dune
// (`vsource`, `isource`, `acsource`, …) vivem no PRELUDE pic do dune, não na
// biblioteca `-c` do rpic — sem ele o preview acusava um erro falso numa figura
// que o painel SIM desenha e simula. Aqui o preview compila a MESMA figura que o
// `renderPic` do dune desenha (o prelude antes da fonte, circuitos ligados), com
// o rpic do Studio: sai o bundle completo (svg + objects + places + warnings)
// que o inspetor usa, e os ids `sN` batem com o `map` do extrator do dune.
//
// Desde o rpic 0.17.0 o prelude entra como UNIDADE NOMEADA (`preludes`, como a
// biblioteca `-c`): as posições do usuário não se deslocam e toda posição
// dentro do prelude já sai com `file: DUNE_PRELUDE_FILE` (contextualizada como
// arquivo incluído, nunca marcada no editor) — o re-baseamento de linhas que o
// Studio fazia sobre `prelude + "\n" + fonte` acabou.
import { compile, type Bundle, type CompileOptions, type ObjectGeometry } from "./rpic";
import type { Scene } from "@strategicprojects/rpic";

/** Nome da unidade do prelude — é o `file` dos diagnósticos/objetos de dentro dele. */
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

/** Objetos desenhados DENTRO de macros (prelude do dune ou lib de circuitos)
 *  são atribuídos à CHAMADA do usuário que os gerou — o bloco mais interno com
 *  `span` no fonte do usuário (o `V1: vsource(...)`; o rpic ≥ 0.16 agrupa a
 *  chamada plana num bloco). Assim o inspetor os seleciona e o clique pula para
 *  a linha do elemento. Sem bloco do usuário em volta, ficam como estão.
 *
 *  Um objeto é "de macro" quando tem `file` (prelude, circuits, `copy`): desde
 *  o rpic 0.17.1 isso vale também para strings com `$n` substituído (o rótulo
 *  de valor `"$1" at …` do prelude), que no 0.17.0 perdiam o `file`. */
function attributeToCallSite(objects: ObjectGeometry[], scene: Scene | undefined): ObjectGeometry[] {
  if (!scene) return objects;
  const items = new Map(scene.items.map((it) => [it.id, it]));
  return objects.map((o) => {
    if (o.file == null) return o; // já no referencial do usuário
    const blocks = items.get(o.id)?.block ?? [];
    for (let i = blocks.length - 1; i >= 0; i--) {
      const span = items.get(blocks[i])?.span;
      if (span && span.file == null) {
        const moved: ObjectGeometry = { ...o, line: span.line, col: span.col, end_col: span.end_col };
        delete moved.file;
        return moved;
      }
    }
    return o;
  });
}

/** Compila `source` com o prelude do dune como unidade nomeada. Força
 *  `circuits` (o prelude se apoia na biblioteca de circuitos, como no
 *  `renderPic` do dune) e pede a `scene` só para ler os blocos com a posição da
 *  chamada — ela NÃO sai no bundle; dela sai a atribuição dos objetos ao
 *  `Rótulo: macro(…)` do usuário. Em erro, o `CompileError` do rpic passa
 *  direto (posições já no referencial certo). */
export function compileWithPrelude(
  source: string,
  preludeText: string,
  opts?: CompileOptions,
): Bundle {
  const { scene, ...rest } = compile(source, {
    ...opts,
    circuits: true,
    scene: true,
    preludes: [{ name: DUNE_PRELUDE_FILE, text: preludeText }],
  });
  return { ...rest, objects: attributeToCallSite(rest.objects ?? [], scene) };
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

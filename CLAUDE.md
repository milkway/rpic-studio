# rpic-app — guia para agentes

Editor web de diagramas rpic (pic). Monorepo npm workspaces + Cargo, moldado no template
peabiru (`../peabiru`): mesmas convenções, versões e organização.

## Comandos

- `npm run dev` — web (Vite, :5173; proxy `/api` → :8080)
- `npm run build` — `tsc --noEmit && vite build` (TS estrito bloqueia o build)
- `npm run lint` — ESLint flat, `--max-warnings 0`
- `npm test` — Vitest (jsdom; `compile.test.ts` roda o WASM real em Node)
- `npm run e2e` — Playwright (chromium, contra `vite preview`)
- API: `cargo run|test|clippy|fmt --manifest-path apps/api/Cargo.toml`
- Postgres dev: `docker compose -f infra/docker-compose.yml up -d postgres`

## Regras que quebram silenciosamente se ignoradas

- **Tailwind v4**: tokens via CSS vars com sintaxe de **parênteses** — `bg-(--color-accent)`.
  A forma v3 `bg-[--color-accent]` NÃO resolve. Tokens em
  `packages/design-system/src/tokens.css` (bloco `@theme`).
- **Alias**: `@/*` → `apps/web/src/*`; `@rpic/design-system` é alias exato (regex) — imports de
  subpath (`/tokens.css`) resolvem pelos exports do package, não pelo alias.
- **WASM**: inicializar via `ensureRpic()` (`apps/web/src/lib/rpic.ts`); os `.wasm` entram como
  assets com `?url`. DOIS builds: lean (padrão) e math (RaTeX p/ texlabels, ~3 MB, lazy). A
  escolha é FIXADA no primeiro `ready()` (wasm-bindgen) — a carga decide pela flag `rpic:math.v1`
  OU pelo `mathHint` de `ensureRpic()`. **Math é AUTOMÁTICO**: `useRpic` fareja `$…$` no documento
  inicial (`detectTexLabels`) e passa `mathHint` → abrir/recarregar/compartilhar TeX sobe o build math
  SEM reload. Digitar `$…$` com lean ativo não troca ao vivo (limite do wasm-bindgen): em RASCUNHO o
  `EditorPage` persiste o draft e recarrega SOZINHO (na volta o farejador sobe o math); em modo SALVO
  só avisa (reload perderia edições não salvas). Em Node/Vitest, passar bytes:
  `ready(readFileSync(...), { math? })` — teste math em ARQUIVO separado (isolamento do Vitest).
- **Releases do rpic**: o workflow `.github/workflows/rpic-release-watch.yml` abre uma issue
  com checklist de investigação quando o rpic-lang taggeia versão nova (compara com a versão
  do lockfile). Ao atualizar a dependência, rodar a suíte completa — `compile.test.ts` valida
  todos os exemplos no WASM real e pega drift de comportamento. **Atual: web ^0.16.0 / API v0.11.0**
  (web: 0.16.0 trouxe `layers: { textScale }` e `before: 'labels'` no `/maplibre`; 0.15.0 trouxe o build GEO `rpic_wasm_geo` + `compileGeoJSON` + o módulo `/maplibre`, usados
  pelo painel Mapa — ver o item do painel Mapa abaixo; as features de LINGUAGEM descritas a seguir
  são as da v0.11.0) (`link "<url>"` —
  hyperlink por objeto, inline OU statement `link A "url"`; o SVG embrulha o `<g id="sN">` num
  `<a class="rpic-link">`, URLs validadas contra XSS, `objects[].link` no bundle — o inspetor tem
  campo de URL (`objects-link`, kind "link" no `objectEdit.ts`) e o DOMPurify PRESERVA o `<a href>`
  (testado); npm ganhou o player standalone `@strategicprojects/rpic/player` (zero-wasm, citado na
  BindingsPage) e o CLI o modo `--html`; SVG-only: PNG/PDF idênticos sem o link). 0.10.0: efeitos de TEXTO
  `type` — tspans `.rpic-ch` nativos, `by word` — e `scramble` — `by "chars"`, ScrambleTextPlugin;
  `wiggle` com `wiggles <n>` — ease `wiggle(n)` do CustomWiggle; `draw from 40% to 0.6` recorta o
  traço por fração — `drawFrom`/`drawTo` no manifesto, sem plugin; diretiva **`draggable <place>
  [inertia] [bounds <place>] [x|y]`** — NÃO é efeito animate — vira array top-level `interactions`
  no bundle e o helper npm `interactive(root, interactions, Draggable)` liga o GSAP Draggable — no
  app o `PreviewPane` liga/mata as instâncias, o pan PULA alvos arrastáveis e o `ObjectsOverlay`
  REENCAMINHA o pointerdown ao `<g>` (o overlay cobre o SVG, senão o Draggable nunca vê o evento);
  warnings novos `by_without_type`/`by_without_scramble`/`wiggles_without_wiggle` caem no default do
  `errorInfo.ts`; FIX #333: `invalid_color` agora traz span line/col/end_col → jump/sublinhado
  funcionam sozinhos). 0.9.0: `thin` = 2/3 do `linethick`; cores em variáveis/expressões; nomes
  dvips/xcolor; warning `invalid_color` com "did you mean" (caso localizado no `errorInfo.ts`); FIX
  gradient+hatch #273. 0.8.x trouxe o subsistema de animação (efeitos `slide`/`move`/`highlight`/
  `morph` além de `draw`/`fade`/`pop`, `out`, `repeat`/`yoyo`/`ease`, `stagger`, `animate scroll`; o
  player npm converte formas em `<path>` p/ `move`/`morph`). O pin fica em TRÊS lugares:
  `apps/web/package.json` E a raiz `package.json` (web WASM `@strategicprojects/rpic`), e a git-dep
  da API em `apps/api/Cargo.toml` (`rpic-core`/`rpic-render` na `tag = "v0.11.0"`). **Hoje os pins
  DIVERGEM de propósito**: web `^0.16.0` (raiz + apps/web, pelo build geo do painel Mapa, #8) e API
  ainda na tag v0.11.0 — o render server-side não usa geo, e mudar a tag faz a API recompilar o
  `rpic-core`/`render` do zero no deploy (ver Deploy); fica para um bump próprio, que deve então
  realinhar os três. Depois de mudar a
  tag, rodar `cargo update --manifest-path apps/api/Cargo.toml -p rpic-core -p rpic-render` — editar
  só o `Cargo.toml` deixa o `Cargo.lock` STALE (foi assim que o lock ficou preso no v0.7.0 dois bumps
  seguidos; o Docker do servidor resolvia sozinho e mascarava). Obs.: o sqlx 0.9 do lock exige
  rustc ≥ 1.94 — se o `cargo` local reclamar de MSRV, `rustup update stable`.
- **Erros do compilador**: formato `"linha:coluna: mensagem"` — parse em `errorPosition()`.
- **SVG no DOM**: sempre via `sanitizeSvg()` (DOMPurify) — o código pode ter vindo de link de
  terceiros (`#pic=`).
- **Share por URL**: fragment `#pic=` parseado manualmente em `lib/share.ts` (URLSearchParams
  corromperia `+` do alfabeto lz-string). O fragment nunca vai ao servidor.
- **E2E**: preferir `getByTestId`; o WASM só roda de verdade no browser (Playwright é o teste
  de integração real).
- **API (fase 2)**: sessão = cookie httpOnly opaco com `sha256(token)` na tabela `sessions`;
  extractor `CurrentUser`. Migrações são `.sql` puros em `db/migrations/`, aplicados pelo
  entrypoint do Postgres (recriar o volume para reaplicar).
- **Admin / página Usuários** (`routes/UsersPage.tsx`, `/usuarios`): allowlist `ADMIN_EMAILS` (env,
  separado por vírgula, case-insensitive) → `config.is_admin(email)`; `/api/auth/me` devolve
  `is_admin` (campo derivado, NÃO é coluna — `#[sqlx(default)]` no `User`), o link de nav só aparece
  p/ admin, e `GET /api/users` (`ApiError::Forbidden`=403 p/ não-admin) lista e-mail/nome/criado/
  último-login + total + sessões ativas. **Sem `ADMIN_EMAILS` no `.env.prod`, ninguém é admin** (a
  página fica 403). Definir `ADMIN_EMAILS=` no servidor em `~/rpic-app/infra/.env.prod`.
- **Editor visual = SÓ ESTILO** (`components/visual/ObjectsOverlay.tsx`): o código pic é a fonte da
  verdade e o ÚNICO jeito de criar/posicionar objetos (o antigo editor de grafo — criar formas,
  arrastar, conectar — foi REMOVIDO por decisão de produto: era passo largo e frágil). O visual só
  ESTILIZA: sobre QUALQUER pic que compile, o overlay lê `useRpic().objects[]` (bbox por `#s{i}` via
  `getBoundingClientRect` num loop rAF; `kind`/`line`/`col`/`file`) e dá uma caixa selecionável por
  objeto. Só objetos do próprio input (`file` ausente — exclui `copy`/circuitos) são interativos.
  A bbox é SÓ o alvo de clique/hover (transparente — nunca desenha retângulo). PEGADINHA: as bboxes se
  SOBREPÕEM (uma forma diagonal grande cobre outras), então o `div` que recebe o evento NÃO é
  necessariamente o objeto sob o cursor → selecionava errado. `pickObjectAt(x,y)` resolve por HIT-TEST
  de GEOMETRIA, em 3 camadas: (1) a forma PINTADA sob o cursor via `document.elementsFromPoint`
  (ignora os clones `[data-hl]` e ids não-interativos); (2) PROXIMIDADE — `geomDistPx` (amostra o
  contorno via `getPointAtLength`+CTM) acha o objeto cujo traço está a ≤ TOL px, empate → MENOR área
  (torna TRAÇOS FINOS clicáveis sem mira pixel-perfect e faz um traço vencer o quadrado com que é
  colinear); (3) fallback: a MENOR bbox que contém o ponto. Os handlers
  (`onPointerDown`/`onPointerMove`/`onDoubleClick`) delegam a ele — o `b.id` do `div` é irrelevante.
  PEGADINHA das linhas finas: uma linha vertical/horizontal tem `getBoundingClientRect` width/height ≈
  0 (Chromium ignora o traço) — o `compute()` só descarta o DEGENERADO (`< 0.5` nos DOIS eixos, não
  em um), e o handle recebe um tamanho MÍNIMO de clique (`HIT_MIN`, faixa centrada) senão o `div` de
  0px não capturaria evento e a linha (ex.: a ALTURA do Pitágoras) ficaria inalcançável. TANTO o HOVER quanto a
  SELEÇÃO abraçam a GEOMETRIA REAL — `styleHighlightClone` CLONA o grupo `#s{i}`, sobrepõe um CONTORNO
  de acento (`vector-effect: non-scaling-stroke` = largura CONSTANTE em px de tela; halo branco p/
  separar de fundo escuro/hachura) e o anexa ao `<svg>`, marcado com `data-hl="{papel}:{id}"` (papel =
  `sel`|`hover`). Seleção pulsa (respeita `prefers-reduced-motion`); hover é mais fino/apagado e sem
  pulso; hover só aparece se ≠ seleção. `reconcile(svg, papel, id)` no loop rAF é IDEMPOTENTE (se o
  clone já é do alvo, não faz nada → sem churn/flicker; troca em UM frame; RECRIA após reinjeção do
  SVG). Hover é rastreado por `hoverRef` (sem re-render → sem flicker). Segue linhas/polígonos/curvas
  em vez de um retângulo (uma forma diagonal grande daria uma caixa com o topo lá no vértice mais alto,
  lendo como "deslocado para cima"). ATENÇÃO: um `drop-shadow` (tentativa anterior) SOME sobre traço
  fino/hachura — daí o clone. O clone é só DOM vivo (sem `id`): não entra nos exports (que usam a
  string `bakedSvg`) nem vira handle. As caixas são posicionadas relativas ao rect do PRÓPRIO overlay (não ao canvas) —
  auto-contido e invariante a scroll/layout.
  O inspetor tem × (fecha), Esc desseleciona (listener só COM seleção — não rouba o Esc de dialogs)
  e minimizar (−): vira um CHIP `tipo · linha` mantendo seleção/contorno (estado PEGAJOSO — não
  reseta ao trocar de objeto; expandir clicando no chip).
  Clicar → inspetor; duplo-clique → pula pra linha (`onJumpToLine`); clicar no VAZIO desseleciona
  (`objects-deselect`) — mas só o CLIQUE LIMPO (down+up sem mover >4px): arrasto a partir do vazio é
  PAN do canvas e não pode perder a seleção. O inspetor escreve o atributo NA STATEMENT do objeto via
  `setObjectAttr(source, line, col, kind, value)` (`lib/objectEdit.ts`): acha o fim da statement
  (próximo `;` fora de aspas ou fim de linha) e SUBSTITUI/ANEXA; `readObjectAttrs` lê o estado atual.
  `statementEnd` para no `;` OU no `}` (fim de bloco) — por isso o atributo de um objeto de **macro
  (`define`)/laço (`for`)** entra DENTRO do bloco (antes do `}`), valendo p/ TODAS as instâncias, em
  vez de depois do `}` (que seria erro). Detecção (`affectsAll`): a `(line,col)` é compartilhada por
  >1 objeto OU a linha tem `{`/`}` → o inspetor mostra o aviso `objects-affects-all` mas ESTILIZA
  normalmente. Dimensões: box tem larg/alt + **raio dos CANTOS** (`box rad N`, controle `⌜`); círculo
  tem raio; elipse larg/alt.
  Atributos (o inspetor expõe TUDO que dá por elemento): `fill`/`stroke` (`shaded`/`outlined "…"` +
  cor livre `#rrggbb`), `hatch|crosshatch` (+ `hatchangle`/`hatchsep`/**`hatchwid`**/`hatchcolor`),
  **`gradient "de" "até"`** (toggle ∅/▨ p/ formas não-texto → revela cor-de/cor-até + `gradientangle`;
  o UI compõe o par de cores, o rpic exige as duas), `dashed|dotted`,
  **PEGADINHA — parâmetro órfão recria o efeito**: no rpic um `hatchsep`/`hatchcolor`/`hatchwid`/
  `hatchangle` SOZINHO (sem a keyword) já gera hachura default, e um `gradientangle` sozinho já faz
  degradê. Por isso o toggle ∅ chama `clearHatch`/`clearGradient` (removem keyword **+ TODOS os
  parâmetros** de uma vez) e `readObjectAttrs` INFERE a hachura dos parâmetros — senão a hachura "não
  some de vez" e fica por cima do gradiente.
  `thick`/**`thin`** (0.9.0 — mutuamente exclusivos: o attrSpec de um REMOVE o outro), `rotated`,
  `opacity`, **dimensões** (`wid`/`ht` p/ box/ellipse, `rad` p/ círculo — campos
  numéricos em POLEGADAS; vazio = auto), **fonte** p/ qualquer rótulo (`bold`/`italic`/`font "…"`/
  `fontsize`) e `ljust|rjust` (texto). Tudo escrito na statement (por-string p/ os de fonte).
  **TEXTO (`kind === "text"`)**: o inspetor mostra SÓ o aplicável — fonte, `ljust|rjust`, `rotated`.
  Esconde fill/stroke/hatch/gradient/dash/thick/dimensões (texto não é colorível por atributo no rpic,
  só via `class`+CSS) e ESPECIALMENTE `opacity` (em texto é ERRO de compilação: "opacity applies only
  to filled regions"). Badge do seletor mostra `{rótulo pic} · {linha} · {tipo}` (`lineLabel` fareja
  um `B:` no início da linha). Cores: `Swatches` é um grid de 6 col = "nenhuma" + 10 cores + picker
  (SEMPRE por último) = duas linhas cheias (`FILL_COLORS`/`STROKE_COLORS` têm 10 cada por isso).
  Auditoria completa dos atributos estilizáveis vs. inspetor: issue milkway/rpic-studio#1 (fora do
  escopo DE PROPÓSITO: `vpos`/`aligned` reposicionam; `mono`/`diam`/`sized` são redundantes).
  `source`+`onSourceChange` fluem EditorPage→PreviewTabs→PreviewPane→overlay. `Seg`/`Swatches` em
  `visual/inspectorControls.tsx`; cores/fontes em `lib/palette.ts`. NÃO move nem REPOSICIONA (posição
  em pic pode ser relativa) — criar/posicionar fica no código, com **autocomplete** (`rpicCompletions`).
- **Pan + coordenadas pic no preview** (`PreviewPane.tsx`): o canvas (overflow-auto) tem PAN por
  arrasto — handlers de CAPTURA no div do canvas, limiar de 4px, `setPointerCapture` (os moves param
  de chegar ao overlay durante o pan → sem churn de hover); clique limpo continua selecionando.
  PEGADINHA do zoom: `transform: scale()` NÃO cria área de rolagem (o conteúdo vaza CLIPADO e o pan
  não tem p/ onde ir) — o zoom dimensiona o LAYOUT: wrapper com `width/height = svg×zoom` (attrs
  lidos na injeção → `dims`), transform `top left` dentro, e `m-auto` p/ centrar (justify-center
  deixaria esquerda/topo INALCANÇÁVEIS ao transbordar); mudar o zoom RECENTRA o scroll. O
  rodapé do preview mostra as **coordenadas pic do cursor** (`pic-coords`; clique copia `(x, y)`
  pronto p/ o código). O SVG do rpic NÃO carrega a origem do espaço pic → `lib/picCoords.ts` resolve
  por MEDIÇÃO: um **shadow compile** com dois dots-sonda em (0,0)/(1,1) (inseridos antes do `.PE`),
  ancorado num objeto real presente nos dois compiles (as sondas podem AMPLIAR os bounds — a âncora
  transfere a diferença; a escala sai das duas sondas no MESMO compile, o que absorve `scale=…`).
  Exposto como `getPicMapping()` no `useRpic` — LAZY (só compila na 1ª chamada por versão) e cacheado.
  Cliente→viewBox pela razão `getBoundingClientRect()/viewBox` do próprio `<svg>` (correta por
  construção sob qualquer transform; obs.: TESTAMOS e o `getScreenCTM()` do Chromium atual TAMBÉM
  inclui `scale()` CSS de ancestral — o `geomDistPx` do overlay o usa e está correto; a razão
  rect/viewBox é só a forma mais à prova de dúvida). E2E fixa coords exatas a 100% e ~305% de zoom.
- **Autocomplete do PIC** (`components/editor/rpicCompletions.ts`, ligado no `CodePane` via
  `autocompletion({override})`): primitivas, direções, atributos, cores, variáveis, diretivas,
  keywords pikchr-compat (0.7.1), keywords de animação (0.8.x: `animate` + cláusulas `along/into/out/
  stagger/repeat/yoyo/ease/scroll/delay` + efeitos como strings `"slide"/"move"/"morph"/…`), NOMES de
  objetos já rotulados no doc (`from N1.e`) e macros de circuito quando `copy "circuits"` está
  presente. Disparo por prefixo de palavra.
- **Animação (`animate`, extensão rpic 0.8.x)**: o compile bundle traz `animations[]` (manifesto
  flat de tempo absoluto); o `PreviewPane` monta uma timeline **GSAP** via `animate(root, animations,
  gsap)` do pacote npm (botão replay, respeita `prefers-reduced-motion`). Efeitos: `draw/fade/pop`
  (0.6.x) + `slide` (`from <dir>`), `move` (`along <path>`), `highlight` (`to <cor>`), `morph`
  (`into <shape>`); modificadores `out`, `repeat`/`yoyo`/`ease`, `stagger` de bloco, `animate scroll`.
  O player do npm converte as formas em `<path>` p/ `move`/`morph` no browser. **`animate scroll`**:
  o `useRpic` expõe `bundle.scroll` e o `PreviewPane` troca o autoplay por um SCRUBBER (`scroll-scrub`,
  timeline nasce pausada; o replay some) — no site final o host liga o ScrollTrigger. Highlight das
  cláusulas em `rpicLanguage.ts` (`RE.attribute`); exemplos "Data flow" e "Morph" em `examples.ts`;
  referência na `HelpPage`. Ao subir a versão do rpic, SEMPRE aflorar features novas de linguagem
  nessas 4 superfícies (autocomplete + highlight + exemplos + ajuda).
  **PEGADINHA dos plugins GSAP**: `move` usa a propriedade `motionPath` e `morph` usa `morphSVG` —
  ambas EXIGEM plugins registrados (`MotionPathPlugin`/`MorphSVGPlugin`), senão o GSAP loga
  `Invalid property … Missing plugin? gsap.registerPlugin()` e o efeito não roda (os demais efeitos
  usam props nativas do core e funcionam sem plugin). Os dois vêm de graça no gsap ≥ 3.13. Toda a app
  importa `gsap` de `lib/gsap.ts` (NÃO direto de `"gsap"`), que registra os plugins uma vez e reexporta
  essa instância — é o `gsap` passado a `animate(root, animations, gsap)` em `PreviewPane`/`RpicThumb`.
- **Rodapé de versões** (`AppShell.tsx`, `AppFooter`): barra de status fina mostrando
  `rpic studio v{app} · engine rpic v{rpic} · <link release>`. As versões são INJETADAS no build por
  `define` no `vite.config.ts` (`__APP_VERSION__`/`__RPIC_VERSION__`, lidas dos `package.json` — o do
  rpic via subpath exportado do `.wasm`, pois o package não expõe `./package.json`); globais
  declaradas em `vite-env.d.ts`. A versão do studio é PRÓPRIA (SemVer independente do engine; **v0.2.0**
  = animação 0.8.x, **v0.3.0** = engine 0.9.0 com `thin`/cores-variáveis/warnings, **v0.4.0** =
  pan por arrasto + coordenadas pic com cópia + scrubber de `animate scroll` + thin/xcolor na UI,
  **v0.4.1** = zoom dimensiona o layout → pan nas 4 direções e coords exatas sob zoom, **v0.5.0** =
  engine 0.10.0: type/scramble/wiggle + draw parcial + draggable ligado no preview, **v0.5.1** =
  inspetor reconhece cor em VARIÁVEL/`0x…`/expressão (`outlined accent`) — substitui em vez de
  duplicar; `COLOR_TOKEN` no `objectEdit.ts`, **v0.6.0** = paleta de circuitos completa: ~80 macros,
  **v0.7.0** = topbar/menus responsivos p/ mobile (hambúrguer <md, rótulos `max-sm:hidden`, header do
  code pane com overflow-x) + ícones WASM na paleta de circuitos, **v0.7.1** = clone de realce SEGUE
  o transform do alvo no rAF — sem fantasma ao arrastar objeto `draggable`, **v0.8.0** = inspetor
  com × / Esc / minimizar-para-chip, **v0.9.0** = engine 0.11.0: `link` clicável — exemplo, ajuda,
  autocomplete, highlight e campo de URL no inspetor, **v0.9.1** = header do preview responsivo:
  abas curtas IMG/MD/PY no mobile + overflow-x, e o grid vertical do EditorPage trava a coluna com
  `gridTemplateColumns: minmax(0,1fr)` — sem isso conteúdo largo ALARGAVA a página inteira no celular,
  **v0.9.2** = campo LINK movido pro TOPO do inspetor — o painel ROLA e no fim ele ficava invisível
  abaixo da dobra; e2e afirma o campo perto do topo, **v0.10.0** = campo LINK lê/edita TAMBÉM a forma
  statement `link Docs "url"` (`readLabelLink`/`setLabelLink` — editar inline não adiantaria, o último
  vence; ordinais `link 1st box` fora) + botão copiar código pic no header do code pane, **v0.11.0** =
  painel Simular (dune): forma de onda, netlist, diagnósticos e realce na figura).
- **Paleta de circuitos** (`components/editor/CircuitPalette.tsx` + `lib/circuitCatalog.ts`): menu no
  header do code pane (ao lado de Examples/Defaults) que INSERE código (não é objeto visual) — o
  catálogo COMPLETO das ~80 macros públicas da biblioteca (7 grupos; popover com scroll). Assinaturas:
  DOIS pontos (`resistor(A,B)`), UM ponto centrado (`ground(P)`, gates, transistores), TRÊS pontos
  (`spdt`) e string final (`meter(A,B,"V")`, `ic_block(C,"IC1")`, `iecgate(C,"&")`, `clabel(P,"v1")`).
  O `circuitCatalog.test.ts` compila TODO snippet no WASM real — pega drift de assinatura num bump.
  Cada item tem ÍCONE: o próprio macro compilado no WASM (`circuitIconSource` + `CircuitIcon`, cache
  de módulo, `sanitizeSvg`) — fiel ao render e tingido via `.ckt-icon` (currentColor; senão o traço
  preto some no tema escuro). Garante `copy "circuits"` idempotente (`ensureCircuitsCopy`) e nomes
  de ponto `Ckt{n}` sem colisão.
  O `detectCircuits` já liga o flag sozinho. O `ObjectsOverlay` (estilo) fica por cima do render dos
  circuitos como de qualquer pic. O Popover fecha ao inserir.
- **Mobile/responsivo** (regras que evitam regressão): o layout VERTICAL do editor TRAVA a coluna
  (`gridTemplateColumns: "minmax(0,1fr)"` no grid do `EditorPage`) — sem isso QUALQUER conteúdo
  largo (ex.: header do preview) ALARGA a página inteira no celular (body com scroll horizontal,
  topbar "cortada"). Headers de painel levam `min-w-0 + overflow-x-auto` como rede de segurança.
  Padrões: rótulo de botão some `<sm` (`<span className="max-sm:hidden">` — fica ícone+Tip); nav da
  topbar vira HAMBÚRGUER `<md` (`nav-menu`); abas do preview têm rótulo curto no mobile (IMG/MD/PY);
  popovers largos levam `max-w-[calc(100vw-…)]`. Conferir com Playwright em viewport 390px:
  `document.documentElement.scrollWidth` deve ser 390.
- **Render server-side** (`routes/render.rs`, `POST /api/render` → svg|png|pdf): pic é NÃO
  confiável (`IncludePolicy::Deny`), CPU-bound em `spawn_blocking`, math via `ensure_math()`.
  Param `google_font` restrito ao `GOOGLE_FONTS` allowlist (mitiga SSRF) e casa a fonte no
  PNG/PDF. DUAS pegadinhas que deixam o texto EM BRANCO se ignoradas: (1) buscar o CSS do
  Google com **UA de Android antigo** (`Mozilla/5.0 (Linux; U; Android 2.2)`) — só assim vem
  o TTF estático completo (`/s/…ttf`); com UA moderno vem woff2/subset `/l/font?kit=` que o
  fontdb não lê; (2) depois de `db.load_font_data`, usar o **nome real da família lido do
  fontdb** (`db.faces()…families`), NÃO a string pedida — Merriweather e afins têm nameID
  diferente e não casam com `set_sans_serif_family("Merriweather")`. Carrega os 4 estilos
  (400/700 × normal/italic) p/ negrito/itálico usarem o glyph real, não sintetizado.

- **Painel Simular (dune, fase 6 do projeto dune)** — aba `SIMULATE`/`SIM` no `PreviewTabs`
  (`components/simulate/`). Simula figuras marcadas `spice = 1` (`detectSpice` em `detect.ts`)
  com o `@strategicprojects/dune-sim` **^0.3.0 do npm**. O wasm roda SÓ num **Web Worker
  terminável** (`lib/dune.worker.ts`; Cancelar = `terminate()`, o wasm não se interrompe):
  `lib/dune.ts` (`ensureDune()` à la `ensureRpic`, `.wasm` `?url`, `worker.format: "es"`) é
  importado só pelo worker → o wasm (~2 MB) só baixa no 1º Run. A simulação vive numa
  **`Session` do dune-sim DENTRO do worker** (`SimHost` em `simProtocol.ts`): 1º pedido de um
  fonte abre a sessão (`Session.fromPic` + `renderPic` + `controls`); os seguintes do MESMO
  fonte só `alter` + `runTyped` (~1 ms; sem figura/controles na resposta — o hook mantém os
  da sessão); fonte novo = sessão nova; Cancelar mata worker+sessão e o próximo pedido reabre.
  O pedido leva o conjunto COMPLETO `alters` (idempotente: quem saiu volta ao original).
  Erros serializados — `Error` perde `kind`/`diagnostics` no postMessage. Cliente em
  `simClient.ts`: `run()` (Simular) cancela o anterior; `rerun()` (slider) NUNCA mata o worker
  — fila de UM lugar, o mais novo vence (`SimSuperseded`). Estado em `useSimulation`
  (`setAlters(alters, commit)`: arrasto limitado a 1 re-run/40 ms, commit sai na hora; `epoch`
  só conta execuções NOVAS — plot/probes/cursor sobrevivem ao slider). **Colunas TIPADAS**: o
  worker usa `runTyped` (colunas `Float64Array`; complexo = re,im intercalados, NaN/±inf = ponto
  ausente) e TRANSFERE os buffers no `postMessage` (`transferablesOf`, sem repetir buffer —
  repetido é `DataCloneError`); `waveform.ts` consome `Float64Array` direto (`finiteRange` em
  laço — `Math.min(...arr)` estoura a pilha com milhões de pontos). **Figura**: o worker a
  desenha com `renderPic` do dune-sim (o rpic INTERNO do dune + prelude — a MESMA compilação
  que o `map` do extrator indexa, ids `sN` batem com `elements[].shapes`/`nets[].shapes`
  qualquer que seja o rpic do Studio); `composeSimFigure`/`stripDotLines` morreram. PEGADINHA
  React 19: `dangerouslySetInnerHTML` compara o objeto `{__html}` por IDENTIDADE — literal
  recriado a cada render reinjeta o SVG e apaga classes/clones; memoizar. **Probe por clique**
  (`SimFigure` + `simFigure.ts`): camada de clones transparentes `.sim-hit` das formas de cada
  rede com `v(rede)` no plot (traço largo em px de tela; sem `id`; só eles recebem ponteiro com
  `.probe-on`), caixa `.sim-hit-pad` com folga no toque (o ajuste de toque do Chromium pontua
  pela CAIXA — fio horizontal tem caixa de altura 0 e perdia p/ o `<svg>`), 1º clone =
  `role=button`/`aria-pressed`/Enter. `toggleProbe` guarda traço→slot de cor (religar volta ao
  slot natural se livre; cor de traço visível nunca muda; cheio = toast). Rede ligada pinta os
  originais via `.sim-probe` + `--probe-color`. A figura só monta com a aba VISÍVEL (o SVG
  repete ids/defs do preview) e fica fora da rolagem (o realce segue à vista). Realce =
  `.sim-hl`/`.has-hl` (`global.css`). Gráfico SVG à mão (`WaveformChart`, sem lib): um gráfico
  POR UNIDADE (nunca dois eixos y; `groupByUnit(entries, unitOrder)` mantém a ordem com traços
  escondidos), log em frequência > 1 década, |x| em complexo, decimação min/max (~400
  pts/traço), ticks SI, crosshair+tooltip, até 8 traços (7–8 = cores 1–2 tracejadas) + "(+N)".
  **Scrubber do `.tran`** (`TimeScrubber`, só escala em segundos): play varre em 4 s (com
  `prefers-reduced-motion`, 10 passos discretos), cursor sólido + marcas na cor de cada traço +
  `= valor` na legenda. **Sliders** (`ElementSlider` + `lib/simValues.ts`): elemento com
  `alterable()` não vazio e valor principal finito ≠ 0 (`param(refdes)`; fonte só com PULSE fica
  de fora) ganha caixa de acerto `.sim-hit-el` (1º filho do pai das formas — clone de REDE por
  cima vence: rede plota, elemento ajusta; `role=button`, Enter abre). Slider LOG ÷100…×100 em
  torno do valor do fonte (12 passos/década ≈ E12; setas = passo, PgUp/PgDn = década, Home =
  original), campo em notação SPICE (`M` = mili, `meg`), reset; ancorado sob o elemento no
  desktop, bottom sheet `<sm`. Alterado = `.sim-altered` (rótulo desenhado reescrito em itálico
  via `relabel` — UM texto por elemento, 1ª forma = rótulo de valor; `1kΩ`/`10 k` casam; sem
  texto que case, ex. TeX, o valor novo é sobreposto (`.sim-relabel`) — traço em acento) + chip "N alterados" (lista, desfazer um/tudo).
  **Escrita de volta (issue #22)**: ao TERMINAR de mexer (soltar o ponteiro, Enter/blur no
  campo, SOLTAR a tecla de passo — nunca no arrasto) o painel reescreve o argumento de valor da
  chamada do elemento no fonte (`lib/simSource.ts`: `valueEdit` → `CodePane.applyEdit`, UMA
  transação do CodeMirror — o undo reverte). Posição = cena do rpic 0.16 (`call.raw_args`, cols
  em CODEPOINTS — o `span` do bloco conta BYTES, não use), lida no MESMO compile com prelude da
  atribuição de objetos (`compileWithPrelude` → `bundle.calls` re-baseado → `useRpic().calls`
  `{source, calls}`, só válidas p/ aquele texto; o painel ajusta as posições após escrever —
  `shiftCalls` — até o preview recompilar). Qual argumento é o valor: tabela `VALUE_ARG` (macros
  do prelude; PROVISÓRIA até o `OverlayMap` do dune trazer os spans do valor). Fontes: só o
  sub-trecho do parâmetro (`DC x`/número nu inicial = dc, `AC x` = acmag; `SIN(…)` fica); grafia
  `spiceLiteral` (3 algarismos, mais se preciso p/ voltar exato), cauda de unidade preservada SÓ
  se não virar sufixo (`10mF`→`1`, nunca `1F` = femto; `rewriteNumber`). UMA gramática de número
  SPICE e UMA tabela de sufixos (`SPICE_NUMBER`/`suffixOf` em `simValues.ts`). Soltar o ponteiro
  sem ter movido não commita nem escreve; `applyEdit(edit, base)` devolve `false` se o editor
  não tem o texto `base` → nada é adotado.
  Confere o texto no span antes de trocar; sem posição confiável (macro fora da tabela, valor não
  literal tipo `{1000}`/variável, fonte mudou, ou posições ainda não prontas — mensagem própria)
  NÃO escreve e a linha `sim-writeback` diz por
  quê — o elemento fica alterado como antes. Escrito = a sessão ADOTA o fonte novo
  (`SimRequest.adopt` = CADEIA de passos `{from, to, originals}` não confirmados, mandada em todo
  pedido; a resposta traz `liveSource` e o cliente corta a cadeia até ele — duas escritas
  rápidas A→B→C seguem a sessão onde quer que ela esteja; adoção TRANSACIONAL, desfaz os alters
  se um falha): sem reabrir (plot/probes/cursor ficam), o valor vira o original,
  figura redesenhada e netlist re-extraído (`extractPic`); `from` que não bate = abertura normal.
  O centro da escala do slider é o valor NA ABERTURA (senão o polegar salta ao soltar).
  **`.ac` → `acmag`**: com `.ac` no netlist, fonte V/I com `AC x` vira slider de `acmag`
  (cabeçalho mostra o parâmetro, campo com `AC`/`DC` à frente; o `relabel` da figura recebe a
  palavra-chave e troca o número certo em `DC 1 AC 1`); o worker sempre usa
  `alter(refdes, param, v)` com o parâmetro do controle (reset também). O wasm 0.3.0
  NÃO devolve `.measure` no run (Rawfile = plots/notes/diagnostics) — painel de medidas pendente. Cores `--color-trace-1..6` (validadas p/ CVD) num `@theme static` —
  PEGADINHA: variável de `@theme` sem utility que a use é PODADA pelo Tailwind v4;
  `stroke="var(…)"` em atributo SVG não conta. `.op`/`.tf` viram tabela.
  **Preview de fonte `spice = 1` (issue #17)**: as macros de elemento do dune (`vsource`,
  `isource`, `acsource`, …) vivem no PRELUDE do dune, não na lib `-c` do rpic — sem ele o
  preview (IMAGE/SVG/diagnósticos) acusava erro falso numa figura que o SIM simula. Quando
  `detectSpice`, `useRpic`/`picCoords`/`RpicThumb` compilam via `compileFigure` (`lib/dunePrelude.ts`)
  = `prelude + "\n" + fonte` com `circuits` FORÇADO (o mesmo texto do `renderPic` do dune — SVG
  byte-idêntico, ids `sN` batem com o `map` do extrator) e o bundle COMPLETO (objects/places/
  warnings) para o inspetor. Por que prefixar: o `compile()` do rpic JS não tem opção de
  prelude/unidade nomeada → TODA posição é re-baseada (linha − linhas do prelude; caiu dentro
  do prelude → `file: "dune prelude"`, que o `errorInfo` mostra como arquivo incluído, rótulo
  i18n, nunca marcado no editor; o prefixo `"L:C:"` da mensagem também). O texto vem do módulo
  virtual `virtual:dune-prelude` (plugin no `vite.config.ts`, extraído NO BUILD do dune-sim
  instalado — `prelude()` do pacote exige o wasm de 2 MB, que só o worker carrega): chunk
  lazy de ~7 KB gz, baixado só para fonte spice; até chegar, o preview espera. Carga que
  FALHA: aquele fonte cai no `compile` puro (o usuário vê o erro real do rpic, editor vivo;
  `errorDiag` limpo) e a próxima edição tenta de novo; a miniatura idem (`console.warn` 1×).
  **Inspetor**: as formas dos elementos nascem dentro de macros (prelude/circuits) e o
  `objects` do rpic as marca com `file` — o overlay e o `solvePicMapping` ignoram objeto com
  `file`. Então o `compileWithPrelude` pede `scene: true` (só p/ ler; o SVG não muda e a scene
  não sai do bundle) e re-atribui cada objeto de macro ao bloco mais interno cujo `span` está
  no fonte do usuário (o `V1: vsource(...)`; rpic ≥ 0.16 agrupa a chamada plana) — clique
  pula para a linha do elemento e as coordenadas acham âncora. Sem bloco do usuário em
  volta, fica `file`. Todo o re-baseamento mora SÓ em `lib/dunePrelude.ts`: some quando o
  `compile()` do rpic ganhar preludes nomeados (unidades como o `-c`). Fonte sem
  `spice = 1` = `compile` puro, byte a byte como antes.

- **Painel Mapa (geopic, issue #8)** — aba `MAP`/`MAPA` no `PreviewTabs`, que SÓ existe quando
  `detectGeo(source)` (`geo_lon`/`geo_lat` ou `<Rótulo>_lon`/`_lat` atribuídos no início de
  statement) e ABRE SOZINHA quando o documento é trocado (`docEpoch` do `EditorPage`: exemplo,
  link `#pic=`, diagrama salvo) ou no 1º render — nunca ao digitar. Web npm em **0.16.0** (a API
  Rust segue na tag v0.11.0 — bump separado). **O build geo roda num WEB WORKER**
  (`lib/geo.worker.ts` + `geo.ts` + `geoProtocol.ts` + `geoClient.ts`, hook `useGeo`): o pacote
  guarda UM wasm por instância de módulo e o 1º `ready()` fixa lean/math/geo — a thread principal
  já tem o lean/math, então o geo só coexiste num grafo de módulos separado. Erros serializados
  (`pic` → `explainDiagnostic`, `geo` → `kind: message — hint`). O MapLibre (`lib/geomap.ts`,
  `@strategicprojects/rpic/maplibre` + `maplibre-gl` 6) é import DINÂMICO e tem chunk próprio
  (`manualChunks` → `maplibre`; sem isso ele e o CSS iam p/ o `vendor` da carga inicial). O port
  puro `@strategicprojects/rpic/maplibre` vai p/ o chunk `geolayers` (~5 KB): o `MapPane` o importa
  ESTÁTICO, e no chunk `maplibre` ele arrastava 1 MB + CSS p/ o `modulepreload` inicial (conferir
  `dist/index.html` após mexer nos chunks).
  `fitTo` no 1º desenho, na troca de documento e na troca de frame; ao reaparecer, `resize()`.
  Controle **rótulos** (`map-text-scale`, presets `MAP_TEXT_SCALES` 1/1.25/1.5/2 em `storage.ts`,
  persistido em `rpic:settings.v1` → `mapTextScale`, sincronizado com a conta e relido no
  `rpic:prefs`; opções formatadas pelo idioma — pt `1,25×`) é SÓ ESTILO: fica FORA do pedido ao
  worker e do `geoKey`. O `MapPane` recalcula as camadas na thread principal com o port puro do
  pacote (`layers(fc, { textScale })` de `@strategicprojects/rpic/maplibre`, = ao do engine — o
  `geo.test.ts` prova p/ cada preset; em 1× usa as camadas do próprio engine) e chama
  `setGeoJSON` (o pacote atualiza o `text-size` das camadas existentes): sem recompilar, sem
  "carregando", sem reenquadrar, sem mexer no reenquadramento armado.
  `geomap.ts` passa `before: 'labels'`: as camadas de GEOMETRIA (`pic-fill`/`pic-stroke`/
  `pic-stroke-dashed`/`pic-dot`) entram antes da 1ª camada `symbol` do basemap; `pic-text`/
  `pic-title` ficam no topo. Clique numa forma → `Popup` com `title` (ESCAPADO — fonte do usuário)
  + `geopic:kind · geopic:id`, cursor pointer no hover (cola do rpic.dev). Ouvintes no ARRAY de
  camadas (`click`, `mousemove`, `mouseleave` — um por camada apagava o ponteiro na passagem
  traço→preenchimento) e `pickFeature`: o `pic-fill` só conta com `fill` (o miolo de caixa sem
  preenchimento tem `fill-opacity 0` e não abre popup). Teste da ordem
  das camadas e do popup: `geomap.test.ts` (maplibre-gl FALSO via `vi.mock`).
  Testes: `geo.test.ts` (wasm geo real, ARQUIVO separado) e `mapPane.test.tsx` (worker inline +
  mapa falso; jsdom não tem WebGL). Exemplos com tag `maps` (fontes de rpic-lang `examples/geo`).

## i18n

Inglês (padrão) e português, sem lib: contexto em `apps/web/src/lib/i18n.tsx` com dicionários
de paridade forçada pelo TS (`t("chave")`, placeholders `{nome}`). Seletor de bandeiras na
topbar; escolha em `rpic:locale.v1`. Conteúdo estruturado (exemplos, ajuda) carrega
`{en, pt}` nos próprios dados. Novos textos de UI SEMPRE via `t()` nos dois idiomas.

## Aparência e fontes

- **Papel + fonte** vivem em `CanvasSettings` (`storage.ts`), aplicados ao SVG por `bakeAppearance`
  (reescreve `font-family` do `<svg>` raiz) — preview, thumbnails, abas SVG/Markdown e exports
  ficam idênticos. Persistido e sincronizado na conta (prefs). O EditorPage é o dono do estado;
  PreviewPane é controlado.
- **Google Fonts** (`appearance.ts`): catálogo curado, valor guardado como `g:Família`, carregado
  sob demanda pelo endpoint CSS keyless (`fonts.googleapis.com/css2`) via `ensureGoogleFont`. Em
  produção com CSP, liberar `fonts.googleapis.com` (style-src) e `fonts.gstatic.com` (font-src).
  **Por objeto**: o inspetor de estilo usa o `ObjectFontPicker` (Popover com busca + cada nome
  RENDERIZADO na própria fonte, lazy-load das Google via IntersectionObserver — mesma UX do
  `TypefacePicker` do Defaults) e grava a família crua em `font "Família"` na linha;
  `useEnsureObjectFonts(source)` (hook) fareja os `font "…"` do código e carrega no browser
  (senão o `<text font-family>` cai na genérica). Métrica é best-effort (o WASM não conhece a webfont
  → largura aproximada, pode cortar); o render server-side (`google_font`) tem métrica exata.
- **Variáveis GLOBAIS** (`picDefaults.ts`, menu Defaults): `box/ellipse/circle/arc` dims, `linewid/
  linethick/fillval`, e o tamanho da **arrowhead** (`arrowwid`/`arrowht`) — que NÃO é per-objeto no
  rpic (setar `arrowht` numa seta é ignorado), então mora só no Defaults.
- **CSS custom** (`lib/customCss.ts` + `CssPanel.tsx` com editor CodeMirror `CssEditor` — highlight de
  CSS via `@codemirror/lang-css`, dep DIRETA; botão `{} CSS`): faz o
  keyword `class "…"` do rpic virar estilo real. O CSS mora NO PRÓPRIO pic (bloco de comentário `#`
  com marcadores idempotentes, ignorado pelo compilador) → viaja de graça em save/share/reload (tudo
  carrega só `source`). `readCss`/`applyCss` leem/escrevem o bloco; `injectCss` insere um `<style>`
  após o `<svg>` (o DOMPurify preserva `class` E `<style>`). Aplicado no `bakedSvg` → preview + exports
  .svg/clipboard/png-cliente (o render SERVER-SIDE não reflete, usa o pic cru + resvg). Seletores: box
  = `.cls rect`/`.cls text`; conector = `.cls path`/`.cls polygon`. Exemplo "CSS classes (pulsing)".
  O `rpicLanguage` (StreamLanguage) tem estado `inCss` que, entre os marcadores, tokeniza o conteúdo
  dos `#` como CSS (tags `cssProp`/`cssClass`/`cssColor`/`cssTag`/`cssAt`/`cssKeyword`) → o CSS fica
  colorido TAMBÉM no code pane. Editar o CSS direto nos comentários (mantendo o `# `) atualiza o
  preview ao vivo (`bakedSvg` depende de `readCss(doc.source)`).
- **PNG export**: fontes web em SVG-dentro-de-`<img>` são best-effort (o browser pode cair na
  genérica); preview, .svg e clipboard-SVG carregam a fonte com fidelidade.
- **Variáveis pic** (`scale`, `boxwid`, `linethick`…) NÃO são aparência — mudam geometria. Vão no
  código via `DefaultsDialog` (`picDefaults.ts`, bloco idempotente por marcadores após `.PS`).

## Deploy e GitHub

- **GitHub**: `milkway/rpic-studio` (PRIVADO). CI e `rpic-release-watch` ativos. Fazer `git push`
  junto de cada deploy para manter GitHub e produção alinhados.
- **Produção**: studio.rpic.dev, via `./deploy.sh` (envia `git archive HEAD` por SSH — só o
  versionado, INDEPENDENTE do GitHub; commitar antes de publicar). Como `tar -x` NÃO apaga arquivos
  deletados no git, o deploy `rm -rf apps packages db` no servidor ANTES de extrair (senão fontes
  stale de componentes removidos quebram o `tsc`); `infra/` fica (guarda o `.env.prod`). Stack
  isolada `rpic-studio` (postgres/api internos, web em `127.0.0.1:8091`;
  `infra/docker-compose.prod.yml`), atrás de nginx+certbot no host. O deploy roda gates, smoke e
  confirma que o `iqt-etl`/`explorer-iqt-etl` e o painel-eleitoral-pe seguem `Up` — NÃO perturbar
  esses containers. CUIDADO: mudar a tag do rpic em `apps/api/Cargo.toml` faz a API RECOMPILAR o
  `rpic-core`/`render` do zero (Rust, vários min > timeout do SSH) — rodar o `up --build` DESTACADO
  (`nohup … &`) no servidor e monitorar até o container recriar.
- Segredos (`GOOGLE_CLIENT_SECRET`) vivem só em `~/rpic-app/infra/.env.prod` no servidor; nada
  de segredo versionado (só `.env.example` com placeholders). Scripts que pedem sudo vão em
  `~/config-studio-rpic/` para o usuário rodar.

## Direção visual (tema "rpic forest" — o mesmo do site rpic.dev)

Paleta portada de `../rpic/site` e `../rpic/tools/highlight/themes/`: light = slate sobre
branco com acento #1b5e20; dark = classe `.dark` no `<html>` (slate-950, como o site), 100%
via override das CSS vars em `tokens.css` — componentes nunca usam `dark:` do Tailwind. O
editor alterna os temas oficiais `rpic-forest-light/dark` (portados 1:1 em `rpicTheme.ts`,
troca via Compartment no CodePane). O papel do diagrama (`.paper-grid`, `--color-canvas`)
fica CLARO nos dois temas, como no site. Logo/favicon oficiais copiados do site
(`public/brand/logo.svg` — um "r" desenhado no próprio rpic); wordmark
`.brand-r`/`.brand-pic` (Alfa Slab One no design-system).
Fontes de UI: Bricolage Grotesque (display), Instrument Sans (UI), IBM Plex Mono (código).
Motion GSAP discreto via `@rpic/design-system` `motion.*` (respeita `prefers-reduced-motion`).
Ao mudar o tema, manter fidelidade ao site do rpic — é a mesma marca.

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
  todos os exemplos no WASM real e pega drift de comportamento. **Atual: v0.8.1** (subsistema de
  animação completo: efeitos `slide`/`move`/`highlight`/`morph` além de `draw`/`fade`/`pop`, modificador
  `out`, `repeat`/`yoyo`/`ease`, `stagger` de bloco e `animate scroll`; o manifesto ganhou chaves opcionais
  `from`/`path`/`color`/`morph`/`repeat`/`yoyo`/`ease`/`out` e o flag top-level `scroll` — o player do npm
  0.8.1 converte as formas em `<path>` p/ `move`/`morph` no browser). O pin fica em TRÊS lugares:
  `apps/web/package.json` E a raiz `package.json` (web WASM `@strategicprojects/rpic`), e a git-dep
  da API em `apps/api/Cargo.toml` (`rpic-core`/`rpic-render` na `tag = "v0.8.1"`).
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
  A bbox é SÓ o alvo de clique/hover (transparente — nunca desenha retângulo): TANTO o HOVER quanto a
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
  Clicar → inspetor; duplo-clique → pula pra linha (`onJumpToLine`); clicar no VAZIO desseleciona
  (`objects-deselect`). O inspetor escreve o atributo NA STATEMENT do objeto via
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
  `thick`, `rotated`, `opacity`, **dimensões** (`wid`/`ht` p/ box/ellipse, `rad` p/ círculo — campos
  numéricos em POLEGADAS; vazio = auto), **fonte** p/ qualquer rótulo (`bold`/`italic`/`font "…"`/
  `fontsize`) e `ljust|rjust` (texto). Tudo escrito na statement (por-string p/ os de fonte).
  Auditoria completa dos atributos estilizáveis vs. inspetor: issue milkway/rpic-studio#1 (fora do
  escopo DE PROPÓSITO: `vpos`/`aligned` reposicionam; `mono`/`diam`/`sized` são redundantes).
  `source`+`onSourceChange` fluem EditorPage→PreviewTabs→PreviewPane→overlay. `Seg`/`Swatches` em
  `visual/inspectorControls.tsx`; cores/fontes em `lib/palette.ts`. NÃO move nem REPOSICIONA (posição
  em pic pode ser relativa) — criar/posicionar fica no código, com **autocomplete** (`rpicCompletions`).
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
  O player do npm 0.8.1 converte as formas em `<path>` p/ `move`/`morph` no browser. Highlight das
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
  declaradas em `vite-env.d.ts`. A versão do studio é PRÓPRIA (SemVer independente do engine; começou
  em **v0.2.0** com o suporte a animação 0.8.x).
- **Paleta de circuitos** (`components/editor/CircuitPalette.tsx` + `lib/circuitCatalog.ts`): menu no
  header do code pane (ao lado de Examples/Defaults) que INSERE código (não é objeto visual) — 14
  macros circuit_macros com sintaxe de DOIS pontos nomeados (`resistor(A,B)`; centrados `ground(P)`),
  garante `copy "circuits"` idempotente (`ensureCircuitsCopy`) e nomes de ponto `Ckt{n}` sem colisão.
  O `detectCircuits` já liga o flag sozinho. O `ObjectsOverlay` (estilo) fica por cima do render dos
  circuitos como de qualquer pic. O Popover fecha ao inserir.
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

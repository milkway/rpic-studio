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
  escolha é FIXADA no primeiro `ready()` (wasm-bindgen) — flag `rpic:math.v1` decide na carga;
  `$…$` digitado com lean ativo só mostra o aviso de reload. Em Node/Vitest, passar bytes:
  `ready(readFileSync(...), { math? })` — teste math em ARQUIVO separado (isolamento do Vitest).
- **Releases do rpic**: o workflow `.github/workflows/rpic-release-watch.yml` abre uma issue
  com checklist de investigação quando o rpic-lang taggeia versão nova (compara com a versão
  do lockfile). Ao atualizar a dependência, rodar a suíte completa — `compile.test.ts` valida
  todos os exemplos no WASM real e pega drift de comportamento.
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
- **Editor visual** (`components/visual/VisualOverlay.tsx` + `lib/visualGraph.ts`): o código pic fica
  SEMPRE ao vivo à esquerda; à direita, uma barra de ícones (no header do `PreviewPane`) adiciona
  formas e um OVERLAY sobre o render real do rpic dá alças p/ mover/conectar/estilizar clicando no
  diagrama. O modelo é um grafo nós/arestas que **gera pic** (`graphToPic`, formato REGULAR:
  `N1: box "…" at (x,y)`, `arrow from N1.e to N2.w`). NÃO há blob embutido: o grafo é **reconstruído
  lendo o próprio pic** (`parsePic`) — código limpo, e sobrevive a draft/save/share/reload de graça.
  `parsePic` retorna null para pic escrito à mão (fora do formato) → sem edição visual. Arredonda px
  no parse p/ evitar drift no round-trip px→pol(3 casas)→px. Cada nó vira, em ORDEM, um
  `<g id="s{i}">` no SVG; o overlay lê a posição real via `getBoundingClientRect` num loop rAF (só
  setState quando muda) — imune a corridas de timing (injeção/crossFade/reflow). graph px == unidade
  de usuário do SVG (96/pol) → arrastar é `Δtela/zoom`; no drop MANTÉM o `translate` do `<g>` até o
  recompile substituir o SVG (evita o "fantasma" old+new). No modo visual o preview alinha ao
  TOPO-ESQUERDA (origem fixa) em vez de centralizar, senão mover/adicionar recentraliza tudo. Só a
  âncora (compass point) MAIS PRÓXIMA do cursor aparece (dentro de `SHOW_DIST`); o centro fica livre
  p/ mover/selecionar (âncora `.c` não é renderizada — interceptaria o clique). Conectar sai de uma
  âncora; a aresta seleciona clicando na LINHA (não há bola) e reancora arrastando as pontas
  (`fromSide/toSide`). Arraste de conexão/reancoragem usa listeners de WINDOW (não `setPointerCapture`
  na âncora, que remonta no re-render e perde a captura). Ids: nós = nome pic (N1…); arestas =
  `from-to-índice` (determinístico, IGUAL ao que `parsePic` atribui) p/ a seleção sobreviver ao
  round-trip. Losango = `line … close shaded/outlined`.
- **Editor visual — modelo e roadmap** (`lib/visualGraph.ts`): além de nós+arestas, tem `VLine`
  (conectores LIVRES: pontas `{x,y}` livres ou `{node,side}` ancoradas) e uma `Page` emitida como
  `canvas from … to …` (v0.7.0, diretiva que NÃO gera `s{i}`) que FIXA o viewBox → mover um objeto
  não desloca a figura. Rascunhos antigos com a moldura branca `PAGE: box … outlined "#ffffff"`
  ainda são lidos. `growPage` só cresce.
  Estilo por objeto (Fase 2): `fill/stroke` (cor), `hatch|crosshatch`, `dashed|dotted`, `thick`; e
  conectores com pontas `arrow`(fim)/`back`(início) → gera `arrow`/`line`/`line <-`/`line <->`. O
  overlay tem um transform modelo↔tela (derivado de um nó DIMENSIONADO — texto tem w/h nominal — ou
  da moldura da página) p/ posicionar pontos livres sem `#s{i}`; a barra é modo-ferramenta
  (select/linha/seta). Texto (Fase 3): `shape:"text"` (objeto solto `Nx: "…" at (x,y)`), rótulo
  MULTILINHA (`\n` → strings empilhadas), e `math:true` → `"$…$"` (o `esc`/`unesc` só mexem em aspas,
  NÃO dobram `\`, p/ o backslash do TeX passar). Fonte por objeto (Fase 4, rpic 0.7.0): `bold`,
  `italic`, `font "…"`, `fontsize` — atributos POR-STRING do rpic (o gerador repete em cada linha do
  rótulo; `parseLabelSeg` lê rótulos+fonte distinguindo valores de cor). **studio inteiro na rpic
  0.7.0** (web WASM `@strategicprojects/rpic@^0.7.0` — CUIDADO: o pin fica em `apps/web/package.json`,
  não só na raiz; e a git-dep da API em `apps/api/Cargo.toml` na tag `v0.7.0`). Todas as 4 issues do
  rpic-lang (#225–#228 / PRs #229–#232) TODAS adotadas: fonte por objeto, canvas fixo, cor livre
  (color picker → `shaded "#rrggbb"`), rótulo girado (`rotated`), e a geometria do bundle
  (`useRpic().objects[]`, alinhada a `s{i}`) — usada p/ **duplo-clique no objeto → pula pra linha do
  código** (`objects[nodeIndex].line` → `codeRef.focusAt`). O overlay AINDA se posiciona via
  `getBoundingClientRect` do `#s{i}` (funciona bem); migrar p/ `objects[].bbox` é robustez futura.
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
- **PNG export**: fontes web em SVG-dentro-de-`<img>` são best-effort (o browser pode cair na
  genérica); preview, .svg e clipboard-SVG carregam a fonte com fidelidade.
- **Variáveis pic** (`scale`, `boxwid`, `linethick`…) NÃO são aparência — mudam geometria. Vão no
  código via `DefaultsDialog` (`picDefaults.ts`, bloco idempotente por marcadores após `.PS`).

## Deploy e GitHub

- **GitHub**: `milkway/rpic-studio` (PRIVADO). CI e `rpic-release-watch` ativos. Fazer `git push`
  junto de cada deploy para manter GitHub e produção alinhados.
- **Produção**: studio.rpic.dev, via `./deploy.sh` (envia `git archive HEAD` por SSH — só o
  versionado, INDEPENDENTE do GitHub; commitar antes de publicar). Stack isolada `rpic-studio`
  (postgres/api internos, web em `127.0.0.1:8091`; `infra/docker-compose.prod.yml`), atrás de
  nginx+certbot no host. O deploy roda gates, smoke e confirma que o `iqt-etl`/`explorer-iqt-etl`
  e o painel-eleitoral-pe seguem `Up` — NÃO perturbar esses containers do servidor.
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

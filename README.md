# rpic studio

Editor web de diagramas na linguagem **rpic** (o [pic](https://rpic.dev) de Brian Kernighan,
modernizado): você escreve o desenho em texto e o vê nascer ao vivo — com animação, biblioteca
de circuitos e compartilhamento por link. Renderização 100% no browser via WebAssembly
([`@strategicprojects/rpic`](https://www.npmjs.com/package/@strategicprojects/rpic)).

UX inspirada no [pikup](https://box.pe.gov.br/app/pikup/); stack e convenções do
template [peabiru](../peabiru).

## Funcionalidades

- **Editor + preview ao vivo** — CodeMirror 6 com highlight da gramática rpic, recompila a cada
  pausa de digitação; erros viram sublinhado e painel de diagnóstico, mantendo o último diagrama
  válido em tela.
- **Animações** — a extensão `animate` do rpic vira uma timeline GSAP tocada no preview.
- **Sem login** — rascunho salvo em `localStorage`; compartilhamento por link com o código
  comprimido (lz-string) no fragment `#pic=…`, que nunca chega a servidor algum.
- **Com login (Google)** — salvar, listar e nomear diagramas; link curto público `/d/:slug`.
- **Exports** — `.pic`, `.svg`, `.png` (2x) e cópia como imagem; abas com o SVG bruto e snippet
  Markdown.
- **Biblioteca de circuitos** — interruptor "circuitos" habilita `resistor()`, `lamp()`,
  `and_gate()` e ~76 outras macros.
- **Mapa (geopic)** — fonte com registro geográfico (`geo_lon`/`geo_lat`, ou pontos de controle
  `<Rótulo>_lon`/`_lat`) ganha a aba **Mapa** ao lado da imagem, que abre sozinha ao carregar a
  fonte (exemplo, link `#pic=`, diagrama salvo): o desenho num MapLibre GL (basemap OpenFreeMap
  positron), re-georreferenciado a cada pausa de digitação, seletor de `frame` (como na fonte /
  `enu` / `mercator`), controle **rótulos** (tamanho dos rótulos do desenho: 1×, 1,25×, 1,5×, 2× —
  `textScale` do engine; lembrado entre sessões, troca na hora sem recompilar nem reenquadrar), linha de status (método,
  escala m/in, rumo, rms) e botão **GeoJSON** que baixa `drawing.geojson`. As formas do desenho
  ficam SOB os rótulos do basemap (nomes de lugar legíveis sobre um preenchimento) e os rótulos do
  próprio desenho por cima; clicar numa forma (o miolo de uma caixa sem
  preenchimento não conta) abre um popup com o `title` e `tipo · id`. O build geo do wasm (~690 KB) roda num Web Worker e o MapLibre é import
  dinâmico — quem não abre fonte geo não baixa nenhum dos dois. Exemplos no grupo "Mapas".

## Desenvolvimento

```sh
npm install
npm run dev            # web em http://localhost:5173

# backend (fase 2)
docker compose -f infra/docker-compose.yml up -d postgres
cargo run --manifest-path apps/api/Cargo.toml   # api em :8080 (proxy do Vite cobre /api)
```

Qualidade: `npm run build` (tsc estrito + vite), `npm run lint`, `npm test` (Vitest, inclui o
WASM real em Node), `npm run e2e` (Playwright).

## Estrutura

```
apps/web/                 SPA React 19 + Vite 8 + Tailwind v4
apps/api/                 API Rust/Axum + SQLx (login Google, diagramas salvos)
packages/design-system/   tokens ("nanquim & papel"), cn(), motion GSAP
db/migrations/            SQL puro, aplicado no boot do Postgres
infra/                    docker-compose (Postgres 18)
```

## Deploy

Produção em **studio.rpic.dev** (Docker Compose isolado atrás do nginx do host).
Publicar o HEAD com um comando:

```sh
./deploy.sh              # roda os gates (build+lint+test), envia e rebuilda
./deploy.sh --no-gates   # deploy rápido, sem os gates
```

O script envia só o versionado (`git archive`), sobe a stack `rpic-studio`
(web em `127.0.0.1:8091`; postgres/api internos), faz smoke e confere que os
outros serviços do servidor seguem no ar. Config de nginx/TLS: `infra/` e o
script `~/config-studio-rpic/setup-nginx.sh` no servidor.

Imagem web com base path configurável (raiz ou subcaminho):

```sh
docker build -f apps/web/Dockerfile --build-arg BASE_PATH=/rpic/ -t rpic-web .
```

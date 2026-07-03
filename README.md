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

Imagem web com base path configurável (raiz ou subcaminho):

```sh
docker build -f apps/web/Dockerfile --build-arg BASE_PATH=/rpic/ -t rpic-web .
```

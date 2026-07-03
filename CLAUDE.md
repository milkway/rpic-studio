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
- **WASM**: inicializar via `ensureRpic()` (`apps/web/src/lib/rpic.ts`); o `.wasm` entra como
  asset com `?url`. Em Node/Vitest, passar os bytes: `ready(readFileSync(...))`.
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

## i18n

Inglês (padrão) e português, sem lib: contexto em `apps/web/src/lib/i18n.tsx` com dicionários
de paridade forçada pelo TS (`t("chave")`, placeholders `{nome}`). Seletor de bandeiras na
topbar; escolha em `rpic:locale.v1`. Conteúdo estruturado (exemplos, ajuda) carrega
`{en, pt}` nos próprios dados. Novos textos de UI SEMPRE via `t()` nos dois idiomas.

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

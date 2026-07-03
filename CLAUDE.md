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

## Direção visual ("nanquim & papel")

Editor escuro cor de tinta (`--color-ink*`), preview papel com grade de pontos (`.paper-grid`),
acento vermelhão único (`--color-accent`). Fontes: Bricolage Grotesque (display), Instrument
Sans (UI), IBM Plex Mono (código). Motion GSAP discreto via `@rpic/design-system` `motion.*`
(sempre respeitando `prefers-reduced-motion`).

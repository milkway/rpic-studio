#!/usr/bin/env bash
# Deploy do rpic studio para studio.rpic.dev.
# Envia o HEAD (git archive — só o versionado), rebuilda a stack isolada no
# servidor e faz smoke, conferindo que o painel e o ETL do IQT seguem intactos.
#
#   ./deploy.sh              # gates (build+lint+test) e deploy
#   ./deploy.sh --no-gates   # pula os gates (deploy rápido)
set -euo pipefail

HOST="${RPIC_DEPLOY_HOST:-studio.rpic.dev}"
REMOTE_DIR="${RPIC_DEPLOY_DIR:-rpic-app}"
URL="https://studio.rpic.dev"
COMPOSE="docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod"

cd "$(dirname "$0")"

if [ -n "$(git status --porcelain)" ]; then
  echo "⚠️  Há mudanças não commitadas — o deploy envia apenas o HEAD (git archive)."
  echo "    Commit antes para publicá-las. Continuando com o HEAD atual…"
fi

if [ "${1:-}" != "--no-gates" ]; then
  echo "▶ Gates locais (build · lint · test)…"
  npm run build >/dev/null
  npm run lint >/dev/null
  npm test --silent >/dev/null
  echo "  ✓ verdes"
fi

echo "▶ Enviando o código ($(git rev-parse --short HEAD)) para $HOST:~/$REMOTE_DIR…"
git archive --format=tar HEAD | ssh "$HOST" "mkdir -p ~/$REMOTE_DIR && tar -x -C ~/$REMOTE_DIR"

echo "▶ Rebuild + up (stack isolada; postgres/api internos)…"
ssh "$HOST" "cd ~/$REMOTE_DIR && $COMPOSE up -d --build" 2>&1 | grep -vi "warning" | tail -8

echo "▶ Smoke…"
sleep 4
code=$(curl -s -o /dev/null -w "%{http_code}" "$URL/")
cfg=$(curl -s "$URL/api/auth/config")
echo "  home: $code   auth/config: $cfg"
[ "$code" = "200" ] || { echo "❌ home não retornou 200"; exit 1; }

echo "▶ Painel + ETL do IQT (devem seguir intactos)…"
ssh "$HOST" 'docker ps --format "  {{.Names}} {{.Status}}" | grep -E "painel|iqt" || echo "  (nenhum encontrado!)"'

echo "✅ Deploy concluído: $URL"

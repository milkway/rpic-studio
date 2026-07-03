# ---- build ----
# Raiz:        docker build -f apps/web/Dockerfile -t rpic-web .
# Subcaminho:  docker build -f apps/web/Dockerfile --build-arg BASE_PATH=/rpic/ -t rpic-web .
FROM node:24-slim AS builder
WORKDIR /app
ARG BASE_PATH=/
COPY package.json package-lock.json* ./
COPY packages/design-system/package.json packages/design-system/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm install
COPY packages ./packages
COPY apps/web ./apps/web
# BASE_PATH é lido por vite.config.ts (base) e injetado em import.meta.env.BASE_URL.
RUN BASE_PATH="$BASE_PATH" npm run build --workspace apps/web

# ---- runtime ----
FROM nginx:alpine
ARG BASE_PATH=/
COPY apps/web/nginx.conf.template /tmp/nginx.conf.template
RUN sed "s#__BASE__#${BASE_PATH}#g" /tmp/nginx.conf.template > /etc/nginx/conf.d/default.conf \
  && rm /tmp/nginx.conf.template
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80

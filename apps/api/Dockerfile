# ---- build ----
# docker build -f apps/api/Dockerfile -t rpic-api .
FROM rust:1-slim AS builder
WORKDIR /app
COPY apps/api/Cargo.toml apps/api/Cargo.lock* ./
# cache de dependências: compila um main vazio primeiro
RUN mkdir -p src && echo "fn main() {}" > src/main.rs \
  && echo "" > src/lib.rs \
  && cargo build --release 2>/dev/null || true
COPY apps/api/src ./src
RUN touch src/main.rs src/lib.rs && cargo build --release

# ---- runtime ----
FROM debian:trixie-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/rpic-api /usr/local/bin/rpic-api
EXPOSE 8080
CMD ["rpic-api"]

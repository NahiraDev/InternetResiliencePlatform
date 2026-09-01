#!/usr/bin/env bash
set -euo pipefail
compose_file=${COMPOSE_FILE:-compose.yaml}
api_port=${API_PORT:-8080}

docker compose -f "$compose_file" config >/dev/null
docker compose -f "$compose_file" build --pull
docker compose -f "$compose_file" down --volumes --remove-orphans
cleanup() { docker compose -f "$compose_file" down --volumes --remove-orphans; }
trap cleanup EXIT

# Bring PostgreSQL up first and wait for its actual container health state before
# creating the API container. This avoids relying on Compose dependency ordering
# for the API's first DNS lookup of the `postgres` service on CI runners.
docker compose -f "$compose_file" up -d postgres
postgres_container=$(docker compose -f "$compose_file" ps -q postgres)
test -n "$postgres_container"
for _ in $(seq 1 60); do
  postgres_health=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}starting{{end}}' "$postgres_container")
  if [ "$postgres_health" = "healthy" ]; then break; fi
  if [ "$postgres_health" = "unhealthy" ]; then
    docker compose -f "$compose_file" ps >&2
    docker compose -f "$compose_file" logs --no-color postgres >&2
    exit 1
  fi
  sleep 2
done
test "$postgres_health" = "healthy"

docker compose -f "$compose_file" up -d --force-recreate api

wait_ready() {
  for _ in $(seq 1 90); do
    if curl -fsS "http://localhost:${api_port}/api/v1/ready" >/dev/null; then return 0; fi
    sleep 2
  done
  docker compose -f "$compose_file" ps >&2
  docker compose -f "$compose_file" logs --no-color api >&2
  return 1
}

wait_not_ready() {
  for _ in $(seq 1 30); do
    if ! curl -fsS "http://localhost:${api_port}/api/v1/ready" >/dev/null; then return 0; fi
    sleep 1
  done
  return 1
}

wait_ready
curl -fsS "http://localhost:${api_port}/api/v1/health" >/dev/null
curl -fsS "http://localhost:${api_port}/api/v1/live" >/dev/null
curl -fsS "http://localhost:${api_port}/api/v1/platform/status" | node -e 'let s=""; process.stdin.on("data", d => s += d); process.stdin.on("end", () => { const body = JSON.parse(s); if (body.success !== true || body.data.dependencies.database !== "healthy") process.exit(1); });'
curl -fsS "http://localhost:${api_port}/api/v1/metrics" | grep -E 'process_|irp_http_' >/dev/null

docker compose -f "$compose_file" ps
api_container=$(docker compose -f "$compose_file" ps -q api)
test -n "$api_container"
test "$(docker inspect -f '{{.Config.User}}' "$api_container")" = "irp"
docker exec "$api_container" sh -c '
  set -eu
  test "$(id -u)" != "0"
  for path in /app/.local/share/pnpm /app/tmp; do
    test -w "$path"
  done
  pnpm --version >/dev/null
  pnpm exec prisma --version >/dev/null
'
! docker compose -f "$compose_file" logs --no-color api | grep -Ei 'EACCES.*corepack|password|JWT_SECRET|DATABASE_URL|REMOTE_CLIENT_CREDENTIAL_KEY|REMOTE_CLIENT_REFRESH_KEY' >/dev/null

docker compose -f "$compose_file" restart api
wait_ready

docker compose -f "$compose_file" stop postgres
wait_not_ready
docker compose -f "$compose_file" start postgres
wait_ready

docker compose -f "$compose_file" down --remove-orphans
docker compose -f "$compose_file" up -d
wait_ready

docker compose -f "$compose_file" stop api
docker compose -f "$compose_file" logs --no-color api | grep -E 'shutdown requested|shutdown complete' >/dev/null

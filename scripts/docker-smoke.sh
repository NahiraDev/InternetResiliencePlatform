#!/usr/bin/env bash
set -euo pipefail
compose_file=${COMPOSE_FILE:-compose.yaml}
api_port=${API_PORT:-8080}

docker compose -f "$compose_file" config >/dev/null
docker compose -f "$compose_file" build --pull
docker compose -f "$compose_file" down --volumes --remove-orphans
docker compose -f "$compose_file" up -d
cleanup() { docker compose -f "$compose_file" down --volumes --remove-orphans; }
trap cleanup EXIT

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
  for path in /app/.cache/node/corepack /app/.cache/node/corepack/v1 /app/.local/share/pnpm /app/tmp; do
    test -w "$path"
  done
  pnpm --version >/dev/null
'
! docker compose -f "$compose_file" logs --no-color api | grep -Ei 'EACCES.*corepack|password|JWT_SECRET|DATABASE_URL' >/dev/null

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

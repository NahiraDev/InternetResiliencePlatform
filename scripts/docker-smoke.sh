#!/usr/bin/env bash
set -euo pipefail
compose_file=${COMPOSE_FILE:-compose.yaml}
docker compose -f "$compose_file" config >/dev/null
docker compose -f "$compose_file" build
docker compose -f "$compose_file" up -d
cleanup() { docker compose -f "$compose_file" down --remove-orphans; }
trap cleanup EXIT
for i in {1..60}; do
  if curl -fsS http://localhost:${API_PORT:-8080}/api/v1/ready >/dev/null; then break; fi
  sleep 2
  if [[ "$i" == 60 ]]; then echo "API readiness timed out" >&2; exit 1; fi
done
curl -fsS http://localhost:${API_PORT:-8080}/api/v1/health >/dev/null
curl -fsS http://localhost:${API_PORT:-8080}/api/v1/metrics | grep -E 'process_|irp_http_' >/dev/null
docker compose -f "$compose_file" ps
api_container=$(docker compose -f "$compose_file" ps -q api)
test -n "$api_container"
test "$(docker inspect -f '{{.Config.User}}' "$api_container")" = "irp"
! docker compose -f "$compose_file" logs api | grep -i 'EACCES.*corepack' >/dev/null

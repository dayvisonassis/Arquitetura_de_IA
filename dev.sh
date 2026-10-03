#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

export MSYS_NO_PATHCONV=1

NETWORK=ai-gateway-dev-net
INFRA_ENV=.env.infra
INFRA_PROJECT=ai-gateway-infra
APP_PROJECT=ai-gateway-app

usage() {
  cat <<'EOF'
Usage: ./dev.sh [--infra | --down]

  (no option)  start MySQL, Redis and the apps
  --infra      start only MySQL and Redis, for the integration tests
  --down       stop the apps and the infrastructure, keeping the volumes
EOF
}

fail() {
  printf 'dev.sh: %s\n' "$*" >&2
  exit 1
}

require_docker() {
  docker info >/dev/null 2>&1 ||
    fail 'Docker is not responding. Start Docker Desktop and run ./dev.sh again.'
}

example_of() {
  case "$1" in
    "$INFRA_ENV") printf 'config/.env.infra.example' ;;
    *) printf '%s/config/.env.development.example' "$(dirname "$1")" ;;
  esac
}

require_files() {
  local missing=() file
  for file in "$@"; do
    [[ -f "$file" ]] || missing+=("$file")
  done
  if ((${#missing[@]} > 0)); then
    printf 'dev.sh: missing environment files:\n' >&2
    for file in "${missing[@]}"; do
      printf '  %-32s cp %s %s\n' "$file" "$(example_of "$file")" "$file" >&2
    done
    exit 1
  fi
}

ensure_network() {
  docker network inspect "$NETWORK" >/dev/null 2>&1 ||
    docker network create "$NETWORK" >/dev/null
}

infra_compose() {
  docker compose -p "$INFRA_PROJECT" -f docker-compose.infra.dev.yml \
    --env-file "$INFRA_ENV" "$@"
}

start_infra() {
  ensure_network
  infra_compose up -d --wait
}

stop_all() {
  docker compose -p "$APP_PROJECT" down
  docker compose -p "$INFRA_PROJECT" down
}

main() {
  case "${1:-}" in
    --infra)
      require_docker
      require_files "$INFRA_ENV"
      start_infra
      printf '\nMySQL: 127.0.0.1:3306\nRedis: 127.0.0.1:6379\n'
      ;;
    --down)
      require_docker
      stop_all
      ;;
    -h | --help)
      usage
      ;;
    *)
      usage >&2
      exit 2
      ;;
  esac
}

main "$@"

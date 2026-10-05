#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

export MSYS_NO_PATHCONV=1

NETWORK=ai-gateway-dev-net
INFRA_ENV=.env.infra
INFRA_PROJECT=ai-gateway-infra
APP_PROJECT=ai-gateway-app
APP_ENVS=(
  apps/backend/.env.development
  apps/ia/.env.development
  apps/ia_simulator/.env.development
)

usage() {
  cat <<'EOF'
Usage: ./dev.sh [--infra | --down]

  (no option)  start MySQL, Redis and the apps, applying the migrations and the backend seed
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
      printf '  %-36s cp %s %s\n' "$file" "$(example_of "$file")" "$file" >&2
    done
    exit 1
  fi
}

env_value() {
  local line
  line="$(grep -E "^[[:space:]]*$2=" "$1" | tail -n 1 || true)"
  line="${line#*=}"
  printf '%s' "${line%$'\r'}"
}

require_same_secret() {
  local app_file="$1" app_name="$2" infra_name="$3"
  if [[ "$(env_value "$app_file" "$app_name")" != "$(env_value "$INFRA_ENV" "$infra_name")" ]]; then
    fail "$app_name in $app_file does not match $infra_name in $INFRA_ENV (values not shown)."
  fi
}

require_matching_passwords() {
  require_same_secret apps/backend/.env.development DB_PASSWORD WEB_DB_PASSWORD
  require_same_secret apps/ia/.env.development DB_PASSWORD GATEWAY_DB_PASSWORD
  require_same_secret apps/backend/.env.development REDIS_PASSWORD REDIS_PASSWORD
  require_same_secret apps/ia/.env.development REDIS_PASSWORD REDIS_PASSWORD
}

ensure_network() {
  docker network inspect "$NETWORK" >/dev/null 2>&1 ||
    docker network create "$NETWORK" >/dev/null
}

infra_compose() {
  docker compose -p "$INFRA_PROJECT" -f docker-compose.infra.dev.yml \
    --env-file "$INFRA_ENV" "$@"
}

app_compose() {
  docker compose -p "$APP_PROJECT" -f docker-compose.app.dev.yml "$@"
}

start_infra() {
  ensure_network
  infra_compose up -d --wait
}

apply_migrations() {
  local app
  for app in backend ia; do
    printf '\nApplying the %s migrations\n' "$app"
    app_compose run --rm --no-deps --build "$app" npm run -s migrations:dev
  done
}

apply_seeds() {
  printf '\nApplying the backend development seed\n'
  app_compose run --rm --no-deps backend npm run -s seed:dev
}

start_apps() {
  app_compose up -d --build --wait
}

stop_all() {
  docker compose -p "$APP_PROJECT" down
  docker compose -p "$INFRA_PROJECT" down
}

print_addresses() {
  cat <<'EOF'

AI Gateway is up:
  frontend  http://127.0.0.1:4200
  backend   http://127.0.0.1:3030
  proxy     http://127.0.0.1:3131
  MySQL     127.0.0.1:3306
  Redis     127.0.0.1:6379
Logs: docker compose -p ai-gateway-app logs -f <service>
EOF
}

main() {
  case "${1:-}" in
    '')
      require_docker
      require_files "$INFRA_ENV" "${APP_ENVS[@]}"
      require_matching_passwords
      start_infra
      apply_migrations
      apply_seeds
      start_apps
      print_addresses
      ;;
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

#!/bin/sh
set -eu

HASH_FILE=node_modules/.dev-entrypoint-lock-hash

lock_hash() {
  if [ -f .npmrc ]; then
    cat package-lock.json .npmrc | sha256sum | cut -d' ' -f1
  else
    sha256sum package-lock.json | cut -d' ' -f1
  fi
}

current="$(lock_hash)"
if [ ! -f "$HASH_FILE" ] || [ "$(cat "$HASH_FILE")" != "$current" ]; then
  echo "dev-entrypoint: package-lock.json changed, running npm ci"
  npm ci --no-audit --no-fund
  echo "$current" >"$HASH_FILE"
fi

exec "$@"

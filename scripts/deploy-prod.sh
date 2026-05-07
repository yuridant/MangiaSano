#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.prod}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose.prod.yml}"
PULL_CHANGES=0

usage() {
  cat <<'EOF'
Usage: scripts/deploy-prod.sh [--pull]

Deploy production containers with docker compose.

Options:
  --pull   Run git pull --ff-only before the deploy
  --help   Show this message
EOF
}

while (($# > 0)); do
  case "$1" in
    --pull)
      PULL_CHANGES=1
      shift
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "Missing compose file: $COMPOSE_FILE" >&2
  exit 1
fi

cd "$ROOT_DIR"

if ((PULL_CHANGES)); then
  git pull --ff-only
fi

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --build

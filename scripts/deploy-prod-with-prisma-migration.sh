#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.prod}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose.prod.yml}"
PULL_CHANGES=0
MIGRATION_FILE=""

usage() {
  cat <<'EOF'
Usage: scripts/deploy-prod-with-prisma-migration.sh [--pull] [migration-file]

Deploy production after applying a Prisma SQL migration directly on Postgres.

Arguments:
  migration-file   Optional path to a specific migration.sql file.
                   If omitted, the latest file in apps/backend/prisma/migrations is used.

Options:
  --pull   Run git pull --ff-only before the migration and deploy
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
      if [[ -n "$MIGRATION_FILE" ]]; then
        echo "Only one migration file can be provided." >&2
        exit 1
      fi
      MIGRATION_FILE="$1"
      shift
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

if [[ -z "$MIGRATION_FILE" ]]; then
  MIGRATION_FILE="$(find "$ROOT_DIR/apps/backend/prisma/migrations" -mindepth 2 -maxdepth 2 -type f -name 'migration.sql' | sort | tail -n 1)"
fi

if [[ -z "$MIGRATION_FILE" || ! -f "$MIGRATION_FILE" ]]; then
  echo "Migration file not found: ${MIGRATION_FILE:-<empty>}" >&2
  exit 1
fi

MIGRATION_ID="$(basename "$(dirname "$MIGRATION_FILE")")/$(basename "$MIGRATION_FILE")"

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

POSTGRES_USER="${POSTGRES_USER:-mangiasano}"
POSTGRES_DB="${POSTGRES_DB:-mangiasano}"

echo "Using migration: $MIGRATION_FILE"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d postgres

for attempt in $(seq 1 30); do
  if docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
    pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
    break
  fi

  if [[ "$attempt" == "30" ]]; then
    echo "Postgres is not ready after waiting." >&2
    exit 1
  fi

  sleep 2
done

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<SQL
CREATE TABLE IF NOT EXISTS "_ManualSqlMigration" (
  "migrationId" TEXT PRIMARY KEY,
  "appliedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SQL

ALREADY_APPLIED="$(
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
    psql -At -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    -c "SELECT COUNT(*) FROM \"_ManualSqlMigration\" WHERE \"migrationId\" = '$MIGRATION_ID';"
)"

if [[ "$ALREADY_APPLIED" == "0" ]]; then
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
    psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" < "$MIGRATION_FILE"

  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
    psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    -c "INSERT INTO \"_ManualSqlMigration\" (\"migrationId\") VALUES ('$MIGRATION_ID') ON CONFLICT (\"migrationId\") DO NOTHING;"
else
  echo "Skipping already applied migration: $MIGRATION_ID"
fi

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --build

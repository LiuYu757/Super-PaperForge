#!/usr/bin/env bash
#
# PR-0 acceptance-baseline environment script.
#
# Starts the isolated PostgreSQL/Redis/MinIO stack, applies schema migrations,
# creates the MinIO bucket, and tears everything down again. Run this before
# `npm run test:integration` so the failing R01-R06 cases execute against real
# infrastructure instead of being skipped.
#
#   ./scripts/test-env.sh up        # start services
#   ./scripts/test-env.sh migrate   # apply migrations to the test DB
#   ./scripts/test-env.sh seed      # ensure the MinIO bucket exists
#   ./scripts/test-env.sh down      # stop and delete the test volumes
#   ./scripts/test-env.sh up --fresh
set -euo pipefail

cd "$(dirname "$0")/.."

# Prefer a node that can parse URLs natively. Homebrew's node crashes when
# ada-url is upgraded out from under it (`new URL(...)` aborts) — fall back to
# a distributed node binary before running any tooling.
NODE_PROBE="new URL('postgresql://u:p@h:1/db')"
if ! node -e "$NODE_PROBE" >/dev/null 2>&1; then
  for cand in "$HOME/.local/nodedist"/*/bin; do
    if "$cand/node" -e "$NODE_PROBE" >/dev/null 2>&1; then
      export PATH="$cand:$PATH"
      echo "[test-env] using node from $cand"
      break
    fi
  done
fi

COMPOSE="docker compose -f docker-compose.test.yml"
# Fall back to the standalone v2 binary when the compose plugin is missing
# (both spellings are valid; the plugin one is preferred on newer Docker).
if ! docker compose version >/dev/null 2>&1; then
  COMPOSE="docker-compose -f docker-compose.test.yml"
fi
TEST_DB_URL="postgresql://paperforge:paperforge-test-password@localhost:5433/paperforge_test"
export DATABASE_URL="$TEST_DB_URL"

case "${1:-up}" in
  up)
    $COMPOSE up -d --wait
    ;;
  migrate)
    # prisma.config.ts loads .env, which may describe the *dev* database; force
    # the test URL through explicit env instead, and disambiguate the schema.
    DATABASE_URL="$TEST_DB_URL" npx prisma migrate deploy
    echo "[test-env] migrations applied to $TEST_DB_URL"
    # Plant the acceptance-instance marker. tests/helpers/test-infra.ts refuses
    # to run ANY destructive SQL (resetDatabase) when this marker is missing —
    # it is the strongest guarantee that we never point at a real database.
    $COMPOSE exec -T postgres psql -U paperforge -d paperforge_test -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE IF NOT EXISTS paperforge_test_marker (
  marker TEXT NOT NULL,
  marked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
DELETE FROM paperforge_test_marker;
INSERT INTO paperforge_test_marker (marker) VALUES ('paperforge-acceptance-test-instance');
SQL
    echo "[test-env] acceptance marker planted in paperforge_test_marker"
    ;;
  seed)
    node scripts/ensure-test-bucket.mjs
    ;;
  down)
    $COMPOSE down -v
    ;;
  *)
    echo "unknown subcommand: $1" >&2
    exit 2
    ;;
esac
#!/usr/bin/env bash
# Runs the migrations and the permission tests against a THROWAWAY local
# PostgreSQL database. Never points at the real Supabase project.
# Usage: ./run_local_tests.sh            (needs PostgreSQL 15+ binaries)
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
MIG="$HERE/../migrations"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
WORK="$(mktemp -d)"
PORT="${PORT:-54329}"
RUN_AS=""
if [ "$(id -u)" = "0" ]; then RUN_AS="runuser -u postgres --"; chown -R postgres "$WORK"; fi

cleanup() { $RUN_AS "$PGBIN/pg_ctl" -D "$WORK/db" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT

$RUN_AS "$PGBIN/initdb" -D "$WORK/db" -U postgres -E UTF8 --locale=C.UTF-8 >/dev/null
$RUN_AS "$PGBIN/pg_ctl" -D "$WORK/db" -o "-p $PORT -k $WORK -c listen_addresses=''" -l "$WORK/log" -w start >/dev/null

PSQL=($RUN_AS "$PGBIN/psql" -h "$WORK" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X)

"${PSQL[@]}" -f "$HERE/00_supabase_stub.sql"
for f in "$MIG"/*.sql; do echo "migration: $(basename "$f")"; "${PSQL[@]}" -f "$f"; done
# migrations must be safe to inspect twice: re-running is not supported, so just verify they applied
"${PSQL[@]}" -f "$HERE/10_fixtures_fictional.sql"
"${PSQL[@]}" -f "$HERE/20_permission_tests.sql" >/dev/null

"${PSQL[@]}" -A -F ' | ' -c "select case when ok then 'PASS' else 'FAIL' end, label, detail from tests.results order by id"
FAILED=$("${PSQL[@]}" -A -t -c "select count(*) from tests.results where not ok")
TOTAL=$("${PSQL[@]}" -A -t -c "select count(*) from tests.results")
echo "----"
echo "total: $TOTAL, failed: $FAILED"
[ "$FAILED" = "0" ]

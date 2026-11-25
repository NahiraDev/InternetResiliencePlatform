#!/usr/bin/env bash
# Backup + restore rehearsal for the IRP PostgreSQL database (issue #411).
#
#   SOURCE_DATABASE_URL  database to back up (read-only access is enough)
#   TARGET_DATABASE_URL  EMPTY, isolated database to restore into (never production)
#
# Takes a custom-format pg_dump, restores it into the target, then verifies that every table has the same
# row count and that the Prisma migration history matches. Prints timings and a JSON evidence summary on
# stdout. Connection strings are read from the environment and never printed.
set -euo pipefail

: "${SOURCE_DATABASE_URL:?set SOURCE_DATABASE_URL}"
: "${TARGET_DATABASE_URL:?set TARGET_DATABASE_URL}"
[ "$SOURCE_DATABASE_URL" != "$TARGET_DATABASE_URL" ] || { echo "refusing: source and target are identical" >&2; exit 2; }

dump="$(mktemp -t irp-rehearsal-XXXXXX.dump)"
list="$(mktemp -t irp-rehearsal-XXXXXX.list)"
trap 'rm -f "$dump" "$list"' EXIT
now() { date +%s; }
q() { psql "$1" -X -A -t -v ON_ERROR_STOP=1 -c "$2"; }

existing="$(q "$TARGET_DATABASE_URL" "select count(*) from information_schema.tables where table_schema='public'")"
[ "$existing" = "0" ] || { echo "refusing: target already has $existing tables; restore into an empty database" >&2; exit 2; }

# A schema-scoped dump does not carry extensions (citext, uuid-ossp, ...): recreate the source's in the target.
while IFS= read -r ext; do
  [ -n "$ext" ] && q "$TARGET_DATABASE_URL" "create extension if not exists \"$ext\" schema public" >/dev/null
done < <(q "$SOURCE_DATABASE_URL" "select extname from pg_extension where extname not in ('plpgsql') order by 1")

t0="$(now)"
pg_dump "$SOURCE_DATABASE_URL" --format=custom --no-owner --no-privileges --schema=public --file="$dump"
t1="$(now)"
# The target already has an (empty) public schema, so skip the dump's CREATE SCHEMA entry.
pg_restore --list "$dump" | grep -v -E '^[0-9]+; [0-9]+ [0-9]+ SCHEMA - public ' > "$list"
pg_restore --dbname="$TARGET_DATABASE_URL" --no-owner --no-privileges --exit-on-error --use-list="$list" "$dump"
t2="$(now)"

counts() {
  q "$1" "select string_agg(format('select %L as t, count(*) as n from public.%I', tablename, tablename), ' union all ' order by tablename) from pg_tables where schemaname='public'" \
    | xargs -0 -I{} psql "$1" -X -A -t -v ON_ERROR_STOP=1 -c "{} order by t"
}
src_counts="$(counts "$SOURCE_DATABASE_URL")"
dst_counts="$(counts "$TARGET_DATABASE_URL")"
src_migrations="$(q "$SOURCE_DATABASE_URL" "select migration_name||':'||checksum from public._prisma_migrations where finished_at is not null order by 1")"
dst_migrations="$(q "$TARGET_DATABASE_URL" "select migration_name||':'||checksum from public._prisma_migrations where finished_at is not null order by 1")"

status=ok
[ "$src_counts" = "$dst_counts" ] || { status=row_count_mismatch; diff <(echo "$src_counts") <(echo "$dst_counts") >&2 || true; }
[ "$src_migrations" = "$dst_migrations" ] || status=migration_history_mismatch
tables="$(echo "$dst_counts" | grep -c . || true)"
rows="$(echo "$dst_counts" | awk -F'|' '{s+=$2} END{print s+0}')"

printf '{"status":"%s","backup_seconds":%d,"restore_seconds":%d,"tables_verified":%d,"rows_verified":%d,"dump_bytes":%d}\n' \
  "$status" "$((t1-t0))" "$((t2-t1))" "$tables" "$rows" "$(stat -c %s "$dump")"
[ "$status" = ok ]

#!/usr/bin/env bash
# Restores a dump from backup.sh into one environment, replacing its database.
# Stops the API first so nothing writes during the restore, recreates the
# database empty, loads the dump, starts the API again. Encrypted dumps need
# the age identity (private key) file. Run it on staging now and then: a
# backup that was never restored is a hope, not a backup.
#
#   restore.sh staging /srv/openeam/backups/prod/openeam-prod-….sql.gz.age ~/age.key
set -euo pipefail

ROOT=/srv/openeam
env=${1:?usage: restore.sh <prod|staging> <dump> [age identity]}
dump=${2:?usage: restore.sh <prod|staging> <dump> [age identity]}
identity=${3:-}
dir="$ROOT/$env"
cd "$dir"

read -r -p "Replace the $env database with $dump? [y/N] " answer
[[ "$answer" == y ]] || exit 1

decode() {
  if [[ "$dump" == *.age ]]; then
    [[ -n "$identity" ]] || { echo "an age identity file is needed for $dump" >&2; exit 2; }
    age -d -i "$identity" "$dump" | gunzip
  else
    gunzip -c "$dump"
  fi
}

docker compose stop api web
docker compose exec -T postgres sh -c '
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres \
    -c "DROP DATABASE IF EXISTS \"$POSTGRES_DB\"" \
    -c "CREATE DATABASE \"$POSTGRES_DB\""
'
decode | docker compose exec -T postgres sh -c 'psql -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
docker compose up -d --wait
echo "restored $dump into $env"

#!/usr/bin/env bash
# Dumps one environment's database: gzip, encrypted with age when a recipient
# is set, copied off the host with rclone when a remote is set, old copies
# removed after BACKUP_KEEP_DAYS. Run by the systemd timer nightly and by
# deploy.sh before every prod deploy.
#
#   backup.sh prod
#
# Settings in /srv/openeam/backup.env (chmod 600):
#   BACKUP_AGE_RECIPIENT=age1…        public key; the private key stays off the host
#   BACKUP_RCLONE_REMOTE=swiss:openeam-backups   rclone remote and bucket/path
#   BACKUP_KEEP_DAYS=30
set -euo pipefail

ROOT=/srv/openeam
env=${1:?usage: backup.sh <prod|staging>}
dir="$ROOT/$env"
[[ -f "$dir/compose.yml" ]] || { echo "no environment at $dir" >&2; exit 2; }

BACKUP_AGE_RECIPIENT=
BACKUP_RCLONE_REMOTE=
BACKUP_KEEP_DAYS=30
# shellcheck disable=SC1091
[[ -f "$ROOT/backup.env" ]] && source "$ROOT/backup.env"

out_dir="$ROOT/backups/$env"
mkdir -p "$out_dir"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
file="$out_dir/openeam-$env-$stamp.sql.gz"

cd "$dir"
# The container knows its own credentials; nothing is parsed out of .env here.
dump() {
  docker compose exec -T postgres sh -c 'pg_dump --no-owner --no-privileges -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip -9
}

if [[ -n "$BACKUP_AGE_RECIPIENT" ]]; then
  file="$file.age"
  dump | age -r "$BACKUP_AGE_RECIPIENT" -o "$file"
else
  dump >"$file"
fi
chmod 600 "$file"
echo "wrote $file ($(du -h "$file" | cut -f1))"

if [[ -n "$BACKUP_RCLONE_REMOTE" ]]; then
  rclone copy --quiet "$file" "$BACKUP_RCLONE_REMOTE/$env/"
  rclone delete --quiet --min-age "${BACKUP_KEEP_DAYS}d" "$BACKUP_RCLONE_REMOTE/$env/"
fi
find "$out_dir" -type f -mtime "+$BACKUP_KEEP_DAYS" -delete

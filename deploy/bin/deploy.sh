#!/usr/bin/env bash
# Deploys one environment to one image tag. Runs on the server as the forced
# command of the deploy key, so GitHub Actions can say nothing else:
#
#   command="/srv/openeam/bin/deploy.sh",restrict ssh-ed25519 AAAA… deploy@github
#
# The caller's command line is "<environment> <tag>", and that is all the key
# can influence: compose.yml and .env live on the server. Prod is dumped
# before the new API migrates the database.
#
#   ssh deploy@host "staging sha-1a2b3c4"
#   ssh deploy@host "prod v0.3.0"
#
# Expects, placed by hand once: /srv/openeam/{prod,staging}/compose.yml + .env,
# /srv/openeam/proxy, this script and backup.sh root-owned in /srv/openeam/bin,
# a `deploy` user in the docker group (root-equivalent, hence the forced
# command), and the external `edge` network. The GitHub side is in the
# header of .github/workflows/ci.yml.
set -euo pipefail

ROOT=/srv/openeam
read -r env tag _ <<<"${SSH_ORIGINAL_COMMAND:-$*}"

case "${env:-}" in
  prod | staging) ;;
  *)
    echo "usage: <prod|staging> <tag>" >&2
    exit 2
    ;;
esac
if [[ ! "${tag:-}" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$ ]]; then
  echo "refusing tag '${tag:-}'" >&2
  exit 2
fi

dir="$ROOT/$env"
cd "$dir"

# The .env holds exactly what runs; the tag is the only line a deploy edits.
if grep -q '^OPENEAM_TAG=' .env; then
  sed -i "s|^OPENEAM_TAG=.*|OPENEAM_TAG=$tag|" .env
else
  printf 'OPENEAM_TAG=%s\n' "$tag" >>.env
fi

echo "==> $env: pulling $tag"
docker compose pull --quiet

# No backup, no deploy: a failing dump (or a broken off-host copy) stops here.
# The very first deploy has no database yet and skips it.
if [[ "$env" == prod && -n "$(docker compose ps -q --status running postgres)" ]]; then
  echo "==> $env: backup before migrating"
  "$ROOT/bin/backup.sh" prod
fi

echo "==> $env: starting"
# --wait returns once every service is healthy, or fails — so the workflow
# fails too, with the logs below, instead of reporting a green deploy.
if ! docker compose up -d --remove-orphans --wait; then
  docker compose logs --tail=100 api web
  exit 1
fi

docker image prune -f >/dev/null
echo "==> $env: $tag is live"

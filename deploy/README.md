# Deploying OpenEAM

How a public instance is run: published images, two environments on one host,
TLS in front, deploys from GitHub Actions. The repository-root `compose.yml`
is the simpler shape (build locally, plain HTTP on a port) and stays right for
a LAN box; this folder is for an instance on the internet.

## Shape

```
GitHub ──push main──▶ CI: lint, typecheck, build, images ──▶ ghcr.io/<owner>/openeam-{api,web}
       ──push v*────▶                                   ──▶ deploy (staging: automatic,
                                                             production: after approval)
                                                                    │ ssh deploy@host "<env> <tag>"
                                                                    ▼
  host ─ /srv/openeam ─ proxy/    Caddy: TLS for both hostnames, ports 80/443
                      ├ staging/  compose.yml + .env  → postgres, api, web   (tag sha-…)
                      ├ prod/     compose.yml + .env  → postgres, api, web   (tag v…)
                      ├ bin/      deploy.sh, backup.sh (root-owned)
                      └ backups/  nightly dumps, encrypted, copied off-host
```

- **Images are built once, in CI**, and the server only pulls. Staging pins
  the immutable `sha-…` tag of every commit on `main`; production pins a
  release tag. A rollback is the previous tag in `.env` and `docker compose up`.
- **Each environment is its own Compose project** (`COMPOSE_PROJECT_NAME`):
  own Postgres, own volume, own `.env`. Nothing is shared but the proxy.
  Staging receives every migration before production does.
- **Caddy is the only listener on the host.** It reaches each stack's web
  container over the external Docker network `edge` by its container name,
  `<project>-web`. The stacks publish no ports, so Docker's habit of
  bypassing the host firewall for published ports does not matter.
- **Deploys arrive over SSH** as user `deploy`, whose key is restricted to
  `bin/deploy.sh` and can say nothing but `<environment> <tag>`. The script
  pins the tag, pulls, dumps prod first, and `docker compose up --wait`s so
  an unhealthy container fails the workflow. Everything else on the server
  (`compose.yml`, `.env`, the scripts) is placed by hand, once.
- **Backups**: a cron job dumps prod nightly; `age` encrypts, `rclone`
  copies off-host. Restoring a dump into staging is the test.

## Server, once

A VPS with 2 vCPU, 4 GB RAM and 40 GB disk runs both environments comfortably;
nothing is built on it. Debian 13 or Ubuntu 24.04. Two DNS records, `A` (and
`AAAA`) for the production and staging hostnames, pointing at it. In the
provider's firewall open 22, 80 and 443 only; `ufw` on the host does not see
Docker's published ports, which is one reason this setup publishes none but
Caddy's.

Two SSH keys, which never mix: your own admin key, whose private half stays
on your machine and is never a GitHub secret, and the deploy key made in
step 4, whose private half lives only in GitHub and can only run
`deploy.sh`. All commands below run as root.

```bash
# 1. Base system, with automatic security updates
apt update && apt upgrade -y
apt install -y ca-certificates curl git cron age rclone unattended-upgrades
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'APT'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT
curl -fsSL https://get.docker.com | sh

# 2. The deploy user: runs the stacks, nothing else. docker group membership is
#    root-equivalent, which is why the key below is restricted to one command.
useradd --create-home --shell /bin/bash --groups docker deploy
install -d -o deploy -g deploy -m 750 /srv/openeam /srv/openeam/prod /srv/openeam/staging /srv/openeam/backups
install -d -o root -g root -m 755 /srv/openeam/bin
docker network create edge

# 3. Scripts, proxy and compose files, from a checkout of this repository
git clone --depth 1 https://github.com/0xntl/OpenEAM /tmp/openeam
install -o root -g root -m 755 /tmp/openeam/deploy/bin/*.sh /srv/openeam/bin/
cp -r /tmp/openeam/deploy/proxy /srv/openeam/proxy
cp /tmp/openeam/deploy/compose.yml /srv/openeam/prod/
cp /tmp/openeam/deploy/compose.yml /srv/openeam/staging/

# One .env per environment; the same for staging with openeam-staging and its
# hostname. OPENEAM_TAG is whatever the first deploy writes.
cat > /srv/openeam/prod/.env <<'ENV'
COMPOSE_PROJECT_NAME=openeam-prod
OPENEAM_HOST=eam.example.com
OPENEAM_TAG=main
OPENEAM_IMAGE=ghcr.io/0xntl/openeam
POSTGRES_USER=openeam
POSTGRES_PASSWORD=<openssl rand -base64 32>
POSTGRES_DB=openeam
AUTH_ALLOW_SIGNUP=false
ENV

# The proxy's .env: hostnames, the Let's Encrypt contact, and basic auth in
# front of staging. Make the hash with
#   docker run --rm caddy:2.10-alpine caddy hash-password --plaintext '<password>'
# and keep the single quotes, or Compose interpolates the `$` in it.
cat > /srv/openeam/proxy/.env <<'ENV'
ACME_EMAIL=you@example.com
PROD_HOST=eam.example.com
STAGING_HOST=staging.eam.example.com
STAGING_USER=team
STAGING_PASSWORD_HASH='$2a$14$…'
ENV

chown -R deploy:deploy /srv/openeam/prod /srv/openeam/staging /srv/openeam/proxy
chmod 600 /srv/openeam/*/.env
```

```bash
# 4. The deploy key: generated here, public half restricted to deploy.sh
ssh-keygen -t ed25519 -N '' -C deploy@github -f /root/deploy_key
install -d -o deploy -g deploy -m 700 /home/deploy/.ssh
printf 'command="/srv/openeam/bin/deploy.sh",restrict %s\n' "$(cat /root/deploy_key.pub)" \
  > /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys && chmod 600 /home/deploy/.ssh/authorized_keys
cat /root/deploy_key          # → GitHub secret DEPLOY_SSH_KEY, then shred -u /root/deploy_key

# The known_hosts line must name the host exactly as DEPLOY_HOST does
# (hostname or IP), or the workflow's host-key check fails. Built from the
# local host key, so nothing is trusted over the network:
DEPLOY_HOST=eam.example.com   # the value you put into the GitHub variable
printf '%s %s\n' "$DEPLOY_HOST" "$(cut -d' ' -f1,2 /etc/ssh/ssh_host_ed25519_key.pub)"
                              # → GitHub variable DEPLOY_KNOWN_HOSTS

# 5. Backups: an age key pair, generated OFF the host (your laptop):
#    age-keygen -o openeam-backup.key   → the public key goes into backup.env
cat > /srv/openeam/backup.env <<'ENV'
BACKUP_AGE_RECIPIENT=age1…
BACKUP_RCLONE_REMOTE=backups:openeam
BACKUP_KEEP_DAYS=30
ENV
chmod 600 /srv/openeam/backup.env && chown deploy:deploy /srv/openeam/backup.env
sudo -u deploy rclone config    # any S3-compatible bucket; keep it in another location
echo '0 3 * * * /srv/openeam/bin/backup.sh prod >> /srv/openeam/backups/backup.log 2>&1' | crontab -u deploy -

# 6. The proxy
cd /srv/openeam/proxy && sudo -u deploy docker compose up -d
```

Caddy obtains both certificates as soon as DNS resolves. Until a stack runs,
its hostname answers 502; that is expected.

## GitHub, once

In the repository settings:

- **Environments** `staging` and `production`. On `production`, add yourself
  as a required reviewer and restrict deployments to tags matching `v*`.
- **Variables**, per environment: `DEPLOY_HOST` (server address),
  `DEPLOY_KNOWN_HOSTS` (the line from step 4), `OPENEAM_HOST` (the public
  hostname of that environment, for the deployment link).
- **Secret**, per environment: `DEPLOY_SSH_KEY` (the private deploy key, never
  your admin key). Both environments may use the same deploy key; the forced
  command decides what it may do. The `production` environment's reviewer
  rule is what keeps a tag from deploying unseen; the key alone cannot change
  what runs.
- **Packages**: after the first push the two packages appear under the
  owner; set them to public so the server can pull without a token (or create
  a read-only token and `docker login ghcr.io` on the server as `deploy`).

## Day to day

- **Staging** deploys itself on every push to `main`. It is behind Caddy's
  basic auth; inside it, the app's own sign-in applies. Load the example
  bundles from `examples/` for data.
- **Production** deploys on a tag: `git tag v0.1.0 && git push origin v0.1.0`,
  then approve the `Deploy production` job. The script dumps the database
  before the new API applies migrations. **Create the first account right
  after the first deploy**: it becomes the instance admin, and anyone reaching
  the hostname could create it first.
- **Rollback**: `ssh deploy@host "prod v0.0.9"` from a machine with the deploy
  key, or log in with your admin key, edit `OPENEAM_TAG` in
  `/srv/openeam/prod/.env` and `docker compose up -d`. Migrations do not roll
  back; a schema change that needs undoing is a restore.
- **Restore**, into staging, once a quarter; it is the only proof the
  backups work. The age identity (private key) is on your machine, not the
  host; decrypt there and stream the SQL in:

  ```bash
  age -d -i openeam-backup.key openeam-prod-….sql.gz.age | gunzip |
    ssh root@host 'cd /srv/openeam/staging && docker compose stop api web &&
      docker compose exec -T postgres sh -c "dropdb -U \$POSTGRES_USER \$POSTGRES_DB && createdb -U \$POSTGRES_USER \$POSTGRES_DB" &&
      docker compose exec -T postgres sh -c "psql -q -v ON_ERROR_STOP=1 -U \$POSTGRES_USER -d \$POSTGRES_DB" &&
      docker compose up -d --wait'
  ```
- **Updating this folder**: nothing in `deploy/` reaches the server by
  itself, by design — the deploy key cannot change what runs, only which tag.
  When `compose.yml`, `bin/` or `proxy/` change, copy them as in step 3
  before deploying the release that needs them. They change rarely.

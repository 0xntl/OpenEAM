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
                      ├ bin/      deploy.sh, backup.sh, restore.sh (root-owned)
                      └ backups/  nightly dumps, encrypted, copied off-host
```

- **Images are built once, in CI**, and the server only pulls. Staging pins
  the immutable `sha-…` tag of every commit on `main`; production pins a
  release tag. A rollback is the previous tag in `.env` and `docker compose up`.
- **Each environment is its own Compose project** (`COMPOSE_PROJECT_NAME`):
  own Postgres, own volume, own `.env`. Nothing is shared but the proxy.
  Staging receives every migration before production does.
- **Caddy is the only listener on the host.** It reaches each stack's web
  container over the external Docker network `edge` by the alias
  `<project>-web`. The stacks publish no ports, so Docker's habit of bypassing
  the host firewall for published ports does not matter.
- **Deploys arrive over SSH** as user `deploy`, whose key is restricted to
  `bin/deploy.sh` and can say nothing but `<environment> <tag>`. The script
  pins the tag, pulls, dumps prod first, and `docker compose up --wait`s so
  an unhealthy container fails the workflow. Everything else on the server
  (`compose.yml`, `.env`, the scripts) is placed by hand, once.
- **Backups**: a systemd timer dumps prod nightly; `age` encrypts, `rclone`
  copies off-host. `restore.sh` loads a dump into staging, which is the test.

## Server, once

A VPS with 2 vCPU, 4 GB RAM and 40 GB disk runs both environments comfortably;
nothing is built on it. Ubuntu 24.04 LTS. Two DNS records, `A` (and `AAAA`)
for the production and staging hostnames, pointing at it. In the provider's
firewall open 22, 80 and 443 only.

```bash
# 1. Base system
apt update && apt upgrade -y
apt install -y git age rclone unattended-upgrades
curl -fsSL https://get.docker.com | sh

# 2. The deploy user: runs the stacks, nothing else. docker group membership is
#    root-equivalent, which is why the key below is restricted to one command.
useradd --create-home --shell /bin/bash --groups docker deploy
install -d -o deploy -g deploy -m 750 /srv/openeam /srv/openeam/prod /srv/openeam/staging /srv/openeam/backups
install -d -o root -g root -m 755 /srv/openeam/bin
docker network create edge

# 3. Scripts and the backup timer, from a checkout of this repository
git clone --depth 1 https://github.com/0xntl/OpenEAM /tmp/openeam
install -o root -g root -m 755 /tmp/openeam/deploy/bin/*.sh /srv/openeam/bin/
install -m 644 /tmp/openeam/deploy/systemd/openeam-backup@.* /etc/systemd/system/
cp -r /tmp/openeam/deploy/proxy /srv/openeam/proxy
cp /tmp/openeam/deploy/compose.yml /srv/openeam/prod/
cp /tmp/openeam/deploy/compose.yml /srv/openeam/staging/
cp /tmp/openeam/deploy/.env.example /srv/openeam/prod/.env
cp /tmp/openeam/deploy/.env.example /srv/openeam/staging/.env
cp /srv/openeam/proxy/.env.example /srv/openeam/proxy/.env
chown -R deploy:deploy /srv/openeam/prod /srv/openeam/staging /srv/openeam/proxy
chmod 600 /srv/openeam/*/.env
```

Fill in the three `.env` files (`prod`, `staging`, `proxy`): hostnames, a
random Postgres password per environment (`openssl rand -base64 32`),
`COMPOSE_PROJECT_NAME=openeam-prod` and `openeam-staging`, the ACME mail and the
staging password hash (the command is in `proxy/.env.example`). `OPENEAM_TAG`
can stay as it is; the first deploy overwrites it.

```bash
# 4. The deploy key: generated here, public half restricted to deploy.sh
ssh-keygen -t ed25519 -N '' -C deploy@github -f /root/deploy_key
install -d -o deploy -g deploy -m 700 /home/deploy/.ssh
printf 'command="/srv/openeam/bin/deploy.sh",restrict %s\n' "$(cat /root/deploy_key.pub)" \
  > /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys && chmod 600 /home/deploy/.ssh/authorized_keys
cat /root/deploy_key          # → GitHub secret DEPLOY_SSH_KEY, then shred -u /root/deploy_key
ssh-keyscan -t ed25519 "$(hostname -f)"   # → GitHub variable DEPLOY_KNOWN_HOSTS

# 5. Backups: an age key pair, generated OFF the host (your laptop):
#    age-keygen -o openeam-backup.key   → the public key goes into backup.env
cat > /srv/openeam/backup.env <<'ENV'
BACKUP_AGE_RECIPIENT=age1…
BACKUP_RCLONE_REMOTE=swiss:openeam-backups
BACKUP_KEEP_DAYS=30
ENV
chmod 600 /srv/openeam/backup.env && chown deploy:deploy /srv/openeam/backup.env
sudo -u deploy rclone config    # an S3 remote (Infomaniak Public Cloud, Swiss Backup, …)
systemctl enable --now openeam-backup@prod.timer

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
  `DEPLOY_KNOWN_HOSTS` (the `ssh-keyscan` line), `OPENEAM_HOST` (the public
  hostname of that environment, for the deployment link).
- **Secret**, per environment: `DEPLOY_SSH_KEY` (the private key). Both
  environments may use the same key; the forced command decides what it may
  do. The `production` environment's reviewer rule is what keeps a tag from
  deploying unseen; the key alone cannot change what runs.
- **Packages**: after the first push the two packages appear under the
  owner; set them to public so the server can pull without a token (or create
  a read-only token and `docker login ghcr.io` on the server as `deploy`).
- **Renovate**: install the [Renovate GitHub App](https://github.com/apps/renovate)
  for the repository; `renovate.json` holds the configuration.

## Day to day

- **Staging** deploys itself on every push to `main`. It is behind Caddy's
  basic auth; inside it, the app's own sign-in applies. Load the example
  bundles from `examples/` for data.
- **Production** deploys on a tag: `git tag v0.1.0 && git push origin v0.1.0`,
  then approve the `Deploy production` job. The script dumps the database
  before the new API applies migrations. **Create the first account right
  after the first deploy**: it becomes the instance admin, and anyone reaching
  the hostname could create it first.
- **Rollback**: `ssh deploy@host "prod v0.0.9"` from a machine with the key,
  or edit `OPENEAM_TAG` in `/srv/openeam/prod/.env` and `docker compose up -d`.
  Migrations do not roll back; a schema change that needs undoing is a restore.
- **Restore**: `restore.sh staging <dump> <age identity>` loads a prod dump
  into staging. Do it once a quarter; it is the only proof the backups work.
- **Updating this folder**: nothing in `deploy/` reaches the server by
  itself, by design — the deploy key cannot change what runs, only which tag.
  When `compose.yml`, `bin/`, `proxy/` or the systemd units change, copy them
  as in step 3 before deploying the release that needs them. They change
  rarely.

## Infomaniak notes

- VPS Cloud or Public Cloud; the OS image is Ubuntu 24.04. Add the SSH key in
  the Manager when creating the machine and disable password login.
- DNS for a domain hosted there is in the Manager's domain section; two `A`
  records (and `AAAA` if the VPS has an IPv6 address) suffice.
- The Manager's firewall is the one that counts; `ufw` on the host does not
  see Docker's published ports. This setup publishes only Caddy's 80 and 443.
- Off-host backups: Swiss Backup (S3-compatible, `rclone` type `s3`,
  provider `Other`) or an Object Storage bucket in the Public Cloud. Both are
  in Switzerland, which matters for the kind of data an architecture model holds.

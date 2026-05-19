# Deploying banking to a Raspberry Pi

Self-hosted, Tailscale-only. Docker Compose runs the app; Tailscale on the
host exposes it as a private HTTPS URL on your tailnet.

## Architecture

```
Pi
├── Tailscale (host)        →  https://<host>.<tailnet>.ts.net
│                              proxies to localhost:3000
└── docker compose
    └── banking             →  127.0.0.1:3000
                               volumes: ./data, ./keys (ro)
```

The container only listens on `127.0.0.1`. The only path in is via the
tailnet — nothing is exposed to the public internet.

## One-time Pi setup

Assumes Raspberry Pi OS Lite 64-bit (Bookworm) or any Debian-based arm64.

```sh
# Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"   # log out + back in for this to take effect

# Tailscale
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up                 # follow the printed URL to authenticate
```

Recommended hardening on the Tailscale account:

- Hardware 2FA (or TOTP, not SMS) on the identity provider you sign in with.
- Enable **tailnet lock** in the admin console.
- Do **not** enable Tailscale Funnel for this app.

## First deploy

The Pi never builds the image; it only pulls. Only `docker-compose.yml`,
`.env`, `keys/`, and `data/` need to live on the host.

```sh
sudo mkdir -p /srv/banking && sudo chown "$USER" /srv/banking

# From your dev machine — repo is private, so curl from raw.githubusercontent
# won't work without a PAT. Just scp the two files you need:
scp docker-compose.yml .env.example alojz@<pi>:/srv/banking/

# Back on the Pi
cd /srv/banking
cp .env.example .env
$EDITOR .env                      # fill in EB_APPLICATION_ID, BANKING_SECRET
mkdir -p keys data
cp /path/to/eb-private.pem keys/private.pem
chmod 600 keys/private.pem
chmod 700 keys

# Container runs as uid 1001 — make sure the host bind-mount dirs are
# readable/writable by it so SQLite can open the DB and the runtime can
# read the EB key.
sudo chown -R 1001:1001 data keys

# In .env, point EB_PRIVATE_KEY_PATH at the container path:
#   EB_PRIVATE_KEY_PATH=/app/keys/private.pem

# If the GHCR package is private, set up watchtower auth first
# (see "One-time Pi setup for pull-based deploys" below). If public, skip.

docker compose pull               # fetch ghcr.io/alojzmilicevic/banking:latest
docker compose up -d
docker compose logs -f banking    # watch it come up
```

## Expose it on the tailnet

```sh
sudo tailscale serve --bg --https=443 http://localhost:3000
sudo tailscale serve status
```

That issues a Let's Encrypt cert for `<host>.<tailnet>.ts.net` and proxies
HTTPS → `localhost:3000`. Open the URL on any device signed into your
tailnet.

To remove:

```sh
sudo tailscale serve reset
```

## Day-2

Updates happen automatically via Watchtower (see "Continuous deploy"). Manual
operations on the Pi:

```sh
cd /srv/banking

# Force a pull/recreate now instead of waiting for Watchtower's 60s poll
docker compose pull && docker compose up -d

# Logs
docker compose logs -f banking
docker compose logs -f watchtower

# Restart / stop
docker compose restart banking
docker compose down
```

## Continuous deploy

Pull-based, registry-driven. CI never connects to the Pi.

```
push → main
   │
   ▼
GitHub Actions (.github/workflows/deploy.yml)
   • build multi-arch image (linux/arm64) with buildx
   • push to ghcr.io/alojzmilicevic/banking
       :latest
       :sha-<short>
   │
   ▼
ghcr.io
   │   (Watchtower polls every 60s)
   ▼
Raspberry Pi
   • watchtower pulls :latest if digest changed
   • recreates the banking container
   • old container stopped + image pruned
```

PR checks (`pr.yml`) run lint, typecheck, and tests on every PR — the deploy
workflow assumes those have already passed before a commit reaches `main`,
so it does **not** re-run them. Protect `main` with a branch rule that
requires the PR check to pass before merging.

### Required GitHub secrets

**None.** `GITHUB_TOKEN` is auto-injected by Actions and has `packages:
write` for this repo's GHCR namespace. No Tailscale OAuth client, no SSH key,
no Pi host/user — none of it is needed in CI.

### Required GitHub Environment

Create an environment named `production` (Settings → Environments → New
environment). It's optional but recommended — it gives you a deployment
history per Pi push, the ability to require approval before deploy, and a
place to scope any future secrets if you ever do need them.

### One-time Pi setup for pull-based deploys

The container image is `ghcr.io/alojzmilicevic/banking`. By default, GHCR
inherits visibility from the source repo (private). You have two options:

**Option A — make the package public (recommended; simpler).** The image
contains compiled Next.js bundle code — no secrets — so this is fine. After
the first successful push:

1. Go to <https://github.com/alojzmilicevic?tab=packages>.
2. Click **banking** → **Package settings** → **Change visibility** →
   **Public**.

Skip the `./watchtower/config.json` bind mount in `docker-compose.yml` (or
leave it empty) — anonymous pulls work.

**Option B — keep the package private.** Generate a fine-grained PAT with
`read:packages` scope on the banking package only, then drop a Docker auth
config on the Pi:

```sh
mkdir -p /srv/banking/watchtower
AUTH=$(printf 'alojzmilicevic:ghp_xxxxxxxxxxxx' | base64)
cat > /srv/banking/watchtower/config.json <<EOF
{ "auths": { "ghcr.io": { "auth": "$AUTH" } } }
EOF
chmod 600 /srv/banking/watchtower/config.json
```

Then add these two lines to the `watchtower` service in
`docker-compose.yml`:

```yaml
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./watchtower/config.json:/config.json:ro   # <-- add
    environment:
      WATCHTOWER_LABEL_ENABLE: "true"
      WATCHTOWER_CLEANUP: "true"
      WATCHTOWER_POLL_INTERVAL: "60"
      DOCKER_CONFIG: /                              # <-- add
```

`DOCKER_CONFIG=/` points Watchtower at `/config.json` (the mounted file) so
its `docker pull` picks up the credentials.

### Day-0 cutover from the build-on-Pi setup

```sh
cd /srv/banking
git pull                               # to get the new docker-compose.yml
docker compose down                    # stops the locally-built `banking:local`
docker image rm banking:local || true
docker compose pull                    # fetches ghcr.io/alojzmilicevic/banking:latest
docker compose up -d
docker compose logs -f banking         # watch it come up
```

After this, you don't run `git pull` here again — Watchtower handles updates.
You can even delete the working tree and keep only `docker-compose.yml`,
`.env`, `data/`, `keys/`, and `watchtower/`.

### Rollback

Every push tags the image with both `:latest` and `:sha-<short>`. To pin a
known-good build:

```sh
cd /srv/banking
# Find the SHA you want — Actions → Deploy → pick a run → log shows the tag
sed -i 's|banking:latest|banking:sha-abc1234|' docker-compose.yml
# Disable auto-update for the pinned period
sed -i 's|watchtower.enable: "true"|watchtower.enable: "false"|' docker-compose.yml
docker compose pull && docker compose up -d
```

To resume auto-deploy, revert both edits and `docker compose up -d`.

### Disabling auto-deploy

- **Don't push to `main`.** The workflow only triggers on
  `push: branches: [main]` and `workflow_dispatch`.
- **Disable the workflow**: GitHub Actions tab → **Deploy** → **⋯ →
  Disable workflow**.
- **Pause Watchtower on the Pi**: `docker compose stop watchtower` — the
  app keeps running on whatever image it's on, just won't auto-update.
- **Manual build of a specific ref**: Actions tab → **Deploy** → **Run
  workflow** → pick branch.

## Backups

The entire app state is `data/banking.db`. Use SQLite's online backup so
you never copy a half-written file:

```sh
# Run on the Pi (via cron or systemd timer)
docker compose exec -T banking \
  sh -c 'sqlite3 /app/data/banking.db ".backup /app/data/banking.backup.db"'
# Then ship banking.backup.db wherever you keep backups.
```

Automate it with a daily cron entry — `crontab -e` and add:

```cron
# Banking DB backup, 03:15 every day. Rotates a 7-day window of files.
15 3 * * * cd /srv/banking && docker compose exec -T banking sh -c 'sqlite3 /app/data/banking.db ".backup /app/data/banking.backup-$(date +\%u).db"' >/dev/null 2>&1
```

`keys/private.pem` and `.env` are stable — back them up once, somewhere
secure (password manager, encrypted offline store). Without them the
SQLite file is useless (`BANKING_SECRET` is the encryption key for stored
provider credentials).

## Migrating to a new Pi

```sh
# On the new Pi: install Docker + Tailscale (see "One-time Pi setup")

# Copy only the stateful bits — image comes from the registry, not from
# the old host. `watchtower/` only exists if you set up private-package
# auth (Option B); leave it off the list otherwise.
rsync -aP old-pi:/srv/banking/{docker-compose.yml,.env,data,keys} \
         new-pi:/srv/banking/

# On the new Pi
cd /srv/banking
docker compose pull
docker compose up -d
sudo tailscale serve --bg --https=443 http://localhost:3000
```

The new Pi gets its own tailnet hostname. Update bookmarks, or rename the
node in the Tailscale admin console to keep the URL stable.

## Troubleshooting

- **`better-sqlite3` build fails**: ensure you're on arm64 (`uname -m` →
  `aarch64`). 32-bit Pi OS is not supported.
- **`tailscale serve` fails with cert error**: confirm HTTPS is enabled on
  the tailnet (admin console → DNS → "HTTPS Certificates").
- **Container can't read the EB key**: check `EB_PRIVATE_KEY_PATH` points
  at `/app/keys/private.pem` (container path), not `./keys/private.pem`
  (host path). The volume is mounted read-only.

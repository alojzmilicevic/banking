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

```sh
sudo mkdir -p /srv/banking && sudo chown "$USER" /srv/banking
cd /srv/banking

# Get the code (or rsync the repo from your dev machine)
git clone <repo-url> .

# Stage secrets (out-of-band — never commit these)
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

docker compose up -d --build
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

```sh
# Update to latest code
cd /srv/banking
git pull
docker compose up -d --build

# Logs
docker compose logs -f banking

# Restart
docker compose restart banking

# Stop
docker compose down
```

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

# From your dev machine (or directly Pi-to-Pi)
rsync -aP old-pi:/srv/banking/ new-pi:/srv/banking/

# On the new Pi
cd /srv/banking
docker compose up -d --build
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

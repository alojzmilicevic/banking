# Deploying banking to a Raspberry Pi

Self-hosted, tailnet-only. CI builds the container image, the Pi pulls and
runs it. Caddy on the Pi terminates TLS and routes by Host header. Reachable
only by devices signed into the tailnet — nothing on the public internet.

Live URL: <https://banking.pi.alostuff.com>

## Architecture

```
              [tailnet device]
                     │
                     ▼  HTTPS (wildcard cert *.pi.alostuff.com)
              ┌──────────────┐
              │     Pi       │
              │              │
   Caddy ─────┤  :443        │   wildcard TLS, Cloudflare DNS-01
   (host)     │              │   matches Host header, reverse_proxy
              │              │   to docker service banking:3000
              │              │
              │  docker compose
              │  └── banking ──► 127.0.0.1:3000
              │      volumes: ./data (rw), ./keys (ro)
              │
              │  └── watchtower ──► polls ghcr.io every 60s
              └──────────────┘
                     ▲
                     │  docker pull (ghcr.io/alojzmilicevic/banking:latest)
              ┌──────┴───────┐
              │ GitHub       │
              │ Actions      │  builds arm64 image on ubuntu-24.04-arm,
              │ deploy.yml   │  pushes to GHCR on every merge to main
              └──────────────┘
```

The container only listens on `127.0.0.1`. Caddy lives on a shared
`proxy` docker network and reaches the container as `banking:3000`. The
tailnet IP is the only ingress.

## One-time Pi setup

Assumes Raspberry Pi OS Lite 64-bit (Bookworm) or any Debian-based arm64.

```sh
# Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"   # log out + back in for this to take effect

# Tailscale (network layer; not the reverse proxy)
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up                 # follow the printed URL to authenticate
```

Recommended hardening on the Tailscale account:

- Hardware 2FA (or TOTP, not SMS) on the identity provider you sign in with.
- Enable **tailnet lock** in the admin console.
- Do **not** enable Tailscale Funnel for this app.

Caddy with the wildcard cert + Cloudflare DNS-01 lives at `/srv/caddy/`
and is set up separately (out of scope for this doc).

## First deploy

The Pi never builds the image; it only pulls. Only four things live on
the host: `docker-compose.yml`, `.env`, `data/`, `keys/`.

```sh
sudo mkdir -p /srv/banking && sudo chown "$USER" /srv/banking

# From your dev machine
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

docker compose pull               # fetch ghcr.io/alojzmilicevic/banking:latest
docker compose up -d
docker compose logs -f banking    # watch it come up
```

## Day-2

Updates happen automatically via Watchtower. Manual operations on the Pi:

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
push → main                 → GitHub Actions (deploy.yml)
                                • build arm64 image natively on ubuntu-24.04-arm
                                • push to ghcr.io/alojzmilicevic/banking
                                  :latest, :sha-<short>
                              ────────────────────────────────────
                                                       │
                              Pi watchtower polls ghcr.io every 60s
                                • pulls :latest if digest changed
                                • recreates the banking container
                                • prunes the old image
```

Full push → live time: **~2.5 min** (build ~2 min, Pi pull + restart ~30s).

PR checks (`pr.yml`) run lint, typecheck, and tests on every PR. The deploy
workflow does **not** re-run them — branch protection on `main` requires
the PR check to pass before merging.

### Required GitHub secrets

**None.** `GITHUB_TOKEN` is auto-injected with `packages: write` for GHCR.
No Tailscale OAuth client, no SSH key, no Pi host/user — CI never touches
the Pi.

### Required GitHub Environment

`production` — exists. Provides deployment history; can be configured for
required approvals if you ever want a "click to deploy" gate.

### Watchtower fork

The compose file uses `ghcr.io/nicholas-fedor/watchtower`, the
maintained community fork of the original `containrrr/watchtower`. The
original project is unmaintained as of 2024 and its embedded Docker API
client is too old for current Docker daemons. Same image is also published
to Docker Hub as `nickfedor/watchtower`.

If you ever want to drop Watchtower entirely (it's mildly over-engineered
for a single-container deploy), a systemd timer running
`docker compose pull && docker compose up -d` every minute does the same
job with zero third-party dependencies. ~15 lines of unit files.

### GHCR package visibility

The `ghcr.io/alojzmilicevic/banking` package is **public**. Anonymous
`docker pull` works, so the Pi needs no auth. Flipped manually after the
first push at the package's settings page (Danger Zone → Change package
visibility). The visibility is *not* inherited from the source repo.

If you ever want to flip it back to private, add an auth config for
Watchtower:

```sh
mkdir -p /srv/banking/watchtower
AUTH=$(printf 'alojzmilicevic:ghp_xxxxxxxxxxxx' | base64)
cat > /srv/banking/watchtower/config.json <<EOF
{ "auths": { "ghcr.io": { "auth": "$AUTH" } } }
EOF
chmod 600 /srv/banking/watchtower/config.json
```

Then add to the `watchtower` service in `docker-compose.yml`:

```yaml
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./watchtower/config.json:/config.json:ro   # <-- add
    environment:
      ...
      DOCKER_CONFIG: /                              # <-- add
```

The PAT needs the `read:packages` scope on the banking package only.

### Rollback

Every push tags the image with `:latest` and `:sha-<short>`. To pin an
older build:

```sh
cd /srv/banking
# Find the SHA from Actions → Deploy → pick a run → image tag in logs.
sed -i 's|banking:latest|banking:sha-abc1234|' docker-compose.yml
# Stop watchtower from re-pulling :latest over the pinned tag
sed -i 's|watchtower.enable: "true"|watchtower.enable: "false"|' docker-compose.yml
docker compose pull && docker compose up -d
```

Revert both edits and `docker compose up -d` to resume auto-deploy.

### Disabling auto-deploy

- **Don't merge to `main`.** Branch-protected; PR is required.
- **Disable the workflow**: Actions → **Deploy** → **⋯ → Disable workflow**.
- **Pause Watchtower**: `docker compose stop watchtower`. The app keeps
  running on whatever image it's on; just won't auto-update.

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
# On the new Pi: install Docker + Tailscale (see "One-time Pi setup").
# Bring up Caddy at /srv/caddy/ separately, with the same wildcard cert config.

# Copy only the stateful bits — image comes from the registry, not from
# the old host. `watchtower/` only exists if the package is private; leave
# it off the list otherwise.
rsync -aP old-pi:/srv/banking/{docker-compose.yml,.env,data,keys} \
         new-pi:/srv/banking/

# On the new Pi
cd /srv/banking
docker compose pull
docker compose up -d
```

The new Pi gets its own tailnet hostname. Update Cloudflare DNS for
`*.pi.alostuff.com` to point at the new tailnet IP, or rename the node
in the Tailscale admin console to keep the URL stable.

## Troubleshooting

- **`unauthorized` on `docker compose pull`**: the GHCR package isn't
  public. Either flip it public (see "GHCR package visibility") or set
  up the private-pull auth path.
- **Caddy can't reach banking** (502 / "no upstream"): both stacks must
  share the external docker network named `proxy`. From the Pi:
  `docker network inspect proxy` should list both `banking` and the
  Caddy container as members.
- **Container can't read the EB key**: check `EB_PRIVATE_KEY_PATH` points
  at `/app/keys/private.pem` (container path), not `./keys/private.pem`
  (host path). The volume is mounted read-only.
- **Watchtower restart-loops with "client version too old"**: you're on
  the unmaintained `containrrr/watchtower`. Swap to
  `ghcr.io/nicholas-fedor/watchtower:latest` (see "Watchtower fork").
- **Healthcheck shows `unhealthy`**: container exists but `/api/health`
  isn't returning 200. Check `docker compose logs banking`.

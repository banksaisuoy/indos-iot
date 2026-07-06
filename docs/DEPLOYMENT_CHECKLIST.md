# IndOS — Production Deployment Checklist

> Step-by-step guide to deploy IndOS to a production server using `docker-compose.yml`. Assumes a single Linux host (Ubuntu 22.04+ recommended) with Docker 24+ and Docker Compose v2.
>
> For air-gapped / on-prem deployments, skip step 1's external pulls and use a local registry or `docker save` / `docker load`.

## 0. Prerequisites

- [ ] Linux host with **2+ vCPU, 4 GB+ RAM, 40 GB+ disk** (8 GB RAM if running Ollama + Qdrant)
- [ ] Docker 24+ and Docker Compose v2 installed
- [ ] A registered domain name (or use the host IP for testing)
- [ ] DNS A record pointing your domain to the host IP (for Caddy TLS)
- [ ] Ports `:80` and `:443` open on the host firewall (Caddy)
- [ ] Port `:1883` open **only** if physical devices connect directly to MQTT (otherwise use the `indos-bridge` account over the internal network)
- [ ] Outbound internet access for pulling images (or pre-pull to a local registry)
- [ ] `bun` 1.1+ installed locally for running the OTA key generator and provisioning scripts (or run them inside a container)

## 1. Clone the Repository

```bash
git clone https://github.com/your-org/indos.git
cd indos
```

## 2. Environment Variable Setup

Copy the example and fill in real values:

```bash
cp .env.example .env
chmod 600 .env   # protect secrets
```

### 2.1 Generate `NEXTAUTH_SECRET`

```bash
openssl rand -base64 32
# → e.g. "K7x9P2vQ8wR4mN3bL6tY1cZ5aH0fJ8gS..."
```

Add to `.env`:
```
NEXTAUTH_SECRET=<paste-output-here>
```

### 2.2 Generate Ed25519 OTA Key Pair

```bash
bun run scripts/generate-ota-keys.ts
```

Outputs:
```
🔐 IndOS OTA Ed25519 Key Pair Generated

Add these to your .env file:

OTA_SIGNING_PRIVATE_KEY=MC4CAQAwBQYDK2VwBCIEIN...
OTA_SIGNING_PUBLIC_KEY=MCowBQYDK2VwAyEAAsfM/...
OTA_SIGNING_KEY_ID=key-001

⚠️  Keep the private key SECRET. Never commit it to git.
📋 The public key can be embedded in ESP32 firmware for verification.
```

Copy all three lines into `.env`. **Save the public key separately** — you'll need it for the ESP32 firmware.

### 2.3 Set database and service passwords

Generate strong passwords for each backing service (do not reuse):

```bash
# Generate 5 distinct passwords
for svc in DB INFLUX MINIO GRAFANA KC; do
  echo "$svc_PASSWORD=$(openssl rand -base64 24)"
done
```

Add to `.env`:
```
DB_PASSWORD=<pg-password>
INFLUX_PASSWORD=<influx-password>
MINIO_PASSWORD=<minio-password>
GRAFANA_PASSWORD=<grafana-password>
KC_PASSWORD=<keycloak-password>
KC_ADMIN=admin
KEYCLOAK_HOSTNAME=keycloak.your-domain.com
BRIDGE_PASSWORD=<strong-bridge-secret>
```

### 2.4 Set `DATABASE_URL`

For docker-compose (Postgres):
```
DATABASE_URL=postgresql://indos:${DB_PASSWORD}@postgres:5432/indos
```

### 2.5 Set InfluxDB (optional but recommended for historical telemetry)

```
INFLUX_URL=http://influxdb:8086
INFLUX_TOKEN=<generate-after-first-start>   # see step 5
INFLUX_ORG=indos
INFLUX_BUCKET=telemetry
```

> The InfluxDB token is generated on first start by the `DOCKER_INFLUXDB_INIT_*` vars. After `docker compose up`, log in to the InfluxDB UI at `http://localhost:8086` (port-forward if internal-only) and create an API token with write+read on the `telemetry` bucket. Paste it into `.env` and restart the `indos` and `telemetry` services.

### 2.6 Set Redis (optional but recommended for multi-instance)

```
REDIS_URL=redis://redis:6379
```

(Redis in docker-compose has no password by default — for production, add `--requirepass` to the Redis command and include it in the URL: `redis://:password@redis:6379`.)

### 2.7 Final `.env` checklist

- [ ] `DATABASE_URL=postgresql://indos:${DB_PASSWORD}@postgres:5432/indos`
- [ ] `NEXTAUTH_SECRET=<32-byte-base64>`
- [ ] `OTA_SIGNING_PRIVATE_KEY=<base64>`
- [ ] `OTA_SIGNING_PUBLIC_KEY=<base64>`
- [ ] `OTA_SIGNING_KEY_ID=key-001`
- [ ] `INFLUX_URL=http://influxdb:8086`
- [ ] `INFLUX_TOKEN=` (fill after first start)
- [ ] `INFLUX_ORG=indos`
- [ ] `INFLUX_BUCKET=telemetry`
- [ ] `REDIS_URL=redis://redis:6379`
- [ ] `DB_PASSWORD=`, `INFLUX_PASSWORD=`, `MINIO_PASSWORD=`, `GRAFANA_PASSWORD=`, `KC_PASSWORD=`
- [ ] `KEYCLOAK_HOSTNAME=keycloak.your-domain.com`
- [ ] `BRIDGE_PASSWORD=<strong-secret>`

## 3. Build and Start

```bash
# Build the IndOS image (multi-stage: deps → build → runner)
docker compose build indos

# Start everything (16 services) in detached mode
docker compose up -d

# Watch the app come up
docker compose logs -f indos
```

The `indos` service has a healthcheck that polls `/api/health` every 30s. Postgres, Redis, InfluxDB, and Mosquitto also have healthchecks. Wait until all show `healthy`:

```bash
docker compose ps
# All services should show Up (healthy)
```

## 4. Health Check Verification

```bash
# App liveness
curl -s http://localhost:3000/api/health | jq
# → { "ok": true, "checks": { "db": true }, "ts": "..." }

# Platform metrics
curl -s http://localhost:3000/api/metrics | jq
# → { "uptime": ..., "devices": {...}, "infrastructure": { "redis": true, "influxdb": true }, ... }

# Caddy is serving (port 80)
curl -sI http://localhost:80 | head -1
# → HTTP/1.1 200 OK (or 302 redirect to /login)
```

If `infrastructure.redis` or `infrastructure.influxdb` is `false`, check the corresponding service logs:
```bash
docker compose logs redis influxdb
```

## 5. Generate InfluxDB API Token

After first start:

```bash
# Port-forward InfluxDB UI (it's on the internal network, not exposed)
docker compose exec influxdb influx bucket list
# Note the bucket ID for 'telemetry'

# Create an all-access token (or use the UI at http://localhost:8086 after port-forward)
docker compose exec influxdb influx auth create --all-access --org indos --description "indos-app"
# Copy the resulting token string
```

Paste into `.env` as `INFLUX_TOKEN=...` and restart:
```bash
docker compose restart indos
# (The telemetry mini-service reads INFLUX_TOKEN at startup — if you're running it as a separate
#  process, restart that too. In docker-compose, the telemetry service is bundled into the
#  'indos' container in production via a process manager, OR run as its own service — TBD.)
```

## 6. Seed the Admin User

The seed script creates 5 demo users. **In production, you should:**

1. Run the seed once to create the schema and admin user:
   ```bash
   docker compose exec indos bun run prisma db seed
   ```

2. Log in immediately and change the admin password:
   - Login: `admin@indos.io` / `indos123`
   - Go to Settings → Users → admin → Change password
   - (Once the password-change API exists — currently P1; for now, update via Prisma:)
   ```bash
   docker compose exec indos bun -e "
     import bcrypt from 'bcryptjs';
     import { db } from './src/lib/db';
     const hash = bcrypt.hashSync('YOUR-NEW-STRONG-PASSWORD', 10);
     await db.user.update({ where: { email: 'admin@indos.io' }, data: { password: hash } });
     console.log('Admin password updated');
     await db.\$disconnect();
   "
   ```

3. Disable or delete the other demo users (`engineer@`, `operator@`, `viewer@`, `field@`) if not needed:
   ```bash
   docker compose exec indos bun -e "
     import { db } from './src/lib/db';
     await db.user.deleteMany({ where: { email: { in: ['engineer@indos.io','operator@indos.io','viewer@indos.io','field@indos.io'] } } });
     console.log('Demo users removed');
     await db.\$disconnect();
   "
   ```

4. Create real users with appropriate roles via the Settings → Users UI (once the create-user API exists — currently P1; for now, insert via Prisma with bcrypt hashes).

## 7. First Login + Password Change

1. Open `https://your-domain.com` in a browser.
2. Log in with `admin@indos.io` / `indos123` (or your updated password).
3. Verify the dashboard renders with `LIVE` indicator (telemetry streaming).
4. Navigate to each major view: Dashboard, Devices, Alarms, OTA Firmware, Settings.
5. Check the topbar shows your name + role + Sign Out button.
6. Open browser DevTools → Network → verify socket.io is connected to `/?XTransformPort=3030`.

## 8. MQTT Device Provisioning

For each physical device (ESP32, PLC, gateway):

```bash
./scripts/provision-device.sh esp32-sensor-02 "MyStrongDevicePassword!"
```

This:
1. Generates a bcrypt hash of the password.
2. Appends `{ username: "esp32-sensor-02", passwordHash: "...", project: "default" }` to `mini-services/telemetry/devices.json`.
3. Prints the ESP32 config to paste into the sketch:
   ```
   📋 ESP32 config: MQTT_USER="esp32-sensor-02" MQTT_PASSWORD="MyStrongDevicePassword!"
   ```

> **Note:** `devices.json` is the credential store in the current implementation. For production with many devices, back this with the database (P1 roadmap). For now, ensure `devices.json` is on a persistent volume and **never committed to git**.

### ESP32 sketch configuration

In your ESP32 firmware, set:
```cpp
#define MQTT_BROKER    "your-domain.com"
#define MQTT_PORT      1883
#define MQTT_USER      "esp32-sensor-02"
#define MQTT_PASSWORD  "MyStrongDevicePassword!"
#define MQTT_TOPIC_PUB "indos/devices/esp32-sensor-02/telemetry"
#define MQTT_TOPIC_SUB "indos/devices/esp32-sensor-02/cmd"

// OTA verification — embed the public key from step 2.2
#define OTA_PUBLIC_KEY_B64 "MCowBQYDK2VwAyEAAsfM/..."
```

Test the connection:
```bash
# Install mosquitto-clients
sudo apt install mosquitto-clients

# Publish a test telemetry point (should succeed)
mosquitto_pub -h your-domain.com -p 1883 -u esp32-sensor-02 -P "MyStrongDevicePassword!" \
  -t indos/devices/esp32-sensor-02/telemetry \
  -m '{"value":42.5,"metric":"temperature","unit":"C"}'

# Try publishing to another device's topic (should be rejected by ACL)
mosquitto_pub -h your-domain.com -p 1883 -u esp32-sensor-02 -P "MyStrongDevicePassword!" \
  -t indos/devices/esp32-sensor-01/telemetry -m '{"value":99}'
# → Error: Topic not authorized
```

## 9. Firewall Rules

Use `ufw` (or your cloud provider's security group) to lock down the host:

```bash
# Default deny incoming
sudo ufw default deny incoming
sudo ufw default allow outgoing

# SSH (rate-limit to prevent brute force)
sudo ufw limit 22/tcp

# HTTP + HTTPS (Caddy)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# MQTT — ONLY if devices connect directly to this host
# Restrict to your IoT network CIDR if possible
sudo ufw allow from 10.20.0.0/16 to any port 1883

# Enable
sudo ufw enable
sudo ufw status verbose
```

**Do NOT expose:** Postgres (5432), Redis (6379), InfluxDB (8086), MinIO (9000/9001), Grafana (3000), Keycloak (8080), Prometheus (9090), Loki (3100). These are on the docker `internal` network only — the firewall is defense in depth.

## 10. Backup Setup

The `docker-compose.yml` includes a `backup` service that runs `pg_dump` daily at 02:00 and keeps 30 days of gzipped SQL dumps in `./backups/`.

Verify it's running:
```bash
docker compose logs backup
# → "[2025-07-04 02:00:00] Running backup..."
# → "[2025-07-04 02:00:05] Backup done. Sleeping 24h..."

ls -la backups/
# → indos_20250704_020000.sql.gz
```

### Additional backup targets (recommended)

- [ ] **InfluxDB** — `docker compose exec influxdb influx backup /backups/influxdb/` (cron on host)
- [ ] **MinIO** (firmware binaries) — `mc mirror minio/local /backups/minio/`
- [ ] **devices.json** — `cp mini-services/telemetry/devices.json backups/`
- [ ] **Caddy config + certs** — `cp -r Caddyfile backups/` + `docker compose cp caddy:/data backups/caddy-data/`
- [ ] **Offsite replication** — rsync `./backups/` to S3 / B2 / offsite NAS nightly

### Restore test (do this monthly)

```bash
# Stop the app
docker compose stop indos

# Restore Postgres from a backup
gunzip -c backups/indos_20250704_020000.sql.gz | \
  docker compose exec -T postgres psql -U indos -d indos

# Restart
docker compose start indos
curl http://localhost:3000/api/health
```

## 11. Monitoring Setup

### Prometheus → IndOS metrics

Add a scrape job to `prometheus.yml` (create if missing):
```yaml
scrape_configs:
  - job_name: 'indos'
    scrape_interval: 15s
    metrics_path: /api/metrics
    static_configs:
      - targets: ['indos:3000']
```

Reload Prometheus:
```bash
docker compose exec prometheus kill -HUP 1
# or: docker compose restart prometheus
```

### Grafana dashboard

1. Open Grafana at `http://localhost:3001` (port-forward: `docker compose port grafana 3000`).
2. Log in with `admin` / `${GRAFANA_PASSWORD}`.
3. Add Prometheus as a data source: URL `http://prometheus:9090`.
4. Import a dashboard (or build one) with panels for:
   - IndOS uptime
   - Memory (rss, heapUsed, heapTotal)
   - Device count (total / online / offline)
   - Active alarms
   - OTA jobs
   - Infrastructure status (redis, influxdb booleans)

> A pre-built Grafana dashboard JSON is a P2 roadmap item. For now, build panels manually.

### Loki log aggregation

The docker-compose includes Loki. To ship logs, add a Promtail sidecar or use the Docker logging driver:
```yaml
# In docker-compose.yml, add to each service:
logging:
  driver: loki
  options:
    loki-url: http://loki:3100/loki/api/v1/push
    loki-pipeline-stages: |
      - json:
          expressions:
            level: level
            msg: msg
```

### Alertmanager

Configure alert rules in `alertmanager.yml` (create if missing). Suggested alerts:
- `up{job="indos"} == 0` for 2 min → IndOS down
- `indos_alarms_active > 10` → Alarm storm
- `indos_devices_offline / indos_devices_total > 0.2` → 20%+ devices offline

## 12. Post-Deployment Verification

Run through this checklist after deployment:

- [ ] `curl https://your-domain.com/api/health` → `{"ok":true}`
- [ ] `curl https://your-domain.com/api/metrics` → returns JSON
- [ ] Login as admin → dashboard renders with `LIVE` indicator
- [ ] Navigate to Devices → see seeded devices
- [ ] Navigate to Alarms → see seeded alarms
- [ ] Navigate to OTA Firmware → see seeded firmware (with signature)
- [ ] Settings → System → see platform version, MQTT broker, etc.
- [ ] Audit → see login + seed audit entries
- [ ] Open DevTools → Network → WS → `?XTransformPort=3030` socket is connected
- [ ] `mosquitto_pub` with valid device creds → telemetry appears on dashboard
- [ ] `mosquitto_pub` with wrong password → connection refused
- [ ] `mosquitto_pub` to another device's topic → ACL rejection
- [ ] Prometheus targets page → `indos` job is UP
- [ ] Grafana → panels show data
- [ ] `docker compose logs backup` → daily backup succeeded
- [ ] `ls backups/` → at least one `.sql.gz` file

---

## Rollback Checklist

If a deployment goes wrong, follow this sequence:

### Step 1 — Stop the app (leave backing services running)

```bash
docker compose stop indos
# Postgres, Redis, InfluxDB, Mosquitto stay up — no data loss
```

### Step 2 — Identify the previous working image

```bash
# If using a registry:
docker images indos --format "table {{.Repository}}:{{.Tag}}\t{{.CreatedAt}}"
# → indos:v1.2.0  2025-07-01 ...
# → indos:v1.3.0  2025-07-04 ...   (current, broken)

# If building from git:
git log --oneline -10
# → a1b2c3d (HEAD, broken)
# → d4e5f6g (previous, working)
```

### Step 3 — Roll back the app

**Option A: Previous image tag**
```bash
# Update docker-compose.yml:
#   image: indos:v1.2.0   (instead of :latest or :v1.3.0)
docker compose up -d indos
```

**Option B: Rebuild from previous git SHA**
```bash
git checkout d4e5f6g
docker compose build indos
docker compose up -d indos
git checkout main   # return to main branch
```

### Step 4 — Verify health

```bash
curl https://your-domain.com/api/health
# → {"ok":true,"checks":{"db":true}}

docker compose logs indos --tail 50
# No errors
```

### Step 5 — Handle Prisma schema changes (if migration was applied)

If the rollback crosses a Prisma migration:

```bash
# Check migration history
docker compose exec indos bun run prisma migrate status

# Roll back a specific migration (dev only — destructive!)
# docker compose exec indos bun run prisma migrate resolve --rolled-back <migration_name>

# For production: restore Postgres from the most recent backup BEFORE the bad migration
gunzip -c backups/indos_20250704_020000.sql.gz | \
  docker compose exec -T postgres psql -U indos -d indos
```

### Step 6 — Handle OTA firmware rollback (if a bad firmware was deployed)

If a bad firmware version was pushed to physical devices:

```bash
# 1. Find the previous good firmware version in the catalog
curl -s -b "next-auth.session-token=..." https://your-domain.com/api/indos/firmware | jq

# 2. Deploy a rollback OTA job targeting the same devices
curl -s -X POST -b "next-auth.session-token=..." \
  -H "Content-Type: application/json" \
  -d '{"firmwareId":"<previous-good-firmware-id>","scope":"global","target":null}' \
  https://your-domain.com/api/indos/ota

# 3. Devices poll /api/indos/ota/manifest, fetch the previous firmware, verify, and flash
```

> **Note:** OTA downgrade protection is the device's responsibility. If your ESP32 sketch rejects older versions, you'll need to bump the previous firmware's version number higher than the bad one (rebuild + re-sign + re-register), or disable downgrade protection in the sketch temporarily.

### Step 7 — Communicate + postmortem

- [ ] Notify users (email / in-app banner) that the platform was rolled back
- [ ] Monitor `/api/metrics` and Grafana for anomalies for 24 hours
- [ ] Write a postmortem in `docs/worklogs/` documenting: root cause, timeline, fix, prevention
- [ ] Update `ROADMAP.md` if a new risk was identified
- [ ] Add a regression test to `tests/e2e/indos.spec.ts` to prevent recurrence

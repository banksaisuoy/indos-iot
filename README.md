# IndOS — Industrial IoT Operating System

Self-hosted, enterprise-grade Industrial IoT platform. 100% open source, 0 บาท/เดือน.

## เริ่มใช้งาน (3 ขั้นตอน)

```bash
# 1. ติดตั้ง + ตั้งค่าฐานข้อมูล
bun install
bun run db:push
bun run prisma/seed.ts

# 2. เริ่มเว็บแอป (port 3000)
bun run dev

# 3. เริ่ม MQTT broker + realtime (port 1883 + 3030) — เปิด terminal ใหม่
cd mini-services/telemetry && bun run dev
```

เปิด http://localhost:3000 → login: `admin@indos.io` / `indos123`

## ข้อมูลดัมมี่ที่สร้างให้

| ข้อมูล | จำนวน |
|--------|-------|
| ผู้ใช้ | 1 (admin) |
| โปรเจกต์ | 1 (Demo Factory) |
| อุปกรณ์ | 5 (temperature, humidity, power, voltage, relay) |
| เกตเวย์ | 1 |
| การตั้งค่า | 12 รายการ |

## การทดสอบ (Tests)

```bash
bun run test          # unit tests (41)
bun run test:e2e      # E2E tests (14)
bun run lint          # ESLint
bunx tsc --noEmit     # TypeScript check
```

## ใช้งานจริงบนเซิร์ฟเวอร์

```bash
# 1. Clone บนเซิร์ฟเวอร์
git clone <your-repo-url> indos && cd indos

# 2. ตั้งค่า environment
cp .env.example .env
# แก้ .env: ตั้ง NEXTAUTH_SECRET, DB_PASSWORD, OTA keys
openssl rand -base64 32  # สำหรับ NEXTAUTH_SECRET
bun run scripts/generate-ota-keys.ts  # สำหรับ OTA signing

# 3. รันด้วย Docker
docker compose up -d

# 4. ตรวจสอบ
curl http://localhost:3000/api/health
```

## เชื่อมอุปกรณ์จริง (ESP32)

1. ไปที่แอป → **Deployment Guide** → tab **ESP32**
2. คัดลอกโค้ด → อัปโหลดลงบอร์ด
3. เปลี่ยน WiFi + MQTT credentials
4. ข้อมูลจะขึ้น Dashboard ทันที

ดูรายละเอียดเพิ่มเติม: `docs/DEPLOYMENT_CHECKLIST.md`

## โครงสร้างโปรเจกต์

```
src/
  app/              # Next.js App Router (pages + API routes)
  components/indos/ # 21 views + shared components + shell
  lib/              # auth, db, rbac, rate-limit, cache, influx, ota-signing
mini-services/
  telemetry/        # MQTT broker + socket.io (port 1883 + 3030)
prisma/             # Database schema + seed
docs/               # Documentation (10 files)
```

## สิทธิ์การใช้งาน (RBAC)

| บทบาท | สิทธิ์ |
|-------|--------|
| admin | ทั้งหมด |
| engineer | จัดการอุปกรณ์/เฟิร์มแวร์/OTA |
| operator | ดู + รับทราบอลาร์ม + ใบสั่งงาน |
| viewer | ดูอย่างเดียว |

## เอกสาร

- `docs/PRODUCTION_READINESS.md` — คู่มือ production
- `docs/DEPLOYMENT_CHECKLIST.md` — ขั้นตอน deploy
- `docs/SECURITY_MODEL.md` — ระบบความปลอดภัย
- `docs/API_OVERVIEW.md` — API reference
- `docs/ROADMAP.md` — แผนพัฒนา

## License

MIT — ใช้ได้ฟรี แก้ไขได้ ไม่ต้องจ่ายเงินรายเดือน

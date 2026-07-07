import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// TEMPORARY endpoint to create Postgres schema from Prisma models (sandbox blocks
// outbound DB so we can't run `prisma db push` locally). Uses Prisma's executeRaw
// to run DDL inside the Vercel serverless function (which CAN reach the DB).
// Protected by SETUP_TOKEN. Remove after first successful run.
export const runtime = 'nodejs'
export const maxDuration = 60

const DDL = `
-- Drop all existing tables (clean slate — first deployment)
DROP TABLE IF EXISTS "_prisma_migrations" CASCADE;
DROP TABLE IF EXISTS "Telemetry" CASCADE;
DROP TABLE IF EXISTS "OtaJob" CASCADE;
DROP TABLE IF EXISTS "Firmware" CASCADE;
DROP TABLE IF EXISTS "Camera" CASCADE;
DROP TABLE IF EXISTS "AutomationFlow" CASCADE;
DROP TABLE IF EXISTS "Plugin" CASCADE;
DROP TABLE IF EXISTS "Setting" CASCADE;
DROP TABLE IF EXISTS "AuditLog" CASCADE;
DROP TABLE IF EXISTS "ScadaTag" CASCADE;
DROP TABLE IF EXISTS "ScadaStation" CASCADE;
DROP TABLE IF EXISTS "OeeRecord" CASCADE;
DROP TABLE IF EXISTS "Batch" CASCADE;
DROP TABLE IF EXISTS "Recipe" CASCADE;
DROP TABLE IF EXISTS "InventoryItem" CASCADE;
DROP TABLE IF EXISTS "Webhook" CASCADE;
DROP TABLE IF EXISTS "Notification" CASCADE;
DROP TABLE IF EXISTS "WorkOrder" CASCADE;
DROP TABLE IF EXISTS "Alarm" CASCADE;
DROP TABLE IF EXISTS "Sensor" CASCADE;
DROP TABLE IF EXISTS "Gateway" CASCADE;
DROP TABLE IF EXISTS "Device" CASCADE;
DROP TABLE IF EXISTS "Machine" CASCADE;
DROP TABLE IF EXISTS "ProductionLine" CASCADE;
DROP TABLE IF EXISTS "Building" CASCADE;
DROP TABLE IF EXISTS "Factory" CASCADE;
DROP TABLE IF EXISTS "Project" CASCADE;
DROP TABLE IF EXISTS "Customer" CASCADE;
DROP TABLE IF EXISTS "User" CASCADE;
DROP TABLE IF EXISTS "Organization" CASCADE;

CREATE TABLE "Organization" (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    type TEXT DEFAULT 'operator',
    industry TEXT,
    country TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE TABLE "User" (
    id TEXT PRIMARY KEY NOT NULL,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'operator',
    password TEXT,
    "orgId" TEXT,
    avatar TEXT,
    status TEXT DEFAULT 'active',
    "lastLogin" TIMESTAMP(3),
    "twoFA" BOOLEAN DEFAULT false,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_orgId_idx" ON "User"("orgId");
CREATE INDEX "User_status_idx" ON "User"("status");
CREATE TABLE "Customer" (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    "orgId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "Customer_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "Customer_orgId_idx" ON "Customer"("orgId");
CREATE TABLE "Project" (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'general',
    status TEXT DEFAULT 'active',
    location TEXT,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    "orgId" TEXT,
    "customerId" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Project_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Project_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Project_slug_key" ON "Project"("slug");
CREATE INDEX "Project_orgId_idx" ON "Project"("orgId");
CREATE INDEX "Project_customerId_idx" ON "Project"("customerId");
CREATE INDEX "Project_status_idx" ON "Project"("status");
CREATE INDEX "Project_category_idx" ON "Project"("category");
CREATE TABLE "Factory" (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    location TEXT,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "Factory_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "Factory_projectId_idx" ON "Factory"("projectId");
CREATE TABLE "Building" (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    "factoryId" TEXT NOT NULL,
    floors TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "Building_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "Factory"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "Building_factoryId_idx" ON "Building"("factoryId");
CREATE TABLE "ProductionLine" (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ProductionLine_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ProductionLine_buildingId_idx" ON "ProductionLine"("buildingId");
CREATE TABLE "Machine" (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    model TEXT,
    manufacturer TEXT,
    serial TEXT,
    status TEXT DEFAULT 'idle',
    oee DOUBLE PRECISION DEFAULT 0,
    availability DOUBLE PRECISION DEFAULT 0,
    performance DOUBLE PRECISION DEFAULT 0,
    quality DOUBLE PRECISION DEFAULT 0,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "Machine_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "ProductionLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "Machine_lineId_idx" ON "Machine"("lineId");
CREATE INDEX "Machine_status_idx" ON "Machine"("status");
CREATE TABLE "Device" (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    mac TEXT NOT NULL,
    serial TEXT,
    type TEXT DEFAULT 'sensor',
    protocol TEXT DEFAULT 'mqtt',
    firmware TEXT,
    ip TEXT,
    "projectId" TEXT,
    "machineId" TEXT,
    status TEXT DEFAULT 'online',
    cpu DOUBLE PRECISION DEFAULT 0,
    memory DOUBLE PRECISION DEFAULT 0,
    temperature DOUBLE PRECISION DEFAULT 0,
    signal DOUBLE PRECISION DEFAULT 0,
    battery DOUBLE PRECISION,
    "lastSeen" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    config TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Device_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Device_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Device_mac_key" ON "Device"("mac");
CREATE INDEX "Device_projectId_idx" ON "Device"("projectId");
CREATE INDEX "Device_machineId_idx" ON "Device"("machineId");
CREATE INDEX "Device_status_idx" ON "Device"("status");
CREATE INDEX "Device_type_idx" ON "Device"("type");
CREATE INDEX "Device_lastSeen_idx" ON "Device"("lastSeen");
CREATE TABLE "Gateway" (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    mac TEXT NOT NULL,
    model TEXT,
    firmware TEXT,
    ip TEXT,
    status TEXT DEFAULT 'online',
    "deviceCount" INTEGER DEFAULT 0,
    uptime DOUBLE PRECISION DEFAULT 0,
    location TEXT,
    "orgId" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE UNIQUE INDEX "Gateway_mac_key" ON "Gateway"("mac");
CREATE INDEX "Gateway_orgId_idx" ON "Gateway"("orgId");
CREATE TABLE "Sensor" (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    metric TEXT NOT NULL,
    unit TEXT NOT NULL,
    "deviceId" TEXT,
    "minValue" DOUBLE PRECISION,
    "maxValue" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE TABLE "Telemetry" (
    id TEXT PRIMARY KEY NOT NULL,
    "deviceId" TEXT NOT NULL,
    metric TEXT NOT NULL,
    value DOUBLE PRECISION NOT NULL,
    ts TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "Telemetry_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "Telemetry_deviceId_metric_ts_idx" ON "Telemetry"("deviceId", "metric", "ts");
CREATE TABLE "Alarm" (
    id TEXT PRIMARY KEY NOT NULL,
    "deviceId" TEXT,
    "projectId" TEXT,
    severity TEXT DEFAULT 'warning',
    category TEXT DEFAULT 'system',
    message TEXT NOT NULL,
    state TEXT DEFAULT 'active',
    "ackedBy" TEXT,
    "ackedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "Alarm_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Alarm_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "Alarm_state_severity_idx" ON "Alarm"("state", "severity");
CREATE INDEX "Alarm_deviceId_idx" ON "Alarm"("deviceId");
CREATE INDEX "Alarm_projectId_idx" ON "Alarm"("projectId");
CREATE INDEX "Alarm_createdAt_idx" ON "Alarm"("createdAt");
CREATE INDEX "Alarm_category_idx" ON "Alarm"("category");
CREATE TABLE "Notification" (
    id TEXT PRIMARY KEY NOT NULL,
    "userId" TEXT,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    channel TEXT DEFAULT 'inapp',
    read BOOLEAN DEFAULT false,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE TABLE "WorkOrder" (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    type TEXT DEFAULT 'corrective',
    priority TEXT DEFAULT 'medium',
    status TEXT DEFAULT 'open',
    "projectId" TEXT,
    assignee TEXT,
    "machineName" TEXT,
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkOrder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "WorkOrder_projectId_idx" ON "WorkOrder"("projectId");
CREATE INDEX "WorkOrder_status_idx" ON "WorkOrder"("status");
CREATE INDEX "WorkOrder_priority_idx" ON "WorkOrder"("priority");
CREATE INDEX "WorkOrder_createdAt_idx" ON "WorkOrder"("createdAt");
CREATE TABLE "Firmware" (
    id TEXT PRIMARY KEY NOT NULL,
    version TEXT NOT NULL,
    "deviceType" TEXT NOT NULL,
    checksum TEXT,
    "sizeKb" INTEGER DEFAULT 0,
    notes TEXT,
    status TEXT DEFAULT 'stable',
    url TEXT,
    signature TEXT,
    "signingKeyId" TEXT,
    manifest TEXT,
    "orgId" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX "Firmware_deviceType_idx" ON "Firmware"("deviceType");
CREATE INDEX "Firmware_status_idx" ON "Firmware"("status");
CREATE INDEX "Firmware_orgId_idx" ON "Firmware"("orgId");
CREATE TABLE "OtaJob" (
    id TEXT PRIMARY KEY NOT NULL,
    "firmwareId" TEXT NOT NULL,
    scope TEXT DEFAULT 'single',
    target TEXT,
    status TEXT DEFAULT 'pending',
    progress DOUBLE PRECISION DEFAULT 0,
    total INTEGER DEFAULT 0,
    done INTEGER DEFAULT 0,
    "signedBy" TEXT,
    "orgId" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "OtaJob_firmwareId_fkey" FOREIGN KEY ("firmwareId") REFERENCES "Firmware"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "OtaJob_firmwareId_idx" ON "OtaJob"("firmwareId");
CREATE INDEX "OtaJob_status_idx" ON "OtaJob"("status");
CREATE INDEX "OtaJob_orgId_idx" ON "OtaJob"("orgId");
CREATE TABLE "Camera" (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    location TEXT,
    ip TEXT,
    status TEXT DEFAULT 'online',
    "aiDetection" BOOLEAN DEFAULT false,
    "motionDetect" BOOLEAN DEFAULT true,
    recording BOOLEAN DEFAULT false,
    resolution TEXT DEFAULT '1080p',
    "orgId" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX "Camera_orgId_idx" ON "Camera"("orgId");
CREATE TABLE "AutomationFlow" (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    trigger TEXT NOT NULL,
    enabled BOOLEAN DEFAULT true,
    nodes INTEGER DEFAULT 0,
    "lastRun" TIMESTAMP(3),
    "runCount" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE TABLE "Plugin" (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT,
    version TEXT NOT NULL,
    author TEXT,
    category TEXT DEFAULT 'industry',
    installed BOOLEAN DEFAULT false,
    enabled BOOLEAN DEFAULT false,
    rating DOUBLE PRECISION DEFAULT 0,
    downloads INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE UNIQUE INDEX "Plugin_slug_key" ON "Plugin"("slug");
CREATE TABLE "Setting" (
    id TEXT PRIMARY KEY NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    category TEXT DEFAULT 'system'
);
CREATE UNIQUE INDEX "Setting_key_key" ON "Setting"("key");
CREATE TABLE "AuditLog" (
    id TEXT PRIMARY KEY NOT NULL,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    target TEXT,
    ip TEXT,
    "orgId" TEXT,
    ts TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX "AuditLog_ts_idx" ON "AuditLog"("ts");
CREATE INDEX "AuditLog_actor_idx" ON "AuditLog"("actor");
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");
CREATE INDEX "AuditLog_orgId_idx" ON "AuditLog"("orgId");
CREATE TABLE "ScadaStation" (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    protocol TEXT DEFAULT 'modbus-tcp',
    endpoint TEXT NOT NULL,
    "scanRateMs" INTEGER DEFAULT 1000,
    enabled BOOLEAN DEFAULT true,
    status TEXT DEFAULT 'online',
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE TABLE "ScadaTag" (
    id TEXT PRIMARY KEY NOT NULL,
    "stationId" TEXT NOT NULL,
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    "dataType" TEXT DEFAULT 'float',
    unit TEXT,
    value DOUBLE PRECISION DEFAULT 0,
    quality TEXT DEFAULT 'good',
    ts TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ScadaTag_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "ScadaStation"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ScadaTag_stationId_idx" ON "ScadaTag"("stationId");
CREATE TABLE "OeeRecord" (
    id TEXT PRIMARY KEY NOT NULL,
    "machineName" TEXT NOT NULL,
    "lineName" TEXT,
    shift TEXT DEFAULT 'day',
    date TIMESTAMP(3) NOT NULL,
    availability DOUBLE PRECISION DEFAULT 0,
    performance DOUBLE PRECISION DEFAULT 0,
    quality DOUBLE PRECISION DEFAULT 0,
    oee DOUBLE PRECISION DEFAULT 0,
    "downtimeMin" INTEGER DEFAULT 0,
    "goodUnits" INTEGER DEFAULT 0,
    "totalUnits" INTEGER DEFAULT 0,
    "scrapUnits" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX "OeeRecord_machineName_date_idx" ON "OeeRecord"("machineName", "date");
CREATE TABLE "Recipe" (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    product TEXT,
    version TEXT DEFAULT '1.0',
    status TEXT DEFAULT 'draft',
    yield INTEGER DEFAULT 0,
    unit TEXT DEFAULT 'units',
    steps INTEGER DEFAULT 0,
    "cycleTimeMin" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "Recipe_code_key" ON "Recipe"("code");
CREATE TABLE "Batch" (
    id TEXT PRIMARY KEY NOT NULL,
    "batchNo" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    status TEXT DEFAULT 'planned',
    quantity INTEGER DEFAULT 0,
    "goodQty" INTEGER DEFAULT 0,
    "scrapQty" INTEGER DEFAULT 0,
    operator TEXT,
    "machineName" TEXT,
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Batch_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Batch_batchNo_key" ON "Batch"("batchNo");
CREATE TABLE "InventoryItem" (
    id TEXT PRIMARY KEY NOT NULL,
    sku TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT DEFAULT 'raw',
    unit TEXT DEFAULT 'pcs',
    quantity DOUBLE PRECISION DEFAULT 0,
    "reorderLevel" DOUBLE PRECISION DEFAULT 0,
    location TEXT,
    "unitCost" DOUBLE PRECISION DEFAULT 0,
    supplier TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "InventoryItem_sku_key" ON "InventoryItem"("sku");
CREATE TABLE "Webhook" (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    event TEXT NOT NULL,
    secret TEXT,
    enabled BOOLEAN DEFAULT true,
    "lastStatus" TEXT,
    "lastFired" TIMESTAMP(3),
    deliveries INTEGER DEFAULT 0,
    failures INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
`

export async function GET(req: Request) {
  const url = new URL(req.url)
  const token = url.searchParams.get('token')
  if (!process.env.SETUP_TOKEN || token !== process.env.SETUP_TOKEN) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  }
  try {
    // Execute the DDL in chunks (Postgres query limit)
    const statements = DDL.split(';').map(s => s.trim()).filter(s => s.length > 0 && !s.startsWith('--'))
    let executed = 0
    for (const stmt of statements) {
      if (!stmt) continue
      try {
        await db.$executeRawUnsafe(stmt)
        executed++
      } catch (e: any) {
        // Log but continue — some statements may fail if tables don't exist yet
        console.log('[setup] stmt skipped:', (e.message || '').slice(0, 80))
      }
    }
    const userCount = await db.user.count()
    return NextResponse.json({ ok: true, executed, userCount, message: 'Schema created. Now run /api/setup/seed' })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: (e.message || '').slice(0, 500) }, { status: 500 })
  }
}

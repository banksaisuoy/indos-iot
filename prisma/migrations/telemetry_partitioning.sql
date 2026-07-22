-- ═══════════════════════════════════════════════════════════════════════
-- IndOS — Telemetry Table Partitioning Migration
-- Phase 16: Time-Series Database Optimization
-- ═══════════════════════════════════════════════════════════════════════
--
-- PURPOSE:
--   Converts the Telemetry table from a flat heap to a RANGE PARTITIONED
--   table by month. This enables:
--     • Sub-millisecond query performance (partition pruning skips irrelevant months)
--     • Efficient archival (DROP old partitions instead of slow DELETE)
--     • Massive insert throughput (each partition has its own index B-tree)
--
-- PREREQUISITES:
--   PostgreSQL 12+ (native partitioning with FK support)
--   Run AFTER `prisma db push` has created the initial Telemetry table.
--
-- USAGE:
--   psql "$DATABASE_URL" -f prisma/migrations/telemetry_partitioning.sql
--   OR: bunx prisma db execute --file prisma/migrations/telemetry_partitioning.sql --schema prisma/schema.prisma
--
-- WARNING: This DROPS the existing Telemetry table. Back up data first!
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Drop existing table + indexes (data loss!) ───────────────────
DROP TABLE IF EXISTS "Telemetry" CASCADE;

-- ── 2. Create partitioned parent table ──────────────────────────────
-- PARTITION BY RANGE (ts) → monthly partitions.
-- The id column uses a DEFAULT gen_random_uuid()::text because Prisma's
-- cuid() is generated at the client layer, but createMany doesn't always
-- provide it. The default ensures every row gets an id even for raw inserts.
CREATE TABLE "Telemetry" (
    id        TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "deviceId" TEXT NOT NULL,
    "orgId"    TEXT,
    metric    TEXT NOT NULL,
    value     DOUBLE PRECISION NOT NULL,
    ts        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id, ts)  -- Composite PK required for partitioned tables
) PARTITION BY RANGE (ts);

-- ── 3. Create monthly partitions (24 months: 2026-01 through 2027-12) ──
-- Each partition covers exactly one calendar month.
-- For production, automate future partition creation with pg_partman or a
-- cron job that runs this pattern for the next 3 months ahead.

-- 2026
CREATE TABLE "Telemetry_2026_01" PARTITION OF "Telemetry" FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE "Telemetry_2026_02" PARTITION OF "Telemetry" FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE "Telemetry_2026_03" PARTITION OF "Telemetry" FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE "Telemetry_2026_04" PARTITION OF "Telemetry" FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE "Telemetry_2026_05" PARTITION OF "Telemetry" FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE "Telemetry_2026_06" PARTITION OF "Telemetry" FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE "Telemetry_2026_07" PARTITION OF "Telemetry" FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE "Telemetry_2026_08" PARTITION OF "Telemetry" FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE "Telemetry_2026_09" PARTITION OF "Telemetry" FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE "Telemetry_2026_10" PARTITION OF "Telemetry" FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE "Telemetry_2026_11" PARTITION OF "Telemetry" FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE "Telemetry_2026_12" PARTITION OF "Telemetry" FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

-- 2027
CREATE TABLE "Telemetry_2027_01" PARTITION OF "Telemetry" FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');
CREATE TABLE "Telemetry_2027_02" PARTITION OF "Telemetry" FOR VALUES FROM ('2027-02-01') TO ('2027-03-01');
CREATE TABLE "Telemetry_2027_03" PARTITION OF "Telemetry" FOR VALUES FROM ('2027-03-01') TO ('2027-04-01');
CREATE TABLE "Telemetry_2027_04" PARTITION OF "Telemetry" FOR VALUES FROM ('2027-04-01') TO ('2027-05-01');
CREATE TABLE "Telemetry_2027_05" PARTITION OF "Telemetry" FOR VALUES FROM ('2027-05-01') TO ('2027-06-01');
CREATE TABLE "Telemetry_2027_06" PARTITION OF "Telemetry" FOR VALUES FROM ('2027-06-01') TO ('2027-07-01');
CREATE TABLE "Telemetry_2027_07" PARTITION OF "Telemetry" FOR VALUES FROM ('2027-07-01') TO ('2027-08-01');
CREATE TABLE "Telemetry_2027_08" PARTITION OF "Telemetry" FOR VALUES FROM ('2027-08-01') TO ('2027-09-01');
CREATE TABLE "Telemetry_2027_09" PARTITION OF "Telemetry" FOR VALUES FROM ('2027-09-01') TO ('2027-10-01');
CREATE TABLE "Telemetry_2027_10" PARTITION OF "Telemetry" FOR VALUES FROM ('2027-10-01') TO ('2027-11-01');
CREATE TABLE "Telemetry_2027_11" PARTITION OF "Telemetry" FOR VALUES FROM ('2027-11-01') TO ('2027-12-01');
CREATE TABLE "Telemetry_2027_12" PARTITION OF "Telemetry" FOR VALUES FROM ('2027-12-01') TO ('2028-01-01');

-- ── 4. Default partition (catch-all for out-of-range timestamps) ────
-- Prevents INSERT failures when a device sends a timestamp outside the
-- pre-created partition range. Monitor this table — if it grows, create
-- the missing monthly partitions and migrate data.
CREATE TABLE "Telemetry_default" PARTITION OF "Telemetry" DEFAULT;

-- ── 5. Composite indexes on the PARENT table ────────────────────────
-- PostgreSQL 11+ propagates indexes from the parent to all child partitions
-- automatically. This creates the same index on every partition.

-- Primary dashboard query: org-level device telemetry (latest first)
-- Covers: WHERE "orgId" = ? AND "deviceId" = ? ORDER BY ts DESC
CREATE INDEX "Telemetry_org_device_ts_idx"
    ON "Telemetry" ("orgId", "deviceId", ts DESC);

-- Secondary query: single-device metric history
-- Covers: WHERE "deviceId" = ? AND metric = ? ORDER BY ts DESC
CREATE INDEX "Telemetry_device_metric_ts_idx"
    ON "Telemetry" ("deviceId", metric, ts DESC);

-- Time-range scans for partition pruning + archival queries
CREATE INDEX "Telemetry_ts_idx"
    ON "Telemetry" (ts DESC);

-- ── 6. Verify ───────────────────────────────────────────────────────
-- Confirm the partitioning is correct
SELECT
    parent.relname  AS parent_table,
    child.relname   AS partition,
    pg_get_expr(child.relpartbound, child.oid) AS partition_range
FROM pg_inherits
    JOIN pg_class parent ON pg_inherits.inhparent = parent.oid
    JOIN pg_class child  ON pg_inherits.inhrelid  = child.oid
WHERE parent.relname = 'Telemetry'
ORDER BY child.relname;

-- ═══════════════════════════════════════════════════════════════════════
-- FUTURE PARTITION MANAGEMENT (recommended):
--
-- Option A: pg_partman extension (automated partition creation)
--   CREATE EXTENSION pg_partman;
--   SELECT partman.create_parent('public.Telemetry', 'ts', 'native', 'monthly');
--
-- Option B: Cron job (pg_cron or external) that creates next 3 months:
--   Run monthly: CREATE TABLE "Telemetry_YYYY_MM" PARTITION OF "Telemetry"
--     FOR VALUES FROM ('YYYY-MM-01') TO ('YYYY-MM+1-01');
--
-- Option C: Application-level check in the telemetry service (telemetryBuffer)
--   that logs a warning when ts falls outside known partition ranges.
-- ═══════════════════════════════════════════════════════════════════════

COMMIT;

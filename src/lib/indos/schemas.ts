import { z } from 'zod'

// Shared zod schemas for API request validation
export const projectCreateSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional().nullable(),
  category: z.enum(['general', 'energy', 'agriculture', 'greenhouse', 'solar', 'water', 'factory', 'coldstorage', 'weather', 'smarthome']).optional().default('general'),
  location: z.string().max(200).optional().nullable(),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
  orgId: z.string().optional().nullable(),
  customerId: z.string().optional().nullable(),
})

export const alarmPatchSchema = z.object({
  id: z.string().min(1),
  state: z.enum(['active', 'acknowledged', 'resolved']),
  ackedBy: z.string().max(120).optional(),
})

/**
 * PHASE 12-C — Bulk alarm acknowledge.
 *
 * At least one of `ids` (non-empty array) OR `severity` OR `all===true` must
 * be provided. The "at-least-one" rule is enforced in the route handler so we
 * can return a clean 400 `NO_TARGET` (zod would surface as 422 VALIDATION_ERROR
 * which is less actionable for callers). The schema here only normalizes types.
 *
 * - `ids`      → acknowledge a specific set of alarm ids (e.g. multi-select).
 * - `severity` → acknowledge every active alarm with that severity (org-scoped).
 * - `all`      → acknowledge every active alarm visible to the caller (org-scoped).
 *
 * `ids` takes precedence when provided; otherwise `severity`; otherwise `all`.
 * The handler always intersects with `state: 'active'` so already-acked or
 * resolved alarms are silently skipped (idempotent).
 */
export const bulkAckSchema = z.object({
  ids: z.array(z.string().min(1)).optional(),
  severity: z.enum(['critical', 'warning', 'info']).optional(),
  all: z.boolean().optional(),
})

export const workOrderCreateSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional().nullable(),
  type: z.enum(['corrective', 'preventive', 'predictive', 'inspection']).optional().default('corrective'),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional().default('medium'),
  projectId: z.string().optional().nullable(),
  assignee: z.string().max(120).optional().nullable(),
  machineName: z.string().max(200).optional().nullable(),
  dueDate: z.string().optional().nullable(),
})

export const workOrderPatchSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['open', 'inprogress', 'onhold', 'completed', 'cancelled']),
})

export const pluginActionSchema = z.object({
  id: z.string().min(1),
  action: z.enum(['install', 'enable', 'disable', 'uninstall']),
})

export const webhookCreateSchema = z.object({
  name: z.string().min(1).max(120),
  url: z.string().url().max(2000),
  event: z.enum(['alarm.created', 'device.offline', 'ota.completed', 'telemetry.threshold', 'workorder.created']),
  secret: z.string().max(200).optional().nullable(),
  enabled: z.boolean().optional().default(true),
})

export const webhookPatchSchema = z.object({
  id: z.string().min(1),
  enabled: z.boolean(),
})

export const inventoryCreateSchema = z.object({
  name: z.string().min(1).max(200),
  sku: z.string().max(50).optional(),
  category: z.enum(['raw', 'wip', 'finished', 'spare', 'consumable']).optional().default('raw'),
  unit: z.string().max(20).optional().default('pcs'),
  quantity: z.number().min(0).optional().default(0),
  reorderLevel: z.number().min(0).optional().default(0),
  location: z.string().max(200).optional().nullable(),
  unitCost: z.number().min(0).optional().default(0),
  supplier: z.string().max(200).optional().nullable(),
})

export const inventoryPatchSchema = z.object({
  id: z.string().min(1),
  quantity: z.number().min(0),
})

export const recipeCreateSchema = z.object({
  name: z.string().min(1).max(200),
  product: z.string().max(200).optional().nullable(),
  version: z.string().max(20).optional().default('1.0'),
  yield: z.number().int().min(0).optional().default(0),
  unit: z.string().max(20).optional().default('units'),
  steps: z.number().int().min(0).optional().default(0),
  cycleTimeMin: z.number().int().min(0).optional().default(0),
})

export const batchPatchSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['planned', 'inprogress', 'completed', 'quarantined', 'scrapped']),
})

export const scadaStationCreateSchema = z.object({
  name: z.string().min(1).max(200),
  protocol: z.enum(['modbus-tcp', 'modbus-rtu', 'opc-ua', 'ethernet-ip', 'bacnet']).optional().default('modbus-tcp'),
  endpoint: z.string().min(1).max(500),
  scanRateMs: z.number().int().min(100).max(60000).optional().default(1000),
})

export const aiChatSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().max(8000),
  })).min(1).max(30),
})

// ─── OTA Firmware Schemas ────────────────────────────────────────────
export const firmwareRegisterSchema = z.object({
  version: z.string().min(1).max(50),
  deviceType: z.string().min(1).max(50),
  url: z.string().url().max(2000),
  sizeKb: z.number().int().min(0),
  notes: z.string().max(2000).optional().nullable(),
  checksum: z.string().max(128).optional().nullable(), // auto-computed if omitted
  status: z.enum(['draft', 'stable', 'deprecated']).optional().default('draft'),
})

export const otaDeploySchema = z.object({
  firmwareId: z.string().min(1),
  scope: z.enum(['single', 'group', 'project', 'global']),
  target: z.string().max(200).optional().nullable(),
})

// ─── User & Organization Management Schemas (Phase 12-B) ────────────
// Used by POST /api/indos/users, PATCH /api/indos/users/[id], POST /api/indos/orgs.
// These power the previously-fake "Invite User" and "New Organization" dialogs.
export const userCreateSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(200).transform((s) => s.toLowerCase()),
  password: z.string().min(8).max(200),
  role: z.enum(['admin', 'engineer', 'operator', 'viewer']),
  // empty string → null (platform-level user). The dialog sends "" for "— No org —".
  orgId: z.string().optional().nullable().transform((s) => (s && s.trim() ? s : null)),
})

// NOTE on orgId: we intentionally do NOT use `.transform()` here (unlike
// userCreateSchema). A transform would convert the *missing* field to `null`,
// which would make the route handler's `if (orgId !== undefined)` check pass
// and unintentionally clear the user's org on every PATCH that doesn't include
// orgId (e.g. "Disable", "Reset password", "Change role"). Without the
// transform, a missing key stays `undefined` (and is even omitted from the
// parsed object), so the handler correctly skips it. Empty-string→null
// normalization is handled in the route handler defensively.
export const userUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  role: z.enum(['admin', 'engineer', 'operator', 'viewer']).optional(),
  status: z.enum(['active', 'disabled']).optional(),
  password: z.string().min(8).max(200).optional(),
  // null means "remove from org → platform-level". empty string is normalized in the route.
  orgId: z.string().max(200).optional().nullable(),
}).refine(
  // At least one field must be EXPLICITLY provided (i.e. not undefined).
  // `.optional()` leaves missing keys as `undefined`, so this correctly rejects `{}`.
  (data) => Object.values(data).some((v) => v !== undefined),
  { message: 'At least one field must be provided for update' },
)

export const orgCreateSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.enum(['operator', 'customer', 'integrator']),
  industry: z.string().max(200).optional().nullable(),
  country: z.string().max(200).optional().nullable(),
})

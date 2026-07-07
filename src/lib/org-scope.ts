import type { Session } from 'next-auth'

/**
 * P0.1 — Per-tenant orgId scoping helper.
 *
 * IndOS is a multi-tenant platform. Every list/query API must restrict results
 * to the caller's organization unless they are a platform admin (cross-org) or
 * have no orgId assigned (legacy / platform-level user — backward compat).
 *
 * Usage:
 *   const where = {
 *     ...orgScope(session),           // for top-level orgId columns (Project, User, Customer)
 *     // ...other filters
 *   }
 *
 * For resources that scope via a nested relation (Device/Alarm/WorkOrder/Machine),
 * use `scopedProjectFilter(session, ...)` instead — it returns the proper nested
 * `project: { orgId, ... }` fragment and merges safely with other project filters.
 */

/**
 * Returns a Prisma `where` fragment that scopes queries to the user's org.
 * Admins (role === 'admin') bypass scoping → empty object (sees everything).
 * Users without an orgId (legacy/null) also bypass (treated as platform-level).
 *
 * Apply to models that have a top-level `orgId` column: Project, User, Customer.
 */
export function orgScope(session: Session | null): { orgId?: string } {
  const orgId = (session?.user as any)?.orgId as string | null | undefined
  const role = (session?.user as any)?.role as string | undefined
  if (role === 'admin') return {}            // admin = cross-org
  if (!orgId) return {}                       // no org assigned → platform-level (backward compat)
  return { orgId }
}

/**
 * True when the session must be org-scoped (non-admin with an orgId).
 * Use this to decide whether to inject nested scoping filters.
 */
export function isOrgScoped(session: Session | null): boolean {
  const orgId = (session?.user as any)?.orgId as string | null | undefined
  const role = (session?.user as any)?.role as string | undefined
  return role !== 'admin' && !!orgId
}

/**
 * Returns the caller's orgId when org-scoped, or undefined otherwise.
 */
export function getOrgId(session: Session | null): string | undefined {
  if (!isOrgScoped(session)) return undefined
  return (session?.user as any)?.orgId as string | undefined
}

/**
 * Build a nested `project: { ... }` Prisma filter fragment that combines
 * org-scoping with an optional project slug filter, WITHOUT clobbering either.
 *
 * Returns `undefined` when the caller is not org-scoped and no slug is requested
 * (so the spread is a no-op). Returns `{ project: { orgId } }` when only
 * org-scoped, `{ project: { slug } }` when only slug-scoped, and
 * `{ project: { orgId, slug } }` when both.
 *
 * Used by: Device, Alarm, WorkOrder, Machine (via line.building.factory.project).
 */
export function scopedProjectFilter(
  session: Session | null,
  projectSlug?: string | null,
): { project: Record<string, string> } | Record<string, never> {
  const orgId = getOrgId(session)
  const slug = projectSlug && projectSlug !== 'all' ? projectSlug : undefined

  if (!orgId && !slug) return {}
  const filter: Record<string, string> = {}
  if (orgId) filter.orgId = orgId
  if (slug) filter.slug = slug
  return { project: filter }
}

/**
 * Build a deeply-nested `line: { building: { factory: { project: { ... } } } }`
 * filter for Machine scoping. Same combination rules as scopedProjectFilter.
 *
 * Returns `{}` (no-op) when neither org nor slug applies.
 */
export function scopedMachineFilter(
  session: Session | null,
): { line: { building: { factory: { project: { orgId?: string } } } } } | Record<string, never> {
  const orgId = getOrgId(session)
  if (!orgId) return {}
  return { line: { building: { factory: { project: { orgId } } } } }
}

/**
 * Phase 14 — org-scoped filter for "platform-shared" resources (Firmware, OtaJob,
 * Gateway, Camera). These models have a nullable `orgId` column:
 *   - `orgId = null`  → platform-shared, visible to ALL orgs (read-only for org users)
 *   - `orgId = <org>` → org-private, visible only to that org + admins
 *
 * Org-scoped users see their own org's records PLUS platform-shared (null) ones.
 * Admins / platform users see everything.
 *
 * Returns `{}` (no-op, sees all) for admins/platform, or
 * `{ OR: [{ orgId: null }, { orgId: <callerOrgId> }] }` for org-scoped users.
 *
 * Used by: Firmware, OtaJob, Gateway, Camera list endpoints.
 */
export function orgScopeWithPlatform(
  session: Session | null,
): { OR: Array<{ orgId: null } | { orgId: string }> } | Record<string, never> {
  const orgId = getOrgId(session)
  if (!orgId) return {}
  // Prisma `OR` with explicit null + the caller's orgId.
  return { OR: [{ orgId: null }, { orgId }] }
}

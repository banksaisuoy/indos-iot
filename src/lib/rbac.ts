import { NextResponse } from 'next/server'
import type { Session } from 'next-auth'

export type Role = 'admin' | 'engineer' | 'operator' | 'viewer'

const ROLE_HIERARCHY: Record<Role, number> = {
  admin: 4,
  engineer: 3,
  operator: 2,
  viewer: 1,
}

/**
 * Check if a session has at least the required role.
 */
export function hasRole(session: Session | null, minRole: Role): boolean {
  if (!session?.user) return false
  const userRole = (session.user as any).role as Role
  if (!userRole) return false
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[minRole]
}

/**
 * Require a minimum role. Returns null if authorized, or a NextResponse (403) if not.
 * Usage:
 *   const denied = requireRole(session, 'engineer')
 *   if (denied) return denied
 */
export function requireRole(session: Session | null, minRole: Role): NextResponse | null {
  if (!session) {
    return NextResponse.json({ error: 'UNAUTHORIZED', message: 'Authentication required' }, { status: 401 })
  }
  if (!hasRole(session, minRole)) {
    return NextResponse.json({ error: 'FORBIDDEN', message: 'Insufficient permissions' }, { status: 403 })
  }
  return null
}

/**
 * Require any of the listed roles. Returns null if authorized, or 403.
 */
export function requireAnyRole(session: Session | null, roles: Role[]): NextResponse | null {
  if (!session) {
    return NextResponse.json({ error: 'UNAUTHORIZED', message: 'Authentication required' }, { status: 401 })
  }
  const userRole = (session.user as any).role as Role
  if (!userRole || !roles.includes(userRole)) {
    return NextResponse.json({ error: 'FORBIDDEN', message: 'Insufficient permissions' }, { status: 403 })
  }
  return null
}

/**
 * Get the user's role from session (or null).
 */
export function getRole(session: Session | null): Role | null {
  if (!session?.user) return null
  return (session.user as any).role as Role
}

import 'next-auth'

/**
 * P0.1 — Augment the NextAuth Session.user type to include IndOS-specific fields.
 *
 * `role` and `orgId` are propagated from the JWT (see src/lib/auth.ts callbacks).
 * `orgId` is null for platform-level / cross-org admin users.
 *
 * These fields are populated by the jwt → session callback chain and read by
 * org-scope.ts to filter Prisma queries per-tenant.
 */
declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      name: string
      role: string
      orgId?: string | null
    }
  }

  // The user object returned from authorize() — propagated into the jwt callback
  interface User {
    id: string
    email: string
    name: string
    role?: string
    orgId?: string | null
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    uid?: string
    role?: string
    orgId?: string | null
  }
}

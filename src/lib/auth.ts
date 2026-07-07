import type { NextAuthOptions } from 'next-auth'
import type { NextRequest } from 'next/server'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'

/**
 * Extract the real client IP from request headers.
 * Reads x-forwarded-for (first IP) or x-real-ip, falls back to '0.0.0.0'.
 * Caddy/ingress sets these headers; without them we only see the proxy IP.
 */
function getClientIp(req?: NextRequest | any): string {
  try {
    const headers = req?.headers as Record<string, string | string[] | undefined> | undefined
    if (headers) {
      const xff = headers['x-forwarded-for']
      if (typeof xff === 'string' && xff.trim()) {
        return xff.split(',')[0].trim()
      }
      const xri = headers['x-real-ip']
      if (typeof xri === 'string' && xri.trim()) return xri.trim()
    }
  } catch {
    // ignore — fall through to default
  }
  return '0.0.0.0'
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'IndOS',
      credentials: {
        email: { label: 'Email', type: 'email', placeholder: 'admin@indos.io' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, req) {
        console.log('[auth] 🔐 authorize() called, email:', credentials?.email)

        if (!credentials?.email || !credentials?.password) {
          console.log('[auth] ❌ Missing email or password')
          return null
        }

        const user = await db.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
        })

        if (!user) {
          console.log('[auth] ❌ User not found:', credentials.email)
          return null
        }
        if (user.status !== 'active' || !user.password) {
          console.log('[auth] ❌ User inactive or no password')
          return null
        }

        const valid = bcrypt.compareSync(credentials.password, user.password)
        if (!valid) {
          console.log('[auth] ❌ Password mismatch')
          return null
        }

        console.log('[auth] ✅ Login successful:', user.email, 'role:', user.role, 'orgId:', user.orgId ?? '(platform)')
        try {
          await db.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } })
          // P2.7 bonus: capture real client IP via x-forwarded-for / x-real-ip when present
          const ip = getClientIp(req)
          await db.auditLog.create({ data: { actor: user.email, action: 'login', ip } })
        } catch (e) {
          console.log('[auth] ⚠️ Audit log failed:', (e as Error).message)
        }

        // P0.1: propagate orgId + role into the JWT/session so handlers can scope queries
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          orgId: user.orgId,
        } as any
      },
    }),
  ],
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  callbacks: {
    async jwt({ token, user }: any) {
      if (user) {
        token.role = user.role
        token.uid = user.id
        // P0.1: propagate orgId (null = platform-level / cross-org admin)
        token.orgId = user.orgId ?? null
      }
      return token
    },
    async session({ session, token }: any) {
      if (session.user) {
        session.user.role = token.role
        session.user.id = token.uid
        // P0.1: expose orgId to handlers (null for platform admins)
        session.user.orgId = token.orgId ?? null
      }
      return session
    },
  },
  secret: process.env.NEXTAUTH_SECRET || 'indos-dev-secret-change-in-production',
  // CRITICAL: trust the X-Forwarded-Host header so NextAuth knows the real domain
  // (space-z.ai) instead of localhost:3000. Without this, NextAuth generates
  // absolute URLs to localhost which browsers block via Private Network Access.
  useSecureCookies: false,
}

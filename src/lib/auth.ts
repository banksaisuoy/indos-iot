import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'IndOS',
      credentials: {
        email: { label: 'Email', type: 'email', placeholder: 'admin@indos.io' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
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

        console.log('[auth] ✅ Login successful:', user.email)
        try {
          await db.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } })
          await db.auditLog.create({ data: { actor: user.email, action: 'login', ip: '0.0.0.0' } })
        } catch (e) {
          console.log('[auth] ⚠️ Audit log failed:', (e as Error).message)
        }

        return { id: user.id, name: user.name, email: user.email, role: user.role } as any
      },
    }),
  ],
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  callbacks: {
    async jwt({ token, user }: any) {
      if (user) { token.role = user.role; token.uid = user.id }
      return token
    },
    async session({ session, token }: any) {
      if (session.user) { session.user.role = token.role; session.user.id = token.uid }
      return session
    },
  },
  secret: process.env.NEXTAUTH_SECRET || 'indos-dev-secret-change-in-production',
  // CRITICAL: trust the X-Forwarded-Host header so NextAuth knows the real domain
  // (space-z.ai) instead of localhost:3000. Without this, NextAuth generates
  // absolute URLs to localhost which browsers block via Private Network Access.
  useSecureCookies: false,
}

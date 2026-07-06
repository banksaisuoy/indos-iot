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
        console.log('[auth] 🔐 authorize() called')
        console.log('[auth]   email:', credentials?.email)
        console.log('[auth]   password provided:', !!credentials?.password)

        if (!credentials?.email || !credentials?.password) {
          console.log('[auth] ❌ Missing email or password')
          return null
        }

        console.log('[auth] 🔍 Looking up user in DB...')
        const user = await db.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
        })

        if (!user) {
          console.log('[auth] ❌ User not found:', credentials.email)
          return null
        }
        console.log('[auth] ✅ User found:', user.email, 'role:', user.role, 'status:', user.status)

        if (user.status !== 'active') {
          console.log('[auth] ❌ User not active:', user.status)
          return null
        }
        if (!user.password) {
          console.log('[auth] ❌ User has no password hash')
          return null
        }

        console.log('[auth] 🔑 Verifying bcrypt password...')
        const valid = bcrypt.compareSync(credentials.password, user.password)
        console.log('[auth]   bcrypt result:', valid)
        if (!valid) {
          console.log('[auth] ❌ Password mismatch')
          return null
        }

        console.log('[auth] ✅ Password verified — updating lastLogin + audit log')
        try {
          await db.user.update({
            where: { id: user.id },
            data: { lastLogin: new Date() },
          })
          await db.auditLog.create({
            data: { actor: user.email, action: 'login', ip: '0.0.0.0' },
          })
        } catch (e) {
          console.log('[auth] ⚠️ Audit log write failed (non-fatal):', (e as Error).message)
        }

        console.log('[auth] ✅ Returning user object for JWT')
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
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
      }
      return token
    },
    async session({ session, token }: any) {
      if (session.user) {
        session.user.role = token.role
        session.user.id = token.uid
      }
      return session
    },
  },
  secret: process.env.NEXTAUTH_SECRET || 'indos-dev-secret-change-in-production',
  // Cookies configured for dev (HTTP) + preview panel (iframe) compatibility
  // In production with HTTPS, change secure to true
  cookies: {
    sessionToken: {
      name: 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: false,
      },
    },
    csrfToken: {
      name: 'next-auth.csrf-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: false,
      },
    },
    callbackUrl: {
      name: 'next-auth.callback-url',
      options: {
        sameSite: 'lax',
        path: '/',
        secure: false,
      },
    },
  },
}

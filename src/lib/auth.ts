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
        if (!credentials?.email || !credentials?.password) return null

        const user = await db.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
        })

        // User must exist, be active, and have a password hash
        if (!user || user.status !== 'active' || !user.password) return null

        // Verify password with bcrypt
        const valid = bcrypt.compareSync(credentials.password, user.password)
        if (!valid) return null

        // Update last login timestamp
        await db.user.update({
          where: { id: user.id },
          data: { lastLogin: new Date() },
        })

        // Write audit log
        await db.auditLog.create({
          data: { actor: user.email, action: 'login', ip: '0.0.0.0' },
        })

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
}

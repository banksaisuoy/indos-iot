import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'

// Protect all IndOS API routes and the root app page.
// Public routes: /login, /api/auth/* (NextAuth), /api/health (Docker healthcheck)
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Get the session token from JWT
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET || 'indos-dev-secret-change-in-production',
  })

  // If authenticated, allow through
  if (token) {
    return NextResponse.next()
  }

  // Unauthenticated:
  // - API routes → 401 JSON
  // - Page routes → redirect to /login
  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: 'Authentication required' },
      { status: 401 }
    )
  }

  const loginUrl = new URL('/login', req.url)
  loginUrl.searchParams.set('callbackUrl', pathname)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  // Protect everything EXCEPT: login page, NextAuth API, health check, and static assets
  matcher: [
    '/((?!login|api/auth|api/health|_next/static|_next/image|favicon.ico|indos-logo.svg).*)',
  ],
}

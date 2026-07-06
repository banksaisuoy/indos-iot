# Phase 4 — NextAuth Authentication

**Status:** ✅ Complete

## Summary
Implemented real NextAuth authentication + protected all APIs.

## Files Changed
- `prisma/schema.prisma` — added `password String?` to User model
- `prisma/seed.ts` — hash passwords with bcrypt
- `src/lib/auth.ts` (NEW) — NextAuth config: CredentialsProvider + bcrypt verify + JWT callbacks
- `src/app/api/auth/[...nextauth]/route.ts` (NEW) — NextAuth route handler
- `src/middleware.ts` (NEW) — protects all `/api/indos/*` (401 JSON) + app routes (redirect to /login)
- `src/app/login/page.tsx` (NEW) — login UI
- `src/components/indos/providers.tsx` (NEW) — SessionProvider
- `src/app/layout.tsx` — wrapped in SessionProvider
- `src/components/indos/shell/topbar.tsx` — real useSession() + signOut()
- `src/lib/auth.test.ts` (NEW) — 5 tests
- `.env` — added NEXTAUTH_SECRET

## Verification
- Unauth API → 401, Auth API → 200, Login valid → 200, Login wrong → 401
- 12/12 tests pass

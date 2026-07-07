/**
 * Centralised NextAuth secret resolution with a production fail-fast guard.
 *
 * RISK: `auth.ts` and `middleware.ts` previously fell back to a hard-coded
 * `'indos-dev-secret-change-in-production'` when NEXTAUTH_SECRET was unset.
 * In a production deployment where the operator forgets to set the env var,
 * JWTs would be signed/verified with a publicly-known secret → any attacker
 * could forge a session token and impersonate any user (including admin).
 *
 * FIX: in production (`NODE_ENV === 'production'`) we REFUSE to start if the
 * secret is missing — throwing here crashes the server at startup (auth.ts is
 * imported during app boot) and crashes the first middleware invocation,
 * which is fail-closed (503/500 instead of forged sessions). In dev the
 * fallback is preserved so the sandbox keeps working without an env var.
 *
 * Both `auth.ts` and `middleware.ts` import this constant instead of
 * inlining the fallback, so the guard is enforced in exactly one place.
 */
function resolveSecret(): string {
  const s = process.env.NEXTAUTH_SECRET
  if (s && s.trim().length >= 16) return s.trim()

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'NEXTAUTH_SECRET must be set to a random string (≥16 chars) in production. ' +
        'Refusing to start with a publicly-known dev secret — this would allow session forgery. ' +
        'Generate one with: openssl rand -base64 32',
    )
  }
  // Dev fallback — safe because dev servers are not exposed to attackers.
  return 'indos-dev-secret-change-in-production'
}

export const NEXTAUTH_SECRET = resolveSecret()

import { NextResponse } from 'next/server'

/**
 * In-memory rate limiter (token bucket per key).
 * Falls back to this when Redis is not configured.
 * For production, set REDIS_URL and use @upstash/ratelimit (future).
 */

interface Bucket {
  tokens: number
  lastRefill: number
}

const buckets = new Map<string, Bucket>()
const CLEANUP_INTERVAL = 60_000 // 1 min
const BUCKET_TTL = 300_000 // 5 min — stale buckets cleaned up

// Periodic cleanup of stale buckets
setInterval(() => {
  const now = Date.now()
  for (const [key, bucket] of buckets) {
    if (now - bucket.lastRefill > BUCKET_TTL) {
      buckets.delete(key)
    }
  }
}, CLEANUP_INTERVAL)

export interface RateLimitConfig {
  limit: number       // max requests
  windowMs: number    // time window in milliseconds
}

export interface RateLimitResult {
  allowed: boolean
  limit: number
  remaining: number
  resetAt: number // epoch ms
}

/**
 * Check rate limit for a key. Mutates the bucket.
 */
export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now()
  const bucket = buckets.get(key)

  if (!bucket) {
    // New bucket
    buckets.set(key, { tokens: config.limit - 1, lastRefill: now })
    return {
      allowed: true,
      limit: config.limit,
      remaining: config.limit - 1,
      resetAt: now + config.windowMs,
    }
  }

  // Refill tokens based on elapsed time
  const elapsed = now - bucket.lastRefill
  const refillRate = config.limit / config.windowMs // tokens per ms
  const refilled = Math.min(config.limit, bucket.tokens + elapsed * refillRate)

  if (refilled >= 1) {
    const newTokens = refilled - 1
    buckets.set(key, { tokens: newTokens, lastRefill: now })
    return {
      allowed: true,
      limit: config.limit,
      remaining: Math.floor(newTokens),
      resetAt: now + config.windowMs,
    }
  }

  // No tokens available — rate limited
  const resetAt = now + Math.ceil((1 - refilled) / refillRate)
  return {
    allowed: false,
    limit: config.limit,
    remaining: 0,
    resetAt,
  }
}

/**
 * Rate limit presets.
 */
export const RATE_LIMITS = {
  ai: { limit: 5, windowMs: 60_000 },         // 5 req/min
  ota: { limit: 10, windowMs: 60_000 },        // 10 req/min
  firmware: { limit: 10, windowMs: 60_000 },   // 10 req/min
  write: { limit: 30, windowMs: 60_000 },      // 30 req/min
  read: { limit: 120, windowMs: 60_000 },      // 120 req/min
} as const

/**
 * Apply rate limiting. Returns null if allowed, or a 429 NextResponse if blocked.
 * Key is typically `${userId}:${routeName}` or `${ip}:${routeName}`.
 */
export function applyRateLimit(key: string, config: RateLimitConfig): NextResponse | null {
  const result = checkRateLimit(key, config)
  if (!result.allowed) {
    return NextResponse.json(
      { error: 'RATE_LIMITED', message: 'Too many requests' },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': String(result.limit),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
          'Retry-After': String(Math.ceil((result.resetAt - Date.now()) / 1000)),
        },
      }
    )
  }
  return null
}

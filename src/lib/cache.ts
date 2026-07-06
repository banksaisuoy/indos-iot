/**
 * IndOS Redis Cache Client
 *
 * Provides a simple cache interface with graceful fallback to in-memory LRU
 * when Redis is not configured. This enables caching in dev (no Redis) and
 * production (with Redis for multi-instance).
 *
 * Usage:
 *   import { cacheGet, cacheSet, cacheDel } from '@/lib/cache'
 *   const cached = await cacheGet('overview')
 *   if (cached) return NextResponse.json(cached)
 *   const data = await computeOverview()
 *   await cacheSet('overview', data, 30) // 30s TTL
 *   return NextResponse.json(data)
 */

// ── In-memory LRU fallback ────────────────────────────────────────────
interface CacheEntry {
  value: any
  expiresAt: number
}

const memoryCache = new Map<string, CacheEntry>()
const MAX_ENTRIES = 500

// Periodic cleanup (every 60s)
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of memoryCache) {
      if (entry.expiresAt < now) memoryCache.delete(key)
    }
  }, 60_000).unref?.()
}

// ── Redis client (lazy-init, optional) ────────────────────────────────
let redisClient: any = null
let redisAvailable = false

async function initRedis() {
  const REDIS_URL = process.env.REDIS_URL
  if (!REDIS_URL) {
    return // dev mode — use in-memory
  }
  try {
    // Dynamic import to avoid loading ioredis when not needed
    const { Redis } = await import('ioredis')
    redisClient = new Redis(REDIS_URL, { maxRetriesPerRequest: 1 })
    redisAvailable = true
    console.log(`[cache] ✅ Connected to Redis at ${REDIS_URL}`)
    redisClient.on('error', (e: Error) => {
      console.warn('[cache] Redis error, falling back to memory:', e.message)
      redisAvailable = false
    })
  } catch (e: any) {
    console.log('[cache] Redis not available, using in-memory:', e.message)
  }
}

// Init on first import (non-blocking)
initRedis().catch(() => {})

export function isRedisAvailable(): boolean {
  return redisAvailable
}

/**
 * Get a cached value. Returns null if not found or expired.
 */
export async function cacheGet<T = any>(key: string): Promise<T | null> {
  try {
    if (redisAvailable && redisClient) {
      const val = await redisClient.get(`indos:${key}`)
      return val ? JSON.parse(val) : null
    }
    // In-memory fallback
    const entry = memoryCache.get(key)
    if (!entry) return null
    if (entry.expiresAt < Date.now()) {
      memoryCache.delete(key)
      return null
    }
    return entry.value as T
  } catch {
    return null
  }
}

/**
 * Set a cached value with TTL in seconds.
 */
export async function cacheSet(key: string, value: any, ttlSeconds: number): Promise<void> {
  try {
    if (redisAvailable && redisClient) {
      await redisClient.set(`indos:${key}`, JSON.stringify(value), 'EX', ttlSeconds)
      return
    }
    // In-memory fallback with LRU eviction
    if (memoryCache.size >= MAX_ENTRIES) {
      // Evict oldest entry
      const firstKey = memoryCache.keys().next().value
      if (firstKey) memoryCache.delete(firstKey)
    }
    memoryCache.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 })
  } catch {
    // Non-fatal — caching is best-effort
  }
}

/**
 * Delete a cached value (for cache invalidation after writes).
 */
export async function cacheDel(key: string): Promise<void> {
  try {
    if (redisAvailable && redisClient) {
      await redisClient.del(`indos:${key}`)
      return
    }
    memoryCache.delete(key)
  } catch {
    // Non-fatal
  }
}

/**
 * Delete all keys matching a pattern (e.g., 'overview*').
 * In-memory: iterates and deletes matching keys.
 */
export async function cacheDelPattern(pattern: string): Promise<void> {
  try {
    if (redisAvailable && redisClient) {
      const keys = await redisClient.keys(`indos:${pattern}`)
      if (keys.length > 0) await redisClient.del(...keys)
      return
    }
    // In-memory: convert glob to regex
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$')
    for (const key of memoryCache.keys()) {
      if (regex.test(key)) memoryCache.delete(key)
    }
  } catch {
    // Non-fatal
  }
}

/**
 * Cache wrapper: get-or-set pattern.
 * Usage: const data = await cached('overview', 30, () => computeOverview())
 */
export async function cached<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
  const existing = await cacheGet<T>(key)
  if (existing !== null) return existing
  const fresh = await fn()
  await cacheSet(key, fresh, ttlSeconds)
  return fresh
}

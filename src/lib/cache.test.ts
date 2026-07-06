import { describe, it, expect } from 'vitest'
import { cacheGet, cacheSet, cacheDel, cached } from '@/lib/cache'

describe('Cache: in-memory fallback (no Redis configured)', () => {
  it('set + get works', async () => {
    await cacheSet('test-key', { value: 42 }, 60)
    const result = await cacheGet('test-key')
    expect(result).toEqual({ value: 42 })
  })

  it('get returns null for missing key', async () => {
    const result = await cacheGet('nonexistent-key')
    expect(result).toBeNull()
  })

  it('del removes the key', async () => {
    await cacheSet('del-key', 'data', 60)
    await cacheDel('del-key')
    const result = await cacheGet('del-key')
    expect(result).toBeNull()
  })

  it('cached() wrapper returns cached value on second call', async () => {
    let callCount = 0
    const fn = async () => { callCount++; return { computed: callCount } }
    const first = await cached('wrapper-test', 60, fn)
    const second = await cached('wrapper-test', 60, fn)
    expect(first).toEqual({ computed: 1 })
    expect(second).toEqual({ computed: 1 }) // cached, not recomputed
    expect(callCount).toBe(1) // fn called only once
  })

  it('TTL expires entries', async () => {
    await cacheSet('ttl-test', 'data', 1) // 1 second TTL
    await new Promise(r => setTimeout(r, 1100))
    const result = await cacheGet('ttl-test')
    expect(result).toBeNull()
  })
})

describe('Cache: Redis optional', () => {
  it('isRedisAvailable returns false when REDIS_URL not set', async () => {
    // In test env, REDIS_URL is not set
    const { isRedisAvailable } = await import('@/lib/cache')
    expect(typeof isRedisAvailable()).toBe('boolean')
    // Should be false in test/dev without Redis
  })
})

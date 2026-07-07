import { describe, it, expect } from 'vitest'
import { decideAckOutcome } from './ack-outcome'

/**
 * Phase 13 — operator-safety contract for the Critical Alarm Banner.
 *
 * The inviolable rule: "ack failure must not hide alarm". If the bulk-ack
 * server call fails for ANY reason, the banner must stay visible and the live
 * alarms must stay active. Only a confirmed 2xx from the server allows the
 * banner to dismiss and the live alarms to be acked.
 */
describe('decideAckOutcome — ack failure must not hide alarm', () => {
  it('dismisses + acks live on a 200 success', () => {
    const o = decideAckOutcome(200, 3)
    expect(o.dismiss).toBe(true)
    expect(o.ackLive).toBe(true)
    expect(o.toast.type).toBe('success')
    expect(o.toast.message).toMatch(/Acknowledged 3 live critical alarms/)
  })

  it('uses singular form for a single alarm', () => {
    const o = decideAckOutcome(200, 1)
    expect(o.toast.message).toMatch(/Acknowledged 1 live critical alarm$/)
  })

  it('does NOT dismiss or ack live on a 500 server error', () => {
    const o = decideAckOutcome(500, 5)
    expect(o.dismiss).toBe(false)
    expect(o.ackLive).toBe(false)
    expect(o.toast.type).toBe('error')
    expect(o.toast.message).toMatch(/Bulk acknowledge failed/)
    expect(o.toast.description).toMatch(/remain active/)
  })

  it('does NOT dismiss or ack live on a 404 (endpoint missing)', () => {
    const o = decideAckOutcome(404, 2)
    expect(o.dismiss).toBe(false)
    expect(o.ackLive).toBe(false)
    expect(o.toast.type).toBe('error')
  })

  it('does NOT dismiss or ack live on a 401 session expiry', () => {
    const o = decideAckOutcome(401, 4)
    expect(o.dismiss).toBe(false)
    expect(o.ackLive).toBe(false)
    expect(o.toast.type).toBe('error')
    expect(o.toast.message).toMatch(/Session expired/)
  })

  it('does NOT dismiss or ack live on a 403 forbidden (operator role)', () => {
    const o = decideAckOutcome(403, 1)
    expect(o.dismiss).toBe(false)
    expect(o.ackLive).toBe(false)
    expect(o.toast.type).toBe('error')
    expect(o.toast.message).toMatch(/Insufficient permissions/)
  })

  it('does NOT dismiss or ack live on a 429 rate limit', () => {
    const o = decideAckOutcome(429, 8)
    expect(o.dismiss).toBe(false)
    expect(o.ackLive).toBe(false)
    expect(o.toast.type).toBe('error')
  })

  it('does NOT dismiss or ack live on a network error (null status)', () => {
    const o = decideAckOutcome(null, 6)
    expect(o.dismiss).toBe(false)
    expect(o.ackLive).toBe(false)
    expect(o.toast.type).toBe('error')
    expect(o.toast.description).toMatch(/Network error/)
  })

  it('treats 201 (created) as success', () => {
    const o = decideAckOutcome(201, 2)
    expect(o.dismiss).toBe(true)
    expect(o.ackLive).toBe(true)
    expect(o.toast.type).toBe('success')
  })

  it('every non-2xx / null outcome keeps dismiss=false', () => {
    // Exhaustive sweep — the safety invariant must hold for ALL failure codes.
    const failures: (number | null)[] = [null, 400, 401, 403, 404, 408, 418, 422, 429, 500, 502, 503, 504]
    for (const s of failures) {
      const o = decideAckOutcome(s, 3)
      expect(o.dismiss, `status ${s}`).toBe(false)
      expect(o.ackLive, `status ${s}`).toBe(false)
    }
  })
})

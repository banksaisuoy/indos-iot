import { describe, it, expect } from 'vitest'
import { bulkAckSchema } from '@/lib/indos/schemas'
import { toCSV, csvTimestamp } from '@/lib/csv'

describe('bulkAckSchema (Phase 12-C)', () => {
  it('accepts a non-empty ids array', () => {
    const r = bulkAckSchema.safeParse({ ids: ['a', 'b'] })
    expect(r.success).toBe(true)
  })

  it('accepts severity filter', () => {
    const r = bulkAckSchema.safeParse({ severity: 'critical' })
    expect(r.success).toBe(true)
  })

  it('accepts all: true', () => {
    const r = bulkAckSchema.safeParse({ all: true })
    expect(r.success).toBe(true)
  })

  it('accepts empty object (at-least-one rule is enforced in route, not zod)', () => {
    // The schema only normalizes types; the 400 NO_TARGET check lives in the route
    // so callers get an actionable error code instead of a generic 422.
    const r = bulkAckSchema.safeParse({})
    expect(r.success).toBe(true)
  })

  it('rejects invalid severity', () => {
    const r = bulkAckSchema.safeParse({ severity: 'panic' })
    expect(r.success).toBe(false)
  })

  it('rejects ids array containing empty strings', () => {
    const r = bulkAckSchema.safeParse({ ids: ['ok', ''] })
    expect(r.success).toBe(false)
  })

  it('rejects non-boolean all', () => {
    const r = bulkAckSchema.safeParse({ all: 'yes' })
    expect(r.success).toBe(false)
  })

  it('accepts a combined payload (ids + severity + all)', () => {
    const r = bulkAckSchema.safeParse({ ids: ['x'], severity: 'warning', all: true })
    expect(r.success).toBe(true)
  })
})

describe('toCSV (object-rows overload)', () => {
  const cols = [
    { key: 'name', label: 'Name' },
    { key: 'value', label: 'Value' },
  ]

  it('emits a header row from column labels', () => {
    const csv = toCSV([], cols)
    expect(csv.startsWith('Name,Value\r\n')).toBe(true)
  })

  it('serializes each row in column order', () => {
    const csv = toCSV(
      [
        { name: 'temp', value: 42 },
        { name: 'humidity', value: 7 },
      ],
      cols,
    )
    const lines = csv.split('\r\n').filter(Boolean)
    expect(lines[0]).toBe('Name,Value')
    expect(lines[1]).toBe('temp,42')
    expect(lines[2]).toBe('humidity,7')
  })

  it('escapes cells containing commas, quotes, and newlines (RFC-4180)', () => {
    const csv = toCSV(
      [
        { name: 'a,b', value: 'has "quote"' },
        { name: 'line\nbreak', value: 'plain' },
      ],
      cols,
    )
    const lines = csv.split('\r\n').filter(Boolean)
    expect(lines[1]).toBe('"a,b","has ""quote"""')
    expect(lines[2]).toBe('"line\nbreak",plain')
  })

  it('treats null and undefined as empty cells', () => {
    const csv = toCSV(
      [{ name: null, value: undefined }],
      cols,
    )
    const lines = csv.split('\r\n').filter(Boolean)
    expect(lines[1]).toBe(',')
  })

  it('appends a trailing CRLF', () => {
    const csv = toCSV([{ name: 'x', value: 1 }], cols)
    expect(csv.endsWith('\r\n')).toBe(true)
  })

  it('falls back to empty string for missing keys', () => {
    const csv = toCSV([{ other: 1 } as any], cols)
    const lines = csv.split('\r\n').filter(Boolean)
    expect(lines[1]).toBe(',')
  })
})

describe('csvTimestamp', () => {
  it('produces a YYYY-MM-DD-HHmm string', () => {
    const d = new Date(2026, 6, 7, 14, 5) // Jul 7 2026, 14:05 local
    const s = csvTimestamp(d)
    expect(s).toBe('2026-07-07-1405')
    expect(s).toMatch(/^\d{4}-\d{2}-\d{2}-\d{4}$/)
  })

  it('zero-pads single-digit components', () => {
    const d = new Date(2026, 0, 1, 1, 1) // Jan 1 2026, 01:01
    expect(csvTimestamp(d)).toBe('2026-01-01-0101')
  })
})

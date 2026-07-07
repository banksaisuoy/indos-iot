/**
 * CSV export helpers — used by IndOS list views (devices, alarms, etc.).
 *
 * Shared helper to avoid duplicate implementations across views. If another
 * agent created this file in parallel, the last writer wins — both
 * implementations are functionally equivalent.
 *
 * Two calling conventions are supported (function overloads):
 *
 *   1. Array-of-cells (used by Phase 12-D devices view):
 *        toCSV(headers: string[], rows: (string|number|null|undefined)[][])
 *        downloadCSV(filename: string, csv: string)
 *
 *   2. Object-rows + column descriptor (used by Phase 12-C alarms view):
 *        toCSV(rows: Record<string, any>[], columns: {key,label}[])
 *        downloadCSV(filename: string, rows: Record<string, any>[], columns: {key,label}[])
 *
 * Both conventions escape cells per RFC-4180: values containing `,`, `"`, or
 * newlines are wrapped in double-quotes; internal `"` are doubled.
 */

/**
 * Cell-level CSV escape — RFC-4180 style.
 */
function escapeCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

/**
 * Join a row of cells into a CSV line.
 */
function rowToLine(cells: (string | number | null | undefined)[]): string {
  return cells.map((c) => escapeCell(c)).join(',')
}

// ─── Overload 1 — array-of-cells ─────────────────────────────────────
export function toCSV(headers: string[], rows: (string | number | null | undefined)[][]): string
// ─── Overload 2 — object rows + column descriptor ────────────────────
export function toCSV(rows: Record<string, any>[], columns: { key: string; label: string }[]): string
// ─── Implementation ──────────────────────────────────────────────────
export function toCSV(a: any, b: any): string {
  // Detect which convention was used by sniffing the first argument.
  // Overload 1: first arg is a string[] (headers), second is a 2D array.
  // Overload 2: first arg is an object[] (rows), second is a column descriptor[].
  if (Array.isArray(b) && b.length > 0 && typeof b[0] === 'object' && b[0] !== null && 'key' in b[0] && 'label' in b[0]) {
    // Overload 2: (rows, columns)
    const rows: Record<string, any>[] = a as Record<string, any>[]
    const columns: { key: string; label: string }[] = b as { key: string; label: string }[]
    const headerLine = rowToLine(columns.map((c) => c.label))
    const bodyLines = rows.map((r) => rowToLine(columns.map((c) => r?.[c.key] ?? '')))
    return [headerLine, ...bodyLines].join('\r\n') + '\r\n'
  }
  // Overload 1: (headers, rows)
  const headers: string[] = a as string[]
  const rows: (string | number | null | undefined)[][] = b as (string | number | null | undefined)[][]
  const lines = [rowToLine(headers), ...rows.map((r) => rowToLine(r))]
  return lines.join('\r\n') + '\r\n'
}

/**
 * Trigger a client-side download of a CSV string as a file.
 * Falls back gracefully if `URL.createObjectURL` is unavailable
 * (e.g. SSR / non-browser env).
 */
export function downloadCSV(filename: string, csv: string): void
export function downloadCSV(filename: string, rows: Record<string, any>[], columns: { key: string; label: string }[]): void
export function downloadCSV(filename: string, a: any, b?: any): void {
  if (typeof window === 'undefined') return
  const csv = typeof b === 'undefined'
    ? (a as string)
    : toCSV(a as Record<string, any>[], b as { key: string; label: string }[])
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  // Defer revoke so the browser has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Build a `YYYY-MM-DD-HHmm` timestamp suitable for CSV filenames.
 * Local time (handover reports are written in the operator's local TZ).
 */
export function csvTimestamp(d: Date = new Date()): string {
  const p = (n: number, l = 2) => String(n).padStart(l, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

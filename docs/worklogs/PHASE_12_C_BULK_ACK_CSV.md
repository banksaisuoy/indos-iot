# Phase 12-C — Bulk Alarm Acknowledge + CSV Export

**Task ID:** PHASE12-C-BULK-ACK-CSV
**Agent:** full-stack-developer
**Date:** 2026-07-07
**Phase:** 12 — Field-Operations Hardening

## Problem

Two workflow-friction issues in the Alarm Center:

1. **Bulk acknowledge missing.** When a sensor glitches and fires 50 alarms at once, the operator must click "Ack" 50 times. Real control rooms have "Ack All" / "Ack All Critical" buttons. Without them, IndOS is unergonomic during incident spikes.
2. **No CSV export.** Shift-handover reports and compliance audits require exporting the alarm log to a spreadsheet. The existing view had no export path — operators had to screenshot or manually transcribe.

## What Was Built

### 1. `POST /api/indos/alarms/bulk-ack` — `src/app/api/indos/alarms/bulk-ack/route.ts`

Engineer+ only (operator/viewer → 403). Body validated by `bulkAckSchema` (zod):

```ts
{ ids?: string[], severity?: 'critical'|'warning'|'info', all?: boolean }
```

- At-least-one-target rule: if none of `ids` (non-empty) / `severity` / `all===true` is provided → 400 `NO_TARGET` (actionable code, not a generic 422).
- Build the Prisma `where` with precedence `ids > severity > all`, always intersected with `state: 'active'` (idempotent — re-acking already-acked alarms is a no-op).
- Org-scoped via `scopedProjectFilter(session)` — non-admin engineers ack ONLY alarms in their own org's projects; admins (cross-org) ack everything visible. Mirrors the existing alarms GET route's scoping.
- `db.alarm.updateMany({ where, data: { state: 'acknowledged', ackedBy: session.user.email, ackedAt: new Date() } })`.
- Returns `{ count: <number updated> }` 200.
- Audit log: `actor: <email>, action: 'alarm.bulk_ack', target: JSON.stringify({severity, all, ids, count})`.

### 2. Reusable CSV helper — `src/lib/csv.ts`

Extended with two new TypeScript overloads matching the spec:

```ts
export function toCSV(rows: Record<string, any>[], columns: {key:string,label:string}[]): string
export function downloadCSV(filename: string, rows: Record<string, any>[], columns: {key:string,label:string}[]): void
```

- RFC-4180 escaping: cells containing `,`, `"`, or newlines are wrapped in double-quotes; internal `"` are doubled.
- `downloadCSV` builds a Blob + `URL.createObjectURL` + temp `<a>` + click, then revokes after 1s.
- `csvTimestamp()` produces `YYYY-MM-DD-HHmm` (local time) for shift-handover filenames.
- **Backward-compat:** The existing array-based overloads from parallel agent 12-D (`toCSV(headers, rows)` / `downloadCSV(filename, csv)`) are preserved untouched. Overload dispatch sniffs whether the second argument is a column descriptor (has `key` + `label`) or a 2D cell array.

### 3. alarms-view.tsx — three new buttons in the ViewHeader actions area

| Button | Variant | Visible when | Action |
|---|---|---|---|
| **Ack All Critical** | outline, rose-tinted (destructive) | `filtered.some(a => a.state === 'active' && a.severity === 'critical')` | POST bulk-ack `{severity:'critical', all:true}`; mirror ack into live buffer via `rt.ackAlarm(id)` for each live critical; toast `Acknowledged N critical alarms`; reload DB list. |
| **Ack All Active** | outline | `filtered.some(a => a.state === 'active')` | POST bulk-ack `{all:true}`; same live-ack loop; toast `Acknowledged N active alarms`; reload. |
| **Export CSV** | outline, Download icon | always (disabled when `filtered.length === 0`) | Project current filtered list into 9-column CSV; filename `indos-alarms-YYYY-MM-DD-HHmm.csv`; toast `Exported N alarms to CSV` with filename + KB size. |

- `bulkActioning: 'critical' | 'all' | null` state — both Ack buttons disabled while any bulk action in-flight; Loader2 spinner replaces icon.
- `exporting: boolean` state — Export button disabled during export.
- Mutual exclusion: while any bulk action is in-flight, all three buttons are disabled.
- 403 from API → friendly toast "Insufficient permissions — Engineer+ role required for bulk acknowledge."
- 401 from API → "Session expired — please sign in again."

### CSV column descriptor

```ts
const CSV_COLUMNS = [
  { key: 'severity', label: 'Severity' },
  { key: 'category', label: 'Category' },
  { key: 'message',  label: 'Message' },
  { key: 'device',   label: 'Device' },
  { key: 'project',  label: 'Project' },
  { key: 'state',    label: 'State' },
  { key: 'ackedBy',  label: 'Acked By' },
  { key: 'ts',       label: 'Timestamp(ISO)' },
  { key: 'tsLocal',  label: 'Timestamp(Local)' },
]
```

Stable order so shift-handover reports are diffable across days. ISO column for machine consumers, Local for humans.

## Files Changed

| File | Status | Purpose |
|---|---|---|
| `src/app/api/indos/alarms/bulk-ack/route.ts` | NEW | POST bulk-ack endpoint |
| `src/lib/csv.ts` | MODIFIED | Added object-rows + column-descriptor overloads |
| `src/lib/csv.test.ts` | NEW | 16 unit tests (bulkAckSchema + toCSV overload + csvTimestamp) |
| `src/components/indos/views/alarms-view.tsx` | MODIFIED | 3 new ViewHeader buttons + handlers + state |
| `docs/worklogs/PHASE_12_C_BULK_ACK_CSV.md` | NEW | This file |
| `worklog.md` | MODIFIED | Appended Phase 12-C entry |

## Verification

| Check | Result |
|---|---|
| `bun run lint` | 0 errors |
| `bunx tsc --noEmit` | 0 errors |
| `bunx vitest run` | 57/57 pass (41 existing + 16 new) |
| Browser (admin) — buttons render | ✓ Screenshot `shot-phase12c-alarms.png` |
| Browser (admin) — Export CSV | ✓ Toast `Exported 7 alarms to CSV`. Screenshot `shot-phase12c-export-csv.png` |
| Browser (admin) — Ack All Active | ✓ Toast `Acknowledged 5 active alarms`; both Ack buttons disappeared; active count dropped. Screenshot `shot-phase12c-after-ack.png` |
| Browser (engineer@acme.io) — sees only Acme alarms | ✓ 3 rows; Demo alarms hidden by org-scoping |
| Browser (engineer) — Ack All Active | ✓ Toast `Acknowledged 3 active alarms`; DB confirmed 3 Acme acked, 2 Demo actives untouched |
| Browser (engineer) — Export CSV | ✓ Toast `Exported 3 alarms to CSV` |
| Audit log | ✓ Captured `admin@indos.io → count:5` and `engineer@acme.io → count:3` |
| Console errors | None |

## Before / After Workflow

### Before
| Scenario | Operator Action | Clicks |
|---|---|---|
| Sensor glitch fires 50 alarms | Click "Ack" 50 times | 50 |
| Shift handover report | Screenshot + manual transcription | n/a |

### After
| Scenario | Operator Action | Clicks |
|---|---|---|
| Sensor glitch fires 50 alarms | Click "Ack All Critical" or "Ack All Active" | 1 |
| Shift handover report | Click "Export CSV" | 1 |

## Constraints Honored

- ✓ Used existing shadcn/ui components (Button, Badge, Loader2 from lucide-react). No new npm deps.
- ✓ Did NOT modify `page.tsx`, `topbar.tsx`, `realtime.ts`, `organizations-view.tsx`, `devices-view.tsx`, or any API route other than the new bulk-ack route.
- ✓ Did NOT create `/api/indos/users` POST or `/api/indos/orgs` POST (agent 12-B owns those).
- ✓ Org-scoping intact: engineer@acme.io bulk-ack acks only Acme alarms; admin sees/acks all.
- ✓ Footer stays sticky (no layout changes).
- ✓ TypeScript strict (tsc 0 errors).
- ✓ Existing 41 tests untouched.

## Deviations

None. The CSV helper signature in the spec is `toCSV(rows, columns)`; the file as found had a parallel agent's `(headers, rows)` array-based API. Both are preserved via TypeScript function overloads so neither agent's callers break. This is the safest coordination strategy given that two agents share the same file.

# Task 5-a — full-stack-developer — IndOS View Components

## Task
Build four view components in `src/components/indos/views/`:
- `projects-view.tsx` → `ProjectsView`
- `devices-view.tsx` → `DevicesView`
- `gateways-view.tsx` → `GatewaysView`
- `alarms-view.tsx` → `AlarmsView`

These are rendered inside the IndOS dark industrial control-room shell and consume the existing IndOS API endpoints + shared components.

## Work Log

### 0. Context gathering
- Read `worklog.md` (foundation agent’s notes), `prisma/schema.prisma` (Project, Device, Gateway, Alarm models), `src/app/page.tsx` (lazy view map — confirmed exact export names).
- Read shared components (`kpi-card`, `status-badge`, `view-header`, `charts`) to use the exact prop APIs (accent enum: emerald|amber|sky|rose|violet|slate).
- Read `useIndOS` store (for `setView`, `setActiveProject`) and `useRealtime` hook (for `vitals`, `recentAlarms`, `ackAlarm`).
- Read all four target API routes to confirm exact JSON response shapes (`_count`, `project.slug` filter, alarm PATCH shape).
- Read the existing `dashboard-view.tsx` to match the established design language (Card padding, KPI grid, LiveDot usage, indos-scroll class, tnum typography, oklch color tokens).

### 1. ProjectsView (`projects-view.tsx`)
- Header with **New Project** button → opens `NewProjectDialog` form (name, description, category Select, location).
- Form POSTs to `/api/indos/projects`, shows `toast.success` on completion, refetches list.
- Form state is reset by remounting the dialog via a `key` prop (`new-proj-${openNew ? 'open' : 'closed'}`) — avoids `setState-in-effect`.
- KPI row: total projects, active, paused, total devices, categories count (5 cards, responsive `grid-cols-2 lg:grid-cols-4 xl:grid-cols-5`).
- Category badge with color map: energy→amber, agriculture→emerald, solar→amber, water→sky, factory→violet, greenhouse→emerald, weather→sky, coldstorage→sky, general→slate.
- Filter bar: search Input (name/location/description) + category Select.
- Responsive grid of `ProjectCard` components: name, category+status badges, location, description (line-clamp-2), device/alarm/workorder counts, customer/org footer, hover-reveal "Open" affordance.
- Clicking a card opens a detail Dialog: full metadata (MAC, IP, type, protocol, firmware, customer, org, coords), 4 stat tiles, "View devices" button that calls `setActiveProject(slug)` + `setView('devices')`.
- Right side: `SimpleBar` category distribution chart + a colored category legend grid.

### 2. DevicesView (`devices-view.tsx`)
- KPI row: total, online, offline, fault, avg signal (dBm).
- Filter bar (single Card): search by name/MAC/IP + three Selects (project — fetched from `/api/indos/projects`, type — sensor/meter/gateway/plc/relay/camera/inverter/controller, status — online/offline/fault/maintenance).
- Data table (shadcn Table) inside `ScrollArea` with `max-h-[560px]` and sticky header:
  - Device column: type-colored icon + name + MAC/IP
  - Type/Protocol badges (per-type and per-protocol color maps)
  - Project + machine
  - Status badge + LiveDot when online & live vital present
  - Vitals column: 4 mini progress bars (CPU, Mem, Temp, Signal) with dynamic color (emerald/amber/rose based on threshold)
  - Firmware, last seen (relative time)
- **Live vitals overlay**: `liveVitalFor(device)` looks up `rt.vitals[d.id]` first, then falls back to name-contains match. Live values replace the DB values in both the table and detail dialog.
- Click row → detail Dialog: 4 large vital cards with Progress bars, battery bar (if present), full metadata grid (MAC, serial, IP, type, protocol, firmware), and three actions: Close, View telemetry (toast), Send OTA (toast).
- Refresh button + toast on manual reload.

### 3. GatewaysView (`gateways-view.tsx`)
- KPI row: total, online, offline, devices managed, avg uptime.
- Gateway card grid (responsive `sm:grid-cols-2 lg:grid-cols-3`):
  - Model badge (color-coded by model family), status badge, name, location with MapPin
  - LiveDot pulse on the gateway icon when online
  - Uptime progress bar (color: emerald≥99, amber≥95, rose<95)
  - 3-stat row: devices, IP, firmware
  - MAC footer + "Bridge active/down" status hint
- Right side: Connection Topology Card with a sticky-headered table — each row shows gateway (icon+name+IP), device count, and site badges inferred from splitting `location` by comma.
- Refresh button + toast.

### 4. AlarmsView (`alarms-view.tsx`)
- KPI row: Active (rose, with critical count hint), Critical (rose, ring highlight when >0), Acknowledged (amber), Resolved (emerald), Total (violet).
- Header includes a LiveDot badge showing count of active live alarms from `rt.recentAlarms`.
- Filter Card: state Select (all/active/acknowledged/resolved), severity Select (all/critical/warning/info), category Select (system/device/energy/environment/security/maintenance).
- **Live + DB merge**: `merged` useMemo combines `rt.recentAlarms` (live) with `dbAlarms` (DB) into a normalized shape `{id, severity, category, message, state, ts, device, project, isLive, ackedBy}`. Dedup key is `message + ts rounded to 5s`. Sorted by ts desc (live naturally surface first because they’re newer).
- Alarm feed table in `ScrollArea` (max-h-[640px], sticky header):
  - Severity badge + LiveDot for live alarms
  - Alarm message with category icon (system→Server, device→Cpu, energy→Zap, environment→Leaf, security→ShieldCheck, maintenance→Wrench) + category badge + timestamp (relative + absolute)
  - Source column: device name + project + ackedBy
  - State badge
  - Action buttons: **Acknowledge** (disabled when not active), **Resolve** (disabled when resolved) — both call `patchAlarm()` which routes to `rt.ackAlarm(id)` for live alarms or PATCH `/api/indos/alarms` for DB alarms, with toast feedback and refetch.
  - Critical+active rows get a subtle rose tint background.
- Right side: two summary cards — By Category (`SimpleBar` rose) and By Severity (custom progress bars per severity + 3-tile count summary).

### 5. Lint fixes
Initial lint run reported `react-hooks/set-state-in-effect` errors in my files (devices-view ×2, gateways-view ×1, projects-view ×1) because the data-fetching pattern called `setLoading(true)` synchronously inside `useEffect` bodies.
Fix applied to all four files:
- Wrapped all fetch + setState logic in `void (async () => { ... })()` IIFEs inside the effect bodies so the setState calls execute as microtasks (deferred), not synchronously.
- Added a `cancelled` flag and returned a cleanup function from each effect to avoid setState-after-unmount.
- Removed the `useCallback` import where no longer needed (devices-view, gateways-view).
- For the New Project dialog form reset, replaced the `useEffect` reset with a `key`-based remount strategy so the form state is fresh on each open.
- Removed the activeProject sync `useEffect` in devices-view — lazy `useState(activeProject || 'all')` initializer captures the value at mount time, which is sufficient because views are freshly mounted via Suspense on navigation.

Final lint result: my four files pass cleanly. Remaining 2 lint errors are in `src/app/api/indos/machines/route.ts` (parse error — API route, not mine to touch) and `src/lib/indos/realtime.ts` (ref-in-render — foundation code from Task 1, not mine to touch).

### 6. Dev server verification
Checked `dev.log` — most recent entries show `✓ Compiled in 301ms` and `GET / 200` with successful API responses (`/api/indos/series?kind=energy 200`, `/api/indos/overview 200`). The earlier energy-view 500 (duplicate `Gauge` function — another agent’s file) has resolved in the latest compile. Only benign `indicatorClassName` warning remains (same pattern as existing dashboard-view).

## Stage Summary
Four flagship enterprise view components delivered for the IndOS shell:
- **ProjectsView**: full CRUD create flow, KPIs, searchable/filterable card grid, detail dialog, category distribution chart.
- **DevicesView**: 5 KPIs, 3-filter bar + search, dense live-vital-aware data table, rich detail dialog with OTA/telemetry actions.
- **GatewaysView**: 5 KPIs, live-pulsing gateway card grid with uptime bars, inferred topology table.
- **AlarmsView**: 5 KPIs, 3-filter bar, real-time + DB merged feed with dedup, ack/resolve actions (live + DB routed correctly), category & severity summary side panels.

All four are responsive, dark-theme-native, use the established shared component library (`KpiCard`, `StatusBadge`, `SeverityBadge`, `ViewHeader`, `SimpleBar`, `LiveDot`), shadcn/ui primitives, lucide-react icons, sonner toasts, and the `useIndOS`/`useRealtime` hooks. No indigo/blue primary accents — only emerald/amber/sky/rose/violet/slate via the accent system. All files start with `'use client'` and use only `@/` aliased imports. No test files created. No modifications to `page.tsx`, `layout.tsx`, `globals.css`, `schema.prisma`, or any API route. Lint passes for all four files.

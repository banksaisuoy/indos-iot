# Phase 12-A — Operator Safety Hardening

**Task ID:** PHASE12-A-OPERATOR-SAFETY
**Agent:** full-stack-developer
**Date:** 2025-07-07

## Summary

Field-operations hardening pass that closes three operator-safety hazards on the
IndOS dashboard:

1. **Connection-loss is now visible on every screen size** — a sticky amber
   banner appears between the topbar and main content when the telemetry
   socket has been disconnected for more than 3 s. After 30 s the banner
   escalates to red/danger. A live `Xs` counter ticks every second so the
   operator knows exactly how stale the numbers on screen are.
2. **Critical alarms no longer vanish in 5 s** — a sticky red banner at the
   very top of the page shows the count + latest message of unacknowledged,
   active, critical alarms. It does **not** auto-dismiss. Buttons: `Ack All
   Critical` (emits ack for each live alarm + defensively POSTs
   `/api/indos/alarms/bulk-ack`), `View Alarms`, `×` dismiss (re-arms when a
   new critical alarm arrives). An audible 3-beep pattern (880 Hz × 120 ms ×
   3, browser-native Web Audio API) fires once when a new critical alarm
   arrives.
3. **Sound toggle in Settings → Alerts** — Switch bound to
   `localStorage["indos:alarm-sound-enabled"]` (default on), with a Test
   Sound button. Connection-loss and stale-data banners are always visible
   (cannot be disabled).

## Files Changed

### New
- `src/components/indos/shell/connection-banner.tsx` — sticky disconnect
  banner with 3 s debounce + 30 s escalation.
- `src/components/indos/shell/critical-alarm-banner.tsx` — sticky red
  critical-alarm banner with Ack / View / Dismiss actions.
- `src/lib/indos/alarm-sound.ts` — Web Audio API beep utility + localStorage
  toggle helpers.

### Modified
- `src/lib/indos/realtime.ts` — exposes `lastMessageAt` and derived `isStale`
  (true when connected but no telemetry/vitals/system message in 60 s).
- `src/components/indos/shell/topbar.tsx` — mini-stat cluster visible on
  `sm:` (was `xl:`); red ring when disconnected; "STALE" in amber when stale.
- `src/components/indos/views/settings-view.tsx` — new Alerts section with
  `AlarmSoundCard` (Switch + Test Sound button) and always-visible-banners
  callout.
- `src/app/page.tsx` — wires both banners into the shell layout (critical at
  top; connection between topbar and main); adds `playCriticalBeep()` call on
  the new-critical-alarm transition in the existing toast `useEffect`.

## Verification

| Check                     | Result                                              |
| ------------------------- | --------------------------------------------------- |
| `bun run lint`            | 0 errors                                            |
| `bunx tsc --noEmit`       | 0 errors                                            |
| `bunx vitest run`         | 41/41 tests pass                                    |
| Browser (agent-browser)   | Dashboard loads green LIVE with no banners; Settings → Alerts renders toggle + Test Sound; no console errors |
| Disconnect banner code-path | Verified via code inspection + DOM eval when loading through `:3000` (bypasses Caddy → socket cannot reach telemetry service → disconnected state → banner appears at the expected DOM position with amber styling + elapsed-seconds counter). Live WS disconnect testing skipped because stopping the telemetry mini-service would disrupt parallel agents. |

## Screenshots

- `/home/z/my-project/shot-phase12a-dashboard.png` — connected dashboard, no
  banners visible, green LIVE in the topbar.
- `/home/z/my-project/shot-phase12a-settings-alerts.png` — System Settings →
  Alerts section with the sound toggle and Test Sound button.

## Architecture Notes

- The `CriticalAlarmBanner` calls `/api/indos/alarms/bulk-ack` defensively:
  the endpoint is owned by a parallel agent (PHASE12-C). All three outcomes
  (200 success, 404 not-yet-shipped, network error) are handled with
  `.then(r => …).catch(() => …)` so the call never throws into the React
  render path. The live in-memory alarms are always acked first via
  `rt.ackAlarm(id)` so the banner disappears immediately regardless of the
  endpoint state.
- The `ConnectionBanner` is purely informational — socket.io's built-in
  auto-reconnect handles recovery. No manual retry button is offered (the
  operator's only useful action is to wait or contact IT).
- Web Audio API requires a user-gesture to start the AudioContext on most
  browsers. The first beep after the operator clicks "Sign in" satisfies this
  requirement. The Test Sound button always works because it runs inside a
  click handler.
- `isStale` is **derived on every hook invocation**, not stored in state.
  This means consumers that tick (e.g. the topbar clock that re-renders every
  second) see a fresh value even when no socket event has fired.

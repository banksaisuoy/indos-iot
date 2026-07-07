'use client'
import { useEffect, useRef, useState } from 'react'
import { useRealtime } from '@/lib/indos/realtime'
import { AlertTriangle, WifiOff, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Sticky operator-safety banner that renders BETWEEN the topbar and the main
 * content area. Surfaces a live telemetry disconnect so the operator knows the
 * numbers on screen are STALE, not live.
 *
 * Behaviour:
 *   - Hidden while `connected === true`.
 *   - When the socket drops, wait 3 s before showing the banner (avoids
 *     flicker on micro-reconnects during a service hot-reload).
 *   - After 30 s of disconnect, escalate from amber → red/danger.
 *   - A live "Xs" counter ticks every second.
 *   - "Stale since HH:MM:SS" shows the wall-clock of the disconnect.
 *   - Auto-reconnect is on (socket.io default) so the banner is purely
 *     informational — no manual button needed.
 *
 * Visible on ALL screen sizes (mobile-first). Long text only shortened on
 * small screens via the `sm:` prefix — the banner itself never hides.
 */
export function ConnectionBanner() {
  const { connected, lastMessageAt } = useRealtime()

  // Wall-clock timestamp when the disconnect started (epoch ms).
  const [disconnectSince, setDisconnectSince] = useState<number | null>(null)
  // Live "seconds since disconnect" — increments each tick.
  const [elapsedSec, setElapsedSec] = useState(0)
  // Whether we've crossed the 3 s debounce window (banner becomes visible).
  const [showBanner, setShowBanner] = useState(false)

  // Refs so the 1 Hz interval always reads the latest values without
  // re-subscribing on every state change.
  const connectedRef = useRef(connected)
  const sinceRef = useRef<number | null>(null)
  const visibleRef = useRef(false)

  useEffect(() => { connectedRef.current = connected }, [connected])

  // 1 Hz ticker — single subscription for the lifetime of the component.
  useEffect(() => {
    const tick = () => {
      const now = Date.now()
      const isConnected = connectedRef.current
      if (isConnected) {
        // Reset everything — banner disappears immediately on reconnect.
        sinceRef.current = null
        visibleRef.current = false
        setDisconnectSince(null)
        setShowBanner(false)
        setElapsedSec(0)
        return
      }
      // Disconnected.
      if (sinceRef.current === null) {
        sinceRef.current = now
        setDisconnectSince(now)
        setElapsedSec(0)
      } else {
        setElapsedSec(Math.floor((now - sinceRef.current) / 1000))
      }
      // 3 s debounce before showing — avoids flashing on micro-reconnects.
      if (!visibleRef.current && sinceRef.current !== null && now - sinceRef.current >= 3000) {
        visibleRef.current = true
        setShowBanner(true)
      }
    }
    // Run once immediately so a pre-existing disconnect is detected without
    // waiting up to 1 s for the first tick.
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  // If the socket reconnects while we're showing the banner, the next tick
  // will hide it. But to feel snappy, also hide immediately on the
  // connected→true transition.
  useEffect(() => {
    if (connected) {
      sinceRef.current = null
      visibleRef.current = false
      setDisconnectSince(null)
      setShowBanner(false)
      setElapsedSec(0)
    }
  }, [connected])

  if (!showBanner || disconnectSince === null) return null

  const escalated = elapsedSec >= 30
  const staleSince = new Date(disconnectSince).toLocaleTimeString('en-GB', { hour12: false })

  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        'sticky top-14 z-30 flex w-full items-center gap-2 border-b px-3 py-2 text-xs sm:px-4 sm:text-sm',
        escalated
          ? 'border-rose-500/40 bg-rose-500/15 text-rose-100'
          : 'border-amber-500/40 bg-amber-500/15 text-amber-100',
      )}
    >
      <span className="flex shrink-0 items-center gap-1.5 font-semibold">
        {escalated ? (
          <AlertTriangle className="h-4 w-4 animate-pulse" aria-hidden="true" />
        ) : (
          <WifiOff className="h-4 w-4" aria-hidden="true" />
        )}
        <span className="hidden sm:inline">
          {escalated ? 'CRITICAL · ' : ''}Live telemetry disconnected
        </span>
        <span className="sm:hidden">{escalated ? 'CRITICAL' : 'Disconnected'}</span>
      </span>
      <span className="hidden text-foreground/80 sm:inline">
        — data shown is stale since {staleSince}.
      </span>
      <span className="ml-auto flex items-center gap-1.5">
        <span className="tnum font-mono font-semibold">{elapsedSec}s</span>
        <RefreshCw className="h-3 w-3 animate-spin" aria-hidden="true" />
        <span className="hidden text-foreground/70 sm:inline">Auto-reconnecting…</span>
        <span className="sm:hidden">reconnecting</span>
      </span>
    </div>
  )
}

'use client'
import { useMemo, useState } from 'react'
import { useRealtime } from '@/lib/indos/realtime'
import { useIndOS } from '@/lib/indos/store'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { AlertOctagon, CheckCheck, X, ArrowRight } from 'lucide-react'

/**
 * Sticky red banner rendered at the very top of the page (above the topbar).
 * Shows whenever there are UNACKNOWLEDGED, ACTIVE, CRITICAL alarms in the live
 * `recentAlarms` stream. The banner does NOT auto-dismiss — operators in a
 * 3am control room cannot rely on a 5 s toast.
 *
 * Buttons:
 *   - [Ack All Critical] — emits ack-alarm for each live critical id, and
 *     defensively POSTs to /api/indos/alarms/bulk-ack (agent PHASE12-C may or
 *     may not have shipped it yet — the call is wrapped in .catch() so it
 *     never throws). Toasts how many live alarms were acked.
 *   - [View Alarms]   — switches to the alarms view (setView('alarms')).
 *   - [×]             — dismisses the banner until the NEXT new critical
 *     alarm arrives (tracks a `dismissedAt` timestamp; only re-shows if a
 *     new critical alarm's `ts` is after `dismissedAt`).
 *
 * The pulsing animation is applied to the icon ONLY (text must stay readable
 * for an operator skimming the screen).
 */
export function CriticalAlarmBanner() {
  const { recentAlarms, ackAlarm } = useRealtime()
  const { setView } = useIndOS()

  // Wall-clock (epoch ms) of the most recent dismiss/ack-all click. A new
  // critical alarm whose `ts` is strictly greater than this re-arms the banner.
  const [dismissedAt, setDismissedAt] = useState<number>(0)

  const criticalActive = useMemo(
    () =>
      recentAlarms.filter(
        (a) => a.severity === 'critical' && a.state === 'active',
      ),
    [recentAlarms],
  )

  // Visible iff at least one live critical alarm is newer than the last
  // dismiss. When a brand-new critical arrives after dismissal, the memo's
  // dependency `criticalActive` changes (new array from new alarm) and
  // `dismissedAt` is compared against its `ts`.
  const visible = useMemo(() => {
    if (criticalActive.length === 0) return false
    return criticalActive.some((a) => new Date(a.ts).getTime() > dismissedAt)
  }, [criticalActive, dismissedAt])

  const latest = criticalActive[0]

  if (!visible || !latest) return null

  const handleAckAll = () => {
    const ids = criticalActive.map((a) => a.id)
    const count = ids.length
    // Always ack the live (in-memory) alarms so the banner disappears
    // immediately even if the DB endpoint isn't shipped yet.
    for (const id of ids) ackAlarm(id)

    // Defensively call the bulk-ack endpoint owned by agent PHASE12-C.
    // If it 404s (endpoint not yet shipped) or the network blips, we still
    // acked the live alarms above. Never throws.
    fetch('/api/indos/alarms/bulk-ack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ severity: 'critical', all: true }),
    })
      .then((r) => {
        if (r.ok) {
          toast.success(`Acknowledged ${count} live critical alarm${count === 1 ? '' : 's'}`, {
            description: 'Bulk ack confirmed by server.',
          })
        } else if (r.status === 404) {
          toast.info(`Acked ${count} live critical alarm${count === 1 ? '' : 's'} (DB alarms will be available shortly)`, {
            description: 'Server bulk-ack endpoint is coming online — live alarms were still acknowledged.',
          })
        } else {
          toast.info(`Acked ${count} live critical alarm${count === 1 ? '' : 's'} (DB alarms will be available shortly)`)
        }
      })
      .catch(() => {
        toast.info(`Acked ${count} live critical alarm${count === 1 ? '' : 's'} (DB alarms will be available shortly)`)
      })

    // Optimistically clear the banner — the alarm-update socket events will
    // arrive in a moment and confirm. The dismiss gate prevents re-show
    // until a NEW critical alarm arrives.
    setDismissedAt(Date.now())
  }

  const handleDismiss = () => setDismissedAt(Date.now())
  const handleViewAlarms = () => setView('alarms')

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="sticky top-0 z-50 flex w-full items-center gap-2 border-b border-rose-500/50 bg-rose-600/95 px-3 py-2 text-xs text-rose-50 shadow-lg sm:px-4 sm:text-sm"
    >
      <AlertOctagon className="h-4 w-4 shrink-0 animate-pulse text-rose-100" aria-hidden="true" />
      <span className="flex shrink-0 items-center gap-2 font-semibold">
        <span className="tnum inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-100 px-1.5 text-[10px] font-bold text-rose-700">
          {criticalActive.length}
        </span>
        <span className="hidden sm:inline">critical alarm{criticalActive.length === 1 ? '' : 's'} active</span>
        <span className="sm:hidden">CRITICAL</span>
      </span>
      <span className="min-w-0 flex-1 truncate text-rose-100/90">
        <span className="hidden md:inline">{latest.message}</span>
        <span className="hidden sm:inline md:hidden">{truncate(latest.message, 48)}</span>
      </span>
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <Button
          size="sm"
          variant="secondary"
          className="h-7 gap-1.5 px-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
          onClick={handleAckAll}
        >
          <CheckCheck className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Ack All Critical</span>
          <span className="sm:hidden">Ack</span>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1.5 px-2.5 text-xs text-rose-50 hover:bg-rose-500/40 hover:text-rose-50"
          onClick={handleViewAlarms}
        >
          <span className="hidden sm:inline">View Alarms</span>
          <ArrowRight className="h-3.5 w-3.5 sm:hidden" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 text-rose-50 hover:bg-rose-500/40 hover:text-rose-50"
          onClick={handleDismiss}
          aria-label="Dismiss critical alarm banner"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

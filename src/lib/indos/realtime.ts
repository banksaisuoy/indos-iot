'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import type { TelemetryPoint, DeviceVital, SystemMetrics, AlarmEvent } from './types'

// Connect to the IndOS telemetry mini-service via the Caddy gateway.
// Path MUST be "/" and the port is passed via XTransformPort query param.
const SOCKET_URL = '/' // relative; caddy forwards based on XTransformPort

// Stale-data threshold: if no telemetry/vitals/system message arrives within
// this window while "connected", the dashboard is showing frozen values.
const STALE_THRESHOLD_MS = 60_000

interface RealtimeState {
  connected: boolean
  telemetry: Record<string, TelemetryPoint> // keyed by deviceId
  vitals: Record<string, DeviceVital>
  system: SystemMetrics | null
  recentAlarms: AlarmEvent[]
  /** Epoch ms of the most recent telemetry/vitals/system message received. */
  lastMessageAt: number
  /**
   * Derived (NOT stored in state): true when the socket reports `connected`
   * but no telemetry/vitals/system message has arrived in the last
   * STALE_THRESHOLD_MS. Recomputed on every hook invocation so consumers that
   * tick (e.g. the topbar clock) see a fresh value.
   */
  isStale: boolean
}

let socket: Socket | null = null
const listeners = new Set<(s: RealtimeState) => void>()

function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      path: '/',
      transports: ['websocket', 'polling'],
      query: { XTransformPort: '3030' } as any,
      reconnection: true,
      reconnectionDelay: 1200,
    })
  }
  return socket
}

export function useRealtime(): RealtimeState & { ackAlarm: (id: string) => void } {
  const [state, setState] = useState<Omit<RealtimeState, 'isStale'>>({
    connected: false,
    telemetry: {},
    vitals: {},
    system: null,
    recentAlarms: [],
    lastMessageAt: Date.now(),
  })
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  const patch = useCallback((p: Partial<Omit<RealtimeState, 'isStale'>>) => {
    const next = { ...stateRef.current, ...p }
    stateRef.current = next
    setState(next)
  }, [])

  useEffect(() => {
    const s = getSocket()

    const onConnect = () => patch({ connected: true, lastMessageAt: Date.now() })
    const onDisconnect = () => patch({ connected: false })

    const onTelemetry = (batch: TelemetryPoint[]) => {
      const t = { ...stateRef.current.telemetry }
      for (const p of batch) t[p.deviceId] = p
      patch({ telemetry: t, lastMessageAt: Date.now() })
    }
    const onVitals = (arr: DeviceVital[]) => {
      const v = { ...stateRef.current.vitals }
      for (const d of arr) v[d.id] = d
      patch({ vitals: v, lastMessageAt: Date.now() })
    }
    const onSystem = (m: SystemMetrics) => patch({ system: m, lastMessageAt: Date.now() })
    const onAlarm = (a: AlarmEvent) => {
      const alarms = [a, ...stateRef.current.recentAlarms].slice(0, 50)
      patch({ recentAlarms: alarms })
    }
    const onAlarmUpdate = (u: { id: string; state: string }) => {
      const alarms = stateRef.current.recentAlarms.map((a) =>
        a.id === u.id ? { ...a, state: u.state as AlarmEvent['state'] } : a
      )
      patch({ recentAlarms: alarms })
    }

    s.on('connect', onConnect)
    s.on('disconnect', onDisconnect)
    s.on('telemetry', onTelemetry)
    s.on('device-vitals', onVitals)
    s.on('system-metrics', onSystem)
    s.on('alarm', onAlarm)
    s.on('alarm-update', onAlarmUpdate)

    return () => {
      s.off('connect', onConnect)
      s.off('disconnect', onDisconnect)
      s.off('telemetry', onTelemetry)
      s.off('device-vitals', onVitals)
      s.off('system-metrics', onSystem)
      s.off('alarm', onAlarm)
      s.off('alarm-update', onAlarmUpdate)
    }
  }, [patch])

  const ackAlarm = useCallback((id: string) => {
    getSocket().emit('ack-alarm', id)
  }, [])

  // Recompute isStale on every render so consumers that tick (e.g. topbar clock)
  // see a fresh value even when no socket event has fired.
  const isStale = state.connected && Date.now() - state.lastMessageAt > STALE_THRESHOLD_MS
  return { ...state, isStale, ackAlarm }
}

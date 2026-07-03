'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import type { TelemetryPoint, DeviceVital, SystemMetrics, AlarmEvent } from './types'

// Connect to the IndOS telemetry mini-service via the Caddy gateway.
// Path MUST be "/" and the port is passed via XTransformPort query param.
const SOCKET_URL = '/' // relative; caddy forwards based on XTransformPort

interface RealtimeState {
  connected: boolean
  telemetry: Record<string, TelemetryPoint> // keyed by deviceId
  vitals: Record<string, DeviceVital>
  system: SystemMetrics | null
  recentAlarms: AlarmEvent[]
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
  const [state, setState] = useState<RealtimeState>({
    connected: false,
    telemetry: {},
    vitals: {},
    system: null,
    recentAlarms: [],
  })
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  const patch = useCallback((p: Partial<RealtimeState>) => {
    const next = { ...stateRef.current, ...p }
    stateRef.current = next
    setState(next)
  }, [])

  useEffect(() => {
    const s = getSocket()

    const onConnect = () => patch({ connected: true })
    const onDisconnect = () => patch({ connected: false })

    const onTelemetry = (batch: TelemetryPoint[]) => {
      const t = { ...stateRef.current.telemetry }
      for (const p of batch) t[p.deviceId] = p
      patch({ telemetry: t })
    }
    const onVitals = (arr: DeviceVital[]) => {
      const v = { ...stateRef.current.vitals }
      for (const d of arr) v[d.id] = d
      patch({ vitals: v })
    }
    const onSystem = (m: SystemMetrics) => patch({ system: m })
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

  return { ...state, ackAlarm }
}

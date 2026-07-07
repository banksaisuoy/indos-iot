'use client'
import { create } from 'zustand'
import type { ViewId } from './types'

interface IndOSState {
  // navigation
  view: ViewId
  activeProject: string | null
  sidebarCollapsed: boolean
  commandOpen: boolean
  setView: (v: ViewId) => void
  setActiveProject: (p: string | null) => void
  toggleSidebar: () => void
  setCommandOpen: (o: boolean) => void

  // live alarm toast suppression
  lastAlarmTs: number
  bumpAlarm: () => void

  // cross-view prefill — used by devices-view "Send OTA" button to
  // hand the selected device id to ota-view so it can pre-select it
  // in the deploy dialog. Cleared by ota-view on mount after reading.
  prefillDeviceId: string | null
  prefillDeviceName: string | null
  setPrefillDevice: (id: string | null, name?: string | null) => void
}

export const useIndOS = create<IndOSState>((set) => ({
  view: 'dashboard',
  activeProject: null,
  sidebarCollapsed: false,
  commandOpen: false,
  setView: (view) => set({ view }),
  setActiveProject: (activeProject) => set({ activeProject }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setCommandOpen: (commandOpen) => set({ commandOpen }),
  lastAlarmTs: 0,
  bumpAlarm: () => set({ lastAlarmTs: Date.now() }),
  prefillDeviceId: null,
  prefillDeviceName: null,
  setPrefillDevice: (prefillDeviceId, prefillDeviceName = null) =>
    set({ prefillDeviceId, prefillDeviceName }),
}))

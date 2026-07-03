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
}))

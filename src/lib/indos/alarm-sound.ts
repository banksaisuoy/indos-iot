'use client'
/**
 * Operator-safety audible alarm utility.
 *
 * Uses the browser-native Web Audio API — no audio asset files required.
 * A short 3-beep pattern (880 Hz, 120 ms on, 80 ms gap) is played when a
 * critical alarm fires. The AudioContext is created lazily on first call so
 * it complies with the browser autoplay policy (must follow a user gesture —
 * the first alarm after the operator clicks "Sign in" satisfies this).
 *
 * On/off state is persisted per-browser in localStorage so each operator can
 * choose (e.g. a control-room kiosk may enable it; a mobile browser may not).
 */

const STORAGE_KEY = 'indos:alarm-sound-enabled'

/** Returns true unless the operator has explicitly disabled the beep. */
export function isAlarmSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== 'false'
  } catch {
    // localStorage may throw in private mode / sandboxed iframes — default on.
    return true
  }
}

export function setAlarmSoundEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false')
  } catch {
    // no-op — caller's UI state still updates; persistence is best-effort.
  }
}

// Module-singleton AudioContext — created on first playCriticalBeep() call.
let audioCtx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (audioCtx) {
    // Some browsers suspend the context after long idle; resume on use.
    if (audioCtx.state === 'suspended') void audioCtx.resume().catch(() => {})
    return audioCtx
  }
  type AudioCtxCtor = typeof AudioContext
  const Ctor: AudioCtxCtor | undefined =
    (window as unknown as { AudioContext?: AudioCtxCtor; webkitAudioContext?: AudioCtxCtor }).AudioContext ||
    (window as unknown as { webkitAudioContext?: AudioCtxCtor }).webkitAudioContext
  if (!Ctor) return null
  try {
    audioCtx = new Ctor()
  } catch {
    audioCtx = null
  }
  return audioCtx
}

interface BeepOptions {
  freq?: number
  durationMs?: number
  gain?: number
  startAt?: number // seconds, absolute offset from ctx.currentTime
}

function scheduleBeep(ctx: AudioContext, { freq = 880, durationMs = 120, gain = 0.18, startAt = 0 }: BeepOptions) {
  const start = ctx.currentTime + startAt
  const dur = durationMs / 1000
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  // Linear attack/release envelope to avoid clicks.
  g.gain.setValueAtTime(0, start)
  g.gain.linearRampToValueAtTime(gain, start + 0.008)
  g.gain.linearRampToValueAtTime(gain, start + dur - 0.012)
  g.gain.linearRampToValueAtTime(0, start + dur)
  osc.connect(g)
  g.connect(ctx.destination)
  osc.start(start)
  osc.stop(start + dur + 0.01)
}

/**
 * Plays the critical-alarm beep pattern (3 × 880 Hz, 120 ms on, 80 ms gap)
 * if and only if the operator has not disabled alarm sounds. No-op when:
 *   - the operator has turned off the toggle (localStorage flag),
 *   - the browser has no Web Audio API,
 *   - the AudioContext cannot be created/resumed.
 */
export function playCriticalBeep(): void {
  if (!isAlarmSoundEnabled()) return
  const ctx = getCtx()
  if (!ctx) return
  // 3 beeps · 120 ms tone · 80 ms gap ⇒ total 520 ms.
  const beepMs = 120
  const gapMs = 80
  for (let i = 0; i < 3; i++) {
    scheduleBeep(ctx, {
      freq: 880,
      durationMs: beepMs,
      gain: 0.18,
      startAt: (i * (beepMs + gapMs)) / 1000,
    })
  }
}

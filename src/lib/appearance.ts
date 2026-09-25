/** User-facing appearance prefs: accent color, motion level, text size. */

export const ACCENTS = ['#6366f1', '#8b5cf6', '#0ea5e9', '#10b981', '#f59e0b', '#f43f5e']
export type MotionPref = 'on' | 'off'
export type FontPref = 'sm' | 'md' | 'lg'

const K_ACCENT = 'anjam.accent'
const K_MOTION = 'anjam.motion'
const K_FONT = 'anjam.fs'

export function getAccent(): string {
  return localStorage.getItem(K_ACCENT) || ACCENTS[0]
}
export function getMotion(): MotionPref {
  return localStorage.getItem(K_MOTION) === 'off' ? 'off' : 'on'
}
export function getFontPref(): FontPref {
  const v = localStorage.getItem(K_FONT)
  return v === 'sm' || v === 'lg' ? v : 'md'
}

export function applyAccent(hex: string): void {
  localStorage.setItem(K_ACCENT, hex)
  document.documentElement.style.setProperty('--accent', hex)
}
export function applyMotion(m: MotionPref): void {
  if (m === 'off') {
    localStorage.setItem(K_MOTION, 'off')
    document.documentElement.dataset.motion = 'off'
  } else {
    localStorage.removeItem(K_MOTION)
    delete document.documentElement.dataset.motion
  }
}
export function applyFontPref(f: FontPref): void {
  if (f === 'md') {
    localStorage.removeItem(K_FONT)
    delete document.documentElement.dataset.fs
  } else {
    localStorage.setItem(K_FONT, f)
    document.documentElement.dataset.fs = f
  }
}

/** Run once before first render so stored prefs apply with no flash. */
export function applyStoredAppearance(): void {
  const accent = localStorage.getItem(K_ACCENT)
  if (accent) document.documentElement.style.setProperty('--accent', accent)
  if (localStorage.getItem(K_MOTION) === 'off') document.documentElement.dataset.motion = 'off'
  const fs = localStorage.getItem(K_FONT)
  if (fs === 'sm' || fs === 'lg') document.documentElement.dataset.fs = fs
}

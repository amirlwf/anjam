/**
 * User-facing appearance prefs: brand theme, accent, motion, text size.
 *
 * US4 wires the six-brand registry in `themes.ts` into the app. The split is:
 *  - `themes.ts` owns tokens and how they are emitted (pure, unit-testable),
 *  - this module owns *when* they are applied (boot, settings, weather).
 */

import { prefs } from './config'
import {
  applyTheme as applyBrand,
  applyWeatherOverride,
  DEFAULT_THEME,
  isThemeId,
} from './themes'
import { cachedWeather } from './weather'

export type ModePref = 'light' | 'dark' | 'system'

/**
 * The brand actually in force.
 *
 * `variable` is a pseudo-brand (FR-12): it is not one of the six, it is a
 * runtime layer. While it is on, the static skin is left untouched in
 * storage so switching it back off restores the brand you had rather than
 * snapping to the default.
 */
export function effectiveSkin(): string {
  if (prefs.getVariableTheme()) return 'variable'
  const s = prefs.getSkin()
  return isThemeId(s) ? s : DEFAULT_THEME
}

export function getModePref(): ModePref {
  const v = prefs.getTheme()
  return v === 'light' || v === 'dark' ? v : 'system'
}

/** Day/night for the weather layer. WeatherNow carries no isDay, and the
 *  accent really does differ between a clear day and a clear night (FR-12),
 *  so derive it from the local clock rather than guessing from temperature. */
function isDayNow(): boolean {
  const h = new Date().getHours()
  return h >= 6 && h < 18
}

/** Apply brand + mode + the weather layer. Safe to call repeatedly — every
 *  setter below is idempotent, which is what makes it usable from boot,
 *  from the settings picker and from a weather refresh alike. */
export function applyStoredTheme(): void {
  applyBrand(effectiveSkin(), getModePref())
  const w = cachedWeather()
  applyWeatherOverride(w ? { code: w.code, isDay: isDayNow() } : null, prefs.getVariableTheme())
}

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

/**
 * Drop the legacy accent override so the chosen brand can actually be seen.
 *
 * Both controls write `--accent`, and the inline value from `applyStoredAppearance`
 * outranks every stylesheet. So whichever was used last must win — otherwise
 * picking a brand changes nothing on screen, which reads as a broken picker.
 */
export function clearAccent(): void {
  localStorage.removeItem(K_ACCENT)
  document.documentElement.style.removeProperty('--accent')
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
  // Brand first: it redefines the token set everything else reads, so a
  // flash of the default palette would otherwise leak before React mounts.
  applyStoredTheme()
  const accent = localStorage.getItem(K_ACCENT)
  if (accent) document.documentElement.style.setProperty('--accent', accent)
  if (localStorage.getItem(K_MOTION) === 'off') document.documentElement.dataset.motion = 'off'
  const fs = localStorage.getItem(K_FONT)
  if (fs === 'sm' || fs === 'lg') document.documentElement.dataset.fs = fs
}

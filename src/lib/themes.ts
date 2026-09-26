/**
 * v1.4.0 — theme registry (US4, FR-11).
 *
 * Six complete themes, each with a light and a dark token set. The values are
 * the same CSS custom properties the design system already consumes
 * (`src/styles.css` lines 1-35), so a theme is a drop-in redefinition and no
 * component ever reads a colour literal.
 *
 * Compatibility rule that matters: the app already keys its dark mode off
 * `[data-theme='dark']` in ~60 selectors. We therefore keep `data-theme` as
 * the *mode* and introduce a second attribute, `data-brand`, for the *theme*.
 * Existing selectors keep working untouched.
 *
 *   <html data-brand="sunset" data-theme="dark">
 *
 * The `variable` theme (FR-12) is a pseudo-theme: it is not in this list,
 * it is a runtime override layer written by `applyWeatherOverride()`.
 */

export type ThemeMode = 'light' | 'dark'

export interface ThemeTokens {
  bg: string
  surface: string
  surface2: string
  surface3: string
  border: string
  text: string
  muted: string
  accent: string
  danger: string
  ok: string
  warn: string
  radius: string
}

export interface ThemeDefinition {
  id: string
  /** short label, fa first because the product is Persian-first (FR-18) */
  fa: string
  en: string
  /** one of the six accent swatches users already know, for the picker */
  swatch: string
  light: ThemeTokens
  dark: ThemeTokens
}

const shadow = (dark: boolean): string =>
  dark ? '0 12px 34px rgba(0, 0, 0, 0.45)' : '0 10px 30px rgba(15, 17, 23, 0.12)'

const base = (t: ThemeTokens, dark: boolean): string => [
  `--bg:${t.bg}`,
  `--surface:${t.surface}`,
  `--surface2:${t.surface2}`,
  `--surface3:${t.surface3}`,
  `--border:${t.border}`,
  `--text:${t.text}`,
  `--muted:${t.muted}`,
  `--accent:${t.accent}`,
  `--danger:${t.danger}`,
  `--ok:${t.ok}`,
  `--warn:${t.warn}`,
  `--radius:${t.radius}`,
  `--shadow:${shadow(dark)}`
].join(';')

export const THEMES: ThemeDefinition[] = [
  {
    id: 'indigo',
    fa: 'نیلی',
    en: 'Indigo',
    swatch: '#6366f1',
    light: {
      bg: '#f6f7f9', surface: '#ffffff', surface2: '#f0f1f4', surface3: '#e7e9ee',
      border: '#e2e4ea', text: '#17191f', muted: '#6b7280', accent: '#6366f1',
      danger: '#ef4444', ok: '#10b981', warn: '#f59e0b', radius: '10px'
    },
    dark: {
      bg: '#0f1117', surface: '#161923', surface2: '#1d2130', surface3: '#262b3d',
      border: '#262b3b', text: '#e8eaf1', muted: '#8b92a7', accent: '#818cf8',
      danger: '#f87171', ok: '#34d399', warn: '#fbbf24', radius: '10px'
    }
  },
  {
    id: 'graphite',
    fa: 'گرافیت',
    en: 'Graphite',
    swatch: '#64748b',
    light: {
      bg: '#f4f5f6', surface: '#ffffff', surface2: '#eef0f1', surface3: '#e4e6e9',
      border: '#dfe1e5', text: '#15171a', muted: '#69707a', accent: '#475569',
      danger: '#dc2626', ok: '#059669', warn: '#d97706', radius: '8px'
    },
    dark: {
      bg: '#0e0f11', surface: '#17181b', surface2: '#1e2024', surface3: '#26282d',
      border: '#2b2e34', text: '#e9eaec', muted: '#9297a1', accent: '#94a3b8',
      danger: '#f87171', ok: '#34d399', warn: '#fbbf24', radius: '8px'
    }
  },
  {
    id: 'sunset',
    fa: 'غروب',
    en: 'Sunset',
    swatch: '#f97316',
    light: {
      bg: '#faf7f4', surface: '#ffffff', surface2: '#f4efe9', surface3: '#ebe3da',
      border: '#e9e0d5', text: '#1d1712', muted: '#7a6f63', accent: '#ea580c',
      danger: '#e11d48', ok: '#16a34a', warn: '#d97706', radius: '14px'
    },
    dark: {
      bg: '#151009', surface: '#1d1610', surface2: '#251d15', surface3: '#2f251b',
      border: '#392d21', text: '#f4ece3', muted: '#b0a291', accent: '#fb923c',
      danger: '#fb7185', ok: '#4ade80', warn: '#fbbf24', radius: '14px'
    }
  },
  {
    id: 'forest',
    fa: 'جنگل',
    en: 'Forest',
    swatch: '#10b981',
    light: {
      bg: '#f5f8f6', surface: '#ffffff', surface2: '#eef3f0', surface3: '#e2eae5',
      border: '#dfe8e3', text: '#131a16', muted: '#657269', accent: '#059669',
      danger: '#dc2626', ok: '#16a34a', warn: '#ca8a04', radius: '12px'
    },
    dark: {
      bg: '#0b1210', surface: '#111a17', surface2: '#16211d', surface3: '#1c2b26',
      border: '#21322c', text: '#e6f2ec', muted: '#8fa39a', accent: '#34d399',
      danger: '#f87171', ok: '#4ade80', warn: '#facc15', radius: '12px'
    }
  },
  {
    id: 'ocean',
    fa: 'اقیانوس',
    en: 'Ocean',
    swatch: '#0ea5e9',
    light: {
      bg: '#f4f8fb', surface: '#ffffff', surface2: '#eaf2f8', surface3: '#dfebf4',
      border: '#dde8f0', text: '#111a22', muted: '#63768a', accent: '#0284c7',
      danger: '#e11d48', ok: '#0d9488', warn: '#d97706', radius: '12px'
    },
    dark: {
      bg: '#0a1119', surface: '#101a24', surface2: '#15212d', surface3: '#1b2a38',
      border: '#1f3143', text: '#e6eff7', muted: '#8ba0b4', accent: '#38bdf8',
      danger: '#fb7185', ok: '#2dd4bf', warn: '#fbbf24', radius: '12px'
    }
  },
  {
    id: 'rose',
    fa: 'گل رز',
    en: 'Rose',
    swatch: '#f43f5e',
    light: {
      bg: '#fbf6f7', surface: '#ffffff', surface2: '#f6edef', surface3: '#f0e2e6',
      border: '#f0e1e5', text: '#1c1417', muted: '#7b6a70', accent: '#e11d48',
      danger: '#dc2626', ok: '#16a34a', warn: '#d97706', radius: '16px'
    },
    dark: {
      bg: '#150e11', surface: '#1e1417', surface2: '#271a1e', surface3: '#312126',
      border: '#3a262c', text: '#f6e9ed', muted: '#b39aa2', accent: '#fb7185',
      danger: '#f87171', ok: '#4ade80', warn: '#fbbf24', radius: '16px'
    }
  }
]

export const THEME_IDS = THEMES.map(t => t.id)
export const DEFAULT_THEME = 'indigo'

export function themeById(id: string): ThemeDefinition {
  return THEMES.find(t => t.id === id) || THEMES[0]
}

/** Is this one of the six real themes (the variable pseudo-theme is not)? */
export function isThemeId(id: string): boolean {
  return THEME_IDS.includes(id)
}

/* ------------------------------------------------------------------ *
 * CSS emission
 *
 * Written once into a <style> tag as `data-brand` rules, in the exact
 * selector shape the app already uses:
 *
 *   [data-brand='sunset']                                   { ... }
 *   [data-brand='sunset'][data-theme='dark']                { ... }
 *
 * Keeping it in a generated tag (rather than 12 hand-written blocks in
 * styles.css) means a theme edit is a one-line change here, and the static
 * colour audit in scripts/cdp-ux-check.mjs can diff against this file.
 * ------------------------------------------------------------------ */
const STYLE_ID = 'anjam-theme-tokens'

function renderCss(): string {
  const out: string[] = ['/* generated by src/lib/themes.ts — do not edit by hand */']
  for (const t of THEMES) {
    out.push(`[data-brand='${t.id}']{${base(t.light, false)}}`)
    out.push(`[data-brand='${t.id}'][data-theme='dark']{${base(t.dark, true)}}`)
  }
  return out.join('\n')
}

function ensureStyleEl(): HTMLStyleElement {
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = STYLE_ID
    document.head.appendChild(el)
  }
  return el
}

/** Inject the six token sets. Safe to call more than once. */
export function installThemeCss(): void {
  ensureStyleEl().textContent = renderCss()
}

let cssInstalled = false

/**
 * Apply a theme + mode to <html>.
 *
 * `mode === 'system'` resolves through `prefers-color-scheme`, and the theme
 * itself is stored separately so a mode change never loses the brand choice.
 */
export function applyTheme(id: string, mode: ThemeMode | 'system'): void {
  if (!cssInstalled) {
    installThemeCss()
    cssInstalled = true
  }
  const root = document.documentElement
  const theme = isThemeId(id) ? id : DEFAULT_THEME

  root.dataset.brand = theme

  const resolved: ThemeMode =
    mode === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      : mode

  if (resolved === 'dark') root.dataset.theme = 'dark'
  else delete root.dataset.theme

  // let the weather override (FR-12) know which layer sits on top
  root.dataset.brandMode = mode
}

/* ------------------------------------------------------------------ *
 * Weather-reactive variable theme (FR-12)
 *
 * A thin override layer written as `:root` declarations so the six themes
 * below keep their structure and only the accent/selection colours drift.
 * Re-applied on every weather change, with a 400 ms cross-fade on the
 * document element (FR-13 keeps motion to transform/opacity elsewhere; this
 * is the one deliberate colour transition and it honours reduced-motion).
 * ------------------------------------------------------------------ */
const OVERRIDE_ID = 'anjam-weather-theme'
const NO_CROSSFADE = '(prefers-reduced-motion: reduce)'

export interface WeatherHint {
  /** WMO condition code from Open-Meteo (weather.ts `code`) */
  code: number
  isDay: boolean
}

/**
 * Accent per weather family.
 *
 * Day and night genuinely differ (FR-12): a clear day reads warm-green, a
 * clear night reads deep blue rather than the same hue. The light/dark split
 * is handled by CSS (`[data-theme='dark']`); the day/night split is handled
 * here, so the four combinations stay visually distinct.
 */
const WEATHER_ACCENT: {
  test: (c: number) => boolean
  day: { light: string; dark: string }
  night: { light: string; dark: string }
}[] = [
  {
    test: c => c >= 51 && c <= 67,                       // rain / drizzle
    day: { light: '#0284c7', dark: '#38bdf8' },
    night: { light: '#1e40af', dark: '#60a5fa' }
  },
  {
    test: c => c >= 71 && c <= 86,                       // snow / sleet
    day: { light: '#60a5fa', dark: '#93c5fd' },
    night: { light: '#3730a3', dark: '#a5b4fc' }
  },
  {
    test: c => c >= 95,                                   // thunder / hail
    day: { light: '#8b5cf6', dark: '#a78bfa' },
    night: { light: '#6d28d9', dark: '#c4b5fd' }
  },
  {
    test: c => (c >= 45 && c <= 48) || c === 11,          // fog
    day: { light: '#64748b', dark: '#94a3b8' },
    night: { light: '#475569', dark: '#cbd5e1' }
  },
  {
    test: c => c === 5,                                   // overcast
    day: { light: '#f59e0b', dark: '#fbbf24' },
    night: { light: '#b45309', dark: '#fcd34d' }
  },
  {
    test: c => c <= 2,                                    // clear
    day: { light: '#10b981', dark: '#34d399' },
    night: { light: '#4f46e5', dark: '#818cf8' }
  }
]

export function weatherAccent(
  code: number,
  isDay: boolean
): { light: string; dark: string } {
  const hit = WEATHER_ACCENT.find(w => w.test(code)) || WEATHER_ACCENT[WEATHER_ACCENT.length - 1]
  return isDay ? hit.day : hit.night
}

/**
 * Turn the weather-reactive theme on or off. When off the document is left
 * exactly as the static theme set it — the layer is fully removable.
 */
export function applyWeatherOverride(
  hint: WeatherHint | null,
  variableEnabled: boolean
): void {
  const root = document.documentElement
  let el = document.getElementById(OVERRIDE_ID) as HTMLStyleElement | null

  if (!variableEnabled || !hint) {
    el?.remove()
    delete root.dataset.variable
    return
  }

  const { light, dark } = weatherAccent(hint.code, hint.isDay)
  if (!el) {
    el = document.createElement('style')
    el.id = OVERRIDE_ID
    document.head.appendChild(el)
  }
  // This is an OVERRIDE layer, so it has to win over the brand block, whose
  // selector (`:root[data-brand=…][data-theme=…]`) outranks a plain
  // `:root`. Specificity is the reason `!important` is here: without it the
  // weather accent is installed and then silently ignored, which is exactly
  // the bug this layer exists to avoid.
  el.textContent = [
    `:root{--accent:${light} !important}`,
    `[data-theme='dark']{--accent:${dark} !important}`
  ].join('')

  root.dataset.variable = 'on'

  // 400 ms colour cross-fade; skipped when the user turned motion off.
  // `motion` is an attribute, not a custom property — reading it off
  // getComputedStyle can only ever return ''.
  const reduced =
    root.dataset.motion === 'off' || window.matchMedia(NO_CROSSFADE).matches
  if (!reduced) {
    root.style.transition = 'color 400ms var(--ease-out), background-color 400ms var(--ease-out)'
    window.setTimeout(() => { root.style.transition = '' }, 450)
  }
}

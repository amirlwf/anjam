/** Built-in catalog of important days the app can suggest: both the
 *  Gregorian-world and the Islamic/Jalali-world dates (Mother's Day in
 *  each world, Valentine, religious holidays…). Each entry resolves to its
 *  next occurrence so the reminder engine can ring `remind_days` ahead. */
import { toHijri, fromHijri } from './hijri'
import { toJalaali } from './calendar'
import type { ImportantDateRow, Lang } from '../types'

export type OccSys = 'jalali' | 'gregorian' | 'hijri'

export interface Occasion {
  id: string
  fa: string
  en: string
  sys: OccSys
  /** 1..12 in the entry's own system (hijri months are 1..12 too) */
  month: number
  /** Fixed day of month… */
  day?: number
  /** …OR the nth `weekday` of the month (0=Sun..6=Sat, Gregorian only) */
  nth?: number
  weekday?: number
  emoji: string
}

export const CATALOG: Occasion[] = [
  // --- Gregorian world ---
  { id: 'valentine', fa: 'ولنتاین', en: "Valentine's Day", sys: 'gregorian', month: 2, day: 14, emoji: '💘' },
  { id: 'mothers-day-g', fa: 'روز مادر (میلادی)', en: 'Mother\u2019s Day (Gregorian)', sys: 'gregorian', month: 5, nth: 2, weekday: 0, emoji: '🌷' },
  { id: 'womens-day', fa: 'روز جهانی زن', en: 'International Women\u2019s Day', sys: 'gregorian', month: 3, day: 8, emoji: '🌸' },
  { id: 'fathers-day-g', fa: 'روز پدر (میلادی)', en: 'Father\u2019s Day (Gregorian)', sys: 'gregorian', month: 6, nth: 3, weekday: 0, emoji: '👔' },
  { id: 'christmas', fa: 'کریسمس', en: 'Christmas', sys: 'gregorian', month: 12, day: 25, emoji: '🎄' },
  { id: 'new-year-g', fa: 'سال نو میلادی', en: 'New Year', sys: 'gregorian', month: 1, day: 1, emoji: '🎆' },
  // --- Islamic world (tabular hijri; ±1–2 days from moon sighting) ---
  { id: 'mothers-day-i', fa: 'روز مادر (اسلامی)', en: 'Mother\u2019s Day (Islamic)', sys: 'hijri', month: 9, day: 21, emoji: '🕌' },
  { id: 'eid-fitr', fa: 'عید فطر', en: 'Eid al-Fitr', sys: 'hijri', month: 10, day: 1, emoji: '🌙' },
  { id: 'eid-adha', fa: 'عید قربان', en: 'Eid al-Adha', sys: 'hijri', month: 12, day: 10, emoji: '🐐' },
  { id: 'mawlid', fa: 'میلاد پیامبر ﷺ', en: 'Mawlid al-Nabi ﷺ', sys: 'hijri', month: 3, day: 12, emoji: '📿' },
  { id: 'ashura', fa: 'عاشورا', en: 'Ashura', sys: 'hijri', month: 1, day: 10, emoji: '🖤' },
  // --- Jalali world ---
  { id: 'nowruz', fa: 'نوروز', en: 'Nowruz', sys: 'jalali', month: 1, day: 1, emoji: '🌱' },
  { id: 'sizdah', fa: 'سیزده‌به‌در', en: 'Sizdah Bedar', sys: 'jalali', month: 1, day: 13, emoji: '🌿' },
  { id: 'yalda', fa: 'شب یلدا', en: 'Yalda Night', sys: 'jalali', month: 9, day: 30, emoji: '🍉' },
]

function daysInGregMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate()
}

/** Next occurrence of a fixed (month, day) in the Gregorian calendar. */
function nextGregFixed(month: number, day: number, from: Date): Date {
  const y0 = from.getFullYear()
  for (const y of [y0, y0 + 1]) {
    const d = new Date(y, month - 1, Math.min(day, daysInGregMonth(y, month)))
    if (d.getTime() + 86_400_000 > from.getTime()) return d
  }
  return new Date(y0 + 1, month - 1, day)
}

/** Next occurrence of the nth weekday of a month (e.g. 2nd Sunday of May). */
function nextGregNth(month: number, nth: number, weekday: number, from: Date): Date {
  const y0 = from.getFullYear()
  for (const y of [y0, y0 + 1]) {
    const first = new Date(y, month - 1, 1)
    const day = 1 + ((weekday - first.getDay() + 7) % 7) + (nth - 1) * 7
    if (day > daysInGregMonth(y, month)) continue
    const d = new Date(y, month - 1, day)
    if (d.getTime() + 86_400_000 > from.getTime()) return d
  }
  return nextGregNth(month, nth, weekday, new Date(y0 + 1, 0, 1))
}

/** Next occurrence of a fixed Jalali (month, day): probe upcoming days —
 *  jalali months are ≤31 days, so a fixed (m,d) always occurs within a year. */
function nextJalaliFixed(month: number, day: number, from: Date): Date {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  for (let i = 0; i < 800; i++) {
    const d = new Date(start.getTime() + i * 86_400_000)
    const j = toJalaali(d.getFullYear(), d.getMonth() + 1, d.getDate())
    if (j.jm === month && j.jd === day) return d
  }
  return from
}

/** Next occurrence of a fixed Hijri (month, day) via the tabular calendar. */
function nextHijriFixed(month: number, day: number, from: Date): Date {
  const h = toHijri(from)
  for (const hy of [h.hy, h.hy + 1, h.hy + 2]) {
    const d = fromHijri(hy, month, day)
    if (d.getTime() + 86_400_000 > from.getTime()) return d
  }
  return from
}

/** Next occurrence (local midnight) of a catalog entry, strictly ahead of `from`. */
export function occNext(o: Occasion, from: Date = new Date()): Date {
  if (o.sys === 'gregorian') {
    return o.nth && o.weekday !== undefined
      ? nextGregNth(o.month, o.nth, o.weekday, from)
      : nextGregFixed(o.month, o.day ?? 1, from)
  }
  if (o.sys === 'jalali') return nextJalaliFixed(o.month, o.day ?? 1, from)
  return nextHijriFixed(o.month, o.day ?? 1, from)
}

/** Next yearly occurrence of a *user* important date. Rows seeded from the
 *  catalog keep following the catalog rule (so "2nd Sunday of May" stays
 *  exact); everything else uses its stored (system, month, day). */
export function rowNext(r: ImportantDateRow, from: Date = new Date()): Date {
  if (r.source) {
    const o = CATALOG.find((x) => x.id === r.source)
    if (o) return occNext(o, from)
  }
  if (r.system === 'hijri') return nextHijriFixed(r.month, r.day, from)
  if (r.system === 'gregorian') return nextGregFixed(r.month, r.day, from)
  return nextJalaliFixed(r.month, r.day, from)
}

/** Days from today until `d` (0 = the date lands today). */
export function daysUntil(d: Date, now: Date = new Date()): number {
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  return Math.round((b - a) / 86_400_000)
}

/** Show a Date in a calendar system: 'سپتامبر ۲۰۲۶' style via month names in i18n. */
export function formatIn(d: Date, sys: 'jalali' | 'gregorian', lang: Lang): string {
  const monthsFaG = ['ژانویه', 'فوریه', 'مارس', 'آوریل', 'مه', 'ژوئن', 'ژوئیه', 'اوت', 'سپتامبر', 'اکتبر', 'نوامبر', 'دسامبر']
  const monthsEnG = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const monthsFaJ = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند']
  const monthsEnJ = ['Farvardin', 'Ordibehesht', 'Khordad', 'Tir', 'Mordad', 'Shahrivar', 'Mehr', 'Aban', 'Azar', 'Dey', 'Bahman', 'Esfand']
  if (sys === 'jalali') {
    const j = toJalaali(d.getFullYear(), d.getMonth() + 1, d.getDate())
    const name = lang === 'fa' ? monthsFaJ[j.jm - 1] : monthsEnJ[j.jm - 1]
    return lang === 'fa' ? `${j.jd} ${name} ${j.jy}` : `${name} ${j.jd}, ${j.jy}`
  }
  const name = lang === 'fa' ? monthsFaG[d.getMonth()] : monthsEnG[d.getMonth()]
  return lang === 'fa' ? `${d.getDate()} ${name} ${d.getFullYear()}` : `${name} ${d.getDate()}, ${d.getFullYear()}`
}

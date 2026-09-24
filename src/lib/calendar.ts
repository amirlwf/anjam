/** Jalali (Solar Hijri) <-> Gregorian conversion + calendar preferences.
 *  Algorithm ported from jalaali-js (MIT). All month/day math is local-time. */

import { isLeapJalaaliYear, jalaaliMonthLength, toGregorian as j2g, toJalaali as g2j } from 'jalaali-js'

export type CalSys = 'jalali' | 'gregorian'

const CAL_KEY = 'anjam.cal'

export function getCalPref(): CalSys {
  try {
    const v = localStorage.getItem(CAL_KEY)
    if (v === 'jalali' || v === 'gregorian') return v
  } catch { /* ignore */ }
  return 'jalali'
}

export function setCalPref(sys: CalSys): void {
  try { localStorage.setItem(CAL_KEY, sys) } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent('anjam:cal-changed'))
}

export const JAL_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
]
export const JAL_MONTHS_EN = [
  'Farvardin', 'Ordibehesht', 'Khordad', 'Tir', 'Mordad', 'Shahrivar',
  'Mehr', 'Aban', 'Azar', 'Dey', 'Bahman', 'Esfand',
]
const GREG_MONTHS_FA = ['ژانویه', 'فوریه', 'مارس', 'آوریل', 'مه', 'ژوئن', 'ژوئیه', 'اوت', 'سپتامبر', 'اکتبر', 'نوامبر', 'دسامبر']
const GREG_MONTHS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function faDig(s: string | number): string {
  return String(s).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])
}

export function jalLeap(jy: number): boolean {
  return isLeapJalaaliYear(jy)
}

export function toJalaali(gy: number, gm: number, gd: number): { jy: number; jm: number; jd: number } {
  return g2j(gy, gm, gd)
}

export function toGregorian(jy: number, jm: number, jd: number): { gy: number; gm: number; gd: number } {
  return j2g(jy, jm, jd)
}

export function jalDaysInMonth(jy: number, jm: number): number {
  return jalaaliMonthLength(jy, jm)
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function iso(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`
}

export type DayCell = {
  /** Gregorian local date, YYYY-MM-DD (storage format). */
  iso: string
  day: number
  /** Is this day outside the displayed month? */
  faded: boolean
  isToday: boolean
}

export function todayParts(sys: CalSys): { y: number; m: number; d: number } {
  const n = new Date()
  if (sys === 'jalali') {
    const j = toJalaali(n.getFullYear(), n.getMonth() + 1, n.getDate())
    return { y: j.jy, m: j.jm, d: j.jd }
  }
  return { y: n.getFullYear(), m: n.getMonth() + 1, d: n.getDate() }
}

export function monthTitle(sys: CalSys, y: number, m: number, lang: string): string {
  if (sys === 'jalali') {
    const name = lang === 'fa' ? JAL_MONTHS[m - 1] : JAL_MONTHS_EN[m - 1]
    return `${name} ${lang === 'fa' ? faDig(y) : y}`
  }
  const gName = lang === 'fa' ? GREG_MONTHS_FA[m - 1] : GREG_MONTHS_EN[m - 1]
  return `${gName} ${lang === 'fa' ? faDig(y) : y}`
}

/** Weekday headers, aligned with the week start of each system. */
export function weekdayHeaders(sys: CalSys, lang: string): string[] {
  const faShort = ['ی', 'د', 'س', 'چ', 'پ', 'ج', 'ش']
  const enShort = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
  // Jalali week starts Saturday (index 6), Gregorian starts Sunday (0).
  if (sys === 'jalali') {
    // Date(2024,0,7)=Sunday -> getDay()=0 ... build from a Saturday
    const sat = new Date(2024, 0, 6).getDay() // Saturday
    const out: string[] = []
    for (let i = 0; i < 7; i++) {
      const idx = (sat + i) % 7
      out.push(lang === 'fa' ? faShort[idx] : enShort[idx])
    }
    return out
  }
  return lang === 'fa' ? faShort : enShort
}

/** 6x7 (42) cells for the given month of the chosen system. */
export function monthCells(sys: CalSys, y: number, m: number): DayCell[] {
  const t = todayParts(sys)
  let days: number
  if (sys === 'jalali') {
    days = jalDaysInMonth(y, m)
  } else {
    days = new Date(y, m, 0).getDate()
  }
  const gFirst = sys === 'jalali' ? toGregorian(y, m, 1) : { gy: y, gm: m, gd: 1 }
  const firstDate = new Date(gFirst.gy, gFirst.gm - 1, gFirst.gd)
  const weekStart = sys === 'jalali' ? 6 : 0
  const lead = (firstDate.getDay() - weekStart + 7) % 7

  const cells: DayCell[] = []
  // leading days from previous month
  for (let i = lead; i > 0; i--) {
    const prev = new Date(firstDate)
    prev.setDate(prev.getDate() - i)
    cells.push(cellOf(sys, prev, y, m, t))
  }
  for (let d = 1; d <= days; d++) {
    const gd = sys === 'jalali' ? toGregorian(y, m, d) : { gy: y, gm: m, gd: d }
    const date = new Date(gd.gy, gd.gm - 1, gd.gd)
    cells.push(cellOf(sys, date, y, m, t))
  }
  while (cells.length < 42) {
    const base = new Date(gFirst.gy, gFirst.gm - 1, gFirst.gd)
    base.setDate(base.getDate() + (cells.length - lead))
    cells.push(cellOf(sys, base, y, m, t))
  }
  return cells.slice(0, 42)

  function cellOf(s: CalSys, date: Date, _y: number, _m: number, today: { y: number; m: number; d: number }): DayCell {
    let dayNum: number
    if (s === 'jalali') {
      const j = toJalaali(date.getFullYear(), date.getMonth() + 1, date.getDate())
      dayNum = j.jd
    } else {
      dayNum = date.getDate()
    }
    const inMonth =
      s === 'jalali'
        ? (() => { const j = toJalaali(date.getFullYear(), date.getMonth() + 1, date.getDate()); return j.jy === _y && j.jm === _m })()
        : date.getFullYear() === _y && date.getMonth() + 1 === _m
    const isoStr = iso(date.getFullYear(), date.getMonth() + 1, date.getDate())
    const todayIso = s === 'jalali'
      ? (() => { const g = toGregorian(today.y, today.m, today.d); return iso(g.gy, g.gm, g.gd) })()
      : iso(today.y, today.m, today.d)
    return { iso: isoStr, day: dayNum, faded: !inMonth, isToday: isoStr === todayIso }
  }
}

/** Parse YYYY-MM-DD (Gregorian) into the display parts of a system. */
export function isoToParts(sys: CalSys, isoStr: string): { y: number; m: number; d: number } | null {
  if (!isoStr) return null
  const [y, m, d] = isoStr.split('-').map((x) => parseInt(x, 10))
  if (!y || !m || !d) return null
  if (sys === 'jalali') {
    const j = toJalaali(y, m, d)
    return { y: j.jy, m: j.jm, d: j.jd }
  }
  return { y, m, d }
}

/** Format a Gregorian ISO date in the given system + language. */
export function formatIso(isoStr: string, sys: CalSys, lang: string): string {
  const p = isoToParts(sys, isoStr)
  if (!p) return ''
  if (sys === 'jalali') {
    const name = lang === 'fa' ? JAL_MONTHS[p.m - 1] : JAL_MONTHS_EN[p.m - 1]
    return lang === 'fa' ? `${faDig(p.d)} ${name} ${faDig(p.y)}` : `${p.d} ${name} ${p.y}`
  }
  const name = GREG_MONTHS_EN[p.m - 1]
  return lang === 'fa' ? `${faDig(p.d)} ${name} ${faDig(p.y)}` : `${name} ${p.d}, ${p.y}`
}

/** The "other" system's label for a given ISO date (dual display). */
export function dualLabel(isoStr: string, sys: CalSys): string {
  if (!isoStr) return ''
  if (sys === 'jalali') {
    return formatIso(isoStr, 'gregorian', 'en')
  }
  return formatIso(isoStr, 'jalali', 'fa')
}

export function shiftMonth(sys: CalSys, y: number, m: number, delta: number): { y: number; m: number } {
  let ny = y
  let nm = m + delta
  if (nm < 1) { nm = 12; ny -= 1 }
  if (nm > 12) { nm = 1; ny += 1 }
  return { y: ny, m: nm }
}

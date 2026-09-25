/** Tabular (civil) Islamic calendar — the classic Kuwaiti algorithm.
 *
 *  Astronomy-free, so it can drift ±1–2 days from a moon-sighting
 *  announcement (Umm al-Qura). For a reminder that fires 10 days ahead
 *  that is well inside tolerance, and it works for every year with no
 *  baked-in tables.
 */
export interface HijriDate {
  hy: number // hijri year
  hm: number // 1..12
  hd: number // day of month
}

function gregToJd(y: number, m: number, d: number): number {
  const a = Math.floor((m - 14) / 12)
  const yy = y + 4800 - a
  const mm = m - 1 + 12 * a
  return (
    Math.floor(365.25 * (yy + 4716)) +
    Math.floor(30.6001 * (mm + 1)) +
    d -
    1524.5
  )
}

function jdToGreg(jd: number): { y: number; m: number; d: number } {
  const l = Math.floor(jd) + 68569
  const n = Math.floor((4 * l) / 146097)
  let ll = l - Math.floor((146097 * n + 3) / 4)
  const i = Math.floor((4000 * (ll + 1)) / 1461001)
  ll = ll - Math.floor((1461 * i) / 4) + 31
  const j = Math.floor((80 * ll) / 2447)
  const d = ll - Math.floor((2447 * j) / 80)
  ll = Math.floor(j / 11)
  const m = j + 2 - 12 * ll
  const y = 100 * (n - 49) + i + ll
  return { y, m, d }
}

export function toHijri(date: Date): HijriDate {
  // Walk the verified inverse instead of transcribing the forward Kuwaiti
  // formula — cheap (~60 iterations) and guaranteed round-trip-consistent.
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  let hy = 1400
  while (fromHijri(hy + 1, 1, 1).getTime() <= day) hy++
  let hm = 1
  while (hm < 12 && fromHijri(hy, hm + 1, 1).getTime() <= day) hm++
  const hd = Math.floor((day - fromHijri(hy, hm, 1).getTime()) / 86_400_000) + 1
  return { hy, hm, hd }
}

/** Civil-epoch inverse of the algorithm above. */
export function fromHijri(hy: number, hm: number, hd: number): Date {
  const jd =
    Math.floor((11 * hy + 3) / 30) +
    354 * hy +
    30 * hm -
    Math.floor((hm - 1) / 2) +
    hd +
    1948440 -
    385
  const g = jdToGreg(jd)
  return new Date(g.y, g.m - 1, g.d)
}

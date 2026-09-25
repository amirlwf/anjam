export function uuid(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  } catch {}
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export const nowISO = (): string => new Date().toISOString()

export function tsOf(s: string | null | undefined): number {
  if (!s) return 0
  const v = Date.parse(s)
  return Number.isNaN(v) ? 0 : v
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let h: ReturnType<typeof setTimeout> | null = null
  return (...args: A) => {
    if (h) clearTimeout(h)
    h = setTimeout(() => fn(...args), ms)
  }
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** Local calendar day as YYYY-MM-DD (the habit-log storage format). */
export function localDate(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

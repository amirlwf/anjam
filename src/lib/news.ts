/**
 * School-closure news, US6 (FR-17 / FR-19).
 *
 * Everything in this file is derived from the measurements in
 * `specs/001-v140-quality-parity/research.md` §6 — 37 live curl calls, not
 * from assumptions about which news sites allow a browser to read them.
 *
 * The design consequence of those measurements is unusual enough to state
 * up front: **silence is the default**. A 21:00 popup is intrusive, so a
 * popup may only appear when there is a real closure signal for the user's
 * own region. A fetch failure, an empty feed, a `status != "ok"`, a stale
 * headline or a different province must all produce nothing at all — never
 * an error toast, never "we could not reach the news".
 */

export interface NewsItem {
  title: string
  link: string
  /** ISO-8601 if the feed gave one; '' when unknown (then it is dropped). */
  pubDate: string
  source: string
}

/** Bing News RSS via rss2json. Verified: 45/45, ACAO `*`, real Persian
 *  headlines. rss2json's free tier is keyless but caps at 10 items. */
const RSS2JSON = 'https://api.rss2json.com/v1/api.json?rss_url='

/** Direct CORS-open Iranian feeds — used only when rss2json fails. */
export const FALLBACK_FEEDS: { url: string; source: string }[] = [
  { url: 'https://borna.news/fa/rss/allnews', source: 'borna.news' },
  { url: 'https://www.entekhab.ir/fa/rss/allnews', source: 'entekhab.ir' },
  { url: 'https://www.asriran.com/fa/rss/allnews', source: 'asriran.com' },
]

/** The four queries research.md §6.3 verified as non-empty. */
export const QUERIES = [
  'تعطیلی مدارس البرز',
  'تعطیلی مدارس ساوجبلاغ',
  'تعطیلی مدارس هشتگرد',
  'بارش برف مدارس البرز',
]

/** A title counts as a closure signal with >=2 of these. `مدارس` is here on
 *  purpose: alone it is not a signal (2 hits required), but together with a
 *  closure word it is exactly what a closure headline looks like. */
const CLOSURE_TERMS = [
  'تعطیلی',
  'تعطیل',
  'غیرحضوری',
  'دوشیفت',
  'لغو',
  'نیمه‌تعطیل',
  'مدارس',
  'مدرسه',
  'برف',
  'بارش',
  'کولاک',
  'سرما',
]

/** ...and >=1 of these, so a national headline cannot alert a local phone. */
const LOCALITY_TERMS: Record<string, string[]> = {
  alborz: ['البرز', 'کرج', 'اشتهارد', 'طالقان', 'نظرآباد', 'چهارباغ', 'محمدشهر', 'ملارد', 'فردیس'],
  sajj: ['ساوجبلاغ', 'هشتگرد', 'کوهسار', 'هیر', 'قریشان'],
}

/** Words that turn a closure headline into its opposite. A gate that only
 *  counts positive keywords would fire on "مدارس البرز تعطیل نیست". */
const NEGATION_TERMS = [
  'تعطیل نیست',
  'تعطیل نشد',
  'بازگشایی',
  'باز شد',
  'آغاز سال تحصیلی',
  'سال تحصیلی جدید',
  'مراسم',
  'کلنگ',
  'افتتاح',
  'ثبت‌نام',
]

const norm = (s: string): string =>
  s
    .replace(/[يئ]/g, 'ی')
    .replace(/[ك]/g, 'ک')
    .replace(/‌/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const countHits = (text: string, terms: string[]): number =>
  terms.reduce((n, term) => (text.includes(term) ? n + 1 : n), 0)

/**
 * Which locality words apply to this user.
 *
 * The region is whatever city they already picked for the weather (D2) —
 * there is no second location to configure. A settings override wins.
 * `تهران` deliberately maps to nothing here: an Alborz closure is not a
 * Tehran closure, and T049 asserts exactly that.
 */
export function regionTerms(region: string): string[] {
  const r = norm(region || '')
  if (!r) return []
  const out = new Set<string>([r])
  // The region belongs to whichever group names it — so 'کرج' picks up the
  // whole Alborz vocabulary (it is in that list), 'هشتگرد' picks up the
  // Sabzevar/Hashtgerd list plus the province, and 'تهران' picks up nothing.
  for (const terms of Object.values(LOCALITY_TERMS)) {
    if (!terms.some((t) => r.includes(t))) continue
    out.add('البرز')
    for (const t of terms) out.add(t)
  }
  return [...out].filter(Boolean)
}

/** Does this headline describe a closure in THIS user's region? */
export function isClosureSignal(title: string, region: string): boolean {
  const t = norm(title)
  if (!t) return false
  if (countHits(t, NEGATION_TERMS) > 0) return false
  if (countHits(t, CLOSURE_TERMS) < 2) return false
  const locality = regionTerms(region)
  if (locality.length === 0) return false
  return countHits(t, locality) >= 1
}

/** Headlines mutate as a story develops, so dedupe on a normalised title. */
export function dedupeTitles(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>()
  const out: NewsItem[] = []
  for (const it of items) {
    const k = norm(it.title).slice(0, 60)
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(it)
  }
  return out
}

/** <= 24 h old. A missing date is not "fresh" — it is unknown, and an
 *  unknown-age headline must not wake anyone up. */
export function isFresh(pubDate: string, nowMs: number): boolean {
  const t = Date.parse(pubDate)
  if (!Number.isFinite(t)) return false
  return nowMs - t >= 0 && nowMs - t <= 24 * 60 * 60 * 1000
}

/**
 * The whole gate in one place: fresh, local, un-negated, closure-shaped.
 * Returns the headline to show, or null — and null means **silent**.
 */
export function pickAlert(items: NewsItem[], region: string, nowMs: number): NewsItem | null {
  for (const it of dedupeTitles(items)) {
    if (!isFresh(it.pubDate, nowMs)) continue
    if (!isClosureSignal(it.title, region)) continue
    return it
  }
  return null
}

/** rss2json wrapping Bing News RSS, percent-encoded exactly as §6.3. */
export function rss2jsonUrl(query: string): string {
  const bing = `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=RSS&count=20`
  return `${RSS2JSON}${encodeURIComponent(bing)}`
}

interface Rss2Json {
  status?: string
  items?: { title?: string; link?: string; pubDate?: string }[]
}

interface RawFeed {
  title?: string
  link?: string
  pubDate?: string
}

function fromRss2Json(data: Rss2Json, source: string): NewsItem[] {
  if (!data || data.status !== 'ok' || !Array.isArray(data.items)) return []
  return data.items
    .filter((x) => x && typeof x.title === 'string' && x.title.length > 0)
    .map((x) => ({
      title: String(x.title),
      link: typeof x.link === 'string' ? x.link : '',
      pubDate: typeof x.pubDate === 'string' ? x.pubDate : '',
      source,
    }))
}

function fromAtom(xml: string, source: string): NewsItem[] {
  const out: NewsItem[] = []
  const re = /<(?:item|entry)[\s\S]*?<\/(?:item|entry)>/g
  const blocks = xml.match(re) || []
  for (const b of blocks.slice(0, 25)) {
    const grab = (tag: string): string => {
      const m = b.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`))
      return m ? m[1].trim() : ''
    }
    const title = grab('title')
    if (!title) continue
    const pub = grab('pubDate') || grab('published') || grab('updated')
    const link = (b.match(/<link[^>]*href="([^"]+)"/) || b.match(/<link[^>]*>([^<]+)<\/link>/) || [])[1] || ''
    out.push({ title, link: String(link).trim(), pubDate: pub, source })
  }
  return out
}

type Fetcher = (url: string) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>

const defaultFetcher: Fetcher = (url) => fetch(url, { signal: AbortSignal.timeout(8000) })

/** One request, never throwing — a news failure is not an app failure. */
async function grab(url: string, source: string, parse: 'json' | 'xml', f: Fetcher): Promise<NewsItem[]> {
  try {
    const res = await f(url)
    if (!res || !res.ok) return []
    const body = await res.text()
    if (!body) return []
    if (parse === 'json') return fromRss2Json(JSON.parse(body) as Rss2Json, source)
    return fromAtom(body, source)
  } catch {
    return []
  }
}

/**
 * Fetch the candidate headlines for a region, in the order research.md
 * mandates: rss2json-over-Bing first (4 queries), then the direct CORS-open
 * feeds, then nothing. Any total failure returns `[]`, and `[]` propagates
 * all the way to a silent night.
 */
export async function fetchCandidates(region: string, f: Fetcher = defaultFetcher): Promise<NewsItem[]> {
  const primary = await Promise.all(QUERIES.map((q) => grab(rss2jsonUrl(q), 'bing.com', 'json', f)))
  const merged = dedupeTitles(primary.flat())
  if (merged.length > 0) return merged

  const fallback = await Promise.all(FALLBACK_FEEDS.map((s) => grab(s.url, s.source, 'xml', f)))
  return dedupeTitles(fallback.flat())
}

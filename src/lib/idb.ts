export type StoreName = 'tasks' | 'lists' | 'labels' | 'habits' | 'important_dates' | 'outbox' | 'meta'

const DB_NAME = 'anjam'
const DB_VERSION = 3

let dbp: Promise<IDBDatabase> | null = null

export function openDB(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        for (const s of ['tasks', 'lists', 'labels', 'habits', 'important_dates'] as const) {
          if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'key' })
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'k' })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbp
}

function run<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode)
        const req = fn(tx.objectStore(store)
        )
        req.onsuccess = () => resolve(req.result as T)
        req.onerror = () => reject(req.error)
      })
  )
}

export const idbGetAll = <T>(store: StoreName): Promise<T[]> => run<T[]>(store, 'readonly', (s) => s.getAll())
export const idbGet = <T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> =>
  run<T | undefined>(store, 'readonly', (s) => s.get(key))
export const idbPut = (store: StoreName, value: unknown): Promise<IDBValidKey> =>
  run(store, 'readwrite', (s) => s.put(value as never))
export const idbDelete = (store: StoreName, key: IDBValidKey): Promise<undefined> =>
  run(store, 'readwrite', (s) => s.delete(key))
export const idbClear = (store: StoreName): Promise<undefined> => run(store, 'readwrite', (s) => s.clear())
export const idbCount = (store: StoreName): Promise<number> => run<number>(store, 'readonly', (s) => s.count())

export async function idbPutMany(store: StoreName, values: unknown[]): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    const os = tx.objectStore(store)
    for (const v of values) os.put(v as never)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function metaGet(k: string): Promise<string | null> {
  const row = await idbGet<{ k: string; v: unknown }>('meta', k)
  return typeof row?.v === 'string' ? row.v : null
}
export const metaSet = (k: string, v: string): Promise<IDBValidKey> => idbPut('meta', { k, v })

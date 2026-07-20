import type { BulkHistoryMeta, BulkResultRecord } from '~/types/bulk'

// 일괄 조회 결과 이력 — 브라우저 IndexedDB 저장 (서버 저장 없음)
const DB_NAME = 'dtent-link'
const STORE = 'bulk-results'
const MAX_ITEMS = 20

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function txRequest<T>(fn: (store: IDBObjectStore) => IDBRequest<T>, mode: IDBTransactionMode): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(db.transaction(STORE, mode).objectStore(STORE))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      }),
  )
}

export function useBulkHistory() {
  const items = useState<BulkHistoryMeta[]>('bulk-history', () => [])

  async function refresh() {
    if (!import.meta.client) return
    const all = await txRequest<BulkResultRecord[]>((s) => s.getAll(), 'readonly')
    items.value = all
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(({ rows: _rows, ...meta }) => meta)
  }

  async function save(record: BulkResultRecord) {
    await txRequest((s) => s.put(record), 'readwrite')
    await refresh()
    // 오래된 항목 정리 (최근 MAX_ITEMS개 유지)
    for (const old of items.value.slice(MAX_ITEMS)) {
      await txRequest((s) => s.delete(old.id), 'readwrite')
    }
    if (items.value.length > MAX_ITEMS) await refresh()
  }

  function get(id: string): Promise<BulkResultRecord | undefined> {
    return txRequest<BulkResultRecord | undefined>((s) => s.get(id), 'readonly')
  }

  async function remove(id: string) {
    await txRequest((s) => s.delete(id), 'readwrite')
    await refresh()
  }

  return { items, refresh, save, get, remove }
}

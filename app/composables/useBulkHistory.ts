import type { BulkHistoryMeta, BulkResultRecord } from '~/types/bulk'

// 일괄 조회 결과 이력 — 브라우저 IndexedDB 저장 (서버 저장 없음)
const DB_NAME = 'dtent-link'
const STORE = 'bulk-results'
// 이력 1건에 최대 5,000행 + 원본 JSON까지 담기므로 저장소 초과 방지를 위해 최근 N건만 유지
const HISTORY_LIMIT = 20

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

function txRequest<T>(
  fn: (store: IDBObjectStore) => IDBRequest<T>,
  mode: IDBTransactionMode,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode)
        // 트랜잭션 종료 시 커넥션을 닫는다 — 추후 DB 버전 업그레이드 시 blocked 방지
        tx.oncomplete = () => db.close()
        tx.onabort = () => db.close()
        const req = fn(tx.objectStore(STORE))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      }),
  )
}

export function useBulkHistory() {
  const items = useState<BulkHistoryMeta[]>('bulk-history', () => [])

  async function refresh() {
    if (!import.meta.client) return
    try {
      const all = await txRequest<BulkResultRecord[]>((s) => s.getAll(), 'readonly')
      items.value = all
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(({ rows: _rows, ...meta }) => meta)
    } catch (e) {
      // IndexedDB 차단(프라이빗 모드 등)·손상 시 이력만 비운 채 앱 동작은 유지
      console.warn('일괄 이력 조회 실패:', e)
    }
  }

  async function save(record: BulkResultRecord) {
    await txRequest((s) => s.put(record), 'readwrite')
    const all = await txRequest<BulkResultRecord[]>((s) => s.getAll(), 'readonly')
    const excess = all.sort((a, b) => b.createdAt - a.createdAt).slice(HISTORY_LIMIT)
    for (const old of excess) {
      await txRequest((s) => s.delete(old.id), 'readwrite')
    }
    await refresh()
  }

  async function get(id: string): Promise<BulkResultRecord | undefined> {
    try {
      return await txRequest<BulkResultRecord | undefined>((s) => s.get(id), 'readonly')
    } catch (e) {
      // 호출부는 undefined를 "불러오지 못함"으로 안내한다
      console.warn('일괄 이력 조회 실패:', e)
      return undefined
    }
  }

  async function remove(id: string) {
    await txRequest((s) => s.delete(id), 'readwrite')
    await refresh()
  }

  return { items, refresh, save, get, remove }
}

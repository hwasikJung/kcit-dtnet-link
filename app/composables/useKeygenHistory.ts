// 메뉴 '키 생성' 최근 생성 이력 — localStorage 저장 (입력 주소·생성된 키 요약만, 원본 응답은 저장하지 않음)
const KEY = 'dtent-link:keygen-history'
const LIMIT = 10

export interface KeygenHistoryItem {
  id: string
  ts: number
  /** 입력한 주소 */
  addr: string
  /** 총괄표제부 PK — 없으면 빈 문자열 */
  upperPk: string
  /** 표제부 PK 목록 */
  pks: string[]
  ok: boolean
}

function load(): KeygenHistoryItem[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]')
  } catch {
    return []
  }
}

export function useKeygenHistory() {
  const items = useState<KeygenHistoryItem[]>('keygen-history', () => [])

  function refresh() {
    if (!import.meta.client) return
    items.value = load()
  }

  function add(item: Omit<KeygenHistoryItem, 'id' | 'ts'>) {
    if (!import.meta.client) return
    const next: KeygenHistoryItem[] = [
      { ...item, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ts: Date.now() },
      ...load(),
    ].slice(0, LIMIT)
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      // 저장소 초과 등 — 이력은 부가 기능이므로 조용히 무시
    }
    items.value = next
  }

  function clear() {
    localStorage.removeItem(KEY)
    items.value = []
  }

  return { items, refresh, add, clear }
}

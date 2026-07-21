// 메뉴1(API 테스트 콘솔) 최근 호출 이력 — localStorage 저장 (파라미터 복원용, 응답 본문은 저장하지 않음)
const KEY = 'dtent-link:call-history'
const LIMIT = 20

export interface CallHistoryItem {
  id: string
  ts: number
  method: string
  /** 엔드포인트 템플릿 경로 (복원 시 method+path로 엔드포인트 매칭) */
  path: string
  summary: string
  values: Record<string, string | boolean>
  status: number | null
  elapsedMs: number
}

function load(): CallHistoryItem[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]')
  } catch {
    return []
  }
}

export function useCallHistory() {
  const items = useState<CallHistoryItem[]>('call-history', () => [])

  function refresh() {
    if (!import.meta.client) return
    items.value = load()
  }

  function add(item: Omit<CallHistoryItem, 'id' | 'ts'>) {
    if (!import.meta.client) return
    const next: CallHistoryItem[] = [
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

  function remove(id: string) {
    const next = load().filter((i) => i.id !== id)
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      // 저장 실패 시에도 화면 목록은 갱신
    }
    items.value = next
  }

  function clear() {
    localStorage.removeItem(KEY)
    items.value = []
  }

  return { items, refresh, add, remove, clear }
}

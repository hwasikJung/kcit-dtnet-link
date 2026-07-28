// 연계 서버(API Origin) 연결 상태 — 헤더 상태 점에 사용. 60초 주기 + 수동 재확인
export type ServerStatus = 'checking' | 'online' | 'offline'

// 가장 값싼 호출로 확인(단건 키 조회, 실측 약 0.1초·소형 응답). 존재하지 않는 PK라도
// HTTP 응답이 오면 서버 도달로 판정하며, 네트워크 실패·타임아웃만 오류로 본다
const PING_PATH = '/sqiapi/addr/convert_mgm_bld_pk_old_to_new'
const TIMEOUT_MS = 5000

export function useServerStatus() {
  const status = useState<ServerStatus>('server-status', () => 'checking')
  const lastChecked = useState<number | null>('server-status-checked', () => null)

  async function check() {
    if (!import.meta.client) return
    try {
      await $fetch(useRuntimeConfig().public.apiBase + PING_PATH, {
        query: { mgm_bld_pk: '0-0' },
        timeout: TIMEOUT_MS,
      })
      status.value = 'online'
    } catch (err) {
      // HTTP 오류 응답(4xx/5xx)도 서버에는 도달한 것 — 응답 자체가 없을 때만 오류
      status.value = (err as { status?: number })?.status != null ? 'online' : 'offline'
    }
    lastChecked.value = Date.now()
  }

  return { status, lastChecked, check }
}

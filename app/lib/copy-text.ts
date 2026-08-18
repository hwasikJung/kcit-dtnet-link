/**
 * 클립보드 복사 헬퍼.
 *
 * navigator.clipboard는 보안 컨텍스트(HTTPS·localhost)에서만 존재한다 —
 * HTTP로 배포된 WAS 환경에서는 undefined라 복사가 항상 실패했다.
 * 이 경우 숨김 textarea + document.execCommand('copy') 폴백으로 복사한다.
 */
export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // 권한 거부 등 — 아래 폴백 시도
    }
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    // 화면 밖 고정 배치 — 스크롤 점프·깜빡임 방지
    ta.style.position = 'fixed'
    ta.style.top = '0'
    ta.style.left = '-9999px'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

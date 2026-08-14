// 메뉴2 일괄처리 결과 엑셀의 "요약" 시트 — 상태 집계·실패 사유 분포 순수 로직
import type { BulkRow, BulkRowStatus } from '~/types/bulk'

/** 사유 분포가 길어지는 것을 막는 상한 — 초과분은 "기타"로 묶는다(다지역 안내처럼 행마다 문구가 다른 사유 대비) */
const REASON_LIMIT = 15

/**
 * 결과 행 목록 → "요약" 시트 AoA.
 * [파일·일시] → [상태별 건수] → [실패·미매칭 사유 분포(건수 내림차순, 상위 REASON_LIMIT건)] 순.
 * statusLabels는 탭별 표기(미존재/미매칭/매칭 실패)를 그대로 받는다.
 */
export function buildBulkSummary(
  rows: BulkRow[],
  statusLabels: Record<BulkRowStatus, string>,
  meta: { fileName: string; processedAt: string },
): (string | number)[][] {
  const count = (s: BulkRowStatus) => rows.filter((r) => r.status === s).length
  const emptyCount = rows.filter((r) => r.invalid === 'empty').length
  const dupCount = rows.filter((r) => r.invalid === 'duplicate').length

  const aoa: (string | number)[][] = [
    ['처리 요약', ''],
    ['파일', meta.fileName],
    ['처리 일시', meta.processedAt],
    ['', ''],
    ['구분', '건수'],
    ['총 행수', rows.length],
    [statusLabels.success, count('success')],
    [statusLabels.notfound, count('notfound')],
    [statusLabels.error, count('error')],
  ]
  const pending = count('pending')
  if (pending) aoa.push([statusLabels.pending, pending])
  if (emptyCount) aoa.push(['입력 오류(빈값)', emptyCount])
  if (dupCount) aoa.push(['중복 입력(결과는 동일 처리)', dupCount])

  // 실패·미매칭 사유 분포 — errorMsg 기준 집계
  const reasons = new Map<string, number>()
  for (const r of rows) {
    if ((r.status === 'notfound' || r.status === 'error') && r.errorMsg) {
      reasons.set(r.errorMsg, (reasons.get(r.errorMsg) ?? 0) + 1)
    }
  }
  if (reasons.size) {
    const sorted = [...reasons.entries()].sort((a, b) => b[1] - a[1])
    aoa.push(['', ''], ['실패·미매칭 사유', '건수'])
    for (const [msg, n] of sorted.slice(0, REASON_LIMIT)) aoa.push([msg, n])
    const rest = sorted.slice(REASON_LIMIT)
    if (rest.length) {
      aoa.push([`기타 (사유 ${rest.length}종)`, rest.reduce((sum, [, n]) => sum + n, 0)])
    }
  }
  return aoa
}

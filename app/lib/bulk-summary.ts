// 메뉴2 일괄처리 결과 엑셀의 "요약" 시트 — 상태 집계·실패 사유 분포 순수 로직
import type { BulkRow, BulkRowStatus } from '~/types/bulk'

/** 사유 분포가 길어지는 것을 막는 상한 — 초과분은 "기타"로 묶는다(다지역 안내처럼 행마다 문구가 다른 사유 대비) */
const REASON_LIMIT = 15

/** 결과 행 목록의 상태·사유 집계 — 요약 시트와 결과 대시보드가 공유한다 */
export interface BulkStats {
  total: number
  counts: Record<BulkRowStatus, number>
  emptyCount: number
  dupCount: number
  /** 실패·미매칭 사유 분포 (errorMsg 기준, 건수 내림차순 전체) */
  reasons: { msg: string; count: number }[]
}

export function aggregateBulkStats(rows: BulkRow[]): BulkStats {
  const counts: Record<BulkRowStatus, number> = { pending: 0, success: 0, notfound: 0, error: 0 }
  let emptyCount = 0
  let dupCount = 0
  const reasons = new Map<string, number>()
  for (const r of rows) {
    counts[r.status]++
    if (r.invalid === 'empty') emptyCount++
    if (r.invalid === 'duplicate') dupCount++
    if ((r.status === 'notfound' || r.status === 'error') && r.errorMsg) {
      reasons.set(r.errorMsg, (reasons.get(r.errorMsg) ?? 0) + 1)
    }
  }
  return {
    total: rows.length,
    counts,
    emptyCount,
    dupCount,
    reasons: [...reasons.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([msg, count]) => ({ msg, count })),
  }
}

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
  const stats = aggregateBulkStats(rows)

  const aoa: (string | number)[][] = [
    ['처리 요약', ''],
    ['파일', meta.fileName],
    ['처리 일시', meta.processedAt],
    ['', ''],
    ['구분', '건수'],
    ['총 행수', stats.total],
    [statusLabels.success, stats.counts.success],
    [statusLabels.notfound, stats.counts.notfound],
    [statusLabels.error, stats.counts.error],
  ]
  if (stats.counts.pending) aoa.push([statusLabels.pending, stats.counts.pending])
  if (stats.emptyCount) aoa.push(['입력 오류(빈값)', stats.emptyCount])
  if (stats.dupCount) aoa.push(['중복 입력(결과는 동일 처리)', stats.dupCount])

  if (stats.reasons.length) {
    aoa.push(['', ''], ['실패·미매칭 사유', '건수'])
    for (const { msg, count } of stats.reasons.slice(0, REASON_LIMIT)) aoa.push([msg, count])
    const rest = stats.reasons.slice(REASON_LIMIT)
    if (rest.length) {
      aoa.push([`기타 (사유 ${rest.length}종)`, rest.reduce((sum, r) => sum + r.count, 0)])
    }
  }
  return aoa
}

// 메뉴2(엑셀 일괄 조회) 업로드 시트 파싱 — 헤더 자동 감지 + 행별 유효성(빈값/중복) 판정
import type { BulkRow } from '~/types/bulk'

/** mgmBldPk 형식(숫자와 하이픈). 1행 A열이 이 형식이 아니면 헤더로 간주한다 */
export const PK_PATTERN = /^[\d-]+$/

/** 시트 AOA(배열의 배열) → 헤더 감지 결과 + 조회 전 상태의 BulkRow 목록 */
export function parseBulkSheet(aoa: unknown[][]): { hadHeader: boolean; rows: BulkRow[] } {
  const firstA = String(aoa[0]?.[0] ?? '').trim()
  const hadHeader = aoa.length > 0 && !PK_PATTERN.test(firstA)
  const dataRows = hadHeader ? aoa.slice(1) : aoa

  const seen = new Set<string>()
  const rows = dataRows.map((r, i) => {
    const pk = String(r?.[0] ?? '').trim()
    let invalid: BulkRow['invalid']
    if (!pk) invalid = 'empty'
    else if (seen.has(pk)) invalid = 'duplicate'
    else seen.add(pk)
    return {
      seq: i + 1,
      pk,
      invalid,
      status: invalid === 'empty' ? 'error' : 'pending',
      cols: {},
      errorMsg: invalid === 'empty' ? 'A열 값이 비어 있습니다.' : undefined,
    } satisfies BulkRow
  })

  return { hadHeader, rows }
}

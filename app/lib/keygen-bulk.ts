// 메뉴 '일괄 처리 > 키 일괄 생성' — 주소 시트 파싱과 키 생성 결과의 컬럼 매핑
// 조회용(bulk-parse/bulk-columns)과 같은 BulkRow 구조를 쓰되, A열 의미가 PK가 아닌 주소다.
import type { BulkRow } from '~/types/bulk'
import { parseKeygenResponse } from '~/lib/keygen'

/** 1행 A열이 주소 표제(주소/도로명주소/address 등)이면 헤더로 간주한다 */
export const ADDR_HEADER_PATTERN = /^(주소|입력\s*주소|도로명\s*주소|지번\s*주소|addr(ess)?|input_addr)$/i

/** 시트 AOA(배열의 배열) → 헤더 감지 결과 + 생성 전 상태의 BulkRow 목록 */
export function parseAddrSheet(aoa: unknown[][]): { hadHeader: boolean; rows: BulkRow[] } {
  const firstA = String(aoa[0]?.[0] ?? '').trim()
  const hadHeader = aoa.length > 0 && ADDR_HEADER_PATTERN.test(firstA)
  const dataRows = hadHeader ? aoa.slice(1) : aoa

  const seen = new Set<string>()
  const rows = dataRows.map((r, i) => {
    const addr = String(r?.[0] ?? '').trim()
    let invalid: BulkRow['invalid']
    if (!addr) invalid = 'empty'
    else if (seen.has(addr)) invalid = 'duplicate'
    else seen.add(addr)
    return {
      seq: i + 1,
      pk: addr,
      invalid,
      status: invalid === 'empty' ? 'error' : 'pending',
      cols: {},
      errorMsg: invalid === 'empty' ? 'A열 값이 비어 있습니다.' : undefined,
    } satisfies BulkRow
  })

  return { hadHeader, rows }
}

/** 키 일괄 생성 결과의 B열~ 표시 컬럼 (선정·순서·한글명은 이 모듈에서만 관리) */
export const KEYGEN_COLUMNS: { key: string; label: string }[] = [
  { key: 'clean_addr', label: '정제 주소' },
  { key: 'upper_pk', label: '총괄표제부 PK' },
  { key: 'pks', label: '표제부 PK' },
  { key: 'pk_count', label: '표제부 수' },
  { key: 'grade', label: '매칭 등급' },
]

/** building_match_clean_union 응답 → 행 상태 + B열~ 표시 컬럼 값 */
export function flattenKeygenResult(data: unknown): {
  status: 'success' | 'notfound'
  cols: Record<string, string>
  errorMsg?: string
} {
  const p = parseKeygenResponse(data)
  if (!p.ok) {
    return {
      status: 'notfound',
      cols: { clean_addr: p.cleanAddr },
      errorMsg: p.message,
    }
  }
  const r = p.result
  return {
    status: 'success',
    cols: {
      clean_addr: r.cleanAddr,
      upper_pk: r.upperPk,
      pks: r.pks.join(', '),
      pk_count: String(r.pks.length),
      grade: [r.grade, r.level].filter(Boolean).join(' · '),
    },
  }
}

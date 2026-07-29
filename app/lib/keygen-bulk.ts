// 메뉴 '일괄 처리 > 키 일괄 생성' — 주소 시트 파싱과 키 생성 결과의 컬럼 매핑
// 조회용(bulk-parse/bulk-columns)과 같은 BulkRow 구조를 쓰되, A열 의미가 PK가 아닌 주소다.
import type { BulkRow } from '~/types/bulk'
import { extraCells, extractExtraHeaders } from '~/lib/bulk-parse'
import { parseKeygenResponse, type RegionCandidate } from '~/lib/keygen'

/** 1행 A열이 주소 표제(주소/도로명주소/address 등)이면 헤더로 간주한다 */
export const ADDR_HEADER_PATTERN =
  /^(주소|입력\s*주소|도로명\s*주소|지번\s*주소|addr(ess)?|input_addr)$/i

/** 시트 AOA(배열의 배열) → 헤더 감지 결과 + 원본 B열~ 헤더 + 생성 전 상태의 BulkRow 목록 */
export function parseAddrSheet(aoa: unknown[][]): {
  hadHeader: boolean
  extraHeaders: string[]
  rows: BulkRow[]
} {
  const firstA = String(aoa[0]?.[0] ?? '').trim()
  const hadHeader = aoa.length > 0 && ADDR_HEADER_PATTERN.test(firstA)
  const dataRows = hadHeader ? aoa.slice(1) : aoa
  const extraHeaders = extractExtraHeaders(aoa, hadHeader)

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
      extra: extraCells(r, extraHeaders.length),
      errorMsg: invalid === 'empty' ? 'A열 값이 비어 있습니다.' : undefined,
    } satisfies BulkRow
  })

  return { hadHeader, extraHeaders, rows }
}

/** 키 일괄 생성 결과의 B열~ 표시 컬럼 (선정·순서·한글명은 이 모듈에서만 관리) */
export const KEYGEN_COLUMNS: { key: string; label: string }[] = [
  { key: 'clean_addr', label: '정제 주소' },
  { key: 'upper_pk', label: '총괄표제부 PK' },
  { key: 'pks', label: '표제부 PK' },
  { key: 'pk_count', label: '표제부 수' },
  { key: 'grade', label: '매칭 등급' },
]

/** building_match_clean_union 응답 → 행 상태 + B열~ 표시 컬럼 값.
 * regions(주소검색 후보의 시군구)가 2곳 이상이면 같은 주소가 여러 지역에 있는 것이므로
 * 매칭 성공 여부와 관계없이 키를 확정하지 않고 매칭 실패로 처리한다(단건 생성의 다지역 감지와 동일 정책) */
export function flattenKeygenResult(
  data: unknown,
  regions?: RegionCandidate[],
): {
  status: 'success' | 'notfound'
  cols: Record<string, string>
  errorMsg?: string
} {
  const p = parseKeygenResponse(data)
  if (regions && regions.length > 1) {
    const list = regions.map((c) => `${c.si} ${c.sgg}`).join(', ')
    const regionMsg = `같은 주소가 ${regions.length}개 지역에 있습니다(${list}) — 시·도부터 포함해 다시 입력해 주세요.`
    return {
      status: 'notfound',
      cols: { clean_addr: p.ok ? p.result.cleanAddr : p.cleanAddr },
      // 매칭 자체가 실패했으면 실제 실패 사유를 먼저 보여준다(다지역 안내만으로는 오도 가능)
      errorMsg: p.ok ? regionMsg : `${p.message} ${regionMsg}`,
    }
  }
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

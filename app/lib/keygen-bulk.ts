// 메뉴 '일괄 처리 > 키 일괄 생성' — 주소 시트 파싱과 키 생성 결과의 컬럼 매핑
// 조회용(bulk-parse/bulk-columns)과 같은 BulkRow 구조를 쓰되, A열 의미가 PK가 아닌 주소다.
import type { BulkRow } from '~/types/bulk'
import { extraCells, extractExtraHeaders } from '~/lib/bulk-parse'
import { extractMatchExtras, parseKeygenResponse, type RegionCandidate } from '~/lib/keygen'

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

/** 키 일괄 생성 결과의 B열~ 표시 컬럼 (선정·순서·한글명은 이 모듈에서만 관리).
 * 매칭 컬럼에 더해 PK기반 탭(STD_LINK_COLUMNS)과 동일한 표준연계키 조회 값을 제공한다 —
 * 기존 PK·소속 총괄 PK는 총괄표제부/표제부 PK 컬럼과 중복이라 제외 */
export const KEYGEN_COLUMNS: { key: string; label: string }[] = [
  { key: 'clean_addr', label: '정제 주소' },
  { key: 'similar_addr', label: '유사 주소 매칭' },
  { key: 'std_link_key', label: '표준연계키' },
  { key: 'regstr_kind', label: '대장종류' },
  { key: 'upper_pk', label: '총괄표제부 PK' },
  { key: 'pks', label: '표제부 PK' },
  { key: 'pk_count', label: '표제부 수' },
  { key: 'recap_pk_new', label: '총괄 신규 PK' },
  { key: 'title_pk_new', label: '표제부 신규 PK' },
  { key: 'bld_nm', label: '건물명' },
  { key: 'plat_addr', label: '지번주소' },
  { key: 'road_plat_addr', label: '도로명주소' },
  { key: 'zip_no', label: '우편번호' },
  { key: 'pnu', label: 'PNU' },
  { key: 'kma_obsrvn_cd', label: '기상관측소 코드' },
  { key: 'grade', label: '매칭 등급' },
]

/** 키 생성 결과에 병합하는 std_link_key 조회 컬럼 키 목록 */
export const STD_LINK_MERGE_KEYS = [
  'std_link_key',
  'regstr_kind',
  'recap_pk_new',
  'title_pk_new',
  'bld_nm',
  'plat_addr',
  'road_plat_addr',
  'pnu',
  'kma_obsrvn_cd',
] as const

/** 대표 PK(총괄 첫 건, 없으면 첫 표제부)로 조회한 std_link_key 컬럼을 키 생성 결과에 병합.
 * 총괄표제부 PK가 비어 있으면 소속 총괄(mgm_upper_bld_pk)로 보강한다 */
export function mergeStdLinkCols(cols: Record<string, string>, std: Record<string, string>): void {
  for (const k of STD_LINK_MERGE_KEYS) {
    if (std[k]) cols[k] = std[k]
  }
  if (!cols.upper_pk && std.mgm_upper_bld_pk) cols.upper_pk = std.mgm_upper_bld_pk
}

/** 매칭 실패 행에 addr_match(주소매칭) 주소 정보를 보강 병합 — 대장 매칭이 채운 값이
 * 우선이라 비어 있는 컬럼만 채운다(키는 여전히 없음, 주소 정보만 보강) */
export function mergeAddrMatchCols(
  cols: Record<string, string>,
  addr: Record<string, string>,
): void {
  for (const k of ['road_plat_addr', 'plat_addr', 'bld_nm', 'zip_no']) {
    if (!cols[k] && addr[k]) cols[k] = addr[k]
  }
}

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
  /** 서버가 알려준 유사 주소 — 일괄 처리에서 1회 자동 재조회에 사용 */
  similarAddr?: string
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
    // PK는 없어도 응답의 주소·PNU·등급은 채운다 — 결과 엑셀에서 지번 기준 대조가 가능하게.
    // 다지역 모호 케이스는 위에서 이미 반환됨(한 지역 값만 채우면 오도라 보강하지 않는다)
    return {
      status: 'notfound',
      cols: { ...extractMatchExtras(data), clean_addr: p.cleanAddr },
      errorMsg: p.message,
      similarAddr: p.similarAddr,
    }
  }
  const r = p.result
  // 성공 행도 주소·PNU를 union 응답으로 선채움 — std_link_key 후속 조회가 실패(fail-open)해도
  // 주소 컬럼이 비지 않게. 조회가 성공하면 병합(mergeStdLinkCols)이 조회 값으로 덮는다
  return {
    status: 'success',
    cols: {
      ...extractMatchExtras(data),
      clean_addr: r.cleanAddr,
      upper_pk: r.upperPk,
      pks: r.pks.join(', '),
      pk_count: String(r.pks.length),
      grade: [r.grade, r.level].filter(Boolean).join(' · '),
    },
  }
}

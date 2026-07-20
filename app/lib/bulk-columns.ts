// 메뉴2(엑셀 일괄 조회) 결과 컬럼 매핑표 — B열부터의 표시 컬럼·순서·한글명을 이 모듈에서만 관리한다.
// 응답 출처: GET /sqiapi/addr/mgm_bld_pk_info/{mgmbldpk}
//   basic  → 응답 basic_info (객체)
//   title  → 응답 title_info[0] (표제부 배열의 첫 항목)

interface BulkColumn {
  key: string
  label: string
  source: 'basic' | 'title'
  field: string
  format?: 'number' | 'date'
}

export const BULK_COLUMNS: BulkColumn[] = [
  { key: 'bld_nm', label: '건물명', source: 'basic', field: 'bld_nm' },
  { key: 'plat_addr', label: '지번주소', source: 'basic', field: 'plat_addr' },
  { key: 'road_plat_addr', label: '도로명주소', source: 'basic', field: 'road_plat_addr' },
  { key: 'regstr_gb_nm', label: '대장구분', source: 'basic', field: 'regstr_gb_nm' },
  { key: 'regstr_kind_nm', label: '대장종류', source: 'basic', field: 'regstr_kind_nm' },
  { key: 'main_purps_nm', label: '주용도', source: 'title', field: 'main_purps_nm' },
  { key: 'strct_nm', label: '구조', source: 'title', field: 'strct_nm' },
  { key: 'totarea', label: '연면적(㎡)', source: 'title', field: 'totarea', format: 'number' },
  { key: 'grnd_flr_cnt', label: '지상층수', source: 'title', field: 'grnd_flr_cnt' },
  { key: 'ugrnd_flr_cnt', label: '지하층수', source: 'title', field: 'ugrnd_flr_cnt' },
  { key: 'useapr_day', label: '사용승인일', source: 'title', field: 'useapr_day', format: 'date' },
  { key: 'region_nm', label: '용도지역', source: 'basic', field: 'region_nm' },
]

function formatValue(v: unknown, format?: BulkColumn['format']): string {
  if (v == null) return ''
  const s = String(v).trim()
  if (!s) return ''
  if (format === 'number') {
    const n = Number(s)
    if (Number.isNaN(n)) return s
    return n.toLocaleString('ko-KR', { maximumFractionDigits: 2 })
  }
  if (format === 'date' && /^\d{8}$/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
  }
  return s
}

/** 응답 JSON → B열~ 표시 컬럼 값으로 평탄화 */
export function flattenBldInfo(data: unknown): Record<string, string> {
  const d = data as { basic_info?: Record<string, unknown>; title_info?: Record<string, unknown>[] }
  const basic = d?.basic_info ?? {}
  const title = d?.title_info?.[0] ?? {}
  const cols: Record<string, string> = {}
  for (const c of BULK_COLUMNS) {
    const src = c.source === 'basic' ? basic : title
    cols[c.key] = formatValue(src[c.field], c.format)
  }
  return cols
}

// 메뉴2(PK기반 일괄처리) 표준연계키 조회 — 입력 형식 감지·응답 평탄화를 이 모듈에서만 관리한다.
// 응답 출처: GET /sqiapi/addr/std_link_key
//   성공: 레코드 배열(조건에 따라 다건 — 총괄표제부와 소속 표제부가 함께 반환될 수 있다)
//   실패: HTTP 200 + {"error":"Cannot match"} / 조건 누락 시 {"error":"At least one ..."}

/**
 * A열 입력 값 형식 → std_link_key 조회 쿼리 파라미터 이름.
 * R_/T_/S_ 접두 = 표준연계키(2026-08-14 실측: R_=단일 총괄, T_=단독 표제부,
 * S_{시군구}_R_{PK}=총괄 다건 그룹), 하이픈(-) 포함 = 구형 PK(mgm_bld_pk), 하이픈 없음 = 신형
 * PK(mgm_bld_pk_new). 엑셀에 구형·신형이 섞여 있어도 하이픈 유무로 행마다 구분한다
 * (형식이 아니어도 서버가 {"error":"Cannot match"}로 응답 — 미매칭 처리).
 */
export function detectStdLinkParam(
  input: string,
): 'std_link_key' | 'mgm_bld_pk' | 'mgm_bld_pk_new' {
  const v = input.trim()
  if (/^[RTS]_/i.test(v)) return 'std_link_key'
  return v.includes('-') ? 'mgm_bld_pk' : 'mgm_bld_pk_new'
}

/** 표준연계키 문자열의 구조 분해 결과 — 메뉴1 입력창의 키 해석 패널에 사용 */
export interface StdLinkKeyParts {
  kind: 'R' | 'T' | 'S'
  /** 키 유형 한글 라벨 */
  kindLabel: string
  /** 키 유형 설명 한 줄 */
  desc: string
  /** 키에 포함된 기존 형식 PK (예: 11680-12777) */
  pk: string
  /** PK 라벨 — 유형에 따라 총괄표제부/표제부/대표 총괄표제부 */
  pkLabel: string
  /** S_ 키의 시군구코드 5자리 — R_/T_는 빈 문자열 */
  sigunguCd: string
}

/**
 * 표준연계키(R_/T_/S_) 문자열 → 구조 분해. 형식이 아니면 null.
 * 키 형식 실측(2026-08-14): R_{PK}=단일 총괄, T_{PK}=단독 표제부,
 * S_{시군구 5자리}_R_{대표총괄PK}=총괄 다건 그룹(그룹 전원이 같은 키 공유).
 * 내장 PK는 기존(구형) 형식이라 mgm_bld_pk_info 조회·신규 PK 전환에 바로 쓸 수 있다.
 */
export function parseStdLinkKeyStructure(input: string): StdLinkKeyParts | null {
  const v = input.trim().toUpperCase()
  const rt = /^([RT])_(\d{5}-\d+)$/.exec(v)
  if (rt) {
    const kind = rt[1] as 'R' | 'T'
    return kind === 'R'
      ? {
          kind,
          kindLabel: '총괄표제부 키',
          desc: '단일 총괄표제부에 부여된 키 — R_ 뒤가 총괄표제부 PK입니다.',
          pk: rt[2]!,
          pkLabel: '총괄표제부 PK',
          sigunguCd: '',
        }
      : {
          kind,
          kindLabel: '표제부 키',
          desc: '총괄표제부 없이 단독 표제부에 부여된 키 — T_ 뒤가 표제부 PK입니다.',
          pk: rt[2]!,
          pkLabel: '표제부 PK',
          sigunguCd: '',
        }
  }
  const s = /^S_(\d{5})_R_(\d{5}-\d+)$/.exec(v)
  if (s) {
    return {
      kind: 'S',
      kindLabel: '총괄 그룹 키',
      desc: '총괄표제부가 여러 건인 그룹이 공유하는 키 — 시군구코드와 대표 총괄표제부 PK로 구성됩니다.',
      pk: s[2]!,
      pkLabel: '대표 총괄표제부 PK',
      sigunguCd: s[1]!,
    }
  }
  return null
}

/** 표준연계키 조회 결과의 B열~ 표시 컬럼 (선정·순서·한글명은 이 모듈에서만 관리) */
export const STD_LINK_COLUMNS: { key: string; label: string }[] = [
  { key: 'std_link_key', label: '표준연계키' },
  { key: 'regstr_kind', label: '대장종류' },
  { key: 'mgm_bld_pk', label: '기존 PK' },
  { key: 'mgm_bld_pk_new', label: '신규 PK' },
  { key: 'bld_nm', label: '건물명' },
  { key: 'plat_addr', label: '지번주소' },
  { key: 'road_plat_addr', label: '도로명주소' },
  { key: 'pnu', label: 'PNU' },
  { key: 'mgm_upper_bld_pk', label: '소속 총괄 PK' },
]

/** regstr_kind_gb 코드 → 한글 표기 (R=총괄표제부, T=표제부 — 실서버 관찰) */
const REGSTR_KIND_LABEL: Record<string, string> = { R: '총괄표제부', T: '표제부' }

interface StdLinkRecord {
  regstr_kind_gb?: string | null
  [key: string]: unknown
}

/** 응답에서 총괄표제부(R) 레코드의 그룹 정보 — 총괄이 없으면 null.
 * stdLinkKey로 그룹 전체(총괄+소속 표제부)를 1회 재조회할 수 있다 */
export function extractRecapGroup(
  data: unknown,
): { stdLinkKey: string; recapPk: string; titleCnt: number } | null {
  const records = (Array.isArray(data) ? data : []) as StdLinkRecord[]
  const recap = records.find((r) => String(r.regstr_kind_gb ?? '').trim() === 'R')
  if (!recap) return null
  return {
    stdLinkKey: String(recap.std_link_key ?? '').trim(),
    recapPk: String(recap.mgm_bld_pk ?? '').trim(),
    titleCnt: Number(recap.title_cnt ?? 0) || 0,
  }
}

/** 응답에서 특정 PK(mgm_bld_pk)의 표준연계키(R_/T_/S_) — 해당 레코드가 없으면 첫 레코드의 키.
 * 메뉴1 키 카드에서 PK로 조회한 응답의 표준연계키 표기에 사용. 오류 응답이면 빈 문자열 */
export function extractStdLinkKeyFor(data: unknown, pk: string): string {
  const records = (Array.isArray(data) ? data : []) as StdLinkRecord[]
  const hit = records.find((r) => String(r.mgm_bld_pk ?? '').trim() === pk)
  const key = hit?.std_link_key ?? records[0]?.std_link_key
  return key == null ? '' : String(key).trim()
}

/** 소속 표제부 1건의 표시 정보 */
export interface StdLinkTitleItem {
  mgmBldPk: string
  mgmBldPkNew: string
  bldNm: string
}

/** 응답에서 표제부(T) 레코드 목록 추출.
 * upperPk를 주면 해당 총괄(mgm_upper_bld_pk) 소속만 남긴다 — 한 표준연계키 그룹에
 * 총괄이 여러 건일 수 있어(recap_cnt>1 실측) 보고 있는 총괄의 표제부만 걸러낼 때 사용 */
export function extractTitleRecords(data: unknown, upperPk?: string): StdLinkTitleItem[] {
  const records = (Array.isArray(data) ? data : []) as StdLinkRecord[]
  return records
    .filter((r) => String(r.regstr_kind_gb ?? '').trim() === 'T')
    .filter((r) => !upperPk || String(r.mgm_upper_bld_pk ?? '').trim() === upperPk)
    .map((r) => ({
      mgmBldPk: String(r.mgm_bld_pk ?? '').trim(),
      mgmBldPkNew: String(r.mgm_bld_pk_new ?? '').trim(),
      bldNm: String(r.bld_nm ?? '').trim(),
    }))
}

/**
 * std_link_key 응답 → 행 상태 + B열~ 표시 컬럼 값.
 * 다건 응답이면 컬럼별로 중복을 제거해 콤마로 잇는다(총괄+표제부 묶음을 한 행에 표시).
 */
export function flattenStdLinkKey(data: unknown): {
  status: 'success' | 'notfound'
  cols: Record<string, string>
  errorMsg?: string
} {
  if (data && typeof data === 'object' && 'error' in data) {
    return {
      status: 'notfound',
      cols: {},
      errorMsg: '해당 값으로 표준연계키를 찾지 못했습니다.',
    }
  }
  const records = (Array.isArray(data) ? data : []) as StdLinkRecord[]
  if (!records.length) {
    return { status: 'notfound', cols: {}, errorMsg: '해당 값으로 표준연계키를 찾지 못했습니다.' }
  }
  const cols: Record<string, string> = {}
  for (const c of STD_LINK_COLUMNS) {
    const values = records.map((r) => {
      if (c.key === 'regstr_kind') {
        const gb = String(r.regstr_kind_gb ?? '').trim()
        return gb ? (REGSTR_KIND_LABEL[gb] ?? gb) : ''
      }
      const v = r[c.key]
      return v == null ? '' : String(v).trim()
    })
    cols[c.key] = [...new Set(values.filter(Boolean))].join(', ')
  }
  return { status: 'success', cols }
}

// 메뉴 '키 생성' — building_match_clean_union 응답 파싱 순수 로직
// 성공 응답도 HTTP 200, 실패 응답도 HTTP 200 + { error: "cannot match address" } 형태로 온다.

export interface KeygenResult {
  /** 총괄표제부 PK — 없으면 빈 문자열 */
  upperPk: string
  /** 표제부 PK 목록 (콤마 구분 문자열을 분해한 것) */
  pks: string[]
  /** 매칭 등급 (예: M1) */
  grade: string
  /** 매칭 레벨 (예: CASE101) */
  level: string
  cleanAddr: string
  roadAddr: string
  platAddr: string
  /** 법정동코드 10자리 (시군구코드 5 + 법정동코드 5) */
  legalCode: string
}

export type KeygenParse =
  | { ok: true; result: KeygenResult }
  | { ok: false; message: string; cleanAddr: string; similarAddr?: string }

/** 콤마 구분 PK 문자열 → 공백·빈값 제거된 목록 */
export function splitPks(value: unknown): string[] {
  return String(value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/** mgm_bld_pk_info 응답 → PK 보조 표기.
 * 동 이름 우선, 없으면(오래된 대장 등) "건물명 · 사용승인연도"로 보완. 둘 다 없으면 빈 문자열 */
export function extractDongLabel(data: unknown): string {
  const d = data as {
    basic_info?: { bld_nm?: unknown }
    title_info?: { dong_nm?: unknown; useapr_day?: unknown }[]
  } | null
  const title = d?.title_info?.[0]
  const dong = String(title?.dong_nm ?? '').trim()
  if (dong) return dong
  const bld = String(d?.basic_info?.bld_nm ?? '').trim()
  const day = String(title?.useapr_day ?? '').trim()
  const year = /^\d{8}$/.test(day) ? `${day.slice(0, 4)}년` : ''
  return [bld, year].filter(Boolean).join(' · ')
}

export interface DongInfo {
  /** 동 이름 보조 표기 — extractDongLabel과 동일 규칙 */
  label: string
  /** 주부속구분이 '부속건축물'이면 true — 값이 없거나 조회 실패면 주건축물로 간주 */
  isSub: boolean
  /** 주용도명 (예: 공동주택) */
  purps: string
  /** 소속 총괄표제부 PK — 없으면 빈 문자열. 총괄이 여러 건일 때 표제부 그룹핑에 사용한다 */
  upperPk: string
}

/** mgm_bld_pk_info 응답 → 동 표기 + 주/부속 구분 + 소속 총괄 PK.
 * 표제부에는 주거동 외 부속건축물(주차장·경비실 등)도 동별로 포함되어 목록 구분에 사용한다 */
export function extractDongInfo(data: unknown): DongInfo {
  const d = data as {
    basic_info?: { mgm_upper_bld_pk?: unknown }
    title_info?: { main_atch_gb_nm?: unknown; main_purps_nm?: unknown }[]
  } | null
  const title = d?.title_info?.[0]
  return {
    label: extractDongLabel(data),
    isSub: String(title?.main_atch_gb_nm ?? '').trim() === '부속건축물',
    purps: String(title?.main_purps_nm ?? '').trim(),
    upperPk: String(d?.basic_info?.mgm_upper_bld_pk ?? '').trim(),
  }
}

export interface ConvertResult {
  /** 변환된 신규 PK — 실패면 빈 문자열 */
  newPk: string
  /** 실패 안내 메시지 — 성공이면 빈 문자열 */
  error: string
}

/** convert_mgm_bld_pk_old_to_new 응답 → 신규 PK.
 * 성공도 미존재도 HTTP 200 — 성공: {"mgm_bld_pk_new":"1024112777"}, 미존재: {"mgm_bld_pk_new":null} */
export function parseConvertResponse(data: unknown): ConvertResult {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return { newPk: '', error: '응답 형식을 해석할 수 없습니다.' }
  }
  const d = data as { mgm_bld_pk_new?: unknown }
  const newPk = String(d.mgm_bld_pk_new ?? '').trim()
  if (!newPk) {
    return { newPk: '', error: '해당 PK의 신규 PK 정보가 등재되어 있지 않습니다.' }
  }
  return { newPk, error: '' }
}

/** convert_mgm_bld_pk_new_to_old 응답 → 기존 PK.
 * 성공: [{"mgm_bld_pk":"41450-100312801", ...}] 레코드 배열, 미존재: {"error":"Cannot find old PK ..."} */
export function extractOldPkFromConvert(data: unknown): string | null {
  if (!Array.isArray(data)) return null
  const first = data[0] as { mgm_bld_pk?: unknown } | undefined
  const pk = String(first?.mgm_bld_pk ?? '').trim()
  return pk || null
}

export interface RegionCandidate {
  /** 시/도 (예: 부산광역시) */
  si: string
  /** 시/군/구 (예: 중구) */
  sgg: string
  /** 해당 지역 첫 후보의 전체 도로명주소 — 지역 선택 시 재생성 입력으로 사용 */
  roadAddr: string
  /** 건물명 — 없으면 빈 문자열 */
  bldNm: string
}

interface JusoItem {
  siNm?: unknown
  sggNm?: unknown
  roadAddrPart1?: unknown
  bdNm?: unknown
  /** 지번주소 전체 (예: 부산광역시 중구 대청동4가 81) */
  jibunAddr?: unknown
  /** 도로명 (예: 대청로) */
  rn?: unknown
  /** 건물본번 (예: 119) */
  buldMnnm?: unknown
  /** 읍면동명 (예: 중앙동) */
  emdNm?: unknown
  /** 지번 본번 (예: 100) */
  lnbrMnnm?: unknown
  /** 지번 부번 (예: 0) */
  lnbrSlno?: unknown
}

const str = (v: unknown) => String(v ?? '').trim()

/** asis/juso(주소기반산업지원서비스) 응답 → 시군구 단위 지역 후보 목록(입력 순서 유지, 시군구별 첫 건).
 * 같은 주소가 여러 지역에 존재하는지 판정에 사용 — 후보가 2곳 이상이면 다지역 모호.
 * 주소검색이 키워드 유사 검색이라 첫(최상위) 후보와 다른 주소가 섞일 수 있어,
 * 도로명 기준(도로명+건물본번) 또는 지번 기준(읍면동+번지) 어느 한쪽이 첫 후보와 일치하는 건만 남긴다
 * — 도로명 입력은 지역마다 지번이 다르고, 지번 입력은 지역마다 도로명이 달라 한쪽 기준만으로는 놓친다 */
export function extractRegionCandidates(data: unknown): RegionCandidate[] {
  const d = data as { results?: { juso?: unknown } } | null
  const list = d?.results?.juso
  if (!Array.isArray(list)) return []
  const first = list[0] as JusoItem | null
  const refRn = str(first?.rn)
  const refBun = str(first?.buldMnnm)
  const refEmd = str(first?.emdNm)
  const refLnbr = str(first?.lnbrMnnm)
  const refSlno = str(first?.lnbrSlno)
  const seen = new Map<string, RegionCandidate>()
  for (const item of list) {
    const j = item as JusoItem | null
    const si = str(j?.siNm)
    const sgg = str(j?.sggNm)
    if (!si) continue
    const sameRoad = !!refRn && str(j?.rn) === refRn && str(j?.buldMnnm) === refBun
    const sameJibun =
      !!refEmd &&
      str(j?.emdNm) === refEmd &&
      str(j?.lnbrMnnm) === refLnbr &&
      str(j?.lnbrSlno) === refSlno
    if ((refRn || refEmd) && !sameRoad && !sameJibun) continue
    const key = `${si} ${sgg}`
    if (!seen.has(key)) {
      seen.set(key, {
        si,
        sgg,
        roadAddr: str(j?.roadAddrPart1),
        bldNm: str(j?.bdNm),
      })
    }
  }
  return [...seen.values()]
}

export interface AddrSuggestion {
  /** 전체 도로명주소 — 선택 시 생성 입력으로 사용 */
  roadAddr: string
  /** 건물명 — 없으면 빈 문자열 */
  bldNm: string
  /** 지번주소 — 없으면 빈 문자열 */
  jibunAddr: string
}

/** asis/juso 응답 → 입력 자동완성 후보(도로명주소 기준 중복 제거, 입력 순서 유지, 최대 limit건).
 * 서버가 유사 검색 결과를 그대로 주므로 필터 없이 사용자 선택에 맡긴다 */
export function extractAddrSuggestions(data: unknown, limit = 8): AddrSuggestion[] {
  const d = data as { results?: { juso?: unknown } } | null
  const list = d?.results?.juso
  if (!Array.isArray(list)) return []
  const out: AddrSuggestion[] = []
  const seen = new Set<string>()
  for (const item of list) {
    const j = item as JusoItem | null
    const roadAddr = str(j?.roadAddrPart1)
    if (!roadAddr || seen.has(roadAddr)) continue
    seen.add(roadAddr)
    out.push({ roadAddr, bldNm: str(j?.bdNm), jibunAddr: str(j?.jibunAddr) })
    if (out.length >= limit) break
  }
  return out
}

/** asis/juso 응답이 전체 후보 중 일부만 담고 있는지 — 서버가 페이지 크기 10 고정으로 1페이지만 반환한다.
 * 흔한 주소는 후보가 수백 건이라 첫 페이지에 없는 지역이 목록에서 빠질 수 있어 안내에 사용한다 */
export function isRegionListTruncated(data: unknown): boolean {
  const d = data as {
    results?: { common?: { totalCount?: unknown }; juso?: unknown }
  } | null
  const list = d?.results?.juso
  if (!Array.isArray(list)) return false
  const total = Number(str(d?.results?.common?.totalCount))
  return Number.isFinite(total) && total > list.length
}

export function parseKeygenResponse(data: unknown): KeygenParse {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, message: '응답 형식을 해석할 수 없습니다.', cleanAddr: '' }
  }
  const d = data as Record<string, unknown>

  const cleanAddr = String(d.clean_addr ?? '').trim()
  if (typeof d.error === 'string' && d.error) {
    // 오류 유형별 안내 — 서버는 영문 오류 문자열로만 구분된다
    if (d.error.includes('must include a number')) {
      return {
        ok: false,
        message: '건물번호가 없는 주소입니다 — 도로명+건물번호 또는 지번까지 입력해 주세요.',
        cleanAddr,
      }
    }
    // "a similar address was found, but the address matching failed <도로명주소> | <지번주소 건물명>"
    // — 서버가 찾은 유사 주소를 추출해 1클릭 재시도에 사용한다
    const similar = /a similar address was found.*?failed\s+(.+)/.exec(d.error)
    if (similar) {
      return {
        ok: false,
        message: '유사한 주소는 찾았지만 건축물대장과 정확히 일치하지 않았습니다.',
        cleanAddr,
        similarAddr: (similar[1]!.split('|')[0] ?? '').trim(),
      }
    }
    // "a similar road address matched. but not return <도로명주소>" — 유사 도로명주소는 매칭됐지만
    // 결과가 반환되지 않은 케이스(2026-08-19 실측: 해당 주소로 재조회하면 정상 매칭된다)
    const similarRoad = /a similar road address matched\.?\s*but not return\s+(.+)/.exec(d.error)
    if (similarRoad) {
      return {
        ok: false,
        message: '유사한 도로명주소를 찾았습니다 — 해당 주소로 다시 시도하면 매칭될 수 있습니다.',
        cleanAddr,
        similarAddr: similarRoad[1]!.trim(),
      }
    }
    return { ok: false, message: '주소와 일치하는 건축물대장을 찾지 못했습니다.', cleanAddr }
  }

  const upperPk = String(d.match_mgm_upper_bld_pks ?? '').trim()
  const pks = splitPks(d.match_mgm_bld_pks)
  if (!upperPk && pks.length === 0) {
    // M3 등 매칭은 되었지만 PK가 비어 있는 응답 — 해당 주소의 대장 매칭 데이터가 없는 경우
    return {
      ok: false,
      message:
        '주소는 찾았지만 표준연계키가 없습니다 — 해당 주소의 건축물대장 매칭 정보가 등재되지 않았을 수 있습니다.',
      cleanAddr,
    }
  }

  return {
    ok: true,
    result: {
      upperPk,
      pks,
      grade: String(d.match_grade ?? '').trim(),
      level: String(d.match_level ?? '').trim(),
      cleanAddr,
      roadAddr: String(d.road_plat_addr ?? '').trim(),
      platAddr: String(d.plat_addr ?? '').trim(),
      legalCode: `${String(d.sigungu_cd ?? '').trim()}${String(d.bjdong_cd ?? '').trim()}`,
    },
  }
}

/**
 * union 응답의 주소·PNU·등급 부가 정보 — 일괄 생성의 매칭 실패 행 보강용(있는 값만 담는다).
 * PK가 없는 실패(M3 등)에도 정제·매칭된 주소 정보는 응답에 있어 결과 컬럼을 채울 수 있다.
 * PNU는 응답에 직접 없어 시군구(5)+법정동(5)+토지구분(1)+본번(4)+부번(4)으로 조립한다 —
 * plat_gb_cd 0(대지)→1, 1(산)→2, 그 외 코드는 미조립(2026-08-19 실측: 방학동 668-7 PNU와 정합).
 */
export function extractMatchExtras(data: unknown): Record<string, string> {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return {}
  const d = data as Record<string, unknown>
  const out: Record<string, string> = {}
  const platAddr = str(d.plat_addr)
  if (platAddr) out.plat_addr = platAddr
  const roadAddr = str(d.road_plat_addr)
  if (roadAddr) out.road_plat_addr = roadAddr
  const grade = [str(d.match_grade), str(d.match_level)].filter(Boolean).join(' · ')
  if (grade) out.grade = grade
  const sgg = str(d.sigungu_cd)
  const bjd = str(d.bjdong_cd)
  const gbCd = str(d.plat_gb_cd)
  const gb = gbCd === '0' ? '1' : gbCd === '1' ? '2' : ''
  const bun = str(d.bun)
  const ji = str(d.ji)
  if (sgg.length === 5 && bjd.length === 5 && gb && bun && ji) {
    out.pnu = `${sgg}${bjd}${gb}${bun.padStart(4, '0')}${ji.padStart(4, '0')}`
  }
  return out
}

/**
 * addr_match(주소매칭) 응답 → 주소 정보 컬럼 값. 매칭 실패 행의 주소 정보 보강에 사용 —
 * 대장 PK는 없어도 도로명주소·지번주소·건물명·우편번호는 채울 수 있다(2026-08-19 실측).
 * 미매칭도 HTTP 200 + error 형태일 수 있어 주소 필드가 없으면 빈 객체를 반환한다.
 */
export function extractAddrMatchCols(data: unknown): Record<string, string> {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return {}
  const d = data as Record<string, unknown>
  const out: Record<string, string> = {}
  // roadAddr는 참조 표기("(대청동1가)")가 붙어 roadAddrPart1을 우선한다
  const road = str(d.roadAddrPart1) || str(d.roadAddr)
  if (road) out.road_plat_addr = road
  // jibunAddr는 건물명이 붙을 수 있어(without_bldNm 실측) 순수 지번 필드를 우선한다
  const jibun = str(d.jibunAddr_without_bldNm) || str(d.jibunAddr)
  if (jibun) out.plat_addr = jibun
  const bldNm = str(d.bdNm)
  if (bldNm) out.bld_nm = bldNm
  const zip = str(d.zipNo)
  if (zip) out.zip_no = zip
  return out
}

/**
 * 입력이 주소가 아니라 표준연계키(PK) 형식인지 감지.
 * 구형: "11680-12777"(시군구코드 5자리 - 일련번호) / 신형: 자릿수 고정이 아닌 숫자열
 * (실측 6자리 100211 ~ 14자리 11151100312801 관찰) — 순수 숫자 입력은 주소일 수 없어
 * 6자리 이상이면 신형 PK로 본다(하한은 타이핑 중 오탐 방지용).
 * 신형 PK는 mgm_bld_pk_info에서 조회되지 않아(실서버 "Cannot match") 구분이 필요하다.
 */
export function detectPkKind(input: string): 'old' | 'new' | null {
  const v = input.trim()
  if (/^\d{5}-\d+$/.test(v)) return 'old'
  if (/^\d{6,}$/.test(v)) return 'new'
  return null
}

/**
 * legcd_n_coord 응답에서 위경도 추출 — x(경도)/y(위도)는 서버가 이미 WGS84로 변환해 준다
 * (2026-07-28 실측: {"x":127.036...,"y":37.500...,"ori_x":"959032...","ori_y":"1944630..."}).
 */
export function extractCoord(raw: unknown): { lat: number; lng: number } | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const d = raw as Record<string, unknown>
  const lng = Number(d.x)
  const lat = Number(d.y)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  // 대한민국 위경도 대략 범위 검증 — 0이나 EPSG:5179 원시값이 x/y로 오는 오응답 차단
  if (lat < 32 || lat > 40 || lng < 123 || lng > 133) return null
  return { lat, lng }
}

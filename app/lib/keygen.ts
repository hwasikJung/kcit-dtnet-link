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
  | { ok: false; message: string; cleanAddr: string }

/** 콤마 구분 PK 문자열 → 공백·빈값 제거된 목록 */
export function splitPks(value: unknown): string[] {
  return String(value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/** mgm_bld_pk_info 응답에서 동 이름(title_info[0].dong_nm)을 추출 — 없으면 빈 문자열 */
export function extractDongNm(data: unknown): string {
  const d = data as { title_info?: { dong_nm?: unknown }[] } | null
  return String(d?.title_info?.[0]?.dong_nm ?? '').trim()
}

export function parseKeygenResponse(data: unknown): KeygenParse {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, message: '응답 형식을 해석할 수 없습니다.', cleanAddr: '' }
  }
  const d = data as Record<string, unknown>

  const cleanAddr = String(d.clean_addr ?? '').trim()
  if (typeof d.error === 'string' && d.error) {
    return { ok: false, message: '주소와 일치하는 건축물대장을 찾지 못했습니다.', cleanAddr }
  }

  const upperPk = String(d.match_mgm_upper_bld_pks ?? '').trim()
  const pks = splitPks(d.match_mgm_bld_pks)
  if (!upperPk && pks.length === 0) {
    return { ok: false, message: '응답에 표준연계키가 없습니다.', cleanAddr }
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

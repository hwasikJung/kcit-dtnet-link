import { describe, expect, it } from 'vitest'
import {
  ADDR_HEADER_PATTERN,
  KEYGEN_COLUMNS,
  STD_LINK_MERGE_KEYS,
  flattenKeygenResult,
  mergeAddrMatchCols,
  mergeStdLinkCols,
  parseAddrSheet,
} from '~/lib/keygen-bulk'

describe('ADDR_HEADER_PATTERN', () => {
  it('주소 표제만 헤더로 인정한다', () => {
    expect(ADDR_HEADER_PATTERN.test('주소')).toBe(true)
    expect(ADDR_HEADER_PATTERN.test('입력 주소')).toBe(true)
    expect(ADDR_HEADER_PATTERN.test('도로명주소')).toBe(true)
    expect(ADDR_HEADER_PATTERN.test('address')).toBe(true)
    expect(ADDR_HEADER_PATTERN.test('input_addr')).toBe(true)
    expect(ADDR_HEADER_PATTERN.test('서울특별시 중구 세종대로 110')).toBe(false)
    expect(ADDR_HEADER_PATTERN.test('')).toBe(false)
  })
})

describe('parseAddrSheet', () => {
  it('1행 A열이 주소 표제이면 헤더로 간주하고 건너뛴다', () => {
    const { hadHeader, rows } = parseAddrSheet([
      ['주소'],
      ['서울특별시 중구 세종대로 110'],
      ['경기도 고양시 일산서구 고양대로 283'],
    ])
    expect(hadHeader).toBe(true)
    expect(rows).toHaveLength(2)
    expect(rows[0]!.pk).toBe('서울특별시 중구 세종대로 110')
  })

  it('1행 A열이 실제 주소이면 데이터로 취급한다', () => {
    const { hadHeader, rows } = parseAddrSheet([
      ['서울특별시 중구 세종대로 110'],
      ['경기도 고양시 일산서구 고양대로 283'],
    ])
    expect(hadHeader).toBe(false)
    expect(rows).toHaveLength(2)
  })

  it('B열~ 원본 컬럼 헤더와 셀 값을 보존한다', () => {
    const { extraHeaders, rows } = parseAddrSheet([
      ['주소', '관리번호'],
      ['서울특별시 중구 세종대로 110', 'A-1'],
    ])
    expect(extraHeaders).toEqual(['관리번호'])
    expect(rows[0]!.extra).toEqual(['A-1'])
  })

  it('빈값 행은 invalid=empty + status=error, 중복 주소는 invalid=duplicate로 표시한다', () => {
    const { rows } = parseAddrSheet([
      ['서울특별시 중구 세종대로 110'],
      [''],
      ['서울특별시 중구 세종대로 110'],
    ])
    expect(rows[1]!.invalid).toBe('empty')
    expect(rows[1]!.status).toBe('error')
    expect(rows[2]!.invalid).toBe('duplicate')
    expect(rows[2]!.status).toBe('pending')
  })
})

describe('flattenKeygenResult', () => {
  it('성공 응답을 표시 컬럼으로 평탄화한다', () => {
    const r = flattenKeygenResult({
      match_mgm_upper_bld_pks: '41287-226285',
      match_mgm_bld_pks: '41287-100223575,41287-228529',
      match_grade: 'M1',
      match_level: 'CASE101',
      clean_addr: '경기도 고양시 일산서구 고양대로 283',
    })
    expect(r.status).toBe('success')
    expect(r.cols.upper_pk).toBe('41287-226285')
    expect(r.cols.pks).toBe('41287-100223575, 41287-228529')
    expect(r.cols.pk_count).toBe('2')
    expect(r.cols.grade).toBe('M1 · CASE101')
  })

  it('매칭 실패 응답은 notfound + 정제 주소만 남긴다', () => {
    const r = flattenKeygenResult({ error: 'cannot match address', clean_addr: '없는주소123' })
    expect(r.status).toBe('notfound')
    expect(r.cols.clean_addr).toBe('없는주소123')
    expect(r.errorMsg).toContain('찾지 못했습니다')
  })

  it('유사 주소 오류는 similarAddr를 노출한다 — 일괄 자동 재조회용', () => {
    const r = flattenKeygenResult({
      error: 'a similar road address matched. but not return 서울특별시 종로구 낙산5길 33',
      clean_addr: '서울특별시 종로구 창신동 23-330',
    })
    expect(r.status).toBe('notfound')
    expect(r.similarAddr).toBe('서울특별시 종로구 낙산5길 33')
  })

  it('PK 없는 실패(M3)도 응답의 주소·PNU·등급을 보강해 담는다', () => {
    // 2026-08-19 실서버 응답 축약 (경기도 안산시 단원구 초지동 606-1)
    const r = flattenKeygenResult({
      match_mgm_upper_bld_pks: '',
      match_mgm_bld_pks: '',
      match_grade: 'M3',
      match_level: 'CASE999',
      sigungu_cd: '41273',
      bjdong_cd: '10700',
      plat_gb_cd: '0',
      bun: '0606',
      ji: '0001',
      plat_addr: '경기도 안산시 단원구 초지동 606-1',
      road_plat_addr: '경기도 안산시 단원구 원초로 100',
      clean_addr: '경기도 안산시 단원구 초지동 606-1',
    })
    expect(r.status).toBe('notfound')
    expect(r.errorMsg).toContain('표준연계키가 없습니다')
    expect(r.cols.plat_addr).toBe('경기도 안산시 단원구 초지동 606-1')
    expect(r.cols.road_plat_addr).toBe('경기도 안산시 단원구 원초로 100')
    expect(r.cols.pnu).toBe('4127310700106060001')
    expect(r.cols.grade).toBe('M3 · CASE999')
  })

  it('성공 행도 union 응답의 주소·PNU를 선채운다 (std 조회 실패 대비)', () => {
    const r = flattenKeygenResult({
      match_mgm_bld_pks: '11320-7154',
      match_grade: 'M1',
      clean_addr: '서울특별시 도봉구 방학동 668-7',
      plat_addr: '서울특별시 도봉구 방학동 668-7번지',
      sigungu_cd: '11320',
      bjdong_cd: '10600',
      plat_gb_cd: '0',
      bun: '0668',
      ji: '0007',
    })
    expect(r.status).toBe('success')
    expect(r.cols.plat_addr).toBe('서울특별시 도봉구 방학동 668-7번지')
    expect(r.cols.pnu).toBe('1132010600106680007')
  })

  it('지역 후보가 2곳 이상이면 매칭 성공 응답도 notfound(다지역 모호)로 처리한다', () => {
    const regions = [
      { si: '부산광역시', sgg: '중구', roadAddr: '부산광역시 중구 대청로 119', bldNm: '' },
      { si: '경기도', sgg: '하남시', roadAddr: '경기도 하남시 대청로 119', bldNm: '부영아파트' },
    ]
    const r = flattenKeygenResult(
      { match_mgm_bld_pks: '26110-4901', match_grade: 'M1', clean_addr: '대청로 119' },
      regions,
    )
    expect(r.status).toBe('notfound')
    expect(r.cols.clean_addr).toBe('대청로 119')
    expect(r.errorMsg).toContain('2개 지역')
    expect(r.errorMsg).toContain('부산광역시 중구')
    expect(r.errorMsg).toContain('경기도 하남시')
  })

  it('매칭 실패 + 다지역이면 실제 실패 사유와 다지역 안내를 함께 보여준다', () => {
    const regions = [
      { si: '부산광역시', sgg: '중구', roadAddr: '', bldNm: '' },
      { si: '경기도', sgg: '하남시', roadAddr: '', bldNm: '' },
    ]
    const r = flattenKeygenResult({ error: 'cannot match address', clean_addr: '대청로' }, regions)
    expect(r.status).toBe('notfound')
    expect(r.errorMsg).toContain('찾지 못했습니다')
    expect(r.errorMsg).toContain('2개 지역')
  })

  it('지역 후보가 1곳 이하이면 기존과 동일하게 처리한다', () => {
    const one = [{ si: '경기도', sgg: '의정부시', roadAddr: '', bldNm: '' }]
    const r = flattenKeygenResult(
      { match_mgm_bld_pks: '41150-100288397', match_grade: 'M1', clean_addr: '용민로 10' },
      one,
    )
    expect(r.status).toBe('success')
    expect(flattenKeygenResult({ match_mgm_bld_pks: '41150-1', clean_addr: 'x' }, []).status).toBe(
      'success',
    )
  })
})

describe('mergeStdLinkCols', () => {
  const STD = {
    std_link_key: 'S_11410_R_11410-261',
    regstr_kind: '총괄표제부',
    mgm_bld_pk: '11410-261',
    recap_pk_new: '10141261',
    title_pk_new: '1014129220',
    bld_nm: '홍은동벽산아파트',
    plat_addr: '서울특별시 서대문구 홍은동 455번지',
    road_plat_addr: '서울특별시 서대문구 세검정로1길 95',
    pnu: '1141011800104550000',
    mgm_upper_bld_pk: '',
  }

  it('표준연계키 조회 컬럼을 병합하고 기존 PK·소속 총괄 PK는 병합하지 않는다', () => {
    const cols: Record<string, string> = { clean_addr: '홍은동 455', upper_pk: '11410-261' }
    mergeStdLinkCols(cols, STD)
    expect(cols.std_link_key).toBe('S_11410_R_11410-261')
    expect(cols.bld_nm).toBe('홍은동벽산아파트')
    // 신규 PK는 대장종류별 컬럼으로 병합된다
    expect(cols.recap_pk_new).toBe('10141261')
    expect(cols.title_pk_new).toBe('1014129220')
    expect(cols.mgm_bld_pk).toBeUndefined()
    expect(cols.upper_pk).toBe('11410-261')
  })

  it('총괄표제부 PK가 비어 있으면 소속 총괄로 보강한다', () => {
    const cols: Record<string, string> = { upper_pk: '' }
    mergeStdLinkCols(cols, { ...STD, mgm_upper_bld_pk: '11410-261' })
    expect(cols.upper_pk).toBe('11410-261')
  })

  it('빈 조회 값은 기존 컬럼을 덮지 않는다', () => {
    const cols: Record<string, string> = { std_link_key: 'T_1' }
    mergeStdLinkCols(cols, { std_link_key: '' })
    expect(cols.std_link_key).toBe('T_1')
  })

  it('병합 키는 모두 표시 컬럼(KEYGEN_COLUMNS)에 있다', () => {
    const shown = new Set(KEYGEN_COLUMNS.map((c) => c.key))
    for (const k of STD_LINK_MERGE_KEYS) expect(shown.has(k)).toBe(true)
  })
})

describe('mergeAddrMatchCols', () => {
  it('비어 있는 주소 컬럼만 채운다 (대장 매칭 값 우선)', () => {
    const cols: Record<string, string> = {
      plat_addr: '기존 지번주소',
      road_plat_addr: '',
    }
    mergeAddrMatchCols(cols, {
      plat_addr: '주소매칭 지번',
      road_plat_addr: '주소매칭 도로명',
      bld_nm: '건강증진실',
      zip_no: '59346',
    })
    expect(cols).toEqual({
      plat_addr: '기존 지번주소',
      road_plat_addr: '주소매칭 도로명',
      bld_nm: '건강증진실',
      zip_no: '59346',
    })
  })

  it('보강 값이 비어 있으면 아무것도 하지 않는다', () => {
    const cols: Record<string, string> = { clean_addr: 'x' }
    mergeAddrMatchCols(cols, {})
    expect(cols).toEqual({ clean_addr: 'x' })
  })

  it('보강 컬럼(zip_no 포함)은 모두 표시 컬럼(KEYGEN_COLUMNS)에 있다', () => {
    const shown = new Set(KEYGEN_COLUMNS.map((c) => c.key))
    for (const k of ['road_plat_addr', 'plat_addr', 'bld_nm', 'zip_no'])
      expect(shown.has(k)).toBe(true)
  })
})

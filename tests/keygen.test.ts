import { describe, expect, it } from 'vitest'
import {
  extractDongInfo,
  extractDongLabel,
  extractRegionCandidates,
  isRegionListTruncated,
  parseKeygenResponse,
  splitPks,
} from '~/lib/keygen'

// 2026-07-24 실서버(building_match_clean_union) 응답 스냅샷 기반 픽스처
const SUCCESS_WITH_UPPER = {
  match_mgm_upper_bld_pks: '41287-226285',
  match_mgm_bld_pks: '41287-100223575,41287-100235932,41287-228529',
  match_grade: 'M1',
  match_level: 'CASE101',
  sigungu_cd: '41287',
  bjdong_cd: '10400',
  plat_addr: '경기도 고양시 일산서구 대화동 2311-1',
  road_plat_addr: '경기도 고양시 일산서구 고양대로 283',
  clean_addr: '경기도 고양시 일산서구 고양대로 283',
}

const SUCCESS_NO_UPPER = {
  match_mgm_upper_bld_pks: '',
  match_mgm_bld_pks: '11140-100209993,11140-1530',
  match_grade: 'M2',
  match_level: 'CASE205',
  sigungu_cd: '11140',
  bjdong_cd: '10300',
  plat_addr: '서울특별시 중구 태평로1가 31',
  road_plat_addr: '서울특별시 중구 세종대로 110',
  clean_addr: '서울특별시 중구 세종대로 110',
}

describe('splitPks', () => {
  it('콤마 구분 문자열을 목록으로 분해한다', () => {
    expect(splitPks('11140-100209993,11140-1530')).toEqual(['11140-100209993', '11140-1530'])
  })

  it('빈값·공백은 제거한다', () => {
    expect(splitPks(' 11140-1530 , ,')).toEqual(['11140-1530'])
    expect(splitPks('')).toEqual([])
    expect(splitPks(undefined)).toEqual([])
  })
})

describe('extractDongLabel', () => {
  it('동 이름이 있으면 동 이름을 우선 사용한다', () => {
    expect(extractDongLabel({ title_info: [{ dong_nm: '도로실험동' }] })).toBe('도로실험동')
  })

  it('동 이름이 없으면 건물명·사용승인연도로 보완한다', () => {
    expect(
      extractDongLabel({
        basic_info: { bld_nm: '서울특별시 청사' },
        title_info: [{ dong_nm: '신관', useapr_day: '20120831' }],
      }),
    ).toBe('신관')
    expect(
      extractDongLabel({
        basic_info: { bld_nm: '서울특별시 청사' },
        title_info: [{ dong_nm: null, useapr_day: '20120831' }],
      }),
    ).toBe('서울특별시 청사 · 2012년')
    expect(
      extractDongLabel({ basic_info: { bld_nm: null }, title_info: [{ useapr_day: '19260905' }] }),
    ).toBe('1926년')
  })

  it('아무 정보도 없거나 응답이 비정상이면 빈 문자열을 돌려준다', () => {
    expect(extractDongLabel({ title_info: [] })).toBe('')
    expect(extractDongLabel({ error: 'Cannot match' })).toBe('')
    expect(extractDongLabel(null)).toBe('')
  })
})

describe('extractDongInfo', () => {
  it('부속건축물 표제부는 isSub=true로 구분한다', () => {
    // 2026-07-24 실서버(mgm_bld_pk_info 41150-100291005) 응답 스냅샷 기반
    expect(
      extractDongInfo({
        title_info: [
          { dong_nm: '1117동', main_purps_nm: '공동주택', main_atch_gb_nm: '부속건축물' },
        ],
      }),
    ).toEqual({ label: '1117동', isSub: true, purps: '공동주택' })
  })

  it('주건축물 표제부는 isSub=false로 구분한다', () => {
    expect(
      extractDongInfo({
        title_info: [{ dong_nm: '1112동', main_purps_nm: '공동주택', main_atch_gb_nm: '주건축물' }],
      }),
    ).toEqual({ label: '1112동', isSub: false, purps: '공동주택' })
  })

  it('주부속구분이 없으면 주건축물로 간주한다', () => {
    expect(extractDongInfo({ title_info: [{ dong_nm: '본관' }] })).toEqual({
      label: '본관',
      isSub: false,
      purps: '',
    })
  })

  it('응답이 비정상이면 주건축물로 간주하고 빈 값을 돌려준다', () => {
    expect(extractDongInfo({ title_info: [] })).toEqual({ label: '', isSub: false, purps: '' })
    expect(extractDongInfo({ error: 'Cannot match' })).toEqual({
      label: '',
      isSub: false,
      purps: '',
    })
    expect(extractDongInfo(null)).toEqual({ label: '', isSub: false, purps: '' })
  })
})

describe('extractRegionCandidates', () => {
  // 2026-07-24 실서버(asis/juso, "대청로 119") 응답 스냅샷 기반 — 부산·하남·보령 3개 지역
  const JUSO_MULTI = {
    results: {
      common: { errorCode: '0', errorMessage: '정상', totalCount: '8' },
      juso: [
        {
          siNm: '부산광역시',
          sggNm: '중구',
          roadAddrPart1: '부산광역시 중구 대청로 119',
          bdNm: '',
          rn: '대청로',
          buldMnnm: '119',
        },
        {
          siNm: '경기도',
          sggNm: '하남시',
          roadAddrPart1: '경기도 하남시 대청로 119',
          bdNm: '부영아파트',
          rn: '대청로',
          buldMnnm: '119',
        },
        {
          siNm: '충청남도',
          sggNm: '보령시',
          roadAddrPart1: '충청남도 보령시 대청로 119',
          bdNm: '',
          rn: '대청로',
          buldMnnm: '119',
        },
        {
          siNm: '부산광역시',
          sggNm: '중구',
          roadAddrPart1: '부산광역시 중구 대청로 119-1',
          bdNm: '',
          rn: '대청로',
          buldMnnm: '119',
        },
        // 키워드 유사 검색으로 섞인 다른 주소 — 도로명·건물본번이 달라 제외되어야 한다
        {
          siNm: '인천광역시',
          sggNm: '옹진군',
          roadAddrPart1: '인천광역시 옹진군 대청면 대청로244번길 45',
          bdNm: '대청119지역대',
          rn: '대청로244번길',
          buldMnnm: '45',
        },
      ],
    },
  }

  it('시군구 단위로 중복을 제거하고, 도로명·건물본번이 다른 유사 검색 후보는 제외한다', () => {
    const r = extractRegionCandidates(JUSO_MULTI)
    expect(r).toHaveLength(3)
    expect(r.some((c) => c.sgg === '옹진군')).toBe(false)
    expect(r[0]).toEqual({
      si: '부산광역시',
      sgg: '중구',
      roadAddr: '부산광역시 중구 대청로 119',
      bldNm: '',
    })
    expect(r[1]).toEqual({
      si: '경기도',
      sgg: '하남시',
      roadAddr: '경기도 하남시 대청로 119',
      bldNm: '부영아파트',
    })
    expect(r[2]!.sgg).toBe('보령시')
  })

  it('지번 입력은 지역마다 도로명이 달라도 읍면동·번지가 같으면 후보로 인정한다', () => {
    // 2026-07-24 실서버(asis/juso, "중앙동 100") 응답 스냅샷 기반 — 지역마다 도로명이 전부 다르다
    const r = extractRegionCandidates({
      results: {
        juso: [
          {
            siNm: '강원특별자치도',
            sggNm: '원주시',
            roadAddrPart1: '강원특별자치도 원주시 중평길 32-4',
            rn: '중평길',
            buldMnnm: '32',
            emdNm: '중앙동',
            lnbrMnnm: '100',
            lnbrSlno: '0',
          },
          {
            siNm: '경기도',
            sggNm: '과천시',
            roadAddrPart1: '경기도 과천시 향교말길 8',
            rn: '향교말길',
            buldMnnm: '8',
            emdNm: '중앙동',
            lnbrMnnm: '100',
            lnbrSlno: '0',
          },
          // 법정동 표기가 다른 유사 후보 — 제외되어야 한다
          {
            siNm: '전북특별자치도',
            sggNm: '익산시',
            roadAddrPart1: '전북특별자치도 익산시 인북로3길 19',
            rn: '인북로3길',
            buldMnnm: '19',
            emdNm: '중앙동3가',
            lnbrMnnm: '100',
            lnbrSlno: '0',
          },
          // 지번 부번이 다른 유사 후보 — 제외되어야 한다
          {
            siNm: '경상남도',
            sggNm: '창원시 성산구',
            roadAddrPart1: '경상남도 창원시 성산구 중앙대로 49',
            rn: '중앙대로',
            buldMnnm: '49',
            emdNm: '중앙동',
            lnbrMnnm: '100',
            lnbrSlno: '4',
          },
        ],
      },
    })
    expect(r.map((c) => c.sgg)).toEqual(['원주시', '과천시'])
  })

  it('단일 지역이면 1건만 돌려준다', () => {
    const r = extractRegionCandidates({
      results: {
        juso: [
          { siNm: '경기도', sggNm: '하남시', roadAddrPart1: '경기도 하남시 대청로 119' },
          { siNm: '경기도', sggNm: '하남시', roadAddrPart1: '경기도 하남시 대청로 119-1' },
        ],
      },
    })
    expect(r).toHaveLength(1)
  })

  it('후보가 없거나 응답이 비정상이면 빈 목록을 돌려준다', () => {
    expect(extractRegionCandidates({ results: { juso: [] } })).toEqual([])
    expect(extractRegionCandidates({ results: {} })).toEqual([])
    expect(extractRegionCandidates(null)).toEqual([])
    expect(extractRegionCandidates('oops')).toEqual([])
  })
})

describe('isRegionListTruncated', () => {
  it('전체 건수가 반환 건수보다 많으면 잘린 것으로 판정한다', () => {
    // 서버는 페이지 크기 10 고정 — "중앙로 1"은 totalCount 594에 10건만 반환된다
    const tenItems = Array.from({ length: 10 }, (_, i) => ({ siNm: `시${i}` }))
    expect(
      isRegionListTruncated({ results: { common: { totalCount: '594' }, juso: tenItems } }),
    ).toBe(true)
    expect(
      isRegionListTruncated({ results: { common: { totalCount: '10' }, juso: tenItems } }),
    ).toBe(false)
  })

  it('응답이 비정상이면 잘리지 않은 것으로 판정한다', () => {
    expect(isRegionListTruncated({ results: { juso: [] } })).toBe(false)
    expect(isRegionListTruncated({ results: {} })).toBe(false)
    expect(isRegionListTruncated(null)).toBe(false)
  })
})

describe('parseKeygenResponse', () => {
  it('총괄표제부 PK가 있는 성공 응답을 파싱한다', () => {
    const r = parseKeygenResponse(SUCCESS_WITH_UPPER)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.result.upperPk).toBe('41287-226285')
    expect(r.result.pks).toHaveLength(3)
    expect(r.result.grade).toBe('M1')
    expect(r.result.level).toBe('CASE101')
    expect(r.result.legalCode).toBe('4128710400')
    expect(r.result.cleanAddr).toBe('경기도 고양시 일산서구 고양대로 283')
  })

  it('총괄표제부 PK가 빈 문자열인 성공 응답도 파싱한다', () => {
    const r = parseKeygenResponse(SUCCESS_NO_UPPER)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.result.upperPk).toBe('')
    expect(r.result.pks).toEqual(['11140-100209993', '11140-1530'])
  })

  it('매칭 실패 응답(error 필드)은 실패로 판정하고 정제 주소를 남긴다', () => {
    const r = parseKeygenResponse({ error: 'cannot match address', clean_addr: '없는주소123' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.message).toContain('찾지 못했습니다')
    expect(r.cleanAddr).toBe('없는주소123')
  })

  it('유사 주소 발견 오류는 유사 주소를 추출해 돌려준다', () => {
    // 2026-07-24 실서버 응답 스냅샷 기반 — "<도로명주소> | <지번주소 건물명>" 형식
    const r = parseKeygenResponse({
      error:
        'a similar address was found, but the address matching failed 경기도 고양시 일산서구 고양대로 283 | 경기도 고양시 일산서구 대화동 2311-1 한국건설기술연구원',
      clean_addr: '경기도 고양시 일산서구 고양대로 283 101동 202호',
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.message).toContain('유사한 주소')
    expect(r.similarAddr).toBe('경기도 고양시 일산서구 고양대로 283')
  })

  it('건물번호 누락 오류는 구체적인 안내 메시지를 돌려준다', () => {
    const r = parseKeygenResponse({ error: 'address must include a number', clean_addr: '광화문' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.message).toContain('건물번호')
    expect(r.similarAddr).toBeUndefined()
  })

  it('키가 하나도 없는 응답은 실패로 판정한다', () => {
    const r = parseKeygenResponse({ match_mgm_upper_bld_pks: '', match_mgm_bld_pks: '' })
    expect(r.ok).toBe(false)
  })

  it('객체가 아닌 응답은 실패로 판정한다', () => {
    expect(parseKeygenResponse(null).ok).toBe(false)
    expect(parseKeygenResponse('oops').ok).toBe(false)
    expect(parseKeygenResponse([1, 2]).ok).toBe(false)
  })
})

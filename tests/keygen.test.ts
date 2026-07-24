import { describe, expect, it } from 'vitest'
import { extractDongNm, parseKeygenResponse, splitPks } from '~/lib/keygen'

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

describe('extractDongNm', () => {
  it('title_info 첫 항목의 동 이름을 추출한다', () => {
    expect(extractDongNm({ title_info: [{ dong_nm: '도로실험동' }] })).toBe('도로실험동')
  })

  it('동 이름이 없거나 응답이 비정상이면 빈 문자열을 돌려준다', () => {
    expect(extractDongNm({ title_info: [{ dong_nm: null }] })).toBe('')
    expect(extractDongNm({ title_info: [] })).toBe('')
    expect(extractDongNm({ error: 'Cannot match' })).toBe('')
    expect(extractDongNm(null)).toBe('')
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

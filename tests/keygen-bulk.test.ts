import { describe, expect, it } from 'vitest'
import { ADDR_HEADER_PATTERN, flattenKeygenResult, parseAddrSheet } from '~/lib/keygen-bulk'

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

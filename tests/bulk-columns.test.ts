import { describe, expect, it } from 'vitest'
import { BULK_COLUMNS, flattenBldInfo } from '~/lib/bulk-columns'

describe('flattenBldInfo', () => {
  it('basic_info와 title_info[0]에서 매핑표대로 값을 추출한다', () => {
    const cols = flattenBldInfo({
      basic_info: { bld_nm: '테스트빌딩', plat_addr: '서울 강남구 1-1' },
      title_info: [{ main_purps_nm: '업무시설', strct_nm: '철근콘크리트' }],
    })
    expect(cols.bld_nm).toBe('테스트빌딩')
    expect(cols.plat_addr).toBe('서울 강남구 1-1')
    expect(cols.main_purps_nm).toBe('업무시설')
    expect(cols.strct_nm).toBe('철근콘크리트')
  })

  it('number 포맷은 천 단위 구분·소수 2자리로 표시한다', () => {
    const cols = flattenBldInfo({ title_info: [{ totarea: '12345.678' }] })
    expect(cols.totarea).toBe('12,345.68')
  })

  it('이미 콤마가 포함된 숫자 문자열도 재포맷한다', () => {
    const cols = flattenBldInfo({ title_info: [{ totarea: '12,345.678' }] })
    expect(cols.totarea).toBe('12,345.68')
  })

  it('date 포맷은 YYYYMMDD를 YYYY-MM-DD로 변환한다', () => {
    const cols = flattenBldInfo({ title_info: [{ useapr_day: '20201231' }] })
    expect(cols.useapr_day).toBe('2020-12-31')
  })

  it('8자리 숫자가 아닌 날짜 값은 원본 그대로 둔다', () => {
    const cols = flattenBldInfo({ title_info: [{ useapr_day: '2020-12' }] })
    expect(cols.useapr_day).toBe('2020-12')
  })

  it('누락 필드·null 응답은 빈 문자열로 채운다', () => {
    const cols = flattenBldInfo(null)
    for (const c of BULK_COLUMNS) expect(cols[c.key]).toBe('')
  })

  it('모든 매핑 컬럼 key가 결과에 존재한다', () => {
    const cols = flattenBldInfo({})
    expect(Object.keys(cols).sort()).toEqual(BULK_COLUMNS.map((c) => c.key).sort())
  })
})

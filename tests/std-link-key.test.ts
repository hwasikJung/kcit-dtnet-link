import { describe, expect, it } from 'vitest'
import {
  STD_LINK_COLUMNS,
  detectStdLinkParam,
  extractRecapGroup,
  extractTitleRecords,
  flattenStdLinkKey,
} from '~/lib/std-link-key'

/** 실서버 응답 형태의 레코드 샘플 (2026-08-06 실측 축약) */
const RECAP = {
  std_link_key: 'R_11110-1',
  recap_cnt: 1,
  title_cnt: 1,
  mgm_bld_pk: '11110-1',
  mgm_bld_pk_new: '100211',
  regstr_kind_gb: 'R',
  mgm_upper_bld_pk: null,
  bld_nm: '',
  plat_addr: '서울특별시 종로구 관철동 12-1번지',
  road_plat_addr: '서울특별시 종로구 종로14길 20',
  pnu: '1111013500100120001',
}
const TITLE = {
  ...RECAP,
  mgm_bld_pk: '11110-2457',
  mgm_bld_pk_new: '100212457',
  regstr_kind_gb: 'T',
  mgm_upper_bld_pk: '11110-1',
  bld_nm: '연빌리지',
}

describe('detectStdLinkParam', () => {
  it('R_/T_ 접두는 std_link_key로 조회한다 (소문자 허용)', () => {
    expect(detectStdLinkParam('R_11110-1')).toBe('std_link_key')
    expect(detectStdLinkParam('t_11680-12777')).toBe('std_link_key')
  })

  it('하이픈 없는 값은 신형 PK로 보고 mgm_bld_pk_new로 조회한다', () => {
    expect(detectStdLinkParam('1024112777')).toBe('mgm_bld_pk_new')
    expect(detectStdLinkParam('100211')).toBe('mgm_bld_pk_new')
  })

  it('하이픈 포함 값은 구형 PK로 보고 mgm_bld_pk로 조회한다', () => {
    expect(detectStdLinkParam('11680-12777')).toBe('mgm_bld_pk')
    expect(detectStdLinkParam(' 11680-12777 ')).toBe('mgm_bld_pk')
  })
})

describe('flattenStdLinkKey', () => {
  it('단건 레코드를 표시 컬럼으로 평탄화한다', () => {
    const r = flattenStdLinkKey([TITLE])
    expect(r.status).toBe('success')
    expect(r.cols.std_link_key).toBe('R_11110-1')
    expect(r.cols.regstr_kind).toBe('표제부')
    expect(r.cols.mgm_bld_pk).toBe('11110-2457')
    expect(r.cols.mgm_upper_bld_pk).toBe('11110-1')
    expect(r.cols.bld_nm).toBe('연빌리지')
  })

  it('다건 응답은 컬럼별 중복 제거 후 콤마로 잇는다', () => {
    const r = flattenStdLinkKey([RECAP, TITLE])
    expect(r.status).toBe('success')
    expect(r.cols.std_link_key).toBe('R_11110-1')
    expect(r.cols.regstr_kind).toBe('총괄표제부, 표제부')
    expect(r.cols.mgm_bld_pk).toBe('11110-1, 11110-2457')
    // 빈 문자열(총괄의 건물명)은 제외되고 값이 있는 것만 남는다
    expect(r.cols.bld_nm).toBe('연빌리지')
  })

  it('error 응답과 빈 배열은 미매칭으로 처리한다', () => {
    for (const data of [{ error: 'Cannot match' }, []]) {
      const r = flattenStdLinkKey(data)
      expect(r.status).toBe('notfound')
      expect(r.errorMsg).toContain('찾지 못했습니다')
    }
  })

  it('알 수 없는 regstr_kind_gb 코드는 그대로 표기한다', () => {
    const r = flattenStdLinkKey([{ ...TITLE, regstr_kind_gb: 'X' }])
    expect(r.cols.regstr_kind).toBe('X')
  })

  it('표시 컬럼 키는 flatten 결과 키와 일치한다', () => {
    const r = flattenStdLinkKey([TITLE])
    expect(Object.keys(r.cols)).toEqual(STD_LINK_COLUMNS.map((c) => c.key))
  })
})

describe('extractRecapGroup', () => {
  it('R 레코드에서 그룹 재조회 키·총괄 PK·표제부 수를 뽑는다', () => {
    expect(extractRecapGroup([RECAP, TITLE])).toEqual({
      stdLinkKey: 'R_11110-1',
      recapPk: '11110-1',
      titleCnt: 1,
    })
  })

  it('총괄(R)이 없거나 배열이 아니면 null', () => {
    expect(extractRecapGroup([TITLE])).toBeNull()
    expect(extractRecapGroup({ error: 'Cannot match' })).toBeNull()
    expect(extractRecapGroup(null)).toBeNull()
  })
})

describe('extractTitleRecords', () => {
  const OTHER_TITLE = { ...TITLE, mgm_bld_pk: '11110-9999', mgm_upper_bld_pk: '11110-8888' }

  it('T 레코드만 표시 정보로 추출한다', () => {
    expect(extractTitleRecords([RECAP, TITLE])).toEqual([
      { mgmBldPk: '11110-2457', mgmBldPkNew: '100212457', bldNm: '연빌리지' },
    ])
  })

  it('upperPk를 주면 해당 총괄 소속 표제부만 남긴다', () => {
    const list = extractTitleRecords([RECAP, TITLE, OTHER_TITLE], '11110-1')
    expect(list.map((t) => t.mgmBldPk)).toEqual(['11110-2457'])
  })

  it('배열이 아니면 빈 목록', () => {
    expect(extractTitleRecords({ error: 'Cannot match' })).toEqual([])
  })
})

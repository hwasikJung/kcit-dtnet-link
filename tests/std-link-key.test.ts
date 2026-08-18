import { describe, expect, it } from 'vitest'
import {
  STD_KEY_KIND_NOTES,
  STD_LINK_COLUMNS,
  detectStdLinkParam,
  extractRecapGroup,
  extractStdLinkKeyFor,
  extractStdLinkRows,
  extractTitleRecords,
  flattenStdLinkKey,
  parseStdLinkKeyStructure,
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
  it('R_/T_/S_ 접두는 std_link_key로 조회한다 (소문자 허용)', () => {
    expect(detectStdLinkParam('R_11110-1')).toBe('std_link_key')
    expect(detectStdLinkParam('t_11680-12777')).toBe('std_link_key')
    // 총괄 다건 그룹 키 (2026-08-14 실측: 홍은동 455)
    expect(detectStdLinkParam('S_11410_R_11410-261')).toBe('std_link_key')
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

describe('extractStdLinkRows', () => {
  it('레코드를 건물 행으로 변환하고 총괄표제부를 앞에 둔다', () => {
    const rows = extractStdLinkRows([TITLE, RECAP])
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({
      stdLinkKey: 'R_11110-1',
      kindLabel: '총괄표제부',
      mgmBldPk: '11110-1',
      mgmBldPkNew: '100211',
      bldNm: '',
      addr: '서울특별시 종로구 종로14길 20',
      pnu: '1111013500100120001',
    })
    expect(rows[1]!.kindLabel).toBe('표제부')
    expect(rows[1]!.bldNm).toBe('연빌리지')
  })

  it('도로명주소가 없으면 지번주소를 쓴다', () => {
    const rows = extractStdLinkRows([{ ...TITLE, road_plat_addr: null }])
    expect(rows[0]!.addr).toBe('서울특별시 종로구 관철동 12-1번지')
  })

  it('오류 응답·빈 배열·비배열은 빈 목록', () => {
    expect(extractStdLinkRows({ error: 'Cannot match' })).toEqual([])
    expect(extractStdLinkRows([])).toEqual([])
    expect(extractStdLinkRows(null)).toEqual([])
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

describe('parseStdLinkKeyStructure', () => {
  it('R_ 키는 총괄표제부 키로 분해한다', () => {
    const p = parseStdLinkKeyStructure('R_11110-1')
    expect(p?.kind).toBe('R')
    expect(p?.pk).toBe('11110-1')
    expect(p?.sigunguCd).toBe('')
    expect(p?.pkLabel).toBe('총괄표제부 PK')
  })

  it('T_ 키는 표제부 키로 분해한다 (소문자·공백 허용)', () => {
    const p = parseStdLinkKeyStructure(' t_11680-12777 ')
    expect(p?.kind).toBe('T')
    expect(p?.pk).toBe('11680-12777')
  })

  it('S_ 키는 시군구코드와 대표 총괄 PK로 분해한다', () => {
    const p = parseStdLinkKeyStructure('S_11410_R_11410-261')
    expect(p?.kind).toBe('S')
    expect(p?.sigunguCd).toBe('11410')
    expect(p?.pk).toBe('11410-261')
    expect(p?.pkLabel).toBe('대표 총괄표제부 PK')
  })

  it('도움말(STD_KEY_KIND_NOTES)의 예시 키는 전부 구조 분해와 정합한다', () => {
    expect(STD_KEY_KIND_NOTES.map((n) => n.prefix)).toEqual(['R_', 'T_', 'S_'])
    for (const n of STD_KEY_KIND_NOTES) {
      expect(parseStdLinkKeyStructure(n.example)?.kind).toBe(n.prefix[0])
    }
  })

  it('키 형식이 아니면 null — 주소·PK·불완전한 키', () => {
    expect(parseStdLinkKeyStructure('대청로 119')).toBeNull()
    expect(parseStdLinkKeyStructure('11680-12777')).toBeNull()
    expect(parseStdLinkKeyStructure('1024112777')).toBeNull()
    expect(parseStdLinkKeyStructure('R_')).toBeNull()
    expect(parseStdLinkKeyStructure('S_11410_R_')).toBeNull()
    expect(parseStdLinkKeyStructure('S_114_R_11410-261')).toBeNull()
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

describe('extractStdLinkKeyFor', () => {
  it('조회한 PK와 일치하는 레코드의 표준연계키를 돌려준다', () => {
    expect(extractStdLinkKeyFor([RECAP, TITLE], '11110-1')).toBe('R_11110-1')
    expect(extractStdLinkKeyFor([{ ...TITLE, std_link_key: 'T_11110-2457' }], '11110-2457')).toBe(
      'T_11110-2457',
    )
  })

  it('일치 레코드가 없으면 첫 레코드의 키로 대신한다', () => {
    expect(extractStdLinkKeyFor([RECAP], '11110-9999')).toBe('R_11110-1')
  })

  it('error 응답·빈 배열·키 없는 레코드는 빈 문자열', () => {
    expect(extractStdLinkKeyFor({ error: 'Cannot match' }, '11110-1')).toBe('')
    expect(extractStdLinkKeyFor([], '11110-1')).toBe('')
    expect(extractStdLinkKeyFor([{ ...RECAP, std_link_key: null }], '11110-1')).toBe('')
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

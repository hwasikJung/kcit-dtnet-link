import { describe, expect, it } from 'vitest'
import { PK_PATTERN, colLetter, parseBulkSheet, pasteToAoa } from '~/lib/bulk-parse'

describe('pasteToAoa', () => {
  it('줄 단위로 행을 만든다', () => {
    expect(pasteToAoa('주소\n서울시 A\n서울시 B')).toEqual([['주소'], ['서울시 A'], ['서울시 B']])
  })

  it('탭 구분 열을 보존한다(엑셀 표 복사)', () => {
    expect(pasteToAoa('주소\t비고\n서울시 A\t메모1')).toEqual([
      ['주소', '비고'],
      ['서울시 A', '메모1'],
    ])
  })

  it('CRLF·빈 줄·앞뒤 공백을 정리한다', () => {
    expect(pasteToAoa('서울시 A\r\n\r\n  서울시 B  \n\n')).toEqual([['서울시 A'], ['서울시 B']])
  })

  it('탭만 있는 줄은 빈 줄로 취급한다', () => {
    expect(pasteToAoa('\t\t\n서울시 A')).toEqual([['서울시 A']])
  })

  it('parseBulkSheet와 이어 쓰면 헤더·중복 감지가 그대로 동작한다', () => {
    const r = parseBulkSheet(pasteToAoa('mgmBldPk\n11680-12777\n11680-12777'))
    expect(r.hadHeader).toBe(true)
    expect(r.rows).toHaveLength(2)
    expect(r.rows[1]!.invalid).toBe('duplicate')
  })
})

describe('PK_PATTERN', () => {
  it('숫자·하이픈 조합만 PK로 인정한다', () => {
    expect(PK_PATTERN.test('11680-12777')).toBe(true)
    expect(PK_PATTERN.test('12345')).toBe(true)
    expect(PK_PATTERN.test('mgmBldPk')).toBe(false)
    expect(PK_PATTERN.test('건축물대장 PK')).toBe(false)
    expect(PK_PATTERN.test('')).toBe(false)
  })
})

describe('parseBulkSheet', () => {
  it('1행 A열이 PK 형식이 아니면 헤더로 간주하고 건너뛴다', () => {
    const { hadHeader, rows } = parseBulkSheet([['mgmBldPk'], ['11680-12777'], ['11680-12778']])
    expect(hadHeader).toBe(true)
    expect(rows).toHaveLength(2)
    expect(rows[0]!.pk).toBe('11680-12777')
  })

  it('1행 A열이 PK 형식이면 데이터로 취급한다', () => {
    const { hadHeader, rows } = parseBulkSheet([['11680-12777'], ['11680-12778']])
    expect(hadHeader).toBe(false)
    expect(rows).toHaveLength(2)
  })

  it('빈값 행은 invalid=empty + status=error로 표시한다', () => {
    const { rows } = parseBulkSheet([['11680-12777'], [''], ['11680-12778']])
    expect(rows[1]!.invalid).toBe('empty')
    expect(rows[1]!.status).toBe('error')
    expect(rows[1]!.errorMsg).toContain('비어')
  })

  it('중복 PK는 두 번째부터 invalid=duplicate로 표시하되 status는 pending 유지', () => {
    const { rows } = parseBulkSheet([['11680-12777'], ['11680-12777']])
    expect(rows[0]!.invalid).toBeUndefined()
    expect(rows[1]!.invalid).toBe('duplicate')
    expect(rows[1]!.status).toBe('pending')
  })

  it('A열 값의 앞뒤 공백을 제거하고 seq는 1부터 매긴다', () => {
    const { rows } = parseBulkSheet([[' 11680-12777 ']])
    expect(rows[0]!.pk).toBe('11680-12777')
    expect(rows[0]!.seq).toBe(1)
  })

  it('빈 시트는 빈 결과를 반환한다', () => {
    const { hadHeader, extraHeaders, rows } = parseBulkSheet([])
    expect(hadHeader).toBe(false)
    expect(extraHeaders).toEqual([])
    expect(rows).toHaveLength(0)
  })
})

describe('원본 컬럼 보존 (extraHeaders / extra)', () => {
  it('헤더가 있으면 B열~ 헤더를 그대로 쓰고 행의 원본 셀 값을 보존한다', () => {
    const { extraHeaders, rows } = parseBulkSheet([
      ['mgmBldPk', '건물명', '비고'],
      ['11680-12777', '본관', 123],
      ['11680-12778'],
    ])
    expect(extraHeaders).toEqual(['건물명', '비고'])
    expect(rows[0]!.extra).toEqual(['본관', '123'])
    // 짧은 행은 빈 문자열로 채워 열 수를 맞춘다
    expect(rows[1]!.extra).toEqual(['', ''])
  })

  it('헤더가 없거나 헤더 셀이 비면 열 문자로 컬럼명을 대체한다', () => {
    expect(parseBulkSheet([['11680-12777', '메모']]).extraHeaders).toEqual(['B열'])
    expect(parseBulkSheet([['mgmBldPk', '', 'C컬럼'], ['11680-12777']]).extraHeaders).toEqual([
      'B열',
      'C컬럼',
    ])
  })

  it('A열만 있는 시트는 extraHeaders가 비고 행의 extra는 생략된다', () => {
    const { extraHeaders, rows } = parseBulkSheet([['11680-12777']])
    expect(extraHeaders).toEqual([])
    expect(rows[0]!.extra).toBeUndefined()
  })

  it('colLetter는 Z 다음 AA로 이어진다', () => {
    expect(colLetter(0)).toBe('A')
    expect(colLetter(1)).toBe('B')
    expect(colLetter(25)).toBe('Z')
    expect(colLetter(26)).toBe('AA')
    expect(colLetter(27)).toBe('AB')
  })
})

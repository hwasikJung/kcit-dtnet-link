import { describe, expect, it } from 'vitest'
import { PK_PATTERN, parseBulkSheet } from '~/lib/bulk-parse'

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
    const { hadHeader, rows } = parseBulkSheet([])
    expect(hadHeader).toBe(false)
    expect(rows).toHaveLength(0)
  })
})

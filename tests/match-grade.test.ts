import { describe, expect, it } from 'vitest'
import { GRADE_DISCLAIMER, describeGrade, describeLevel } from '~/lib/match-grade'

describe('describeGrade', () => {
  it('M1~M3 잠정 설명을 반환한다', () => {
    expect(describeGrade('M1')?.short).toBe('단일 건물 확정')
    expect(describeGrade('M2')?.short).toBe('복수 건물 매칭')
    expect(describeGrade('M3')?.short).toBe('대장 정보 없음')
  })

  it('공백·소문자 입력도 허용한다', () => {
    expect(describeGrade(' m1 ')?.short).toBe('단일 건물 확정')
  })

  it('알 수 없는 등급은 null — 지어내지 않는다', () => {
    expect(describeGrade('M9')).toBeNull()
    expect(describeGrade('')).toBeNull()
  })

  it('잠정 설명 고지 문구가 있다', () => {
    expect(GRADE_DISCLAIMER).toContain('잠정')
  })
})

describe('describeLevel', () => {
  it('CASE### 형식이면 공통 설명을 반환한다', () => {
    expect(describeLevel('CASE102')).toBe('세부 매칭 경로 코드')
    expect(describeLevel(' case205 ')).toBe('세부 매칭 경로 코드')
  })

  it('형식이 다르면 빈 문자열', () => {
    expect(describeLevel('CASE')).toBe('')
    expect(describeLevel('102')).toBe('')
    expect(describeLevel('')).toBe('')
  })
})

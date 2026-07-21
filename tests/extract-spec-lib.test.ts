import { describe, expect, it } from 'vitest'
// @ts-expect-error — 타입 선언 없는 순수 JS 모듈
import { cleanSummary, sliceJsonObject, statusFlagOf } from '../scripts/extract-spec-lib.mjs'

describe('sliceJsonObject', () => {
  it('중괄호 매칭으로 JSON 오브젝트 구간을 잘라낸다', () => {
    const text = 'var x = {"a": {"b": 1}, "c": [2]}; more'
    const start = text.indexOf('{')
    expect(JSON.parse(sliceJsonObject(text, start))).toEqual({ a: { b: 1 }, c: [2] })
  })

  it('문자열 안의 중괄호·이스케이프 따옴표를 무시한다', () => {
    const text = '{"s": "닫는 } 괄호와 \\" 따옴표"}'
    expect(JSON.parse(sliceJsonObject(text, 0))).toEqual({ s: '닫는 } 괄호와 " 따옴표' })
  })

  it('닫히지 않은 오브젝트는 오류를 던진다', () => {
    expect(() => sliceJsonObject('{"a": 1', 0)).toThrow()
  })
})

describe('statusFlagOf / cleanSummary', () => {
  it('(수정예정)/(삭제예정) 접두를 플래그로 파싱한다', () => {
    expect(statusFlagOf('(수정예정) PNU로 매칭')).toBe('modify-planned')
    expect(statusFlagOf('(삭제예정) 월별 에너지')).toBe('delete-planned')
    expect(statusFlagOf('주소 정제')).toBeNull()
  })

  it('cleanSummary는 접두를 제거하고 trim한다', () => {
    expect(cleanSummary('(수정예정) PNU로 매칭')).toBe('PNU로 매칭')
    expect(cleanSummary('(삭제예정) 월별 에너지')).toBe('월별 에너지')
    expect(cleanSummary('주소 정제')).toBe('주소 정제')
  })
})

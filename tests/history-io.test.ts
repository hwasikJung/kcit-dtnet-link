import { describe, expect, it } from 'vitest'
import { parseBulkHistoryFile, serializeBulkHistory } from '~/lib/history-io'
import type { BulkResultRecord } from '~/types/bulk'

const RECORD: BulkResultRecord = {
  id: 'r1',
  fileName: '샘플.xlsx',
  createdAt: 1753679000000,
  total: 1,
  success: 1,
  notfound: 0,
  error: 0,
  rows: [{ seq: 1, pk: '11680-12777', status: 'success', cols: { bldNm: '테스트' } }],
  kind: 'info',
  extraHeaders: ['비고'],
}

describe('serializeBulkHistory / parseBulkHistoryFile', () => {
  it('내보낸 파일을 그대로 다시 파싱한다(라운드트립)', () => {
    const text = serializeBulkHistory([RECORD], 1753680000000)
    const { records, skipped } = parseBulkHistoryFile(text)
    expect(records).toEqual([RECORD])
    expect(skipped).toBe(0)
  })

  it('이력 이름(label)도 내보내기/가져오기에서 보존된다', () => {
    const labeled: BulkResultRecord = { ...RECORD, label: '3월분 시설물' }
    const { records } = parseBulkHistoryFile(serializeBulkHistory([labeled], 0))
    expect(records[0]?.label).toBe('3월분 시설물')
  })

  it('JSON이 아니면 오류', () => {
    expect(() => parseBulkHistoryFile('not json')).toThrow('JSON 파일이 아닙니다.')
  })

  it('다른 JSON(형식 식별자 불일치)이면 오류', () => {
    expect(() => parseBulkHistoryFile('{"foo":1}')).toThrow(
      '이 모듈에서 내보낸 이력 파일이 아닙니다.',
    )
    expect(() => parseBulkHistoryFile(JSON.stringify({ kind: 'other', records: [] }))).toThrow(
      '이 모듈에서 내보낸 이력 파일이 아닙니다.',
    )
  })

  it('필수 필드가 깨진 레코드는 건너뛰고 집계한다', () => {
    const text = JSON.stringify({
      kind: 'dtent-link/bulk-history',
      version: 1,
      exportedAt: 0,
      records: [RECORD, { id: '' }, { fileName: 'x' }, null],
    })
    const { records, skipped } = parseBulkHistoryFile(text)
    expect(records).toEqual([RECORD])
    expect(skipped).toBe(3)
  })

  it('깨진 행이 섞인 레코드는 통째로 건너뛴다', () => {
    const broken = { ...RECORD, id: 'r2', rows: [{ seq: 1 }] }
    const text = JSON.stringify({
      kind: 'dtent-link/bulk-history',
      version: 1,
      exportedAt: 0,
      records: [RECORD, broken],
    })
    const { records, skipped } = parseBulkHistoryFile(text)
    expect(records).toEqual([RECORD])
    expect(skipped).toBe(1)
  })

  it('상위 버전에서 내보낸 파일은 거부한다', () => {
    const text = JSON.stringify({
      kind: 'dtent-link/bulk-history',
      version: 2,
      exportedAt: 0,
      records: [RECORD],
    })
    expect(() => parseBulkHistoryFile(text)).toThrow('상위 버전')
  })
})

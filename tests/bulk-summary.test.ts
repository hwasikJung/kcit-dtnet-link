import { describe, expect, it } from 'vitest'
import { aggregateBulkStats, buildBulkSummary } from '~/lib/bulk-summary'
import type { BulkRow, BulkRowStatus } from '~/types/bulk'

const LABELS: Record<BulkRowStatus, string> = {
  pending: '대기',
  success: '성공',
  notfound: '매칭 실패',
  error: '실패',
}
const META = { fileName: '주소목록.xlsx', processedAt: '2026-08-14 15:00' }

function row(over: Partial<BulkRow>): BulkRow {
  return { seq: 1, pk: 'x', status: 'success', cols: {}, ...over }
}

/** AoA에서 첫 열이 name인 행의 둘째 열 값 */
function cell(aoa: (string | number)[][], name: string) {
  return aoa.find((r) => r[0] === name)?.[1]
}

describe('aggregateBulkStats', () => {
  it('상태·입력 오류·사유 분포를 집계한다', () => {
    const stats = aggregateBulkStats([
      row({ status: 'success' }),
      row({ status: 'success', invalid: 'duplicate' }),
      row({ status: 'notfound', errorMsg: '사유A' }),
      row({ status: 'notfound', errorMsg: '사유A' }),
      row({ status: 'error', invalid: 'empty', errorMsg: '사유B' }),
      row({ status: 'pending' }),
    ])
    expect(stats.total).toBe(6)
    expect(stats.counts).toEqual({ pending: 1, success: 2, notfound: 2, error: 1 })
    expect(stats.emptyCount).toBe(1)
    expect(stats.dupCount).toBe(1)
    // 사유는 건수 내림차순, 성공 행의 errorMsg는 무시
    expect(stats.reasons).toEqual([
      { msg: '사유A', count: 2 },
      { msg: '사유B', count: 1 },
    ])
  })

  it('빈 목록이면 전부 0', () => {
    const stats = aggregateBulkStats([])
    expect(stats.total).toBe(0)
    expect(stats.counts).toEqual({ pending: 0, success: 0, notfound: 0, error: 0 })
    expect(stats.reasons).toEqual([])
  })
})

describe('buildBulkSummary', () => {
  it('파일·일시·상태별 건수를 집계한다', () => {
    const aoa = buildBulkSummary(
      [
        row({ status: 'success' }),
        row({ status: 'success' }),
        row({ status: 'notfound', errorMsg: '주소와 일치하는 건축물대장을 찾지 못했습니다.' }),
        row({ status: 'error', errorMsg: '처리 중 오류가 발생했습니다.' }),
      ],
      LABELS,
      META,
    )
    expect(cell(aoa, '파일')).toBe('주소목록.xlsx')
    expect(cell(aoa, '처리 일시')).toBe('2026-08-14 15:00')
    expect(cell(aoa, '총 행수')).toBe(4)
    expect(cell(aoa, '성공')).toBe(2)
    expect(cell(aoa, '매칭 실패')).toBe(1)
    expect(cell(aoa, '실패')).toBe(1)
    // 대기 0건은 표기하지 않는다
    expect(cell(aoa, '대기')).toBeUndefined()
  })

  it('입력 오류(빈값·중복)는 있을 때만 별도 행으로 표기한다', () => {
    const aoa = buildBulkSummary(
      [
        row({ status: 'error', invalid: 'empty', errorMsg: 'A열 값이 비어 있습니다.' }),
        row({ status: 'success', invalid: 'duplicate' }),
        row({ status: 'success' }),
      ],
      LABELS,
      META,
    )
    expect(cell(aoa, '입력 오류(빈값)')).toBe(1)
    expect(cell(aoa, '중복 입력(결과는 동일 처리)')).toBe(1)

    const clean = buildBulkSummary([row({})], LABELS, META)
    expect(cell(clean, '입력 오류(빈값)')).toBeUndefined()
    expect(cell(clean, '중복 입력(결과는 동일 처리)')).toBeUndefined()
  })

  it('실패·미매칭 사유를 건수 내림차순으로 집계한다', () => {
    const aoa = buildBulkSummary(
      [
        row({ status: 'notfound', errorMsg: '사유A' }),
        row({ status: 'notfound', errorMsg: '사유A' }),
        row({ status: 'error', errorMsg: '사유B' }),
        row({ status: 'success', errorMsg: '성공 행의 메시지는 무시' }),
      ],
      LABELS,
      META,
    )
    const start = aoa.findIndex((r) => r[0] === '실패·미매칭 사유')
    expect(start).toBeGreaterThan(0)
    expect(aoa[start + 1]).toEqual(['사유A', 2])
    expect(aoa[start + 2]).toEqual(['사유B', 1])
  })

  it('사유가 15종을 넘으면 초과분을 기타로 묶는다', () => {
    const rows = Array.from({ length: 20 }, (_, i) =>
      row({ status: 'notfound', errorMsg: `사유${i}` }),
    )
    const aoa = buildBulkSummary(rows, LABELS, META)
    expect(cell(aoa, '기타 (사유 5종)')).toBe(5)
    // 사유 행은 상한 15 + 기타 1
    const start = aoa.findIndex((r) => r[0] === '실패·미매칭 사유')
    expect(aoa.length - (start + 1)).toBe(16)
  })

  it('사유가 없으면 사유 섹션 자체를 넣지 않는다', () => {
    const aoa = buildBulkSummary([row({})], LABELS, META)
    expect(aoa.some((r) => r[0] === '실패·미매칭 사유')).toBe(false)
  })
})

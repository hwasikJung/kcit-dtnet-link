// 메뉴2(엑셀 일괄 조회) 업로드 시트 파싱 — 헤더 자동 감지 + 행별 유효성(빈값/중복) 판정
import type { BulkRow } from '~/types/bulk'

/** PK/표준연계키 형식(숫자·하이픈, R_/T_ 접두 허용). 1행 A열이 이 형식이 아니면 헤더로 간주한다 */
export const PK_PATTERN = /^([RT]_)?[\d-]+$/i

/** 열 인덱스(0=A) → 엑셀 열 문자(A~Z, AA~) — 헤더 없는 업로드의 원본 컬럼명 대체에 사용 */
export function colLetter(index: number): string {
  let n = index
  let s = ''
  do {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return s
}

/** 업로드 시트의 B열~ 원본 컬럼 헤더 목록 — 헤더가 없거나 셀이 비면 열 문자("B열")로 대체.
 * 열 수는 전체 행(헤더 포함) 중 가장 넓은 행 기준 */
export function extractExtraHeaders(aoa: unknown[][], hadHeader: boolean): string[] {
  const width = aoa.reduce((w, r) => Math.max(w, r?.length ?? 0), 0) - 1
  if (width <= 0) return []
  const header = hadHeader ? aoa[0] : undefined
  return Array.from({ length: width }, (_, i) => {
    const label = String(header?.[i + 1] ?? '').trim()
    return label || `${colLetter(i + 1)}열`
  })
}

/** 데이터 행의 B열~ 원본 셀 값 — width 길이만큼 채운다(빈 셀은 빈 문자열). width 0이면 생략 */
export function extraCells(r: unknown[] | undefined, width: number): string[] | undefined {
  if (!width) return undefined
  return Array.from({ length: width }, (_, i) => String(r?.[i + 1] ?? ''))
}

/** 붙여넣은 텍스트 → 시트 AOA 변환 — 줄 = 행, 탭 = 열 구분(엑셀 표 복사 호환).
 * 완전히 빈 줄은 건너뛴다(주소에 콤마가 흔해 콤마는 구분자로 쓰지 않는다) */
export function pasteToAoa(text: string): string[][] {
  return text
    .split(/\r\n|\r|\n/)
    .map((line) => line.split('\t').map((c) => c.trim()))
    .filter((cells) => cells.some((c) => c !== ''))
}

/** 시트 AOA(배열의 배열) → 헤더 감지 결과 + 원본 B열~ 헤더 + 조회 전 상태의 BulkRow 목록 */
export function parseBulkSheet(aoa: unknown[][]): {
  hadHeader: boolean
  extraHeaders: string[]
  rows: BulkRow[]
} {
  const firstA = String(aoa[0]?.[0] ?? '').trim()
  const hadHeader = aoa.length > 0 && !PK_PATTERN.test(firstA)
  const dataRows = hadHeader ? aoa.slice(1) : aoa
  const extraHeaders = extractExtraHeaders(aoa, hadHeader)

  const seen = new Set<string>()
  const rows = dataRows.map((r, i) => {
    const pk = String(r?.[0] ?? '').trim()
    let invalid: BulkRow['invalid']
    if (!pk) invalid = 'empty'
    else if (seen.has(pk)) invalid = 'duplicate'
    else seen.add(pk)
    return {
      seq: i + 1,
      pk,
      invalid,
      status: invalid === 'empty' ? 'error' : 'pending',
      cols: {},
      extra: extraCells(r, extraHeaders.length),
      errorMsg: invalid === 'empty' ? 'A열 값이 비어 있습니다.' : undefined,
    } satisfies BulkRow
  })

  return { hadHeader, extraHeaders, rows }
}

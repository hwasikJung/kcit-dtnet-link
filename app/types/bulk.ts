export type BulkRowStatus = 'pending' | 'success' | 'notfound' | 'error'

export interface BulkRow {
  /** 엑셀 데이터 행 순번 (1부터) */
  seq: number
  /** A열 원본 값 (trim) */
  pk: string
  /** 빈값/중복 등 입력 유효성 표시 */
  invalid?: 'empty' | 'duplicate'
  status: BulkRowStatus
  /** B열~ 매핑 컬럼 (key → 표시 값) */
  cols: Record<string, string>
  /** 원본 응답 JSON (상세 Modal 용) */
  raw?: unknown
  errorMsg?: string
}

export interface BulkResultRecord {
  id: string
  fileName: string
  createdAt: number
  total: number
  success: number
  notfound: number
  error: number
  rows: BulkRow[]
}

/** 이력 목록 표시용 (rows 제외) */
export type BulkHistoryMeta = Omit<BulkResultRecord, 'rows'>

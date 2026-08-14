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
  /** 업로드 원본 B열~ 셀 값 — 결과 엑셀 다운로드에서 원본 컬럼 보존에 사용 */
  extra?: string[]
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
  /** 처리 종류 — 'keygen'=주소→키 일괄 생성, 'info'=PK→표준연계키 조회(없는 과거 레코드 포함) */
  kind?: 'info' | 'keygen'
  /** 업로드 원본 B열~ 헤더 — rows[].extra와 짝. 없는 과거 레코드는 원본 컬럼 없음 */
  extraHeaders?: string[]
  /** 사용자가 붙인 이력 이름 — 목록·Modal에서 파일명 대신 표시(파일명은 보조 표기) */
  label?: string
}

/** 이력 목록 표시용 (rows 제외) */
export type BulkHistoryMeta = Omit<BulkResultRecord, 'rows'>

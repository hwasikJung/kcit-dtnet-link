// 메뉴2 일괄처리 이력(IndexedDB)의 파일 내보내기/가져오기 — 직렬화·검증 순수 로직
import type { BulkResultRecord } from '~/types/bulk'

/** 내보내기 파일 포맷 식별자 — 다른 JSON을 잘못 가져오는 사고 방지 */
const FILE_KIND = 'dtent-link/bulk-history'
const FILE_VERSION = 1

export interface HistoryFile {
  kind: typeof FILE_KIND
  version: number
  exportedAt: number
  records: BulkResultRecord[]
}

export function serializeBulkHistory(records: BulkResultRecord[], exportedAt: number): string {
  const file: HistoryFile = { kind: FILE_KIND, version: FILE_VERSION, exportedAt, records }
  return JSON.stringify(file)
}

/** 레코드 최소 형태 검증 — 필수 필드가 깨진 레코드는 건너뛴다 */
function isRecord(v: unknown): v is BulkResultRecord {
  if (!v || typeof v !== 'object') return false
  const r = v as Record<string, unknown>
  return (
    typeof r.id === 'string' &&
    r.id.length > 0 &&
    typeof r.fileName === 'string' &&
    typeof r.createdAt === 'number' &&
    Array.isArray(r.rows)
  )
}

/**
 * 가져오기 파일 파싱 — 형식이 아니면 한국어 메시지로 throw, 깨진 레코드는 skipped로 집계.
 * (JSON.parse 실패 / kind 불일치 / records 배열 아님 모두 오류)
 */
export function parseBulkHistoryFile(text: string): {
  records: BulkResultRecord[]
  skipped: number
} {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('JSON 파일이 아닙니다.')
  }
  const file = data as Partial<HistoryFile>
  if (file?.kind !== FILE_KIND || !Array.isArray(file.records)) {
    throw new Error('이 모듈에서 내보낸 이력 파일이 아닙니다.')
  }
  const records = file.records.filter(isRecord)
  return { records, skipped: file.records.length - records.length }
}

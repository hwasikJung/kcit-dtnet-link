/**
 * 매칭 등급(M1~M3)·세부 코드(CASE###)의 한글 설명 — **SQI 공식 정의 확정 전의 잠정 설명**이다.
 * 공식 정의를 받으면 이 파일의 문구만 교체한다.
 *
 * 잠정 설명의 근거(2026-07-28 실서버 관찰):
 * - M1은 관찰된 모든 케이스에서 표제부 1건으로 확정(도로명·지번 입력 모두 CASE102, 총괄 단지는 CASE101)
 * - M2는 같은 주소에 표제부 다건(홍은동 455 = 총괄 2·표제부 21건 CASE202, 세종대로 110 = 표제부 2건 CASE205)
 * - M3는 매칭은 되었지만 PK 0건(대장 미등재 — 키 생성 홈에서는 실패 안내로 처리, T5.12)
 */
export interface GradeInfo {
  /** 코드 옆 한 줄 표기 (예: "단일 건물 확정") */
  short: string
  /** 툴팁 본문 설명 */
  desc: string
}

export const GRADE_DISCLAIMER = '공식 등급 정의 확정 전의 잠정 설명입니다.'

const GRADES: Record<string, GradeInfo> = {
  M1: {
    short: '단일 건물 확정',
    desc: '주소가 건축물대장의 건물(표제부) 1건으로 정확히 확정된, 신뢰도가 가장 높은 매칭입니다.',
  },
  M2: {
    short: '복수 건물 매칭',
    desc: '주소는 확인되었지만 해당 주소에 건물(표제부)이 여러 건 등재되어 목록으로 매칭되었습니다. 목록에서 대상 건물을 확인해 사용하세요.',
  },
  M3: {
    short: '대장 정보 없음',
    desc: '주소는 찾았지만 연계된 건축물대장 정보가 등재되어 있지 않습니다.',
  },
}

export function describeGrade(grade: string): GradeInfo | null {
  return GRADES[grade.trim().toUpperCase()] ?? null
}

/** CASE### 세부 코드 — 개별 코드별 정의는 미확보라 공통 설명만 제공한다 */
export function describeLevel(level: string): string {
  return /^CASE\d+$/i.test(level.trim()) ? '세부 매칭 경로 코드' : ''
}

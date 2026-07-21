// extract-spec.mjs의 순수 헬퍼 모듈 — 스크립트 본문과 분리해 테스트에서 import 가능하게 한다

/** 문자열을 인지하는 중괄호 매칭으로 JSON 오브젝트 구간을 잘라낸다 */
export function sliceJsonObject(text, startIdx) {
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = startIdx; i < text.length; i++) {
    const c = text[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') inStr = true
    else if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return text.slice(startIdx, i + 1)
    }
  }
  throw new Error('swaggerDoc JSON 구간을 찾지 못했습니다.')
}

export function statusFlagOf(summary = '') {
  if (summary.includes('(수정예정)')) return 'modify-planned'
  if (summary.includes('(삭제예정)')) return 'delete-planned'
  return null
}

export function cleanSummary(summary = '') {
  return summary.replace(/\((수정예정|삭제예정)\)/g, '').trim()
}

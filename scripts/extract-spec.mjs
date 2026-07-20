// 대상 API의 Swagger 스펙 추출 스크립트
// 표준 스펙 엔드포인트(/v3/api-docs 등)가 없어 swagger-ui-init.js 안의
// 인라인 swaggerDoc(JSON)을 파싱해 정적 스냅샷으로 저장한다.
//
// 사용법: npm run extract-spec
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ORIGIN = process.env.NUXT_API_TARGET_ORIGIN ?? 'http://220.76.251.227:9930'
const INIT_JS_URL = `${ORIGIN}/api-docs/swagger-ui-init.js`

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_SPEC = resolve(root, 'app/data/api-spec.json')
const OUT_RAW = resolve(root, 'app/data/swagger-raw.json')

/** 문자열을 인지하는 중괄호 매칭으로 JSON 오브젝트 구간을 잘라낸다 */
function sliceJsonObject(text, startIdx) {
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

function statusFlagOf(summary = '') {
  if (summary.includes('(수정예정)')) return 'modify-planned'
  if (summary.includes('(삭제예정)')) return 'delete-planned'
  return null
}

function cleanSummary(summary = '') {
  return summary.replace(/\((수정예정|삭제예정)\)/g, '').trim()
}

console.log(`fetch: ${INIT_JS_URL}`)
const res = await fetch(INIT_JS_URL)
if (!res.ok) throw new Error(`swagger-ui-init.js 조회 실패: HTTP ${res.status}`)
const text = await res.text()

const keyIdx = text.indexOf('"swaggerDoc"')
if (keyIdx < 0) throw new Error('"swaggerDoc" 키를 찾지 못했습니다.')
const objStart = text.indexOf('{', keyIdx)
const doc = JSON.parse(sliceJsonObject(text, objStart))

const endpoints = []
for (const [path, methods] of Object.entries(doc.paths ?? {})) {
  for (const [method, op] of Object.entries(methods)) {
    const params = (op.parameters ?? []).map((p) => ({
      name: p.name,
      in: p.in,
      required: !!p.required,
      type: p.schema?.type ?? 'string',
      description: p.description ?? '',
    }))
    const body = op.requestBody?.content
      ? Object.entries(op.requestBody.content).map(([contentType, c]) => ({
          contentType,
          schema: c.schema ?? null,
        }))
      : null
    endpoints.push({
      tag: op.tags?.[0] ?? '기타',
      method: method.toUpperCase(),
      path,
      summary: cleanSummary(op.summary),
      rawSummary: op.summary ?? '',
      description: op.description ?? '',
      statusFlag: statusFlagOf(op.summary),
      params,
      body,
    })
  }
}

const tags = [...new Set(endpoints.map((e) => e.tag))]
const snapshot = {
  source: INIT_JS_URL,
  extractedAt: new Date().toISOString(),
  info: doc.info ?? {},
  openapi: doc.openapi ?? '',
  tagOrder: tags,
  endpointCount: endpoints.length,
  endpoints,
}

mkdirSync(dirname(OUT_SPEC), { recursive: true })
writeFileSync(OUT_RAW, JSON.stringify(doc, null, 2), 'utf8')
writeFileSync(OUT_SPEC, JSON.stringify(snapshot, null, 2), 'utf8')

console.log(`endpoints: ${endpoints.length}, tags: ${tags.length}`)
console.log(`saved: ${OUT_SPEC}`)
console.log(`saved: ${OUT_RAW}`)

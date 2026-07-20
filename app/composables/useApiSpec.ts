import spec from '~/data/api-spec.json'
import type { ApiEndpoint } from '~/types/api'

// 메뉴1(API 테스트 콘솔)에서 노출하지 않는 태그 — 스펙 스냅샷에는 유지
const EXCLUDED_TAGS = ['TTA', '에너지매칭']

export function useApiSpec() {
  const endpoints = (spec.endpoints as ApiEndpoint[]).filter((e) => !EXCLUDED_TAGS.includes(e.tag))
  const tagOrder = (spec.tagOrder as string[]).filter((t) => !EXCLUDED_TAGS.includes(t))
  return { endpoints, tagOrder, info: spec.info }
}

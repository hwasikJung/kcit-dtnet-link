import spec from '~/data/api-spec.json'
import type { ApiEndpoint } from '~/types/api'

export function useApiSpec() {
  const endpoints = spec.endpoints as ApiEndpoint[]
  const tagOrder = spec.tagOrder as string[]
  return { endpoints, tagOrder, info: spec.info }
}

// 대상 API 서버로의 동일 출처 프록시 (CORS / Mixed Content 회피)
// 화이트리스트(apiAllowedPrefix) 밖 경로는 거부 — SSRF 방지
export default defineEventHandler(async (event) => {
  const { apiTargetOrigin, apiAllowedPrefix } = useRuntimeConfig(event)

  const rawPath = event.context.params?.path ?? ''
  const path = '/' + (Array.isArray(rawPath) ? rawPath.join('/') : rawPath)

  if (path.includes('..') || path.includes('//')) {
    throw createError({ statusCode: 400, message: '잘못된 경로입니다.' })
  }
  if (path !== apiAllowedPrefix && !path.startsWith(apiAllowedPrefix + '/')) {
    throw createError({ statusCode: 403, message: '허용되지 않은 경로입니다.' })
  }

  const search = getRequestURL(event).search
  return proxyRequest(event, apiTargetOrigin + path + search)
})

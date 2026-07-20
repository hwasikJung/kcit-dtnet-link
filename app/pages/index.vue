<script setup lang="ts">
import type { ApiEndpoint } from '~/types/api'
import type { RunResult } from '~/components/ResultPanel.vue'

const { endpoints, tagOrder } = useApiSpec()

const selected = ref<ApiEndpoint | null>(null)
const loading = ref(false)
const result = ref<RunResult | null>(null)

function select(e: ApiEndpoint) {
  selected.value = e
  result.value = null
}

async function run(values: Record<string, string | boolean>, file: File | null) {
  const e = selected.value
  if (!e) return

  // path 파라미터 치환
  let path = e.path.replace(/\{(\w+)\}/g, (_, k: string) =>
    encodeURIComponent(String(values[k] ?? '')),
  )

  // query 파라미터 구성 (빈 값 제외, boolean은 체크 시에만 전송)
  const query: Record<string, string> = {}
  for (const p of e.params) {
    if (p.in !== 'query') continue
    const v = values[p.name]
    if (typeof v === 'boolean') {
      if (v) query[p.name] = 'true'
    } else if (String(v ?? '').trim()) {
      query[p.name] = String(v)
    }
  }

  const url = '/api/proxy' + path
  loading.value = true
  const started = performance.now()
  try {
    let body: FormData | undefined
    if (file) {
      body = new FormData()
      body.append('csvfile', file)
    }
    const res = await $fetch.raw(url, { method: e.method as any, query, body })
    result.value = {
      status: res.status,
      elapsedMs: Math.round(performance.now() - started),
      data: res._data,
      errorMsg: '',
      url: path,
    }
  } catch (err: any) {
    result.value = {
      status: err?.statusCode ?? null,
      elapsedMs: Math.round(performance.now() - started),
      data: err?.data ?? null,
      errorMsg: err?.data?.message ?? err?.message ?? '알 수 없는 오류',
      url: path,
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <!-- 데스크톱(lg~): 좌우 2분할 고정 높이 / 태블릿·모바일: 상하 스택 + 페이지 스크롤 -->
  <main
    class="mx-auto flex w-full max-w-screen-2xl flex-col lg:grid lg:h-[calc(100vh-3.5rem)] lg:grid-cols-[minmax(340px,420px)_1fr]"
  >
    <!-- 호출 영역 -->
    <section class="flex flex-col border-b lg:min-h-0 lg:border-b-0 lg:border-r">
      <div
        class="h-[45dvh] overflow-hidden border-b lg:h-auto lg:min-h-0 lg:flex-1"
        :class="selected ? 'lg:basis-1/2' : ''"
      >
        <ApiList :endpoints="endpoints" :tag-order="tagOrder" :selected="selected" @select="select" />
      </div>
      <div v-if="selected" class="overflow-y-auto lg:min-h-0 lg:basis-1/2">
        <ParamForm :endpoint="selected" :loading="loading" @run="run" />
      </div>
    </section>

    <!-- 결과 영역 -->
    <section class="min-h-[40dvh] lg:min-h-0">
      <ResultPanel :result="result" :loading="loading" />
    </section>
  </main>
</template>

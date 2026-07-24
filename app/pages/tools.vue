<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogScrollContent,
  DialogTitle,
} from '@/components/ui/dialog'
import type { ApiEndpoint } from '~/types/api'
import type { RunResult } from '~/components/ResultPanel.vue'
import type { CallHistoryItem } from '~/composables/useCallHistory'

const { endpoints, tagOrder } = useApiSpec()
const callHistory = useCallHistory()

const selected = ref<ApiEndpoint | null>(null)
const loading = ref(false)
const result = ref<RunResult | null>(null)
const resultSection = ref<HTMLElement | null>(null)

// 이력 복원용 — restoreValues가 있으면 ParamForm을 리마운트(formKey)해 초기값을 주입한다
const restoreValues = ref<Record<string, string | boolean> | null>(null)
const formKey = ref(0)
const historyOpen = ref(false)

// 키 생성 페이지 등 외부에서 ?path=<엔드포인트 경로>&<파라미터>=<값> 으로 진입하면
// 해당 기능을 선택하고 파라미터를 프리필한다. run=1이면 필수값이 모두 채워진 경우 즉시 실행까지 한다.
const route = useRoute()
onMounted(() => {
  callHistory.refresh()
  const path = route.query.path
  if (typeof path !== 'string') return
  const e = endpoints.find((x) => x.path === path)
  if (!e) return
  const values: Record<string, string | boolean> = {}
  for (const [k, v] of Object.entries(route.query)) {
    if (k !== 'path' && k !== 'run' && typeof v === 'string') values[k] = v
  }
  selected.value = e
  restoreValues.value = values
  formKey.value++

  const isMultipart = (e.body ?? []).some((b) => b.contentType.includes('multipart'))
  const requiredFilled = e.params.every(
    (p) => !p.required || p.type === 'boolean' || String(values[p.name] ?? '').trim(),
  )
  if (route.query.run === '1' && !isMultipart && requiredFilled) run(values, null)
})

function select(e: ApiEndpoint) {
  selected.value = e
  restoreValues.value = null
  result.value = null
}

function restore(item: CallHistoryItem) {
  const e = endpoints.find((x) => x.method === item.method && x.path === item.path)
  if (!e) return
  selected.value = e
  restoreValues.value = { ...item.values }
  formKey.value++
  result.value = null
  historyOpen.value = false
}

function paramSummary(values: Record<string, string | boolean>) {
  return Object.entries(values)
    .filter(([, v]) => v !== '' && v !== false)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ')
}

function formatTime(ts: number) {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function run(values: Record<string, string | boolean>, file: File | null) {
  const e = selected.value
  if (!e) return

  // path 파라미터 치환
  const path = e.path.replace(/\{(\w+)\}/g, (_, k: string) =>
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

  const url = useRuntimeConfig().public.apiBase + path
  loading.value = true
  const started = performance.now()
  try {
    let body: FormData | undefined
    if (file) {
      body = new FormData()
      body.append('csvfile', file)
    }
    const res = await $fetch.raw(url, { method: e.method as 'GET' | 'POST', query, body })
    result.value = {
      status: res.status,
      elapsedMs: Math.round(performance.now() - started),
      data: res._data,
      errorMsg: '',
      url: path,
    }
  } catch (err) {
    const er = err as { statusCode?: number; data?: { message?: string } | null; message?: string }
    result.value = {
      status: er?.statusCode ?? null,
      elapsedMs: Math.round(performance.now() - started),
      data: er?.data ?? null,
      errorMsg: er?.data?.message ?? er?.message ?? '알 수 없는 오류',
      url: path,
    }
  } finally {
    loading.value = false
  }

  // 태블릿·모바일(상하 스택)에서는 결과가 화면 밖에 있으므로 결과 영역으로 스크롤
  if (window.matchMedia('(max-width: 1023px)').matches) {
    await nextTick()
    resultSection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  if (result.value) {
    callHistory.add({
      method: e.method,
      path: e.path,
      summary: e.summary,
      values: { ...values },
      status: result.value.status,
      elapsedMs: result.value.elapsedMs,
    })
  }
}
</script>

<template>
  <!-- 데스크톱(lg~): 좌우 2분할 고정 높이 / 태블릿·모바일: 상하 스택 + 페이지 스크롤
       -1px: 헤더 실제 높이 = h-14 + border-b -->
  <main
    class="mx-auto flex w-full max-w-screen-2xl flex-col lg:grid lg:h-[calc(100vh-3.5rem-1px)] lg:grid-cols-[minmax(340px,420px)_1fr]"
  >
    <!-- 호출 영역 -->
    <section class="flex flex-col border-b lg:min-h-0 lg:border-b-0 lg:border-r">
      <div class="flex items-center justify-between border-b px-3 py-1.5">
        <span class="text-xs font-medium text-muted-foreground">기능 목록</span>
        <Button variant="ghost" size="sm" class="h-7 text-xs" @click="historyOpen = true">
          최근 호출<template v-if="callHistory.items.value.length">
            ({{ callHistory.items.value.length }})</template
          >
        </Button>
      </div>
      <div
        class="h-[45dvh] overflow-hidden border-b lg:h-auto lg:min-h-0 lg:flex-1"
        :class="selected ? 'lg:basis-1/2' : ''"
      >
        <ApiList
          :endpoints="endpoints"
          :tag-order="tagOrder"
          :selected="selected"
          @select="select"
        />
      </div>
      <div v-if="selected" class="overflow-y-auto lg:min-h-0 lg:basis-1/2">
        <ParamForm
          :key="formKey"
          :endpoint="selected"
          :loading="loading"
          :initial-values="restoreValues"
          @run="run"
        />
      </div>
    </section>

    <!-- 결과 영역 (scroll-mt: 스크롤 이동 시 sticky 헤더에 가려지지 않게) -->
    <section ref="resultSection" class="min-h-[40dvh] scroll-mt-14 lg:min-h-0">
      <ResultPanel :result="result" :loading="loading" />
    </section>

    <!-- 최근 호출 이력 Modal -->
    <Dialog v-model:open="historyOpen">
      <DialogScrollContent class="max-w-2xl">
        <DialogHeader>
          <DialogTitle>최근 호출</DialogTitle>
          <DialogDescription>
            이 브라우저에서 최근 호출한 기능입니다. 항목을 클릭하면 파라미터가 복원됩니다.
          </DialogDescription>
        </DialogHeader>
        <p
          v-if="!callHistory.items.value.length"
          class="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground"
        >
          아직 호출 이력이 없습니다. 기능을 실행하면 자동으로 기록됩니다.
        </p>
        <template v-else>
          <div class="flex justify-end">
            <Button variant="ghost" size="sm" @click="callHistory.clear()">전체 삭제</Button>
          </div>
          <ul class="divide-y rounded-lg border">
            <li
              v-for="item in callHistory.items.value"
              :key="item.id"
              tabindex="0"
              class="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-primary/5 focus-visible:bg-primary/5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
              @click="restore(item)"
              @keydown.enter.prevent="restore(item)"
              @keydown.space.prevent="restore(item)"
            >
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium">{{ item.summary }}</p>
                <p class="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                  {{ item.path }}
                </p>
                <p
                  v-if="paramSummary(item.values)"
                  class="mt-0.5 truncate text-xs text-muted-foreground"
                >
                  {{ paramSummary(item.values) }}
                </p>
              </div>
              <span class="shrink-0 text-xs text-muted-foreground">{{ formatTime(item.ts) }}</span>
              <Badge
                class="shrink-0 border-transparent text-[11px]"
                :class="
                  item.status != null && item.status < 400
                    ? 'bg-success text-success-foreground'
                    : 'bg-destructive text-white'
                "
              >
                {{ item.status ?? '실패' }}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                class="shrink-0"
                @click.stop="callHistory.remove(item.id)"
              >
                삭제
              </Button>
            </li>
          </ul>
        </template>
      </DialogScrollContent>
    </Dialog>
  </main>
</template>

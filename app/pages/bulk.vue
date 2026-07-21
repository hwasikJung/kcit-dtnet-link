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
import { BULK_COLUMNS, flattenBldInfo } from '~/lib/bulk-columns'
import { parseBulkSheet } from '~/lib/bulk-parse'
import type { BulkHistoryMeta, BulkResultRecord, BulkRow } from '~/types/bulk'

const MAX_ROWS = 5000
const CONCURRENCY = 5

const { toast } = useToast()
const history = useBulkHistory()

const fileName = ref('')
const rows = ref<BulkRow[]>([])
const hadHeader = ref(false)
const running = ref(false)
const finished = ref(false)
const progress = ref({ done: 0, total: 0 })

const detailRow = ref<BulkRow | null>(null)
const detailOpen = ref(false)

const historyRecord = ref<BulkResultRecord | null>(null)
const historyOpen = ref(false)

onMounted(() => history.refresh())

const validCount = computed(() => rows.value.filter((r) => !r.invalid).length)
// 재시도 대상 = 조회 실패 행 (A열 빈값 등 입력 오류 행은 제외)
const retryCount = computed(
  () => rows.value.filter((r) => r.status === 'error' && r.invalid !== 'empty').length,
)
const summary = computed(() => ({
  success: rows.value.filter((r) => r.status === 'success').length,
  notfound: rows.value.filter((r) => r.status === 'notfound').length,
  error: rows.value.filter((r) => r.status === 'error').length,
}))

// 조회 중 새로고침·탭 닫기·페이지 이동으로 진행분이 유실되는 것을 방지
function onBeforeUnload(e: BeforeUnloadEvent) {
  if (!running.value) return
  e.preventDefault()
  e.returnValue = ''
}
onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))
onBeforeRouteLeave(() => {
  if (!running.value) return true
  return window.confirm('일괄 조회가 진행 중입니다. 페이지를 벗어나면 진행 중인 결과가 사라집니다.')
})

async function downloadSample() {
  const XLSX = await import('xlsx')
  const aoa = [['mgmBldPk'], ['11680-12777'], ['11680-12778']]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), '샘플')
  XLSX.writeFile(wb, '일괄조회_샘플.xlsx')
}

async function onFileChange(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  const XLSX = await import('xlsx')
  let aoa: unknown[][]
  try {
    const wb = XLSX.read(await file.arrayBuffer())
    const sheet = wb.Sheets[wb.SheetNames[0]!]
    aoa = sheet ? XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 }) : []
  } catch {
    toast('파일을 읽지 못했습니다. xlsx/csv 형식인지 확인해 주세요.', 'error')
    return
  }

  const parsed = parseBulkSheet(aoa)

  if (parsed.rows.length > MAX_ROWS) {
    toast(
      `행이 너무 많습니다. 1회 최대 ${MAX_ROWS.toLocaleString()}행까지 처리할 수 있어요.`,
      'error',
    )
    return
  }

  hadHeader.value = parsed.hadHeader
  rows.value = parsed.rows

  fileName.value = file.name
  finished.value = false
  progress.value = { done: 0, total: 0 }

  if (!rows.value.length) toast('엑셀에서 데이터 행을 찾지 못했습니다.', 'error')
}

async function executeLookups(pks: string[]) {
  running.value = true
  progress.value = { done: 0, total: pks.length }

  async function lookup(pk: string) {
    let status: BulkRow['status']
    let cols: Record<string, string> = {}
    let raw: unknown = null
    let errorMsg: string | undefined
    try {
      raw = await $fetch(
        useRuntimeConfig().public.apiBase +
          '/sqiapi/addr/mgm_bld_pk_info/' +
          encodeURIComponent(pk),
      )
      if (raw && typeof raw === 'object' && 'error' in raw) {
        status = 'notfound'
        errorMsg = '해당 PK로 건물 정보를 찾지 못했습니다.'
      } else {
        status = 'success'
        cols = flattenBldInfo(raw)
      }
    } catch (err) {
      status = 'error'
      const er = err as { data?: { message?: string } | null; message?: string }
      errorMsg = er?.data?.message ?? er?.message ?? '조회 중 오류가 발생했습니다.'
    }
    for (const row of rows.value) {
      if (row.pk === pk && row.invalid !== 'empty') {
        row.status = status
        row.cols = cols
        row.raw = raw
        row.errorMsg = errorMsg
      }
    }
    progress.value.done++
  }

  // 동시 CONCURRENCY건 워커 풀
  const queue = [...pks]
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      for (let pk = queue.shift(); pk != null; pk = queue.shift()) await lookup(pk)
    }),
  )

  running.value = false
  finished.value = true
}

// 마지막 조회의 이력 id — 재시도 시 같은 id로 덮어써 이력이 중복 생성되지 않게 한다
const lastRecordId = ref('')

async function saveRecord() {
  const record: BulkResultRecord = {
    id: lastRecordId.value,
    fileName: fileName.value,
    createdAt: Date.now(),
    total: rows.value.length,
    ...summary.value,
    rows: JSON.parse(JSON.stringify(rows.value)),
  }
  try {
    await history.save(record)
    toast('조회 결과를 이력에 저장했습니다.')
  } catch {
    toast('결과 이력 저장에 실패했습니다. (브라우저 저장소 확인)', 'error')
  }
}

async function run() {
  if (running.value || !rows.value.length) return
  finished.value = false
  const pks = [...new Set(rows.value.filter((r) => !r.invalid).map((r) => r.pk))]
  lastRecordId.value = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  await executeLookups(pks)
  await saveRecord()
}

async function retryFailed() {
  if (running.value) return
  const pks = [
    ...new Set(
      rows.value.filter((r) => r.status === 'error' && r.invalid !== 'empty').map((r) => r.pk),
    ),
  ]
  if (!pks.length) return
  await executeLookups(pks)
  await saveRecord()
}

async function download(target: BulkRow[], baseName: string) {
  const XLSX = await import('xlsx')
  const STATUS_LABEL = { pending: '대기', success: '성공', notfound: '미존재', error: '실패' }
  const aoa = [
    ['mgmBldPk', ...BULK_COLUMNS.map((c) => c.label), '상태'],
    ...target.map((r) => [
      r.pk,
      ...BULK_COLUMNS.map((c) => r.cols[c.key] ?? ''),
      STATUS_LABEL[r.status],
    ]),
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), '조회결과')
  XLSX.writeFile(wb, `${baseName.replace(/\.[^.]+$/, '')}_조회결과.xlsx`)
}

function openDetail(row: BulkRow) {
  detailRow.value = row
  detailOpen.value = true
}

async function openHistory(meta: BulkHistoryMeta) {
  const record = await history.get(meta.id)
  if (!record) {
    toast('이력을 불러오지 못했습니다.', 'error')
    return
  }
  historyRecord.value = record
  historyOpen.value = true
}

async function removeHistory(meta: BulkHistoryMeta) {
  await history.remove(meta.id)
  toast('이력을 삭제했습니다.')
}

function formatDate(ts: number) {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
</script>

<template>
  <main class="mx-auto w-full max-w-screen-2xl px-6 py-8">
    <h1 class="text-xl font-semibold tracking-tight">일괄 조회</h1>
    <p class="mt-1 text-sm text-muted-foreground">
      엑셀 A열에 건축물대장 PK(mgmBldPk)를 담아 업로드하면 건물 정보를 일괄 조회해 표로 보여줍니다.
      결과는 이 브라우저의 이력에 저장됩니다.
    </p>

    <!-- 업로드 -->
    <section class="mt-6 rounded-lg border p-4">
      <div class="flex flex-wrap items-center gap-3">
        <label
          for="bulk-file"
          class="inline-flex h-9 cursor-pointer items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          엑셀 파일 선택
        </label>
        <input
          id="bulk-file"
          type="file"
          accept=".xlsx,.xls,.csv"
          class="sr-only"
          aria-label="일괄 조회용 엑셀 파일"
          @change="onFileChange"
        />
        <Button variant="outline" @click="downloadSample">샘플 파일 받기</Button>
        <span v-if="fileName" class="text-sm">{{ fileName }}</span>
        <span class="text-xs text-muted-foreground">
          A열 = mgmBldPk · 1행 헤더 자동 감지 · 최대 {{ MAX_ROWS.toLocaleString() }}행
        </span>
      </div>

      <div v-if="rows.length" class="mt-4 flex flex-wrap items-center gap-3">
        <Button :disabled="running || !validCount" @click="run">
          <span
            v-if="running"
            class="mr-2 size-3.5 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground"
          />
          {{
            running
              ? `조회 중 ${progress.done} / ${progress.total}`
              : `일괄 조회 실행 (${validCount}건)`
          }}
        </Button>
        <Button v-if="finished && retryCount" variant="outline" @click="retryFailed">
          실패 {{ retryCount }}건 재시도
        </Button>
        <Button v-if="finished" variant="outline" @click="download(rows, fileName)">
          결과 엑셀 다운로드
        </Button>
        <span class="text-xs text-muted-foreground">
          총 {{ rows.length }}행<template v-if="hadHeader"> (헤더 1행 제외)</template>
          <template v-if="finished">
            · <span class="text-success">성공 {{ summary.success }}</span> · 미존재
            {{ summary.notfound }} · <span class="text-destructive">실패 {{ summary.error }}</span>
          </template>
        </span>
      </div>

      <!-- 진행률 바 -->
      <div
        v-if="running && progress.total"
        class="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div
          class="h-full rounded-full bg-primary transition-all"
          :style="{ width: `${Math.round((progress.done / progress.total) * 100)}%` }"
        />
      </div>
    </section>

    <!-- 결과 테이블 -->
    <section v-if="rows.length" class="mt-6">
      <h2 class="mb-3 text-sm font-medium text-muted-foreground">
        {{ finished ? '조회 결과 (행 클릭 시 상세)' : '업로드된 A열 목록' }}
      </h2>
      <BulkResultTable :rows="rows" @row-click="openDetail" />
    </section>

    <!-- 저장된 이력 -->
    <section class="mt-10">
      <h2 class="mb-3 text-sm font-medium text-muted-foreground">
        저장된 조회 이력 (클릭 시 결과 보기)
      </h2>
      <p
        v-if="!history.items.value.length"
        class="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground"
      >
        저장된 이력이 없습니다. 조회를 실행하면 자동으로 저장됩니다.
      </p>
      <ul v-else class="divide-y rounded-lg border">
        <li
          v-for="item in history.items.value"
          :key="item.id"
          tabindex="0"
          class="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-primary/5 focus-visible:bg-primary/5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
          @click="openHistory(item)"
          @keydown.enter.prevent="openHistory(item)"
          @keydown.space.prevent="openHistory(item)"
        >
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium">{{ item.fileName }}</p>
            <p class="mt-0.5 text-xs text-muted-foreground">
              {{ formatDate(item.createdAt) }} · 총 {{ item.total }}행
            </p>
          </div>
          <Badge class="border-transparent bg-success text-success-foreground text-[11px]"
            >성공 {{ item.success }}</Badge
          >
          <Badge variant="outline" class="text-[11px]">미존재 {{ item.notfound }}</Badge>
          <Badge class="border-transparent bg-destructive text-white text-[11px]"
            >실패 {{ item.error }}</Badge
          >
          <Button variant="ghost" size="sm" class="shrink-0" @click.stop="removeHistory(item)"
            >삭제</Button
          >
        </li>
      </ul>
    </section>

    <!-- 이력 결과 Modal -->
    <Dialog v-model:open="historyOpen">
      <DialogScrollContent class="max-w-6xl">
        <DialogHeader>
          <DialogTitle>{{ historyRecord?.fileName }}</DialogTitle>
          <DialogDescription>
            {{ historyRecord ? formatDate(historyRecord.createdAt) : '' }} · 총
            {{ historyRecord?.total }}행 · 성공 {{ historyRecord?.success }} · 미존재
            {{ historyRecord?.notfound }} · 실패 {{ historyRecord?.error }}
          </DialogDescription>
        </DialogHeader>
        <div class="flex justify-end">
          <Button
            v-if="historyRecord"
            variant="outline"
            size="sm"
            @click="download(historyRecord.rows, historyRecord.fileName)"
          >
            결과 엑셀 다운로드
          </Button>
        </div>
        <BulkResultTable v-if="historyRecord" :rows="historyRecord.rows" @row-click="openDetail" />
      </DialogScrollContent>
    </Dialog>

    <!-- 행 상세 Modal -->
    <BulkRowDetailDialog v-model:open="detailOpen" :row="detailRow" />
  </main>
</template>

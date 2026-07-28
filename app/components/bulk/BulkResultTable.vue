<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { BULK_COLUMNS } from '~/lib/bulk-columns'
import type { BulkRow } from '~/types/bulk'

const props = withDefaults(
  defineProps<{
    rows: BulkRow[]
    /** B열~ 표시 컬럼 — 기본은 대장 정보 조회 컬럼 */
    columns?: { key: string; label: string }[]
    /** A열 헤더 표기 — 기본 mgmBldPk */
    keyLabel?: string
    /** 상태 라벨 재정의 (예: 키 생성에서는 notfound=매칭 실패) */
    statusLabels?: Partial<Record<BulkRow['status'], string>>
  }>(),
  { columns: () => BULK_COLUMNS, keyLabel: 'mgmBldPk', statusLabels: () => ({}) },
)
const emit = defineEmits<{ rowClick: [row: BulkRow] }>()

const PAGE_SIZE = 100
const page = ref(1)

// 상태 필터 — 요약 칩 클릭 시 해당 상태 행만 표시(다시 클릭하면 해제)
const FILTERABLE = ['success', 'notfound', 'error', 'pending'] as const
const statusFilter = ref<BulkRow['status'] | 'all'>('all')
const statusCount = computed(() => {
  const count: Record<BulkRow['status'], number> = { pending: 0, success: 0, notfound: 0, error: 0 }
  for (const row of props.rows) count[row.status]++
  return count
})
const filtered = computed(() =>
  statusFilter.value === 'all'
    ? props.rows
    : props.rows.filter((r) => r.status === statusFilter.value),
)
function toggleFilter(s: BulkRow['status']) {
  statusFilter.value = statusFilter.value === s ? 'all' : s
  page.value = 1
}

const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / PAGE_SIZE)))
const paged = computed(() =>
  filtered.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE),
)

watch(
  () => props.rows,
  () => {
    page.value = 1
    statusFilter.value = 'all'
  },
)

const STATUS_LABEL = computed<Record<BulkRow['status'], string>>(() => ({
  pending: '대기',
  success: '성공',
  notfound: '미존재',
  error: '실패',
  ...props.statusLabels,
}))

const STATUS_CLASS: Record<BulkRow['status'], string> = {
  pending: 'bg-muted text-muted-foreground border-transparent',
  success: 'bg-success text-success-foreground border-transparent',
  notfound: 'bg-secondary text-secondary-foreground border',
  error: 'bg-destructive text-white border-transparent',
}
</script>

<template>
  <!-- min-w-0: Dialog(grid) 안에서 grid 자식의 min-width:auto가 테이블 내용폭만큼
       커져 Modal 밖으로 넘치는 것을 막고 overflow-x-auto가 동작하게 함 -->
  <div class="min-w-0">
    <!-- 상태 요약 칩 — 클릭 시 해당 상태만 필터, 다시 클릭하면 전체 -->
    <div class="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
      <button
        type="button"
        class="rounded-full border px-2.5 py-0.5 transition-colors"
        :class="
          statusFilter === 'all'
            ? 'border-transparent bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-primary/5'
        "
        @click="((statusFilter = 'all'), (page = 1))"
      >
        전체 {{ rows.length }}
      </button>
      <template v-for="s in FILTERABLE" :key="s">
        <button
          v-if="statusCount[s]"
          type="button"
          class="rounded-full border px-2.5 py-0.5 transition-colors"
          :class="
            statusFilter === s
              ? 'border-transparent bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-primary/5'
          "
          :aria-pressed="statusFilter === s"
          @click="toggleFilter(s)"
        >
          {{ STATUS_LABEL[s] }} {{ statusCount[s] }}
        </button>
      </template>
    </div>
    <div class="overflow-x-auto rounded-lg border">
      <table class="w-full min-w-max text-left text-sm">
        <thead>
          <tr class="border-b bg-muted/40 text-xs text-muted-foreground">
            <th class="px-3 py-2 font-medium">#</th>
            <th class="px-3 py-2 font-medium">상태</th>
            <th class="px-3 py-2 font-medium">{{ keyLabel }}</th>
            <th v-for="c in columns" :key="c.key" class="px-3 py-2 font-medium">
              {{ c.label }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in paged"
            :key="row.seq"
            tabindex="0"
            class="cursor-pointer border-b last:border-b-0 transition-colors hover:bg-primary/5 focus-visible:bg-primary/5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
            @click="emit('rowClick', row)"
            @keydown.enter.prevent="emit('rowClick', row)"
            @keydown.space.prevent="emit('rowClick', row)"
          >
            <td class="px-3 py-2 text-xs text-muted-foreground">{{ row.seq }}</td>
            <td class="px-3 py-2">
              <span class="flex items-center gap-1">
                <Badge :class="STATUS_CLASS[row.status]" class="text-[11px]">
                  {{ STATUS_LABEL[row.status] }}
                </Badge>
                <span v-if="row.invalid" class="text-[11px] text-muted-foreground">
                  {{ row.invalid === 'empty' ? '빈값' : '중복' }}
                </span>
              </span>
            </td>
            <td class="px-3 py-2 font-mono text-xs">{{ row.pk }}</td>
            <td
              v-for="c in columns"
              :key="c.key"
              class="max-w-[280px] truncate px-3 py-2 whitespace-nowrap"
              :title="row.cols[c.key]"
            >
              {{ row.cols[c.key] }}
            </td>
          </tr>
          <tr v-if="!paged.length">
            <td
              :colspan="3 + columns.length"
              class="px-3 py-6 text-center text-xs text-muted-foreground"
            >
              해당 상태의 행이 없습니다.
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="pageCount > 1" class="mt-3 flex items-center justify-end gap-2 text-sm">
      <Button variant="outline" size="sm" :disabled="page <= 1" @click="page--">이전</Button>
      <span class="text-xs text-muted-foreground">{{ page }} / {{ pageCount }}</span>
      <Button variant="outline" size="sm" :disabled="page >= pageCount" @click="page++"
        >다음</Button
      >
    </div>
  </div>
</template>

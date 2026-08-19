<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogScrollContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { aggregateBulkStats } from '~/lib/bulk-summary'
import type { BulkRow } from '~/types/bulk'

// 처리 결과 대시보드 — 상태 비율 스택 바 + 상태 카드 + 실패·미매칭 사유 분포 (라이브 결과·이력 Modal 공용)
const props = withDefaults(
  defineProps<{
    rows: BulkRow[]
    /** 상태 라벨 재정의 (예: 키 생성에서는 notfound=매칭 실패) */
    statusLabels?: Partial<Record<BulkRow['status'], string>>
    /** A열 헤더 표기 — 사유별 행 목록 Modal에 사용 */
    keyLabel?: string
  }>(),
  { statusLabels: () => ({}), keyLabel: '입력값' },
)
const emit = defineEmits<{ rowClick: [row: BulkRow] }>()

const stats = computed(() => aggregateBulkStats(props.rows))

const STATUS_LABEL = computed<Record<BulkRow['status'], string>>(() => ({
  pending: '대기',
  success: '성공',
  notfound: '미존재',
  error: '실패',
  ...props.statusLabels,
}))

/** 비율(%) — 소수 1자리, 총 행수 0이면 0 */
function pct(n: number) {
  return stats.value.total ? Math.round((n / stats.value.total) * 1000) / 10 : 0
}

const SEGMENTS: { key: BulkRow['status']; barClass: string; textClass: string }[] = [
  { key: 'success', barClass: 'bg-success', textClass: 'text-success' },
  { key: 'notfound', barClass: 'bg-muted-foreground/40', textClass: 'text-muted-foreground' },
  { key: 'error', barClass: 'bg-destructive', textClass: 'text-destructive' },
  { key: 'pending', barClass: 'bg-muted', textClass: 'text-muted-foreground' },
]
const visibleSegments = computed(() => SEGMENTS.filter((s) => stats.value.counts[s.key] > 0))

/** 사유 분포 상위 N건 — 나머지는 "기타"로 묶어 안내 */
const REASON_TOP = 5
const topReasons = computed(() => stats.value.reasons.slice(0, REASON_TOP))
const restReasons = computed(() => stats.value.reasons.slice(REASON_TOP))
const maxReasonCount = computed(() => topReasons.value[0]?.count ?? 0)

// 사유별 행 목록 Modal — 사유 클릭 시 해당 사유의 행만 모아 보여준다
const reasonOpen = ref(false)
const selectedReason = ref('')
const reasonRows = computed(() =>
  props.rows.filter(
    (r) =>
      (r.status === 'notfound' || r.status === 'error') && r.errorMsg === selectedReason.value,
  ),
)
function openReason(msg: string) {
  selectedReason.value = msg
  reasonOpen.value = true
}
function clickRow(row: BulkRow) {
  // 행 상세 Modal이 위에 겹치지 않게 목록 Modal은 닫고 상세로 넘긴다
  reasonOpen.value = false
  emit('rowClick', row)
}
</script>

<template>
  <div class="rounded-lg border p-4">
    <!-- 상태 카드 -->
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="rounded-md bg-muted/40 px-3 py-2">
        <p class="text-xs text-muted-foreground">총 행수</p>
        <p class="mt-0.5 text-lg font-semibold tabular-nums">
          {{ stats.total.toLocaleString() }}
        </p>
      </div>
      <div
        v-for="s in SEGMENTS.filter((seg) => seg.key !== 'pending' || stats.counts.pending)"
        :key="s.key"
        class="rounded-md bg-muted/40 px-3 py-2"
      >
        <p class="text-xs text-muted-foreground">{{ STATUS_LABEL[s.key] }}</p>
        <p class="mt-0.5 text-lg font-semibold tabular-nums" :class="s.textClass">
          {{ stats.counts[s.key].toLocaleString() }}
          <span class="text-xs font-normal text-muted-foreground"
            >({{ pct(stats.counts[s.key]) }}%)</span
          >
        </p>
      </div>
    </div>

    <!-- 상태 비율 스택 바 -->
    <div v-if="stats.total" class="mt-3">
      <div class="flex h-2.5 overflow-hidden rounded-full bg-muted">
        <div
          v-for="s in visibleSegments"
          :key="s.key"
          :class="s.barClass"
          :style="{ width: `${(stats.counts[s.key] / stats.total) * 100}%` }"
        />
      </div>
      <p class="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
        <span v-for="s in visibleSegments" :key="s.key" class="inline-flex items-center gap-1">
          <span class="size-2 rounded-full" :class="s.barClass" />
          {{ STATUS_LABEL[s.key] }} {{ pct(stats.counts[s.key]) }}%
        </span>
        <span v-if="stats.emptyCount"> · 입력 오류(빈값) {{ stats.emptyCount }}건</span>
        <span v-if="stats.dupCount"> · 중복 입력 {{ stats.dupCount }}건</span>
      </p>
    </div>

    <!-- 실패·미매칭 사유 분포 -->
    <div v-if="topReasons.length" class="mt-4 border-t pt-3">
      <p class="text-xs font-medium text-muted-foreground">
        실패·미매칭 사유 분포 (클릭 시 해당 행 목록)
      </p>
      <ul class="mt-2 space-y-1.5">
        <li v-for="r in topReasons" :key="r.msg">
          <button
            type="button"
            class="block w-full cursor-pointer rounded-md px-1.5 py-1 text-left text-xs transition-colors hover:bg-primary/5 focus-visible:bg-primary/5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
            @click="openReason(r.msg)"
          >
            <span class="flex items-baseline justify-between gap-3">
              <span class="min-w-0 truncate" :title="r.msg">{{ r.msg }}</span>
              <span class="shrink-0 tabular-nums text-muted-foreground">
                {{ r.count.toLocaleString() }}건 ({{ pct(r.count) }}%)
              </span>
            </span>
            <span class="mt-0.5 block h-1.5 overflow-hidden rounded-full bg-muted">
              <span
                class="block h-full rounded-full bg-destructive/70"
                :style="{ width: `${maxReasonCount ? (r.count / maxReasonCount) * 100 : 0}%` }"
              />
            </span>
          </button>
        </li>
      </ul>
      <p v-if="restReasons.length" class="mt-1.5 text-[11px] text-muted-foreground">
        기타 사유 {{ restReasons.length }}종
        {{ restReasons.reduce((sum, r) => sum + r.count, 0).toLocaleString() }}건
      </p>
    </div>

    <!-- 사유별 행 목록 Modal -->
    <Dialog v-model:open="reasonOpen">
      <DialogScrollContent class="max-w-3xl">
        <DialogHeader>
          <DialogTitle class="text-base">{{ selectedReason }}</DialogTitle>
          <DialogDescription>
            해당 사유의 행 {{ reasonRows.length.toLocaleString() }}건 (행 클릭 시 상세)
          </DialogDescription>
        </DialogHeader>
        <div class="min-w-0 overflow-x-auto rounded-lg border">
          <table class="w-full min-w-max text-left text-sm">
            <thead>
              <tr class="border-b bg-muted/40 text-xs text-muted-foreground">
                <th class="px-3 py-2 font-medium">#</th>
                <th class="px-3 py-2 font-medium">상태</th>
                <th class="px-3 py-2 font-medium">{{ keyLabel }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in reasonRows"
                :key="row.seq"
                tabindex="0"
                class="cursor-pointer border-b last:border-b-0 transition-colors hover:bg-primary/5 focus-visible:bg-primary/5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                @click="clickRow(row)"
                @keydown.enter.prevent="clickRow(row)"
                @keydown.space.prevent="clickRow(row)"
              >
                <td class="px-3 py-2 text-xs text-muted-foreground">{{ row.seq }}</td>
                <td class="px-3 py-2">
                  <Badge
                    class="text-[11px]"
                    :class="
                      row.status === 'error'
                        ? 'bg-destructive text-white border-transparent'
                        : 'bg-secondary text-secondary-foreground border'
                    "
                  >
                    {{ STATUS_LABEL[row.status] }}
                  </Badge>
                </td>
                <td class="px-3 py-2 font-mono text-xs break-all">{{ row.pk }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </DialogScrollContent>
    </Dialog>
  </div>
</template>

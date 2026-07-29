<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogScrollContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { BULK_COLUMNS } from '~/lib/bulk-columns'
import type { BulkRow } from '~/types/bulk'

const props = withDefaults(
  defineProps<{
    row: BulkRow | null
    /** 상세 표의 표시 컬럼 — 기본은 대장 정보 조회 컬럼 */
    columns?: { key: string; label: string }[]
    description?: string
    /** 상태 라벨 재정의 (예: 키 생성에서는 notfound=매칭 실패) */
    statusLabels?: Partial<Record<BulkRow['status'], string>>
  }>(),
  { columns: () => BULK_COLUMNS, description: '건물 정보 상세', statusLabels: () => ({}) },
)
const open = defineModel<boolean>('open', { required: true })

const STATUS_LABEL = computed<Record<BulkRow['status'], string>>(() => ({
  pending: '대기',
  success: '성공',
  notfound: '미존재',
  error: '실패',
  ...props.statusLabels,
}))
</script>

<template>
  <Dialog v-model:open="open">
    <DialogScrollContent class="max-w-3xl">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <span class="font-mono text-base">{{ row?.pk }}</span>
          <Badge
            v-if="row"
            :class="
              row.status === 'success'
                ? 'bg-success text-success-foreground border-transparent'
                : row.status === 'notfound'
                  ? 'bg-secondary text-secondary-foreground border'
                  : 'bg-destructive text-white border-transparent'
            "
            class="text-[11px]"
          >
            {{ STATUS_LABEL[row.status] }}
          </Badge>
        </DialogTitle>
        <DialogDescription>{{ description }}</DialogDescription>
      </DialogHeader>

      <template v-if="row">
        <!-- 처리 실패(status=error)의 원문 오류는 기술 문자열일 수 있어 접어서 제공.
             입력 오류(invalid)·미존재 안내는 우리가 만든 평이한 문구라 그대로 노출 -->
        <template v-if="row.errorMsg">
          <p v-if="row.status !== 'error' || row.invalid" class="text-sm text-destructive">
            {{ row.errorMsg }}
          </p>
          <div v-else>
            <p class="text-sm text-destructive">
              처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.
            </p>
            <details class="mt-1">
              <summary class="cursor-pointer text-xs text-muted-foreground select-none">
                오류 원문 보기
              </summary>
              <p class="mt-1 rounded-md bg-secondary px-3 py-2 font-mono text-xs break-all">
                {{ row.errorMsg }}
              </p>
            </details>
          </div>
        </template>

        <div v-if="row.status === 'success'" class="overflow-hidden rounded-lg border">
          <table class="w-full text-sm">
            <tbody>
              <tr v-for="c in columns" :key="c.key" class="border-b last:border-b-0">
                <th
                  class="w-36 bg-muted/40 px-3 py-2 text-left text-xs font-medium text-muted-foreground"
                >
                  {{ c.label }}
                </th>
                <td class="px-3 py-2 break-all">{{ row.cols[c.key] }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <details v-if="row.raw != null" class="rounded-lg border p-3" open>
          <summary class="cursor-pointer select-none text-sm font-medium">원본 JSON</summary>
          <div class="mt-2 max-h-[40vh] overflow-auto">
            <ClientOnly>
              <JsonViewer :data="row.raw" />
            </ClientOnly>
          </div>
        </details>
      </template>
    </DialogScrollContent>
  </Dialog>
</template>

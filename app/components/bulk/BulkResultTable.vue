<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { BULK_COLUMNS } from '~/lib/bulk-columns'
import type { BulkRow } from '~/types/bulk'

const props = defineProps<{ rows: BulkRow[] }>()
const emit = defineEmits<{ rowClick: [row: BulkRow] }>()

const PAGE_SIZE = 100
const page = ref(1)
const pageCount = computed(() => Math.max(1, Math.ceil(props.rows.length / PAGE_SIZE)))
const paged = computed(() => props.rows.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE))

watch(
  () => props.rows,
  () => {
    page.value = 1
  },
)

const STATUS_LABEL: Record<BulkRow['status'], string> = {
  pending: '대기',
  success: '성공',
  notfound: '미존재',
  error: '실패',
}

const STATUS_CLASS: Record<BulkRow['status'], string> = {
  pending: 'bg-muted text-muted-foreground border-transparent',
  success: 'bg-success text-success-foreground border-transparent',
  notfound: 'bg-secondary text-secondary-foreground border',
  error: 'bg-destructive text-white border-transparent',
}
</script>

<template>
  <div>
    <div class="overflow-x-auto rounded-lg border">
      <table class="w-full min-w-max text-left text-sm">
        <thead>
          <tr class="border-b bg-muted/40 text-xs text-muted-foreground">
            <th class="px-3 py-2 font-medium">#</th>
            <th class="px-3 py-2 font-medium">상태</th>
            <th class="px-3 py-2 font-medium">mgmBldPk</th>
            <th v-for="c in BULK_COLUMNS" :key="c.key" class="px-3 py-2 font-medium">
              {{ c.label }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in paged"
            :key="row.seq"
            class="cursor-pointer border-b last:border-b-0 transition-colors hover:bg-primary/5"
            @click="emit('rowClick', row)"
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
              v-for="c in BULK_COLUMNS"
              :key="c.key"
              class="max-w-[280px] truncate px-3 py-2 whitespace-nowrap"
              :title="row.cols[c.key]"
            >
              {{ row.cols[c.key] }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="pageCount > 1" class="mt-3 flex items-center justify-end gap-2 text-sm">
      <Button variant="outline" size="sm" :disabled="page <= 1" @click="page--">이전</Button>
      <span class="text-xs text-muted-foreground">{{ page }} / {{ pageCount }}</span>
      <Button variant="outline" size="sm" :disabled="page >= pageCount" @click="page++">다음</Button>
    </div>
  </div>
</template>

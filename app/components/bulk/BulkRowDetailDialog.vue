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

defineProps<{ row: BulkRow | null }>()
const open = defineModel<boolean>('open', { required: true })
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
            {{ row.status === 'success' ? '성공' : row.status === 'notfound' ? '미존재' : '실패' }}
          </Badge>
        </DialogTitle>
        <DialogDescription>건물 정보 상세</DialogDescription>
      </DialogHeader>

      <template v-if="row">
        <p v-if="row.errorMsg" class="text-sm text-destructive">{{ row.errorMsg }}</p>

        <div v-if="row.status === 'success'" class="overflow-hidden rounded-lg border">
          <table class="w-full text-sm">
            <tbody>
              <tr v-for="c in BULK_COLUMNS" :key="c.key" class="border-b last:border-b-0">
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

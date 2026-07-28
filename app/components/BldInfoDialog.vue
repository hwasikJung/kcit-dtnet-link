<script setup lang="ts">
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogScrollContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { BULK_COLUMNS, flattenBldInfo } from '~/lib/bulk-columns'

// 키 카드의 "대장 정보" — 전체 기능 페이지로 이동하지 않고 모달에서 mgm_bld_pk_info를 직접 호출해 보여준다.
// 표시 컬럼·포맷은 메뉴2와 동일하게 bulk-columns.ts 한 곳에서만 관리한다.
const open = defineModel<boolean>('open', { required: true })
const props = defineProps<{ pk: string }>()

const INFO_PATH = '/sqiapi/addr/mgm_bld_pk_info/{mgmbldpk}'

const loading = ref(false)
const raw = ref<unknown>(null)
const cols = ref<Record<string, string> | null>(null)
const notFound = ref(false)
const netError = ref('')
// 모달을 빠르게 다시 열었을 때 이전 호출 결과를 무시하는 실행 토큰
let runId = 0

watch([open, () => props.pk], async ([isOpen]) => {
  if (!isOpen || !props.pk) return
  loading.value = true
  raw.value = null
  cols.value = null
  notFound.value = false
  netError.value = ''
  const run = ++runId
  try {
    const data = await $fetch(
      useRuntimeConfig().public.apiBase +
        '/sqiapi/addr/mgm_bld_pk_info/' +
        encodeURIComponent(props.pk),
      { timeout: 10000 },
    )
    if (run !== runId) return
    raw.value = data
    if (data && typeof data === 'object' && 'error' in data) notFound.value = true
    else cols.value = flattenBldInfo(data)
  } catch {
    if (run !== runId) return
    netError.value = '서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.'
  } finally {
    if (run === runId) loading.value = false
  }
})
</script>

<template>
  <Dialog v-model:open="open">
    <DialogScrollContent class="max-w-lg">
      <DialogHeader>
        <DialogTitle>건축물대장 정보</DialogTitle>
        <DialogDescription class="font-mono break-all">{{ pk }}</DialogDescription>
      </DialogHeader>

      <p v-if="loading" class="flex items-center gap-2 py-2 text-sm text-muted-foreground">
        <span
          class="size-3.5 animate-spin rounded-full border-2 border-primary/30 border-t-primary"
        />
        불러오는 중…
      </p>
      <p v-else-if="netError" class="py-2 text-sm text-destructive">{{ netError }}</p>
      <p v-else-if="notFound" class="py-2 text-sm text-muted-foreground">
        해당 PK로 건물 정보를 찾지 못했습니다.
      </p>
      <dl v-else-if="cols" class="grid grid-cols-[6.5rem_1fr] gap-y-0 text-sm">
        <template v-for="c in BULK_COLUMNS" :key="c.key">
          <dt class="border-b py-2 text-muted-foreground last:border-b-0">{{ c.label }}</dt>
          <dd class="border-b py-2 break-all last:border-b-0">{{ cols[c.key] || '—' }}</dd>
        </template>
      </dl>

      <ApiUsageNote :paths="[INFO_PATH]" />

      <details v-if="raw != null">
        <summary class="cursor-pointer text-xs text-muted-foreground select-none">
          원본 응답(JSON) 보기 — 검증용
        </summary>
        <div class="mt-2 overflow-x-auto rounded-lg border bg-card p-3">
          <JsonViewer :data="raw" />
        </div>
      </details>
    </DialogScrollContent>
  </Dialog>
</template>

<script setup lang="ts">
import { Input } from '@/components/ui/input'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import type { ApiEndpoint } from '~/types/api'

const props = defineProps<{
  endpoints: ApiEndpoint[]
  tagOrder: string[]
  selected: ApiEndpoint | null
}>()

const emit = defineEmits<{ select: [endpoint: ApiEndpoint] }>()

const search = ref('')

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return props.endpoints
  return props.endpoints.filter(
    (e) =>
      e.summary.toLowerCase().includes(q) ||
      e.path.toLowerCase().includes(q) ||
      e.tag.toLowerCase().includes(q),
  )
})

const groups = computed(() => {
  const map = new Map<string, ApiEndpoint[]>()
  for (const tag of props.tagOrder) map.set(tag, [])
  for (const e of filtered.value) {
    if (!map.has(e.tag)) map.set(e.tag, [])
    map.get(e.tag)!.push(e)
  }
  return [...map.entries()].filter(([, list]) => list.length > 0)
})

// 검색 중에는 매칭된 그룹을 전부 펼친다
const openTags = ref<string[]>([props.tagOrder[0] ?? ''])
watch(search, (q) => {
  if (q.trim()) openTags.value = groups.value.map(([tag]) => tag)
})

function keyOf(e: ApiEndpoint) {
  return `${e.method} ${e.path}`
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="p-3">
      <Input v-model="search" aria-label="API 검색" placeholder="API 검색 (예: 정제, 좌표, 건물)" />
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
      <p v-if="groups.length === 0" class="px-1 py-6 text-center text-sm text-muted-foreground">
        검색 결과가 없습니다.
      </p>

      <Accordion v-model="openTags" type="multiple" class="w-full">
        <AccordionItem v-for="[tag, list] in groups" :key="tag" :value="tag" class="border-b-0">
          <AccordionTrigger class="rounded-md px-2 py-2 text-sm font-medium hover:no-underline">
            <span class="flex items-center gap-2">
              {{ tag }}
              <span class="text-xs font-normal text-muted-foreground">{{ list.length }}</span>
            </span>
          </AccordionTrigger>
          <AccordionContent class="pb-1">
            <button
              v-for="e in list"
              :key="keyOf(e)"
              type="button"
              class="flex w-full flex-col gap-1 rounded-md px-2 py-2 text-left transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              :class="selected && keyOf(selected) === keyOf(e) ? 'bg-secondary' : ''"
              @click="emit('select', e)"
            >
              <span class="flex items-center gap-1.5">
                <span class="text-sm leading-snug">{{ e.summary }}</span>
                <StatusFlagBadge v-if="e.statusFlag" :flag="e.statusFlag" />
              </span>
              <span class="flex items-center gap-1.5">
                <MethodBadge :method="e.method" />
                <span class="truncate font-mono text-[11px] text-muted-foreground">{{
                  e.path
                }}</span>
              </span>
            </button>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  </div>
</template>

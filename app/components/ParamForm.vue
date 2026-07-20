<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { ApiEndpoint } from '~/types/api'

const props = defineProps<{ endpoint: ApiEndpoint; loading: boolean }>()

const emit = defineEmits<{ run: [values: Record<string, string | boolean>, file: File | null] }>()

const values = reactive<Record<string, string | boolean>>({})
const file = ref<File | null>(null)

const isMultipart = computed(() =>
  (props.endpoint.body ?? []).some((b) => b.contentType.includes('multipart')),
)

watch(
  () => props.endpoint,
  (e) => {
    for (const k of Object.keys(values)) delete values[k]
    for (const p of e.params) values[p.name] = p.type === 'boolean' ? false : ''
    file.value = null
  },
  { immediate: true },
)

const placeholderOf = (name: string) =>
  name === 'input_addr' ? '예: 서울특별시 강남구 테헤란로 152' : ''

const canRun = computed(() => {
  if (props.loading) return false
  for (const p of props.endpoint.params) {
    if (p.required && p.type !== 'boolean' && !String(values[p.name] ?? '').trim()) return false
  }
  if (isMultipart.value && !file.value) return false
  return true
})

function onFileChange(ev: Event) {
  file.value = (ev.target as HTMLInputElement).files?.[0] ?? null
}
</script>

<template>
  <div class="space-y-4 p-4">
    <div>
      <h2 class="flex items-center gap-2 text-sm font-semibold">
        {{ endpoint.summary }}
        <StatusFlagBadge v-if="endpoint.statusFlag" :flag="endpoint.statusFlag" />
      </h2>
      <p class="mt-1 flex items-center gap-1.5">
        <MethodBadge :method="endpoint.method" />
        <span class="font-mono text-[11px] text-muted-foreground">{{ endpoint.path }}</span>
      </p>
    </div>

    <div class="space-y-3">
      <div v-for="p in endpoint.params" :key="p.name">
        <label class="mb-1.5 block text-xs font-medium text-foreground">
          {{ p.name }}
          <span v-if="p.required" class="text-red-500">*</span>
          <span v-if="p.description" class="ml-1 font-normal text-muted-foreground">
            — {{ p.description }}
          </span>
        </label>

        <label v-if="p.type === 'boolean'" class="flex items-center gap-2 text-sm">
          <input v-model="values[p.name]" type="checkbox" class="size-4 accent-primary" />
          <span class="text-muted-foreground">사용</span>
        </label>
        <Input
          v-else
          v-model="values[p.name] as string"
          :placeholder="placeholderOf(p.name)"
          @keyup.enter="canRun && emit('run', { ...values }, file)"
        />
      </div>

      <div v-if="isMultipart">
        <label for="tta-csv-file" class="mb-1.5 block text-xs font-medium">
          CSV 파일 <span class="text-red-500">*</span>
          <span class="ml-1 font-normal text-muted-foreground">
            — EUC-KR 인코딩, 컬럼: place_code, place_name, input_addr
          </span>
        </label>
        <input
          id="tta-csv-file"
          type="file"
          accept=".csv"
          class="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium"
          @change="onFileChange"
        />
      </div>

      <p v-if="endpoint.params.length === 0 && !isMultipart" class="text-sm text-muted-foreground">
        입력할 파라미터가 없습니다. 바로 실행하세요.
      </p>
    </div>

    <Button class="w-full" :disabled="!canRun" @click="emit('run', { ...values }, file)">
      {{ loading ? '호출 중…' : '실행' }}
    </Button>
  </div>
</template>

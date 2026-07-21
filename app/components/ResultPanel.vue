<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export interface RunResult {
  status: number | null
  elapsedMs: number
  data: unknown
  errorMsg: string
  url: string
}

const props = defineProps<{ result: RunResult | null; loading: boolean }>()

const { toast } = useToast()

async function copyJson() {
  if (props.result?.data == null) return
  try {
    await navigator.clipboard.writeText(JSON.stringify(props.result.data, null, 2))
    toast('응답 JSON을 클립보드에 복사했습니다.')
  } catch {
    toast('복사에 실패했습니다. 브라우저 권한을 확인해 주세요.', 'error')
  }
}

const isOk = computed(() => props.result?.status != null && props.result.status < 400)
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- 초기 / 로딩 상태 -->
    <div
      v-if="loading"
      class="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground"
    >
      <span
        class="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary"
      />
      <p class="text-sm">호출 중입니다…</p>
    </div>

    <div
      v-else-if="!result"
      class="flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground"
    >
      <p class="text-3xl">🧭</p>
      <p class="text-sm leading-relaxed">
        좌측에서 기능을 선택하고 <span class="font-medium text-foreground">실행</span>을 누르면<br />
        결과(JSON)가 여기에 표시됩니다.
      </p>
    </div>

    <template v-else>
      <div class="flex items-center gap-2 border-b px-4 py-3">
        <Badge
          :class="
            isOk
              ? 'bg-success text-success-foreground border-transparent'
              : 'bg-destructive text-white border-transparent'
          "
        >
          {{ result.status ?? '실패' }}
        </Badge>
        <span class="text-xs text-muted-foreground">{{ result.elapsedMs }}ms</span>
        <span class="ml-1 truncate font-mono text-[11px] text-muted-foreground">
          {{ result.url }}
        </span>
        <Button
          variant="outline"
          size="sm"
          class="ml-auto shrink-0"
          :disabled="result.data == null"
          @click="copyJson"
        >
          복사
        </Button>
      </div>

      <div class="min-h-0 flex-1 overflow-auto p-4">
        <p v-if="result.errorMsg" class="mb-3 text-sm text-destructive">
          요청에 실패했어요. 입력값을 다시 확인해 주세요.
        </p>
        <details v-if="result.errorMsg" class="mb-3 text-xs text-muted-foreground">
          <summary class="cursor-pointer select-none">오류 원문 보기</summary>
          <pre class="mt-2 overflow-auto rounded-md bg-muted/50 p-3">{{ result.errorMsg }}</pre>
        </details>

        <ClientOnly>
          <JsonViewer v-if="result.data != null" :data="result.data" />
        </ClientOnly>
        <p v-if="result.data == null && !result.errorMsg" class="text-sm text-muted-foreground">
          응답 본문이 없습니다.
        </p>
      </div>
    </template>
  </div>
</template>

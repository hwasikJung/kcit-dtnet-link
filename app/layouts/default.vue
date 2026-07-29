<script setup lang="ts">
// 연계 서버 연결 상태 점 — 진입 시 확인 후 60초 주기 재확인, 점 클릭으로 즉시 재확인
const server = useServerStatus()
let timer: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  server.check()
  timer = setInterval(() => server.check(), 60_000)
})
onBeforeUnmount(() => clearInterval(timer))

/** 점 옆에 항상 함께 표시하는 짧은 라벨 */
const statusLabel = computed(
  () =>
    ({
      checking: '서버 확인 중',
      online: '서버 정상',
      offline: '서버 연결 오류',
    })[server.status.value],
)

const statusText = computed(
  () =>
    ({
      checking: '연계 서버 확인 중',
      online: '연계 서버 정상',
      offline: '연계 서버에 연결할 수 없습니다',
    })[server.status.value],
)

function checkedAt(): string {
  const ts = server.lastChecked.value
  if (!ts) return ''
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return ` (${pad(d.getHours())}:${pad(d.getMinutes())} 확인)`
}
</script>

<template>
  <div class="flex min-h-screen flex-col bg-background">
    <header class="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div
        class="mx-auto flex h-14 w-full max-w-screen-2xl items-center gap-4 px-4 sm:gap-8 sm:px-6"
      >
        <NuxtLink
          to="/"
          class="flex shrink-0 items-center gap-2.5 font-semibold whitespace-nowrap tracking-tight"
        >
          <span class="inline-block size-2.5 rounded-full bg-primary" />
          표준연계키 생성 모듈(S/W)
        </NuxtLink>
        <!-- 좁은 화면에서는 메뉴가 잘리지 않도록 가로 스크롤 -->
        <nav class="flex min-w-0 items-center gap-1 overflow-x-auto text-sm">
          <NuxtLink
            to="/"
            class="whitespace-nowrap rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
            exact-active-class="bg-secondary !text-foreground font-medium"
          >
            표준연계키 생성
          </NuxtLink>
          <NuxtLink
            to="/bulk"
            class="whitespace-nowrap rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
            exact-active-class="bg-secondary !text-foreground font-medium"
          >
            표준연계키 일괄처리
          </NuxtLink>
          <NuxtLink
            to="/tools"
            class="whitespace-nowrap rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
            exact-active-class="bg-secondary !text-foreground font-medium"
          >
            전체 기능
          </NuxtLink>
        </nav>
        <!-- 연계 서버 상태 — 점 + 라벨 상시 표시, 클릭 시 즉시 재확인 -->
        <button
          type="button"
          class="ml-auto flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors hover:bg-primary/5"
          :class="server.status.value === 'offline' ? 'text-destructive' : 'text-muted-foreground'"
          :title="statusText + checkedAt() + ' — 클릭하면 다시 확인합니다'"
          :aria-label="statusText"
          @click="server.check()"
        >
          <span
            class="inline-block size-2 rounded-full"
            :class="{
              'animate-pulse bg-muted-foreground/40': server.status.value === 'checking',
              'bg-success': server.status.value === 'online',
              'bg-destructive': server.status.value === 'offline',
            }"
          />
          <!-- aria-live: online↔offline 전환이 스크린리더에도 자동 안내되도록 -->
          <span class="whitespace-nowrap" aria-live="polite">{{ statusLabel }}</span>
        </button>
      </div>
    </header>
    <div class="flex-1">
      <slot />
    </div>
    <AppToaster />
  </div>
</template>

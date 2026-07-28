<script setup lang="ts">
// 연계 서버 연결 상태 점 — 진입 시 확인 후 60초 주기 재확인, 점 클릭으로 즉시 재확인
const server = useServerStatus()
let timer: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  server.check()
  timer = setInterval(() => server.check(), 60_000)
})
onBeforeUnmount(() => clearInterval(timer))

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
        <!-- 연계 서버 상태 — 클릭 시 즉시 재확인. 장애일 때만 텍스트도 노출 -->
        <button
          type="button"
          class="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground"
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
          <span v-if="server.status.value === 'offline'" class="whitespace-nowrap text-destructive">
            서버 연결 오류
          </span>
        </button>
      </div>
    </header>
    <div class="flex-1">
      <slot />
    </div>
    <AppToaster />
  </div>
</template>

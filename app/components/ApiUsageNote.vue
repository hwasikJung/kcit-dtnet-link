<script setup lang="ts">
// 화면 곳곳에서 "이 동작에 실제 호출되는 기능"을 작게 표기하는 공통 컴포넌트.
// 경로를 클릭하면 전체 기능(/tools) 페이지에 해당 기능이 프리필된 상태로 이동한다.
const props = defineProps<{
  /** 표시할 기능 경로 목록 (예: /sqiapi/addr/building_match_clean_union) */
  paths: string[]
  /** 앞에 붙는 라벨 — 기본 "이용 API" */
  label?: string
}>()

const { endpoints } = useApiSpec()

const items = computed(() =>
  props.paths.map((p) => ({
    path: p,
    // /sqiapi/addr/ 접두와 path 파라미터({mgmbldpk} 등)를 떼고 짧은 이름만 표기
    short: p.replace(/^\/sqiapi\/addr\//, '').replace(/\/\{[^}]*\}.*$/, ''),
    summary: endpoints.find((e) => e.path === p)?.summary ?? '',
  })),
)
</script>

<template>
  <p class="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground">
    <span>{{ label ?? '이용 API' }}:</span>
    <template v-for="(it, i) in items" :key="it.path">
      <span v-if="i > 0" aria-hidden="true">·</span>
      <NuxtLink
        :to="{ path: '/tools', query: { path: it.path } }"
        class="font-mono underline-offset-2 hover:underline"
        :title="it.summary"
      >
        {{ it.short }}
      </NuxtLink>
    </template>
  </p>
</template>

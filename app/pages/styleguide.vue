<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const { toast } = useToast()

const colors = [
  { name: 'primary', cls: 'bg-primary text-primary-foreground' },
  { name: 'secondary', cls: 'bg-secondary text-secondary-foreground' },
  { name: 'muted', cls: 'bg-muted text-muted-foreground' },
  { name: 'success', cls: 'bg-success text-success-foreground' },
  { name: 'destructive', cls: 'bg-destructive text-white' },
  { name: 'border', cls: 'bg-border text-foreground' },
]
</script>

<template>
  <main class="mx-auto max-w-3xl space-y-10 px-6 py-10">
    <div>
      <h1 class="text-xl font-semibold tracking-tight">스타일가이드</h1>
      <p class="mt-1 text-sm text-muted-foreground">
        디자인 토큰(T1.1)과 공통 상태 UI(T1.4) 시연 페이지 — 내부 확인용.
      </p>
    </div>

    <!-- 컬러 토큰 -->
    <section>
      <h2 class="mb-3 text-sm font-semibold">컬러 토큰</h2>
      <div class="grid grid-cols-3 gap-2 sm:grid-cols-6">
        <div v-for="c in colors" :key="c.name" class="space-y-1 text-center">
          <div class="flex h-14 items-center justify-center rounded-lg border text-xs" :class="c.cls">
            Aa
          </div>
          <p class="text-[11px] text-muted-foreground">{{ c.name }}</p>
        </div>
      </div>
    </section>

    <!-- 타이포 -->
    <section>
      <h2 class="mb-3 text-sm font-semibold">타이포그래피</h2>
      <div class="space-y-2 rounded-lg border p-4">
        <p class="text-xl font-semibold tracking-tight">제목 xl / semibold — 주소 API 테스트 콘솔</p>
        <p class="text-sm font-medium">본문 sm / medium — API 요청 파라미터를 입력하세요.</p>
        <p class="text-sm text-muted-foreground">보조 sm / muted — 선택 항목은 비워 둘 수 있습니다.</p>
        <p class="font-mono text-[11px] text-muted-foreground">mono 11px — /sqiapi/addr/addr_clean</p>
      </div>
    </section>

    <!-- 배지 -->
    <section>
      <h2 class="mb-3 text-sm font-semibold">배지 (메서드 · 스펙 상태 · HTTP 상태)</h2>
      <div class="flex flex-wrap items-center gap-2 rounded-lg border p-4">
        <MethodBadge method="GET" />
        <MethodBadge method="POST" />
        <StatusFlagBadge flag="modify-planned" />
        <StatusFlagBadge flag="delete-planned" />
        <Badge class="border-transparent bg-success text-success-foreground">200</Badge>
        <Badge class="border-transparent bg-destructive text-white">404</Badge>
      </div>
      <p class="mt-2 text-xs text-muted-foreground">
        수정예정=회색 · 삭제예정=적색 · 성공=녹색 · 실패=적색. 스펙 상태 배지에 마우스를 올리면
        tooltip이 표시됩니다.
      </p>
    </section>

    <!-- 로딩 / 토스트 -->
    <section>
      <h2 class="mb-3 text-sm font-semibold">로딩 · 토스트</h2>
      <div class="flex flex-wrap items-center gap-4 rounded-lg border p-4">
        <span
          class="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary"
        />
        <Button variant="outline" size="sm" @click="toast('성공 토스트입니다.')">성공 토스트</Button>
        <Button variant="outline" size="sm" @click="toast('오류 토스트입니다.', 'error')">
          오류 토스트
        </Button>
      </div>
    </section>

    <!-- 빈 / 오류 상태 -->
    <section>
      <h2 class="mb-3 text-sm font-semibold">빈 상태 · 오류 상태</h2>
      <div class="grid gap-2 sm:grid-cols-2">
        <div class="rounded-lg border p-6 text-center text-muted-foreground">
          <p class="text-2xl">🧭</p>
          <p class="mt-2 text-sm">좌측에서 API를 선택하면 결과가 표시됩니다.</p>
        </div>
        <div class="rounded-lg border p-6">
          <p class="text-sm text-destructive">요청에 실패했어요. 입력값을 다시 확인해 주세요.</p>
          <details class="mt-2 text-xs text-muted-foreground">
            <summary class="cursor-pointer select-none">오류 원문 보기</summary>
            <pre class="mt-2 rounded-md bg-muted/50 p-3">HTTP 500 Internal Server Error</pre>
          </details>
        </div>
      </div>
    </section>

    <!-- 입력 -->
    <section>
      <h2 class="mb-3 text-sm font-semibold">입력</h2>
      <div class="max-w-sm rounded-lg border p-4">
        <Input placeholder="예: 서울특별시 강남구 테헤란로 152" />
      </div>
    </section>
  </main>
</template>

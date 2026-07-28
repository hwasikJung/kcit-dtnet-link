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
      </div>
    </header>
    <div class="flex-1">
      <slot />
    </div>
    <AppToaster />
  </div>
</template>

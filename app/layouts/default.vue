<template>
  <div class="flex min-h-screen flex-col bg-background">
    <header class="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div class="mx-auto flex h-14 w-full max-w-screen-2xl items-center gap-8 px-6">
        <NuxtLink to="/" class="flex items-center gap-2.5 font-semibold tracking-tight">
          <span class="inline-block size-2.5 rounded-full bg-primary" />
          SQISoft Address API
        </NuxtLink>
        <nav class="flex items-center gap-1 text-sm">
          <NuxtLink
            to="/"
            class="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
            exact-active-class="bg-secondary !text-foreground font-medium"
          >
            단건 조회
          </NuxtLink>
          <NuxtLink
            to="/bulk"
            class="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
            exact-active-class="bg-secondary !text-foreground font-medium"
          >
            일괄 조회
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

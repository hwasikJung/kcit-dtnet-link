<script setup lang="ts">
const { toasts } = useToast()
</script>

<template>
  <div
    aria-live="polite"
    class="pointer-events-none fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2"
  >
    <TransitionGroup
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="translate-y-2 opacity-0"
      leave-active-class="transition duration-150 ease-in"
      leave-to-class="opacity-0"
    >
      <div
        v-for="t in toasts"
        :key="t.id"
        class="rounded-lg border px-4 py-2 text-sm shadow-md"
        :class="
          t.type === 'error'
            ? 'border-destructive/30 bg-destructive text-white'
            : 'border-border bg-foreground text-background'
        "
      >
        {{ t.message }}
      </div>
    </TransitionGroup>
  </div>
</template>

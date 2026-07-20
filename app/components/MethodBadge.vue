<script setup lang="ts">
const props = defineProps<{ method: string }>()

const cls = computed(() =>
  props.method === 'POST'
    ? 'bg-amber-50 text-amber-700 border-amber-200'
    : 'bg-emerald-50 text-emerald-700 border-emerald-200',
)
</script>

<template>
  <span
    class="inline-flex shrink-0 items-center rounded border px-1.5 py-0 font-mono text-[10px] font-semibold"
    :class="cls"
  >
    {{ method }}
  </span>
</template>

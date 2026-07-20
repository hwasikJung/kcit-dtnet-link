<script setup lang="ts">
import VueJsonPretty from 'vue-json-pretty'
import 'vue-json-pretty/lib/styles.css'

defineProps<{ data: unknown }>()
</script>

<template>
  <VueJsonPretty
    :data="data as any"
    :deep="4"
    :show-length="true"
    :show-line="false"
    class="text-sm"
  />
</template>

<style scoped>
/* 기본 호버색(#e6f7ff)이 베이지 배경에서 안 보여 브랜드 오렌지 틴트로 교체 */
:deep(.vjs-tree-node:hover) {
  background-color: rgb(217 115 13 / 0.15);
}
/* 기본 문자열 색이 연해 베이지/화이트 배경에서 가독성이 낮아 진한 에메랄드로 교체 */
:deep(.vjs-value-string) {
  color: #047857;
}
</style>

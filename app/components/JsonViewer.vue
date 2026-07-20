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

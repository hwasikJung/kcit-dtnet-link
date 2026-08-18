<script setup lang="ts">
// 표준연계키 접두(R_/T_/S_) 안내 — 문구는 std-link-key.ts 상수에서만 관리한다
import { STD_KEY_KIND_NOTES, STD_KEY_NOTE_DISCLAIMER } from '~/lib/std-link-key'
</script>

<template>
  <!-- break-keep: 한국어 단어 중간 줄바꿈("공\n식") 방지 -->
  <div class="space-y-2 text-xs break-keep">
    <div v-for="n in STD_KEY_KIND_NOTES" :key="n.prefix">
      <p>
        <span class="font-mono font-semibold">{{ n.prefix }}</span>
        <span class="ml-1.5 font-mono opacity-70">예: {{ n.example }}</span>
      </p>
      <p class="mt-0.5">{{ n.desc }}</p>
    </div>
    <p class="opacity-70">{{ STD_KEY_NOTE_DISCLAIMER }}</p>
  </div>
</template>

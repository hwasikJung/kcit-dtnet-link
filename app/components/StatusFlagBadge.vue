<script setup lang="ts">
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

const props = defineProps<{ flag: 'modify-planned' | 'delete-planned' }>()

const label = computed(() => (props.flag === 'modify-planned' ? '수정예정' : '삭제예정'))
const cls = computed(() =>
  props.flag === 'modify-planned'
    ? 'bg-secondary text-muted-foreground border-transparent'
    : 'bg-red-50 text-red-700 border-red-200',
)
</script>

<template>
  <TooltipProvider :delay-duration="200">
    <Tooltip>
      <TooltipTrigger as-child>
        <span
          class="inline-flex shrink-0 items-center rounded border px-1.5 py-0 text-[10px] font-medium"
          :class="cls"
        >
          {{ label }}
        </span>
      </TooltipTrigger>
      <TooltipContent>향후 변경/폐기 예정 기능입니다.</TooltipContent>
    </Tooltip>
  </TooltipProvider>
</template>

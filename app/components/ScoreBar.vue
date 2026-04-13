<!-- app/components/ScoreBar.vue -->
<template>
  <div class="flex items-center gap-2.5">
    <div class="w-28 h-2 score-bar-track">
      <div
        class="score-bar-fill"
        :style="{ width: score + '%', background: barGradient }"
      />
    </div>
    <span class="text-sm font-semibold tabular-nums" :class="textColor">
      {{ score }}<span class="text-xs font-normal opacity-60">分</span>
    </span>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ score: number }>()

const barGradient = computed(() => {
  if (props.score >= 80) return 'linear-gradient(90deg, #22c55e, #16a34a)'
  if (props.score >= 50) return 'linear-gradient(90deg, #facc15, #d97706)'
  return 'linear-gradient(90deg, #f87171, #dc2626)'
})

const textColor = computed(() => {
  if (props.score >= 80) return 'text-green-600'
  if (props.score >= 50) return 'text-amber-600'
  return 'text-red-500'
})
</script>

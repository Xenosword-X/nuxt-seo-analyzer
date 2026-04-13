<!-- app/components/ScoreBar.vue -->
<template>
  <div class="flex items-center gap-2">
    <div class="w-24 bg-gray-200 rounded-full h-2 overflow-hidden">
      <div
        class="h-2 rounded-full transition-all"
        :class="scoreColor"
        :style="{ width: score + '%' }"
      />
    </div>
    <span class="text-sm font-medium" :class="scoreTextColor">
      {{ score }}分
    </span>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ score: number }>()

const scoreColor = computed(() => {
  if (props.score >= 80) return 'bg-green-500'
  if (props.score >= 50) return 'bg-yellow-500'
  return 'bg-red-500'
})

const scoreTextColor = computed(() => {
  if (props.score >= 80) return 'text-green-600'
  if (props.score >= 50) return 'text-yellow-600'
  return 'text-red-500'
})
</script>

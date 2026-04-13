<!-- app/components/CWVItem.vue -->
<template>
  <div class="bg-gray-50 rounded-lg p-3">
    <p class="text-xs text-gray-500 mb-1">{{ label }}</p>
    <p class="font-semibold" :class="warn ? 'text-red-500' : 'text-gray-800'">{{ value }}</p>
  </div>
</template>

<script setup lang="ts">
defineProps<{ label: string; value: string; warn?: boolean }>()
</script>
